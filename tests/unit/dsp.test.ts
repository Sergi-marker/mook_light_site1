import { test } from "node:test";
import assert from "node:assert/strict";
import { fft } from "../../src/core/dsp/fft.ts";
import { Yin, freqToMidi } from "../../src/core/dsp/yin.ts";
import { Compressor, Gate, Limiter, Leveler, DeEsser } from "../../src/core/dsp/dynamics.ts";
import { integratedLoudness, truePeak, measure } from "../../src/core/dsp/loudness.ts";
import { LivePitchCorrector, studioPitchCorrect, AUTO_PITCH_PRESETS } from "../../src/core/dsp/autopitch.ts";
import { LiveDenoiser, studioDenoise } from "../../src/core/dsp/denoise.ts";
import { analyzeVoice, recommendChain } from "../../src/core/dsp/voiceAnalysis.ts";
import { pitchTrack } from "../../src/core/dsp/yin.ts";

const SR = 44100;
const sine = (f: number, sec: number, amp = 0.5, sr = SR) =>
  Float32Array.from({ length: Math.round(sec * sr) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / sr));
/** Voice-like signal: harmonic series with decaying partials. */
const voiceLike = (f: number, sec: number, amp = 0.4, sr = SR) =>
  Float32Array.from({ length: Math.round(sec * sr) }, (_, i) => {
    let s = 0;
    for (let h = 1; h <= 8; h++) s += Math.sin((2 * Math.PI * f * h * i) / sr) / h;
    return (amp * s) / 2;
  });
let seed = 1;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;

test("FFT forward/inverse round trip and a pure tone lands in its bin", () => {
  const n = 1024;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 8 * i) / n);
  const orig = re.slice();
  fft(re, im);
  assert.ok(Math.abs(Math.hypot(re[8], im[8]) - n / 2) < 1e-6);
  fft(re, im, true);
  for (let i = 0; i < n; i++) assert.ok(Math.abs(re[i] - orig[i]) < 1e-9);
});

test("YIN detects pitch within 5 cents (sine and harmonic-rich voice)", () => {
  for (const f of [82.4, 110, 196, 261.6, 440, 659.3]) {
    const y = new Yin(SR, 2048);
    for (const sig of [sine(f, 0.2), voiceLike(f, 0.2)]) {
      const r = y.detect(sig, 0);
      assert.ok(Math.abs(freqToMidi(r.freq) - freqToMidi(f)) * 100 < 5, `${f} Hz → ${r.freq}`);
      assert.ok(r.confidence > 0.8);
    }
  }
  const noise = Float32Array.from({ length: 2048 }, rnd);
  assert.ok(new Yin(SR, 2048).detect(noise, 0).confidence < 0.7, "noise is not confidently pitched");
});

test("compressor: static curve and makeup", () => {
  const p = { thresholdDb: -20, ratio: 4, attackMs: 1, releaseMs: 50, kneeDb: 0, makeupDb: 0 };
  assert.equal(Compressor.curve(-30, p), 0);
  assert.equal(Compressor.curve(-12, p), 6);
  const c = new Compressor(SR, p);
  let g = 1;
  for (let i = 0; i < 4410; i++) g = c.gainFor(0.5); // -6 dBFS steady
  assert.ok(Math.abs(20 * Math.log10(g) - -10.5) < 0.2, `gain ${20 * Math.log10(g)}`);
});

test("limiter output never exceeds the ceiling", () => {
  const l = new Limiter(SR, -1, 50);
  const ceil = Math.pow(10, -1 / 20);
  for (let i = 0; i < 20000; i++) {
    const x = (i % 300 < 5 ? 3 : 0.3) * Math.sin(i * 0.05);
    const y = x * l.gainFor(Math.abs(x));
    assert.ok(Math.abs(y) <= ceil + 1e-9);
  }
});

test("gate attenuates noise below threshold, opens on signal", () => {
  const g = new Gate(SR, { thresholdDb: -40, rangeDb: 40, attackMs: 1, holdMs: 20, releaseMs: 50 });
  let gq = 1;
  for (let i = 0; i < SR / 2; i++) gq = g.gainFor(0.001 * rnd());
  assert.ok(gq < 0.02, `closed gain ${gq}`);
  let go = 0;
  for (let i = 0; i < 2000; i++) go = g.gainFor(0.3 * Math.sin(i * 0.1));
  assert.ok(go > 0.95);
});

test("leveler brings soft and loud passages closer, stays within ±maxDb", () => {
  const lev = new Leveler(SR, -18, 9, 200);
  const run = (amp: number) => {
    let out = 0;
    for (let i = 0; i < SR * 2; i++) {
      const x = amp * Math.sin(i * 0.05);
      const y = x * lev.gainFor(x);
      if (i > SR * 1.5) out = Math.max(out, Math.abs(y));
    }
    return out;
  };
  const soft = run(0.03), loud = run(0.5);
  const inRatio = 20 * Math.log10(0.5 / 0.03);
  const outRatio = 20 * Math.log10(loud / soft);
  assert.ok(outRatio < inRatio - 10, `${inRatio.toFixed(1)} → ${outRatio.toFixed(1)} dB`);
  assert.ok(Math.abs(lev.currentGainDb) <= 9 + 1e-6);
});

test("de-esser reduces a 7 kHz burst but leaves 300 Hz alone", () => {
  const level = (f: number) => {
    const d = new DeEsser(SR, { freq: 5500, thresholdDb: -30, rangeDb: 12 });
    let e = 0;
    const x = sine(f, 0.3, 0.5);
    for (let i = 0; i < x.length; i++) {
      const y = d.process(x[i]);
      if (i > x.length / 2) e += y * y;
    }
    return 10 * Math.log10(e / (x.length / 2) / 0.125);
  };
  assert.ok(level(7000) < -6, `7k ${level(7000)}`);
  assert.ok(Math.abs(level(300)) < 0.5, `300 ${level(300)}`);
});

test("LUFS: 1 kHz 0 dBFS sine is -3.01 LUFS mono, 0 LUFS stereo (BS.1770)", () => {
  const s = sine(1000, 5, 1, 48000);
  assert.ok(Math.abs(integratedLoudness([s], 48000) - -3.01) < 0.05);
  assert.ok(Math.abs(integratedLoudness([s, s], 48000) - 0) < 0.05);
  // Same at 44.1 kHz (sample-rate independent filters)
  assert.ok(Math.abs(integratedLoudness([sine(1000, 5, 1, 44100)], 44100) - -3.01) < 0.05);
});

test("true peak catches inter-sample peaks", () => {
  // fs/4 sine with 45° phase: samples at ±0.707, real peak 1.0
  const x = Float32Array.from({ length: 4000 }, (_, i) => Math.sin((Math.PI / 2) * i + Math.PI / 4));
  assert.ok(Math.abs(Math.max(...x.map(Math.abs)) - 0.7071) < 1e-3);
  assert.ok(truePeak(x) > 0.97, `tp ${truePeak(x)}`);
  const m = measure([x, x], 44100);
  assert.equal(m.clippedSamples, 0);
  assert.ok(Math.abs(m.correlation - 1) < 1e-6);
});

test("live auto-pitch pulls a sharp note onto the scale (hard tune)", () => {
  const key = { root: 9, scale: "minor" as const }; // A minor
  const ap = new LivePitchCorrector(SR, { key, ...AUTO_PITCH_PRESETS.hardTune });
  const input = voiceLike(452, 1.5); // A4 + 46 cents
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 128) ap.process(input.subarray(i, i + 128), out.subarray(i, i + 128));
  const r = new Yin(SR, 2048).detect(out, SR);
  const cents = (freqToMidi(r.freq) - 69) * 100;
  assert.ok(Math.abs(cents) < 12, `output ${r.freq.toFixed(1)} Hz (${cents.toFixed(1)} cents)`);
  assert.ok(ap.latencySec < 0.012);
});

test("live auto-pitch is transparent (zero delay) on an in-tune note", () => {
  const key = { root: 9, scale: "minor" as const };
  const ap = new LivePitchCorrector(SR, { key, ...AUTO_PITCH_PRESETS.natural });
  const input = voiceLike(440, 0.6);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 128) ap.process(input.subarray(i, i + 128), out.subarray(i, i + 128));
  let maxDiff = 0;
  for (let i = SR * 0.3; i < input.length; i++) maxDiff = Math.max(maxDiff, Math.abs(out[i] - input[i]));
  assert.ok(maxDiff < 0.02, `diff ${maxDiff}`);
});

test("studio PSOLA corrects pitch and keeps duration", () => {
  const key = { root: 9, scale: "minor" as const };
  const input = voiceLike(228, 1.2); // between A3 (220) and B3 (246.9) → A3
  const { output } = studioPitchCorrect(input, SR, { key, ...AUTO_PITCH_PRESETS.hardTune });
  assert.equal(output.length, input.length);
  const tr = pitchTrack(output.subarray(SR * 0.3, SR * 0.9), SR).filter((r) => r.freq > 0);
  const med = tr.map((r) => r.freq).sort((a, b) => a - b)[Math.floor(tr.length / 2)];
  assert.ok(Math.abs(freqToMidi(med) - 57) < 0.15, `median ${med}`);
});

test("live denoiser lowers steady noise between words", () => {
  const d = new LiveDenoiser(SR, 18);
  let inE = 0, outE = 0;
  for (let i = 0; i < SR * 4; i++) {
    const x = 0.003 * rnd();
    const y = d.process(x);
    if (i > SR * 3) { inE += x * x; outE += y * y; }
  }
  assert.ok(10 * Math.log10(inE / outE) > 10, `reduction ${10 * Math.log10(inE / outE)}`);
});

test("studio denoise improves SNR without killing the voice", () => {
  const voice = voiceLike(200, 3, 0.3);
  for (let i = 0; i < voice.length; i++) if (Math.floor(i / (SR * 0.5)) % 2 === 1) voice[i] = 0; // phrases
  const noise = Float32Array.from({ length: voice.length }, () => 0.01 * rnd());
  const mix = voice.map((v, i) => v + noise[i]);
  const { output } = studioDenoise(mix, SR, "medium");
  let vIn = 0, vOut = 0, nIn = 0, nOut = 0;
  for (let i = SR * 0.6; i < voice.length; i++) {
    if (voice[i] !== 0) { vIn += mix[i] ** 2; vOut += output[i] ** 2; }
    else { nIn += mix[i] ** 2; nOut += output[i] ** 2; }
  }
  const voiceLoss = 10 * Math.log10(vIn / vOut);
  const noiseRed = 10 * Math.log10(nIn / nOut);
  assert.ok(noiseRed > 10, `noise reduced ${noiseRed.toFixed(1)} dB`);
  assert.ok(voiceLoss < 1.5, `voice loss ${voiceLoss.toFixed(2)} dB`);
});

test("voice analysis + recommendation on a noisy, sibilant, slightly off-key take", () => {
  const sr = SR;
  const n = sr * 4;
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const phrase = Math.floor(t / 0.8) % 2 === 0;
    const f = 220 * Math.pow(2, 0.35 / 12); // 35 cents sharp
    let v = 0;
    if (phrase) for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
    data[i] = 0.25 * v + 0.02 * rnd() + (phrase && Math.floor(t * 10) % 4 === 0 ? 0.2 * Math.sin(2 * Math.PI * 7000 * t) : 0);
  }
  const a = analyzeVoice(data, sr);
  assert.ok(a.noise !== "LOW", `noise ${a.noise} snr ${a.snrDb}`);
  assert.ok(a.pitchStability < 60, `stability ${a.pitchStability}`);
  assert.ok(Math.abs(a.medianPitchMidi - 57.35) < 0.2);
  const rec = recommendChain(a);
  assert.notEqual(rec.clean, "off");
  assert.ok(rec.pitchCorrection >= 20);
  assert.ok(rec.notes.length > 0);
});
