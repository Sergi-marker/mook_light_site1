import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeMicCheck, detectHum } from "../../src/core/dsp/micCheck.ts";
import { noiseProfile, studioDenoise } from "../../src/core/dsp/denoise.ts";

const SR = 48000;
// mulberry32: a plain LCG has spectral lines that look like hum.
let seed = 7;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
};
const noise = (sec: number, amp: number) => Float32Array.from({ length: Math.round(sec * SR) }, () => amp * rnd());
const voiceLike = (f: number, sec: number, amp: number) =>
  Float32Array.from({ length: Math.round(sec * SR) }, (_, i) => {
    let s = 0;
    for (let h = 1; h <= 8; h++) s += Math.sin((2 * Math.PI * f * h * i) / SR) / h;
    // Syllables: 4 Hz amplitude envelope, like speech / rap.
    return (amp * s * (0.55 + 0.45 * Math.sin((2 * Math.PI * 4 * i) / SR))) / 2;
  });
const withHum = (d: Float32Array, f0: number, amp: number) =>
  d.map((x, i) => x + amp * [1, 0.6, 0.4, 0.3].reduce((s, a, k) => s + a * Math.sin((2 * Math.PI * f0 * (k + 1) * i) / SR), 0));

test("hum detection: finds 50 Hz and 60 Hz mains hum, ignores plain hiss", () => {
  assert.equal(detectHum(withHum(noise(3, 0.002), 50, 0.003), SR)?.freq, 50);
  assert.equal(detectHum(withHum(noise(3, 0.002), 60, 0.003), SR)?.freq, 60);
  for (let i = 0; i < 5; i++) assert.equal(detectHum(noise(3, 0.002), SR), null);
});

test("mic check: quiet studio setup is excellent and needs no gate", () => {
  const r = analyzeMicCheck(noise(3, 0.0001), voiceLike(180, 5, 0.5), SR);
  assert.equal(r.verdict, "excellent", `SNR ${r.snrDb.toFixed(1)}`);
  assert.equal(r.settings.gateThresholdDb, null);
  assert.equal(r.settings.liveDenoiseDb, null);
  assert.equal(r.gainAdviceDb, 0);
  assert.equal(r.hum, null);
});

test("mic check: noisy room with hum gets gate, live denoise, dehum and strong cleaning", () => {
  const r = analyzeMicCheck(withHum(noise(3, 0.02), 50, 0.01), voiceLike(180, 5, 0.3), SR);
  assert.ok(r.verdict === "noisy" || r.verdict === "bad", `${r.verdict} SNR ${r.snrDb.toFixed(1)}`);
  assert.ok(r.settings.gateThresholdDb !== null && r.settings.gateThresholdDb > r.noiseFloorDb);
  assert.ok(r.settings.liveDenoiseDb !== null);
  assert.equal(r.settings.dehum, 50);
  assert.ok(r.settings.clean === "medium" || r.settings.clean === "high");
  assert.ok(r.advice.some((a) => a.includes("50 Hz")));
});

test("mic check: gain advice for a clipping voice and for a too-quiet voice", () => {
  const loud = voiceLike(180, 5, 2).map((x) => Math.max(-1, Math.min(1, x)));
  const r1 = analyzeMicCheck(noise(3, 0.0001), loud, SR);
  assert.ok(r1.clipped && r1.gainAdviceDb < 0, `clip ${r1.clipped} gain ${r1.gainAdviceDb}`);
  const r2 = analyzeMicCheck(noise(3, 0.00001), voiceLike(180, 5, 0.02), SR);
  assert.ok(r2.gainAdviceDb > 0, `gain ${r2.gainAdviceDb}`);
});

test("studio denoise with the measured room profile removes more noise from a take without pauses", () => {
  // Coloured hiss (high-passed): the take has almost no silence to learn the noise from.
  const hiss = (sec: number) => {
    const w = noise(sec, 0.02);
    let prev = 0;
    return w.map((x) => { const y = x - prev; prev = x; return y; });
  };
  const voice = voiceLike(160, 4, 0.3);
  const n = hiss(4);
  const take = voice.map((v, i) => v + n[i]);
  const profile = noiseProfile(hiss(3));
  const residual = (out: Float32Array) => {
    // Noise left = output minus the clean voice, measured after the first 0.5 s.
    let e = 0, v = 0;
    for (let i = SR / 2; i < voice.length; i++) { e += (out[i] - voice[i]) ** 2; v += voice[i] ** 2; }
    return 10 * Math.log10(v / e);
  };
  const before = residual(take);
  const blind = residual(studioDenoise(take, SR, "medium").output);
  const informed = residual(studioDenoise(take, SR, "medium", true, profile).output);
  if (process.env.BS_VERBOSE) console.log({ before, blind, informed });
  assert.ok(informed > before + 3, `SNR ${before.toFixed(1)} → ${informed.toFixed(1)} dB`);
  assert.ok(informed > blind + 3, `with profile ${informed.toFixed(1)} vs blind ${blind.toFixed(1)} dB`);
});
