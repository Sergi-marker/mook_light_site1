// Smoke test of the real desktop app (Electron), driven by Playwright:
// window opens without errors, preload API, AudioContext + worklets running, audible playback,
// microphone through Electron's permission handler (simulated mic = a slightly out-of-tune voice),
// recording a take, STUDIO vocal processing (pitch correction + AI VOICE CLEAN),
// MP3 export through the UI (LAME), and the online assistant's IPC path (Anthropic SDK loads).
// Usage: npm run test:electron   (on Linux without a display: xvfb-run -a npm run test:electron)
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { _electron as electron } from "playwright";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tmp = await mkdtemp(join(tmpdir(), "bs-electron-"));
// Chromium refuses to run as root with its sandbox (containers / CI); never needed on Windows.
// A fresh profile: no autosave from a previous run (crash-recovery prompt), no saved settings.
// Simulated microphone: a harmonic "voice" at 452 Hz (A4 +46 cents) in phrases, with light hiss.
const SR = 48000;
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
const voice = new Int16Array(SR * 12).map((_, i) => {
  const t = i / SR;
  let v = 0;
  if (Math.floor(t / 0.9) % 3 !== 2) for (let k = 1; k <= 7; k++) v += Math.sin(2 * Math.PI * 452 * k * t) / k;
  return Math.round(Math.max(-1, Math.min(1, 0.22 * v + 0.004 * rnd())) * 32767);
});
const wavHeader = Buffer.alloc(44);
wavHeader.write("RIFF", 0); wavHeader.writeUInt32LE(36 + voice.length * 2, 4); wavHeader.write("WAVEfmt ", 8);
wavHeader.writeUInt32LE(16, 16); wavHeader.writeUInt16LE(1, 20); wavHeader.writeUInt16LE(1, 22);
wavHeader.writeUInt32LE(SR, 24); wavHeader.writeUInt32LE(SR * 2, 28); wavHeader.writeUInt16LE(2, 32); wavHeader.writeUInt16LE(16, 34);
wavHeader.write("data", 36); wavHeader.writeUInt32LE(voice.length * 2, 40);
const voiceFile = join(tmp, "voice.wav");
await writeFile(voiceFile, Buffer.concat([wavHeader, Buffer.from(voice.buffer)]));
// Chromium switches: fake capture device fed by the file. No permission switch: the app's own
// permission handler (electron/main.cjs) must grant the microphone.
const args = ["--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${voiceFile}`, `--user-data-dir=${join(tmp, "profile")}`, root];
if (process.platform === "linux" && process.getuid?.() === 0) args.unshift("--no-sandbox");

const app = await electron.launch({ args, cwd: root, env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" } });
// Downloads (exports) are saved to a temp folder instead of opening a dialog.
await app.evaluate(({ session }, dir) => {
  globalThis.__downloads = [];
  session.defaultSession.on("will-download", (_e, item) => {
    item.setSavePath(`${dir}/${item.getFilename()}`);
    item.once("done", (_ev, state) => globalThis.__downloads.push({ name: item.getFilename(), state }));
  });
}, tmp);
const nextDownload = async (timeout = 180000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const d = await app.evaluate(() => globalThis.__downloads.shift());
    if (d) return d;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("no download");
};

const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log(`ok - ${name}`); }
  catch (e) { failed++; console.log(`not ok - ${name}\n  ${String(e?.stack ?? e).split("\n").slice(0, 4).join("\n  ")}`); }
}
const evalApp = (fn, arg) => page.evaluate(fn, arg);
const maxPeak = (ms) => page.evaluate(async (ms) => {
  let peak = 0; const end = performance.now() + ms; const e = window.__app.engine;
  while (performance.now() < end) { peak = Math.max(peak, e.getMasterPeak()); await new Promise((r) => setTimeout(r, 10)); }
  return peak;
}, ms);

await step("window opens on app://, 9 modules, no errors", async () => {
  await page.waitForSelector(".sidebar", { timeout: 30000 });
  assert.match(page.url(), /^app:\/\/studio\//);
  assert.equal(await page.locator(".nav-item").count(), 9);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), "Beatmaker Studio");
  assert.deepEqual(errors, []);
});

await step("preload API: desktop bridge + process metrics", async () => {
  const m = await evalApp(async () => ({ keys: Object.keys(window.beatmakerDesktop ?? {}), metrics: await window.beatmakerDesktop.metrics(), node: typeof window.require }));
  assert.deepEqual(m.keys.sort(), ["askClaude", "chatClaude", "metrics"]);
  assert.ok(m.metrics.memoryMB > 10, `memory ${m.metrics.memoryMB}`);
  assert.equal(m.node, "undefined", "no Node access in the page");
});

await step("audio: AudioContext running, worklets loaded, drums audible", async () => {
  await page.click('[data-template="empty"]');
  await page.waitForSelector(".beat-view");
  await page.click("text=✨ Générer drums");
  await page.click(".btn-play");
  const peak = await maxPeak(1500);
  await page.click(".btn-play");
  const a = await evalApp(() => { const e = window.__app.engine; return { state: e.ctx.state, sr: e.ctx.sampleRate, worklet: e.workletReady, err: e.workletError }; });
  console.log(`  # AudioContext ${a.state} @ ${a.sr} Hz, worklets ${a.worklet ? "ready" : "FAILED " + a.err}, peak ${peak.toFixed(3)}`);
  assert.equal(a.state, "running");
  assert.equal(a.worklet, true, a.err);
  assert.ok(peak > 0.05, `drums audible (peak ${peak})`);
});

await step("real instruments: recorded samples load through app:// and play in tune (grand piano, nylon guitar)", async () => {
  const r = await evalApp(async () => {
    const { renderProject } = await import("/app/audio/render.js");
    const { createEmptyProject } = await import("/app/core/project.js");
    const { reduce } = await import("/app/core/reducer.js");
    const { pitchTrack, freqToMidi } = await import("/app/core/dsp/yin.js");
    const out = {};
    for (const sample of ["grand-piano", "guitar-nylon"]) {
      let p = createEmptyProject("t");
      p = reduce(p, { type: "addInstrument", preset: "sampler" });
      const ins = p.instruments[p.instruments.length - 1];
      p = reduce(p, { type: "updateInstrument", trackId: ins.id, patch: { sample } });
      p = reduce(p, { type: "addNotes", trackId: ins.id, notes: [{ pitch: 57, start: 0, length: 8, velocity: 100 }] });
      const buf = await renderProject(p, { samples: new Map(), assets: new Map() }, { mode: "pattern", tail: 0.3 });
      const d = buf.getChannelData(0);
      let peak = 0;
      for (const x of d) peak = Math.max(peak, Math.abs(x));
      const tr = pitchTrack(d.subarray(4410, 44100), buf.sampleRate).filter((x) => x.freq > 0 && x.confidence > 0.85).map((x) => freqToMidi(x.freq)).sort((a, b) => a - b);
      out[sample] = { peak, midi: tr[tr.length >> 1] };
    }
    return out;
  });
  for (const [k, v] of Object.entries(r)) {
    console.log(`  # ${k}: peak ${v.peak.toFixed(3)}, A3 joué → MIDI ${v.midi?.toFixed(2)}`);
    assert.ok(v.peak > 0.02, `${k} silent`);
    assert.ok(Math.abs(v.midi - 57) < 0.4, `${k} pitch ${v.midi}`);
  }
});

await step("microphone + recording: permission granted by the app, monitoring, take recorded at the cursor", async () => {
  await evalApp(() => window.__app.dispatch({ type: "setKey", key: { root: 5, scale: "minor" } }));
  await page.click('.nav-item:has-text("VOCALS")');
  await page.click("text=🎙 Activer le micro");
  await page.waitForFunction(() => window.__app.recorder.isOpen, null, { timeout: 15000 });
  await page.waitForFunction(() => window.__app.recorder.level > 0.05, null, { timeout: 15000 });
  await page.click("text=🎧 Monitoring");
  await evalApp(() => window.__app.engine.seek(16));
  await page.click("text=● REC");
  await page.waitForFunction(() => window.__app.engine.currentPosition() > 16 + 16 * 2, null, { timeout: 30000 });
  await page.click("text=■ STOP");
  await page.waitForFunction(() => window.__app.store.getState().vocals.some((v) => v.takes.length), null, { timeout: 15000 });
  const v = await evalApp(() => window.__app.store.getState().vocals.find((x) => x.takes.length));
  console.log(`  # take: ${v.clips[0].duration.toFixed(2)} s at step ${v.clips[0].start}, monitoring ≈ ${(await evalApp(() => window.__app.recorder.monitoringLatencyMs())).toFixed(0)} ms`);
  assert.equal(v.clips[0].start, 16);
  assert.ok(v.clips[0].duration > 3, `duration ${v.clips[0].duration}`);
  await evalApp(() => window.__app.recorder.setMonitoring(null));
  // Automatic cleaning of the take (setting on by default), raw take kept.
  await page.waitForFunction(() => window.__app.store.getState().vocals.some((x) => x.takes.some((t) => t.processedAssetId)), null, { timeout: 120000 });
  const auto = await evalApp(() => { const x = window.__app.store.getState().vocals.find((y) => y.takes.length); return { w: x.takes[0].processedWith, play: x.playProcessed, ch: window.__app.recorder.channelState }; });
  console.log(`  # auto-clean: ${auto.w} · input ${auto.ch.count} ch, used ${auto.ch.used}`);
  assert.match(auto.w, /"clean":"low"/);
  assert.equal(auto.play, true);
});

await step("vocal processing: STUDIO pitch correction puts the voice in key, AI VOICE CLEAN applied", async () => {
  await page.click('button:has-text("STUDIO")');
  await page.click('.presets button:has-text("Hard Tune")'); // 100 % correction
  await page.click('.row-inline button:has-text("MEDIUM")');
  await page.click("text=Appliquer le traitement STUDIO");
  await page.waitForFunction(() => window.__app.store.getState().vocals.some((x) => x.takes.some((t) => /"clean":"medium"/.test(t.processedWith ?? ""))), null, { timeout: 120000 });
  await page.waitForFunction(() => !window.__app.busy, null, { timeout: 120000 });
  const res = await evalApp(async () => {
    const { pitchTrack, freqToMidi } = await import("/app/core/dsp/yin.js");
    const t = window.__app.store.getState().vocals.find((x) => x.takes.length).takes[0];
    const out = { processedWith: t.processedWith };
    for (const [k, id] of [["raw", t.assetId], ["processed", t.processedAssetId]]) {
      const b = window.__app.engine.getAsset(id);
      const tr = pitchTrack(b.getChannelData(0), b.sampleRate).filter((r) => r.freq > 0 && r.confidence > 0.8).map((r) => freqToMidi(r.freq)).sort((a, c) => a - c);
      out[k] = tr[Math.floor(tr.length / 2)];
    }
    return out;
  });
  console.log(`  # raw voice MIDI ${res.raw.toFixed(2)} → processed ${res.processed.toFixed(2)} (F minor: nearest note B♭ = 70) · ${res.processedWith}`);
  assert.ok(Math.abs(res.raw - 69.46) < 0.2, `raw ${res.raw}`);
  assert.ok(Math.abs(res.processed - 70) < 0.15, `processed ${res.processed}`);
  assert.match(res.processedWith, /"clean":"medium"/);
});

await step("doubles & harmonies from the recorded take: new tracks, harmony a diatonic third above (measured)", async () => {
  const v = await evalApp(() => window.__app.store.getState().vocals.find((x) => x.takes.length));
  const made = await evalApp((id) => window.__app.makeVoiceLayers(id, ["double", "third-up"]), v.id);
  assert.equal(made, 2);
  const res = await evalApp(async (id) => {
    const { pitchTrack, freqToMidi } = await import("/app/core/dsp/yin.js");
    const p = window.__app.store.getState();
    const lead = p.vocals.find((x) => x.id === id);
    const out = {};
    for (const name of ["Double", "Tierce"]) {
      const t = p.vocals.find((x) => x.name.startsWith(lead.name) && x.name.includes(name));
      const b = window.__app.engine.getAsset(t.takes[0].assetId);
      const tr = pitchTrack(b.getChannelData(0), b.sampleRate).filter((r) => r.freq > 0 && r.confidence > 0.8).map((r) => freqToMidi(r.freq)).sort((a, c) => a - c);
      out[name] = { midi: tr[tr.length >> 1], clips: t.clips.length, leadClips: lead.clips.length };
    }
    return out;
  }, v.id);
  console.log(`  # double MIDI ${res.Double.midi.toFixed(2)}, harmony (third above, F minor) MIDI ${res.Tierce.midi.toFixed(2)}`);
  assert.equal(res.Double.clips, res.Double.leadClips);
  // Processed lead sits on B♭ (70) in F minor → diatonic third above = D♭ (73).
  assert.ok(Math.abs(res.Tierce.midi - 73) < 0.3, `harmony ${res.Tierce.midi}`);
});

await step("hum → melody through the real mic path (simulated voice): notes written in the key", async () => {
  const n = await evalApp(async () => {
    const { humToNotes } = await import("/app/core/dsp/transcribe.js");
    const { inScale } = await import("/app/core/music.js");
    const app = window.__app;
    const p = app.store.getState();
    const rec = await app.captureOverClick(1);
    const notes = humToNotes(rec.data, rec.sampleRate, { bpm: p.bpm, key: p.key, countIn: rec.countIn, steps: 16 });
    return { count: notes.length, inKey: notes.every((x) => inScale(x.pitch, p.key)), pitches: [...new Set(notes.map((x) => x.pitch))] };
  });
  console.log(`  # ${n.count} note(s) from the simulated voice, pitches ${n.pitches.join(", ")}`);
  assert.ok(n.count >= 1 && n.inKey, JSON.stringify(n));
});

await step("mic test: silence + voice capture, verdict and advice, settings applied to the vocal chain", async () => {
  await page.click("text=🎚 Test du micro");
  await page.waitForSelector(".mic-test.running", { timeout: 5000 });
  await page.waitForSelector(".mic-test:not(.running) h3", { timeout: 30000 });
  const title = await page.textContent(".mic-test h3");
  const advice = await page.$$eval(".mic-test li", (els) => els.map((e) => e.textContent));
  console.log(`  # ${title} · ${advice.length} conseil(s) : ${advice[0]}`);
  assert.match(title, /Test du micro — (Excellent|Bon|Bruyant|Très bruyant)/);
  assert.ok(advice.length >= 2);
  await page.click(".mic-test >> text=Appliquer les réglages");
  await page.waitForFunction(() => !!window.__app.settings.micCheck, null, { timeout: 5000 });
  const mc = await evalApp(() => ({ s: window.__app.settings.micCheck, sr: window.__app.engine.context.sampleRate }));
  assert.equal(mc.s.sampleRate, mc.sr);
  assert.equal(mc.s.profile.length, 1025);
});

await step("export MP3 192 kbps through the UI (LAME), decodable file", async () => {
  await page.click('.nav-item:has-text("PROJECTS")');
  await page.waitForFunction(() => !document.querySelector('select[aria-label="Format"] option[value="mp3"]')?.disabled, null, { timeout: 10000 });
  await page.selectOption('select[aria-label="Format"]', "mp3");
  await page.selectOption('select[aria-label="Débit MP3"]', "192");
  await page.click("text=⤓ Exporter");
  const { name, state } = await nextDownload();
  assert.equal(state, "completed");
  assert.match(name, /Master\.mp3$/);
  const bytes = await readFile(join(tmp, name));
  const sync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  assert.ok(sync || bytes.toString("ascii", 0, 3) === "ID3", "MPEG frame header");
  assert.ok(bytes.length > 20000, `size ${bytes.length}`);
  try {
    const info = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,sample_rate,channels,bit_rate:format=duration", "-of", "compact", join(tmp, name)], { encoding: "utf8" });
    console.log("  # " + info.trim().replace(/\n/g, " | "));
    assert.match(info, /codec_name=mp3/);
    execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", join(tmp, name), "-f", "null", "-"]);
  } catch (e) {
    if (e.code !== "ENOENT") throw e; // ffprobe not installed: header check only
  }
});

await step("online assistant IPC: Anthropic SDK loads in the main process", async () => {
  const r = await evalApp(() => window.beatmakerDesktop.askClaude({ apiKey: "sk-ant-invalid", system: "test", messages: [{ role: "user", content: "hi" }] }));
  console.log(`  # askClaude with a fake key → ${JSON.stringify(r)}`);
  assert.ok(r.error, "an error is reported for a fake key");
  assert.doesNotMatch(r.error, /not installed/);
});

await step("producer conversation IPC (tools + web search): request reaches the API, clear error with a fake key", async () => {
  const r = await evalApp(async () => {
    const { PRODUCER_TOOLS, producerSystemPrompt, describeProject } = await import("/app/core/ai/producerTools.js");
    return window.beatmakerDesktop.chatClaude({ apiKey: "sk-ant-invalid", model: "claude-opus-5-5", system: producerSystemPrompt(), tools: PRODUCER_TOOLS, webSearch: true,
      messages: [{ role: "user", content: [{ type: "text", text: `[État du projet]\n${describeProject(window.__app.store.getState())}\n\n[Message de l'utilisateur]\nsalut` }] }] });
  });
  console.log(`  # chatClaude with a fake key → ${JSON.stringify(r)}`);
  assert.ok(r.error && !r.content, "error reported, no content");
  assert.match(r.error, /clé API invalide|connexion/);
});

await step("transitions: FX track on a generated song (riser grows into the chorus, impact on it, drums cut the beat before)", async () => {
  const r = await evalApp(async () => {
    const { generateSong } = await import("/app/core/ai/beat.js");
    const { parseBeatPrompt } = await import("/app/core/ai/prompt.js");
    const { renderProject } = await import("/app/audio/render.js");
    const app = window.__app;
    const p0 = app.store.getState();
    app.store.dispatch({ type: "patchProject", patch: generateSong(p0, parseBeatPrompt("trap", "trap", p0.key.root), 3).patch });
    await app.addTransitions(true);
    const again = await app.addTransitions(true); // a second run replaces, never stacks
    const p = app.store.getState();
    const fx = p.vocals.filter((v) => v.role === "fx");
    const c = p.arrangement.sections.find((s) => /chorus|hook/i.test(s.name) && s.start > 0);
    const all = [...p.tracks, ...p.instruments, ...p.vocals].map((t) => t.id);
    const rms = (d, a, b) => { let e = 0; for (let i = a; i < b; i++) e += d[i] * d[i]; return Math.sqrt(e / Math.max(1, b - a)); };
    const range = [c.start - 2, c.start + 1];
    const fxBuf = await renderProject(p, app.media(), { mode: "song", range, tail: 0, muted: new Set(all.filter((id) => id !== fx[0].id)) });
    const drums = await renderProject(p, app.media(), { mode: "song", range, tail: 0, muted: new Set(all.filter((id) => !p.tracks.some((t) => t.id === id))) });
    const sr = fxBuf.sampleRate, bar = (240 / p.bpm) * sr, beat = bar / 4, at = 2 * bar; // chorus downbeat in the render
    const f = fxBuf.getChannelData(0), d = drums.getChannelData(0);
    return {
      fxTracks: fx.length, clips: fx[0].clips.length, placed: again.placed.length, drops: again.drops,
      dropLanes: p.automation.filter((l) => l.id.startsWith("drop_")).length,
      riserEarly: rms(f, Math.round(at - 1.5 * bar), Math.round(at - 1.25 * bar)), riserLate: rms(f, Math.round(at - 0.25 * beat), Math.round(at - 0.05 * beat)),
      impact: rms(f, Math.round(at), Math.round(at + 0.1 * sr)),
      drumsBefore: rms(d, Math.round(at - 2 * beat), Math.round(at - 1.05 * beat)), drumsCut: rms(d, Math.round(at - 0.8 * beat), Math.round(at - 0.1 * beat)),
    };
  });
  console.log(`  # ${r.placed} effets, riser ${r.riserEarly.toFixed(4)} → ${r.riserLate.toFixed(4)}, impact ${r.impact.toFixed(3)}, batterie ${r.drumsBefore.toFixed(3)} → coupure ${r.drumsCut.toFixed(4)}`);
  assert.equal(r.fxTracks, 1);
  assert.equal(r.clips, r.placed);
  assert.ok(r.drops >= 2 && r.dropLanes >= 1 && r.dropLanes <= 3, `drop lanes ${r.dropLanes}`);
  assert.ok(r.riserLate > r.riserEarly * 3, "riser grows into the chorus");
  assert.ok(r.impact > 0.05, "impact audible");
  assert.ok(r.drumsBefore > 0.01 && r.drumsCut < r.drumsBefore * 0.1, "drums cut on the last beat");
});

await step("sample flip: a 92 BPM loop in A minor → 140 BPM F minor project, chops on lanes, flip pattern audible", async () => {
  const r = await evalApp(async () => {
    const { encodeWav } = await import("/app/core/io/wav.js");
    const { estimateKey, estimateTempo } = await import("/app/core/dsp/sampleFlip.js");
    const { renderProject } = await import("/app/audio/render.js");
    const { currentPattern } = await import("/app/core/project.js");
    const app = window.__app;
    // Two-bar loop at 92 BPM: kick / snare / hats + an A minor chord.
    const SR = 44100, step = (60 / 92 / 4) * SR, x = new Float32Array(Math.round(32 * step));
    let s = 3; const noise = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
    const hit = (at, kind) => { const a = Math.round(at * step); for (let i = 0; i < SR * 0.25 && a + i < x.length; i++) { const t = i / SR;
      x[a + i] += kind === "k" ? Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-t / 0.03)) * t) * Math.exp(-t / 0.12) * 0.9 : kind === "s" ? noise() * Math.exp(-t / 0.06) * 0.6 : noise() * Math.exp(-t / 0.015) * 0.25; } };
    for (let b = 0; b < 2; b++) { hit(b * 16, "k"); hit(b * 16 + 10, "k"); hit(b * 16 + 4, "s"); hit(b * 16 + 12, "s"); for (let h = 0; h < 16; h += 2) hit(b * 16 + h, "h"); }
    for (let i = 0; i < x.length; i++) for (const m of [57, 60, 64]) x[i] += 0.08 * Math.sin(2 * Math.PI * 440 * 2 ** ((m - 69) / 12) * i / SR);
    const file = new File([encodeWav({ sampleRate: SR, channels: [x] }, 16)], "boucle-test.wav", { type: "audio/wav" });
    app.dispatch({ type: "batch", actions: [{ type: "setBpm", bpm: 140 }, { type: "setKey", key: { root: 5, scale: "minor" } }] });
    const res = await app.sampleFlip(file);
    const p = app.store.getState();
    const chops = app.chopTracks();
    const buf = app.engine.seq.samples.get(chops[0].sampleId);
    const d = buf.getChannelData(0);
    const pat = currentPattern(p);
    const flipSteps = chops.map((t) => pat.drums[t.id].map((st) => (st.on ? 1 : 0)).join("")).join("|");
    app.reflip("flip");
    const reflipped = chops.map((t) => app.store.getState().patterns.find((q) => q.id === pat.id).drums[t.id].map((st) => (st.on ? 1 : 0)).join("")).join("|");
    app.reflip("original");
    const p2 = app.store.getState();
    const others = [...p2.tracks.filter((t) => !t.chop), ...p2.instruments, ...p2.vocals].map((t) => t.id);
    const out = await renderProject(p2, app.media(), { mode: "pattern", loops: 1, tail: 0, muted: new Set(others) });
    let peak = 0; for (const v of out.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
    return { res, chops: chops.length, seconds: buf.duration, tempo: estimateTempo(d, buf.sampleRate), key: estimateKey(d, buf.sampleRate)?.key,
      changed: flipSteps !== reflipped, onSteps: flipSteps.split("").filter((c) => c === "1").length, peak };
  });
  console.log(`  # source ${r.res.sourceBpm} BPM / ${r.res.bars} mesures, décalage ${r.res.shift} demi-tons → ${r.seconds.toFixed(3)} s (${r.tempo.bpm} BPM), tonalité ${JSON.stringify(r.key)}, ${r.chops} chops, ${r.onSteps} coups, pic ${r.peak.toFixed(3)}`);
  assert.ok(Math.abs(r.res.sourceBpm - 92) < 1 && r.res.bars === 2);
  assert.equal(r.res.shift, -4, "A minor → F minor");
  assert.ok(Math.abs(r.seconds - (2 * 240) / 140) < 0.01, "exactly two bars at 140 BPM");
  assert.deepEqual(r.key, { root: 5, scale: "minor" }, "the flipped loop is in F minor");
  assert.ok(r.chops >= 4 && r.chops <= 8);
  assert.ok(r.onSteps >= 4 && r.changed, "flip written, « nouveau flip » changes it");
  assert.ok(r.peak > 0.05, "chops audible");
});

await step("writing help: word list loads through app://, flow grid while typing, rhymes inserted at the cursor", async () => {
  await page.click('.nav-item:has-text("VOCALS")');
  const area = page.locator("textarea.lyrics").first();
  await area.waitFor({ timeout: 10000 });
  await area.fill("J'suis dans le bloc avec mes frères\nOn fait du sale pour la lumière\nIls parlent beaucoup trop mais ils ne savent pas vraiment ce qu'on a traversé dans la vie de tous les jours");
  await page.waitForFunction(() => /Dictionnaire : [\d\s\u202f]+ mots/.test(document.querySelector(".writing")?.textContent ?? ""), null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll(".flow-row").length === 3, null, { timeout: 5000 });
  const rows = await page.$$eval(".flow-row", (rs) => rs.map((r) => ({ scheme: r.querySelector(".scheme").textContent, density: r.querySelector(".density").textContent, on: r.querySelectorAll(".cell.on").length })));
  await page.fill(".rhyme-target", "frérot");
  await page.click('.writing button:has-text("Rimes")');
  await page.waitForSelector(".rhyme-results .chip");
  const chips = await page.$$eval(".rhyme-results .chip", (cs) => cs.map((c) => c.textContent));
  await area.click();
  await page.keyboard.press("Control+End");
  await page.click(`.rhyme-results .chip:has-text("${chips[0]}")`);
  const saved = await evalApp(() => window.__app.store.getState().vocals.find((v) => v.lyrics)?.lyrics ?? "");
  console.log(`  # lignes ${rows.map((r) => `${r.scheme} ${r.density}`).join(" | ")} · rimes « frérot » : ${chips.slice(0, 6).join(", ")}`);
  assert.deepEqual(rows.map((r) => r.scheme), ["A", "A", "·"]);
  assert.match(rows[2].density, /trop dense/);
  assert.ok(rows[0].on >= 8);
  assert.ok(chips.includes("numéro") || chips.includes("métro"), chips.join(","));
  assert.ok(saved.trimEnd().endsWith(chips[0]), "rhyme inserted and saved with the project");
});

await step("hybrid instruments: the synth layer is heard (piano + pad, bass + sub), MELODY button fills the library", async () => {
  const r = await evalApp(async () => {
    const { designHybrid, hybridPatch } = await import("/app/core/ai/hybrid.js");
    const { renderProject } = await import("/app/audio/render.js");
    const { createEmptyProject } = await import("/app/core/project.js");
    const { reduce } = await import("/app/core/reducer.js");
    const out = {};
    for (const [role, pitch] of [["keys", 57], ["bass", 40]]) {
      let p = createEmptyProject("h");
      p = reduce(p, { type: "addInstrument", preset: "sampler" });
      const ins = p.instruments[p.instruments.length - 1];
      p = reduce(p, { type: "updateInstrument", trackId: ins.id, patch: hybridPatch(designHybrid(11, role)) });
      p = reduce(p, { type: "addNotes", trackId: ins.id, notes: [{ pitch, start: 0, length: 12, velocity: 100 }] });
      const media = { samples: new Map(), assets: new Map() };
      const measure = async (proj) => {
        const b = await renderProject(proj, media, { mode: "pattern", tail: 0.2 });
        const d = b.getChannelData(0), sr = b.sampleRate;
        // Late part of the note (pad swell / sustain) and low end (< 70 Hz) via a one-pole low-pass.
        let late = 0, low = 0, lp = 0;
        const a0 = Math.round(sr * 0.8), a1 = Math.round(sr * 1.4);
        for (let i = 0; i < d.length; i++) { lp += 0.01 * (d[i] - lp); if (i >= a0 && i < a1) { late += d[i] * d[i]; low += lp * lp; } }
        return { late: Math.sqrt(late / (a1 - a0)), low: Math.sqrt(low / (a1 - a0)) };
      };
      const withLayer = await measure(p);
      const without = await measure(reduce(p, { type: "updateInstrument", trackId: ins.id, patch: { layer: null } }));
      out[role] = { withLayer, without, name: p.instruments.find((i) => i.id === ins.id).hybrid };
    }
    return out;
  });
  console.log(`  # piano + nappe « ${r.keys.name} » : fin de note ${r.keys.without.late.toFixed(4)} → ${r.keys.withLayer.late.toFixed(4)} · basse + sub « ${r.bass.name} » : graves ${r.bass.without.low.toFixed(4)} → ${r.bass.withLayer.low.toFixed(4)}`);
  assert.ok(r.keys.withLayer.late > r.keys.without.late * 1.15, "the pad layer sustains the piano");
  assert.ok(r.bass.withLayer.low > r.bass.without.low * 1.3, "the sub layer adds low end");
  // UI: MELODY → select a melodic instrument → invent.
  await page.click('.nav-item:has-text("MELODY")');
  const before = await evalApp(() => window.__app.hybrids.length);
  const target = await evalApp(() => window.__app.store.getState().instruments.find((i) => i.preset !== "808")?.id);
  await evalApp((id) => { window.__app.selectedInstrumentId = id; window.__app.emit(); }, target);
  await page.click('.hybrid-card button:has-text("Inventer un son"), .hybrid-card button:has-text("Un autre")');
  await page.waitForSelector(".hybrid-current");
  const after = await evalApp((id) => ({ n: window.__app.hybrids.length, hybrid: window.__app.store.getState().instruments.find((i) => i.id === id)?.hybrid }), target);
  assert.equal(after.n, before + 1);
  assert.equal(after.hybrid, await evalApp(() => window.__app.hybrids[0].name));
});

await step("no page errors during the run", async () => assert.deepEqual(errors, []));

// Skip the "unsaved changes" prompt on close: quit the main process directly.
await app.evaluate(({ app }) => setTimeout(() => app.exit(0), 50)).catch(() => {});
await app.waitForEvent("close", { timeout: 10000 }).catch(() => {});
console.log(failed ? `\n${failed} failed` : "\nall Electron smoke tests passed");
process.exit(failed ? 1 : 0);
