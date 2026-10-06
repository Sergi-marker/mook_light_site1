// Runs the audio engine inside real Chromium (Web Audio API) and checks what it outputs.
// Usage: npm run test:browser   (compiles src/core first)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);

function loadPlaywright() {
  for (const id of ["playwright", "@playwright/test", "/opt/node22/lib/node_modules/playwright"]) {
    try {
      return require(id);
    } catch {
      /* try next */
    }
  }
  throw new Error("Playwright not found. Install it with: npm i -D playwright");
}
const { chromium } = loadPlaywright();

const types = { ".js": "text/javascript", ".html": "text/html" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") {
    res.setHeader("content-type", "text/html");
    res.end('<!doctype html><script type="module" src="/tests/browser/engine.page.js"></script>');
    return;
  }
  const path = normalize(join(root, url.pathname));
  if (!path.startsWith(root)) return res.writeHead(403).end();
  try {
    res.setHeader("content-type", types[extname(path)] ?? "application/octet-stream");
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => window.testsReady === true, null, { timeout: 10000 });

const run = (name) => page.evaluate((n) => window.tests[n](), name);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${e.message.split("\n").join("\n     ")}`);
  }
}

await check("offline: kicks land on the beat grid (120 BPM, ±2 ms)", async () => {
  const r = await run("offlineTiming");
  assert.equal(r.onsets.length, 4, `onsets ${JSON.stringify(r.onsets)}`);
  [0, 0.5, 1, 1.5].forEach((t, i) => assert.ok(near(r.onsets[i], t, 0.002), `onset ${i}: ${r.onsets[i]}`));
  assert.equal(r.nan, false);
  assert.ok(r.peak > 0.2 && r.peak <= 1, `peak ${r.peak}`); // centre pan = -3 dB equal-power
});

await check("offline: swing 100 % delays odd steps by half a step", async () => {
  const o = await run("offlineSwing");
  assert.equal(o.length, 4, JSON.stringify(o));
  [0, 0.1875, 0.25, 0.4375].forEach((t, i) => assert.ok(near(o[i], t, 0.002), `onset ${i}: ${o[i]}`));
});

await check("offline: mute and solo", async () => {
  const r = await run("offlineMuteSolo");
  assert.equal(r.both.length, 2);
  assert.equal(r.kickMuted.length, 1);
  assert.ok(near(r.kickMuted[0], 0.857, 0.002), `snare at step 8 @140 BPM: ${r.kickMuted[0]}`);
  assert.deepEqual(r.snareSolo.length, 1);
});

await check("offline: velocity scales the hit level", async () => {
  const r = await run("offlineVelocity");
  assert.ok(r.soft < r.loud * 0.4, JSON.stringify(r));
});

await check("offline: worst case (all steps, max volumes) never clips", async () => {
  const r = await run("offlineFullBeatNoClip");
  assert.equal(r.nan, false);
  assert.ok(r.peak <= 1.0, `peak ${r.peak}`);
  assert.ok(r.rms > 0.05, `rms ${r.rms}`);
});

await check("offline: pitch +12 semitones doubles the 808 frequency", async () => {
  const r = await run("offlinePitch");
  assert.ok(near(r.up / r.base, 2, 0.15), JSON.stringify(r));
});

await check("samples: WAV import decodes and plays; garbage is rejected", async () => {
  const r = await run("importedSample");
  assert.ok(near(r.duration, 0.3, 0.01), `duration ${r.duration}`);
  assert.ok(near(r.zeroCrossingsIn250ms, 500, 15), `zc ${r.zeroCrossingsIn250ms}`);
  assert.equal(r.rejectedGarbage, true);
});

await check("realtime: play, live edit is heard, live mute silences, stop", async () => {
  const r = await run("realtimePlayback");
  console.log("     ", JSON.stringify(r));
  assert.ok(r.silentPeak < 0.001, `empty pattern should be silent: ${r.silentPeak}`);
  assert.ok(r.livePeak > 0.2, `kick added while playing should be heard: ${r.livePeak}`);
  assert.ok(r.mutedPeak < 0.01, `muted output: ${r.mutedPeak}`);
  assert.ok(r.stepsSeen >= 6, `playhead advanced through ${r.stepsSeen} steps`);
  assert.equal(r.lateSteps, 0, "no late steps (scheduler underrun)");
  assert.ok(r.latency && r.latency.sampleRate > 0, "latency info available");
  assert.equal(r.stoppedStep, -1);
});

if (errors.length) {
  failed++;
  console.log("FAIL page errors:", errors);
}
await browser.close();
server.close();
console.log(failed ? `\n${failed} browser test(s) failed` : "\nall browser tests passed");
process.exit(failed ? 1 : 0);
