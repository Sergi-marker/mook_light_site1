import { DEFAULT_VELOCITY, INSTRUMENTS, PITCH_RANGE, PROJECT_FORMAT, PROJECT_VERSION, STEP_COUNTS, SWING_MAX, VELOCITY_MAX, VELOCITY_MIN, VOLUME_MAX, DEFAULT_BPM } from "./constants.ts";
import { SCALES, type ScaleId } from "./music.ts";
import {
  busChannels, clamp, clampBpm, createEmptyProject, createInstrument, createVocalTrack, drumChannel, emptySteps,
  instrumentChannel, newId, resizeSteps, vocalChannel, EFFECT_DEFAULTS, SYNTH_PRESETS, DEFAULT_808,
} from "./project.ts";
import { readZip, writeZip, type ZipEntry } from "./io/zip.ts";
import type {
  AudioAsset, Channel, Effect, EffectType, InstrumentKind, InstrumentTrack, Note, Pattern, Project,
  SampleMeta, Step, StepCount, SynthPreset, Track, VocalTrack, Waveform,
} from "./types.ts";

const WAVES: Waveform[] = ["sawtooth", "square", "triangle", "sine"];

// Project file (.bsproj) v2: a standard ZIP archive (no compression) containing
//   project.json          the project (format/version header + data)
//   samples/<id>          imported drum samples, original bytes
//   audio/<id>.wav        recorded takes and studio-processed audio
// v1 files (a single JSON document with base64 samples) are still read and migrated.

export class ProjectFileError extends Error {}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface ProjectMedia {
  /** Imported drum samples: original file bytes. */
  samples: ReadonlyMap<string, Uint8Array>;
  /** Recorded / processed audio: WAV bytes. */
  audio: ReadonlyMap<string, Uint8Array>;
}

/** JSON part only (used for autosave, where audio blobs are stored separately). */
export function projectToJson(project: Project): string {
  return JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, savedAt: new Date().toISOString(), project });
}

/** Full bundle. Only media referenced by the project are written. */
export function serializeProject(project: Project, media: ProjectMedia): Uint8Array {
  const entries: ZipEntry[] = [{ name: "project.json", data: new TextEncoder().encode(projectToJson(project)) }];
  for (const s of project.samples) {
    const b = media.samples.get(s.id);
    if (b) entries.push({ name: `samples/${s.id}`, data: b });
  }
  for (const id of referencedAssetIds(project)) {
    const b = media.audio.get(id);
    if (b) entries.push({ name: `audio/${id}.wav`, data: b });
  }
  return writeZip(entries);
}

export function referencedAssetIds(p: Project): Set<string> {
  const ids = new Set<string>();
  for (const v of p.vocals)
    for (const t of v.takes) {
      ids.add(t.assetId);
      if (t.processedAssetId) ids.add(t.processedAssetId);
    }
  return ids;
}

export interface ParsedProject {
  project: Project;
  samples: Map<string, Uint8Array>;
  audio: Map<string, Uint8Array>;
  /** Non-fatal problems that were repaired while loading. */
  warnings: string[];
}

// --- small validators -------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const KINDS = INSTRUMENTS.map((i) => i.kind);
const PRESETS = Object.keys(SYNTH_PRESETS) as SynthPreset[];
const EFFECT_TYPES = Object.keys(EFFECT_DEFAULTS) as EffectType[];

function parseStep(s: unknown): Step {
  const o = isObj(s) ? s : {};
  const st: Step = { on: o.on === true, velocity: Math.round(clamp(num(o.velocity, DEFAULT_VELOCITY), VELOCITY_MIN, VELOCITY_MAX)) };
  const roll = num(o.roll, 1);
  if (roll > 1) st.roll = Math.round(clamp(roll, 1, 4));
  const off = num(o.offset, 0);
  if (off) st.offset = clamp(off, -0.5, 0.5);
  return st;
}

function parseSteps(raw: unknown, count: number): Step[] {
  return Array.isArray(raw) ? resizeSteps(raw.map(parseStep), count) : emptySteps(count);
}

function parseNote(n: unknown, steps: number): Note | null {
  if (!isObj(n)) return null;
  const pitch = num(n.pitch, -1);
  if (pitch < 0 || pitch > 127) return null;
  const note: Note = {
    id: str(n.id, "") || newId("n"),
    pitch: Math.round(pitch),
    start: clamp(num(n.start, 0), 0, steps - 0.0625),
    length: clamp(num(n.length, 1), 0.0625, steps),
    velocity: Math.round(clamp(num(n.velocity, DEFAULT_VELOCITY), VELOCITY_MIN, VELOCITY_MAX)),
  };
  if (n.slide === true) note.slide = true;
  return note;
}

function parseEffect(e: unknown): Effect | null {
  if (!isObj(e) || !EFFECT_TYPES.includes(e.type as EffectType)) return null;
  const type = e.type as EffectType;
  const params: Effect["params"] = { ...EFFECT_DEFAULTS[type] };
  if (isObj(e.params))
    for (const [k, v] of Object.entries(e.params)) {
      if ((typeof v === "number" && Number.isFinite(v)) || typeof v === "string" || typeof v === "boolean") params[k] = v;
    }
  return { id: str(e.id, "") || newId("fx"), type, enabled: e.enabled !== false, params };
}

function parseChannel(c: unknown, fallback: Channel): Channel {
  if (!isObj(c)) return fallback;
  const sends = isObj(c.sends) ? c.sends : {};
  return {
    ...fallback,
    name: str(c.name, fallback.name).slice(0, 40) || fallback.name,
    volume: clamp(num(c.volume, fallback.volume), 0, VOLUME_MAX),
    pan: clamp(num(c.pan, fallback.pan), -1, 1),
    mute: c.mute === true,
    solo: c.solo === true,
    sends: { reverb: clamp(num(sends.reverb, fallback.sends.reverb), 0, 1), delay: clamp(num(sends.delay, fallback.sends.delay), 0, 1) },
    inserts: Array.isArray(c.inserts) ? (c.inserts.map(parseEffect).filter(Boolean) as Effect[]) : fallback.inserts,
  };
}

// --- v1 migration ------------------------------------------------------------------------

function migrateV1(p: Obj, warnings: string[], sampleIds: Set<string>): Project {
  const base = createEmptyProject(str(p.name, "Untitled Beat"));
  const stepCount: StepCount = STEP_COUNTS.includes(p.stepCount as StepCount) ? (p.stepCount as StepCount) : 16;
  const tracks: Track[] = [];
  const channels: Channel[] = [];
  const drums: Record<string, Step[]> = {};
  for (const raw of arr(p.tracks)) {
    if (!isObj(raw) || !KINDS.includes(raw.instrument as InstrumentKind)) {
      warnings.push(`Unknown instrument "${String(isObj(raw) ? raw.instrument : raw)}" skipped.`);
      continue;
    }
    let sampleId = typeof raw.sampleId === "string" ? raw.sampleId : null;
    if (sampleId && !sampleIds.has(sampleId)) {
      warnings.push(`Track "${str(raw.name, String(raw.instrument))}": missing sample, using built-in sound.`);
      sampleId = null;
    }
    const t: Track = {
      id: str(raw.id, "") || newId("trk"),
      name: str(raw.name, String(raw.instrument)).slice(0, 60),
      instrument: raw.instrument as InstrumentKind,
      sampleId,
      pitch: Math.round(clamp(num(raw.pitch, 0), -PITCH_RANGE, PITCH_RANGE)),
      chokeGroup: typeof raw.chokeGroup === "number" ? raw.chokeGroup : null,
    };
    tracks.push(t);
    channels.push({ ...drumChannel(t), volume: clamp(num(raw.volume, 0.8), 0, VOLUME_MAX), pan: clamp(num(raw.pan, 0), -1, 1), mute: raw.mute === true, solo: raw.solo === true });
    drums[t.id] = parseSteps(raw.steps, stepCount);
  }
  if (!tracks.length) throw new ProjectFileError("The project contains no usable tracks.");
  const pattern: Pattern = { ...base.patterns[0], stepCount, drums, notes: Object.fromEntries(base.instruments.map((i) => [i.id, []])) };
  const buses = busChannels().map((c) => (c.id === "master" ? { ...c, volume: clamp(num(p.masterVolume, 0.7), 0, VOLUME_MAX) } : c));
  return {
    ...base,
    id: str(p.id, "") || base.id,
    bpm: clampBpm(num(p.bpm, DEFAULT_BPM)),
    swing: Math.round(clamp(num(p.swing, 0), 0, SWING_MAX)),
    timeSignature: parseSig(p.timeSignature),
    tracks,
    patterns: [pattern],
    currentPatternId: pattern.id,
    channels: [...channels, ...base.instruments.map(instrumentChannel), ...base.vocals.map(vocalChannel), ...buses],
    createdAt: str(p.createdAt, base.createdAt),
    updatedAt: str(p.updatedAt, base.updatedAt),
  };
}

function parseSig(raw: unknown): Project["timeSignature"] {
  const ts = isObj(raw) ? raw : {};
  return { beats: Math.round(clamp(num(ts.beats, 4), 1, 16)), beatUnit: ts.beatUnit === 8 ? 8 : 4 };
}

// --- v2 validation -------------------------------------------------------------------------

function parseV2(p: Obj, warnings: string[], sampleIds: Set<string>, assetIds: Set<string> | null): Project {
  const base = createEmptyProject(str(p.name, "Untitled Beat"));
  const tracks: Track[] = [];
  for (const raw of arr(p.tracks)) {
    if (!isObj(raw) || !KINDS.includes(raw.instrument as InstrumentKind)) continue;
    let sampleId = typeof raw.sampleId === "string" ? raw.sampleId : null;
    if (sampleId && !sampleIds.has(sampleId)) {
      warnings.push(`Track "${str(raw.name, String(raw.instrument))}": missing sample, using built-in sound.`);
      sampleId = null;
    }
    const t: Track = {
      id: str(raw.id, "") || newId("trk"),
      name: str(raw.name, String(raw.instrument)).slice(0, 60),
      instrument: raw.instrument as InstrumentKind,
      sampleId,
      pitch: Math.round(clamp(num(raw.pitch, 0), -PITCH_RANGE, PITCH_RANGE)),
      chokeGroup: typeof raw.chokeGroup === "number" ? raw.chokeGroup : null,
    };
    if (isObj(raw.sampleEdit)) {
      const e = raw.sampleEdit;
      const start = clamp(num(e.start, 0), 0, 0.99);
      t.sampleEdit = { start, end: clamp(num(e.end, 1), start + 0.01, 1), reverse: e.reverse === true, fadeIn: clamp(num(e.fadeIn, 0), 0, 5), fadeOut: clamp(num(e.fadeOut, 0.005), 0, 5), gainDb: clamp(num(e.gainDb, 0), -24, 12), loop: e.loop === true };
    }
    tracks.push(t);
  }
  if (!tracks.length) throw new ProjectFileError("The project contains no usable tracks.");

  const instruments: InstrumentTrack[] = arr(p.instruments).flatMap((raw): InstrumentTrack[] => {
    if (!isObj(raw)) return [];
    const preset = PRESETS.includes(raw.preset as SynthPreset) ? (raw.preset as SynthPreset) : "piano";
    const fresh = createInstrument(preset);
    const synth = { ...fresh.synth };
    if (isObj(raw.synth)) {
      const rs = raw.synth;
      for (const k of Object.keys(synth) as (keyof typeof synth)[]) {
        if (k === "wave") synth.wave = WAVES.includes(rs.wave as Waveform) ? (rs.wave as Waveform) : synth.wave;
        else if (k === "mono") synth.mono = typeof rs.mono === "boolean" ? rs.mono : synth.mono;
        else (synth as unknown as Record<string, number>)[k] = num(rs[k], synth[k] as number);
      }
      synth.voices = Math.round(clamp(synth.voices ?? 1, 1, 7));
      synth.octave = Math.round(clamp(synth.octave ?? 0, -2, 2));
    }
    const bass808 = { ...DEFAULT_808 };
    if (isObj(raw.bass808)) for (const k of Object.keys(bass808) as (keyof typeof bass808)[]) bass808[k] = num(raw.bass808[k], bass808[k]);
    return [{ id: str(raw.id, "") || fresh.id, name: str(raw.name, fresh.name).slice(0, 40), preset, synth, bass808, color: str(raw.color, fresh.color) }];
  });

  const patterns: Pattern[] = arr(p.patterns).flatMap((raw, i): Pattern[] => {
    if (!isObj(raw)) return [];
    const stepCount: StepCount = STEP_COUNTS.includes(raw.stepCount as StepCount) ? (raw.stepCount as StepCount) : 16;
    const drumsRaw = isObj(raw.drums) ? raw.drums : {};
    const notesRaw = isObj(raw.notes) ? raw.notes : {};
    return [{
      id: str(raw.id, "") || newId("pat"),
      name: str(raw.name, `Pattern ${i + 1}`).slice(0, 40),
      color: str(raw.color, "#7c5cff"),
      stepCount,
      drums: Object.fromEntries(tracks.map((t) => [t.id, parseSteps(drumsRaw[t.id], stepCount)])),
      notes: Object.fromEntries(instruments.map((ins) => [ins.id, arr(notesRaw[ins.id]).map((n) => parseNote(n, stepCount)).filter((n): n is Note => n !== null)])),
    }];
  });
  if (!patterns.length) patterns.push({ ...base.patterns[0], drums: Object.fromEntries(tracks.map((t) => [t.id, emptySteps(16)])), notes: Object.fromEntries(instruments.map((i) => [i.id, []])) });
  const patternIds = new Set(patterns.map((x) => x.id));

  const assets: AudioAsset[] = arr(p.assets).flatMap((raw): AudioAsset[] => {
    if (!isObj(raw) || typeof raw.id !== "string") return [];
    if (assetIds && !assetIds.has(raw.id)) return [];
    return [{ id: raw.id, name: str(raw.name, "audio"), sampleRate: num(raw.sampleRate, 48000), frames: num(raw.frames, 0), channels: num(raw.channels, 1) }];
  });
  const haveAsset = new Set(assets.map((x) => x.id));

  const vocals: VocalTrack[] = arr(p.vocals).flatMap((raw): VocalTrack[] => {
    if (!isObj(raw)) return [];
    const role = (["lead", "double", "adlibs", "backing", "custom"] as const).find((r) => r === raw.role) ?? "custom";
    const v = createVocalTrack(role, str(raw.name, ""));
    const takes = arr(raw.takes).flatMap((t) => {
      if (!isObj(t) || typeof t.assetId !== "string") return [];
      if (!haveAsset.has(t.assetId)) {
        warnings.push(`Take "${str(t.name, "?")}" of "${v.name}": audio missing, take removed.`);
        return [];
      }
      return [{
        id: str(t.id, "") || newId("take"),
        name: str(t.name, "Take").slice(0, 40),
        assetId: t.assetId,
        startStep: Math.max(0, num(t.startStep, 0)),
        recordedAt: str(t.recordedAt, new Date().toISOString()),
        ...(typeof t.processedAssetId === "string" && haveAsset.has(t.processedAssetId) ? { processedAssetId: t.processedAssetId, processedWith: str(t.processedWith, "") } : {}),
        ...(typeof t.score === "number" ? { score: t.score } : {}),
      }];
    });
    const takeIds = new Set(takes.map((t) => t.id));
    const clips = arr(raw.clips).flatMap((c) =>
      isObj(c) && typeof c.takeId === "string" && takeIds.has(c.takeId)
        ? [{
            id: str(c.id, "") || newId("aclip"), takeId: c.takeId, start: Math.max(0, num(c.start, 0)), offset: Math.max(0, num(c.offset, 0)), duration: Math.max(0.01, num(c.duration, 1)), gainDb: clamp(num(c.gainDb, 0), -24, 24),
            ...(num(c.fadeIn, 0) > 0 ? { fadeIn: clamp(num(c.fadeIn, 0), 0, 60) } : {}),
            ...(num(c.fadeOut, 0) > 0 ? { fadeOut: clamp(num(c.fadeOut, 0), 0, 60) } : {}),
            ...(c.muted === true ? { muted: true } : {}),
          }]
        : [],
    );
    const studio = isObj(raw.studio) ? raw.studio : {};
    const pitch = isObj(studio.pitch) ? studio.pitch : {};
    return [{
      ...v,
      id: str(raw.id, "") || v.id,
      takes,
      clips,
      armed: raw.armed === true,
      playProcessed: raw.playProcessed !== false,
      ...(typeof raw.lyrics === "string" && raw.lyrics ? { lyrics: raw.lyrics.slice(0, 20000) } : {}),
      studio: {
        pitch: { ...v.studio.pitch, enabled: pitch.enabled === true, preset: str(pitch.preset, v.studio.pitch.preset), correction: clamp(num(pitch.correction, 45), 0, 100), retuneMs: clamp(num(pitch.retuneMs, 120), 0, 1000), humanize: clamp(num(pitch.humanize, 60), 0, 100), formant: clamp(num(pitch.formant, 0), -12, 12) },
        clean: (["off", "low", "medium", "high"] as const).find((x) => x === studio.clean) ?? "off",
      },
    }];
  });

  // Channels: every track must have one; buses always exist.
  const rawChannels = new Map(arr(p.channels).filter(isObj).map((c) => [str(c.id, ""), c]));
  const channels: Channel[] = [
    ...tracks.map((t) => parseChannel(rawChannels.get(t.id), drumChannel(t))),
    ...instruments.map((t) => parseChannel(rawChannels.get(t.id), instrumentChannel(t))),
    ...vocals.map((v) => parseChannel(rawChannels.get(v.id), vocalChannel(v))),
    ...busChannels().map((b) => parseChannel(rawChannels.get(b.id), b)),
  ];

  const arrRaw = isObj(p.arrangement) ? p.arrangement : {};
  const loopRaw = isObj(arrRaw.loop) ? arrRaw.loop : {};
  const clips = arr(arrRaw.clips).flatMap((c) =>
    isObj(c) && typeof c.patternId === "string" && patternIds.has(c.patternId)
      ? [{
          id: str(c.id, "") || newId("clip"), patternId: c.patternId, lane: Math.round(clamp(num(c.lane, 0), 0, 31)), start: Math.max(0, num(c.start, 0)), length: Math.max(0.25, num(c.length, 1)),
          ...(num(c.offset, 0) > 0 ? { offset: num(c.offset, 0) } : {}),
          ...(c.muted === true ? { muted: true } : {}),
        }]
      : [],
  );
  const keyRaw = isObj(p.key) ? p.key : {};
  const scale = (Object.keys(SCALES) as ScaleId[]).includes(keyRaw.scale as ScaleId) ? (keyRaw.scale as ScaleId) : "minor";
  const metro = isObj(p.metronome) ? p.metronome : {};
  const channelIds = new Set(channels.map((c) => c.id));
  return {
    id: str(p.id, "") || base.id,
    name: str(p.name, "Untitled Beat").slice(0, 120) || "Untitled Beat",
    bpm: clampBpm(num(p.bpm, DEFAULT_BPM)),
    swing: Math.round(clamp(num(p.swing, 0), 0, SWING_MAX)),
    timeSignature: parseSig(p.timeSignature),
    key: { root: ((Math.round(num(keyRaw.root, 5)) % 12) + 12) % 12, scale },
    tracks,
    instruments,
    patterns,
    currentPatternId: patternIds.has(str(p.currentPatternId, "")) ? str(p.currentPatternId, "") : patterns[0].id,
    arrangement: {
      clips,
      sections: arr(arrRaw.sections).flatMap((s) => (isObj(s) ? [{ id: str(s.id, "") || newId("sec"), name: str(s.name, "Section").slice(0, 30), start: Math.max(0, Math.round(num(s.start, 0))), length: Math.max(1, Math.round(num(s.length, 4))), color: str(s.color, "#7c5cff") }] : [])),
      lanes: Math.round(clamp(num(arrRaw.lanes, 4), Math.max(1, ...clips.map((c) => c.lane + 1)), 32)),
      ...(Array.isArray(arrRaw.laneNames) ? { laneNames: arrRaw.laneNames.slice(0, 32).map((x) => (typeof x === "string" ? x.slice(0, 30) : "")) } : {}),
      loop: { enabled: loopRaw.enabled === true, start: Math.max(0, Math.round(num(loopRaw.start, 0))), end: Math.max(1, Math.round(num(loopRaw.end, 8))) },
    },
    vocals,
    channels,
    automation: arr(p.automation).flatMap((l) =>
      isObj(l) && typeof l.channelId === "string" && channelIds.has(l.channelId) && (l.param === "volume" || l.param === "pan")
        ? [{ id: str(l.id, "") || newId("auto"), channelId: l.channelId, param: l.param, points: arr(l.points).flatMap((pt) => (isObj(pt) ? [{ bar: Math.max(0, num(pt.bar, 0)), value: num(pt.value, 0) }] : [])) }]
        : [],
    ),
    samples: [],
    assets,
    midiMappings: arr(p.midiMappings).flatMap((m) => (isObj(m) && typeof m.source === "string" && typeof m.target === "string" ? [{ source: m.source, target: m.target }] : [])),
    metronome: { enabled: metro.enabled === true, countInBars: Math.round(clamp(num(metro.countInBars, 1), 0, 4)), volume: clamp(num(metro.volume, 0.6), 0, 1) },
    ai: (() => {
      const ai = isObj(p.ai) ? p.ai : {};
      return { lastBeatPrompt: str(ai.lastBeatPrompt, "").slice(0, 500), masterTarget: str(ai.masterTarget, "loud"), melodyComplexity: clamp(num(ai.melodyComplexity, 0.6), 0, 1) };
    })(),
    createdAt: str(p.createdAt, base.createdAt),
    updatedAt: str(p.updatedAt, base.updatedAt),
  };
}

function parseSamples(rawSamples: unknown, hasBytes: (id: string) => boolean, warnings: string[]): SampleMeta[] {
  const out: SampleMeta[] = [];
  for (const s of arr(rawSamples)) {
    if (!isObj(s) || typeof s.id !== "string") continue;
    if (!hasBytes(s.id)) {
      warnings.push(`Sample "${str(s.name, s.id)}" has no audio data and was removed.`);
      continue;
    }
    out.push({ id: s.id, name: str(s.name, "Sample"), mime: str(s.mime, "audio/wav") });
  }
  return out;
}

/**
 * Parse a project. Accepts a v2 bundle (ZIP bytes), a v2 JSON document (autosave) with
 * media supplied separately, or a legacy v1 JSON file. Throws ProjectFileError if unusable.
 */
export function parseProject(input: Uint8Array | string, externalMedia?: Partial<ProjectMedia>): ParsedProject {
  let text: string;
  let bundle = false;
  const samples = new Map<string, Uint8Array>(externalMedia?.samples ?? []);
  const audio = new Map<string, Uint8Array>(externalMedia?.audio ?? []);
  if (typeof input !== "string" && input.length > 4 && input[0] === 0x50 && input[1] === 0x4b) {
    let files: Map<string, Uint8Array>;
    try {
      files = readZip(input);
    } catch (e) {
      throw new ProjectFileError(`Project could not be loaded: ${(e as Error).message}`);
    }
    const json = files.get("project.json");
    if (!json) throw new ProjectFileError("Project could not be loaded: project.json is missing.");
    text = new TextDecoder().decode(json);
    bundle = true;
    for (const [name, data] of files) {
      if (name.startsWith("samples/")) samples.set(name.slice(8), data);
      else if (name.startsWith("audio/")) audio.set(name.slice(6).replace(/\.wav$/, ""), data);
    }
  } else {
    text = typeof input === "string" ? input : new TextDecoder().decode(input);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectFileError("The file is not a valid project (invalid JSON).");
  }
  if (!isObj(data) || data.format !== PROJECT_FORMAT) throw new ProjectFileError("The file is not a Beatmaker Studio project.");
  const version = num(data.version, 0);
  if (version > PROJECT_VERSION) throw new ProjectFileError(`This project was saved by a newer version (format v${version}). Please update the app.`);
  if (!isObj(data.project)) throw new ProjectFileError("The project data is missing.");
  const warnings: string[] = [];

  // v1: samples embedded as base64 in "sampleData".
  if (version < 2 && isObj(data.sampleData)) {
    for (const [id, b64] of Object.entries(data.sampleData)) {
      if (typeof b64 !== "string") continue;
      try {
        samples.set(id, base64ToBytes(b64));
      } catch {
        warnings.push(`Sample "${id}" is corrupted and was removed.`);
      }
    }
  }
  const sampleMeta = parseSamples(data.project.samples, (id) => samples.has(id), warnings);
  const sampleIds = new Set(sampleMeta.map((s) => s.id));
  const project = version < 2 ? migrateV1(data.project, warnings, sampleIds) : parseV2(data.project, warnings, sampleIds, bundle || externalMedia?.audio ? new Set(audio.keys()) : null);
  project.samples = sampleMeta;
  for (const k of [...samples.keys()]) if (!sampleIds.has(k)) samples.delete(k);
  return { project, samples, audio, warnings };
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  return cleaned.slice(0, 80) || "project";
}
