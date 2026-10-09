// Smoke test of the real desktop app (Electron), driven by Playwright:
// window opens without errors, preload API, AudioContext + worklets running, audible playback,
// MP3 export through the UI (LAME), and the online assistant's IPC path (Anthropic SDK loads).
// Usage: npm run test:electron   (on Linux without a display: xvfb-run -a npm run test:electron)
import { readFile, mkdtemp } from "node:fs/promises";
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
const args = [`--user-data-dir=${join(tmp, "profile")}`, root];
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
