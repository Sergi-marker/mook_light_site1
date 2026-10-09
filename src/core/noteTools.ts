// Pure note-editing tools used by the piano roll (chords, transpose, humanize, legato,
// arpeggiator, velocity shaping, strum). Each returns new note data; the UI dispatches it.

import { inScale, SCALES, type Key } from "./music.ts";
import type { Note } from "./types.ts";

export type ChordShape = "single" | "triad" | "seventh" | "ninth" | "power" | "octave" | "sus2" | "sus4";

export const CHORD_SHAPES: { id: ChordShape; label: string }[] = [
  { id: "single", label: "Note" },
  { id: "triad", label: "Accord (triade)" },
  { id: "seventh", label: "Accord 7e" },
  { id: "ninth", label: "Accord 9e" },
  { id: "sus2", label: "Sus2" },
  { id: "sus4", label: "Sus4" },
  { id: "power", label: "Power (5te)" },
  { id: "octave", label: "Octave" },
];

/** Pitch `steps` scale degrees above/below `pitch` (pitch itself snapped into the scale). */
export function scaleStep(pitch: number, steps: number, key: Key): number {
  let p = pitch;
  const dir = Math.sign(steps);
  for (let i = 0; i < Math.abs(steps); i++) {
    p += dir;
    while (!inScale(p, key)) p += dir;
  }
  return p;
}

/**
 * Pitches of a chord whose root is `root`. With `inKey`, thirds/sevenths follow the scale
 * (diatonic chords); otherwise a minor/major quality is taken from the scale's third.
 */
export function chordPitches(root: number, shape: ChordShape, key: Key, inKey = true): number[] {
  if (shape === "single") return [root];
  if (shape === "octave") return [root, root + 12];
  if (shape === "power") return [root, root + 7, root + 12];
  if (shape === "sus2") return [root, inKey ? scaleStep(root, 1, key) : root + 2, root + 7];
  if (shape === "sus4") return [root, inKey ? scaleStep(root, 3, key) : root + 5, root + 7];
  const degrees = shape === "triad" ? [0, 2, 4] : shape === "seventh" ? [0, 2, 4, 6] : [0, 2, 4, 6, 8];
  if (inKey && inScale(root, key)) return degrees.map((d) => scaleStep(root, d, key));
  const minor = SCALES[key.scale].intervals.includes(3);
  const iv = minor ? [0, 3, 7, 10, 14] : [0, 4, 7, 11, 14];
  return degrees.map((_, i) => root + iv[i]);
}

/** Transpose by semitones, or by scale degrees when `scaleDegrees` is set. */
export function transposeNotes(notes: Note[], amount: number, key: Key, scaleDegrees = false): { id: string; pitch: number }[] {
  return notes.map((n) => ({ id: n.id, pitch: clampPitch(scaleDegrees ? scaleStep(n.pitch, amount, key) : n.pitch + amount) }));
}

/** Small deterministic timing and velocity variations (amount 0–1). */
export function humanizeNotes(notes: Note[], amount: number, seed = 1, stepCount = Infinity): { id: string; start: number; velocity: number }[] {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
  return notes.map((n) => ({
    id: n.id,
    start: Math.max(0, Math.min(stepCount - n.length, n.start + rnd() * 0.3 * amount)),
    velocity: Math.round(Math.max(1, Math.min(127, n.velocity + rnd() * 40 * amount))),
  }));
}

/** Extend every note up to the next note start (chords handled together). */
export function legatoNotes(notes: Note[], stepCount: number): { id: string; length: number }[] {
  const starts = [...new Set(notes.map((n) => n.start))].sort((a, b) => a - b);
  return notes.map((n) => {
    const next = starts.find((x) => x > n.start + 1e-6);
    return { id: n.id, length: Math.max(0.25, (next ?? stepCount) - n.start) };
  });
}

export type ArpMode = "up" | "down" | "updown" | "random";

/**
 * Arpeggiate: notes sounding together (same start) are replaced by a sequence of `rate`-step
 * notes cycling through their pitches for the chord's duration.
 */
export function arpeggiate(notes: Note[], rate: number, mode: ArpMode, octaves = 1, seed = 7): Omit<Note, "id">[] {
  const groups = new Map<number, Note[]>();
  for (const n of notes) groups.set(n.start, [...(groups.get(n.start) ?? []), n]);
  let s = seed >>> 0 || 1;
  const out: Omit<Note, "id">[] = [];
  for (const [start, g] of groups) {
    const base = [...new Set(g.map((n) => n.pitch))].sort((a, b) => a - b);
    const pitches: number[] = [];
    for (let o = 0; o < Math.max(1, octaves); o++) pitches.push(...base.map((p) => p + 12 * o));
    let seq = mode === "down" ? [...pitches].reverse() : pitches;
    if (mode === "updown" && pitches.length > 2) seq = [...pitches, ...pitches.slice(1, -1).reverse()];
    const len = Math.max(...g.map((n) => n.length));
    const vel = Math.round(g.reduce((a, n) => a + n.velocity, 0) / g.length);
    const count = Math.max(1, Math.floor(len / rate + 1e-6));
    for (let i = 0; i < count; i++) {
      let pitch: number;
      if (mode === "random") {
        s = (s * 1664525 + 1013904223) >>> 0;
        pitch = seq[s % seq.length];
      } else pitch = seq[i % seq.length];
      out.push({ pitch: clampPitch(pitch), start: start + i * rate, length: rate * 0.9, velocity: i % 4 === 0 ? Math.min(127, vel + 8) : vel });
    }
  }
  return out;
}

/** Linear velocity ramp across the notes (by start time). */
export function velocityRamp(notes: Note[], from: number, to: number): { id: string; velocity: number }[] {
  if (!notes.length) return [];
  const t0 = Math.min(...notes.map((n) => n.start));
  const t1 = Math.max(...notes.map((n) => n.start));
  return notes.map((n) => ({ id: n.id, velocity: Math.round(Math.max(1, Math.min(127, from + (to - from) * (t1 > t0 ? (n.start - t0) / (t1 - t0) : 0)))) }));
}

/** Strum: notes of each chord start a little later from the lowest to the highest. */
export function strumNotes(notes: Note[], spreadSteps: number): { id: string; start: number; length: number }[] {
  const groups = new Map<number, Note[]>();
  for (const n of notes) groups.set(n.start, [...(groups.get(n.start) ?? []), n]);
  const out: { id: string; start: number; length: number }[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.pitch - b.pitch).forEach((n, i) => {
      const d = i * spreadSteps;
      out.push({ id: n.id, start: n.start + d, length: Math.max(0.1, n.length - d) });
    });
  }
  return out;
}

/** Reverse the order of the selection in time (mirror inside its span). */
export function reverseNotes(notes: Note[]): { id: string; start: number }[] {
  if (!notes.length) return [];
  const t0 = Math.min(...notes.map((n) => n.start));
  const t1 = Math.max(...notes.map((n) => n.start + n.length));
  return notes.map((n) => ({ id: n.id, start: t0 + (t1 - (n.start + n.length)) }));
}

const clampPitch = (p: number) => Math.max(0, Math.min(127, Math.round(p)));
