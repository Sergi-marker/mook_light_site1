// Ouvre Animots dans Chromium, parcourt l'interface et exporte une vraie vidéo.
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
// En mode local (sans serveur de comptes), la vérification /api/config répond 404 : c'est attendu.
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|status of 404/.test(m.text())) errors.push(m.text()); });
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

await step("import d'un script .txt", async () => {
  await page.getByRole("tab", { name: "Texte" }).click();
  await page.setInputFiles('input[type=file][accept^=".txt"]', { name: "script.txt", mimeType: "text/plain", buffer: Buffer.from("# Importé\nIl pleure en silence.\nPuis il court.") });
  const scenes = await page.evaluate(() => window.__videoStudio.project.scenes.map((s) => s.action));
  assert.deepEqual(scenes, ["idle", "cry", "run"]);
});

await step("style prêt à l'emploi et style enregistré", async () => {
  await page.getByRole("tab", { name: "Style" }).click();
  await page.getByRole("button", { name: "Sport énergique" }).click();
  let st = await page.evaluate(() => window.__videoStudio.project.settings);
  assert.equal(st.captionFont, "anton");
  assert.equal(st.backdrop, "gym");
  await page.fill('input[placeholder="Nom du style"]', "Ma chaîne");
  await page.getByRole("button", { name: "Enregistrer ce style" }).click();
  await page.getByRole("button", { name: "Psychologie sombre" }).click();
  await page.getByRole("button", { name: "Ma chaîne" }).click();
  st = await page.evaluate(() => window.__videoStudio.project.settings);
  assert.equal(st.captionFont, "anton");
});

await step("personnage : vêtements et galerie « Mes personnages »", async () => {
  await page.getByRole("tab", { name: "Personnages" }).click();
  await page.locator("section.card").first().getByRole("button", { name: "Urbain (sweat)" }).click();
  const m = await page.evaluate(() => window.__videoStudio.project.settings.characters[0]);
  assert.equal(m.top, "hoodie");
  await page.locator("section.card").first().locator("input.name-input").fill("Mon héros");
  await page.locator("section.card").first().getByRole("button", { name: "+ Enregistrer" }).click();
  assert.ok(await page.getByRole("button", { name: "Mon héros" }).first().isVisible());
});

await step("dialogue : deux personnages, chacun sa voix, rendu sans erreur", async () => {
  await page.getByRole("tab", { name: "Texte" }).click();
  await page.getByRole("button", { name: "Dialogue" }).click();
  const r = await page.evaluate(() => {
    const v = window.__videoStudio;
    const sc = v.project.scenes.filter((s) => s.speaker != null);
    for (let t = 0; t < v.timeline.total; t += 0.7) v.renderFrame(t);
    return { speakers: [...new Set(sc.map((s) => s.speakerName))], voices: [...new Set(sc.map((s) => v.voiceOf(s)))] };
  });
  assert.deepEqual(r.speakers, ["Lui", "Elle"]);
  assert.equal(r.voices.length, 2);
});

await step("traduction et mise en scène par l'IA (réponse de Claude simulée)", async () => {
  // Fausse API Anthropic : renvoie un message au format réel de l'API Messages.
  const calls = [];
  await page.route("https://api.anthropic.com/**", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    calls.push({ headers: route.request().headers(), body });
    const input = JSON.parse(body.messages[0].content);
    const payload = input.lines && body.output_config.format.schema.properties.lines
      ? { lines: input.lines.map((l) => `DE: ${l}`) }
      : { actions: input.lines.map(() => "celebrate") };
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({
      id: "msg_test", type: "message", role: "assistant", model: body.model, stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "text", text: JSON.stringify(payload) }], usage: { input_tokens: 10, output_tokens: 10 },
    }) });
  });
  await page.getByRole("tab", { name: "Texte" }).click();
  await page.fill("#script", "Lui : Bonjour.\nElle : Salut.\n[pause]\nLui : Ça va ?\nElle : Oui.");
  await page.getByRole("button", { name: "Créer la vidéo" }).click();
  await page.fill('input[type="password"]', "sk-ant-test");
  await page.locator("section.card select").first().selectOption("de");
  await page.getByRole("button", { name: "Traduire", exact: true }).click();
  await page.getByText("Terminé").waitFor({ timeout: 30000 });
  let sc = await page.evaluate(() => window.__videoStudio.project.scenes.map((x) => [x.kind, x.text, x.speakerName ?? null]));
  assert.deepEqual(sc, [["scene", "DE: Bonjour.", "Lui"], ["scene", "DE: Salut.", "Elle"], ["pause", "", null], ["scene", "DE: Ça va ?", "Lui"], ["scene", "DE: Oui.", "Elle"]]);
  assert.equal(calls[0].body.model, "claude-opus-5-5");
  assert.equal(calls[0].headers["x-api-key"], "sk-ant-test");
  assert.equal(calls[0].body.messages[0].content.includes('""'), false, "les pauses ne sont pas envoyées");
  // Le texte reconstruit garde les noms et retrouve les mêmes scènes.
  const reparsed = await page.evaluate(() => window.__videoStudio.project.text);
  assert.match(reparsed, /^Lui : \[/);
  await page.getByRole("button", { name: /Mise en scène par l'IA/ }).click();
  await page.getByText("Terminé").waitFor({ timeout: 30000 });
  sc = await page.evaluate(() => window.__videoStudio.project.scenes.map((x) => [x.kind, x.action, x.figures ?? null]));
  assert.deepEqual(sc, [["scene", "celebrate", 2], ["scene", "celebrate", 2], ["pause", "idle", 2], ["scene", "celebrate", 2], ["scene", "celebrate", 2]]);
  await page.unroute("https://api.anthropic.com/**");
});

await step("mise en page : aucun débordement horizontal (téléphone 360 px et PC)", async () => {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const name of ["Texte", "Scènes", "Personnages", "Style", "Voix & musique", "Exporter"]) {
      await page.getByRole("tab", { name }).click();
      await page.waitForTimeout(120);
      const over = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll("#panel *")].filter((e) => e.getBoundingClientRect().right > W + 1).map((e) => e.tagName + "." + e.className).slice(0, 5);
        return { scroll: document.documentElement.scrollWidth - W, wide };
      });
      assert.ok(over.scroll <= 0 && !over.wide.length, `${width}px / ${name} : ${JSON.stringify(over)}`);
    }
  }
  await page.setViewportSize({ width: 412, height: 900 });
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
    p.scenes = [
      { id: "v1", kind: "scene", text: "Weil an manchen Abenden die Stille lauter ist als Worte.", action: "alone", seed: 1 },
      { id: "v2", kind: "scene", text: "Du hast gelernt, nichts mehr von anderen zu erwarten.", action: "sit", seed: 2 },
    ];
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

await step("voix HD Kokoro (française) : générée hors de l'interface, scène calée sur la voix", async () => {
  await page.evaluate(() => {
    const p = window.__videoStudio.project;
    p.scenes = [{ id: "k1", kind: "scene", text: "Le *silence* fait plus de bruit que les mots.", action: "alone", seed: 1 }];
    p.settings.voiceMode = "neural";
    p.settings.voiceLang = "fr";
    p.settings.neuralVoice = "";
    window.__videoStudio.rebuild();
  });
  assert.equal(await page.evaluate(() => window.__videoStudio.voiceOf(window.__videoStudio.project.scenes[0])), "kokoro:ff_siwis");
  await page.getByRole("tab", { name: "Voix & musique" }).click();
  await page.getByRole("button", { name: /Générer la voix/ }).click();
  // Pendant la génération, l'interface doit rester réactive (le modèle tourne dans un worker).
  const t0 = Date.now();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  assert.ok(Date.now() - t0 < 2000, "interface bloquée");
  await page.getByText(/Voix prête/).waitFor({ timeout: 300000 });
  const it = await page.evaluate(() => window.__videoStudio.timeline.items[0]);
  assert.ok(it.voiceDur > 1.5 && it.voiceDur < 8, `durée de voix ${it.voiceDur}`);
  console.log(`  voix HD : ${it.voiceDur.toFixed(2)} s`);
});

await step("effets de voix : voix grave et plus rapide, sans régénérer la voix", async () => {
  const [before, rate0] = await page.evaluate(() => [window.__videoStudio.timeline.items[0].voiceDur, window.__videoStudio.project.settings.voiceRate]);
  await page.getByLabel("Effet de voix").selectOption("narrator");
  await page.getByLabel("Vitesse de la voix").fill("1.3");
  await page.getByText(/Voix prête/).waitFor({ timeout: 60000 });
  await page.waitForFunction((b) => Math.abs(window.__videoStudio.timeline.items[0].voiceDur - b) > 0.2, before, { timeout: 60000 });
  const after = await page.evaluate(() => window.__videoStudio.timeline.items[0].voiceDur);
  // Plus rapide : ≈ durée × vitesse d'avant / 1,3 (plus la petite réverbération de l'effet).
  const expected = (before * rate0) / 1.3;
  assert.ok(after > expected - 0.1 && after < expected + 0.6, `durée ${before} → ${after}`);
  console.log(`  effet « bande-annonce » ×1,3 : ${before.toFixed(2)} s → ${after.toFixed(2)} s`);
  // Retour au réglage naturel pour la suite.
  await page.getByLabel("Effet de voix").selectOption("natural");
  await page.getByLabel("Vitesse de la voix").fill(String(rate0));
  await page.waitForFunction((b) => Math.abs(window.__videoStudio.timeline.items[0].voiceDur - b) < 0.01, before, { timeout: 30000 });
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
console.log("Animots : tous les tests passent");
