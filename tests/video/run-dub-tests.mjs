// © la triche — Animots
// Audio / vidéo → dessin animé, de bout en bout dans Chromium :
// 1) on fabrique une vraie vidéo de dialogue (voix d'homme + voix de femme) avec le mode texte ;
// 2) on l'importe dans le mode dessin animé : retranscription Whisper, qui parle quand, scènes calées sur le son ;
// 3) on exporte le dessin animé et on vérifie que le son d'origine est dedans ; 4) on recharge : le son revient.
// Usage : npm run test:dub
import assert from "node:assert/strict";
import { launchChromium } from "../playwright.mjs";
import { videoStudioServer } from "../../scripts/serve-video.mjs";
import { mkdir, writeFile, access, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Photos de test (téléchargées au premier lancement, jamais enregistrées dans le dépôt) :
// portrait officiel (domaine public) et image de test classique d'OpenCV.
const PHOTOS = {
  left: "https://storage.googleapis.com/mediapipe-assets/portrait.jpg",
  right: "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/lena.jpg",
};
const cacheDir = fileURLToPath(new URL("../.cache/", import.meta.url));
const servedDir = fileURLToPath(new URL("../../video-studio/__test-photos/", import.meta.url));
await mkdir(cacheDir, { recursive: true });
await mkdir(servedDir, { recursive: true });
for (const [name, url] of Object.entries(PHOTOS)) {
  const file = `${cacheDir}${name}.jpg`;
  try { await access(file); } catch { await writeFile(file, Buffer.from(await (await fetch(url)).arrayBuffer())); }
  await writeFile(`${servedDir}${name}.jpg`, await (await import("node:fs/promises")).readFile(file));
}

const server = videoStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await launchChromium({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// MediaPipe écrit ses messages d'information sur la console d'erreur : ce ne sont pas des erreurs.
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|status of 404|^INFO:|XNNPACK/.test(m.text())) errors.push(m.text()); });
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

await step("vidéo avec de vrais visages : les personnages prennent leur allure", async () => {
  // Vraie vidéo : deux photos côte à côte, avec le son du dialogue.
  const made = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ac = new AudioContext();
    const audio = await ac.decodeAudioData(bytes.buffer);
    const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
    const [L, R] = await Promise.all([load("./__test-photos/left.jpg"), load("./__test-photos/right.jpg")]);
    const c = document.createElement("canvas");
    c.width = 1280; c.height = 720;
    const g = c.getContext("2d");
    const draw = () => {
      g.fillStyle = "#333"; g.fillRect(0, 0, 1280, 720);
      g.drawImage(L, 0, 0, L.width, L.height, 0, 0, 576, 720);
      g.drawImage(R, 0, 0, R.width, R.height, 640, 0, 640, 640);
    };
    draw();
    const dest = ac.createMediaStreamDestination();
    const src = ac.createBufferSource();
    src.buffer = audio;
    src.connect(dest);
    const stream = new MediaStream([...c.captureStream(15).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start();
    src.start();
    const t0 = performance.now();
    await new Promise((res) => { const tick = () => { draw(); if (performance.now() - t0 < audio.duration * 1000 + 300) requestAnimationFrame(tick); else res(); }; tick(); });
    rec.stop();
    await new Promise((res) => (rec.onstop = res));
    const blob = new Blob(chunks, { type: "video/webm" });
    const out = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
    return btoa(bin);
  }, video.b64);
  await page.getByRole("tab", { name: "Audio / vidéo" }).click();
  await page.locator('input[type="file"][accept="audio/*,video/*"]').setInputFiles({ name: "deux-personnes.webm", mimeType: "video/webm", buffer: Buffer.from(made, "base64") });
  await page.getByRole("button", { name: /Créer le dessin animé/ }).click();
  await page.waitForFunction(() => window.__videoStudio.project.dubInfo?.name === "deux-personnes.webm", null, { timeout: 900000 });
  const r = await page.evaluate(() => ({ info: window.__videoStudio.project.dubInfo, chars: window.__videoStudio.project.settings.characters.slice(0, 2) }));
  console.log(`  visages : ${r.info.faces} · personnages ressemblants : ${r.info.lookalike} · ${JSON.stringify(r.chars.map((c) => ({ peau: c.color, cheveux: c.hair, couleur: c.detail, haut: c.topColor })))}`);
  assert.equal(r.info.faces, 2, "deux visages");
  assert.equal(r.info.lookalike, 2, "deux personnages ressemblants");
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  // À gauche : costume bleu marine (sombre, plus bleu que rouge) et cheveux gris courts.
  const [r0, g0, b0] = hex(r.chars[0].topColor);
  assert.ok(r0 + g0 + b0 < 200 && b0 > r0, `vêtement ${r.chars[0].topColor}`);
  assert.equal(r.chars[0].hair, "short");
  // Les deux personnes n'ont pas la même couleur de peau ni le même vêtement.
  assert.notEqual(r.chars[0].color, r.chars[1].color);
  assert.notEqual(r.chars[0].topColor, r.chars[1].topColor);
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
await rm(servedDir, { recursive: true, force: true });
if (failed) { console.log(`${failed} échec(s)`); process.exit(1); }
console.log("Audio / vidéo → dessin animé : tous les tests passent");
