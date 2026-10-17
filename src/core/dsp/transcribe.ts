// HUM → MELODY and BEATBOX → DRUMS: turns a short voice recording into notes / drum hits on the
// project's grid. Pure DSP (no Web Audio), testable offline.
//  • The recording starts with a count-in; times are given relative to the first bar after it.
//  • Constant latency (speakers → mic) is removed by measuring the median offset of all onsets
//    against the 16th grid, then everything is quantised to 16ths.

import { snapToScale, type Key } from "../music.ts";
import { fft } from "./fft.ts";
import { freqToMidi, pitchTrack } from "./yin.ts";

export interface HummedNote { pitch: number; start: number; length: number; velocity: number }
export type BeatboxSound = "kick" | "snare" | "closedHat";
export interface BeatboxHit { step: number; kind: BeatboxSound; velocity: number }

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));

/** Onset times (s): sharp rises of the short-term energy above the noise floor. */
export function detectOnsets(data: Float32Array, sr: number, minGap = 0.07): number[] {
  const hop = Math.round(sr * 0.005), win = Math.round(sr * 0.01);
  const env: number[] = [];
  for (let i = 0; i + win <= data.length; i += hop) {
    let e = 0;
    for (let k = i; k < i + win; k++) e += data[k] * data[k];
    env.push(Math.sqrt(e / win));
  }
  const peak = Math.max(...env, 1e-9);
  const floor = peak * 10 ** (-38 / 20);
  const out: number[] = [];
  let last = -Infinity;
  for (let j = 3; j < env.length; j++) {
    const before = Math.min(env[j - 1], env[j - 2], env[j - 3]);
    const t = (j * hop) / sr;
    if (env[j] > floor && env[j] > before * 2.5 + floor * 0.5 && t - last >= minGap) {
      out.push(t);
      last = t;
    }
  }
  return out;
}

/** Constant offset (s) of a set of onset times against a grid of `stepDur` (median residual). */
export function gridOffset(times: number[], stepDur: number): number {
  if (!times.length) return 0;
  const res = times.map((t) => {
    let r = t % stepDur;
    if (r > stepDur / 2) r -= stepDur;
    return r;
  }).sort((a, b) => a - b);
  return res[Math.floor(res.length / 2)];
}

/**
 * Hummed / sung melody → notes (steps of 16ths). `countIn` seconds are skipped. Pitches are
 * snapped to the key (optional) and quantised; notes shorter than 70 ms are ignored.
 */
export function humToNotes(data: Float32Array, sr: number, o: { bpm: number; key: Key; countIn: number; steps: number; snap?: boolean }): HummedNote[] {
  const stepDur = 60 / o.bpm / 4;
  const hop = 256;
  const track = pitchTrack(data, sr, hop, 2048);
  const frameT = (i: number) => (i * hop + 1024) / sr;
  // RMS per frame (for velocity / silence).
  const rmsAt = (i: number) => {
    const a = Math.max(0, i * hop), b = Math.min(data.length, a + 2048);
    let e = 0;
    for (let k = a; k < b; k++) e += data[k] * data[k];
    return Math.sqrt(e / Math.max(1, b - a));
  };
  const peak = Math.max(...track.map((_, i) => rmsAt(i)), 1e-9);
  // Segment: consecutive voiced frames whose pitch stays within ±0.8 semitone of the running median.
  type Seg = { a: number; b: number; pitches: number[]; amp: number };
  const segs: Seg[] = [];
  let cur: Seg | null = null;
  for (let i = 0; i < track.length; i++) {
    const r = track[i];
    const voiced = r.freq > 0 && r.confidence > 0.6 && rmsAt(i) > peak * 0.06;
    const m = voiced ? freqToMidi(r.freq) : NaN;
    if (cur && voiced) {
      const sorted = [...cur.pitches].sort((x, y) => x - y);
      const med = sorted[sorted.length >> 1];
      if (Math.abs(m - med) <= 0.8) {
        cur.pitches.push(m);
        cur.b = i;
        cur.amp = Math.max(cur.amp, rmsAt(i));
        continue;
      }
    }
    if (cur) segs.push(cur);
    cur = voiced ? { a: i, b: i, pitches: [m], amp: rmsAt(i) } : null;
  }
  if (cur) segs.push(cur);
  // A note started a little early (during the count-in) but still sounding on beat 1 is kept
  // and starts on beat 1 — singers often anticipate the first note.
  const kept = segs.filter((s) => frameT(s.b) - Math.max(frameT(s.a), o.countIn) >= 0.07);
  const early = (s: Seg) => frameT(s.a) < o.countIn - 0.15;
  const starts = kept.map((s) => (early(s) ? 0 : frameT(s.a) - o.countIn));
  // Latency is measured on the notes that really started after the count-in.
  const offset = gridOffset(starts.filter((_, i) => !early(kept[i])), stepDur);
  const notes: HummedNote[] = [];
  for (const [i, s] of kept.entries()) {
    const start = early(s) ? 0 : Math.round((starts[i] - offset) / stepDur) + 0; // + 0: never -0
    const end = Math.round((frameT(s.b) - o.countIn - offset) / stepDur);
    if (start < 0 || start >= o.steps) continue;
    const sorted = [...s.pitches].sort((x, y) => x - y);
    let pitch = Math.round(sorted[sorted.length >> 1]);
    if (o.snap !== false) pitch = snapToScale(pitch, o.key);
    const prev = notes[notes.length - 1];
    // Same pitch re-detected right after (vibrato / breath) → extend the previous note.
    if (prev && prev.pitch === pitch && prev.start + prev.length >= start) {
      prev.length = Math.max(prev.length, Math.min(o.steps, end) - prev.start);
      continue;
    }
    if (prev && prev.start + prev.length > start) prev.length = Math.max(1, start - prev.start);
    notes.push({ pitch, start, length: Math.max(1, Math.min(o.steps - start, end - start)), velocity: Math.round(70 + 50 * Math.min(1, s.amp / peak)) });
  }
  return notes;
}

/** Spectral features of a 40 ms window after an onset: centroid (Hz), low-band ratio, ZCR. */
export function hitFeatures(data: Float32Array, sr: number, t: number): { centroid: number; low: number; zcr: number; level: number } {
  const n = 1024;
  const a = Math.min(data.length - n, Math.max(0, Math.round(t * sr)));
  const re = new Float64Array(n), im = new Float64Array(n);
  let zc = 0, e = 0;
  for (let i = 0; i < n; i++) {
    const x = data[a + i] ?? 0;
    re[i] = x * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    e += x * x;
    if (i && Math.sign(data[a + i] ?? 0) !== Math.sign(data[a + i - 1] ?? 0)) zc++;
  }
  fft(re, im);
  let num = 0, den = 0, lowE = 0;
  for (let k = 1; k < n / 2; k++) {
    const m = re[k] * re[k] + im[k] * im[k];
    const f = (k * sr) / n;
    num += f * m;
    den += m;
    if (f < 250) lowE += m;
  }
  return { centroid: den ? num / den : 0, low: den ? lowE / den : 0, zcr: zc / n, level: Math.sqrt(e / n) };
}

/**
 * Kick = dark (low centroid / lots of low end, « boum »), hi-hat = very bright noise (« ts »,
 * centroid above ~6 kHz), snare = mid noise with a body (« pff », « k », 1.5–5 kHz).
 */
export function classifyHit(f: { centroid: number; low: number; zcr: number }): BeatboxSound {
  if (f.low > 0.35 || f.centroid < 700) return "kick";
  if (f.centroid > 6000 || f.zcr > 0.3) return "closedHat";
  return "snare";
}

/** Beatbox → drum hits on the 16th grid (after a `countIn` in seconds). */
export function beatboxToHits(data: Float32Array, sr: number, o: { bpm: number; countIn: number; steps: number }): BeatboxHit[] {
  const stepDur = 60 / o.bpm / 4;
  const onsets = detectOnsets(data, sr).filter((t) => t >= o.countIn - 0.15);
  const rel = onsets.map((t) => t - o.countIn);
  const offset = gridOffset(rel, stepDur);
  const feats = onsets.map((t) => hitFeatures(data, sr, t));
  const peak = Math.max(...feats.map((f) => f.level), 1e-9);
  const hits: BeatboxHit[] = [];
  for (const [i, t] of rel.entries()) {
    const step = Math.round((t - offset) / stepDur) + 0; // + 0: never -0
    if (step < 0 || step >= o.steps) continue;
    const kind = classifyHit(feats[i]);
    if (hits.some((h) => h.step === step && h.kind === kind)) continue;
    hits.push({ step, kind, velocity: Math.round(Math.max(60, Math.min(127, 127 + db(feats[i].level / peak) * 2))) });
  }
  return hits;
}
