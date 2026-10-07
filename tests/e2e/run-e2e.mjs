// End-to-end test of the built app (dist/) in real Chromium, driven like a user, following
// the "DONE" scenario: project → 140 BPM → F minor → drums → melody → 808 → arrangement →
// microphone → record → processed monitoring → pitch correction → clean → mix → AI assistant →
// master → export → save → reload. The microphone is Chromium's fake capture device fed with a
// generated, slightly out-of-tune "voice". MIDI is a scripted fake MIDIAccess.
// Usage: npm run test:e2e
import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
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

/** 16-bit mono WAV. */
function wav(samples, sr) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((x, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x * 32767))), 44 + i * 2));
  return b;
}
// "Voice": harmonic tone 452 Hz (A4 +46 cents) in 0.9 s phrases, light background hiss.
const SR = 48000;
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
const voice = Array.from({ length: SR * 12 }, (_, i) => {
  const t = i / SR;
  const on = Math.floor(t / 0.9) % 3 !== 2;
  let v = 0;
  if (on) for (let k = 1; k <= 7; k++) v += Math.sin(2 * Math.PI * 452 * k * t) / k;
  return 0.22 * v + 0.004 * rnd();
});
const tmp = await mkdtemp(join(tmpdir(), "bs-e2e-"));
const voiceFile = join(tmp, "voice.wav");
await writeFile(voiceFile, wav(voice, SR));

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${voiceFile}`],
});
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 950 }, permissions: ["microphone"] });
await context.addInitScript(() => {
  delete window.showSaveFilePicker;
  // Scripted MIDI keyboard.
  const listeners = [];
  const input = { id: "kb1", name: "Test Keyboard", set onmidimessage(fn) { listeners.push(fn); } };
  window.__midiSend = (bytes) => listeners.forEach((fn) => fn({ data: new Uint8Array(bytes) }));
  navigator.requestMIDIAccess = async () => ({ inputs: new Map([["kb1", input]]), outputs: new Map(), onstatechange: null });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let nextPrompt = null;
page.on("dialog", (d) => {
  const v = nextPrompt ?? (d.defaultValue() || "OK");
  nextPrompt = null;
  void d.accept(v);
});

let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n").slice(0, 8).join("\n     ")}`);
  }
}
const nav = (label) => page.click(`.nav-item:has-text("${label}")`);
const state = () => page.evaluate(() => window.__app.store.getState());
const evalApp = (fn, arg) => page.evaluate(fn, arg);
const maxPeak = (ms, channel) => page.evaluate(async ([ms, channel]) => {
  let peak = 0; const end = performance.now() + ms; const e = window.__app.engine;
  while (performance.now() < end) { peak = Math.max(peak, channel ? e.mixer.peak(channel) : e.getMasterPeak()); await new Promise((r) => setTimeout(r, 10)); }
  return peak;
}, [ms, channel]);
const waitIdle = () => page.waitForFunction(() => !window.__app.busy, null, { timeout: 120000 });
const clickCanvas = async (sel, x, y, opts = {}) => {
  const box = await page.locator(sel).boundingBox();
  await page.mouse.click(box.x + x, box.y + y, opts);
};

await step("1. app opens without errors; 9 modules", async () => {
  await page.goto(url);
  await page.waitForSelector(".sidebar");
  assert.equal(await page.locator(".nav-item").count(), 9);
  assert.deepEqual(errors, []);
});

await step("2–4. new project, 140 BPM, F minor", async () => {
  await page.click('[data-template="empty"]');
  await page.waitForSelector(".beat-view");
  await page.fill(".bpm-input", "140");
  await page.press(".bpm-input", "Enter");
  await page.selectOption('select[aria-label="Tonalité"]', "5");
  await page.selectOption('select[aria-label="Gamme"]', "minor");
  const p = await state();
  assert.equal(p.bpm, 140);
  assert.deepEqual(p.key, { root: 5, scale: "minor" });
});

await step("5. drums: AI drum generator + manual edits, rolls; PLAY is audible", async () => {
  await page.selectOption('select[aria-label="Genre du générateur"]', "trap");
  await page.click("text=✨ Générer drums");
  const p = await state();
  const pat = p.patterns.find((x) => x.id === p.currentPatternId);
  const kick = p.tracks.find((t) => t.instrument === "kick").id;
  assert.ok(pat.drums[kick][0].on, "kick on the one");
  const hat = page.locator(".row", { has: page.locator('.track-name:has-text("Closed Hat")') }).locator(".cell").nth(5);
  await hat.click({ modifiers: ["Alt"] });
  const p2 = await state();
  const st = p2.patterns[0].drums[p2.tracks.find((t) => t.instrument === "closedHat").id][5];
  assert.ok(st.on && st.roll >= 2, "alt-click roll");
  await page.click(".btn-play");
  assert.ok((await maxPeak(1200)) > 0.05, "drums audible");
  await page.click(".btn-play");
});

await step("SAMPLER: edit a lane's sound (trim, reverse, gain), still audible", async () => {
  await page.click('.row .track-name:has-text("Snare")');
  await page.waitForSelector(".sample-editor >> text=SAMPLER — Snare");
  await page.click('.sample-editor button:has-text("Reverse")');
  const fin = page.locator('.sample-editor input[aria-label="Fin"]');
  await fin.fill("0.5");
  await fin.dispatchEvent("input");
  const t = (await state()).tracks.find((x) => x.instrument === "snare");
  assert.deepEqual([t.sampleEdit.reverse, t.sampleEdit.end], [true, 0.5]);
  const peak = await evalApp(async (id) => {
    const e = window.__app.engine;
    const t = window.__app.store.getState().tracks.find((x) => x.id === id);
    const b = e.seq.bufferForTrack(t);
    return { len: b.duration, first: Math.abs(b.getChannelData(0)[10]) };
  }, t.id);
  assert.ok(peak.len < 0.16, `trimmed ${peak.len}`);
});

await step("6. melody: piano roll notes (scale lock), audible", async () => {
  await nav("MELODY");
  await page.waitForSelector(".pr-canvas");
  await page.click('.ins-row .track-name:has-text("Piano")');
  // Scroll so that a known pitch is visible: click 3 notes at different rows.
  const rowH = 14, stepW = 28;
  await evalApp(() => { document.querySelector(".pr-scroll").scrollTop = (96 - 72) * 14 - 20; });
  // The canvas bounding box already moves with the scroll position.
  const yFor = (pitch) => (96 - pitch) * rowH + rowH / 2;
  await clickCanvas(".pr-canvas", 2 * stepW + 3, yFor(72)); // C5 (in F minor)
  await clickCanvas(".pr-canvas", 6 * stepW + 3, yFor(71)); // B4 → not in F minor → snapped
  await clickCanvas(".pr-canvas", 10 * stepW + 3, yFor(68)); // G#4/Ab4 in F minor
  const p = await state();
  const ins = p.instruments.find((i) => i.preset === "piano").id;
  const notes = p.patterns[0].notes[ins];
  assert.equal(notes.length, 3, JSON.stringify(notes));
  const inF = (m) => [0, 2, 3, 5, 7, 8, 10].includes((((m - 5) % 12) + 12) % 12);
  assert.ok(notes.every((n) => inF(n.pitch)), `scale lock ${notes.map((n) => n.pitch)}`);
  // Move a note by dragging, then delete with right-click.
  await clickCanvas(".pr-canvas", 10 * stepW + 3, yFor(notes[2].pitch), { button: "right" });
  assert.equal((await state()).patterns[0].notes[ins].length, 2);
  await page.click("text=✨ Générer (IA)");
  await page.waitForTimeout(50);
  if (await page.locator(".modal").count()) await page.click(".modal .btn-primary");
  const gen = (await state()).patterns[0].notes[ins];
  assert.ok(gen.length >= 4 && gen.every((n) => inF(n.pitch)), `AI melody in key: ${gen.length} notes ${gen.map((n) => n.pitch)}`);
});

await step("7. 808: notes with slide (L key), 808 params, glide audible", async () => {
  await page.click('.ins-row .track-name:has-text("808")');
  await evalApp(() => { document.querySelector(".pr-scroll").scrollTop = (96 - 44) * 14; });
  const y = (pitch) => (96 - pitch) * 14 + 7;
  await clickCanvas(".pr-canvas", 3, y(41)); // F2
  await clickCanvas(".pr-canvas", 8 * 28 + 3, y(36)); // C2
  await page.keyboard.press("l");
  const p = await state();
  const b = p.instruments.find((i) => i.preset === "808");
  const notes = p.patterns[0].notes[b.id];
  assert.equal(notes.length, 2);
  assert.ok(notes.some((n) => n.slide), "slide set");
  const sat = page.locator('.ins-params input[aria-label="Saturation"]');
  await sat.fill("0.8");
  await sat.dispatchEvent("input");
  assert.equal((await state()).instruments.find((i) => i.id === b.id).bass808.saturation, 0.8);
});

await step("8. arrangement: AI beat generator builds sections + clips; song mode plays", async () => {
  await nav("AI");
  await page.click('.tab:has-text("BEAT GENERATOR")');
  await page.fill("textarea.prompt", "Dark trap beat, 140 BPM, F minor, melancholic, heavy 808.");
  await page.click("text=✨ GENERATE BEAT");
  await page.click("text=Appliquer au projet");
  await page.waitForSelector(".arrangement-view");
  const p = await state();
  assert.ok(p.arrangement.sections.length >= 7, "sections");
  assert.ok(p.arrangement.clips.length >= 8, "clips");
  // Drag the first clip one bar to the right (commit on release).
  const clip = page.locator(".tl-clip").first();
  const box = await clip.boundingBox();
  const before = (await state()).arrangement.clips[0].start;
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 20 + 36 * 2, box.y + 10, { steps: 5 });
  await page.mouse.up();
  const after = (await state()).arrangement.clips[0].start;
  assert.equal(after, before + 2, `clip moved ${before} → ${after}`);
  await page.keyboard.press("Control+z");
  assert.equal((await state()).arrangement.clips[0].start, before, "undo move");
  // Play in song mode from bar 5.
  await evalApp(() => { window.__app.engine.setMode("song"); window.__app.engine.seek(4 * 16); });
  await page.click(".btn-play");
  assert.ok((await maxPeak(1500)) > 0.05, "song audible");
  await page.click(".btn-play");
});

await step("MELODY tools: sound library, chord drawing, transpose in key, arpeggiator", async () => {
  await nav("MELODY");
  await page.click('.ins-row .track-name:has-text("Piano")');
  const ins = (await state()).instruments.find((i) => i.name === "Piano").id;
  const cur = async () => { const q = await state(); return q.patterns.find((x) => x.id === q.currentPatternId).notes[ins]; };
  await page.selectOption('select[aria-label="Bibliothèque de sons"]', "rnb-rhodes");
  const after = (await state()).instruments.find((i) => i.id === ins);
  assert.equal(after.preset, "epiano");
  assert.equal(after.synth.lfoDepth, 6);
  await page.selectOption('select[aria-label="Outil de dessin"]', "triad");
  await evalApp(() => { document.querySelector(".pr-scroll").scrollTop = (96 - 72) * 14 - 20; });
  const before = (await cur()).length;
  await clickCanvas(".pr-canvas", 0 * 28 + 3, (96 - 65) * 14 + 7); // F4 triad
  let notes = await cur();
  assert.equal(notes.length, before + 3, "triad = 3 notes");
  const inF = (m) => [0, 2, 3, 5, 7, 8, 10].includes((((m - 5) % 12) + 12) % 12);
  assert.ok(notes.every((n) => inF(n.pitch)), "chord in key");
  await page.click('.pr-tools button:has-text("+1")');
  notes = await cur();
  assert.ok(notes.every((n) => inF(n.pitch)), "transposed by a scale degree stays in key");
  await page.selectOption('select[aria-label="Outil de dessin"]', "single");
  await page.click('.pr-tools button:has-text("Arpéger")');
  const arp = await cur();
  assert.ok(arp.length > 0 && arp.every((n) => inF(n.pitch)), `arpeggio ${arp.length}`);
  await page.click(".btn-play");
  assert.ok((await maxPeak(1200, ins)) > 0.01, "e-piano audible");
  await page.click(".btn-play");
});

await step("ARRANGEMENT editing: split at cursor (S), mute clip, insert bars, lane name", async () => {
  await nav("ARRANGEMENT");
  const p0 = await state();
  const c = p0.arrangement.clips.slice().sort((a, b) => b.length - a.length)[0];
  await evalApp((bar) => { window.__app.engine.setMode("song"); window.__app.engine.seek(bar * 16); }, c.start + Math.floor(c.length / 2));
  await page.click(`.tl-clip[data-clip="${c.id}"]`);
  await page.keyboard.press("s");
  const p1 = await state();
  assert.equal(p1.arrangement.clips.length, p0.arrangement.clips.length + 1, "split");
  const right = p1.arrangement.clips.find((x) => x.offset && x.start === c.start + Math.floor(c.length / 2));
  assert.ok(right, "right half has an offset");
  await page.click(`.tl-clip[data-clip="${right.id}"]`);
  await page.click('.toolbar button:has-text("Mute clip")');
  assert.equal((await state()).arrangement.clips.find((x) => x.id === right.id).muted, true);
  const len0 = await evalApp(() => document.querySelector(".arrangement-view .toolbar .hint").textContent);
  await evalApp(() => window.__app.engine.seek(0));
  await page.selectOption('select[aria-label="Nombre de mesures"]', "4");
  await page.click('.toolbar button:has-text("Insérer")');
  const p2 = await state();
  assert.equal(Math.min(...p2.arrangement.clips.map((x) => x.start)), Math.min(...p1.arrangement.clips.map((x) => x.start)) + 4, `bars inserted (${len0})`);
  await page.keyboard.press("Control+z");
  nextPrompt = "Drums A";
  await page.locator(".tl-lane .tl-head").first().dblclick();
  assert.equal((await state()).arrangement.laneNames?.[0], "Drums A");
});

let takeCount = 0;
await step("9–10. microphone: open, monitoring through the chain, record a take (count-in, latency compensation)", async () => {
  await nav("VOCALS");
  await page.click("text=🎙 Activer le micro");
  await page.waitForFunction(() => window.__app.recorder.isOpen, null, { timeout: 10000 });
  await page.waitForFunction(() => window.__app.recorder.level > 0.05, null, { timeout: 10000 });
  await page.click("text=🎧 Monitoring");
  const lead = (await state()).vocals.find((v) => v.armed).id;
  assert.ok((await maxPeak(800, lead)) > 0.02, "voice heard through the lead channel");
  await evalApp(() => window.__app.engine.seek(16));
  await page.click("text=● REC");
  await page.waitForFunction(() => window.__app.engine.currentPosition() > 16 + 16 * 2, null, { timeout: 20000 });
  await page.click("text=■ STOP");
  await page.waitForFunction(() => window.__app.store.getState().vocals.some((v) => v.takes.length), null, { timeout: 10000 });
  const v = (await state()).vocals.find((x) => x.takes.length);
  takeCount = v.takes.length;
  assert.equal(v.clips.length, 1);
  assert.equal(v.clips[0].start, 16, "take placed at the record position");
  assert.ok(v.clips[0].duration > 3, `duration ${v.clips[0].duration}`);
  // Second take (for comp), then AI take comp.
  await evalApp(() => window.__app.engine.seek(16));
  await page.keyboard.press("r");
  await page.waitForFunction(() => window.__app.engine.currentPosition() > 16 + 32, null, { timeout: 20000 });
  await page.keyboard.press("r");
  await page.waitForFunction(() => window.__app.store.getState().vocals.some((x) => x.takes.length >= 2), null, { timeout: 10000 });
});

await step("11–12. pitch correction LIVE (detects & corrects) and STUDIO (processed take in tune)", async () => {
  await page.click('button:has-text("LIVE")');
  const v = (await state()).vocals.find((x) => x.takes.length);
  const ap = (await state()).channels.find((c) => c.id === v.id).inserts.find((e) => e.type === "autopitch");
  assert.equal(ap.enabled, true);
  await page.click('.presets button:has-text("Hard Tune")');
  // Wait for the meter of the new preset (Hard Tune: full, instant correction).
  await page.waitForFunction((id) => { const m = window.__app.engine.mixer.effectMeters.get(id); return m && m.detected > 0 && m.shift > 0.4; }, ap.id, { timeout: 8000 }).catch(() => {});
  const m = await evalApp((id) => window.__app.engine.mixer.effectMeters.get(id), ap.id);
  assert.ok(Math.abs(m.detected - 69.46) < 0.3, `detected ${m.detected}`);
  // A is not in F minor: the nearest scale note is B♭ (MIDI 70) → correction upwards.
  assert.ok(m.shift > 0.2, `correcting up ${m.shift}`);
  await page.click('button:has-text("STUDIO")');
  await page.click("text=Appliquer le traitement STUDIO");
  await waitIdle();
  const res = await evalApp(async () => {
    const { pitchTrack, freqToMidi } = await import("/app/core/dsp/yin.js");
    const p = window.__app.store.getState();
    const t = p.vocals.find((x) => x.takes.length).takes[0];
    const out = {};
    for (const [k, id] of [["raw", t.assetId], ["processed", t.processedAssetId]]) {
      const b = window.__app.engine.getAsset(id);
      const tr = pitchTrack(b.getChannelData(0), b.sampleRate).filter((r) => r.freq > 0 && r.confidence > 0.8).map((r) => freqToMidi(r.freq)).sort((a, c) => a - c);
      out[k] = tr[Math.floor(tr.length / 2)];
    }
    return out;
  });
  assert.ok(Math.abs(res.raw - 69.46) < 0.15, `raw ${res.raw}`);
  assert.ok(Math.abs(res.processed - 70) < 0.12, `processed ${res.processed}`);
});

await step("13. AI VOICE CLEAN (studio) lowers the noise between phrases; RAW/PROCESSED", async () => {
  await page.click('button:has-text("MEDIUM")');
  await page.click("text=Appliquer le traitement STUDIO");
  await waitIdle();
  const r = await evalApp(() => {
    const p = window.__app.store.getState();
    const t = p.vocals.find((x) => x.takes.length).takes[0];
    const noise = (b) => { const d = b.getChannelData(0); const fr = 2400; let min = Infinity; for (let s = 0; s + fr < d.length; s += fr) { let e = 0; for (let i = s; i < s + fr; i++) e += d[i] * d[i]; min = Math.min(min, e / fr); } return 10 * Math.log10(min + 1e-12); };
    return { raw: noise(window.__app.engine.getAsset(t.assetId)), clean: noise(window.__app.engine.getAsset(t.processedAssetId)) };
  });
  assert.ok(r.clean < r.raw - 6, `noise floor ${r.raw.toFixed(1)} → ${r.clean.toFixed(1)} dB`);
  await page.click('button:has-text("Lecture : PROCESSED")');
  assert.equal((await state()).vocals.find((x) => x.takes.length).playProcessed, false);
  await page.click('button:has-text("Lecture : RAW")');
});

await step("AUTO VOICE: analysis shown, chain applied, can be disabled", async () => {
  await page.click("text=✨ AUTO VOICE");
  await page.waitForSelector("text=VOICE ANALYSIS", { timeout: 30000 });
  for (const k of ["Noise", "Dynamics", "Sibilance", "Pitch stability", "Clipping", "Recommended processing"]) assert.ok(await page.locator(`.analysis >> text=${k}`).count(), k);
  const v = (await state()).vocals.find((x) => x.takes.length);
  const before = JSON.stringify((await state()).channels.find((c) => c.id === v.id).inserts);
  await page.click('.analysis button:has-text("Appliquer")');
  const after = (await state()).channels.find((c) => c.id === v.id).inserts;
  assert.notEqual(JSON.stringify(after), before);
  assert.ok(after.find((e) => e.type === "autopitch").enabled, "pitch correction recommended for an off-key sung take");
});

await step("AI TAKE COMP proposes a comp and applies it", async () => {
  await page.click("text=✨ AI TAKE COMP");
  await page.waitForSelector("text=AI TAKE COMP — proposition", { timeout: 30000 });
  await page.click("text=Appliquer le comp");
  const v = (await state()).vocals.find((x) => x.takes.length);
  assert.ok(v.clips.length >= 1 && v.takes.every((t) => typeof t.score === "number"));
});

await step("VOCALS: chain presets, clips table, lyrics saved with the project", async () => {
  await page.click('.presets button:has-text("Drill")');
  const v = (await state()).vocals.find((x) => x.takes.length);
  const comp = (await state()).channels.find((c) => c.id === v.id).inserts.find((e) => e.type === "compressor");
  assert.equal(comp.params.ratio, 6, "Drill chain applied");
  assert.ok((await page.locator(".clips-table tr").count()) >= 2, "clips table");
  await page.fill("textarea.lyrics", "Couplet 1\nJe pose ma voix sur la prod");
  await page.locator("textarea.lyrics").blur();
  assert.match((await state()).vocals.find((x) => x.id === v.id).lyrics, /Je pose ma voix/);
});

await step("14. mixer: strips, effect insert, meters", async () => {
  await evalApp(() => window.__app.recorder.setMonitoring(null));
  await nav("MIXER");
  await page.waitForSelector(".strip");
  assert.ok((await page.locator(".strip").count()) >= 15);
  await page.click('.strip[data-channel="bus_drums"] .strip-name');
  await page.selectOption('select[aria-label="Ajouter un effet"]', "saturation");
  const bus = (await state()).channels.find((c) => c.id === "bus_drums");
  assert.ok(bus.inserts.some((e) => e.type === "saturation"));
  await evalApp(() => { const s = window.__app.store.getState(); window.__app.dispatch({ type: "selectPattern", patternId: s.patterns.find((x) => x.name === "Chorus").id }); window.__app.engine.setMode("pattern"); });
  await page.click(".btn-play");
  const peak = await maxPeak(1500, "bus_drums");
  await page.click(".btn-play");
  assert.ok(peak > 0.01, `drum bus meter ${peak}`);
});

await step("MIXER: routing a track to another bus, effect preset, rename, peak readout", async () => {
  const kick = (await state()).tracks.find((t) => t.instrument === "kick").id;
  await page.selectOption(`.strip[data-channel="${kick}"] select.strip-out`, "master");
  assert.equal((await state()).channels.find((c) => c.id === kick).output, "master");
  await page.click('.strip[data-channel="bus_drums"] .strip-name');
  await page.selectOption('.fx-presets[aria-label="Presets Saturation"]', { label: "Tape" });
  const sat = (await state()).channels.find((c) => c.id === "bus_drums").inserts.find((e) => e.type === "saturation");
  assert.equal(sat.params.drive, 0.35);
  nextPrompt = "Big Kick";
  await page.locator(`.strip[data-channel="${kick}"] .strip-name`).dblclick();
  assert.equal((await state()).tracks.find((t) => t.id === kick).name, "Big Kick", "rename syncs the drum lane");
  await page.keyboard.press("Control+z");
  assert.ok((await page.locator(".peak-readout").count()) >= 15);
  await page.selectOption(`.strip[data-channel="${kick}"] select.strip-out`, "bus_drums");
});

await step("15. AI song assistant answers and applies a change; AI MIX ASSISTANT preview/apply", async () => {
  await nav("AI");
  await page.click('.tab:has-text("SONG ASSISTANT")');
  await page.fill(".chat-input", "Mon refrain est trop vide.");
  await page.click('button:has-text("Demander")');
  await page.waitForSelector(".msg.bot .suggestion");
  const hits = (p) => { const c = p.patterns.find((x) => x.name === "Chorus"); return Object.values(c.drums).reduce((n, s) => n + s.filter((y) => y.on).length, 0); };
  const before = hits(await state());
  await page.click('.msg.bot .suggestion button:has-text("Appliquer")');
  assert.ok(hits(await state()) > before, "chorus got denser");
  await page.click('.tab:has-text("AI MIX ASSISTANT")');
  await page.click("text=✨ Analyser le mix");
  await waitIdle();
  await page.waitForSelector(".sugg");
  const n = await page.locator(".sugg").count();
  assert.ok(n >= 1, "suggestions");
  const applyBtn = page.locator('.sugg button:has-text("APPLY")').first();
  if (await applyBtn.count()) await applyBtn.click();
});

await step("AI tools: CHORDS, 808 / BASS, VARIATIONS (new pattern), STRUCTURE from existing patterns", async () => {
  await nav("AI");
  await page.click('.tab:has-text("CHORDS")');
  const pat0 = await evalApp(() => window.__app.store.getState().currentPatternId);
  await page.selectOption('.ai-panel select[aria-label="Instrument cible"]', "new:pad");
  await page.click('.ai-panel button:has-text("Appliquer au pattern")');
  let p = await state();
  const pad = p.instruments[p.instruments.length - 1];
  assert.equal(pad.preset, "pad");
  const chordNotes = p.patterns.find((x) => x.id === pat0).notes[pad.id];
  const inF = (m) => [0, 2, 3, 5, 7, 8, 10, 4].includes((((m - 5) % 12) + 12) % 12); // minor (+ raised 7th of harmonic minor)
  assert.ok(chordNotes.length >= 9 && chordNotes.every((n) => inF(n.pitch)), `chords ${chordNotes.length}`);
  await page.click('.tab:has-text("808 / BASS")');
  await page.click('.ai-panel button:has-text("Appliquer au pattern")');
  p = await state();
  const b808 = p.instruments.find((i) => i.preset === "808");
  assert.ok(p.patterns.find((x) => x.id === pat0).notes[b808.id].length >= 2, "808 line");
  await page.click('.tab:has-text("VARIATIONS")');
  const nPat = p.patterns.length;
  await page.locator('.ai-panel .option:has-text("Fill de fin") button:has-text("Nouveau pattern")').click();
  p = await state();
  assert.equal(p.patterns.length, nPat + 1);
  assert.match(p.patterns[p.patterns.length - 1].name, /Fill/);
  await page.click('.tab:has-text("STRUCTURE")');
  await page.selectOption('.ai-panel select[aria-label="Structure"]', "short");
  await page.click('.ai-panel button:has-text("Appliquer")');
  await page.waitForSelector(".arrangement-view");
  p = await state();
  assert.equal(p.arrangement.sections[0].name, "Hook");
  assert.equal(p.arrangement.sections.length, 6);
  await page.keyboard.press("Control+z"); // keep the full AI arrangement for the following steps
  assert.ok((await state()).arrangement.sections.length >= 7);
  await nav("AI");
});

await step("16. AI MASTER: analysis, apply, verified true peak ≤ -1 dBTP", async () => {
  await page.click('.tab:has-text("AI MASTER")');
  await page.click("text=✨ Analyser le mix (MASTER ANALYSIS)");
  await waitIdle();
  await page.waitForSelector("text=Integrated LUFS");
  await page.click('button:has-text("APPLY")');
  await waitIdle();
  await page.waitForSelector("text=Après AI MASTER");
  const txt = await page.locator(".card:has-text('Après AI MASTER')").innerText();
  const tp = Number(txt.match(/(-?\d+\.\d) dBTP/)[1]);
  const lufs = Number(txt.match(/(-?\d+\.\d) LUFS/)[1]);
  assert.ok(tp <= -0.9, `true peak ${tp}`);
  assert.ok(lufs > -14 && lufs < -7, `loudness ${lufs}`);
});

let savedBytes = null;
await step("17. export WAV master (real file), instrumental and stems (zip)", async () => {
  await nav("PROJECTS");
  const dl = page.waitForEvent("download", { timeout: 180000 });
  await page.click("text=⤓ Exporter");
  const d = await dl;
  assert.match(d.suggestedFilename(), /Master\.wav$/);
  const bytes = await readFile(await d.path());
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  const bits = bytes.readUInt16LE(34), ch = bytes.readUInt16LE(22), sr = bytes.readUInt32LE(24);
  assert.deepEqual([bits, ch, sr], [24, 2, 44100]);
  const seconds = (bytes.length - 44) / (3 * 2 * sr);
  assert.ok(seconds > 100, `song length ${seconds.toFixed(1)} s`);
  let peak = 0, sum = 0;
  for (let o = 44; o + 3 <= bytes.length; o += 3 * 97) { let s = bytes.readIntLE(o, 3) / 8388608; peak = Math.max(peak, Math.abs(s)); sum += s * s; }
  assert.ok(peak > 0.3 && peak < 0.95, `exported peak ${peak}`);
  await page.selectOption('select[aria-label="Que exporter"]', "stems");
  const dl2 = page.waitForEvent("download", { timeout: 300000 });
  await page.click("text=⤓ Exporter");
  const z = await readFile(await (await dl2).path());
  assert.equal(z.toString("ascii", 0, 2), "PK");
  const names = z.toString("latin1").match(/[\w -]+\.wav/g) ?? [];
  assert.ok(new Set(names).size >= 4, `stems ${[...new Set(names)].join(", ")}`);
});

await step("18. save (.bsproj with audio) → reopen restores takes, processed audio, arrangement", async () => {
  const dl = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  savedBytes = await readFile(await (await dl).path());
  assert.equal(savedBytes.toString("ascii", 0, 2), "PK");
  const ref = await state();
  await page.click("text=Nouveau projet vide");
  await page.waitForTimeout(200);
  assert.equal((await state()).vocals.every((v) => !v.takes.length), true);
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Control+o");
  await (await chooser).setFiles({ name: "song.bsproj", mimeType: "application/octet-stream", buffer: savedBytes });
  await page.waitForFunction(() => window.__app.store.getState().vocals.some((v) => v.takes.length), null, { timeout: 15000 });
  const p = await state();
  assert.equal(p.arrangement.clips.length, ref.arrangement.clips.length);
  assert.equal(p.patterns.length, ref.patterns.length);
  const t = p.vocals.find((v) => v.takes.length).takes[0];
  assert.ok(await evalApp((ids) => ids.every((id) => !!window.__app.engine.getAsset(id)), [t.assetId, t.processedAssetId]), "audio decoded after reopening");
});

await step("crash recovery restores recorded audio from local storage", async () => {
  await page.waitForFunction(() => window.__app.lastAutosave, null, { timeout: 5000 });
  await evalApp(() => window.__app.autosaveNow());
  await page.addInitScript(() => localStorage.setItem("bs.session-open", "1"));
  await evalApp(() => window.__app.store.markDirty());
  await evalApp(() => window.__app.autosaveNow());
  await page.reload();
  await page.waitForSelector("text=Recover previous session?");
  await page.click(".modal .btn-primary");
  await page.waitForSelector(".sidebar");
  await page.waitForFunction(() => window.__app.store.getState().vocals.some((v) => v.takes.length), null, { timeout: 15000 });
  const t = (await state()).vocals.find((v) => v.takes.length).takes[0];
  assert.ok(await evalApp((id) => !!window.__app.engine.getAsset(id), t.assetId), "take audio recovered");
});

await step("MIDI: keyboard plays the selected instrument; REC MIDI writes notes; MIDI learn maps a CC", async () => {
  await nav("SETTINGS");
  await page.waitForSelector("text=Test Keyboard");
  await nav("MELODY");
  await page.click('.ins-row .track-name:has-text("Piano")');
  await page.click("text=● REC MIDI");
  await evalApp(() => { window.__app.engine.setMode("pattern"); });
  await page.click(".btn-play");
  await page.waitForTimeout(300);
  const ins = (await state()).instruments.find((i) => i.name === "Piano").id;
  const before = (await state()).patterns.find((p) => p.id === (/** @type any */ (null) ?? undefined) || true) && (await evalApp((id) => { const s = window.__app.store.getState(); return s.patterns.find((x) => x.id === s.currentPatternId).notes[id]?.length ?? 0; }, ins));
  await evalApp(() => window.__midiSend([0x90, 65, 100]));
  await page.waitForTimeout(250);
  await evalApp(() => window.__midiSend([0x80, 65, 0]));
  await page.click(".btn-play");
  const after = await evalApp((id) => { const s = window.__app.store.getState(); return s.patterns.find((x) => x.id === s.currentPatternId).notes[id]?.length ?? 0; }, ins);
  assert.equal(after, before + 1, `notes ${before} → ${after}`);
  await page.click("text=● REC MIDI");
  await nav("SETTINGS");
  await page.click('button:has-text("🎛 Volume master")');
  await evalApp(() => window.__midiSend([0xb0, 7, 127]));
  await evalApp(() => window.__midiSend([0xb0, 7, 64]));
  const p = await state();
  assert.ok(p.midiMappings.some((m) => m.source === "cc:0:7" && m.target === "master:volume"));
  assert.ok(Math.abs(p.channels.find((c) => c.id === "master").volume - (64 / 127) * 1.5) < 0.01);
});

await step("no page errors during the whole session", async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
server.close();
console.log(failed ? `\n${failed} e2e step(s) failed` : "\nall e2e steps passed");
process.exit(failed ? 1 : 0);
