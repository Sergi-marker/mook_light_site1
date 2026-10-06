// ITU-R BS.1770-4 loudness (LUFS), true peak, loudness range and stereo analysis.

import { Biquad, type BiquadCoeffs } from "./biquad.ts";

/** K-weighting pre-filter (high shelf) and RLB high-pass, valid at any sample rate. */
function kWeighting(sr: number): [BiquadCoeffs, BiquadCoeffs] {
  // Shelf: f0 = 1681.97 Hz, G = 3.99984 dB, Q = 0.70717 (pyloudnorm formulation).
  const shelf = (() => {
    const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    const K = Math.tan((Math.PI * f0) / sr);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    const a0 = 1 + K / Q + K * K;
    return {
      b0: (Vh + (Vb * K) / Q + K * K) / a0,
      b1: (2 * (K * K - Vh)) / a0,
      b2: (Vh - (Vb * K) / Q + K * K) / a0,
      a1: (2 * (K * K - 1)) / a0,
      a2: (1 - K / Q + K * K) / a0,
    };
  })();
  const hp = (() => {
    const f0 = 38.13547087602444, Q = 0.5003270373238773;
    const K = Math.tan((Math.PI * f0) / sr);
    const a0 = 1 + K / Q + K * K;
    return { b0: 1 / a0, b1: -2 / a0, b2: 1 / a0, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  })();
  return [shelf, hp];
}

function weighted(channel: Float32Array, sr: number): Float32Array {
  const [a, b] = kWeighting(sr);
  const f1 = new Biquad(a), f2 = new Biquad(b);
  const out = new Float32Array(channel.length);
  for (let i = 0; i < channel.length; i++) out[i] = f2.process(f1.process(channel[i]));
  return out;
}

/** Mean-square power per block for each channel summed (BS.1770 weights 1.0 for L/R/C). */
function blockPowers(channels: Float32Array[], sr: number, blockSec: number, overlap: number): number[] {
  const w = channels.map((c) => weighted(c, sr));
  const size = Math.round(blockSec * sr);
  const hop = Math.max(1, Math.round(size * (1 - overlap)));
  const out: number[] = [];
  for (let start = 0; start + size <= w[0].length; start += hop) {
    let z = 0;
    for (const ch of w) {
      let s = 0;
      for (let i = start; i < start + size; i++) s += ch[i] * ch[i];
      z += s / size;
    }
    out.push(z);
  }
  return out;
}

const toLufs = (z: number): number => (z <= 0 ? -Infinity : -0.691 + 10 * Math.log10(z));

export function integratedLoudness(channels: Float32Array[], sr: number): number {
  const z = blockPowers(channels, sr, 0.4, 0.75);
  const abs = z.filter((x) => toLufs(x) > -70);
  if (!abs.length) return -Infinity;
  const relThreshold = toLufs(abs.reduce((s, x) => s + x, 0) / abs.length) - 10;
  const rel = abs.filter((x) => toLufs(x) > relThreshold);
  if (!rel.length) return -Infinity;
  return toLufs(rel.reduce((s, x) => s + x, 0) / rel.length);
}

/** Loudness range (LRA, EBU Tech 3342) from 3 s short-term blocks. */
export function loudnessRange(channels: Float32Array[], sr: number): number {
  const st = blockPowers(channels, sr, 3, 0.9).map(toLufs).filter((l) => l > -70);
  if (st.length < 2) return 0;
  const lin = st.map((l) => Math.pow(10, (l + 0.691) / 10));
  const rel = toLufs(lin.reduce((s, x) => s + x, 0) / lin.length) - 20;
  const g = st.filter((l) => l > rel).sort((a, b) => a - b);
  if (g.length < 2) return 0;
  const q = (p: number) => g[Math.min(g.length - 1, Math.floor(p * (g.length - 1)))];
  return q(0.95) - q(0.1);
}

export function maxShortTerm(channels: Float32Array[], sr: number): number {
  const st = blockPowers(channels, sr, 3, 0.9).map(toLufs);
  return st.length ? Math.max(...st) : -Infinity;
}

// 4× oversampling interpolator for true-peak (windowed-sinc polyphase FIR).
const TP_TAPS = 12; // per phase
const tpPhases: Float64Array[] = (() => {
  const L = 4;
  const N = TP_TAPS * L;
  const h = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const t = (n - (N - 1) / 2) / L;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const win = 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1)) + 0.08 * Math.cos((4 * Math.PI * n) / (N - 1));
    h[n] = sinc * win;
  }
  return Array.from({ length: L }, (_, p) => {
    const ph = new Float64Array(TP_TAPS);
    for (let k = 0; k < TP_TAPS; k++) ph[k] = h[k * L + p];
    return ph;
  });
})();

/** True peak (linear) of one channel, 4× oversampled. */
export function truePeak(ch: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < ch.length; i++) {
    const a = Math.abs(ch[i]);
    if (a > peak) peak = a;
  }
  for (let i = TP_TAPS; i < ch.length; i++) {
    for (const ph of tpPhases) {
      let s = 0;
      for (let k = 0; k < TP_TAPS; k++) s += ph[k] * ch[i - k];
      const a = Math.abs(s);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

export interface MixMeasurements {
  integratedLufs: number;
  shortTermMaxLufs: number;
  loudnessRange: number;
  truePeakDb: number;
  samplePeakDb: number;
  /** Peak-to-loudness ratio (dB) — a dynamics indicator. */
  plr: number;
  clippedSamples: number;
  clippingPercent: number;
  /** -1 (all left) … +1 (all right). */
  stereoBalance: number;
  /** Phase correlation −1 … +1. */
  correlation: number;
  rmsDb: number;
}

export function measure(channels: Float32Array[], sr: number): MixMeasurements {
  const integratedLufs = integratedLoudness(channels, sr);
  let samplePeak = 0, clipped = 0, sumSq = 0;
  for (const ch of channels)
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > samplePeak) samplePeak = a;
      if (a >= 0.999) clipped++;
      sumSq += ch[i] * ch[i];
    }
  const tp = Math.max(...channels.map(truePeak));
  let eL = 0, eR = 0, cross = 0;
  const L = channels[0], R = channels[1] ?? channels[0];
  for (let i = 0; i < L.length; i++) {
    eL += L[i] * L[i];
    eR += R[i] * R[i];
    cross += L[i] * R[i];
  }
  const total = channels.length * L.length;
  const truePeakDb = 20 * Math.log10(tp + 1e-12);
  return {
    integratedLufs,
    shortTermMaxLufs: maxShortTerm(channels, sr),
    loudnessRange: loudnessRange(channels, sr),
    truePeakDb,
    samplePeakDb: 20 * Math.log10(samplePeak + 1e-12),
    plr: truePeakDb - integratedLufs,
    clippedSamples: clipped,
    clippingPercent: (clipped / Math.max(1, total)) * 100,
    stereoBalance: eL + eR > 0 ? (eR - eL) / (eL + eR) : 0,
    correlation: eL > 0 && eR > 0 ? cross / Math.sqrt(eL * eR) : 1,
    rmsDb: 10 * Math.log10(sumSq / Math.max(1, total) + 1e-12),
  };
}
