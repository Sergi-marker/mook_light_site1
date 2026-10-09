// AI MELODY / CHORDS / BASS GENERATOR. Music-theory driven (scales, chord progressions,
// motif development, voice leading) and seeded, so each option is reproducible.
// Output = ordinary editable notes for the piano roll.

import { degreeToMidi, inScale, SCALES, snapToScale, type Key } from "../music.ts";
import type { Note, Step } from "../types.ts";
import type { Genre, Mood } from "./prompt.ts";
import { pick, rng, weighted } from "./rng.ts";
import { gridOnsets, type MelodyMode } from "./styles.ts";

export type GenNote = Omit<Note, "id">;

/** 7-note parent scale used for harmony (pentatonic/blues borrow the minor/major parent). */
export function harmonyKey(key: Key): Key {
  const iv = SCALES[key.scale].intervals;
  if (iv.length === 7) return key;
  return { root: key.root, scale: iv.includes(4) ? "major" : "minor" };
}

const PROGRESSIONS: Record<Mood, number[][]> = {
  dark: [[0, 5, 2, 6], [0, 3, 5, 4], [0, 5, 3, 4], [0, 0, 5, 6]],
  sad: [[0, 5, 2, 6], [5, 3, 0, 4], [0, 3, 6, 2], [0, 5, 3, 3]],
  happy: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 0, 5], [0, 3, 4, 4]],
  aggressive: [[0, 0, 5, 6], [0, 1, 0, 6], [0, 5, 0, 6], [0, 6, 5, 6]],
  chill: [[1, 4, 0, 0], [0, 5, 1, 4], [3, 2, 1, 0], [0, 3, 1, 4]],
  epic: [[0, 5, 3, 4], [0, 4, 5, 3], [5, 3, 0, 4], [0, 6, 5, 4]],
  romantic: [[0, 4, 5, 3], [0, 5, 1, 4], [3, 4, 2, 5], [0, 2, 3, 4]],
};

/** All built-in progressions for a mood (scale degrees, one chord per bar). */
export function progressionsFor(mood: Mood): number[][] {
  return PROGRESSIONS[mood].map((x) => x.slice());
}

export function chooseProgression(mood: Mood, seed: number): number[] {
  return pick(rng(seed * 13 + 5), PROGRESSIONS[mood]);
}

/** Chord tones (MIDI) for a scale degree, voiced near `center` with smooth voice leading. */
export function voiceChord(degree: number, key: Key, prev: number[] | null, center = 60, size = 3): number[] {
  const hk = harmonyKey(key);
  const base = Array.from({ length: size }, (_, i) => degreeToMidi(degree + i * 2, hk, center - 12));
  const candidates: number[][] = [];
  for (let inv = 0; inv < size; inv++)
    for (const oct of [-12, 0, 12]) {
      const v = base.map((n, i) => (i < inv ? n + 12 : n) + oct).sort((a, b) => a - b);
      candidates.push(v);
    }
  const score = (v: number[]) => {
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    let s = Math.abs(mean - center) * 0.6;
    if (prev) s += v.reduce((acc, x, i) => acc + Math.abs(x - (prev[i] ?? prev[prev.length - 1])), 0);
    return s;
  };
  return candidates.sort((a, b) => score(a) - score(b))[0];
}

export interface ChordGenOptions {
  key: Key;
  progression: number[];
  stepCount: number;
  genre: Genre;
  seed: number;
  /** Rhythm: sustained pads vs rhythmic stabs. */
  style?: "sustain" | "stabs" | "arp";
}

export function generateChords(o: ChordGenOptions): GenNote[] {
  const r = rng(o.seed * 31 + 9);
  const bars = Math.max(1, o.stepCount / 16);
  const notes: GenNote[] = [];
  let prev: number[] | null = null;
  const style = o.style ?? (o.genre === "afrobeat" || o.genre === "dancehall" ? "stabs" : "sustain");
  for (let b = 0; b < bars; b++) {
    const deg = o.progression[b % o.progression.length];
    const chord = voiceChord(deg, o.key, prev, 60, o.genre === "rnb" || o.genre === "lofi" ? 4 : 3);
    prev = chord;
    const t0 = b * 16;
    if (style === "sustain") {
      for (const p of chord) notes.push({ pitch: p, start: t0, length: 16, velocity: 78 + Math.round(r() * 10) });
    } else if (style === "stabs") {
      const hits = [0, 3, 6, 10, 12].filter((_, i) => i === 0 || r() < 0.65);
      for (const h of hits) for (const p of chord) notes.push({ pitch: p, start: t0 + h, length: 2, velocity: 84 + Math.round(r() * 12) });
    } else {
      for (let i = 0; i < 16; i += 2) notes.push({ pitch: chord[(i / 2) % chord.length] + (i >= 8 ? 12 : 0), start: t0 + i, length: 2, velocity: 80 + Math.round(r() * 15) });
    }
  }
  return notes;
}

const RHYTHMS: Record<Genre, number[][]> = {
  // Onsets (16ths) inside one bar.
  trap: [[0, 3, 6, 8, 11, 14], [0, 2, 4, 7, 10, 12], [0, 6, 8, 10, 13], [0, 3, 4, 8, 11, 12, 14]],
  drill: [[0, 3, 6, 10, 13], [0, 2, 5, 8, 11, 14], [0, 3, 7, 10, 12]],
  afrobeat: [[0, 3, 6, 8, 10, 13], [2, 5, 8, 11, 14], [0, 3, 5, 8, 11, 13]],
  boombap: [[0, 4, 6, 8, 12], [0, 3, 8, 11], [0, 2, 4, 8, 10, 12]],
  rnb: [[0, 4, 7, 10, 12], [0, 3, 6, 10], [2, 4, 8, 11, 14]],
  lofi: [[0, 4, 8, 10], [0, 3, 6, 12], [2, 6, 10, 14]],
  dancehall: [[0, 3, 6, 8, 11, 14], [0, 3, 8, 11]],
  pop: [[0, 4, 6, 8, 12, 14], [0, 2, 4, 8, 12], [0, 3, 6, 10, 12]],
};

export interface MelodyGenOptions {
  key: Key;
  genre: Genre;
  mood: Mood;
  /** 0–1 */
  complexity: number;
  stepCount: number;
  progression: number[];
  seed: number;
  /** Lowest / highest MIDI note. */
  range?: [number, number];
  /** Writing style (from the sub-genre). Default "motif". */
  mode?: MelodyMode;
  /** Rhythm templates (16-char grids) overriding the genre's. */
  rhythms?: string[];
}

/**
 * Melody: a one-bar motif developed over the phrase (A A' B A''): repetition makes it catchy,
 * variations keep it alive, strong beats land on chord tones, the phrase resolves at the end.
 */
export function generateMelody(o: MelodyGenOptions): GenNote[] {
  const r = rng(o.seed * 97 + 13);
  const [lo, hi] = o.range ?? [62, 81];
  const hk = harmonyKey(o.key);
  const bars = Math.max(1, o.stepCount / 16);
  const mode = o.mode ?? "motif";
  if (mode === "arp") return arpMelody(o, r, lo, hi, bars);
  // Rhythm: base template, densified with complexity.
  let rhythm = (o.rhythms?.length ? gridOnsets(pick(r, o.rhythms)) : pick(r, RHYTHMS[o.genre])).slice();
  if (mode === "sparse" || mode === "sustain") rhythm = rhythm.filter((x, i) => i === 0 || x % 4 === 0 || r() < (mode === "sparse" ? 0.35 : 0.2));
  if (o.complexity > 0.6) rhythm = [...new Set([...rhythm, ...rhythm.map((x) => x + 1).filter((x) => x < 16 && r() < (o.complexity - 0.5)) ])].sort((a, b) => a - b);
  if (o.complexity < 0.35) rhythm = rhythm.filter((_, i) => i % 2 === 0 || r() < 0.3);
  const descend = o.mood === "dark" || o.mood === "sad";
  // Motif as scale-degree steps relative to the bar's chord root.
  const motif: number[] = [];
  let deg = pick(r, [0, 2, 4]);
  for (let i = 0; i < rhythm.length; i++) {
    motif.push(deg);
    const move = weighted(r, [
      [descend ? -1 : 1, 3],
      [descend ? 1 : -1, 2],
      [0, 1.2],
      [descend ? -2 : 2, 1.2],
      [pick(r, [-3, 3, 4, -4]), 0.4 + o.complexity],
    ] as const);
    deg = Math.max(-3, Math.min(7, deg + move));
  }
  const center = Math.round((lo + hi) / 2);
  const notes: GenNote[] = [];
  const phrase = ["A", "A2", "B", "A3"];
  for (let b = 0; b < bars; b++) {
    const chordDeg = o.progression[b % o.progression.length];
    const role = phrase[b % 4];
    let degs = motif.slice();
    let rhy = rhythm.slice();
    if (role === "A2") degs = degs.map((d, i) => (i === degs.length - 1 ? d + (descend ? -1 : 1) : d));
    if (role === "B") {
      degs = degs.map((d) => d + (descend ? -2 : 2));
      if (r() < 0.5) rhy = rhy.map((x) => Math.min(15, x + (x % 2 === 0 ? 0 : 1)));
    }
    if (role === "A3") degs = degs.map((d, i) => (i >= degs.length - 2 ? 0 : d)); // resolve
    for (let i = 0; i < rhy.length; i++) {
      const start = b * 16 + rhy[i];
      const next = i + 1 < rhy.length ? rhy[i + 1] : 16;
      let len = Math.max(1, next - rhy[i]);
      if (mode === "bounce") len = Math.min(len, r() < 0.7 ? 1 : 2); // short, plucked, bouncy
      else if (r() < 0.25 && len > 2 && mode !== "sustain") len -= 1; // staccato variety
      let pitch = degreeToMidi(chordDeg + degs[i], hk, center - 5);
      // Bounce styles (plugg, phonk…) jump an octave now and then.
      if (mode === "bounce" && i % 3 === 2 && r() < 0.35) pitch += 12;
      while (pitch > hi) pitch -= 12;
      while (pitch < lo) pitch += 12;
      pitch = snapToScale(pitch, o.key);
      // Strong beats: prefer chord tones.
      if (rhy[i] % 4 === 0) {
        const tones = [0, 2, 4].map((k) => degreeToMidi(chordDeg + k, hk, pitch - 7)).flatMap((t) => [t, t + 12]);
        pitch = tones.reduce((best, t) => (Math.abs(t - pitch) < Math.abs(best - pitch) ? t : best), tones[0]);
        if (!inScale(pitch, o.key)) pitch = snapToScale(pitch, o.key);
      }
      const accent = rhy[i] % 4 === 0;
      notes.push({ pitch, start, length: Math.min(len, b * 16 + 16 - start), velocity: Math.round((accent ? 100 : 84) + (r() - 0.5) * 16) });
    }
  }
  return notes;
}

/**
 * Arpeggiated lead (rage, hyperpop): chord tones in 16ths/8ths, up and down, with octave
 * jumps on accents — the bar's chord changes with the progression.
 */
function arpMelody(o: MelodyGenOptions, r: () => number, lo: number, hi: number, bars: number): GenNote[] {
  const hk = harmonyKey(o.key);
  const notes: GenNote[] = [];
  const rate = o.complexity > 0.55 ? 1 : 2;
  const shape = pick(r, [[0, 1, 2, 1], [0, 1, 2, 3, 2, 1], [0, 2, 1, 2], [2, 1, 0, 1]]);
  for (let b = 0; b < bars; b++) {
    const deg = o.progression[b % o.progression.length];
    const center = Math.round((lo + hi) / 2);
    const tones = [0, 2, 4, 7].map((k) => {
      let p = degreeToMidi(deg + k, hk, center - 6);
      while (p > hi) p -= 12;
      while (p < lo) p += 12;
      return snapToScale(p, o.key);
    });
    for (let i = 0, n = 0; i < 16; i += rate, n++) {
      if (rate === 1 && i % 4 === 3 && r() < 0.3) continue; // breathing gaps
      let pitch = tones[shape[n % shape.length] % tones.length];
      if (i % 8 === 0 && r() < 0.4 && pitch + 12 <= hi + 5) pitch += 12;
      notes.push({ pitch, start: b * 16 + i, length: rate * 0.9, velocity: i % 4 === 0 ? 108 : 88 });
    }
  }
  return notes;
}

export interface BassGenOptions {
  key: Key;
  progression: number[];
  stepCount: number;
  /** Rhythm source: the 808/kick drum lane steps. */
  rhythm: Step[];
  genre: Genre;
  seed: number;
  /** Allow 808 slides. */
  slides: boolean;
  /** 0–1 slide probability (style); default 0.35 drill / 0.2 other. */
  slideAmount?: number;
}

/** 808 / bass line on the chord roots, rhythm from the kick/808 lane, with slides. */
export function generateBass(o: BassGenOptions): GenNote[] {
  const r = rng(o.seed * 53 + 3);
  const hk = harmonyKey(o.key);
  const hits = o.rhythm.map((s, i) => (s.on ? i : -1)).filter((i) => i >= 0 && i < o.stepCount);
  if (!hits.length) for (let b = 0; b < o.stepCount / 16; b++) hits.push(b * 16, b * 16 + 10);
  const notes: GenNote[] = [];
  for (let h = 0; h < hits.length; h++) {
    const start = hits[h];
    const end = h + 1 < hits.length ? hits[h + 1] : o.stepCount;
    const bar = Math.floor(start / 16);
    const deg = o.progression[bar % o.progression.length];
    let pitch = degreeToMidi(deg, hk, 36);
    while (pitch < 31) pitch += 12;
    while (pitch > 43) pitch -= 12;
    let slide = false;
    // Occasional slide up to the octave / fifth before the next chord (trap/drill signature).
    if (o.slides && h > 0 && r() < (o.slideAmount ?? (o.genre === "drill" ? 0.35 : 0.2))) {
      pitch = r() < 0.6 ? pitch + 12 : degreeToMidi(deg + 4, hk, pitch);
      slide = true;
    }
    notes.push({ pitch, start, length: Math.max(1, end - start), velocity: 110, ...(slide ? { slide: true } : {}) });
  }
  return notes;
}
