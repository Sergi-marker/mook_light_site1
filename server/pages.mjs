// © la triche — Animots
// Pages HTML rendues par le serveur : page de partage d'une vidéo, réinitialisation du mot de passe,
// et pages légales (mentions légales / Impressum, confidentialité, conditions d'utilisation).

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STYLE = `
:root { --bg:#0b0c1d; --card:#14152b; --line:#2c2f55; --text:#ecebf5; --muted:#9a9bbb; --accent:#ffd84d; --ink:#1a1400; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:16px/1.55 "Montserrat", system-ui, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px max(16px, env(safe-area-inset-left)) 48px; display:flex; flex-direction:column; gap:18px; }
a { color: var(--accent); }
h1 { font-size: 24px; margin: 0; text-wrap: balance; }
h2 { font-size: 18px; margin: 18px 0 4px; }
.muted { color: var(--muted); font-size: 14px; }
.video { width: 100%; max-height: 78vh; background:#000; border-radius: 12px; display:block; }
.row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
.btn { display:inline-flex; align-items:center; gap:6px; padding:10px 16px; border-radius:10px; border:1px solid var(--line); background:var(--card); color:var(--text); font:inherit; font-weight:700; text-decoration:none; cursor:pointer; }
.btn.primary { background:var(--accent); color:var(--ink); border-color:var(--accent); }
.ad { border:1px dashed var(--line); border-radius:12px; padding:12px; min-height:90px; display:flex; align-items:center; justify-content:center; }
.brand { font-weight:900; letter-spacing:.02em; color:var(--text); text-decoration:none; }
form { display:flex; flex-direction:column; gap:10px; max-width:380px; }
input { padding:10px; border-radius:8px; border:1px solid var(--line); background:#0e0f22; color:var(--text); font:inherit; }
.legal p, .legal li { color:#d8d7e6; }
.todo { background:#3a2f00; color:#ffe58a; padding:2px 6px; border-radius:4px; }
`;

function layout({ title, body, head = "", publicUrl = "" }) {
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<link rel="icon" href="/img/logo.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;900&display=swap" rel="stylesheet">
<style>${STYLE}</style>
${head}
</head><body><main>
<a class="brand" href="${esc(publicUrl)}/"><img src="/img/logo.svg" alt="" width="34" height="34" style="vertical-align:middle;border-radius:9px;margin-right:8px">Animots</a>
${body}
<p class="muted"><a href="/legal/impressum">Mentions légales / Impressum</a> · <a href="/legal/privacy">Confidentialité</a> · <a href="/legal/terms">Conditions</a> · Animots — créé par <strong>la triche</strong></p>
</main></body></html>`;
}

/** Emplacement publicitaire : AdSense si configuré, sinon encart maison pour l'offre premium. */
export function adSlot(ads) {
  if (ads?.client && ads?.slot) {
    return `<div class="ad" data-ad>
<ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="${esc(ads.client)}" data-ad-slot="${esc(ads.slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>
</div>
<script>
(function () {
  var consent = null; try { consent = localStorage.getItem("videoStudio.adsConsent"); } catch (e) {}
  var s = document.createElement("script");
  s.async = true; s.crossOrigin = "anonymous";
  s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(ads.client)}";
  document.head.appendChild(s);
  // Sans accord explicite : annonces non personnalisées.
  (window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = consent === "yes" ? 0 : 1;
  (window.adsbygoogle = window.adsbygoogle || []).push({});
})();
</script>`;
  }
  return `<div class="ad"><span class="muted">Créez vos propres vidéos animées · <a href="/">Animots</a> — Premium sans publicité à 10 €/mois</span></div>`;
}

export function sharePage({ video, url, mediaUrl, showAds, ads, publicUrl }) {
  const title = video.title || "Vidéo animée";
  const head = `
<meta property="og:type" content="video.other">
<meta property="og:title" content="${esc(title)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:video" content="${esc(mediaUrl)}">
<meta property="og:video:type" content="${esc(video.mime)}">
<meta name="twitter:card" content="player">
<meta name="description" content="Vidéo créée avec Animots">`;
  const enc = encodeURIComponent(url);
  const text = encodeURIComponent(title);
  const body = `
<h1>${esc(title)}</h1>
<video class="video" src="${esc(mediaUrl)}" controls playsinline preload="metadata"></video>
<div class="row">
  <button class="btn primary" id="copy" type="button">Copier le lien</button>
  <a class="btn" href="https://wa.me/?text=${text}%20${enc}" target="_blank" rel="noopener">WhatsApp</a>
  <a class="btn" href="https://t.me/share/url?url=${enc}&text=${text}" target="_blank" rel="noopener">Telegram</a>
  <a class="btn" href="https://www.facebook.com/sharer/sharer.php?u=${enc}" target="_blank" rel="noopener">Facebook</a>
  <a class="btn" href="https://twitter.com/intent/tweet?url=${enc}&text=${text}" target="_blank" rel="noopener">X</a>
  <a class="btn" href="${esc(mediaUrl)}?download=1">Télécharger</a>
</div>
<p class="muted">${video.views} vue${video.views > 1 ? "s" : ""}</p>
${showAds ? adSlot(ads) : ""}
<script>
document.getElementById("copy").addEventListener("click", function () {
  var b = this;
  (navigator.clipboard ? navigator.clipboard.writeText(${JSON.stringify(url)}) : Promise.reject()).then(function () { b.textContent = "Lien copié"; }, function () { prompt("Lien :", ${JSON.stringify(url)}); });
});
</script>`;
  return layout({ title: `${title} · Animots`, body, head, publicUrl });
}

export function notFoundPage(publicUrl) {
  return layout({ title: "Introuvable · Animots", body: `<h1>Cette vidéo n'existe pas ou a été supprimée.</h1><p><a class="btn primary" href="/">Créer une vidéo</a></p>`, publicUrl });
}

export function resetPage({ token, publicUrl }) {
  const body = `
<h1>Nouveau mot de passe</h1>
<form id="f">
  <label>Nouveau mot de passe (8 caractères minimum)<br><input id="pw" type="password" minlength="8" required autocomplete="new-password"></label>
  <button class="btn primary" type="submit">Enregistrer</button>
  <p id="msg" class="muted"></p>
</form>
<script>
document.getElementById("f").addEventListener("submit", async function (e) {
  e.preventDefault();
  var r = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ${JSON.stringify(token)}, password: document.getElementById("pw").value }) });
  var msg = document.getElementById("msg");
  if (r.ok) { msg.textContent = "Mot de passe modifié. Vous êtes connecté."; setTimeout(function () { location.href = "/"; }, 1200); }
  else msg.textContent = "Lien expiré ou invalide. Redemandez un lien depuis l'application.";
});
</script>`;
  return layout({ title: "Mot de passe · Animots", body, publicUrl });
}

/**
 * Pages légales. Les éléments entre [crochets] viennent de la configuration (OPERATOR_*) ;
 * ces textes sont des modèles à faire relire : ils ne remplacent pas un conseil juridique.
 */
export function legalPage(kind, op, publicUrl) {
  const v = (x, label) => (x ? esc(x) : `<span class="todo">[${label} à compléter]</span>`);
  const name = v(op.name, "Nom ou raison sociale");
  const address = v(op.address, "Adresse postale");
  const email = v(op.email, "E-mail de contact");
  const pages = {
    impressum: {
      title: "Mentions légales / Impressum",
      body: `
<h2>Éditeur / Anbieter (§ 5 DDG)</h2>
<p>${name}<br>${address}<br>E-mail : ${email}${op.vat ? `<br>N° TVA / USt-IdNr. : ${esc(op.vat)}` : ""}</p>
<h2>Responsable du contenu / Verantwortlich (§ 18 Abs. 2 MStV)</h2>
<p>${name}, ${address}</p>
<h2>Règlement des litiges / Streitbeilegung</h2>
<p>Nous ne sommes ni obligés ni disposés à participer à une procédure de règlement des litiges devant un organe de conciliation des consommateurs. / Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>`,
    },
    privacy: {
      title: "Confidentialité / Datenschutz",
      body: `
<p>Responsable du traitement : ${name}, ${address}, ${email}.</p>
<h2>Données traitées</h2>
<ul>
<li><b>Compte</b> : adresse e-mail, nom facultatif, mot de passe (stocké uniquement sous forme d'empreinte scrypt), offre souscrite. Base : exécution du contrat (art. 6 (1) b RGPD).</li>
<li><b>Utilisation</b> : nombre et durée des vidéos exportées par jour, pour appliquer les limites de l'offre gratuite. Base : contrat.</li>
<li><b>Vidéos partagées</b> : les vidéos que vous choisissez de partager sont stockées sur nos serveurs et visibles par toute personne qui a le lien, jusqu'à leur suppression.</li>
<li><b>Textes et voix</b> : le texte de vos vidéos, la création des animations et la voix de synthèse restent sur votre appareil ; ils ne sont pas envoyés à nos serveurs. Les modèles de voix sont téléchargés depuis Hugging Face et la bibliothèque d'exécution depuis jsDelivr / cdnjs, qui voient votre adresse IP.</li>
<li><b>Traduction optionnelle</b> : si vous l'utilisez avec votre clé API, le texte des scènes est envoyé à Anthropic.</li>
<li><b>Paiement</b> : géré par Stripe (Stripe Payments Europe Ltd.) ; nous ne voyons pas vos données bancaires.</li>
<li><b>Publicité</b> (offres Gratuit et Premium 5 €) : Google AdSense. Sans votre accord, seules des annonces non personnalisées sont demandées. Base : consentement (art. 6 (1) a RGPD) pour les annonces personnalisées.</li>
<li><b>Cookie</b> : un cookie de session technique, nécessaire à la connexion.</li>
</ul>
<h2>Vos droits</h2>
<p>Accès, rectification, effacement (suppression du compte depuis l'application), limitation, portabilité, opposition, et réclamation auprès d'une autorité de contrôle. Contact : ${email}.</p>`,
    },
    terms: {
      title: "Conditions d'utilisation",
      body: `
<h2>Offres</h2>
<ul>
<li><b>Gratuit</b> : 3 vidéos par jour, 30 secondes maximum chacune, avec publicité.</li>
<li><b>Premium — 5 € / mois</b> : vidéos illimitées, avec publicité.</li>
<li><b>Premium sans pub — 10 € / mois</b> : vidéos illimitées, sans publicité.</li>
</ul>
<p>Les abonnements sont mensuels, renouvelés automatiquement et résiliables à tout moment depuis « Gérer mon abonnement » ; la résiliation prend effet à la fin de la période payée. Prix TTC.</p>
<h2>Contenus</h2>
<p>Vous êtes responsable des textes et vidéos que vous créez et partagez. Sont interdits les contenus illégaux, haineux, harcelants ou portant atteinte aux droits d'autrui. Nous pouvons supprimer une vidéo partagée signalée comme illicite.</p>
<p>Les vidéos que vous créez vous appartiennent ; vous pouvez les utiliser, y compris commercialement.</p>
<h2>Contact</h2>
<p>${name}, ${address}, ${email}</p>`,
    },
  };
  const p = pages[kind];
  if (!p) return null;
  return layout({ title: `${p.title} · Animots`, body: `<div class="legal"><h1>${p.title}</h1>${p.body}<p class="muted">Modèle à faire vérifier par un professionnel avant la mise en ligne.</p></div>`, publicUrl });
}
