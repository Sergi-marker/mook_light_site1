// End-to-end test of the built app (dist/) in real Chromium, driven like a user.
// Covers the Phase 1 goals: launch, BPM, load sounds, program a pattern, play and hear it,
// edit while playing, save, reload, undo/redo, autosave + crash recovery, audio settings.
// Usage: npm run test:e2e
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const id of ["playwright", "/opt/node22/lib/node_modules/playwright"]) {
    try { return require(id); } catch { /* next */ }
  }
  throw new Error("Playwright not found. Install it with: npm i -D playwright");
}
const { chromium } = loadPlaywright();

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".map": "application/json" };
const server = createServer(async (req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  const file = normalize(join(dist, p === "/" ? "index.html" : p));
  if (!file.startsWith(dist)) return res.writeHead(403).end();
  try {
    res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

function sineWav(freq, seconds, sampleRate = 44100) {
  const n = Math.floor(seconds * sampleRate);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 16000), 44 + i * 2);
  return b;
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
// Force the download fallback for saving (the native save picker can't be driven headless).
await context.addInitScript(() => { delete window.showSaveFilePicker; });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n").slice(0, 6).join("\n     ")}`);
  }
}
const nav = (label) => page.click(`.nav-item:has-text("${label}")`);
const row = (name) => page.locator(".row", { has: page.locator(`.track-name:has-text("${name}")`) });
const cell = (name, i) => row(name).locator(".cell").nth(i);
const state = () => page.evaluate(() => window.__app.store.getState());
const maxPeak = (ms) => page.evaluate(async (ms) => {
  let peak = 0; const end = performance.now() + ms;
  while (performance.now() < end) { peak = Math.max(peak, window.__app.engine.getMasterPeak()); await new Promise((r) => setTimeout(r, 10)); }
  return peak;
}, ms);
let savedText = "";

await step("1. app launches without errors", async () => {
  await page.goto(url);
  await page.waitForSelector(".sidebar");
  await page.waitForSelector("text=HOME");
  assert.deepEqual(errors, []);
});

await step("new empty project from template", async () => {
  await page.click('[data-template="empty"]');
  await page.waitForSelector(".beat-view");
  const p = await state();
  assert.equal(p.tracks.length, 7);
  assert.ok(p.tracks.every((t) => t.steps.every((s) => !s.on)));
});

await step("2. BPM: typing sets it, out-of-range is clamped to 40–220", async () => {
  await page.fill(".bpm-input", "300");
  await page.press(".bpm-input", "Enter");
  assert.equal((await state()).bpm, 220);
  await page.fill(".bpm-input", "95");
  await page.press(".bpm-input", "Enter");
  await page.click('button[aria-label="BPM +1"]');
  assert.equal((await state()).bpm, 96);
});

await step("4. program a drum pattern by clicking cells", async () => {
  await page.locator(".beat-view h1").click(); // leave the BPM field
  for (const i of [0, 4, 8, 12]) await cell("Kick", i).click();
  await cell("Closed Hat", 2).click();
  assert.equal(await cell("Kick", 4).getAttribute("aria-pressed"), "true");
  const kick = (await state()).tracks[0];
  assert.deepEqual(kick.steps.flatMap((s, i) => (s.on ? [i] : [])), [0, 4, 8, 12]);
});

await step("5–6. PLAY: audio is produced and the playhead moves", async () => {
  await page.click(".btn-play");
  await page.waitForSelector(".cell.ph", { timeout: 3000 });
  const peak = await maxPeak(1500);
  assert.ok(peak > 0.1, `master peak ${peak}`);
  assert.equal(await page.getAttribute(".btn-play", "aria-label"), "Stop");
  const lat = await page.textContent(".latency");
  assert.match(lat, /LATENCY: \d+ ms/);
});

await step("7. edit while playing: muting via keyboard silences, solo works", async () => {
  await row("Kick").locator(".track-name").click(); // select (and audition) kick
  await page.keyboard.press("m");
  assert.equal((await state()).tracks[0].mute, true);
  await page.waitForTimeout(300);
  // Only the (unmuted) hat on step 2 remains: solo the empty snare → full silence.
  await row("Snare").locator(".track-name").click();
  await page.keyboard.press("s");
  await page.waitForTimeout(900); // let the audition tail of the clicked snare die out
  const sp = await maxPeak(1200);
  assert.ok(sp < 0.001, `silent with snare soloed (empty) and kick muted: ${sp} ${JSON.stringify((await state()).tracks.map((t) => [t.name, t.mute, t.solo]))}`);
  await page.keyboard.press("s");
  await row("Kick").locator(".track-name").click();
  await page.keyboard.press("m");
  assert.equal((await state()).tracks[0].mute, false);
  await cell("Snare", 4).click(); // live edit
  assert.ok((await maxPeak(1500)) > 0.1);
});

await step("undo / redo (Ctrl+Z, Ctrl+Shift+Z)", async () => {
  await page.locator(".beat-view h1").click();
  await page.keyboard.press("Control+z");
  assert.equal((await state()).tracks[1].steps[4].on, false);
  await page.keyboard.press("Control+Shift+z");
  assert.equal((await state()).tracks[1].steps[4].on, true);
});

await step("velocity: mouse wheel on an active step", async () => {
  await cell("Kick", 0).hover();
  await page.mouse.wheel(0, 200);
  await page.mouse.wheel(0, 200);
  assert.equal((await state()).tracks[0].steps[0].velocity, 84);
});

await step("3. load a WAV sample onto the Clap track", async () => {
  const chooser = page.waitForEvent("filechooser");
  await row("Clap").locator("select.sound").selectOption("__import");
  await (await chooser).setFiles({ name: "my-clap.wav", mimeType: "audio/wav", buffer: sineWav(880, 0.2) });
  await page.waitForSelector("text=Sample chargé : my-clap.wav");
  const p = await state();
  assert.equal(p.samples.length, 1);
  assert.equal(p.tracks[2].sampleId, p.samples[0].id);
  assert.equal(await row("Clap").locator("select.sound option:checked").textContent(), "my-clap.wav");
});

await step("unsupported audio file is rejected with a message", async () => {
  const chooser = page.waitForEvent("filechooser");
  await row("Perc").locator("select.sound").selectOption("__import");
  await (await chooser).setFiles({ name: "broken.wav", mimeType: "audio/wav", buffer: Buffer.from("not audio at all") });
  await page.waitForSelector("text=Format non supporté");
  assert.equal((await state()).tracks[5].sampleId, null);
});

await step("Space stops playback", async () => {
  await page.locator(".beat-view h1").click();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => !window.__app.engine.isPlaying);
});

await step("8. save the project (Ctrl+S) with the sample embedded", async () => {
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const d = await download;
  assert.match(d.suggestedFilename(), /\.bsproj$/);
  savedText = await readFile(await d.path(), "utf8");
  const file = JSON.parse(savedText);
  assert.equal(file.format, "beatmaker-studio-project");
  assert.equal(file.project.bpm, 96);
  assert.equal(Object.keys(file.sampleData).length, 1);
  await page.waitForSelector(".dirty:not(.is-dirty)");
});

await step("new project asks nothing when saved; then 9. reopen the saved file", async () => {
  await nav("HOME");
  await page.click('[data-template="trap"]');
  await page.waitForSelector(".beat-view");
  assert.equal((await state()).bpm, 140);
  await cell("Kick", 1).click(); // make it dirty → opening must ask for confirmation
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Control+o");
  await page.waitForSelector("text=Modifications non sauvegardées");
  await page.click(".modal .btn-danger");
  await (await chooser).setFiles({ name: "reopen.bsproj", mimeType: "application/json", buffer: Buffer.from(savedText) });
  await page.waitForFunction(() => window.__app.store.getState().bpm === 96);
  const p = await state();
  assert.deepEqual(p.tracks[0].steps.flatMap((s, i) => (s.on ? [i] : [])), [0, 4, 8, 12]);
  assert.equal(p.tracks[0].steps[0].velocity, 84);
  assert.equal(p.tracks[2].sampleId, p.samples[0].id);
  // The reloaded sample really plays: render through the engine
  const ok = await page.evaluate(() => !!window.__app.engine.getSampleBuffer(window.__app.store.getState().samples[0].id));
  assert.ok(ok, "sample decoded after reopening");
  assert.equal(await page.inputValue(".bpm-input"), "96");
});

await step("autosave + crash recovery: 'Recover previous session?'", async () => {
  await cell("Perc", 7).click(); // unsaved edit
  await page.waitForFunction(() => window.__app.lastAutosave && Date.now() - window.__app.lastAutosave.getTime() < 3000, null, { timeout: 5000 });
  // Simulate a crash: the "session open" flag is still set when the app starts again.
  await page.addInitScript(() => localStorage.setItem("bs.session-open", "1"));
  await page.reload();
  await page.waitForSelector("text=Recover previous session?");
  await page.click(".modal .btn-primary");
  await page.waitForSelector(".sidebar");
  const p = await state();
  assert.equal(p.tracks[5].steps[7].on, true, "unsaved edit recovered");
  assert.equal(p.bpm, 96);
  assert.equal(p.samples.length, 1, "sample recovered");
  assert.equal(await page.evaluate(() => window.__app.store.isDirty()), true, "still flagged unsaved");
});

await step("settings: sample rate 48 kHz and buffer size are applied to the engine", async () => {
  await nav("BEAT");
  await page.click(".btn-play");
  await page.waitForFunction(() => window.__app.engine.isPlaying);
  await nav("SETTINGS");
  await page.selectOption('select[aria-label="Fréquence d\'échantillonnage"]', "48000");
  await page.selectOption('select[aria-label="Latence / buffer"]', "1024");
  await page.waitForFunction(() => window.__app.engine.getLatency()?.sampleRate === 48000);
  const lat = await page.evaluate(() => window.__app.engine.getLatency());
  assert.ok(lat.bufferSamples >= 512, `buffer ${lat.bufferSamples}`);
  assert.ok(await page.evaluate(() => window.__app.engine.isPlaying), "playback survives the audio restart");
  assert.ok((await maxPeak(1500)) > 0.05, "still audible after restart");
  await page.selectOption('select[aria-label="Latence / buffer"]', "interactive");
  await page.selectOption('select[aria-label="Mode d\'interface"]', "pro");
  await nav("BEAT");
  assert.ok(await page.locator(".pitch").first().isVisible(), "PRO mode shows pitch");
});

await step("modules not built yet are clearly marked, without fake controls", async () => {
  for (const label of ["MELODY", "VOCALS", "MIXER", "ARRANGEMENT", "AI"]) {
    await nav(label);
    await page.waitForSelector(".dev-badge");
    assert.equal(await page.locator(".placeholder-view button, .placeholder-view input").count(), 0);
  }
});

await step("no page errors during the whole session", async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
server.close();
console.log(failed ? `\n${failed} e2e step(s) failed` : "\nall e2e steps passed");
process.exit(failed ? 1 : 0);
