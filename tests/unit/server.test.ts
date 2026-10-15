import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-ignore — modules JavaScript du serveur
import { createApp } from "../../server/app.mjs";
// @ts-ignore
import { PLANS, checkExport, planOf, dayKey } from "../../server/plans.mjs";
// @ts-ignore
import { signWebhook, verifyWebhook, planFromSubscription, formEncode } from "../../server/stripe.mjs";
// @ts-ignore
import { hashPassword, verifyPassword } from "../../server/auth.mjs";

// ---------- règles pures ----------

test("offre gratuite : 3 vidéos par jour, 30 secondes maximum", () => {
  assert.deepEqual(checkExport(PLANS.free, 0, 29.9), { ok: true, remaining: 2 });
  assert.equal(checkExport(PLANS.free, 2, 10).ok, true);
  assert.deepEqual(checkExport(PLANS.free, 3, 10), { ok: false, reason: "DAILY_LIMIT", limit: 3 });
  assert.deepEqual(checkExport(PLANS.free, 0, 31), { ok: false, reason: "TOO_LONG", limit: 30 });
  assert.equal(checkExport(PLANS.free, 0, 30.4).ok, true); // marge d'arrondi
  assert.equal(checkExport(PLANS.free, 0, 0).ok, false);
});

test("offres payantes : illimitées ; pub seulement à 5 €", () => {
  assert.equal(checkExport(PLANS.plus, 500, 3600).ok, true);
  assert.equal(checkExport(PLANS.pro, 500, 3600).ok, true);
  assert.equal(PLANS.plus.priceEur, 5);
  assert.equal(PLANS.plus.ads, true);
  assert.equal(PLANS.pro.priceEur, 10);
  assert.equal(PLANS.pro.ads, false);
  assert.equal(PLANS.free.ads, true);
});

test("un abonnement expiré redevient gratuit", () => {
  assert.equal(planOf({ plan: "pro", plan_until: 1000 }, 2000).id, "free");
  assert.equal(planOf({ plan: "pro", plan_until: 3000 }, 2000).id, "pro");
  assert.equal(planOf({ plan: "plus", plan_until: null }, 2000).id, "plus");
  assert.equal(planOf(null).id, "free");
});

test("le quota repart à minuit, heure de Berlin", () => {
  // 22:30 UTC le 14 = 00:30 le 15 à Berlin (heure d'été).
  assert.equal(dayKey(Date.UTC(2026, 9, 14, 22, 30), "Europe/Berlin"), "2026-10-15");
  assert.equal(dayKey(Date.UTC(2026, 9, 14, 21, 30), "Europe/Berlin"), "2026-10-14");
});

test("mots de passe : empreinte scrypt vérifiable", () => {
  const h = hashPassword("motdepasse123");
  assert.ok(h.startsWith("scrypt$"));
  assert.equal(verifyPassword("motdepasse123", h), true);
  assert.equal(verifyPassword("mauvais", h), false);
});

test("webhook Stripe : signature vérifiée, ancienne ou fausse refusée", () => {
  const body = JSON.stringify({ id: "evt_1" });
  const t = Math.floor(Date.now() / 1000);
  assert.equal(verifyWebhook(body, signWebhook(body, "whsec_x", t), "whsec_x").id, "evt_1");
  assert.throws(() => verifyWebhook(body, signWebhook(body, "autre", t), "whsec_x"), /BAD_SIGNATURE/);
  assert.throws(() => verifyWebhook(body, signWebhook(body, "whsec_x", t - 1000), "whsec_x"), /TOO_OLD/);
  assert.throws(() => verifyWebhook(body + " ", signWebhook(body, "whsec_x", t), "whsec_x"), /BAD_SIGNATURE/);
});

test("abonnement Stripe → offre", () => {
  const prices = { plus: "price_plus", pro: "price_pro" };
  const sub = (status: string, price: string) => ({ status, current_period_end: 1000, items: { data: [{ price: { id: price } }] } });
  assert.deepEqual(planFromSubscription(sub("active", "price_pro"), prices), { plan: "pro", until: (1000 + 3 * 86400) * 1000 });
  assert.equal(planFromSubscription(sub("active", "price_plus"), prices).plan, "plus");
  assert.equal(planFromSubscription(sub("canceled", "price_pro"), prices).plan, "free");
  assert.equal(planFromSubscription(sub("active", "price_inconnu"), prices).plan, "free");
});

test("encodage formulaire Stripe", () => {
  assert.equal(formEncode({ a: 1, line_items: [{ price: "p", quantity: 1 }], skip: undefined }).toString(), "a=1&line_items%5B0%5D%5Bprice%5D=p&line_items%5B0%5D%5Bquantity%5D=1");
});

// ---------- serveur complet ----------

let base = "";
let dir = "";
let server: any;
let clock = Date.UTC(2026, 9, 15, 10, 0);
const stripeCalls: any[] = [];
const mails: string[] = [];

// Faux Stripe : renvoie des réponses plausibles.
async function fakeFetch(url: string, init: any) {
  stripeCalls.push({ url, body: init?.body });
  const json = (data: any) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  if (url.endsWith("/checkout/sessions")) return json({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });
  if (url.endsWith("/billing_portal/sessions")) return json({ url: "https://billing.stripe.test/p" });
  if (url.includes("/subscriptions/sub_1")) return json({ id: "sub_1", customer: "cus_1", status: "active", current_period_end: Math.floor(clock / 1000) + 30 * 86400, items: { data: [{ price: { id: "price_pro" } }] }, metadata: {} });
  return new Response("{}", { status: 404 });
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "vs-"));
  const app = createApp({
    publicUrl: "http://localhost",
    dataDir: dir,
    dbFile: ":memory:",
    staticDir: fileURLToPath(new URL("../../video-studio", import.meta.url)),
    timeZone: "Europe/Berlin",
    stripe: { secretKey: "sk_test", webhookSecret: "whsec_test", prices: { plus: "price_plus", pro: "price_pro" } },
    maxUploadMb: { free: 1, paid: 5 },
    fetchImpl: fakeFetch,
    now: () => clock,
    log: (m: string) => mails.push(String(m)),
  });
  server = app.server;
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

function client() {
  let cookie = "";
  return async (path: string, opts: any = {}) => {
    const headers: any = { ...(opts.headers ?? {}) };
    if (cookie) headers.cookie = cookie;
    let body = opts.body;
    if (opts.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(opts.json); }
    const res = await fetch(base + path, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* HTML */ }
    return { status: res.status, data, headers: res.headers };
  };
}

test("inscription, connexion, session, déconnexion", async () => {
  const c = client();
  let r = await c("/api/auth/signup", { json: { email: "Lea@Example.com", password: "court" } });
  assert.equal(r.data.error, "PASSWORD_SHORT");
  r = await c("/api/auth/signup", { json: { email: "Lea@Example.com", password: "unbonmotdepasse", name: "Léa" } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.email, "lea@example.com");
  assert.equal(r.data.plan.id, "free");
  assert.equal(r.data.remaining, 3);
  r = await c("/api/auth/signup", { json: { email: "lea@example.com", password: "unbonmotdepasse" } });
  assert.equal(r.data.error, "EMAIL_TAKEN");
  r = await c("/api/me");
  assert.equal(r.data.user.name, "Léa");
  await c("/api/auth/logout", { json: {} });
  r = await c("/api/me");
  assert.equal(r.data.user, null);
  const c2 = client();
  r = await c2("/api/auth/login", { json: { email: "lea@example.com", password: "faux" } });
  assert.equal(r.status, 401);
  r = await c2("/api/auth/login", { json: { email: "LEA@example.com", password: "unbonmotdepasse" } });
  assert.equal(r.data.user.email, "lea@example.com");
});

test("protection CSRF : un formulaire d'un autre site est refusé", async () => {
  const c = client();
  const r = await c("/api/auth/login", { body: "email=a&password=b", headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.equal(r.status, 415);
});

test("quota gratuit : export refusé sans compte, au-delà de 30 s, et après 3 vidéos ; remis à zéro le lendemain", async () => {
  const anon = client();
  assert.equal((await anon("/api/exports", { json: { duration: 10 } })).status, 401);
  const c = client();
  await c("/api/auth/signup", { json: { email: "quota@example.com", password: "unbonmotdepasse" } });
  let r = await c("/api/exports", { json: { duration: 45 } });
  assert.equal(r.status, 403);
  assert.equal(r.data.error, "TOO_LONG");
  for (let i = 0; i < 3; i++) {
    r = await c("/api/exports", { json: { duration: 20 } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.remaining, 2 - i);
  }
  r = await c("/api/exports", { json: { duration: 20 } });
  assert.equal(r.data.error, "DAILY_LIMIT");
  clock += 24 * 3600e3;
  r = await c("/api/exports", { json: { duration: 20 } });
  assert.equal(r.status, 200);
});

test("abonnement : paiement Stripe → webhook → illimité sans pub", async () => {
  const c = client();
  await c("/api/auth/signup", { json: { email: "pro@example.com", password: "unbonmotdepasse" } });
  const me = (await c("/api/me")).data;
  let r = await c("/api/billing/checkout", { json: { plan: "pro" } });
  assert.equal(r.data.url, "https://checkout.stripe.test/cs_1");
  const sent = new URLSearchParams(stripeCalls.find((x) => x.url.endsWith("/checkout/sessions")).body);
  assert.equal(sent.get("line_items[0][price]"), "price_pro");
  assert.equal(sent.get("client_reference_id"), String(me.user.id));
  // Stripe confirme le paiement.
  const event = JSON.stringify({ id: "evt_pay", type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: String(me.user.id), customer: "cus_1", subscription: "sub_1" } } });
  r = await c("/api/stripe/webhook", { body: event, headers: { "content-type": "application/json", "stripe-signature": signWebhook(event, "whsec_test", Math.floor(clock / 1000)) } });
  assert.equal(r.status, 200);
  r = await c("/api/me");
  assert.equal(r.data.plan.id, "pro");
  assert.equal(r.data.plan.ads, false);
  assert.equal(r.data.remaining, null);
  r = await c("/api/exports", { json: { duration: 600 } });
  assert.equal(r.status, 200);
  // Faux webhook (mauvaise signature) : refusé.
  r = await c("/api/stripe/webhook", { body: event, headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=00" } });
  assert.equal(r.status, 400);
  // Résiliation.
  const cancel = JSON.stringify({ id: "evt_cancel", type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1", status: "canceled", items: { data: [{ price: { id: "price_pro" } }] }, metadata: {} } } });
  await c("/api/stripe/webhook", { body: cancel, headers: { "content-type": "application/json", "stripe-signature": signWebhook(cancel, "whsec_test", Math.floor(clock / 1000)) } });
  r = await c("/api/me");
  assert.equal(r.data.plan.id, "free");
  // Espace client Stripe.
  r = await c("/api/billing/portal", { json: {} });
  assert.equal(r.data.url, "https://billing.stripe.test/p");
});

test("partage : envoi d'une vidéo, page publique, lecture par plages, suppression", async () => {
  const c = client();
  await c("/api/auth/signup", { json: { email: "share@example.com", password: "unbonmotdepasse" } });
  const video = Buffer.alloc(5000, 7);
  let r = await c("/api/videos", { body: video, headers: { "content-type": "video/mp4", "x-video-title": encodeURIComponent("Pourquoi tu souris"), "x-video-duration": "12" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const { id, url } = r.data;
  assert.equal(url, `http://localhost/v/${id}`);
  const anon = client();
  r = await anon(`/v/${id}`);
  assert.match(r.data, /Pourquoi tu souris/);
  assert.match(r.data, /og:video/);
  assert.match(r.data, /class="ad"/); // propriétaire gratuit : publicité
  const media = await fetch(`${base}/media/${id}`, { headers: { range: "bytes=0-99" } });
  assert.equal(media.status, 206);
  assert.equal((await media.arrayBuffer()).byteLength, 100);
  r = await c("/api/videos");
  assert.equal(r.data.videos[0].views, 1);
  // Trop gros pour l'offre gratuite (1 Mo dans ce test).
  r = await c("/api/videos", { body: Buffer.alloc(1_500_000), headers: { "content-type": "video/mp4" } });
  assert.equal(r.status, 413);
  // Un autre utilisateur ne peut pas supprimer la vidéo.
  const other = client();
  await other("/api/auth/signup", { json: { email: "other@example.com", password: "unbonmotdepasse" } });
  r = await other(`/api/videos/${id}`, { method: "DELETE", json: {} });
  assert.equal(r.status, 404);
  r = await c(`/api/videos/${id}`, { method: "DELETE", json: {} });
  assert.equal(r.status, 200);
  assert.equal((await anon(`/v/${id}`)).status, 404);
});

test("mot de passe oublié : lien envoyé, nouveau mot de passe accepté", async () => {
  const c = client();
  await c("/api/auth/signup", { json: { email: "oubli@example.com", password: "ancienmotdepasse" } });
  await c("/api/auth/forgot", { json: { email: "oubli@example.com" } });
  const msg = mails.find((m) => m.includes("oubli@example.com"));
  const token = /token=([\w-]+)/.exec(msg ?? "")?.[1];
  assert.ok(token);
  const c2 = client();
  let r = await c2("/api/auth/reset", { json: { token, password: "nouveaumotdepasse" } });
  assert.equal(r.status, 200);
  r = await c2("/api/auth/reset", { json: { token, password: "encoreunautre" } });
  assert.equal(r.status, 400); // lien à usage unique
  r = await client()("/api/auth/login", { json: { email: "oubli@example.com", password: "nouveaumotdepasse" } });
  assert.equal(r.status, 200);
});

test("suppression du compte (RGPD)", async () => {
  const c = client();
  await c("/api/auth/signup", { json: { email: "bye@example.com", password: "unbonmotdepasse" } });
  let r = await c("/api/me", { method: "DELETE", json: { password: "faux" } });
  assert.equal(r.status, 401);
  r = await c("/api/me", { method: "DELETE", json: { password: "unbonmotdepasse" } });
  assert.equal(r.status, 200);
  r = await client()("/api/auth/login", { json: { email: "bye@example.com", password: "unbonmotdepasse" } });
  assert.equal(r.status, 401);
});

test("l'application, les pages légales et les fichiers sont servis ; pas d'accès hors du dossier", async () => {
  const c = client();
  assert.match((await c("/")).data, /Vidéo Studio/);
  assert.match((await c("/legal/impressum")).data, /Impressum/);
  for (const p of ["/js/../../server/app.mjs", "/%2e%2e/server/app.mjs", "/..%2fserver/app.mjs"]) {
    const r = await c(p);
    assert.notEqual(r.status, 200, p);
    assert.doesNotMatch(String(r.data), /createApp/, p);
  }
});
