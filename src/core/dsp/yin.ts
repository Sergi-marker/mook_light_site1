// YIN fundamental-frequency estimator (de Cheveigné & Kawahara, 2002).
// Used by AUTO PITCH (live + studio), voice analysis and the AI take comp.

export interface PitchResult {
  /** Hz, or 0 when unvoiced. */
  freq: number;
  /** 0–1, 1 = perfectly periodic. */
  confidence: number;
}

export class Yin {
  private readonly diff: Float32Array;
  private readonly minLag: number;
  private readonly maxLag: number;
  readonly sampleRate: number;
  readonly windowSize: number;
  readonly threshold: number;

  constructor(sampleRate: number, windowSize = 1024, minFreq = 70, maxFreq = 1000, threshold = 0.15) {
    this.sampleRate = sampleRate;
    this.windowSize = windowSize;
    this.threshold = threshold;
    this.maxLag = Math.min(Math.floor(sampleRate / minFreq), Math.floor(windowSize / 2));
    this.minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
    this.diff = new Float32Array(this.maxLag + 1);
  }

  /** Analyse `windowSize` samples of `buf` starting at `offset` (circular reads not supported). */
  detect(buf: ArrayLike<number>, offset = 0): PitchResult {
    const W = this.windowSize - this.maxLag;
    const d = this.diff;
    let energy = 0;
    for (let i = 0; i < W; i++) energy += buf[offset + i] * buf[offset + i];
    if (energy / W < 1e-7) return { freq: 0, confidence: 0 };
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= this.maxLag; tau++) {
      let sum = 0;
      for (let i = 0; i < W; i++) {
        const delta = buf[offset + i] - buf[offset + i + tau];
        sum += delta * delta;
      }
      running += sum;
      d[tau] = running > 0 ? (sum * tau) / running : 1;
    }
    let tau = -1;
    for (let t = this.minLag; t <= this.maxLag; t++) {
      if (d[t] < this.threshold) {
        while (t + 1 <= this.maxLag && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      // No dip under the threshold: take the global minimum but report low confidence.
      let best = this.minLag;
      for (let t = this.minLag; t <= this.maxLag; t++) if (d[t] < d[best]) best = t;
      if (d[best] > 0.35) return { freq: 0, confidence: Math.max(0, 1 - d[best]) };
      tau = best;
    }
    // Parabolic interpolation for sub-sample accuracy.
    let better = tau;
    if (tau > 1 && tau < this.maxLag) {
      const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
      const denom = 2 * (2 * s1 - s2 - s0);
      if (denom !== 0) better = tau + (s2 - s0) / denom;
    }
    return { freq: this.sampleRate / better, confidence: Math.max(0, Math.min(1, 1 - d[tau])) };
  }
}

export function freqToMidi(f: number): number {
  return 69 + 12 * Math.log2(f / 440);
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Pitch track of a whole buffer (hop in samples). */
export function pitchTrack(data: Float32Array, sampleRate: number, hop = 512, windowSize = 2048): PitchResult[] {
  const yin = new Yin(sampleRate, windowSize);
  const out: PitchResult[] = [];
  for (let i = 0; i + windowSize <= data.length; i += hop) out.push(yin.detect(data, i));
  return out;
}
