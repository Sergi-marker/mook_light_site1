// SAMPLE FLIP: analyse a loop (tempo, key), bring it to the project's tempo and key, chop it on
// its attacks and replay the chops in a new order — the classic MPC workflow. Pure DSP.
//  • Tempo: autocorrelation of the onset-strength envelope (70–180 BPM), refined with the loop
//    length when the loop holds a whole number of bars.
//  • Key: chroma (FFT energy folded on the 12 pitch classes) against major / minor profiles.
//  • Stretch: WSOLA (overlap-add with a similarity search) → tempo changes, pitch does not.
//  • Transpose: stretch by the pitch ratio then resample → pitch changes, timing does not.

import { detectKey, type Key } from "../music.ts";
import { fft } from "./fft.ts";

const mono = (chs: Float32Array[]): Float32Array => {
  if (chs.length === 1) return chs[0];
  const out = new Float32Array(chs[0].length);
  for (const c of chs) for (let i = 0; i < out.length; i++) out[i] += c[i] / chs.length;
  return out;
};
export { mono as mixToMono };

/**
 * Onset-strength envelope: half-wave rectified log-energy rise per hop, over 25 ms windows
 * (longer than a kick's period, so a decaying sub does not "breathe"). Frame j ends at
 * `onsetSample(j)`: an attack shows up when it enters the window.
 */
const ENV_WIN = 0.025;
const onsetSample = (j: number, sr: number, hop: number) => j * hop + Math.round(sr * ENV_WIN) - hop;
function onsetEnvelope(data: Float32Array, sr: number, hop: number): Float32Array {
  const win = Math.max(hop * 2, Math.round(sr * ENV_WIN));
  const n = Math.max(0, Math.floor((data.length - win) / hop));
  const env = new Float32Array(n);
  let prev = 0;
  for (let j = 0; j < n; j++) {
    let e = 0;
    for (let k = j * hop; k < j * hop + win; k++) e += data[k] * data[k];
    const l = Math.log10(1e-9 + e / win);
    env[j] = j ? Math.max(0, l - prev) : 0;
    prev = l;
  }
  return env;
}

/**
 * Tempo of a loop (BPM, 70–180) and its length in bars when it is a clean loop.
 * Half / double tempo ambiguity is resolved towards 70–160.
 */
export function estimateTempo(data: Float32Array, sr: number): { bpm: number; bars: number | null; confidence: number } {
  const hop = Math.round(sr * 0.01);
  const env = onsetEnvelope(data, sr, hop);
  const fps = sr / hop;
  const mean = env.reduce((a, b) => a + b, 0) / Math.max(1, env.length);
  const x = Array.from(env, (v) => v - mean);
  const acf = (lag: number) => {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    return s / (x.length - lag);
  };
  const zero = acf(0) || 1e-9;
  const at = (l: number) => { const a = Math.floor(l), f = l - a; return acf(a) * (1 - f) + acf(a + 1) * f; };
  const score = (bpm: number) => {
    const lag = (60 / bpm) * fps;
    // Beat period + its multiples (bar structure); a mild preference for the usual 75–160 range.
    const s = at(lag) + 0.5 * at(2 * lag) + 0.25 * at(4 * lag) + 0.25 * at(lag / 2);
    return bpm > 160 || bpm < 75 ? s * 0.85 : s;
  };
  let best = { bpm: 90, score: -Infinity };
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const sc = score(bpm);
    if (sc > best.score) best = { bpm, score: sc };
  }
  let bpm = best.bpm;
  // A clean loop holds a whole number of bars: the tempi its length allows are the candidates.
  const seconds = data.length / sr;
  let bars: number | null = null;
  let bestLen = -Infinity;
  for (const b of [1, 2, 4, 8, 16]) {
    const cand = (b * 4 * 60) / seconds;
    if (cand < 70 || cand > 180) continue;
    const sc = score(cand);
    if (sc > bestLen) { bestLen = sc; bars = b; }
  }
  if (bars !== null && bestLen > 0.6 * best.score) bpm = (bars * 4 * 60) / seconds;
  else bars = null;
  return { bpm: Math.round(bpm * 10) / 10, bars, confidence: Math.max(0, Math.min(1, best.score / zero)) };
}

/** Key of a sample from its chroma. */
export function estimateKey(data: Float32Array, sr: number): { key: Key; confidence: number } | null {
  const n = 8192, hop = 4096;
  const hist = new Array(12).fill(0);
  const w = Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let a = 0; a + n <= data.length; a += hop) {
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = data[a + i] * w[i];
    fft(re, im);
    for (let k = 1; k < n / 2; k++) {
      const f = (k * sr) / n;
      if (f < 55 || f > 2000) continue;
      const pc = ((Math.round(12 * Math.log2(f / 440)) + 69) % 12 + 12) % 12;
      hist[pc] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
  }
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return detectKey(hist.map((h, pc) => ({ pitch: pc, length: (h / total) * 100 })));
}

/** Smallest transposition (semitones, −6…+5) bringing `from` onto `to` (relative keys count as the same). */
export function keyShift(from: Key, to: Key): number {
  // Compare the minor roots (a major key is played over its relative minor).
  const minorRoot = (k: Key) => (k.scale === "major" ? (k.root + 9) % 12 : k.root);
  const d = (((minorRoot(to) - minorRoot(from)) % 12) + 12) % 12;
  return d > 5 ? d - 12 : d;
}

/**
 * WSOLA time-stretch: output length ≈ input × `ratio`, pitch unchanged.
 * 46 ms windows, 50 % overlap, ±12 ms similarity search.
 */
export function timeStretch(data: Float32Array, sr: number, ratio: number): Float32Array {
  if (Math.abs(ratio - 1) < 1e-4) return data.slice();
  const win = 2 * Math.round(sr * 0.023), hop = win / 2, tol = Math.round(sr * 0.012);
  const outLen = Math.round(data.length * ratio);
  const out = new Float32Array(outLen + win);
  const norm = new Float32Array(outLen + win);
  const hann = Float32Array.from({ length: win }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / win));
  let prevIn = 0; // where the last copied window started in the input
  for (let o = 0; o < outLen; o += hop) {
    const nominal = Math.round(o / ratio);
    let pos = Math.min(Math.max(0, nominal), Math.max(0, data.length - win));
    if (o > 0) {
      // The natural continuation of the previous window, `hop` samples later.
      const cont = prevIn + hop;
      let best = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const c = Math.min(Math.max(0, nominal + d), Math.max(0, data.length - win));
        let s = 0;
        for (let i = 0; i < hop; i += 4) s += (data[c + i] ?? 0) * (data[cont + i] ?? 0);
        if (s > best) { best = s; pos = c; }
      }
    }
    for (let i = 0; i < win && o + i < out.length; i++) {
      out[o + i] += (data[pos + i] ?? 0) * hann[i];
      norm[o + i] += hann[i];
    }
    prevIn = pos;
  }
  const res = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) res[i] = norm[i] > 1e-3 ? out[i] / norm[i] : out[i];
  return res;
}

/** Linear resampling by `factor` (> 1 = shorter and higher). */
function resample(data: Float32Array, factor: number): Float32Array {
  const n = Math.floor(data.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * factor, a = Math.floor(x), f = x - a;
    out[i] = (data[a] ?? 0) * (1 - f) + (data[a + 1] ?? data[a] ?? 0) * f;
  }
  return out;
}

/** Tempo ratio and transposition in one pass: duration × `ratio`, pitch + `semitones`. */
export function stretchAndShift(data: Float32Array, sr: number, ratio: number, semitones: number): Float32Array {
  const p = 2 ** (semitones / 12);
  return semitones ? resample(timeStretch(data, sr, ratio * p), p) : timeStretch(data, sr, ratio);
}

/**
 * Chop points (sample indices, first = 0): the strongest attacks, at least one 16th apart,
 * moved a few ms earlier so the transient is kept whole. Falls back to an even grid.
 */
export function chopPoints(data: Float32Array, sr: number, bpm: number, max = 8): number[] {
  const hop = Math.round(sr * 0.005);
  const env = onsetEnvelope(data, sr, hop);
  const minGap = Math.round(((60 / bpm / 4) * sr) / hop);
  const peaks: { j: number; v: number }[] = [];
  for (let j = 1; j < env.length - 1; j++) if (env[j] > 0 && env[j] >= env[j - 1] && env[j] > env[j + 1]) peaks.push({ j, v: env[j] });
  peaks.sort((a, b) => b.v - a.v);
  const chosen: number[] = [];
  const floor = (peaks[0]?.v ?? 0) * 0.25;
  for (const pk of peaks) {
    if (pk.v < floor || chosen.length >= max - 1) break;
    if (onsetSample(pk.j, sr, hop) < sr * 0.03) continue; // the very start is chop 1 anyway
    if (chosen.every((c) => Math.abs(c - pk.j) >= minGap)) chosen.push(pk.j);
  }
  let pts = [0, ...chosen.sort((a, b) => a - b).map((j) => Math.max(0, onsetSample(j, sr, hop) - Math.round(sr * 0.004)))];
  if (pts.length < Math.min(4, max)) {
    // Few clear attacks (pads, strings): even slices on the beat grid.
    const n = Math.min(max, 8);
    pts = Array.from({ length: n }, (_, i) => Math.round((i * data.length) / n));
  }
  return pts;
}

/** Slice boundaries as 0–1 fractions (start, end) for each chop. */
export function chopRegions(points: number[], length: number): { start: number; end: number }[] {
  return points.map((s, i) => ({ start: s / length, end: (points[i + 1] ?? length) / length }));
}

/**
 * Pattern for the chops, in 16th steps. "original": each chop where it was in the loop (rebuilds
 * the loop). "flip": a new rhythm — chop 1 on the downbeat, the others re-ordered on a
 * syncopated hip-hop grid, a different one per `seed`.
 */
export function flipPattern(chopSteps: number[], steps: number, mode: "original" | "flip", seed = 1): { chop: number; step: number; velocity: number }[] {
  const n = chopSteps.length;
  if (!n) return [];
  if (mode === "original") {
    const loop = Math.max(16, Math.ceil((chopSteps[n - 1] + 1) / 16) * 16);
    const out: { chop: number; step: number; velocity: number }[] = [];
    for (let base = 0; base < steps; base += loop) {
      chopSteps.forEach((s, chop) => { if (base + s < steps) out.push({ chop, step: base + s, velocity: 110 }); });
    }
    return out;
  }
  let st = (seed * 2654435761) >>> 0;
  const rnd = () => ((st = (Math.imul(st ^ (st >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
  const grids = [
    [0, 3, 6, 10, 12, 14],
    [0, 3, 7, 10, 13],
    [0, 2, 6, 8, 11, 14],
    [0, 4, 7, 10, 12],
    [0, 3, 6, 8, 11, 13, 14],
  ];
  const out: { chop: number; step: number; velocity: number }[] = [];
  let order: number[] = [];
  for (let bar = 0; bar * 16 < steps; bar++) {
    const grid = grids[Math.floor(rnd() * grids.length)];
    // The order changes every two bars; chop 1 always lands on the bar's downbeat.
    if (bar % 2 === 0) order = shuffled(n, rnd);
    grid.forEach((s, i) => {
      const step = bar * 16 + s;
      if (step >= steps) return;
      const chop = i === 0 && bar % 2 === 0 ? 0 : order[(i + bar) % order.length];
      out.push({ chop, step, velocity: i === 0 ? 118 : 92 + Math.round(rnd() * 20) });
    });
  }
  return out;
}
function shuffled(n: number, rnd: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export interface FlipResult {
  /** The loop at the project's tempo (and key when it was detected reliably). */
  output: Float32Array;
  sourceBpm: number;
  bars: number | null;
  sourceKey: Key | null;
  /** Semitones applied (0 when the key was not reliable). */
  shift: number;
  /** Chop starts in `output` (samples). */
  points: number[];
}

/** Whole SAMPLE FLIP analysis: tempo, key, stretch / transpose to the project, chops. */
export function prepareFlip(data: Float32Array, sr: number, o: { bpm: number; key: Key; maxChops?: number; matchKey?: boolean }): FlipResult {
  const tempo = estimateTempo(data, sr);
  const k = estimateKey(data, sr);
  const sourceKey = k && k.confidence > 0.5 ? k.key : null;
  const shift = sourceKey && o.matchKey !== false ? keyShift(sourceKey, o.key) : 0;
  // A clean loop is stretched to exactly its bars at the project tempo (it loops without drift).
  const barSec = 240 / o.bpm;
  const ratio = tempo.bars ? (tempo.bars * barSec * sr) / data.length : tempo.bpm / o.bpm;
  const output = stretchAndShift(data, sr, ratio, shift);
  return { output, sourceBpm: tempo.bpm, bars: tempo.bars, sourceKey, shift, points: chopPoints(output, sr, o.bpm, o.maxChops ?? 8) };
}
