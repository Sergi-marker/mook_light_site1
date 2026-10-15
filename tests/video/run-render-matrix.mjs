// Dessine toutes les combinaisons de réglages (formats, décors, cadrages, polices, sous-titres, animations,
// personnages, styles, dialogues) et vérifie qu'aucune ne plante ni ne laisse l'image vide.
// Usage : npm run test:matrix
import assert from "node:assert/strict";
import { launchChromium } from "../playwright.mjs";
import { videoStudioServer } from "../../scripts/serve-video.mjs";

const server = videoStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await launchChromium();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.__videoStudio?.project);

const result = await page.evaluate(async () => {
  const { renderFrame, FORMATS, THEMES, BACKDROPS, CAMERAS, POSITIONS, FONTS } = await import("./js/renderer.js");
  const { ACTIONS } = await import("./js/poses.js");
  const { PRESETS } = await import("./js/figure.js");
  const { BUILTIN_STYLES, applyStyle } = await import("./js/styles.js");
  const { parseScript, timeline, withBrand } = await import("./js/script.js");
  const { EXAMPLES } = await import("./js/i18n.js");
  const problems = [];
  let frames = 0;
  // Image de fond / logo générés (pas de fichier externe).
  const c0 = document.createElement("canvas"); c0.width = 64; c0.height = 48;
  const g0 = c0.getContext("2d"); g0.fillStyle = "#c33"; g0.fillRect(0, 0, 64, 48);
  const img = c0.toDataURL();
  await new Promise((r) => { const i = new Image(); i.onload = r; i.src = img; });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const base = structuredClone(window.__videoStudio.project.settings);
  const check = (label, project, times) => {
    const scenes = withBrand(project.scenes, project.settings);
    const tl = timeline(scenes, project.settings.wps ?? 2.4, scenes.map((s, i) => (i % 2 ? 1.7 : null)));
    if (!(tl.total > 0) || !Number.isFinite(tl.total)) problems.push(`${label}: durée ${tl.total}`);
    for (const f of times(tl.total)) {
      try {
        renderFrame(ctx, project, tl, f);
        frames++;
      } catch (e) {
        problems.push(`${label} t=${f.toFixed(2)}: ${e.message}`);
        return;
      }
    }
    // L'image ne doit pas être vide (un plantage silencieux laisse souvent un canvas noir).
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 211) if (d[i] + d[i + 1] + d[i + 2] > 120) lit++;
    if (lit < 5) problems.push(`${label}: image vide`);
  };
  const sample = (n) => (total) => Array.from({ length: n }, (_, i) => (total * (i + 0.5)) / n).concat([0, total, total + 5, -1]);

  const text = "# Titre *coloré*\nIl pleure en silence. Puis il court 🔥.\n[pause 1.5]\nLui : Pourquoi ?\nElle : Parce que.\nLui : [rire] Ah !\nElle : *Vraiment*.\nNarrateur : Fin.";
  const scenes = parseScript(text);
  for (const [fk, f] of Object.entries(FORMATS)) {
    canvas.width = f.w; canvas.height = f.h;
    for (const theme of Object.keys(THEMES))
      for (const backdrop of Object.keys(BACKDROPS))
        check(`${fk}/${theme}/${backdrop}`, { scenes, settings: { ...base, theme, backdrop, bgImage: img, hook: "Accroche *forte*", outro: "Abonne-toi", logo: img, handle: "@moi" } }, sample(3));
    for (const camera of Object.keys(CAMERAS))
      for (const pos of Object.keys(POSITIONS))
        check(`${fk}/cam ${camera}/pos ${pos}`, { scenes: scenes.map((s) => ({ ...s, camera, pos })), settings: base }, sample(4));
    for (const font of Object.keys(FONTS))
      for (const captionPos of ["top", "middle", "bottom"])
        for (const captionBox of ["none", "box", "word"])
          for (const captionStyle of ["words", "karaoke", "full"])
            check(`${fk}/${font}/${captionPos}/${captionBox}/${captionStyle}`, { scenes, settings: { ...base, captionFont: font, captionPos, captionBox, captionStyle, uppercase: captionStyle !== "full", progressBar: true } }, sample(2));
  }
  canvas.width = 1080; canvas.height = 1920;
  // Chaque animation, seule et à deux, avec chaque modèle de personnage.
  for (const action of Object.keys(ACTIONS))
    for (const figures of [1, 2])
      check(`action ${action} x${figures}`, { scenes: [{ id: "a", kind: "scene", text: "Test.", action, figures, seed: 3 }, { id: "b", kind: "scene", text: "Suite.", action: "idle", seed: 4 }], settings: base }, sample(6));
  for (const [id, pr] of Object.entries(PRESETS))
    for (const eyes of ["dots", "big", "lashes", "sleepy"])
      check(`perso ${id}/${eyes}`, { scenes, settings: { ...base, characters: [{ ...pr.morph, eyes }, { ...pr.morph, eyes, top: "dress", bottom: "shorts" }] } }, sample(3));
  // Styles prêts, exemples de chaque langue.
  for (const [id, st] of Object.entries(BUILTIN_STYLES)) check(`style ${id}`, { scenes, settings: applyStyle(structuredClone(base), st.settings) }, sample(6));
  for (const [ex, langs] of Object.entries(EXAMPLES))
    for (const [lang, t] of Object.entries(langs)) {
      const sc = parseScript(t);
      if (!sc.length) problems.push(`exemple ${ex}/${lang}: aucune scène`);
      check(`exemple ${ex}/${lang}`, { scenes: sc, settings: base }, sample(5));
    }
  // Cas limites : texte vide, très long mot, uniquement des pauses, emojis, caractères spéciaux.
  for (const [label, t] of Object.entries({
    vide: "", espaces: "   \n\n  ", pauses: "[pause]\n[pause 3]", motLong: "Anticonstitutionnellementanticonstitutionnellementanticonstitutionnellement.",
    emojis: "😀😀😀 🔥🔥 ❤️", html: "<script>alert(1)</script> & \"guillemets\"", etoiles: "*** ** * *a b", arabe: "مرحبا بالعالم.", japonais: "こんにちは。世界。",
    tresLong: Array.from({ length: 200 }, (_, i) => `Phrase numéro ${i} assez longue pour tester le découpage des sous-titres.`).join(" "),
  })) {
    const sc = parseScript(t);
    if (!sc.length) continue;
    check(`limite ${label}`, { scenes: sc, settings: { ...base, hook: "", outro: "" } }, sample(4));
  }
  return { problems, frames };
});

console.log(`${result.frames} images dessinées`);
for (const p of result.problems.slice(0, 40)) console.log(`  ✗ ${p}`);
await browser.close();
server.close();
assert.deepEqual(result.problems, [], `${result.problems.length} problème(s)`);
assert.deepEqual(errors, []);
console.log("Matrice de rendu : aucune erreur");
