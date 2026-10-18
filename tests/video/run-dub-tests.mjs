// © la triche — Animots
// Audio / vidéo → dessin animé, de bout en bout dans Chromium :
// 1) on fabrique une vraie vidéo de dialogue (voix d'homme + voix de femme) avec le mode texte ;
// 2) on l'importe dans le mode dessin animé : retranscription Whisper, qui parle quand, scènes calées sur le son ;
// 3) on exporte le dessin animé et on vérifie que le son d'origine est dedans ; 4) on recharge : le son revient.
// Usage : npm run test:dub
import assert from "node:assert/strict";
import { launchChromium } from "../playwright.mjs";
import { videoStudioServer } from "../../scripts/serve-video.mjs";

const server = videoStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await launchChromium({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|status of 404/.test(m.text())) errors.push(m.text()); });
let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.log(`not ok - ${name}\n  ${e.message}`); }
};

const DIALOGUE = "Lui : Salut Marie, tu vas bien aujourd'hui ?\nElle : Oui, très bien, merci beaucoup.\nLui : Tu viens courir avec moi demain matin ?\nElle : Bonne idée, à demain alors.";

await page.goto(url);

await step("accueil : deux types d'animation proposés", async () => {
  await page.getByRole("button", { name: /Texte → vidéo animée/ }).waitFor();
  await page.getByRole("button", { name: /Audio \/ vidéo → dessin animé/ }).waitFor();
  assert.ok(await page.locator("#home").isVisible());
});

let video = null;
await step("préparation : vraie vidéo d'un dialogue (voix d'homme et de femme)", async () => {
  await page.getByRole("button", { name: /Texte → vidéo animée/ }).click();
  await page.evaluate(() => {
    const v = window.__videoStudio;
    const s = v.project.settings;
    Object.assign(s, { format: "1:1", music: "none", voiceMode: "neural", voiceLang: "fr", charVoice0: "fr_FR-tom-medium", charVoice1: "kokoro:ff_siwis", hook: "", outro: "" });
  });
  await page.fill("#script", DIALOGUE);
  await page.getByRole("button", { name: "Créer la vidéo" }).click();
  const speakers = await page.evaluate(() => new Set(window.__videoStudio.project.scenes.map((s) => s.speakerName).filter(Boolean)).size);
  assert.equal(speakers, 2, "dialogue à deux");
  await page.getByRole("tab", { name: "Exporter" }).click();
  await page.getByRole("button", { name: /Exporter la vidéo/ }).click();
  await page.getByRole("link", { name: /Télécharger/ }).waitFor({ timeout: 600000 });
  video = await page.evaluate(async () => {
    const a = [...document.querySelectorAll("a[download]")].pop();
    const blob = await (await fetch(a.href)).blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { b64: btoa(bin), type: blob.type, name: a.download };
  });
  assert.ok(video.b64.length > 20000);
  if (process.env.DUB_SAVE) (await import("node:fs")).writeFileSync(process.env.DUB_SAVE, Buffer.from(video.b64, "base64"));
  console.log(`  ${video.name} (${video.type})`);
});

let info = null;
await step("import : retranscription, deux personnes, répliques calées sur le son", async () => {
  await page.evaluate(() => window.__videoStudio.showHome());
  await page.getByRole("button", { name: /Audio \/ vidéo → dessin animé/ }).click();
  await page.getByRole("tab", { name: "Audio / vidéo" }).waitFor();
  await page.locator('input[type="file"][accept="audio/*,video/*"]').setInputFiles({ name: video.name, mimeType: video.type, buffer: Buffer.from(video.b64, "base64") });
  await page.getByLabel("Langue parlée").selectOption("fr");
  await page.getByRole("button", { name: /Créer le dessin animé/ }).click();
  await page.waitForFunction(() => window.__videoStudio.project.dubInfo && window.__videoStudio.dubReady, null, { timeout: 900000 });
  info = await page.evaluate(() => {
    const v = window.__videoStudio;
    const sc = v.project.scenes;
    return {
      dub: v.project.dubInfo,
      speakers: sc.filter((s) => s.kind === "scene").map((s) => s.speaker),
      texts: sc.filter((s) => s.kind === "scene").map((s) => s.text),
      sum: sc.reduce((a, s) => a + s.duration, 0),
      total: v.timeline.total,
    };
  });
  console.log(`  ${info.dub.turns} répliques · voix nettement différentes : ${info.dub.confident} · modèle de voix : ${info.dub.voiceModel}`);
  for (const [i, tx] of info.texts.entries()) console.log(`  [${info.speakers[i] + 1}] ${tx}`);
  assert.ok(info.dub.transcribed, "retranscription");
  assert.ok(info.dub.turns >= 3 && info.dub.turns <= 8, `répliques : ${info.dub.turns}`);
  assert.ok(new Set(info.speakers).size === 2, "deux personnages");
  assert.ok(info.dub.confident, "voix distinguées");
  // Les répliques alternent entre les deux personnes, comme le dialogue d'origine.
  const changes = info.speakers.filter((s, i) => i && s !== info.speakers[i - 1]).length;
  assert.ok(changes >= 3, `alternances : ${info.speakers.join(",")}`);
  const all = info.texts.join(" ").toLowerCase();
  for (const w of ["salut", "demain"]) assert.ok(all.includes(w), `mot « ${w} » retranscrit`);
  assert.ok(Math.abs(info.sum - info.dub.duration) < 0.05, `durée ${info.sum} / ${info.dub.duration}`);
});

await step("aperçu : la bouche suit la voix, rendu sans erreur", async () => {
  const r = await page.evaluate(async () => {
    const v = window.__videoStudio;
    const { lipLevel } = await import("./js/renderer.js");
    let frames = 0, open = 0, shut = 0;
    for (let t = 0; t < v.timeline.total; t += 0.25) {
      v.renderFrame(t);
      frames++;
      if (lipLevel(t) > 0.2) open++; else shut++;
    }
    return { frames, open, shut };
  });
  // La bouche s'ouvre pendant la parole et se ferme dans les silences.
  assert.ok(r.frames > 10 && r.open > 5 && r.shut > 2, JSON.stringify(r) + " total=" + (await page.evaluate(() => window.__videoStudio.timeline.total)));
});

await step("export du dessin animé avec le son d'origine", async () => {
  await page.getByRole("tab", { name: "Exporter" }).click();
  await page.getByRole("button", { name: /Exporter la vidéo/ }).click();
  const link = page.getByRole("link", { name: /Télécharger/ });
  await link.waitFor({ timeout: 120000 });
  const out = await page.evaluate(async () => {
    const a = [...document.querySelectorAll("a[download]")].pop();
    const blob = await (await fetch(a.href)).blob();
    const buf = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
    const d = buf.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
    return { size: blob.size, rms: Math.sqrt(sum / d.length), duration: buf.duration };
  });
  assert.ok(out.rms > 0.01, `niveau audio ${out.rms}`);
  assert.ok(Math.abs(out.duration - info.dub.duration) < 1.5, `durée ${out.duration} / ${info.dub.duration}`);
  console.log(`  ${(out.size / 1024).toFixed(0)} Ko · ${out.duration.toFixed(1)} s · niveau ${out.rms.toFixed(3)}`);
});

await step("rechargement : le dessin animé et son son sont retrouvés", async () => {
  await page.reload();
  await page.waitForFunction(() => window.__videoStudio?.mode === "dub" && window.__videoStudio.dubReady, null, { timeout: 30000 });
  const n = await page.evaluate(() => window.__videoStudio.project.scenes.length);
  assert.ok(n >= 3);
});

await step("aucune erreur JavaScript", async () => assert.deepEqual(errors, []));

await browser.close();
server.close();
if (failed) { console.log(`${failed} échec(s)`); process.exit(1); }
console.log("Audio / vidéo → dessin animé : tous les tests passent");
