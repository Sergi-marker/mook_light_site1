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
  assert.deepEqual(m.keys.sort(), ["askClaude", "metrics"]);
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
});

await step("vocal processing: STUDIO pitch correction puts the voice in key, AI VOICE CLEAN applied", async () => {
  await page.click('button:has-text("STUDIO")');
  await page.click('.presets button:has-text("Hard Tune")'); // 100 % correction
  await page.click('.row-inline button:has-text("MEDIUM")');
  await page.click("text=Appliquer le traitement STUDIO");
  await page.waitForFunction(() => window.__app.store.getState().vocals.some((x) => x.takes.some((t) => t.processedAssetId)), null, { timeout: 120000 });
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

await step("no page errors during the run", async () => assert.deepEqual(errors, []));

// Skip the "unsaved changes" prompt on close: quit the main process directly.
await app.evaluate(({ app }) => setTimeout(() => app.exit(0), 50)).catch(() => {});
await app.waitForEvent("close", { timeout: 10000 }).catch(() => {});
console.log(failed ? `\n${failed} failed` : "\nall Electron smoke tests passed");
process.exit(failed ? 1 : 0);
