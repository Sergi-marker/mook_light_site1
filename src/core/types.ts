// Core data model of a project. Everything here is plain JSON-serialisable data:
// the audio engine and the UI both read from it, only the reducer writes to it.

export type InstrumentKind =
  | "kick"
  | "snare"
  | "clap"
  | "closedHat"
  | "openHat"
  | "perc"
  | "808";

export type StepCount = 16 | 32 | 64;

export interface Step {
  on: boolean;
  /** 1–127, MIDI-style velocity. */
  velocity: number;
}

export interface Track {
  id: string;
  name: string;
  instrument: InstrumentKind;
  /** null = built-in synthesised sound for `instrument`; otherwise id of an imported sample. */
  sampleId: string | null;
  /** Linear gain 0–1.5 (1 = unity). */
  volume: number;
  /** -1 (left) … 1 (right). */
  pan: number;
  /** Semitones, -24 … 24. Applied as playback-rate change. */
  pitch: number;
  mute: boolean;
  solo: boolean;
  /** Tracks sharing a non-null choke group cut each other off (closed hat chokes open hat). */
  chokeGroup: number | null;
  steps: Step[];
}

export interface TimeSignature {
  beats: number;
  beatUnit: 4 | 8;
}

export interface SampleMeta {
  id: string;
  name: string;
  mime: string;
}

export interface Project {
  id: string;
  name: string;
  bpm: number;
  /** 0–100 %. Delays every off-beat 16th by up to half a step. */
  swing: number;
  timeSignature: TimeSignature;
  stepCount: StepCount;
  masterVolume: number;
  tracks: Track[];
  samples: SampleMeta[];
  createdAt: string;
  updatedAt: string;
}
