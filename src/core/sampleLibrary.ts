// Real recorded instruments (multi-sampled): catalogue + zone selection. Pure logic, no audio.
// The audio files live in assets/samples (copied to dist/samples), see scripts/fetch-samples.mjs.

import { SAMPLE_DATA } from "./sampleLibrary.data.ts";

export interface SampleZone {
  /** MIDI note recorded in the file. */
  note: number;
  /** Path relative to the samples folder. */
  file: string;
  /** Velocity layer [low, high) in 0–1. Absent = all velocities. */
  vel?: [number, number];
  /** Fine tuning to apply when playing (cents). */
  tune?: number;
  /** Seamless loop (seconds) for sustained instruments. */
  loop?: [number, number];
}

export type SampleCategory = "keys" | "guitar" | "bass" | "strings" | "winds" | "mallets";

export interface SampledInstrument {
  id: string;
  name: string;
  category: SampleCategory;
  /** Holds notes as long as they last (looped samples). */
  sustain: boolean;
  /** Natural release time (s). */
  release: number;
  license: string;
  credit: string;
  zones: SampleZone[];
}

export const SAMPLE_CATEGORY_LABELS: Record<SampleCategory, string> = {
  keys: "Pianos & claviers", guitar: "Guitares", bass: "Basses", strings: "Cordes", winds: "Vents & cuivres", mallets: "Percussions mélodiques",
};

/** Ensembles built from two recorded instruments (low register from one, high from the other). */
function composite(id: string, name: string, low: SampledInstrument, high: SampledInstrument, split: number): SampledInstrument {
  return {
    id, name, category: low.category, sustain: low.sustain && high.sustain, release: Math.max(low.release, high.release),
    license: low.license === high.license ? low.license : `${low.license} / ${high.license}`,
    credit: `${low.credit} + ${high.credit}`,
    zones: [...low.zones.filter((z) => z.note < split), ...high.zones.filter((z) => z.note >= split)],
  };
}

const byId = new Map(SAMPLE_DATA.map((i) => [i.id, i]));
const COMPOSITES: SampledInstrument[] = byId.has("cello") && byId.has("violin") ? [composite("strings", "Ensemble de cordes (violon + violoncelle)", byId.get("cello")!, byId.get("violin")!, 57)] : [];

export const SAMPLED_INSTRUMENTS: SampledInstrument[] = [...SAMPLE_DATA, ...COMPOSITES];
const ALL = new Map(SAMPLED_INSTRUMENTS.map((i) => [i.id, i]));

export const DEFAULT_SAMPLED = "grand-piano";

export function sampledInstrument(id: string | undefined): SampledInstrument {
  return ALL.get(id ?? "") ?? ALL.get(DEFAULT_SAMPLED) ?? SAMPLED_INSTRUMENTS[0];
}

export function isSampledInstrument(id: unknown): id is string {
  return typeof id === "string" && ALL.has(id);
}

/**
 * Zone to play for a pitch and velocity (0–1): the velocity layer first, then the recorded note
 * closest to the pitch (ties → the lower note, pitched up: brighter than pitching down).
 */
export function pickZone(inst: SampledInstrument, pitch: number, velocity: number): SampleZone {
  const v = Math.max(0, Math.min(0.999, velocity));
  let zones = inst.zones.filter((z) => !z.vel || (v >= z.vel[0] && v < z.vel[1]));
  if (!zones.length) zones = inst.zones;
  let best = zones[0];
  for (const z of zones) {
    const d = Math.abs(z.note - pitch), bd = Math.abs(best.note - pitch);
    if (d < bd || (d === bd && z.note < best.note)) best = z;
  }
  return best;
}

/**
 * A real instrument has a range: a note far outside it (a bass line sent to a kalimba) is moved by
 * octaves into the range instead of being stretched into a distorted sound. 7 semitones of margin.
 */
export function playablePitch(inst: SampledInstrument, pitch: number): number {
  let lo = Infinity, hi = -Infinity;
  for (const z of inst.zones) {
    lo = Math.min(lo, z.note);
    hi = Math.max(hi, z.note);
  }
  let p = pitch;
  while (p < lo - 7 && p + 12 <= hi + 7) p += 12;
  while (p > hi + 7 && p - 12 >= lo - 7) p -= 12;
  return p;
}

/** Playback-rate for a zone (pitch shift from the recorded note, plus its fine tuning). */
export function zoneRate(z: SampleZone, pitch: number): number {
  return 2 ** ((pitch - z.note + (z.tune ?? 0) / 100) / 12);
}

/** Files needed to play these pitches at any velocity (all layers). */
export function filesFor(inst: SampledInstrument, pitches?: Iterable<number>): string[] {
  if (!pitches) return [...new Set(inst.zones.map((z) => z.file))];
  const out = new Set<string>();
  const layers = [...new Set(inst.zones.map((z) => (z.vel ? z.vel[0] : 0)))];
  for (const p of new Set(pitches)) for (const lo of layers) out.add(pickZone(inst, p, lo + 0.001).file);
  return [...out];
}
