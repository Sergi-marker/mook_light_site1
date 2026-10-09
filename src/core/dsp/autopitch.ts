// AUTO PITCH — pitch correction.
//  • LivePitchCorrector: real-time (AudioWorklet). YIN detection on a decimated history +
//    two-head delay-line pitch shifter. 0 ms latency while bypassed/in tune, ~half the
//    shifter window (≈10 ms) while correcting.
//  • studioPitchCorrect: offline TD-PSOLA, formant-preserving, higher quality (STUDIO mode).

import { nearestScalePitch, type Key } from "../music.ts";
import { freqToMidi, midiToFreq, pitchTrack, Yin } from "./yin.ts";

export interface AutoPitchParams {
  key: Key;
  /** 0–100 %: how much of the distance to the target note is corrected. */
  correction: number;
  /** ms to reach the target (0 = hard tune). */
  retuneMs: number;
  /** 0–100 %: leaves small deviations (vibrato, scoops) alone on sustained notes. */
  humanize: number;
  /** Formant shift in semitones (STUDIO only; LIVE ignores it). */
  formant: number;
}

export type AutoPitchPreset = "natural" | "soft" | "rap" | "melodic" | "modern" | "hardTune" | "robot";

export const AUTO_PITCH_PRESETS: Record<AutoPitchPreset, { label: string; correction: number; retuneMs: number; humanize: number; formant: number }> = {
  natural: { label: "Natural", correction: 45, retuneMs: 120, humanize: 60, formant: 0 },
  soft: { label: "Soft", correction: 60, retuneMs: 80, humanize: 40, formant: 0 },
  rap: { label: "Rap", correction: 35, retuneMs: 60, humanize: 50, formant: 0 },
  melodic: { label: "Melodic", correction: 80, retuneMs: 40, humanize: 25, formant: 0 },
  modern: { label: "Modern", correction: 95, retuneMs: 15, humanize: 10, formant: 0 },
  hardTune: { label: "Hard Tune", correction: 100, retuneMs: 0, humanize: 0, formant: 0 },
  robot: { label: "Robot", correction: 100, retuneMs: 0, humanize: 0, formant: -2 },
};

/** Target shift (semitones) for a detected pitch, before time smoothing. */
export function correctionFor(midi: number, p: AutoPitchParams, sustainedFor = 0): number {
  const target = nearestScalePitch(midi, p.key);
  let delta = target - midi;
  // Humanize: on notes held > 150 ms keep up to ±(humanize × 30) cents of natural movement.
  if (p.humanize > 0 && sustainedFor > 0.15) {
    const keep = (p.humanize / 100) * 0.3;
    if (Math.abs(delta) <= keep) delta = 0;
    else delta -= Math.sign(delta) * keep;
  }
  return delta * (p.correction / 100);
}

export class LivePitchCorrector {
  readonly sr: number;
  params: AutoPitchParams;
  private readonly hist: Float32Array; // decimated ×2 history for detection
  private histPos = 0;
  private decimAcc = 0;
  private decimPhase = 0;
  private readonly yin: Yin;
  private readonly yinBuf: Float32Array;
  private sinceDetect = 0;
  // Shifter
  private readonly delay: Float32Array;
  private writePos = 0;
  private readonly win: number;
  private phase = 0; // 0..1 head position
  private shiftSemis = 0;
  private wet = 0;
  private lastTargetNote = -1;
  private sustain = 0;
  /** Last detected pitch (MIDI, 0 = unvoiced) and applied shift, for the UI. */
  detectedMidi = 0;
  appliedShift = 0;

  constructor(sr: number, params: AutoPitchParams) {
    this.sr = sr;
    this.params = params;
    const dsr = sr / 2;
    this.yin = new Yin(dsr, 768, 70, 900, 0.18);
    this.hist = new Float32Array(1024);
    this.yinBuf = new Float32Array(768);
    this.win = Math.round(sr * 0.02);
    this.delay = new Float32Array(this.win * 4);
  }

  /** Expected added latency while correcting, in seconds. */
  get latencySec(): number {
    return this.win / 2 / this.sr;
  }

  private detect(): void {
    const n = this.yinBuf.length;
    for (let i = 0; i < n; i++) this.yinBuf[i] = this.hist[(this.histPos - n + i + this.hist.length) % this.hist.length];
    const r = this.yin.detect(this.yinBuf, 0);
    const hopSec = 256 / this.sr;
    if (r.freq > 0 && r.confidence > 0.6) {
      const midi = freqToMidi(r.freq);
      this.detectedMidi = midi;
      const note = nearestScalePitch(midi, this.params.key);
      this.sustain = note === this.lastTargetNote ? this.sustain + hopSec : 0;
      this.lastTargetNote = note;
      const desired = correctionFor(midi, this.params, this.sustain);
      const tau = this.params.retuneMs / 1000;
      const a = tau <= 0 ? 1 : 1 - Math.exp(-hopSec / tau);
      this.shiftSemis += (desired - this.shiftSemis) * a;
    } else {
      this.detectedMidi = 0;
      this.sustain = 0;
      this.lastTargetNote = -1;
      this.shiftSemis *= 0.7; // relax towards no shift on unvoiced sounds
    }
    this.appliedShift = this.shiftSemis;
  }

  process(input: Float32Array, output: Float32Array): void {
    const N = this.delay.length;
    const W = this.win;
    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      // Decimate by 2 into the detection history.
      this.decimAcc += x;
      if (++this.decimPhase === 2) {
        this.hist[this.histPos] = this.decimAcc * 0.5;
        this.histPos = (this.histPos + 1) % this.hist.length;
        this.decimAcc = 0;
        this.decimPhase = 0;
      }
      if (++this.sinceDetect >= 256) {
        this.sinceDetect = 0;
        this.detect();
      }
      this.delay[this.writePos] = x;
      const ratio = Math.pow(2, this.shiftSemis / 12);
      // Heads sweep the delay from W to 0 (ratio > 1) or 0 to W (ratio < 1).
      this.phase += (1 - ratio) / W;
      this.phase -= Math.floor(this.phase);
      const read = (ph: number) => {
        const d = ph * W + 1;
        let pos = this.writePos - d;
        while (pos < 0) pos += N;
        const i0 = Math.floor(pos);
        const f = pos - i0;
        return this.delay[i0 % N] * (1 - f) + this.delay[(i0 + 1) % N] * f;
      };
      const p2 = (this.phase + 0.5) % 1;
      const g1 = Math.sin(Math.PI * this.phase) ** 2;
      const g2 = Math.sin(Math.PI * p2) ** 2;
      const shifted = read(this.phase) * g1 + read(p2) * g2;
      // Bypass to the dry (zero-latency) path when no correction is needed.
      const targetWet = Math.abs(this.shiftSemis) > 0.01 ? 1 : 0;
      this.wet += (targetWet - this.wet) * 0.002;
      output[i] = x * (1 - this.wet) + shifted * this.wet;
      this.writePos = (this.writePos + 1) % N;
    }
  }
}

/**
 * STUDIO mode: offline TD-PSOLA pitch correction. Grains (2 periods, Hann) are taken at
 * pitch marks and overlap-added at the corrected period → formants are preserved.
 * `formant` (semitones) resamples each grain to move the formants deliberately.
 */
export function studioPitchCorrect(data: Float32Array, sr: number, p: AutoPitchParams): { output: Float32Array; shifts: number[] } {
  const hop = 256;
  const track = pitchTrack(data, sr, hop, 2048);
  const frameF0 = (i: number): number => {
    const idx = Math.floor((i - 1024) / hop);
    const r = track[Math.max(0, Math.min(track.length - 1, idx))];
    return r && r.confidence > 0.55 ? r.freq : 0;
  };
  // Smoothed target shift per analysis frame.
  const shifts: number[] = [];
  let s = 0, sustain = 0, last = -1;
  for (const r of track) {
    if (r.freq > 0 && r.confidence > 0.55) {
      const m = freqToMidi(r.freq);
      const note = nearestScalePitch(m, p.key);
      sustain = note === last ? sustain + hop / sr : 0;
      last = note;
      const desired = correctionFor(m, p, sustain);
      const a = p.retuneMs <= 0 ? 1 : 1 - Math.exp(-(hop / sr) / (p.retuneMs / 1000));
      s += (desired - s) * a;
    } else {
      s *= 0.6;
      last = -1;
      sustain = 0;
    }
    shifts.push(s);
  }
  const shiftAt = (i: number) => shifts[Math.max(0, Math.min(shifts.length - 1, Math.floor((i - 1024) / hop)))] ?? 0;

  // Analysis marks: one per period in voiced regions, every 5 ms otherwise.
  const marks: number[] = [];
  const unvoicedStep = Math.round(sr * 0.005);
  for (let i = 0; i < data.length; ) {
    const f0 = frameF0(i);
    const period = f0 > 0 ? sr / f0 : unvoicedStep;
    // Snap voiced marks to the local peak for coherent grains.
    let m = i;
    if (f0 > 0) {
      let best = i, bv = -Infinity;
      const half = Math.floor(period / 2);
      for (let k = Math.max(0, i - half); k < Math.min(data.length, i + half); k++) if (data[k] > bv) { bv = data[k]; best = k; }
      m = Math.max(best, marks.length ? marks[marks.length - 1] + 1 : 0);
    }
    marks.push(m);
    i = m + Math.max(1, Math.round(period));
  }

  const out = new Float32Array(data.length);
  const norm = new Float32Array(data.length);
  const formantRatio = Math.pow(2, p.formant / 12);
  let t = marks[0] ?? 0;
  let mi = 0;
  while (t < data.length && marks.length) {
    while (mi + 1 < marks.length && Math.abs(marks[mi + 1] - t) <= Math.abs(marks[mi] - t)) mi++;
    const am = marks[mi];
    const f0 = frameF0(am);
    const period = f0 > 0 ? sr / f0 : unvoicedStep;
    const ratio = f0 > 0 ? Math.pow(2, shiftAt(am) / 12) : 1;
    const half = Math.round(period);
    for (let k = -half; k <= half; k++) {
      const o = t + k;
      if (o < 0 || o >= data.length) continue;
      const src = am + k * (f0 > 0 ? formantRatio : 1);
      const i0 = Math.floor(src);
      if (i0 < 0 || i0 + 1 >= data.length) continue;
      const fr = src - i0;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * k) / (half + 1));
      out[o] += (data[i0] * (1 - fr) + data[i0 + 1] * fr) * w;
      norm[o] += w;
    }
    t += Math.max(1, Math.round(period / ratio));
  }
  // Normalise the overlap-add gain (bounded so sparse grain regions are not over-amplified).
  for (let i = 0; i < out.length; i++) out[i] /= Math.max(norm[i], 0.5);
  return { output: out, shifts };
}

export { midiToFreq };
