import {
  DEFAULT_VELOCITY,
  INSTRUMENTS,
  PITCH_RANGE,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  STEP_COUNTS,
  SWING_MAX,
  VELOCITY_MAX,
  VELOCITY_MIN,
  VOLUME_MAX,
  DEFAULT_BPM,
} from "./constants.ts";
import { clamp, clampBpm, emptySteps, newId, resizeSteps } from "./project.ts";
import type { InstrumentKind, Project, SampleMeta, Step, StepCount, Track } from "./types.ts";

// Project file (.bsproj): a single self-contained JSON document. Imported samples are
// embedded (base64 of the original file bytes) so a project never loses its sounds when
// moved to another machine. Phase 1 trade-off: simple and robust, but large sample sets
// make large files — a zipped bundle format can replace this later behind the same API.

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: string;
  project: Project;
  /** sampleId → base64 of the original audio file. */
  sampleData: Record<string, string>;
}

export class ProjectFileError extends Error {}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function serializeProject(
  project: Project,
  sampleBytes: ReadonlyMap<string, Uint8Array>,
): string {
  const sampleData: Record<string, string> = {};
  for (const s of project.samples) {
    const bytes = sampleBytes.get(s.id);
    if (bytes) sampleData[s.id] = bytesToBase64(bytes);
  }
  const file: ProjectFile = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    project,
    sampleData,
  };
  return JSON.stringify(file);
}

export interface ParsedProject {
  project: Project;
  sampleBytes: Map<string, Uint8Array>;
  /** Non-fatal problems that were repaired while loading. */
  warnings: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
const KINDS = INSTRUMENTS.map((i) => i.kind);

function parseSteps(raw: unknown, count: number): Step[] {
  if (!Array.isArray(raw)) return emptySteps(count);
  const steps = raw.map((s): Step => {
    const o = isObj(s) ? s : {};
    return {
      on: o.on === true,
      velocity: Math.round(clamp(num(o.velocity, DEFAULT_VELOCITY), VELOCITY_MIN, VELOCITY_MAX)),
    };
  });
  return resizeSteps(steps, count);
}

function parseTrack(raw: unknown, count: number, sampleIds: Set<string>, warnings: string[]): Track | null {
  if (!isObj(raw)) return null;
  const instrument = raw.instrument as InstrumentKind;
  if (!KINDS.includes(instrument)) {
    warnings.push(`Unknown instrument "${String(raw.instrument)}" skipped.`);
    return null;
  }
  let sampleId = typeof raw.sampleId === "string" ? raw.sampleId : null;
  if (sampleId && !sampleIds.has(sampleId)) {
    warnings.push(`Track "${str(raw.name, instrument)}": missing sample, using built-in sound.`);
    sampleId = null;
  }
  const choke = raw.chokeGroup;
  return {
    id: str(raw.id, "") || newId("trk"),
    name: str(raw.name, instrument).slice(0, 60),
    instrument,
    sampleId,
    volume: clamp(num(raw.volume, 0.8), 0, VOLUME_MAX),
    pan: clamp(num(raw.pan, 0), -1, 1),
    pitch: Math.round(clamp(num(raw.pitch, 0), -PITCH_RANGE, PITCH_RANGE)),
    mute: raw.mute === true,
    solo: raw.solo === true,
    chokeGroup: typeof choke === "number" && Number.isInteger(choke) ? choke : null,
    steps: parseSteps(raw.steps, count),
  };
}

/** Parse and validate a project file. Throws ProjectFileError if it can't be used at all. */
export function parseProject(text: string): ParsedProject {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectFileError("The file is not a valid project (invalid JSON).");
  }
  if (!isObj(data) || data.format !== PROJECT_FORMAT) {
    throw new ProjectFileError("The file is not a Beatmaker Studio project.");
  }
  const version = num(data.version, 0);
  if (version > PROJECT_VERSION) {
    throw new ProjectFileError(
      `This project was saved by a newer version (format v${version}). Please update the app.`,
    );
  }
  if (!isObj(data.project)) throw new ProjectFileError("The project data is missing.");
  const p = data.project;
  const warnings: string[] = [];

  const rawSampleData = isObj(data.sampleData) ? data.sampleData : {};
  const sampleBytes = new Map<string, Uint8Array>();
  const samples: SampleMeta[] = [];
  for (const s of Array.isArray(p.samples) ? p.samples : []) {
    if (!isObj(s) || typeof s.id !== "string") continue;
    const b64 = rawSampleData[s.id];
    if (typeof b64 !== "string") {
      warnings.push(`Sample "${str(s.name, s.id)}" has no audio data and was removed.`);
      continue;
    }
    try {
      sampleBytes.set(s.id, base64ToBytes(b64));
    } catch {
      warnings.push(`Sample "${str(s.name, s.id)}" is corrupted and was removed.`);
      continue;
    }
    samples.push({ id: s.id, name: str(s.name, "Sample"), mime: str(s.mime, "audio/wav") });
  }
  const sampleIds = new Set(samples.map((s) => s.id));

  const stepCount: StepCount = STEP_COUNTS.includes(p.stepCount as StepCount)
    ? (p.stepCount as StepCount)
    : 16;
  const tracks = (Array.isArray(p.tracks) ? p.tracks : [])
    .map((t) => parseTrack(t, stepCount, sampleIds, warnings))
    .filter((t): t is Track => t !== null);
  if (tracks.length === 0) throw new ProjectFileError("The project contains no usable tracks.");

  const ts = isObj(p.timeSignature) ? p.timeSignature : {};
  const now = new Date().toISOString();
  const project: Project = {
    id: str(p.id, "") || newId("prj"),
    name: str(p.name, "Untitled Beat").slice(0, 120) || "Untitled Beat",
    bpm: clampBpm(num(p.bpm, DEFAULT_BPM)),
    swing: Math.round(clamp(num(p.swing, 0), 0, SWING_MAX)),
    timeSignature: {
      beats: Math.round(clamp(num(ts.beats, 4), 1, 16)),
      beatUnit: ts.beatUnit === 8 ? 8 : 4,
    },
    stepCount,
    masterVolume: clamp(num(p.masterVolume, 0.8), 0, VOLUME_MAX),
    tracks,
    samples,
    createdAt: str(p.createdAt, now),
    updatedAt: str(p.updatedAt, now),
  };
  return { project, sampleBytes, warnings };
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  return cleaned.slice(0, 80) || "project";
}
