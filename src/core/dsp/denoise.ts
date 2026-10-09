// AI VOICE CLEAN — noise reduction.
//  • LiveDenoiser: zero-latency 4-band downward expander that tracks each band's noise floor
//    (minimum statistics) and pulls it down between and under words. Used for monitoring.
//  • studioDenoise: offline STFT spectral gating with a learned noise profile + temporal and
//    spectral smoothing (no "musical noise"), plus optional reduction of silences between
//    phrases. Never removes more than the chosen floor, so consonants and breaths survive.

import { Biquad, biquadCoeffs } from "./biquad.ts";
import { fft } from "./fft.ts";

export type CleanLevel = "off" | "low" | "medium" | "high";

export const CLEAN_LEVELS: Record<Exclude<CleanLevel, "off">, { maxReductionDb: number; overSubtract: number; silenceDb: number }> = {
  low: { maxReductionDb: 8, overSubtract: 1.2, silenceDb: 4 },
  medium: { maxReductionDb: 14, overSubtract: 1.6, silenceDb: 8 },
  high: { maxReductionDb: 22, overSubtract: 2.2, silenceDb: 14 },
};

export class LiveDenoiser {
  private readonly lows: Biquad[];
  private readonly env: Float64Array;
  private readonly floor: Float64Array;
  private readonly gain: Float64Array;
  readonly sr: number;
  /** Maximum attenuation, dB (0 disables). */
  amountDb: number;
  private readonly aEnv: number;
  private readonly aFloorUp: number;
  private readonly aGain: number;

  constructor(sr: number, amountDb = 12) {
    this.sr = sr;
    this.amountDb = amountDb;
    this.lows = [250, 1500, 5000].map((f) => new Biquad(biquadCoeffs("lowpass", f, sr, 0.707)));
    this.env = new Float64Array(4);
    this.floor = new Float64Array(4).fill(1e-4);
    this.gain = new Float64Array(4).fill(1);
    this.aEnv = Math.exp(-1 / (0.01 * sr));
    this.aFloorUp = Math.exp(-1 / (3 * sr)); // floor rises slowly (3 s), drops instantly
    this.aGain = Math.exp(-1 / (0.02 * sr));
  }

  process(x: number): number {
    if (this.amountDb <= 0) return x;
    // Complementary band split: b0 = LP250(x), b1 = LP1500(rest)… sum(bands) == x exactly.
    let rest = x;
    let y = 0;
    const minGain = Math.pow(10, -this.amountDb / 20);
    for (let b = 0; b < 4; b++) {
      const band = b < 3 ? this.lows[b].process(rest) : rest;
      if (b < 3) rest -= band;
      const p = band * band;
      this.env[b] = this.aEnv * this.env[b] + (1 - this.aEnv) * p;
      this.floor[b] = this.env[b] < this.floor[b] ? this.env[b] : this.aFloorUp * this.floor[b] + (1 - this.aFloorUp) * this.env[b];
      // Expander: full gain 10 dB above the floor, down to minGain at the floor.
      const ratio = this.env[b] / (this.floor[b] * 10 + 1e-12);
      const target = ratio >= 1 ? 1 : Math.max(minGain, ratio);
      this.gain[b] = this.aGain * this.gain[b] + (1 - this.aGain) * target;
      y += band * this.gain[b];
    }
    return y;
  }
}

export interface StudioDenoiseResult {
  output: Float32Array;
  noiseFloorDb: number;
  reductionDb: number;
}

export function studioDenoise(data: Float32Array, _sr: number, level: Exclude<CleanLevel, "off">, reduceSilence = true): StudioDenoiseResult {
  const cfg = CLEAN_LEVELS[level];
  const N = 2048, H = 512;
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)); // sqrt-Hann (WOLA)
  const bins = N / 2 + 1;
  const frames = Math.max(1, Math.ceil((data.length + N) / H));
  const mags: Float32Array[] = [];
  const res: Float64Array[] = [];
  const ims: Float64Array[] = [];
  const frameEnergy: number[] = [];
  for (let f = 0; f < frames; f++) {
    const start = f * H - N;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const s = start + i;
      re[i] = s >= 0 && s < data.length ? data[s] * win[i] : 0;
    }
    fft(re, im);
    const m = new Float32Array(bins);
    let e = 0;
    for (let k = 0; k < bins; k++) {
      m[k] = Math.hypot(re[k], im[k]);
      e += m[k] * m[k];
    }
    mags.push(m);
    res.push(re);
    ims.push(im);
    frameEnergy.push(e);
  }
  // Noise profile: per-bin 15th percentile over the quietest half of the frames.
  const order = frameEnergy.map((e, i) => [e, i] as const).sort((a, b) => a[0] - b[0]);
  const quiet = order.slice(0, Math.max(1, Math.floor(order.length * 0.5))).map((x) => x[1]);
  const noise = new Float32Array(bins);
  const col: number[] = [];
  for (let k = 0; k < bins; k++) {
    col.length = 0;
    for (const f of quiet) col.push(mags[f][k]);
    col.sort((a, b) => a - b);
    noise[k] = col[Math.floor(col.length * 0.15)] * 1.5;
  }
  const noiseEnergy = noise.reduce((s, x) => s + x * x, 0);
  const minGain = Math.pow(10, -cfg.maxReductionDb / 20);
  const silenceGain = Math.pow(10, -cfg.silenceDb / 20);
  const prevGain = new Float32Array(bins).fill(1);
  const out = new Float64Array(data.length + N);
  let reducedEnergy = 0, totalEnergy = 0;
  for (let f = 0; f < frames; f++) {
    const m = mags[f];
    const g = new Float32Array(bins);
    for (let k = 0; k < bins; k++) {
      const snr = m[k] / (noise[k] * cfg.overSubtract + 1e-12);
      // Wiener-style gain, floored.
      let gk = snr <= 1 ? minGain : Math.max(minGain, 1 - 1 / (snr * snr));
      // Temporal smoothing: fast attack (keep transients/consonants), slow release.
      gk = gk > prevGain[k] ? gk : 0.6 * prevGain[k] + 0.4 * gk;
      g[k] = gk;
    }
    // Spectral smoothing (3-bin).
    for (let k = 1; k < bins - 1; k++) prevGain[k] = (g[k - 1] + 2 * g[k] + g[k + 1]) / 4;
    prevGain[0] = g[0];
    prevGain[bins - 1] = g[bins - 1];
    // Between phrases: frame barely above the noise → extra attenuation (breaths stay above).
    const frameGain = reduceSilence && frameEnergy[f] < noiseEnergy * 2.5 ? silenceGain : 1;
    const re = res[f], im = ims[f];
    for (let k = 0; k < bins; k++) {
      const gg = prevGain[k] * frameGain;
      re[k] *= gg;
      im[k] *= gg;
      if (k > 0 && k < N / 2) {
        re[N - k] *= gg;
        im[N - k] *= gg;
      }
    }
    fft(re, im, true);
    const start = f * H - N;
    for (let i = 0; i < N; i++) {
      const s = start + i;
      if (s >= 0 && s < data.length) out[s] += re[i] * win[i];
    }
  }
  // sqrt-Hann² at 75 % overlap sums to 2.
  const output = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    output[i] = out[i] / 2;
    totalEnergy += data[i] * data[i];
    reducedEnergy += output[i] * output[i];
  }
  return {
    output,
    noiseFloorDb: 10 * Math.log10(noiseEnergy / bins / (N * N / 8) + 1e-12),
    reductionDb: 10 * Math.log10((totalEnergy + 1e-12) / (reducedEnergy + 1e-12)),
  };
}
