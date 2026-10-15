// Ouvre Vidéo Studio dans Chromium, parcourt l'interface et exporte une vraie vidéo.
// Usage : npm run test:video
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
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.log(`not ok - ${name}\n  ${e.message}`); }
};

await page.goto(url);
await page.waitForFunction(() => window.__videoStudio?.project.scenes.length > 0);

await step("l'exemple par défaut donne des scènes et une durée", async () => {
  const n = await page.evaluate(() => window.__videoStudio.project.scenes.length);
  const total = await page.evaluate(() => window.__videoStudio.timeline.total);
  assert.ok(n >= 8 && total > 20, `${n} scènes, ${total}s`);
});

await step("l'aperçu dessine quelque chose (pas un écran vide)", async () => {
  const lit = await page.evaluate(() => {
    window.__videoStudio.renderFrame(3);
    const c = document.getElementById("stage");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let bright = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) bright++;
    return bright;
  });
  assert.ok(lit > 50, `pixels clairs : ${lit}`);
});

await step("créer une vidéo à partir d'un texte collé (allemand)", async () => {
  await page.fill("#script", "# Test\nEr weint jeden Abend.\n[lachen] Trotzdem lachst du.\nIch gehe ins Krafttraining.");
  await page.getByRole("button", { name: "Créer la vidéo" }).click();
  const actions = await page.evaluate(() => window.__videoStudio.project.scenes.map((s) => s.action));
  assert.deepEqual(actions, ["idle", "cry", "laugh", "lift"]);
});

await step("tous les onglets s'affichent", async () => {
  for (const name of ["Scènes", "Personnages", "Style", "Voix & musique", "Exporter", "Texte"]) {
    await page.getByRole("tab", { name }).click();
    await page.waitForTimeout(100);
  }
});

await step("changer la morphologie modifie le personnage", async () => {
  await page.getByRole("tab", { name: "Personnages" }).click();
  await page.getByRole("button", { name: "Costaud" }).first().click();
  const m = await page.evaluate(() => window.__videoStudio.project.settings.characters[0]);
  assert.equal(m.build, 1.5);
  assert.equal(m.beard, true);
});

await step("interface en allemand", async () => {
  await page.selectOption("#uiLang", "de");
  assert.ok(await page.getByRole("tab", { name: "Figuren" }).isVisible());
  await page.selectOption("#uiLang", "fr");
});

await step("lecture : le temps avance", async () => {
  await page.evaluate(() => { window.__videoStudio.seek(0); window.__videoStudio.play(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__videoStudio.pause());
  const t = Number(await page.inputValue("#seek"));
  assert.ok(t > 0.3, `position ${t}`);
});

await step("voix naturelle : génération, durée des scènes calée sur la voix", async () => {
  await page.evaluate(() => {
    const p = window.__videoStudio.project;
    p.scenes = p.scenes.slice(1, 3).map((s) => ({ ...s, duration: undefined }));
    p.settings.voiceMode = "neural";
    p.settings.voiceLang = "de";
    p.settings.neuralVoice = "";
  });
  await page.getByRole("tab", { name: "Voix & musique" }).click();
  await page.getByRole("button", { name: /Générer la voix/ }).click();
  await page.getByText(/Voix prête/).waitFor({ timeout: 240000 });
  const items = await page.evaluate(() => window.__videoStudio.timeline.items.map((it) => ({ voice: it.voiceDur, d: it.duration })));
  for (const it of items) {
    assert.ok(it.voice > 0.8, `durée de voix ${it.voice}`);
    assert.ok(Math.abs(it.d - (it.voice + 0.7)) < 0.01, `scène ${it.d} / voix ${it.voice}`);
  }
});

await step("export d'une vraie vidéo 16:9 avec la voix dans le fichier", async () => {
  await page.evaluate(() => {
    const p = window.__videoStudio.project;
    p.settings.format = "16:9";
    p.settings.music = "none";
  });
  await page.getByRole("tab", { name: "Exporter" }).click();
  await page.getByRole("button", { name: /Exporter la vidéo/ }).click();
  const link = page.getByRole("link", { name: /Télécharger/ });
  await link.waitFor({ timeout: 60000 });
  const info = await page.evaluate(async () => {
    const a = [...document.querySelectorAll("a[download]")].pop();
    const blob = await (await fetch(a.href)).blob();
    const v = document.querySelector("video.result");
    await new Promise((r) => (v.readyState >= 1 ? r() : v.addEventListener("loadedmetadata", r, { once: true })));
    // Niveau sonore de la piste audio du fichier (la musique est coupée : ce qu'on entend est la voix).
    let rms = null;
    try {
      const buf = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
      const d = buf.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      rms = Math.sqrt(sum / d.length);
    } catch (e) { rms = `decode: ${e.message}`; }
    return { size: blob.size, type: blob.type, w: v.videoWidth, h: v.videoHeight, name: a.download, rms };
  });
  assert.ok(info.size > 10_000, `taille ${info.size}`);
  assert.equal(info.w, 1920);
  assert.equal(info.h, 1080);
  assert.ok(typeof info.rms === "number" && info.rms > 0.01, `niveau audio ${info.rms}`);
  console.log(`  ${info.name} · ${info.type} · ${(info.size / 1024).toFixed(0)} Ko · niveau voix ${info.rms.toFixed(3)}`);
});

await step("aucune erreur JavaScript", async () => assert.deepEqual(errors, []));

await browser.close();
server.close();
if (failed) { console.log(`${failed} échec(s)`); process.exit(1); }
console.log("Vidéo Studio : tous les tests passent");
