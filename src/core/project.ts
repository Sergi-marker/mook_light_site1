import { DEFAULT_BPM, DEFAULT_VELOCITY, INSTRUMENTS, BPM_MAX, BPM_MIN } from "./constants.ts";
import type {
  Bass808Params, Channel, ChannelKind, Effect, EffectType, InstrumentKind, InstrumentTrack, Pattern,
  Project, Step, StepCount, SynthParams, SynthPreset, Track, VocalRole, VocalTrack,
} from "./types.ts";

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

/** Resize a step array, keeping existing steps and padding with empty ones. */
export function resizeSteps(steps: Step[], count: number): Step[] {
  if (steps.length >= count) return steps.slice(0, count);
  return [...steps, ...emptySteps(count - steps.length)];
}

// --- Fixed bus ids ----------------------------------------------------------------------

export const MASTER = "master";
export const BUS_DRUMS = "bus_drums";
export const BUS_MUSIC = "bus_music";
export const BUS_VOCALS = "bus_vocals";
export const RET_REVERB = "ret_reverb";
export const RET_DELAY = "ret_delay";

export function effect(type: EffectType, params: Effect["params"] = {}, enabled = true): Effect {
  return { id: newId("fx"), type, enabled, params: { ...EFFECT_DEFAULTS[type], ...params } };
}

/** Default parameters of every effect type (units in the parameter names). */
export const EFFECT_DEFAULTS: Record<EffectType, Effect["params"]> = {
  eq: { lowCutHz: 0, lowGainDb: 0, lowFreqHz: 100, midGainDb: 0, midFreqHz: 1000, midQ: 1, highGainDb: 0, highFreqHz: 8000 },
  compressor: { thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 120, kneeDb: 6, makeupDb: 0 },
  limiter: { ceilingDb: -1, releaseMs: 80, inputGainDb: 0 },
  saturation: { drive: 0.3, mix: 1 },
  distortion: { drive: 0.5, toneHz: 6000, mix: 1 },
  deesser: { freq: 6000, thresholdDb: -30, rangeDb: 8 },
  gate: { thresholdDb: -50, rangeDb: 30, attackMs: 1, holdMs: 40, releaseMs: 120 },
  reverb: { size: 0.5, decay: 2.2, preDelayMs: 15, mix: 1, toneHz: 7000 },
  delay: { time: "1/8", feedback: 0.35, mix: 1, toneHz: 5000, pingPong: true },
  denoise: { amountDb: 12 },
  autopitch: { preset: "natural", correction: 45, retuneMs: 120, humanize: 60, formant: 0, useProjectKey: true, root: 0, scale: "minor" },
  leveler: { targetDb: -18, maxDb: 9, speedMs: 400, amount: 50 },
  width: { width: 1.3 },
};

function channel(id: string, name: string, kind: ChannelKind, output: string, extra: Partial<Channel> = {}): Channel {
  return { id, name, kind, volume: 0.8, pan: 0, mute: false, solo: false, output, sends: { reverb: 0, delay: 0 }, inserts: [], ...extra };
}

export function busChannels(): Channel[] {
  return [
    channel(BUS_DRUMS, "DRUM BUS", "bus", MASTER, { volume: 1, inserts: [effect("compressor", { thresholdDb: -12, ratio: 2, attackMs: 20, releaseMs: 150 }, false)] }),
    channel(BUS_MUSIC, "MUSIC BUS", "bus", MASTER, { volume: 1, inserts: [effect("eq", {}, false)] }),
    channel(BUS_VOCALS, "VOCAL BUS", "bus", MASTER, { volume: 1, inserts: [effect("compressor", { thresholdDb: -16, ratio: 2, attackMs: 15, releaseMs: 150 }, false)] }),
    channel(RET_REVERB, "REVERB", "return", MASTER, { volume: 0.7, inserts: [effect("reverb")] }),
    channel(RET_DELAY, "DELAY", "return", MASTER, { volume: 0.6, inserts: [effect("delay")] }),
    channel(MASTER, "MASTER", "master", "", {
      volume: 0.7,
      inserts: [effect("eq", {}, false), effect("compressor", { thresholdDb: -10, ratio: 2, attackMs: 30, releaseMs: 200 }, false), effect("saturation", { drive: 0.1 }, false), effect("limiter", { ceilingDb: -1 })],
    }),
  ];
}

export function drumChannel(t: Track): Channel {
  return channel(t.id, t.name, "drum", BUS_DRUMS, { volume: t.instrument === "808" ? 0.9 : 0.8 });
}

export function createTrack(kind: InstrumentKind): Track {
  const def = INSTRUMENTS.find((i) => i.kind === kind)!;
  return { id: newId("trk"), name: def.label, instrument: kind, sampleId: null, pitch: 0, chokeGroup: def.chokeGroup };
}

// --- Instruments ------------------------------------------------------------------------

export const SYNTH_PRESETS: Record<SynthPreset, { label: string; params: SynthParams; color: string }> = {
  piano: { label: "Piano", color: "#f8fafc", params: { attack: 0.002, decay: 1.2, sustain: 0.25, release: 0.4, cutoff: 6000, resonance: 0.5, filterEnv: 0.3, detune: 3, glide: 0, drive: 0, wave: "sine", voices: 1, octave: 0, lfoRate: 5, lfoDepth: 0, lfoFilter: 0, mono: false } },
  epiano: { label: "E-Piano", color: "#fde68a", params: { attack: 0.003, decay: 1.5, sustain: 0.3, release: 0.5, cutoff: 5000, resonance: 0.5, filterEnv: 0.2, detune: 2, glide: 0, drive: 0.1, wave: "sine", voices: 1, octave: 0, lfoRate: 4.5, lfoDepth: 0, lfoFilter: 0, mono: false } },
  synth: { label: "Synth Lead", color: "#38bdf8", params: { attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.25, cutoff: 3500, resonance: 3, filterEnv: 0.5, detune: 12, glide: 0.03, drive: 0.2, wave: "sawtooth", voices: 2, octave: 0, lfoRate: 5.5, lfoDepth: 0, lfoFilter: 0, mono: false } },
  pad: { label: "Pad", color: "#a78bfa", params: { attack: 0.6, decay: 1, sustain: 0.8, release: 1.4, cutoff: 2200, resonance: 1, filterEnv: 0.2, detune: 18, glide: 0, drive: 0, wave: "sawtooth", voices: 4, octave: 0, lfoRate: 0.3, lfoDepth: 0, lfoFilter: 0.15, mono: false } },
  strings: { label: "Strings", color: "#f472b6", params: { attack: 0.25, decay: 0.5, sustain: 0.85, release: 0.8, cutoff: 3200, resonance: 0.7, filterEnv: 0.1, detune: 10, glide: 0, drive: 0, wave: "sawtooth", voices: 3, octave: 0, lfoRate: 5.5, lfoDepth: 12, lfoFilter: 0, mono: false } },
  pluck: { label: "Pluck", color: "#34d399", params: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.2, cutoff: 5000, resonance: 1, filterEnv: 0.7, detune: 0, glide: 0, drive: 0, wave: "sawtooth", voices: 1, octave: 0, lfoRate: 5, lfoDepth: 0, lfoFilter: 0, mono: false } },
  bells: { label: "Bells", color: "#facc15", params: { attack: 0.001, decay: 2, sustain: 0, release: 1.5, cutoff: 9000, resonance: 0.5, filterEnv: 0, detune: 0, glide: 0, drive: 0, wave: "sine", voices: 1, octave: 0, lfoRate: 5, lfoDepth: 0, lfoFilter: 0, mono: false } },
  bass: { label: "Synth Bass", color: "#fb923c", params: { attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.15, cutoff: 900, resonance: 4, filterEnv: 0.6, detune: 8, glide: 0.04, drive: 0.3, wave: "sawtooth", voices: 2, octave: 0, lfoRate: 5, lfoDepth: 0, lfoFilter: 0, mono: true } },
  "808": { label: "808", color: "#ec4899", params: { attack: 0.002, decay: 1.2, sustain: 0.6, release: 0.3, cutoff: 8000, resonance: 0.5, filterEnv: 0, detune: 0, glide: 0.08, drive: 0, wave: "sine", voices: 1, octave: 0, lfoRate: 5, lfoDepth: 0, lfoFilter: 0, mono: true } },
};

export const DEFAULT_808: Bass808Params = {
  tune: 0, glide: 0.08, attack: 0.002, decay: 1.4, sustain: 0.55, release: 0.25,
  distortion: 0.1, saturation: 0.4, lowBoostDb: 2, highCutHz: 6000, compression: 0.3, punch: 0.5,
};

export function createInstrument(preset: SynthPreset, name?: string): InstrumentTrack {
  const p = SYNTH_PRESETS[preset];
  return { id: newId("ins"), name: name ?? p.label, preset, synth: { ...p.params }, bass808: { ...DEFAULT_808 }, color: p.color };
}

export function instrumentChannel(t: InstrumentTrack): Channel {
  return channel(t.id, t.name, "instrument", BUS_MUSIC, {
    volume: t.preset === "808" ? 0.85 : 0.7,
    sends: { reverb: t.preset === "808" || t.preset === "bass" ? 0 : 0.15, delay: 0 },
  });
}

// --- Vocals -----------------------------------------------------------------------------

const ROLE_NAMES: Record<VocalRole, string> = { lead: "Lead", double: "Double", adlibs: "Adlibs", backing: "Backing", custom: "Vocal" };

export function createVocalTrack(role: VocalRole, name?: string): VocalTrack {
  return {
    id: newId("voc"),
    name: name ?? ROLE_NAMES[role],
    role,
    takes: [],
    clips: [],
    armed: role === "lead",
    playProcessed: true,
    studio: { pitch: { enabled: false, preset: "natural", correction: 45, retuneMs: 120, humanize: 60, formant: 0 }, clean: "off" },
  };
}

/** Default vocal chain (the order matters: it is the real-time processing order). */
export function vocalChain(role: VocalRole): Effect[] {
  return [
    effect("denoise", { amountDb: 10 }, false),
    effect("gate", { thresholdDb: -50 }, false),
    effect("eq", { lowCutHz: 90, midGainDb: role === "lead" ? -1.5 : -2, midFreqHz: 350, highGainDb: 2, highFreqHz: 9000 }),
    effect("deesser"),
    effect("compressor", { thresholdDb: -20, ratio: 3, attackMs: 8, releaseMs: 120, makeupDb: 3 }),
    effect("autopitch", {}, false),
    effect("leveler", {}, false),
    effect("saturation", { drive: 0.15, mix: 0.5 }, false),
    effect("limiter", { ceilingDb: -2 }),
  ];
}

export function vocalChannel(v: VocalTrack): Channel {
  const vol = v.role === "lead" ? 0.85 : v.role === "double" ? 0.55 : 0.6;
  const pan = v.role === "double" ? -0.25 : v.role === "backing" ? 0.3 : 0;
  return channel(v.id, v.name, "vocal", BUS_VOCALS, { volume: vol, pan, sends: { reverb: v.role === "adlibs" ? 0.3 : 0.15, delay: v.role === "adlibs" ? 0.2 : 0.05 }, inserts: vocalChain(v.role) });
}

// --- Patterns & project ----------------------------------------------------------------

export const PATTERN_COLORS = ["#7c5cff", "#22c55e", "#f97316", "#06b6d4", "#e11d48", "#eab308", "#a855f7", "#14b8a6"];

export function createPattern(p: Pick<Project, "tracks" | "instruments">, name: string, stepCount: StepCount = 16, colorIndex = 0): Pattern {
  return {
    id: newId("pat"),
    name,
    color: PATTERN_COLORS[colorIndex % PATTERN_COLORS.length],
    stepCount,
    drums: Object.fromEntries(p.tracks.map((t) => [t.id, emptySteps(stepCount)])),
    notes: Object.fromEntries(p.instruments.map((i) => [i.id, []])),
  };
}

/** A new empty project: 7 drum lanes, piano + 808 instruments, 4 vocal tracks, full mixer. */
export function createEmptyProject(name = "Untitled Beat"): Project {
  const tracks = INSTRUMENTS.map((i) => createTrack(i.kind));
  const instruments = [createInstrument("piano", "Piano"), createInstrument("808", "808 Bass")];
  const vocals = (["lead", "double", "adlibs", "backing"] as VocalRole[]).map((r) => createVocalTrack(r));
  const base = { tracks, instruments };
  const pattern = createPattern(base, "Pattern 1");
  const now = new Date().toISOString();
  return {
    id: newId("prj"),
    name,
    bpm: DEFAULT_BPM,
    swing: 0,
    timeSignature: { beats: 4, beatUnit: 4 },
    key: { root: 5, scale: "minor" },
    tracks,
    instruments,
    patterns: [pattern],
    currentPatternId: pattern.id,
    arrangement: { clips: [], sections: [], lanes: 4, loop: { enabled: false, start: 0, end: 8 } },
    vocals,
    channels: [...tracks.map(drumChannel), ...instruments.map(instrumentChannel), ...vocals.map(vocalChannel), ...busChannels()],
    automation: [],
    samples: [],
    assets: [],
    midiMappings: [],
    metronome: { enabled: false, countInBars: 1, volume: 0.6 },
    ai: { lastBeatPrompt: "", masterTarget: "loud", melodyComplexity: 0.6 },
    createdAt: now,
    updatedAt: now,
  };
}

/** Kept for compatibility with templates: empty project + a starter trap pattern. */
export function createDefaultProject(name = "Untitled Beat", withStarterPattern = true): Project {
  const p = createEmptyProject(name);
  if (!withStarterPattern) return p;
  const pat = p.patterns[0];
  const set = (kind: InstrumentKind, steps: number[], accents: number[] = []) => {
    const t = p.tracks.find((x) => x.instrument === kind)!;
    pat.drums[t.id] = pat.drums[t.id].map((s, i) => (steps.includes(i) ? { on: true, velocity: accents.includes(i) ? 127 : DEFAULT_VELOCITY } : s));
  };
  set("kick", [0, 7, 10]);
  set("snare", [8]);
  set("closedHat", [0, 2, 4, 6, 8, 10, 12, 13, 14], [0, 8]);
  set("openHat", [15]);
  set("808", [0, 7, 10]);
  return p;
}

/** Insert a channel keeping the canonical order: drums, instruments, vocals, buses/returns/master. */
export function insertChannel(channels: Channel[], ch: Channel): Channel[] {
  const rank: Record<ChannelKind, number> = { drum: 0, instrument: 1, vocal: 2, bus: 3, return: 3, master: 3 };
  const r = rank[ch.kind];
  let idx = channels.length;
  for (let i = 0; i < channels.length; i++)
    if (rank[channels[i].kind] > r) {
      idx = i;
      break;
    }
  return [...channels.slice(0, idx), ch, ...channels.slice(idx)];
}

export const DEFAULT_SAMPLE_EDIT = { start: 0, end: 1, reverse: false, fadeIn: 0, fadeOut: 0.005, gainDb: 0, loop: false };

// --- Lookups ----------------------------------------------------------------------------

export function currentPattern(p: Project): Pattern {
  return p.patterns.find((x) => x.id === p.currentPatternId) ?? p.patterns[0];
}

export function getChannel(p: Project, id: string): Channel | undefined {
  return p.channels.find((c) => c.id === id);
}

export function masterChannel(p: Project): Channel {
  return getChannel(p, MASTER)!;
}

const TRACK_KINDS: ChannelKind[] = ["drum", "instrument", "vocal"];

/**
 * A channel is heard if it isn't muted and, when anything is soloed, it is soloed itself
 * or feeds a soloed bus (or is a bus/return/master feeding the soloed material).
 */
export function isChannelAudible(ch: Channel, channels: readonly Channel[]): boolean {
  if (ch.mute) return false;
  if (!TRACK_KINDS.includes(ch.kind)) return true;
  const soloTracks = channels.filter((c) => c.solo && TRACK_KINDS.includes(c.kind));
  const soloBuses = channels.filter((c) => c.solo && c.kind === "bus").map((c) => c.id);
  if (!soloTracks.length && !soloBuses.length) return true;
  return ch.solo || soloBuses.includes(ch.output);
}

/** Total length of the song in bars (arrangement end, at least 1). */
export function songLengthBars(p: Project): number {
  let end = 0;
  for (const c of p.arrangement.clips) end = Math.max(end, c.start + c.length);
  const stepsPerBar = stepsPerBarOf(p);
  for (const v of p.vocals)
    for (const c of v.clips) end = Math.max(end, (c.start + secondsToSteps(c.duration, p.bpm)) / stepsPerBar);
  return Math.max(1, Math.ceil(end));
}

export function stepsPerBarOf(p: Pick<Project, "timeSignature">): number {
  return p.timeSignature.beats * (16 / p.timeSignature.beatUnit);
}

export function secondsToSteps(sec: number, bpm: number): number {
  return (sec * bpm * 4) / 60;
}

export function stepsToSeconds(steps: number, bpm: number): number {
  return (steps * 60) / (bpm * 4);
}
