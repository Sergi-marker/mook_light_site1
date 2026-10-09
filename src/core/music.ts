// Music theory helpers: keys, scales, scale lock, chords, key detection.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_ALIASES: Record<string, number> = { DB: 1, EB: 3, GB: 6, AB: 8, BB: 10, CB: 11, FB: 4, "E#": 5, "B#": 0 };

export type ScaleId =
  | "major" | "minor" | "harmonicMinor" | "melodicMinor" | "pentaMajor" | "pentaMinor"
  | "blues" | "dorian" | "phrygian" | "lydian" | "mixolydian" | "chromatic";

export const SCALES: Record<ScaleId, { label: string; intervals: number[] }> = {
  major: { label: "Majeure", intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: "Mineure naturelle", intervals: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { label: "Mineure harmonique", intervals: [0, 2, 3, 5, 7, 8, 11] },
  melodicMinor: { label: "Mineure mélodique", intervals: [0, 2, 3, 5, 7, 9, 11] },
  pentaMajor: { label: "Pentatonique majeure", intervals: [0, 2, 4, 7, 9] },
  pentaMinor: { label: "Pentatonique mineure", intervals: [0, 3, 5, 7, 10] },
  blues: { label: "Blues", intervals: [0, 3, 5, 6, 7, 10] },
  dorian: { label: "Dorien", intervals: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { label: "Phrygien", intervals: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { label: "Lydien", intervals: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { label: "Mixolydien", intervals: [0, 2, 4, 5, 7, 9, 10] },
  chromatic: { label: "Chromatique", intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

export interface Key {
  /** 0 = C … 11 = B */
  root: number;
  scale: ScaleId;
}

export function noteName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function keyLabel(k: Key): string {
  return `${NOTE_NAMES[k.root]} ${SCALES[k.scale].label}`;
}

export function parseNoteName(s: string): number | null {
  const m = s.trim().toUpperCase().match(/^([A-G])([#B]?)/);
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as "C"];
  if (m[2] === "#") return (base + 1) % 12;
  if (m[2] === "B") return FLAT_ALIASES[m[1] + "B"] ?? (base + 11) % 12;
  return base;
}

export function inScale(midi: number, key: Key): boolean {
  const pc = (((midi - key.root) % 12) + 12) % 12;
  return SCALES[key.scale].intervals.includes(pc);
}

/** Nearest in-scale note (ties go down). Used by SCALE LOCK and AUTO PITCH. */
export function snapToScale(midi: number, key: Key): number {
  const r = Math.round(midi);
  if (inScale(r, key)) return r;
  for (let d = 1; d < 12; d++) {
    if (inScale(r - d, key)) return r - d;
    if (inScale(r + d, key)) return r + d;
  }
  return r;
}

/** Nearest in-scale pitch for a continuous (fractional) MIDI value. */
export function nearestScalePitch(midiFloat: number, key: Key): number {
  let best = Math.round(midiFloat);
  let bestDist = Infinity;
  for (let n = Math.floor(midiFloat) - 2; n <= Math.ceil(midiFloat) + 2; n++) {
    if (!inScale(n, key)) continue;
    const d = Math.abs(n - midiFloat);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best;
}

/** Scale degree (0-based) → MIDI note, octave-aware, around `baseOctaveMidi` (e.g. 60). */
export function degreeToMidi(degree: number, key: Key, baseMidi = 60): number {
  const iv = SCALES[key.scale].intervals;
  const n = iv.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  const rootMidi = baseMidi - (((baseMidi - key.root) % 12) + 12) % 12;
  return rootMidi + oct * 12 + iv[idx];
}

/** Triad/7th built on a scale degree, stacked in thirds within the scale. */
export function chordOnDegree(degree: number, key: Key, baseMidi = 48, size = 3): number[] {
  return Array.from({ length: size }, (_, i) => degreeToMidi(degree + i * 2, key, baseMidi));
}

// Krumhansl–Kessler key profiles.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(a: number[], b: number[]): number {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Estimate the key of a set of notes weighted by duration. */
export function detectKey(notes: { pitch: number; length: number }[]): { key: Key; confidence: number } | null {
  if (!notes.length) return null;
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[((n.pitch % 12) + 12) % 12] += Math.max(0.25, n.length);
  let best: { key: Key; confidence: number } | null = null;
  for (let r = 0; r < 12; r++) {
    for (const [scale, prof] of [["major", MAJOR_PROFILE], ["minor", MINOR_PROFILE]] as const) {
      const rotated = prof.map((_, i) => prof[(i - r + 12) % 12]);
      const c = correlate(hist, rotated);
      if (!best || c > best.confidence) best = { key: { root: r, scale }, confidence: c };
    }
  }
  return best;
}
