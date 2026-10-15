// Compte utilisateur, offres, quota d'export, partage et publicité (côté navigateur).
// Parle au serveur (server/) ; si l'application est servie sans serveur (npm run video), elle reste
// utilisable en « mode local » sans compte ni limites.

import { uiIndex } from "./i18n.js";

const S = {
  login: ["Se connecter", "Anmelden", "Log in"],
  signup: ["Créer un compte", "Konto erstellen", "Create account"],
  forgot: ["Mot de passe oublié ?", "Passwort vergessen?", "Forgot password?"],
  email: ["E-mail", "E-Mail", "Email"],
  password: ["Mot de passe (8 caractères min.)", "Passwort (mind. 8 Zeichen)", "Password (8+ characters)"],
  name: ["Prénom (facultatif)", "Vorname (optional)", "First name (optional)"],
  sendLink: ["Envoyer le lien", "Link senden", "Send link"],
  linkSent: ["Si un compte existe pour cette adresse, un lien vient d'être envoyé.", "Falls ein Konto existiert, wurde ein Link gesendet.", "If an account exists for this address, a link has been sent."],
  logout: ["Se déconnecter", "Abmelden", "Log out"],
  close: ["Fermer", "Schließen", "Close"],
  account: ["Compte", "Konto", "Account"],
  localMode: ["Mode local : pas de compte ni de limite (serveur non démarré).", "Lokaler Modus: kein Konto, keine Grenzen (Server nicht gestartet).", "Local mode: no account or limits (server not running)."],
  yourPlan: ["Votre offre", "Dein Tarif", "Your plan"],
  today: ["vidéos aujourd'hui", "Videos heute", "videos today"],
  unlimited: ["Vidéos illimitées", "Unbegrenzte Videos", "Unlimited videos"],
  perMonth: ["/ mois", "/ Monat", "/ month"],
  free: ["Gratuit", "Kostenlos", "Free"],
  freeDesc: ["3 vidéos par jour · 30 s max · avec publicité", "3 Videos pro Tag · max. 30 s · mit Werbung", "3 videos a day · 30 s max · with ads"],
  plusDesc: ["Vidéos illimitées, toutes durées · avec publicité", "Unbegrenzte Videos, jede Länge · mit Werbung", "Unlimited videos, any length · with ads"],
  proDesc: ["Vidéos illimitées, toutes durées · sans publicité", "Unbegrenzte Videos, jede Länge · ohne Werbung", "Unlimited videos, any length · no ads"],
  choose: ["Choisir", "Wählen", "Choose"],
  current: ["Offre actuelle", "Aktueller Tarif", "Current plan"],
  manage: ["Gérer mon abonnement", "Abo verwalten", "Manage subscription"],
  billingOff: ["Le paiement n'est pas encore configuré sur ce serveur.", "Zahlung ist auf diesem Server noch nicht eingerichtet.", "Payment is not set up on this server yet."],
  myVideos: ["Mes vidéos partagées", "Meine geteilten Videos", "My shared videos"],
  noVideos: ["Aucune vidéo partagée pour l'instant.", "Noch keine geteilten Videos.", "No shared videos yet."],
  copy: ["Copier le lien", "Link kopieren", "Copy link"], copied: ["Lien copié", "Link kopiert", "Link copied"],
  del: ["Supprimer", "Löschen", "Delete"], views: ["vues", "Aufrufe", "views"],
  deleteAccount: ["Supprimer mon compte", "Konto löschen", "Delete my account"],
  deleteConfirm: ["Pour confirmer, entrez votre mot de passe. Vos vidéos partagées seront supprimées.", "Zur Bestätigung Passwort eingeben. Geteilte Videos werden gelöscht.", "Enter your password to confirm. Your shared videos will be deleted."],
  needLogin: ["Créez un compte gratuit (ou connectez-vous) pour exporter vos vidéos.", "Erstelle ein kostenloses Konto (oder melde dich an), um Videos zu exportieren.", "Create a free account (or log in) to export your videos."],
  tooLong: ["L'offre gratuite exporte des vidéos de 30 secondes maximum. Celle-ci dure", "Der kostenlose Tarif exportiert Videos bis 30 Sekunden. Dieses dauert", "The free plan exports videos up to 30 seconds. This one lasts"],
  dailyLimit: ["Vous avez utilisé vos 3 vidéos gratuites d'aujourd'hui. Revenez demain, ou passez à Premium pour des vidéos illimitées.", "Du hast deine 3 kostenlosen Videos für heute genutzt. Komm morgen wieder oder wechsle zu Premium.", "You've used today's 3 free videos. Come back tomorrow, or upgrade to Premium for unlimited videos."],
  upgrade: ["Passer à Premium", "Zu Premium wechseln", "Upgrade to Premium"],
  shortenHint: ["Raccourcissez le texte ou passez à Premium.", "Kürze den Text oder wechsle zu Premium.", "Shorten the text or upgrade to Premium."],
  share: ["Partager (lien)", "Teilen (Link)", "Share (link)"], sharing: ["Envoi…", "Wird hochgeladen…", "Uploading…"],
  shared: ["Lien de partage prêt", "Link zum Teilen bereit", "Share link ready"],
  remainingToday: ["vidéo(s) gratuite(s) restante(s) aujourd'hui", "kostenlose(s) Video(s) heute übrig", "free video(s) left today"],
  billingOk: ["Merci ! Votre abonnement est actif.", "Danke! Dein Abo ist aktiv.", "Thank you! Your subscription is active."],
  adConsent: ["Les offres Gratuit et Premium 5 € affichent de la publicité. Acceptez-vous des annonces personnalisées ?", "Die Tarife Kostenlos und Premium 5 € zeigen Werbung. Personalisierte Anzeigen erlauben?", "Free and Premium 5 € plans show ads. Allow personalised ads?"],
  accept: ["Accepter", "Akzeptieren", "Accept"], refuse: ["Refuser", "Ablehnen", "Decline"],
  houseAd: ["Pas de publicité avec Premium sans pub — 10 € / mois", "Ohne Werbung mit Premium ohne Werbung – 10 € / Monat", "No ads with Premium ad-free — 10 € / month"],
  ad: ["Publicité", "Werbung", "Advertisement"],
  errors: {
    BAD_LOGIN: ["E-mail ou mot de passe incorrect.", "E-Mail oder Passwort falsch.", "Wrong email or password."],
    EMAIL_TAKEN: ["Un compte existe déjà avec cette adresse.", "Mit dieser Adresse gibt es bereits ein Konto.", "An account already exists for this email."],
    BAD_EMAIL: ["Adresse e-mail invalide.", "Ungültige E-Mail-Adresse.", "Invalid email address."],
    PASSWORD_SHORT: ["Le mot de passe doit faire au moins 8 caractères.", "Das Passwort braucht mindestens 8 Zeichen.", "The password needs at least 8 characters."],
    TOO_MANY_REQUESTS: ["Trop d'essais. Réessayez dans quelques minutes.", "Zu viele Versuche. Bitte in ein paar Minuten erneut.", "Too many attempts. Try again in a few minutes."],
    TOO_LARGE: ["Vidéo trop lourde pour être partagée avec votre offre.", "Video zu groß zum Teilen mit deinem Tarif.", "Video too large to share on your plan."],
    BILLING_DISABLED: ["Le paiement n'est pas encore configuré sur ce serveur.", "Zahlung ist auf diesem Server noch nicht eingerichtet.", "Payment is not set up on this server yet."],
    NETWORK: ["Serveur injoignable. Vérifiez votre connexion.", "Server nicht erreichbar. Verbindung prüfen.", "Server unreachable. Check your connection."],
  },
};
const tr = (k) => S[k]?.[uiIndex()] ?? S[k]?.[0] ?? k;
const errMsg = (code) => S.errors[code]?.[uiIndex()] ?? S.errors[code]?.[0] ?? code;

let ui = null; // { h, toast, onChange }
export const account = { online: false, config: null, me: null };

async function api(path, { method = "GET", json, body, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method: json !== undefined || body ? (method === "GET" ? "POST" : method) : method,
      headers: json !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      body: json !== undefined ? JSON.stringify(json) : body,
      credentials: "same-origin",
    });
  } catch {
    throw Object.assign(new Error("NETWORK"), { code: "NETWORK" });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { code: data.error, data, status: res.status });
  return data;
}

export async function initAccount(helpers) {
  ui = helpers;
  try {
    account.config = await api("/api/config");
    account.online = true;
    account.me = await api("/api/me");
  } catch {
    account.online = false;
  }
  const params = new URLSearchParams(location.search);
  if (params.get("billing") === "success") {
    ui.toast(tr("billingOk"));
    history.replaceState(null, "", location.pathname);
  }
  changed();
}

async function refresh() {
  if (!account.online) return;
  account.me = await api("/api/me").catch(() => account.me);
  changed();
}

/** Redessine le bouton du compte et l'encart publicitaire (changement de langue, de compte…). */
export function renderAccountUi() {
  if (!ui) return;
  renderAccountButton();
  renderAdSlot();
}

function changed() {
  renderAccountButton();
  renderAdSlot();
  ui.onChange?.();
}

const plan = () => account.me?.plan ?? account.config?.plans?.[0] ?? null;
export const isLoggedIn = () => !!account.me?.user;

// ---------- bouton du compte (en-tête) ----------

function renderAccountButton() {
  const el = document.getElementById("accountBtn");
  if (!el) return;
  if (!account.online) { el.hidden = true; return; }
  el.hidden = false;
  const u = account.me?.user;
  el.textContent = u ? `${u.name || u.email.split("@")[0]} · ${labelOf(plan())}` : tr("login");
  el.onclick = () => (u ? ui.openTab("account") : openAuth("login"));
}

const labelOf = (p) => (p ? p.label?.[uiIndex()] ?? p.id : "");

// ---------- fenêtre de connexion ----------

export function openAuth(mode = "login", reason = "") {
  const { h } = ui;
  const dlg = h("dialog", { class: "auth" });
  const msg = h("p", { class: "status", role: "alert" });
  const email = h("input", { type: "email", id: "authEmail", autocomplete: "email", required: true });
  const pw = h("input", { type: "password", id: "authPassword", minlength: "8", autocomplete: mode === "signup" ? "new-password" : "current-password", required: true });
  const name = h("input", { type: "text", id: "authName", autocomplete: "given-name", maxlength: "80" });
  const label = (text, input) => h("label", { class: "field" }, h("span", { class: "lbl" }, text), input);
  const submit = h("button", { class: "btn primary", type: "submit" }, mode === "signup" ? tr("signup") : mode === "forgot" ? tr("sendLink") : tr("login"));
  const form = h("form", { class: "stack", onsubmit: async (e) => {
    e.preventDefault();
    submit.disabled = true;
    msg.textContent = "";
    try {
      if (mode === "forgot") {
        await api("/api/auth/forgot", { json: { email: email.value } });
        msg.textContent = tr("linkSent");
      } else {
        account.me = await api(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", { json: { email: email.value, password: pw.value, name: name.value } });
        dlg.close();
        changed();
      }
    } catch (err) {
      msg.textContent = errMsg(err.code ?? "NETWORK");
    } finally {
      submit.disabled = false;
    }
  } },
  reason ? h("p", { class: "help" }, reason) : null,
  label(tr("email"), email),
  mode !== "forgot" ? label(tr("password"), pw) : null,
  mode === "signup" ? label(tr("name"), name) : null,
  submit, msg);
  const switcher = h("div", { class: "row wrap" },
    mode !== "login" ? h("button", { class: "btn sm ghost", type: "button", onclick: () => { dlg.close(); openAuth("login", reason); } }, tr("login")) : null,
    mode !== "signup" ? h("button", { class: "btn sm ghost", type: "button", onclick: () => { dlg.close(); openAuth("signup", reason); } }, tr("signup")) : null,
    mode === "login" ? h("button", { class: "btn sm ghost", type: "button", onclick: () => { dlg.close(); openAuth("forgot"); } }, tr("forgot")) : null);
  dlg.append(
    h("div", { class: "row between" }, h("h3", {}, mode === "signup" ? tr("signup") : mode === "forgot" ? tr("forgot") : tr("login")),
      h("button", { class: "btn sm ghost", type: "button", "aria-label": tr("close"), onclick: () => dlg.close() }, "✕")),
    form, switcher);
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  email.focus();
}

// ---------- offres ----------

async function choosePlan(id) {
  try {
    const { url } = await api("/api/billing/checkout", { json: { plan: id } });
    location.href = url;
  } catch (e) {
    ui.toast(errMsg(e.code ?? "NETWORK"), "error");
  }
}

function pricing() {
  const { h } = ui;
  const cur = plan()?.id ?? "free";
  const card = (id, title, price, desc) => h("div", { class: `plan ${cur === id ? "on" : ""}` },
    h("strong", {}, title),
    h("div", { class: "price" }, price === 0 ? "0 €" : `${price} € `, price ? h("small", {}, tr("perMonth")) : null),
    h("p", { class: "help" }, desc),
    cur === id
      ? h("span", { class: "chip" }, tr("current"))
      : id === "free"
        ? null
        : h("button", { class: "btn primary", onclick: () => (isLoggedIn() ? choosePlan(id) : openAuth("signup")) }, tr("choose")));
  return h("div", { class: "plans" },
    card("free", tr("free"), 0, tr("freeDesc")),
    card("plus", "Premium", 5, tr("plusDesc")),
    card("pro", labelOf(account.config?.plans?.find((p) => p.id === "pro")) || "Premium", 10, tr("proDesc")));
}

// ---------- onglet Compte ----------

export function accountPanel() {
  const { h } = ui;
  if (!account.online) return h("p", { class: "help" }, tr("localMode"));
  const u = account.me?.user;
  const p = plan();
  const usage = p?.dailyVideos != null
    ? h("div", { class: "stack" },
      h("div", {}, `${account.me?.today ?? 0} / ${p.dailyVideos} ${tr("today")}`),
      h("progress", { max: String(p.dailyVideos), value: String(account.me?.today ?? 0) }))
    : h("div", {}, `✓ ${tr("unlimited")}`);
  const videos = h("div", { class: "stack" });
  if (u) loadVideos(videos);
  return h("div", { class: "stack" },
    h("section", { class: "card" },
      h("h3", {}, tr("yourPlan"), " : ", labelOf(p)),
      u ? h("p", { class: "muted" }, u.email) : h("div", { class: "row wrap" },
        h("button", { class: "btn primary", onclick: () => openAuth("signup") }, tr("signup")),
        h("button", { class: "btn", onclick: () => openAuth("login") }, tr("login"))),
      u ? usage : null,
      pricing(),
      !account.config?.billing ? h("p", { class: "help" }, tr("billingOff")) : null,
      u?.hasBilling ? h("button", { class: "btn", onclick: async () => {
        try { location.href = (await api("/api/billing/portal", { json: {} })).url; } catch (e) { ui.toast(errMsg(e.code ?? "NETWORK"), "error"); }
      } }, tr("manage")) : null),
    u ? h("section", { class: "card" }, h("h3", {}, tr("myVideos")), videos) : null,
    u ? h("div", { class: "row wrap" },
      h("button", { class: "btn", onclick: async () => { await api("/api/auth/logout", { json: {} }).catch(() => {}); account.me = await api("/api/me").catch(() => null); changed(); } }, tr("logout")),
      h("button", { class: "btn ghost", onclick: () => deleteAccount() }, tr("deleteAccount"))) : null);
}

async function loadVideos(box) {
  const { h } = ui;
  try {
    const { videos } = await api("/api/videos");
    if (!videos.length) return box.replaceChildren(h("p", { class: "help" }, tr("noVideos")));
    box.replaceChildren(...videos.map((v) => h("div", { class: "row wrap video-row" },
      h("a", { href: v.url, target: "_blank", rel: "noopener" }, v.title || v.id),
      h("span", { class: "muted" }, `${v.views} ${tr("views")}`),
      h("button", { class: "btn sm", onclick: () => copyLink(v.url) }, tr("copy")),
      h("button", { class: "btn sm ghost", onclick: async () => { await api(`/api/videos/${v.id}`, { method: "DELETE", json: {} }); loadVideos(box); } }, tr("del")))));
  } catch { /* ignoré */ }
}

function deleteAccount() {
  const { h } = ui;
  const dlg = h("dialog", { class: "auth" });
  const pw = h("input", { type: "password", id: "deletePassword", autocomplete: "current-password" });
  const msg = h("p", { class: "status" });
  dlg.append(h("form", { class: "stack", onsubmit: async (e) => {
    e.preventDefault();
    try {
      await api("/api/me", { method: "DELETE", json: { password: pw.value } });
      dlg.close();
      account.me = await api("/api/me").catch(() => null);
      changed();
    } catch (err) { msg.textContent = errMsg(err.code ?? "NETWORK"); }
  } }, h("h3", {}, tr("deleteAccount")), h("p", { class: "help" }, tr("deleteConfirm")), pw,
  h("div", { class: "row wrap" }, h("button", { class: "btn primary", type: "submit" }, tr("del")), h("button", { class: "btn ghost", type: "button", onclick: () => dlg.close() }, tr("close"))), msg));
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

function copyLink(url) {
  (navigator.clipboard?.writeText(url) ?? Promise.reject()).then(() => ui.toast(tr("copied")), () => prompt("", url));
}

// ---------- export : vérification du quota ----------

function upgradeDialog(text) {
  const { h } = ui;
  const dlg = h("dialog", { class: "auth wide" });
  dlg.append(h("div", { class: "stack" },
    h("div", { class: "row between" }, h("h3", {}, tr("upgrade")), h("button", { class: "btn sm ghost", "aria-label": tr("close"), onclick: () => dlg.close() }, "✕")),
    h("p", {}, text), pricing()));
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

/** Texte d'information sous le bouton d'export (quota restant, durée limite). */
export function exportNotice(duration) {
  if (!account.online) return "";
  const p = plan();
  if (!isLoggedIn()) return tr("needLogin");
  if (p?.maxSeconds != null && duration > p.maxSeconds + 0.5) return `${tr("tooLong")} ${Math.round(duration)} s. ${tr("shortenHint")}`;
  if (account.me?.remaining != null) return `${account.me.remaining} ${tr("remainingToday")}`;
  return "";
}

/**
 * À appeler avant d'exporter. Renvoie true si l'export est autorisé (et décompté par le serveur).
 * En mode local (pas de serveur), tout est autorisé.
 */
export async function gateExport(duration) {
  if (!account.online) return true;
  if (!isLoggedIn()) { openAuth("signup", tr("needLogin")); return false; }
  const p = plan();
  if (p?.maxSeconds != null && duration > p.maxSeconds + 0.5) {
    upgradeDialog(`${tr("tooLong")} ${Math.round(duration)} s. ${tr("shortenHint")}`);
    return false;
  }
  try {
    const r = await api("/api/exports", { json: { duration } });
    account.me = { ...account.me, ...r };
    changed();
    return true;
  } catch (e) {
    if (e.code === "DAILY_LIMIT") upgradeDialog(tr("dailyLimit"));
    else if (e.code === "TOO_LONG") upgradeDialog(`${tr("tooLong")} ${Math.round(duration)} s. ${tr("shortenHint")}`);
    else if (e.code === "LOGIN_REQUIRED") openAuth("login", tr("needLogin"));
    else ui.toast(errMsg(e.code ?? "NETWORK"), "error");
    return false;
  }
}

/** Bouton « Partager (lien) » après un export : envoie la vidéo et affiche le lien. */
export function shareButton(blob, { title, duration }) {
  const { h } = ui;
  if (!account.online || !isLoggedIn()) return null;
  const out = h("div", { class: "row wrap" });
  const btn = h("button", { class: "btn", onclick: async () => {
    btn.disabled = true;
    btn.textContent = tr("sharing");
    try {
      const r = await api("/api/videos", { body: blob, headers: { "Content-Type": blob.type.split(";")[0], "X-Video-Title": encodeURIComponent(title), "X-Video-Duration": String(duration) } });
      btn.remove();
      const link = h("input", { type: "text", readonly: true, value: r.url, class: "link", onfocus: (e) => e.target.select() });
      out.append(h("strong", {}, tr("shared")), link, h("button", { class: "btn sm primary", onclick: () => copyLink(r.url) }, tr("copy")),
        h("a", { class: "btn sm", href: r.url, target: "_blank", rel: "noopener" }, "↗"));
    } catch (e) {
      btn.disabled = false;
      btn.textContent = tr("share");
      ui.toast(errMsg(e.code ?? "NETWORK"), "error");
    }
  } }, `🔗 ${tr("share")}`);
  out.append(btn);
  return out;
}

// ---------- publicité ----------

function consent() {
  try { return localStorage.getItem("videoStudio.adsConsent"); } catch { return null; }
}

let adsenseLoaded = false;
function renderAdSlot() {
  const slot = document.getElementById("adSlot");
  if (!slot) return;
  const { h } = ui;
  const p = plan();
  const show = account.online && p?.ads !== false;
  slot.hidden = !show;
  if (!show) { slot.replaceChildren(); return; }
  const parts = [h("small", { class: "muted ad-label" }, tr("ad"))];
  const ads = account.config?.ads;
  if (ads?.client && ads?.slot) {
    const ins = h("ins", { class: "adsbygoogle", style: "display:block", "data-ad-client": ads.client, "data-ad-slot": ads.slot, "data-ad-format": "auto", "data-full-width-responsive": "true" });
    parts.push(ins);
    if (!adsenseLoaded) {
      adsenseLoaded = true;
      const s = document.createElement("script");
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ads.client)}`;
      document.head.append(s);
    }
    window.adsbygoogle = window.adsbygoogle || [];
    // Sans accord explicite : annonces non personnalisées seulement.
    window.adsbygoogle.requestNonPersonalizedAds = consent() === "yes" ? 0 : 1;
    queueMicrotask(() => { try { window.adsbygoogle.push({}); } catch { /* bloqueur de pub */ } });
    if (consent() == null) {
      parts.push(h("div", { class: "consent" }, h("span", {}, tr("adConsent")),
        h("button", { class: "btn sm primary", onclick: () => { try { localStorage.setItem("videoStudio.adsConsent", "yes"); } catch { /* ignoré */ } renderAdSlot(); } }, tr("accept")),
        h("button", { class: "btn sm", onclick: () => { try { localStorage.setItem("videoStudio.adsConsent", "no"); } catch { /* ignoré */ } renderAdSlot(); } }, tr("refuse"))));
    }
  } else {
    // Pas de régie configurée : encart maison pour l'offre sans publicité.
    parts.push(h("button", { class: "house-ad", onclick: () => ui.openTab("account") }, tr("houseAd")));
  }
  slot.replaceChildren(...parts);
}

export { refresh as refreshAccount };
