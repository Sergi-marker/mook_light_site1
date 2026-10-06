// Core data model of a project (format v2). Plain JSON-serialisable data: the audio engine
// and the UI read it, only the reducer writes it. Audio data (recorded takes, imported
// samples) lives outside the JSON, referenced by id (see projectFile.ts).

import type { Key } from "./music.ts";

export type InstrumentKind = "kick" | "snare" | "clap" | "closedHat" | "openHat" | "perc" | "808";

export type StepCount = 16 | 32 | 64;

export interface Step {
  on: boolean;
  /** 1–127, MIDI-style velocity. */
  velocity: number;
  /** Ratchet: 1 = single hit, 2/3/4 = roll subdivisions inside the step (trap hi-hats). */
  roll?: number;
  /** Micro-timing in steps (−0.5…0.5), set by HUMANIZE, cleared by QUANTIZE. */
  offset?: number;
}

/** A drum lane (sound source). Its mixer settings live in the channel with the same id. */
export interface Track {
  id: string;
  name: string;
  instrument: InstrumentKind;
  /** null = built-in synthesised sound; otherwise id of an imported sample. */
  sampleId: string | null;
  /** Semitones, −24 … 24. */
  pitch: number;
  /** Tracks sharing a non-null choke group cut each other off. */
  chokeGroup: number | null;
}

export interface Note {
  id: string;
  /** MIDI note number. */
  pitch: number;
  /** Position in steps (16th notes) from the pattern start. Fractional allowed. */
  start: number;
  /** Length in steps. */
  length: number;
  velocity: number;
  /** 808 / mono synths: glide into this note from the previous one. */
  slide?: boolean;
}

export type SynthPreset = "piano" | "epiano" | "synth" | "pad" | "strings" | "pluck" | "bells" | "bass" | "808";

export interface SynthParams {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** Filter cutoff, Hz. */
  cutoff: number;
  resonance: number;
  /** 0–1: how much the envelope opens the filter. */
  filterEnv: number;
  /** Oscillator detune spread, cents. */
  detune: number;
  /** Glide/portamento time, s (mono presets). */
  glide: number;
  /** 0–1 saturation/drive. */
  drive: number;
}

export interface Bass808Params {
  /** Global tuning, semitones. */
  tune: number;
  /** Glide time used by slides and overlapping notes, s. */
  glide: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** 0–1 hard distortion. */
  distortion: number;
  /** 0–1 soft saturation (harmonics for small speakers). */
  saturation: number;
  /** Low-shelf boost at 60 Hz, dB. */
  lowBoostDb: number;
  /** Low-pass, Hz. */
  highCutHz: number;
  /** 0–1 compression amount. */
  compression: number;
  /** 0–1 initial pitch drop ("punch"). */
  punch: number;
}

export interface InstrumentTrack {
  id: string;
  name: string;
  preset: SynthPreset;
  synth: SynthParams;
  /** Only for preset "808". */
  bass808: Bass808Params;
  color: string;
}

export interface Pattern {
  id: string;
  name: string;
  color: string;
  stepCount: StepCount;
  /** Drum steps per drum track id. */
  drums: Record<string, Step[]>;
  /** Notes per instrument track id. */
  notes: Record<string, Note[]>;
}

/** A pattern placed on the arrangement timeline. Positions in bars. */
export interface PatternClip {
  id: string;
  patternId: string;
  lane: number;
  start: number;
  length: number;
}

export interface Section {
  id: string;
  name: string;
  start: number;
  length: number;
  color: string;
}

export interface Arrangement {
  clips: PatternClip[];
  sections: Section[];
  lanes: number;
  loop: { enabled: boolean; start: number; end: number };
}

/** Raw audio stored in the project bundle (recorded takes, studio-processed versions). */
export interface AudioAsset {
  id: string;
  name: string;
  sampleRate: number;
  frames: number;
  channels: number;
}

export interface Take {
  id: string;
  name: string;
  assetId: string;
  /** Global step where the recording started. */
  startStep: number;
  recordedAt: string;
  /** STUDIO processing results (non-destructive, regenerated on demand). */
  processedAssetId?: string;
  processedWith?: string;
  /** Quality score 0–100 from the AI take analysis. */
  score?: number;
}

/** A take (or a part of it) placed on the timeline. */
export interface AudioClip {
  id: string;
  takeId: string;
  /** Global position in steps. */
  start: number;
  /** Offset into the take, seconds. */
  offset: number;
  /** Duration, seconds. */
  duration: number;
  gainDb: number;
}

export type VocalRole = "lead" | "double" | "adlibs" | "backing" | "custom";

export interface StudioSettings {
  /** STUDIO pitch correction (offline PSOLA) applied to playback when enabled. */
  pitch: { enabled: boolean; preset: string; correction: number; retuneMs: number; humanize: number; formant: number };
  /** AI VOICE CLEAN (offline spectral denoise). */
  clean: "off" | "low" | "medium" | "high";
}

export interface VocalTrack {
  id: string;
  name: string;
  role: VocalRole;
  takes: Take[];
  clips: AudioClip[];
  armed: boolean;
  /** RAW = play the original takes, PROCESSED = studio-processed versions (when available). */
  playProcessed: boolean;
  studio: StudioSettings;
}

export type EffectType =
  | "eq" | "compressor" | "limiter" | "saturation" | "distortion" | "deesser"
  | "gate" | "reverb" | "delay" | "denoise" | "autopitch" | "leveler";

export type ParamValue = number | string | boolean;

export interface Effect {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, ParamValue>;
}

export type ChannelKind = "drum" | "instrument" | "vocal" | "bus" | "return" | "master";

export interface Channel {
  /** Same id as the track it belongs to, or a fixed bus id. */
  id: string;
  name: string;
  kind: ChannelKind;
  /** Linear gain 0–1.5. */
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  /** Destination channel id ("master" for buses). */
  output: string;
  sends: { reverb: number; delay: number };
  inserts: Effect[];
}

export interface AutomationPoint {
  /** Position in bars. */
  bar: number;
  value: number;
}

export interface AutomationLane {
  id: string;
  channelId: string;
  param: "volume" | "pan";
  points: AutomationPoint[];
}

export interface MidiMapping {
  /** "cc:<channel>:<controller>" */
  source: string;
  /** "channel:<id>:volume" | "channel:<id>:pan" | "master:volume" | "bpm" */
  target: string;
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
  key: Key;
  /** Drum lanes (shared by all patterns). */
  tracks: Track[];
  instruments: InstrumentTrack[];
  patterns: Pattern[];
  currentPatternId: string;
  arrangement: Arrangement;
  vocals: VocalTrack[];
  channels: Channel[];
  automation: AutomationLane[];
  /** Imported drum samples (original files embedded). */
  samples: SampleMeta[];
  /** Recorded / processed audio. */
  assets: AudioAsset[];
  midiMappings: MidiMapping[];
  metronome: { enabled: boolean; countInBars: number; volume: number };
  createdAt: string;
  updatedAt: string;
}
