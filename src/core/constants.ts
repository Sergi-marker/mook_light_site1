import type { InstrumentKind, StepCount } from "./types.ts";

export const BPM_MIN = 40;
export const BPM_MAX = 220;
export const DEFAULT_BPM = 140;

export const STEP_COUNTS: readonly StepCount[] = [16, 32, 64];
/** The sequencer grid is in 16th notes. */
export const STEPS_PER_BEAT = 4;

export const VELOCITY_MIN = 1;
export const VELOCITY_MAX = 127;
export const DEFAULT_VELOCITY = 100;

export const VOLUME_MAX = 1.5;
export const PITCH_RANGE = 24;

export const SWING_MAX = 100;

export interface InstrumentDef {
  kind: InstrumentKind;
  label: string;
  chokeGroup: number | null;
  color: string;
}

export const INSTRUMENTS: readonly InstrumentDef[] = [
  { kind: "kick", label: "Kick", chokeGroup: null, color: "#f97316" },
  { kind: "snare", label: "Snare", chokeGroup: null, color: "#eab308" },
  { kind: "clap", label: "Clap", chokeGroup: null, color: "#84cc16" },
  { kind: "closedHat", label: "Closed Hat", chokeGroup: 1, color: "#22d3ee" },
  { kind: "openHat", label: "Open Hat", chokeGroup: 1, color: "#3b82f6" },
  { kind: "perc", label: "Perc", chokeGroup: null, color: "#a855f7" },
  { kind: "808", label: "808", chokeGroup: 2, color: "#ec4899" },
];

export function instrumentDef(kind: InstrumentKind): InstrumentDef {
  const def = INSTRUMENTS.find((i) => i.kind === kind);
  if (!def) throw new Error(`Unknown instrument: ${kind}`);
  return def;
}

export const PROJECT_FORMAT = "beatmaker-studio-project";
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = ".bsproj";
