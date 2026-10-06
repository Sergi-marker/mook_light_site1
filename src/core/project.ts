import {
  DEFAULT_BPM,
  DEFAULT_VELOCITY,
  INSTRUMENTS,
  BPM_MAX,
  BPM_MIN,
} from "./constants.ts";
import type { InstrumentKind, Project, Step, StepCount, Track } from "./types.ts";

export function newId(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${rand}`;
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clampBpm(bpm: number): number {
  return Math.round(clamp(bpm, BPM_MIN, BPM_MAX) * 100) / 100;
}

export function emptySteps(count: number): Step[] {
  return Array.from({ length: count }, () => ({ on: false, velocity: DEFAULT_VELOCITY }));
}

export function createTrack(kind: InstrumentKind, stepCount: StepCount): Track {
  const def = INSTRUMENTS.find((i) => i.kind === kind)!;
  return {
    id: newId("trk"),
    name: def.label,
    instrument: kind,
    sampleId: null,
    volume: kind === "808" ? 0.9 : 0.8,
    pan: 0,
    pitch: 0,
    mute: false,
    solo: false,
    chokeGroup: def.chokeGroup,
    steps: emptySteps(stepCount),
  };
}

function withPattern(track: Track, onSteps: number[], accents: number[] = []): Track {
  const steps = track.steps.map((s, i) =>
    onSteps.includes(i) ? { on: true, velocity: accents.includes(i) ? 127 : DEFAULT_VELOCITY } : s,
  );
  return { ...track, steps };
}

/** A new project with all seven drum tracks and a simple starter trap pattern. */
export function createDefaultProject(name = "Untitled Beat", withStarterPattern = true): Project {
  const stepCount: StepCount = 16;
  let tracks = INSTRUMENTS.map((i) => createTrack(i.kind, stepCount));
  if (withStarterPattern) {
    const patterns: Partial<Record<InstrumentKind, [number[], number[]?]>> = {
      kick: [[0, 7, 10]],
      snare: [[8]],
      closedHat: [[0, 2, 4, 6, 8, 10, 12, 13, 14], [0, 8]],
      openHat: [[15]],
      "808": [[0, 7, 10]],
    };
    tracks = tracks.map((t) => {
      const p = patterns[t.instrument];
      return p ? withPattern(t, p[0], p[1]) : t;
    });
  }
  const now = new Date().toISOString();
  return {
    id: newId("prj"),
    name,
    bpm: DEFAULT_BPM,
    swing: 0,
    timeSignature: { beats: 4, beatUnit: 4 },
    stepCount,
    masterVolume: 0.8,
    tracks,
    samples: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Resize a step array, keeping existing steps and padding with empty ones. */
export function resizeSteps(steps: Step[], count: number): Step[] {
  if (steps.length >= count) return steps.slice(0, count);
  return [...steps, ...emptySteps(count - steps.length)];
}

/** A track is heard if it isn't muted and either nothing is soloed or it is soloed. */
export function isTrackAudible(track: Track, tracks: readonly Track[]): boolean {
  if (track.mute) return false;
  const anySolo = tracks.some((t) => t.solo);
  return !anySolo || track.solo;
}
