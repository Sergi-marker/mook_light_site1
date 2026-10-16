// © la triche — Animots
// Construit la version gratuite d'Animots, pour un hébergement statique (Cloudflare Pages, GitHub Pages…)
// et pour les stores (paquets créés par PWABuilder) : ni compte, ni publicité, ni paiement.
//
// Usage : node scripts/build-free.mjs [dossier de sortie, par défaut dist-free]
// Variables facultatives : OPERATOR_NAME, OPERATOR_EMAIL, OPERATOR_ADDRESS (contact de la page
// de confidentialité), ANDROID_PACKAGE et ANDROID_SHA256 (lien de l'appli Google Play avec le site),
// SELF_HOST_FONTS=0 pour garder Google Fonts.

import { cp, mkdir, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "video-studio");
const out = resolve(root, process.argv[2] ?? "dist-free");
const env = process.env;

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(src, out, { recursive: true, filter: (p) => !p.endsWith(".md") });

// 1. Mode gratuit : l'application ne cherche pas de serveur de comptes.
let html = await readFile(join(out, "index.html"), "utf8");
html = html.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n    <meta name="animots-mode" content="free" />');

// 2. Polices hébergées avec l'application : aucune adresse IP envoyée à Google (RGPD).
const fontFiles = [];
if (env.SELF_HOST_FONTS !== "0") {
  const m = html.match(/<link href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)" rel="stylesheet" \/>/);
  if (m) {
    try {
      const cssUrl = m[1].replace(/&amp;/g, "&");
      // Navigateur récent : Google renvoie des fichiers woff2.
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
      let css = await (await fetch(cssUrl, { headers: { "User-Agent": ua } })).text();
      if (!css.includes("@font-face")) throw new Error("réponse inattendue");
      await mkdir(join(out, "fonts"), { recursive: true });
      const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)\s]+/g) ?? [])];
      for (const [i, u] of urls.entries()) {
        const res = await fetch(u);
        if (!res.ok) throw new Error(`${res.status} ${u}`);
        const name = `f${i}.woff2`;
        await writeFile(join(out, "fonts", name), Buffer.from(await res.arrayBuffer()));
        css = css.split(u).join(`./${name}`);
        fontFiles.push(`./fonts/${name}`);
      }
      await writeFile(join(out, "fonts", "fonts.css"), css);
      fontFiles.push("./fonts/fonts.css");
      html = html
        .replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" \/>/, "")
        .replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>/, "")
        .replace(m[0], '<link href="./fonts/fonts.css" rel="stylesheet" />');
      console.log(`Polices : ${urls.length} fichiers copiés dans fonts/`);
    } catch (e) {
      console.warn(`Polices : gardées chez Google Fonts (${e.message})`);
    }
  }
}
await writeFile(join(out, "index.html"), html);

// 3. Page de confidentialité et « À propos » (exigée par les stores).
const op = {
  name: env.OPERATOR_NAME || "[Votre nom]",
  email: env.OPERATOR_EMAIL || "[votre e-mail]",
  address: env.OPERATOR_ADDRESS || "[votre adresse]",
};
await writeFile(join(out, "privacy.html"), privacyPage(op));

// 4. Service worker : nouvelle version à chaque contenu différent, polices et page de confidentialité en cache.
const hash = createHash("sha256");
for (const f of await listFiles(out)) hash.update(f).update(await readFile(join(out, f)));
const version = `animots-${hash.digest("hex").slice(0, 10)}`;
let sw = await readFile(join(out, "sw.js"), "utf8");
sw = sw.replace('const VERSION = "animots-dev";', `const VERSION = "${version}";`)
  .replace('"./js/styles.js",', `"./js/styles.js", "./privacy.html", ${fontFiles.map((f) => JSON.stringify(f)).join(", ")}${fontFiles.length ? "," : ""}`);
await writeFile(join(out, "sw.js"), sw);

// 5. En-têtes pour Cloudflare Pages / Netlify : sécurité, et service worker jamais gardé en cache.
await writeFile(join(out, "_headers"), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=(self)
/sw.js
  Cache-Control: no-cache
/manifest.webmanifest
  Content-Type: application/manifest+json
`);

// 6. Lien entre l'appli Google Play (créée par PWABuilder) et le site : empreinte donnée par PWABuilder.
if (env.ANDROID_PACKAGE && env.ANDROID_SHA256) {
  await mkdir(join(out, ".well-known"), { recursive: true });
  await writeFile(join(out, ".well-known", "assetlinks.json"), JSON.stringify([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: env.ANDROID_PACKAGE, sha256_cert_fingerprints: env.ANDROID_SHA256.split(",").map((s) => s.trim()) },
  }], null, 2));
}

console.log(`Version gratuite construite dans ${out} (${version})`);

async function listFiles(dir, base = "") {
  const res = [];
  for (const e of await readdir(join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) res.push(...(await listFiles(dir, rel)));
    else if (rel !== "sw.js") res.push(rel);
  }
  return res.sort();
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function privacyPage(op) {
  const contact = `${esc(op.name)}<br>${esc(op.address)}<br><a href="mailto:${esc(op.email)}">${esc(op.email)}</a>`;
  const sections = {
    fr: {
      title: "Confidentialité", about: "À propos",
      body: `<p><strong>Animots</strong> transforme vos textes en vidéos animées. Cette version est gratuite, sans compte, sans publicité et sans paiement.</p>
<h3>Ce que nous collectons : rien</h3>
<p>Animots n'a pas de serveur de comptes. Vos textes, projets et personnages sont enregistrés uniquement sur votre appareil (stockage du navigateur). Les voix et les vidéos sont créées sur votre appareil ; rien n'est envoyé chez nous. Pas de cookie publicitaire, pas de mesure d'audience.</p>
<h3>Services tiers</h3>
<ul>
<li><strong>Téléchargements techniques</strong> : au premier usage, l'application télécharge des moteurs et des modèles de voix depuis jsDelivr (cdn.jsdelivr.net) et Hugging Face (huggingface.co). Comme pour tout site, ces services voient votre adresse IP. Les fichiers sont ensuite gardés sur l'appareil.</li>
<li><strong>Traduction et mise en scène par l'IA (facultatif)</strong> : seulement si vous saisissez votre propre clé API Anthropic. Le texte des scènes est alors envoyé à Anthropic (Claude) pour être traduit ou mis en scène. La clé reste sur votre appareil.</li>
<li><strong>Microphone (facultatif)</strong> : seulement si vous activez l'enregistrement de votre voix pendant l'export. Le son reste dans la vidéo créée sur votre appareil.</li>
</ul>
<h3>Vos droits</h3>
<p>Toutes vos données sont sur votre appareil : vous pouvez les effacer à tout moment en supprimant les données du site ou en désinstallant l'application. Pour toute question : voir le contact ci-dessous.</p>`,
      aboutBody: `<p>Animots — vos mots prennent vie. Créé par <strong>la triche</strong>. Voix : Kokoro (Apache 2.0) et Piper (voir la licence de chaque voix). Polices : Google Fonts (SIL Open Font License).</p>`,
      contact: "Contact",
    },
    de: {
      title: "Datenschutz", about: "Über",
      body: `<p><strong>Animots</strong> verwandelt Texte in animierte Videos. Diese Version ist kostenlos, ohne Konto, ohne Werbung und ohne Bezahlung.</p>
<h3>Welche Daten wir erheben: keine</h3>
<p>Animots hat keinen Kontoserver. Texte, Projekte und Figuren werden nur auf Ihrem Gerät gespeichert (Browserspeicher). Stimmen und Videos werden auf Ihrem Gerät erzeugt; nichts wird an uns gesendet. Keine Werbe-Cookies, keine Reichweitenmessung.</p>
<h3>Dienste Dritter</h3>
<ul>
<li><strong>Technische Downloads</strong>: Beim ersten Gebrauch lädt die App Sprach-Engines und -Modelle von jsDelivr (cdn.jsdelivr.net) und Hugging Face (huggingface.co). Wie bei jeder Website sehen diese Dienste Ihre IP-Adresse. Die Dateien bleiben danach auf dem Gerät.</li>
<li><strong>KI-Übersetzung und -Inszenierung (optional)</strong>: nur, wenn Sie Ihren eigenen Anthropic-API-Schlüssel eingeben. Der Text der Szenen wird dann an Anthropic (Claude) gesendet. Der Schlüssel bleibt auf Ihrem Gerät.</li>
<li><strong>Mikrofon (optional)</strong>: nur, wenn Sie die Sprachaufnahme beim Export aktivieren. Der Ton bleibt im Video auf Ihrem Gerät.</li>
</ul>
<h3>Ihre Rechte</h3>
<p>Alle Daten liegen auf Ihrem Gerät: Sie können sie jederzeit löschen (Websitedaten löschen oder App deinstallieren). Fragen: siehe Kontakt unten.</p>`,
      aboutBody: `<p>Animots — Worte werden lebendig. Erstellt von <strong>la triche</strong>. Stimmen: Kokoro (Apache 2.0) und Piper (Lizenz der jeweiligen Stimme). Schriften: Google Fonts (SIL Open Font License).</p>`,
      contact: "Kontakt / Verantwortlicher",
    },
    en: {
      title: "Privacy", about: "About",
      body: `<p><strong>Animots</strong> turns your texts into animated videos. This version is free, with no account, no ads and no payments.</p>
<h3>What we collect: nothing</h3>
<p>Animots has no account server. Your texts, projects and characters are stored only on your device (browser storage). Voices and videos are created on your device; nothing is sent to us. No advertising cookies, no analytics.</p>
<h3>Third-party services</h3>
<ul>
<li><strong>Technical downloads</strong>: on first use, the app downloads voice engines and models from jsDelivr (cdn.jsdelivr.net) and Hugging Face (huggingface.co). Like any website, these services see your IP address. The files then stay on your device.</li>
<li><strong>AI translation and staging (optional)</strong>: only if you enter your own Anthropic API key. The scene text is then sent to Anthropic (Claude). The key stays on your device.</li>
<li><strong>Microphone (optional)</strong>: only if you turn on voice recording during export. The sound stays in the video on your device.</li>
</ul>
<h3>Your rights</h3>
<p>All your data is on your device: you can delete it at any time by clearing the site data or uninstalling the app. Questions: see the contact below.</p>`,
      aboutBody: `<p>Animots — your words come alive. Made by <strong>la triche</strong>. Voices: Kokoro (Apache 2.0) and Piper (see each voice's license). Fonts: Google Fonts (SIL Open Font License).</p>`,
      contact: "Contact",
    },
  };
  const body = Object.entries(sections).map(([lang, s]) => `<section lang="${lang}">
<h2 id="${lang}">${s.title}</h2>${s.body}
<h3>${s.contact}</h3><p>${contact}</p>
<h2 id="about-${lang}">${s.about}</h2>${s.aboutBody}
</section>`).join("\n<hr>\n");
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Animots · Confidentialité / Datenschutz / Privacy</title>
<link rel="icon" href="./img/logo.svg" type="image/svg+xml">
<style>
:root { color-scheme: dark; }
body { margin: 0; background: #0b0c1d; color: #e8e9f3; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
a { color: #ffd84d; } h2 { margin-top: 40px; } hr { border: 0; border-top: 1px solid #2a2c4a; margin: 40px 0; }
nav a { margin-right: 12px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 900; font-size: 22px; color: #fff; text-decoration: none; }
.brand img { width: 40px; height: 40px; border-radius: 10px; }
</style></head><body><main>
<a class="brand" href="./"><img src="./img/logo.svg" alt="">Animots</a>
<nav><a href="#fr">Français</a><a href="#de">Deutsch</a><a href="#en">English</a></nav>
${body}
</main></body></html>`;
}
