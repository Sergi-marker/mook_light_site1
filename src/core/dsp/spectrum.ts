// Average spectral balance in perceptually useful bands (for the mix / master assistants).

import { fft, hann } from "./fft.ts";

export interface BandBalance {
  /** dB relative to the total energy, per band. */
  sub: number; // 20–60 Hz
  low: number; // 60–250
  lowMid: number; // 250–1k
  mid: number; // 1k–4k
  high: number; // 4k–10k
  air: number; // 10k+
}

export const BAND_EDGES: [keyof BandBalance, number, number][] = [
  ["sub", 20, 60], ["low", 60, 250], ["lowMid", 250, 1000], ["mid", 1000, 4000], ["high", 4000, 10000], ["air", 10000, 22050],
];

export function bandBalance(channels: Float32Array[], sr: number, maxFrames = 400): BandBalance {
  const N = 4096;
  const w = hann(N);
  const mono = new Float32Array(channels[0].length);
  for (const c of channels) for (let i = 0; i < c.length; i++) mono[i] += c[i] / channels.length;
  const hop = Math.max(N, Math.floor((mono.length - N) / maxFrames));
  const acc: Record<string, number> = { sub: 0, low: 0, lowMid: 0, mid: 0, high: 0, air: 0 };
  let total = 0;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= mono.length; s += hop) {
    for (let i = 0; i < N; i++) { re[i] = mono[s + i] * w[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * sr) / N;
      const pw = re[k] * re[k] + im[k] * im[k];
      total += pw;
      for (const [name, lo, hi] of BAND_EDGES) if (f >= lo && f < hi) { acc[name] += pw; break; }
    }
  }
  const db = (x: number) => 10 * Math.log10((x + 1e-12) / (total + 1e-12));
  return { sub: db(acc.sub), low: db(acc.low), lowMid: db(acc.lowMid), mid: db(acc.mid), high: db(acc.high), air: db(acc.air) };
}

/**
 * Reference tonal balance of a modern rap/trap master (dB relative to total). Derived from the
 * typical "pink-ish with strong sub" curve of the genre; used as a soft target, never forced.
 */
export const RAP_REFERENCE: BandBalance = { sub: -6.5, low: -3.5, lowMid: -9, mid: -13, high: -19, air: -29 };
