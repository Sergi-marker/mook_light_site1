// RBJ biquad filters for sample-by-sample processing inside worklets / offline DSP.

export type BiquadType = "lowpass" | "highpass" | "bandpass" | "peaking" | "lowshelf" | "highshelf";

export interface BiquadCoeffs {
  b0: number; b1: number; b2: number; a1: number; a2: number;
}

export function biquadCoeffs(type: BiquadType, freq: number, sr: number, q = 0.707, gainDb = 0): BiquadCoeffs {
  const f = Math.min(Math.max(freq, 10), sr * 0.49);
  const w0 = (2 * Math.PI * f) / sr;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (type) {
    case "lowpass":
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case "highpass":
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case "bandpass":
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
    case "peaking":
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; break;
    case "lowshelf": {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cos + s); b1 = 2 * A * ((A - 1) - (A + 1) * cos); b2 = A * ((A + 1) - (A - 1) * cos - s);
      a0 = (A + 1) + (A - 1) * cos + s; a1 = -2 * ((A - 1) + (A + 1) * cos); a2 = (A + 1) + (A - 1) * cos - s; break;
    }
    case "highshelf": {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cos + s); b1 = -2 * A * ((A - 1) + (A + 1) * cos); b2 = A * ((A + 1) + (A - 1) * cos - s);
      a0 = (A + 1) - (A - 1) * cos + s; a1 = 2 * ((A - 1) - (A + 1) * cos); a2 = (A + 1) - (A - 1) * cos - s; break;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Transposed direct form II biquad state. */
export class Biquad {
  c: BiquadCoeffs;
  private z1 = 0;
  private z2 = 0;
  constructor(c: BiquadCoeffs) {
    this.c = c;
  }
  process(x: number): number {
    const c = this.c;
    const y = c.b0 * x + this.z1;
    this.z1 = c.b1 * x - c.a1 * y + this.z2;
    this.z2 = c.b2 * x - c.a2 * y;
    return y;
  }
  reset(): void {
    this.z1 = this.z2 = 0;
  }
}

/** Apply a filter to a whole buffer (returns a new buffer). */
export function filterBuffer(data: Float32Array, c: BiquadCoeffs): Float32Array {
  const f = new Biquad(c);
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = f.process(data[i]);
  return out;
}
