// Runs the built audio engine (dist/app) inside real Chromium and checks what it outputs.
// Usage: npm run test:browser   (builds first)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { launchChromium } from "../playwright.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dist = join(root, "dist");

const types = { ".js": "text/javascript", ".html": "text/html" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") {
    res.setHeader("content-type", "text/html");
    res.end('<!doctype html><script type="module" src="/tests/engine.page.js"></script>');
    return;
  }
  const path = url.pathname.startsWith("/tests/") ? normalize(join(root, "tests/browser", url.pathname.slice(7))) : normalize(join(dist, url.pathname));
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

const browser = await launchChromium({ args: ["--autoplay-policy=no-user-gesture-required"] });
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

await check("drums land on the beat grid (120 BPM, ±2 ms), no NaN", async () => {
  const r = await run("drumTiming");
  assert.equal(r.onsets.length, 4, JSON.stringify(r.onsets));
  [0, 0.5, 1, 1.5].forEach((t, i) => assert.ok(near(r.onsets[i], t, 0.002), `onset ${i}: ${r.onsets[i]}`));
  assert.equal(r.nan, false);
});

await check("swing delays odd steps; hi-hat rolls subdivide the step", async () => {
  const r = await run("swingAndRolls");
  [0, 0.1875, 0.25, 0.4375].forEach((t, i) => assert.ok(near(r.swung[i], t, 0.002), `swing ${i}: ${JSON.stringify(r.swung)}`));
  assert.equal(r.rolled.length, 4, `roll onsets ${JSON.stringify(r.rolled)}`);
  [0, 0.0625, 0.125, 0.1875].forEach((t, i) => assert.ok(near(r.rolled[i], t, 0.003), `roll ${i}`));
});

await check("every melodic instrument sounds, in tune (A3 = MIDI 57)", async () => {
  const r = await run("instrumentsInTune");
  for (const [preset, v] of Object.entries(r)) {
    assert.ok(v.peak > 0.02 && !v.nan, `${preset} silent/NaN ${JSON.stringify(v)}`);
    if (preset !== "bells") assert.ok(near(v.midi, 57, 0.3), `${preset} pitch ${v.midi}`);
  }
});

await check("808: correct pitch, glides on slide notes", async () => {
  const r = await run("bass808Glide");
  assert.ok(near(r.first, 45, 0.4), `first ${r.first}`);
  assert.ok(near(r.second, 52, 0.4), `second ${r.second}`);
  assert.ok(r.mid > 45.5 && r.mid < 51.8, `mid-glide ${r.mid}`);
});

await check("sound library: every sound plays, no NaN, in tune (octave presets included)", async () => {
  const r = await run("soundLibrary");
  for (const [id, v] of Object.entries(r)) {
    assert.ok(v.peak > 0.02 && !v.nan, `${id} silent/NaN ${JSON.stringify(v)}`);
    if (v.preset !== "bells" && id !== "vibes") assert.ok(near(v.midi, v.expect, 0.5), `${id} pitch ${v.midi} expected ${v.expect}`);
  }
});

await check("synth: mono legato glides; stereo width 0 folds to mono", async () => {
  const r = await run("synthMonoGlideAndWidth");
  assert.ok(near(r.glide.first, 45, 0.4), `first ${r.glide.first}`);
  assert.ok(near(r.glide.second, 52, 0.4), `second ${r.glide.second}`);
  assert.ok(r.glide.mid > 45.5 && r.glide.mid < 51.8, `mid-glide ${r.glide.mid}`);
  assert.ok(r.panned[1] < r.panned[0] * 0.05, `pan left ${r.panned}`);
  assert.ok(near(r.narrowed[0], r.narrowed[1], r.narrowed[0] * 0.02), `width 0 ${r.narrowed}`);
});

await check("effects & routing: reverb send, compressor, master limiter, delay echo, mute, solo", async () => {
  const r = await run("effectsAndRouting");
  console.log("     ", JSON.stringify({ ...r, delayOnsets: r.delayOnsets.slice(0, 4) }));
  assert.ok(r.wetTail > r.dryTail * 20 + 1e-6, "reverb tail");
  assert.ok(r.compPeak < r.dryPeak * 0.7, "compressor reduces peak");
  assert.ok(r.limPeak <= Math.pow(10, -6 / 20) + 1e-3, `limiter ceiling ${r.limPeak}`);
  assert.ok(r.delayOnsets.length >= 2 && near(r.delayOnsets[1] - r.delayOnsets[0], 0.2143, 0.01), `delay ${JSON.stringify(r.delayOnsets)}`);
  assert.equal(r.mutedOnsets.length, 1);
  assert.equal(r.soloOnsets.length, 1);
});

await check("song mode follows the arrangement; vocal clip at its position; instrumental export mutes vocals", async () => {
  const r = await run("songModeAndVocals");
  assert.ok(near(r.onsets[0], 2, 0.005), `bar 1 kick ${JSON.stringify(r.onsets)}`);
  assert.ok(near(r.onsets[1], 4, 0.005), "bar 2 kick");
  assert.ok(near(r.onsets[2], 6, 0.005), "vocal at bar 3");
  assert.equal(r.instrumentalOnsets.length, 2);
});

await check("arrangement: split clip keeps its pattern offset, muted clips are silent, clip fade-in", async () => {
  const r = await run("clipEditing");
  assert.ok(r.mutedBar0 < 1e-4, `muted clip sounds ${r.mutedBar0}`);
  assert.ok(r.rmsBar3 > 0.02, `moved half silent ${r.rmsBar3}`);
  assert.ok(near(r.pitchBar3, 69, 0.4), `moved right half should play the pattern's bar 2 (A4): ${r.pitchBar3}`);
  assert.ok(r.fadeStart < r.fadeEnd * 0.2, `fade-in ${r.fadeStart} vs ${r.fadeEnd}`);
});

await check("mixer routing: a track follows the bus it is routed to", async () => {
  const r = await run("routing");
  assert.ok(r.normal > 0.05 && near(r.vocalBusMuted, r.normal, 0.01), JSON.stringify(r));
  assert.ok(r.routedToMuted < 1e-4, `routed to a muted bus still sounds ${r.routedToMuted}`);
  assert.ok(r.direct > 0.05, `direct to master silent ${r.direct}`);
});

await check("factory templates leave headroom before the master chain (true peak < -1 dBTP)", async () => {
  const r = await run("templateHeadroom");
  for (const [id, tp] of Object.entries(r)) assert.ok(tp < -1, `${id}: ${tp}`);
});

await check("real-time: worklets load, play, live edit heard, mute, pause/resume, song mode", async () => {
  const r = await run("realtime");
  console.log("     ", JSON.stringify(r));
  assert.equal(r.worklet, true, r.workletError);
  assert.ok(r.silent < 0.001, "empty pattern is silent");
  assert.ok(r.live > 0.1, "live edit heard");
  assert.ok(r.muted < 0.005, "muted");
  assert.ok(r.steps >= 5, "playhead moves");
  assert.ok(r.resumedPos >= r.pausedPos - 0.01, "resume continues from pause");
  assert.ok(r.songPeak > 0.1, "song mode plays the clip");
  assert.equal(r.late, 0);
});

if (errors.length) {
  failed++;
  console.log("FAIL page errors:", errors);
}
await browser.close();
server.close();
console.log(failed ? `\n${failed} browser test(s) failed` : "\nall browser tests passed");
process.exit(failed ? 1 : 0);
