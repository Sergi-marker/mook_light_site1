import {
  PITCH_RANGE,
  STEP_COUNTS,
  SWING_MAX,
  VELOCITY_MAX,
  VELOCITY_MIN,
  VOLUME_MAX,
} from "./constants.ts";
import { clamp, clampBpm, emptySteps, resizeSteps } from "./project.ts";
import type { Project, SampleMeta, StepCount, TimeSignature, Track } from "./types.ts";

export type TrackPatch = Partial<Pick<Track, "name" | "volume" | "pan" | "pitch">>;

export type Action =
  | { type: "setName"; name: string }
  | { type: "setBpm"; bpm: number }
  | { type: "setSwing"; swing: number }
  | { type: "setStepCount"; stepCount: StepCount }
  | { type: "setTimeSignature"; timeSignature: TimeSignature }
  | { type: "setMasterVolume"; volume: number }
  | { type: "toggleStep"; trackId: string; step: number }
  | { type: "setStepVelocity"; trackId: string; step: number; velocity: number }
  | { type: "updateTrack"; trackId: string; patch: TrackPatch }
  | { type: "toggleMute"; trackId: string }
  | { type: "toggleSolo"; trackId: string }
  | { type: "clearTrack"; trackId: string }
  | { type: "clearPattern" }
  | { type: "duplicatePattern" }
  | { type: "addSample"; sample: SampleMeta }
  | { type: "assignSample"; trackId: string; sampleId: string | null }
  | { type: "removeSample"; sampleId: string };

function mapTrack(p: Project, trackId: string, fn: (t: Track) => Track): Project {
  let changed = false;
  const tracks = p.tracks.map((t) => {
    if (t.id !== trackId) return t;
    const next = fn(t);
    if (next !== t) changed = true;
    return next;
  });
  return changed ? { ...p, tracks } : p;
}

function inRange(t: Track, step: number): boolean {
  return Number.isInteger(step) && step >= 0 && step < t.steps.length;
}

/**
 * Pure state transition. Returns the same object when the action changes nothing,
 * so callers can cheaply skip history entries and re-renders.
 */
export function reduce(p: Project, a: Action): Project {
  switch (a.type) {
    case "setName": {
      const name = a.name.trim().slice(0, 120) || "Untitled Beat";
      return name === p.name ? p : { ...p, name };
    }
    case "setBpm": {
      const bpm = clampBpm(a.bpm);
      return bpm === p.bpm ? p : { ...p, bpm };
    }
    case "setSwing": {
      const swing = Math.round(clamp(a.swing, 0, SWING_MAX));
      return swing === p.swing ? p : { ...p, swing };
    }
    case "setStepCount": {
      if (!STEP_COUNTS.includes(a.stepCount) || a.stepCount === p.stepCount) return p;
      return {
        ...p,
        stepCount: a.stepCount,
        tracks: p.tracks.map((t) => ({ ...t, steps: resizeSteps(t.steps, a.stepCount) })),
      };
    }
    case "setTimeSignature": {
      const beats = Math.round(clamp(a.timeSignature.beats, 1, 16));
      const beatUnit = a.timeSignature.beatUnit === 8 ? 8 : 4;
      if (beats === p.timeSignature.beats && beatUnit === p.timeSignature.beatUnit) return p;
      return { ...p, timeSignature: { beats, beatUnit } };
    }
    case "setMasterVolume": {
      const v = clamp(a.volume, 0, VOLUME_MAX);
      return v === p.masterVolume ? p : { ...p, masterVolume: v };
    }
    case "toggleStep":
      return mapTrack(p, a.trackId, (t) => {
        if (!inRange(t, a.step)) return t;
        const steps = t.steps.slice();
        steps[a.step] = { ...steps[a.step], on: !steps[a.step].on };
        return { ...t, steps };
      });
    case "setStepVelocity":
      return mapTrack(p, a.trackId, (t) => {
        if (!inRange(t, a.step)) return t;
        const velocity = Math.round(clamp(a.velocity, VELOCITY_MIN, VELOCITY_MAX));
        if (t.steps[a.step].velocity === velocity) return t;
        const steps = t.steps.slice();
        steps[a.step] = { ...steps[a.step], velocity };
        return { ...t, steps };
      });
    case "updateTrack":
      return mapTrack(p, a.trackId, (t) => {
        const next = { ...t };
        if (a.patch.name !== undefined) next.name = a.patch.name.trim().slice(0, 60) || t.name;
        if (a.patch.volume !== undefined) next.volume = clamp(a.patch.volume, 0, VOLUME_MAX);
        if (a.patch.pan !== undefined) next.pan = clamp(a.patch.pan, -1, 1);
        if (a.patch.pitch !== undefined)
          next.pitch = Math.round(clamp(a.patch.pitch, -PITCH_RANGE, PITCH_RANGE));
        const same =
          next.name === t.name &&
          next.volume === t.volume &&
          next.pan === t.pan &&
          next.pitch === t.pitch;
        return same ? t : next;
      });
    case "toggleMute":
      return mapTrack(p, a.trackId, (t) => ({ ...t, mute: !t.mute }));
    case "toggleSolo":
      return mapTrack(p, a.trackId, (t) => ({ ...t, solo: !t.solo }));
    case "clearTrack":
      return mapTrack(p, a.trackId, (t) =>
        t.steps.some((s) => s.on) ? { ...t, steps: emptySteps(t.steps.length) } : t,
      );
    case "clearPattern":
      if (!p.tracks.some((t) => t.steps.some((s) => s.on))) return p;
      return { ...p, tracks: p.tracks.map((t) => ({ ...t, steps: emptySteps(t.steps.length) })) };
    case "duplicatePattern": {
      // Doubles the pattern length by repeating the current content (16→32→64).
      const idx = STEP_COUNTS.indexOf(p.stepCount);
      const next = STEP_COUNTS[idx + 1];
      if (!next) return p;
      return {
        ...p,
        stepCount: next,
        tracks: p.tracks.map((t) => ({
          ...t,
          steps: [...t.steps, ...t.steps.map((s) => ({ ...s }))],
        })),
      };
    }
    case "addSample":
      if (p.samples.some((s) => s.id === a.sample.id)) return p;
      return { ...p, samples: [...p.samples, a.sample] };
    case "assignSample":
      if (a.sampleId !== null && !p.samples.some((s) => s.id === a.sampleId)) return p;
      return mapTrack(p, a.trackId, (t) =>
        t.sampleId === a.sampleId ? t : { ...t, sampleId: a.sampleId },
      );
    case "removeSample":
      if (!p.samples.some((s) => s.id === a.sampleId)) return p;
      return {
        ...p,
        samples: p.samples.filter((s) => s.id !== a.sampleId),
        tracks: p.tracks.map((t) => (t.sampleId === a.sampleId ? { ...t, sampleId: null } : t)),
      };
  }
}
