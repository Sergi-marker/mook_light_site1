// Version gratuite (stores) : construite, installable (PWA), utilisable hors ligne, sans serveur de comptes,
// sans appel à Google Fonts, avec sa page de confidentialité.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { launchChromium } from "../playwright.mjs";
import { videoStudioServer } from "../../scripts/serve-video.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const out = `${repo}dist-free-test/`;
execFileSync(process.execPath, [`${repo}scripts/build-free.mjs`, out], { stdio: "inherit", env: { ...process.env, OPERATOR_NAME: "Test Nom", OPERATOR_EMAIL: "test@example.com" } });

const server = videoStudioServer(out);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 412, height: 900 } });
const page = await context.newPage();
const errors = [], requests = [];
page.on("pageerror", (e) => errors.push(e.message));
context.on("request", (r) => requests.push(r.url()));

let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.log(`not ok - ${name}\n  ${e.message}`); }
}

await step("construite : mode gratuit, polices locales, page de confidentialité", async () => {
  const html = await readFile(`${out}index.html`, "utf8");
  assert.match(html, /<meta name="animots-mode" content="free" \/>/);
  assert.match(html, /rel="manifest"/);
  const privacy = await readFile(`${out}privacy.html`, "utf8");
  for (const s of ["Confidentialité", "Datenschutz", "Privacy", "Test Nom", "test@example.com"]) assert.ok(privacy.includes(s), s);
  const sw = await readFile(`${out}sw.js`, "utf8");
  assert.doesNotMatch(sw, /animots-dev/, "version du cache");
  assert.match(sw, /privacy\.html/);
});

await step("manifeste valide : nom, icônes et captures présentes", async () => {
  const m = JSON.parse(await readFile(`${out}manifest.webmanifest`, "utf8"));
  assert.equal(m.short_name, "Animots");
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
  for (const f of [...m.icons, ...m.screenshots]) await readFile(`${out}${f.src}`);
});

await step("ouverture : aucun appel au serveur de comptes ni à Google, pied de page visible", async () => {
  await page.addInitScript(() => localStorage.setItem("animots.forceSw", "1"));
  await page.goto(url);
  await page.waitForTimeout(800);
  assert.ok(!requests.some((u) => u.includes("/api/")), "appel /api");
  assert.ok(!requests.some((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)), "appel Google Fonts");
  assert.ok(await page.locator("#appFooter").isVisible());
  assert.ok(!(await page.locator("#accountBtn").isVisible()));
  assert.equal(await page.getByRole("tab", { name: /Compte/ }).count(), 0);
  // La police des sous-titres est bien chargée depuis l'application.
  assert.ok(await page.evaluate(() => document.fonts.check('900 40px "Montserrat"')), "police Montserrat");
});

await step("page de confidentialité accessible depuis l'application", async () => {
  const href = await page.locator("#appFooter a").first().getAttribute("href");
  const res = await page.request.get(new URL(href, url).href);
  assert.equal(res.status(), 200);
});

await step("service worker actif, puis l'application s'ouvre hors ligne", async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  await context.setOffline(true);
  await page.reload();
  await page.locator("#appTitle").waitFor({ timeout: 10000 });
  assert.equal(await page.locator("#appTitle").textContent(), "Animots");
  // L'aperçu fonctionne hors ligne (rendu d'une image).
  await page.evaluate(() => window.__videoStudio.renderFrame(1));
  await context.setOffline(false);
});

await step("aucune erreur JavaScript", async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
server.close();
execFileSync("rm", ["-rf", out]);
if (failed) { console.log(`${failed} échec(s)`); process.exit(1); }
console.log("Version gratuite : tous les tests passent");
