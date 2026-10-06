// Zero-latency dynamics processors (no look-ahead), shared by AudioWorklets and offline rendering.
// All work sample-by-sample on mono or linked-stereo signals.

import { Biquad, biquadCoeffs } from "./biquad.ts";

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (g: number): number => (g <= 1e-9 ? -180 : 20 * Math.log10(g));
const coef = (ms: number, sr: number): number => (ms <= 0 ? 0 : Math.exp(-1 / ((ms / 1000) * sr)));

export interface CompressorParams {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  kneeDb: number;
  makeupDb: number;
}

/** Feed-forward peak compressor with soft knee, log-domain smoothing. */
export class Compressor {
  private env = 0; // gain reduction in dB (>= 0)
  private aA = 0;
  private aR = 0;
  p: CompressorParams;
  readonly sr: number;
  /** Last gain reduction, dB (for meters). */
  reduction = 0;

  constructor(sr: number, p: CompressorParams) {
    this.sr = sr;
    this.p = p;
    this.set(p);
  }

  set(p: CompressorParams): void {
    this.p = p;
    this.aA = coef(p.attackMs, this.sr);
    this.aR = coef(p.releaseMs, this.sr);
  }

  /** Static curve: gain reduction (dB, >= 0) for an input level (dB). */
  static curve(levelDb: number, p: CompressorParams): number {
    const over = levelDb - p.thresholdDb;
    const k = p.kneeDb;
    const slope = 1 - 1 / Math.max(1, p.ratio);
    if (k > 0 && Math.abs(over) <= k / 2) return (slope * (over + k / 2) ** 2) / (2 * k);
    return over > 0 ? slope * over : 0;
  }

  /** Returns the gain to apply for this detector sample. */
  gainFor(detector: number): number {
    const target = Compressor.curve(gainToDb(Math.abs(detector)), this.p);
    const a = target > this.env ? this.aA : this.aR;
    this.env = a * this.env + (1 - a) * target;
    this.reduction = this.env;
    return dbToGain(this.p.makeupDb - this.env);
  }
}

export interface GateParams {
  thresholdDb: number;
  /** Attenuation when closed, dB (positive number, e.g. 40). */
  rangeDb: number;
  attackMs: number;
  holdMs: number;
  releaseMs: number;
}

/** Noise gate with hysteresis (opens at threshold, closes 4 dB below) and hold. */
export class Gate {
  private gain = 1;
  private holdLeft = 0;
  private open = false;
  private env = 0;
  p: GateParams;
  readonly sr: number;
  constructor(sr: number, p: GateParams) {
    this.sr = sr;
    this.p = p;
  }
  gainFor(x: number): number {
    const p = this.p;
    // Fast peak envelope.
    const ax = Math.abs(x);
    this.env = ax > this.env ? ax : this.env * coef(5, this.sr);
    const lvl = gainToDb(this.env);
    if (lvl > p.thresholdDb) {
      this.open = true;
      this.holdLeft = (p.holdMs / 1000) * this.sr;
    } else if (lvl < p.thresholdDb - 4) {
      if (this.holdLeft > 0) this.holdLeft--;
      else this.open = false;
    }
    const target = this.open ? 1 : dbToGain(-p.rangeDb);
    const a = target > this.gain ? coef(p.attackMs, this.sr) : coef(p.releaseMs, this.sr);
    this.gain = a * this.gain + (1 - a) * target;
    return this.gain;
  }
}

export interface DeEsserParams {
  freq: number;
  thresholdDb: number;
  /** Maximum reduction of the sibilant band, dB. */
  rangeDb: number;
}

/**
 * Split-band de-esser: the signal is split into low (< freq) and high bands with
 * complementary 2nd-order filters; only the high band is compressed when sibilant.
 */
export class DeEsser {
  private lp: Biquad;
  private detector: Biquad;
  private env = 0;
  private gr = 0;
  p: DeEsserParams;
  readonly sr: number;
  reduction = 0;
  constructor(sr: number, p: DeEsserParams) {
    this.sr = sr;
    this.p = p;
    this.lp = new Biquad(biquadCoeffs("lowpass", p.freq, sr, 0.5));
    this.detector = new Biquad(biquadCoeffs("bandpass", p.freq * 1.4, sr, 1.2));
  }
  set(p: DeEsserParams): void {
    this.p = p;
    this.lp.c = biquadCoeffs("lowpass", p.freq, this.sr, 0.5);
    this.detector.c = biquadCoeffs("bandpass", p.freq * 1.4, this.sr, 1.2);
  }
  process(x: number): number {
    const low = this.lp.process(x);
    const high = x - low;
    const d = Math.abs(this.detector.process(x));
    this.env = d > this.env ? d : this.env * coef(30, this.sr);
    const over = gainToDb(this.env) - this.p.thresholdDb;
    const target = Math.min(this.p.rangeDb, Math.max(0, over * 0.8));
    const a = target > this.gr ? coef(1, this.sr) : coef(60, this.sr);
    this.gr = a * this.gr + (1 - a) * target;
    this.reduction = this.gr;
    return low + high * dbToGain(-this.gr);
  }
}

/**
 * Zero-latency peak limiter: instant attack on the detected peak (so |x·gain| ≤ ceiling
 * holds for every sample) and a smooth release.
 */
export class Limiter {
  private gr = 1;
  ceiling: number;
  private rel: number;
  readonly sr: number;
  constructor(sr: number, ceilingDb = -1, releaseMs = 80) {
    this.sr = sr;
    this.ceiling = dbToGain(ceilingDb);
    this.rel = coef(releaseMs, sr);
  }
  set(ceilingDb: number, releaseMs: number): void {
    this.ceiling = dbToGain(ceilingDb);
    this.rel = coef(releaseMs, this.sr);
  }
  /** Gain for a (linked) peak detector value. */
  gainFor(peak: number): number {
    const needed = peak > this.ceiling ? this.ceiling / peak : 1;
    // Instant attack (output never exceeds the ceiling), exponential release.
    this.gr = needed < this.gr ? needed : this.rel * this.gr + (1 - this.rel) * needed;
    return this.gr;
  }
  get reductionDb(): number {
    return -gainToDb(this.gr);
  }
}

/**
 * Slow automatic level ("AUTO LEVEL" / VOICE CONSISTENCY): rides the gain towards a target
 * RMS while the voice is active, freezes in silence (so it never pumps up the noise),
 * and is limited to ±maxDb so the natural dynamics survive.
 */
export class Leveler {
  private rms = 0;
  private gainDb = 0;
  readonly sr: number;
  targetDb: number;
  maxDb: number;
  speedMs: number;
  gateDb: number;
  constructor(sr: number, targetDb = -18, maxDb = 9, speedMs = 400, gateDb = -50) {
    this.sr = sr;
    this.targetDb = targetDb;
    this.maxDb = maxDb;
    this.speedMs = speedMs;
    this.gateDb = gateDb;
  }
  gainFor(x: number): number {
    const a = coef(50, this.sr);
    this.rms = a * this.rms + (1 - a) * x * x;
    const lvl = 10 * Math.log10(this.rms + 1e-12);
    if (lvl > this.gateDb) {
      const want = Math.max(-this.maxDb, Math.min(this.maxDb, this.targetDb - lvl));
      const s = coef(this.speedMs, this.sr);
      this.gainDb = s * this.gainDb + (1 - s) * want;
    }
    return dbToGain(this.gainDb);
  }
  get currentGainDb(): number {
    return this.gainDb;
  }
}
