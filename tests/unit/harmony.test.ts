import { test } from "node:test";
import assert from "node:assert/strict";
import { doubleVoice, harmonyTarget, harmonyVoice } from "../../src/core/dsp/harmony.ts";
import { freqToMidi, pitchTrack } from "../../src/core/dsp/yin.ts";

const C_MAJOR = { root: 0, scale: "major" as const };
const A_MINOR = { root: 9, scale: "minor" as const };
const SR = 44100;
const voice = (f: number, sec: number) => Float32Array.from({ length: Math.round(sec * SR) }, (_, i) => {
  let s = 0;
  for (let h = 1; h <= 6; h++) s += Math.sin((2 * Math.PI * f * h * i) / SR) / h;
  return 0.3 * s;
});
const median = (d: Float32Array) => {
  const t = pitchTrack(d.subarray(SR * 0.2, d.length - SR * 0.2), SR).filter((r) => r.freq > 0 && r.confidence > 0.8).map((r) => freqToMidi(r.freq)).sort((a, b) => a - b);
  return t[t.length >> 1];
};

test("harmony theory: diatonic intervals always land in the key", () => {
  assert.equal(harmonyTarget(60, C_MAJOR, 2), 64, "C → E (major third)");
  assert.equal(harmonyTarget(64, C_MAJOR, 2), 67, "E → G (minor third: in the key, not a major third)");
  assert.equal(harmonyTarget(71, C_MAJOR, 2), 74, "B → D");
  assert.equal(harmonyTarget(60, C_MAJOR, 4), 67, "fifth");
  assert.equal(harmonyTarget(64, C_MAJOR, -2), 60, "third below");
  assert.equal(harmonyTarget(69, A_MINOR, 2), 72, "A → C in A minor");
  assert.equal(harmonyTarget(61, C_MAJOR, 2), 64, "an off-key C# is treated as C (or D) → in-key target");
  assert.equal(harmonyTarget(57, A_MINOR, 7), 69, "octave");
});

test("harmony voice: a sung A in A minor gives a C above (measured), same length", () => {
  const out = harmonyVoice(voice(220, 1.5), SR, A_MINOR, "third-up");
  assert.equal(out.length, Math.round(1.5 * SR));
  assert.ok(Math.abs(median(out) - 60) < 0.25, `third above A3 = C4 (60), got ${median(out)}`);
  const fifth = harmonyVoice(voice(220, 1.5), SR, A_MINOR, "fifth-up");
  assert.ok(Math.abs(median(fifth) - 64) < 0.25, `fifth = E4 (64), got ${median(fifth)}`);
});

test("double: same pitch within a few cents, delayed ~22 ms, not identical to the lead", () => {
  const lead = voice(220, 1.5);
  const d = doubleVoice(lead, SR, { seed: 3 });
  assert.ok(Math.abs(median(d) - 57) < 0.15, `pitch ${median(d)}`);
  let first = 0;
  while (first < d.length && Math.abs(d[first]) < 1e-3) first++;
  assert.ok(Math.abs(first / SR - 0.022) < 0.004, `delay ${(first / SR) * 1000} ms`);
  let diff = 0;
  for (let i = 0; i < lead.length; i++) diff += Math.abs(lead[i] - d[i]);
  assert.ok(diff / lead.length > 0.01, "audibly different from the lead");
});
