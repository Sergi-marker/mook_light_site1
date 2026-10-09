// AI TAKE COMP: scores every take bar by bar (presence, clipping, pitch stability, noise,
// level consistency) and proposes the best take for each bar. The user accepts or overrides
// each segment; nothing is applied silently.

import { freqToMidi, Yin } from "../dsp/yin.ts";

export interface TakeAudio {
  takeId: string;
  /** Global step where the take starts. */
  startStep: number;
  data: Float32Array;
  sampleRate: number;
}

export interface SegmentScore {
  takeId: string;
  score: number;
  reasons: string[];
}

export interface CompSegment {
  /** Global steps [start, end). */
  start: number;
  end: number;
  best: SegmentScore;
  alternatives: SegmentScore[];
}

function segmentMetrics(seg: Float32Array, sr: number) {
  let peak = 0, sum = 0, clipped = 0;
  for (const x of seg) {
    const a = Math.abs(x);
    if (a > peak) peak = a;
    if (a >= 0.99) clipped++;
    sum += x * x;
  }
  const rmsDb = 10 * Math.log10(sum / Math.max(1, seg.length) + 1e-12);
  // Noise floor: quietest 20 ms frame.
  const fr = Math.floor(sr * 0.02);
  let floor = Infinity;
  for (let s = 0; s + fr <= seg.length; s += fr) {
    let e = 0;
    for (let i = s; i < s + fr; i++) e += seg[i] * seg[i];
    floor = Math.min(floor, 10 * Math.log10(e / fr + 1e-12));
  }
  // Pitch stability on voiced frames.
  const y = new Yin(sr, 2048, 70, 900);
  let voiced = 0, stable = 0, frames = 0;
  for (let s = 0; s + 2048 <= seg.length; s += 1024) {
    frames++;
    const r = y.detect(seg, s);
    if (r.freq > 0 && r.confidence > 0.6) {
      voiced++;
      const m = freqToMidi(r.freq);
      if (Math.abs(m - Math.round(m)) < 0.25) stable++;
    }
  }
  return { rmsDb, peak, clippedPct: (clipped / Math.max(1, seg.length)) * 100, snr: rmsDb - (Number.isFinite(floor) ? floor : rmsDb), voicedRatio: frames ? voiced / frames : 0, stability: voiced ? stable / voiced : 0 };
}

export function compTakes(takes: TakeAudio[], bpm: number, stepsPerBar: number): CompSegment[] {
  if (takes.length < 2) return [];
  const stepSec = 60 / (bpm * 4);
  const ranges = takes.map((t) => ({ t, start: t.startStep, end: t.startStep + t.data.length / t.sampleRate / stepSec }));
  const from = Math.floor(Math.min(...ranges.map((r) => r.start)) / stepsPerBar) * stepsPerBar;
  const to = Math.ceil(Math.max(...ranges.map((r) => r.end)) / stepsPerBar) * stepsPerBar;
  const segments: CompSegment[] = [];
  for (let s = from; s < to; s += stepsPerBar) {
    const cands: (SegmentScore & { rms: number })[] = [];
    for (const { t, start, end } of ranges) {
      if (start > s + stepsPerBar * 0.5 || end < s + stepsPerBar * 0.5) continue;
      const a = Math.max(0, Math.floor((s - start) * stepSec * t.sampleRate));
      const b = Math.min(t.data.length, Math.floor((s + stepsPerBar - start) * stepSec * t.sampleRate));
      if (b - a < t.sampleRate * 0.2) continue;
      const m = segmentMetrics(t.data.subarray(a, b), t.sampleRate);
      const reasons: string[] = [];
      let score = 50;
      if (m.rmsDb < -55) { score -= 40; reasons.push("silence"); }
      if (m.clippedPct > 0.01) { score -= Math.min(40, m.clippedPct * 400); reasons.push("saturation"); }
      score += Math.min(20, Math.max(-20, (m.snr - 25) * 0.8));
      if (m.snr < 20) reasons.push("bruit");
      if (m.voicedRatio > 0.3) {
        score += (m.stability - 0.6) * 40;
        if (m.stability < 0.5) reasons.push("justesse");
      }
      cands.push({ takeId: t.takeId, score, reasons, rms: m.rmsDb });
    }
    if (!cands.length) continue;
    // Level consistency: penalise takes far from the median level of this bar.
    const med = [...cands].sort((x, y) => x.rms - y.rms)[Math.floor(cands.length / 2)].rms;
    for (const c of cands) {
      const off = Math.abs(c.rms - med);
      if (off > 6) {
        c.score -= (off - 6) * 2;
        c.reasons.push("niveau");
      }
    }
    cands.sort((x, y) => y.score - x.score);
    const strip = (c: (typeof cands)[number]): SegmentScore => ({ takeId: c.takeId, score: Math.round(Math.max(0, Math.min(100, c.score))), reasons: c.reasons });
    segments.push({ start: s, end: s + stepsPerBar, best: strip(cands[0]), alternatives: cands.slice(1).map(strip) });
  }
  return segments;
}

/** Overall score per take (average of its bar scores) — shown in the take list. */
export function takeScores(segments: CompSegment[]): Record<string, number> {
  const acc: Record<string, { s: number; n: number }> = {};
  for (const seg of segments)
    for (const c of [seg.best, ...seg.alternatives]) {
      acc[c.takeId] ??= { s: 0, n: 0 };
      acc[c.takeId].s += c.score;
      acc[c.takeId].n++;
    }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.s / v.n]));
}
