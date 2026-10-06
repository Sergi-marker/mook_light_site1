import { PITCH_RANGE, STEP_COUNTS, SWING_MAX, VELOCITY_MAX, VELOCITY_MIN, VOLUME_MAX } from "./constants.ts";
import type { Key } from "./music.ts";
import {
  clamp, clampBpm, createInstrument, insertChannel, DEFAULT_SAMPLE_EDIT, createPattern, createVocalTrack, currentPattern, effect, emptySteps,
  instrumentChannel, newId, resizeSteps, vocalChannel, PATTERN_COLORS,
} from "./project.ts";
import type {
  AudioAsset, AudioClip, AutomationLane, Bass808Params, Channel, Effect, EffectType, InstrumentTrack, MidiMapping,
  Note, Pattern, PatternClip, Project, SampleEdit, SampleMeta, Section, Step, StepCount, SynthParams, SynthPreset, Take,
  TimeSignature, Track, VocalRole, VocalTrack,
} from "./types.ts";

export type TrackPatch = Partial<Pick<Track, "name" | "pitch">>;
export type ChannelPatch = Partial<Pick<Channel, "volume" | "pan" | "mute" | "solo" | "name">> & { sends?: Partial<Channel["sends"]> };
export type NoteUpdate = { id: string } & Partial<Omit<Note, "id">>;
export type InstrumentPatch = { name?: string; preset?: SynthPreset; synth?: Partial<SynthParams>; bass808?: Partial<Bass808Params> };
export type VocalPatch = Partial<Pick<VocalTrack, "name" | "armed" | "playProcessed" | "role">> & { studio?: Partial<VocalTrack["studio"]> };
export type ProjectPatch = Partial<Pick<Project, "bpm" | "swing" | "key" | "patterns" | "currentPatternId" | "arrangement" | "instruments" | "channels" | "name">>;

export type Action =
  // Project
  | { type: "setName"; name: string }
  | { type: "setBpm"; bpm: number }
  | { type: "setSwing"; swing: number }
  | { type: "setTimeSignature"; timeSignature: TimeSignature }
  | { type: "setKey"; key: Key }
  | { type: "setMetronome"; metronome: Partial<Project["metronome"]> }
  | { type: "setMasterVolume"; volume: number }
  | { type: "patchProject"; patch: ProjectPatch }
  | { type: "batch"; actions: Action[] }
  // Patterns
  | { type: "addPattern"; name?: string; copyFrom?: string; select?: boolean }
  | { type: "selectPattern"; patternId: string }
  | { type: "renamePattern"; patternId: string; name: string }
  | { type: "deletePattern"; patternId: string }
  | { type: "setStepCount"; stepCount: StepCount }
  | { type: "duplicatePattern" }
  | { type: "clearPattern" }
  // Drum steps (current pattern)
  | { type: "toggleStep"; trackId: string; step: number }
  | { type: "setStep"; trackId: string; step: number; value: Partial<Step> }
  | { type: "setStepVelocity"; trackId: string; step: number; velocity: number }
  | { type: "setDrumSteps"; trackId: string; steps: Step[]; patternId?: string }
  | { type: "clearTrack"; trackId: string }
  | { type: "humanize"; amount: number; seed?: number }
  | { type: "quantize"; strength?: number; grid?: number }
  // Drum tracks & samples
  | { type: "updateTrack"; trackId: string; patch: TrackPatch }
  | { type: "addSample"; sample: SampleMeta }
  | { type: "assignSample"; trackId: string; sampleId: string | null }
  | { type: "editSample"; trackId: string; edit: Partial<SampleEdit> | null }
  | { type: "setAiSettings"; ai: Partial<Project["ai"]> }
  | { type: "removeSample"; sampleId: string }
  // Mixer
  | { type: "updateChannel"; channelId: string; patch: ChannelPatch }
  | { type: "toggleMute"; trackId: string }
  | { type: "toggleSolo"; trackId: string }
  | { type: "addEffect"; channelId: string; effectType: EffectType; index?: number }
  | { type: "removeEffect"; channelId: string; effectId: string }
  | { type: "moveEffect"; channelId: string; effectId: string; delta: number }
  | { type: "updateEffect"; channelId: string; effectId: string; params?: Effect["params"]; enabled?: boolean }
  | { type: "setInserts"; channelId: string; inserts: Effect[] }
  // Instruments & notes
  | { type: "addInstrument"; preset: SynthPreset; name?: string }
  | { type: "removeInstrument"; trackId: string }
  | { type: "updateInstrument"; trackId: string; patch: InstrumentPatch }
  | { type: "addNotes"; trackId: string; notes: Omit<Note, "id">[]; patternId?: string }
  | { type: "updateNotes"; trackId: string; updates: NoteUpdate[]; patternId?: string }
  | { type: "removeNotes"; trackId: string; ids: string[]; patternId?: string }
  | { type: "setNotes"; trackId: string; notes: Omit<Note, "id">[]; patternId?: string }
  // Arrangement
  | { type: "addClip"; clip: Omit<PatternClip, "id"> }
  | { type: "updateClip"; clipId: string; patch: Partial<Omit<PatternClip, "id">> }
  | { type: "removeClips"; ids: string[] }
  | { type: "duplicateClips"; ids: string[] }
  | { type: "addSection"; section: Omit<Section, "id"> }
  | { type: "updateSection"; sectionId: string; patch: Partial<Omit<Section, "id">> }
  | { type: "removeSection"; sectionId: string }
  | { type: "setLoop"; loop: Partial<Project["arrangement"]["loop"]> }
  | { type: "setLanes"; lanes: number }
  // Vocals
  | { type: "addVocalTrack"; role: VocalRole; name?: string }
  | { type: "removeVocalTrack"; trackId: string }
  | { type: "updateVocalTrack"; trackId: string; patch: VocalPatch }
  | { type: "addTake"; trackId: string; take: Take; asset: AudioAsset; clip?: Omit<AudioClip, "id"> | null }
  | { type: "renameTake"; trackId: string; takeId: string; name: string }
  | { type: "deleteTake"; trackId: string; takeId: string }
  | { type: "setTakeProcessed"; trackId: string; takeId: string; asset: AudioAsset | null; processedWith?: string }
  | { type: "setTakeScores"; trackId: string; scores: Record<string, number> }
  | { type: "updateAudioClip"; trackId: string; clipId: string; patch: Partial<Omit<AudioClip, "id">> }
  | { type: "removeAudioClips"; trackId: string; ids: string[] }
  | { type: "setAudioClips"; trackId: string; clips: Omit<AudioClip, "id">[] }
  // Automation & MIDI
  | { type: "setAutomation"; lane: AutomationLane }
  | { type: "removeAutomation"; laneId: string }
  | { type: "setMidiMappings"; mappings: MidiMapping[] };

// --- helpers ----------------------------------------------------------------------------

function mapArr<T extends { id: string }>(arr: T[], id: string, fn: (x: T) => T): T[] {
  let changed = false;
  const out = arr.map((x) => {
    if (x.id !== id) return x;
    const n = fn(x);
    if (n !== x) changed = true;
    return n;
  });
  return changed ? out : arr;
}

function withPattern(p: Project, patternId: string | undefined, fn: (pat: Pattern) => Pattern): Project {
  const id = patternId ?? currentPattern(p).id;
  const patterns = mapArr(p.patterns, id, fn);
  return patterns === p.patterns ? p : { ...p, patterns };
}

function withChannel(p: Project, id: string, fn: (c: Channel) => Channel): Project {
  const channels = mapArr(p.channels, id, fn);
  return channels === p.channels ? p : { ...p, channels };
}

function withVocal(p: Project, id: string, fn: (v: VocalTrack) => VocalTrack): Project {
  const vocals = mapArr(p.vocals, id, fn);
  return vocals === p.vocals ? p : { ...p, vocals };
}

function setDrumStep(pat: Pattern, trackId: string, step: number, fn: (s: Step) => Step): Pattern {
  const steps = pat.drums[trackId];
  if (!steps || !Number.isInteger(step) || step < 0 || step >= steps.length) return pat;
  const next = fn(steps[step]);
  if (next === steps[step]) return pat;
  const copy = steps.slice();
  copy[step] = next;
  return { ...pat, drums: { ...pat.drums, [trackId]: copy } };
}

const sameShallow = (a: object, b: object) =>
  Object.keys(b).every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);

function cleanNote(n: Omit<Note, "id">, patternSteps: number): Omit<Note, "id"> {
  return {
    pitch: Math.round(clamp(n.pitch, 0, 127)),
    start: clamp(n.start, 0, patternSteps - 0.0625),
    length: clamp(n.length, 0.0625, patternSteps),
    velocity: Math.round(clamp(n.velocity, VELOCITY_MIN, VELOCITY_MAX)),
    ...(n.slide ? { slide: true } : {}),
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cleanEffectParams(type: EffectType, params: Effect["params"]): Effect["params"] {
  const out: Effect["params"] = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "number" && !Number.isFinite(v)) continue;
    out[k] = v;
  }
  void type;
  return out;
}

// --- reducer ----------------------------------------------------------------------------

/** Pure state transition. Returns the same object when nothing changes. */
export function reduce(p: Project, a: Action): Project {
  switch (a.type) {
    case "batch":
      return a.actions.reduce(reduce, p);
    case "patchProject": {
      const patch = { ...a.patch };
      if (patch.bpm !== undefined) patch.bpm = clampBpm(patch.bpm);
      return { ...p, ...patch };
    }
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
    case "setTimeSignature": {
      const beats = Math.round(clamp(a.timeSignature.beats, 1, 16));
      const beatUnit = a.timeSignature.beatUnit === 8 ? 8 : 4;
      if (beats === p.timeSignature.beats && beatUnit === p.timeSignature.beatUnit) return p;
      return { ...p, timeSignature: { beats, beatUnit } };
    }
    case "setKey": {
      const key = { root: ((Math.round(a.key.root) % 12) + 12) % 12, scale: a.key.scale };
      return key.root === p.key.root && key.scale === p.key.scale ? p : { ...p, key };
    }
    case "setMetronome": {
      const m = { ...p.metronome, ...a.metronome };
      m.countInBars = Math.round(clamp(m.countInBars, 0, 4));
      m.volume = clamp(m.volume, 0, 1);
      return sameShallow(p.metronome, m) ? p : { ...p, metronome: m };
    }
    case "setMasterVolume":
      return withChannel(p, "master", (c) => {
        const v = clamp(a.volume, 0, VOLUME_MAX);
        return v === c.volume ? c : { ...c, volume: v };
      });

    // --- patterns
    case "addPattern": {
      const src = a.copyFrom ? p.patterns.find((x) => x.id === a.copyFrom) : undefined;
      const base = createPattern(p, a.name ?? `Pattern ${p.patterns.length + 1}`, src?.stepCount ?? 16, p.patterns.length);
      const pat: Pattern = src
        ? {
            ...base,
            name: a.name ?? `${src.name} (copie)`,
            drums: Object.fromEntries(Object.entries(src.drums).map(([k, v]) => [k, v.map((s) => ({ ...s }))])),
            notes: Object.fromEntries(Object.entries(src.notes).map(([k, v]) => [k, v.map((n) => ({ ...n, id: newId("n") }))])),
          }
        : base;
      return { ...p, patterns: [...p.patterns, pat], currentPatternId: a.select === false ? p.currentPatternId : pat.id };
    }
    case "selectPattern":
      return p.patterns.some((x) => x.id === a.patternId) && a.patternId !== p.currentPatternId ? { ...p, currentPatternId: a.patternId } : p;
    case "renamePattern": {
      const name = a.name.trim().slice(0, 40);
      if (!name) return p;
      const patterns = mapArr(p.patterns, a.patternId, (x) => (x.name === name ? x : { ...x, name }));
      return patterns === p.patterns ? p : { ...p, patterns };
    }
    case "deletePattern": {
      if (p.patterns.length <= 1 || !p.patterns.some((x) => x.id === a.patternId)) return p;
      const patterns = p.patterns.filter((x) => x.id !== a.patternId);
      return {
        ...p,
        patterns,
        currentPatternId: p.currentPatternId === a.patternId ? patterns[0].id : p.currentPatternId,
        arrangement: { ...p.arrangement, clips: p.arrangement.clips.filter((c) => c.patternId !== a.patternId) },
      };
    }
    case "setStepCount":
      if (!STEP_COUNTS.includes(a.stepCount)) return p;
      return withPattern(p, undefined, (pat) =>
        pat.stepCount === a.stepCount
          ? pat
          : {
              ...pat,
              stepCount: a.stepCount,
              drums: Object.fromEntries(Object.entries(pat.drums).map(([k, v]) => [k, resizeSteps(v, a.stepCount)])),
              notes: Object.fromEntries(Object.entries(pat.notes).map(([k, v]) => [k, v.filter((n) => n.start < a.stepCount).map((n) => ({ ...n, length: Math.min(n.length, a.stepCount - n.start) }))])),
            },
      );
    case "duplicatePattern":
      // Doubles the current pattern length by repeating its content (16→32→64).
      return withPattern(p, undefined, (pat) => {
        const next = STEP_COUNTS[STEP_COUNTS.indexOf(pat.stepCount) + 1];
        if (!next) return pat;
        return {
          ...pat,
          stepCount: next,
          drums: Object.fromEntries(Object.entries(pat.drums).map(([k, v]) => [k, [...v, ...v.map((s) => ({ ...s }))]])),
          notes: Object.fromEntries(Object.entries(pat.notes).map(([k, v]) => [k, [...v, ...v.map((n) => ({ ...n, id: newId("n"), start: n.start + pat.stepCount }))]])),
        };
      });
    case "clearPattern":
      return withPattern(p, undefined, (pat) => {
        const any = Object.values(pat.drums).some((v) => v.some((s) => s.on)) || Object.values(pat.notes).some((v) => v.length);
        if (!any) return pat;
        return {
          ...pat,
          drums: Object.fromEntries(Object.keys(pat.drums).map((k) => [k, emptySteps(pat.stepCount)])),
          notes: Object.fromEntries(Object.keys(pat.notes).map((k) => [k, []])),
        };
      });

    // --- drum steps
    case "toggleStep":
      return withPattern(p, undefined, (pat) => setDrumStep(pat, a.trackId, a.step, (s) => ({ ...s, on: !s.on })));
    case "setStep":
      return withPattern(p, undefined, (pat) =>
        setDrumStep(pat, a.trackId, a.step, (s) => {
          const n: Step = { ...s, ...a.value };
          n.velocity = Math.round(clamp(n.velocity, VELOCITY_MIN, VELOCITY_MAX));
          if (n.roll !== undefined) n.roll = Math.round(clamp(n.roll, 1, 4));
          if (n.roll === 1) delete n.roll;
          if (n.offset !== undefined) n.offset = clamp(n.offset, -0.5, 0.5);
          if (n.offset === 0) delete n.offset;
          return sameShallow(s, n) && Object.keys(s).length === Object.keys(n).length ? s : n;
        }),
      );
    case "setStepVelocity":
      return withPattern(p, undefined, (pat) =>
        setDrumStep(pat, a.trackId, a.step, (s) => {
          const velocity = Math.round(clamp(a.velocity, VELOCITY_MIN, VELOCITY_MAX));
          return s.velocity === velocity ? s : { ...s, velocity };
        }),
      );
    case "setDrumSteps":
      return withPattern(p, a.patternId, (pat) =>
        pat.drums[a.trackId] ? { ...pat, drums: { ...pat.drums, [a.trackId]: resizeSteps(a.steps.map((s) => ({ ...s })), pat.stepCount) } } : pat,
      );
    case "clearTrack":
      return withPattern(p, undefined, (pat) => {
        const steps = pat.drums[a.trackId];
        if (steps) return steps.some((s) => s.on) ? { ...pat, drums: { ...pat.drums, [a.trackId]: emptySteps(pat.stepCount) } } : pat;
        const notes = pat.notes[a.trackId];
        return notes?.length ? { ...pat, notes: { ...pat.notes, [a.trackId]: [] } } : pat;
      });
    case "humanize": {
      const amt = clamp(a.amount, 0, 1);
      const rnd = mulberry32(a.seed ?? 12345);
      return withPattern(p, undefined, (pat) => ({
        ...pat,
        drums: Object.fromEntries(
          Object.entries(pat.drums).map(([k, v]) => [
            k,
            v.map((s) => {
              if (!s.on) return s;
              const offset = Math.round((rnd() - 0.5) * 0.24 * amt * 1000) / 1000;
              const velocity = Math.round(clamp(s.velocity + (rnd() - 0.5) * 40 * amt, VELOCITY_MIN, VELOCITY_MAX));
              const n: Step = { ...s, velocity };
              if (offset) n.offset = offset;
              else delete n.offset;
              return n;
            }),
          ]),
        ),
        notes: Object.fromEntries(
          Object.entries(pat.notes).map(([k, v]) => [
            k,
            v.map((n) => ({
              ...n,
              start: clamp(n.start + (rnd() - 0.5) * 0.24 * amt, 0, pat.stepCount - 0.0625),
              velocity: Math.round(clamp(n.velocity + (rnd() - 0.5) * 30 * amt, VELOCITY_MIN, VELOCITY_MAX)),
            })),
          ]),
        ),
      }));
    }
    case "quantize": {
      const strength = clamp(a.strength ?? 1, 0, 1);
      const grid = a.grid ?? 1;
      const q = (x: number) => x + (Math.round(x / grid) * grid - x) * strength;
      return withPattern(p, undefined, (pat) => ({
        ...pat,
        drums: Object.fromEntries(
          Object.entries(pat.drums).map(([k, v]) => [
            k,
            v.map((s) => {
              if (s.offset === undefined) return s;
              const off = s.offset * (1 - strength);
              const n = { ...s };
              if (Math.abs(off) < 1e-3) delete n.offset;
              else n.offset = off;
              return n;
            }),
          ]),
        ),
        notes: Object.fromEntries(
          Object.entries(pat.notes).map(([k, v]) => [k, v.map((n) => ({ ...n, start: clamp(q(n.start), 0, pat.stepCount - grid) }))]),
        ),
      }));
    }

    // --- drum tracks & samples
    case "updateTrack": {
      const tracks = mapArr(p.tracks, a.trackId, (t) => {
        const next = { ...t };
        if (a.patch.name !== undefined) next.name = a.patch.name.trim().slice(0, 60) || t.name;
        if (a.patch.pitch !== undefined) next.pitch = Math.round(clamp(a.patch.pitch, -PITCH_RANGE, PITCH_RANGE));
        return next.name === t.name && next.pitch === t.pitch ? t : next;
      });
      return tracks === p.tracks ? p : { ...p, tracks };
    }
    case "addSample":
      if (p.samples.some((s) => s.id === a.sample.id)) return p;
      return { ...p, samples: [...p.samples, a.sample] };
    case "assignSample": {
      if (a.sampleId !== null && !p.samples.some((s) => s.id === a.sampleId)) return p;
      const tracks = mapArr(p.tracks, a.trackId, (t) => (t.sampleId === a.sampleId ? t : { ...t, sampleId: a.sampleId }));
      return tracks === p.tracks ? p : { ...p, tracks };
    }
    case "editSample": {
      const tracks = mapArr(p.tracks, a.trackId, (t) => {
        if (a.edit === null) {
          if (!t.sampleEdit) return t;
          const n = { ...t };
          delete n.sampleEdit;
          return n;
        }
        const e: SampleEdit = { ...DEFAULT_SAMPLE_EDIT, ...(t.sampleEdit ?? {}), ...a.edit };
        e.start = clamp(e.start, 0, 0.99);
        e.end = clamp(e.end, e.start + 0.01, 1);
        e.fadeIn = clamp(e.fadeIn, 0, 5);
        e.fadeOut = clamp(e.fadeOut, 0, 5);
        e.gainDb = clamp(e.gainDb, -24, 12);
        return { ...t, sampleEdit: e };
      });
      return tracks === p.tracks ? p : { ...p, tracks };
    }
    case "setAiSettings":
      return { ...p, ai: { ...p.ai, ...a.ai } };
    case "removeSample":
      if (!p.samples.some((s) => s.id === a.sampleId)) return p;
      return {
        ...p,
        samples: p.samples.filter((s) => s.id !== a.sampleId),
        tracks: p.tracks.map((t) => (t.sampleId === a.sampleId ? { ...t, sampleId: null } : t)),
      };

    // --- mixer
    case "updateChannel":
      return withChannel(p, a.channelId, (c) => {
        const n: Channel = { ...c, sends: { ...c.sends } };
        const q = a.patch;
        if (q.volume !== undefined) n.volume = clamp(q.volume, 0, VOLUME_MAX);
        if (q.pan !== undefined) n.pan = clamp(q.pan, -1, 1);
        if (q.mute !== undefined) n.mute = q.mute;
        if (q.solo !== undefined) n.solo = q.solo;
        if (q.name !== undefined) n.name = q.name.trim().slice(0, 40) || c.name;
        if (q.sends?.reverb !== undefined) n.sends.reverb = clamp(q.sends.reverb, 0, 1);
        if (q.sends?.delay !== undefined) n.sends.delay = clamp(q.sends.delay, 0, 1);
        const same = n.volume === c.volume && n.pan === c.pan && n.mute === c.mute && n.solo === c.solo && n.name === c.name && n.sends.reverb === c.sends.reverb && n.sends.delay === c.sends.delay;
        return same ? c : n;
      });
    case "toggleMute":
      return withChannel(p, a.trackId, (c) => ({ ...c, mute: !c.mute }));
    case "toggleSolo":
      return withChannel(p, a.trackId, (c) => (c.kind === "master" || c.kind === "return" ? c : { ...c, solo: !c.solo }));
    case "addEffect":
      return withChannel(p, a.channelId, (c) => {
        const ins = c.inserts.slice();
        ins.splice(a.index ?? ins.length, 0, effect(a.effectType));
        return { ...c, inserts: ins };
      });
    case "removeEffect":
      return withChannel(p, a.channelId, (c) => (c.inserts.some((e) => e.id === a.effectId) ? { ...c, inserts: c.inserts.filter((e) => e.id !== a.effectId) } : c));
    case "moveEffect":
      return withChannel(p, a.channelId, (c) => {
        const i = c.inserts.findIndex((e) => e.id === a.effectId);
        const j = i + a.delta;
        if (i < 0 || j < 0 || j >= c.inserts.length) return c;
        const ins = c.inserts.slice();
        [ins[i], ins[j]] = [ins[j], ins[i]];
        return { ...c, inserts: ins };
      });
    case "updateEffect":
      return withChannel(p, a.channelId, (c) => {
        const inserts = mapArr(c.inserts, a.effectId, (e) => {
          const params = a.params ? { ...e.params, ...cleanEffectParams(e.type, a.params) } : e.params;
          const enabled = a.enabled ?? e.enabled;
          if (enabled === e.enabled && sameShallow(e.params, params)) return e;
          return { ...e, params, enabled };
        });
        return inserts === c.inserts ? c : { ...c, inserts };
      });
    case "setInserts":
      return withChannel(p, a.channelId, (c) => ({ ...c, inserts: a.inserts.map((e) => ({ ...e, params: { ...e.params } })) }));

    // --- instruments & notes
    case "addInstrument": {
      const ins = createInstrument(a.preset, a.name);
      return {
        ...p,
        instruments: [...p.instruments, ins],
        channels: insertChannel(p.channels, instrumentChannel(ins)),
        patterns: p.patterns.map((pat) => ({ ...pat, notes: { ...pat.notes, [ins.id]: [] } })),
      };
    }
    case "removeInstrument":
      if (!p.instruments.some((i) => i.id === a.trackId)) return p;
      return {
        ...p,
        instruments: p.instruments.filter((i) => i.id !== a.trackId),
        channels: p.channels.filter((c) => c.id !== a.trackId),
        patterns: p.patterns.map((pat) => {
          const notes = { ...pat.notes };
          delete notes[a.trackId];
          return { ...pat, notes };
        }),
        automation: p.automation.filter((l) => l.channelId !== a.trackId),
      };
    case "updateInstrument": {
      const instruments = mapArr(p.instruments, a.trackId, (t): InstrumentTrack => {
        const n = { ...t, synth: { ...t.synth, ...(a.patch.synth ?? {}) }, bass808: { ...t.bass808, ...(a.patch.bass808 ?? {}) } };
        if (a.patch.name) n.name = a.patch.name.trim().slice(0, 40) || t.name;
        if (a.patch.preset && a.patch.preset !== t.preset) {
          const fresh = createInstrument(a.patch.preset);
          n.preset = a.patch.preset;
          n.synth = fresh.synth;
          n.color = fresh.color;
        }
        return n;
      });
      return instruments === p.instruments ? p : { ...p, instruments };
    }
    case "addNotes":
      return withPattern(p, a.patternId, (pat) => {
        if (!pat.notes[a.trackId] || !a.notes.length) return pat;
        const added = a.notes.map((n) => ({ id: newId("n"), ...cleanNote(n, pat.stepCount) }));
        return { ...pat, notes: { ...pat.notes, [a.trackId]: [...pat.notes[a.trackId], ...added] } };
      });
    case "setNotes":
      return withPattern(p, a.patternId, (pat) =>
        pat.notes[a.trackId] === undefined ? pat : { ...pat, notes: { ...pat.notes, [a.trackId]: a.notes.map((n) => ({ id: newId("n"), ...cleanNote(n, pat.stepCount) })) } },
      );
    case "updateNotes":
      return withPattern(p, a.patternId, (pat) => {
        const list = pat.notes[a.trackId];
        if (!list) return pat;
        const byId = new Map(a.updates.map((u) => [u.id, u]));
        let changed = false;
        const next = list.map((n) => {
          const u = byId.get(n.id);
          if (!u) return n;
          const merged = { id: n.id, ...cleanNote({ ...n, ...u }, pat.stepCount) };
          if (u.slide === false) delete merged.slide;
          if (sameShallow(n, merged) && sameShallow(merged, n)) return n;
          changed = true;
          return merged;
        });
        return changed ? { ...pat, notes: { ...pat.notes, [a.trackId]: next } } : pat;
      });
    case "removeNotes":
      return withPattern(p, a.patternId, (pat) => {
        const list = pat.notes[a.trackId];
        if (!list) return pat;
        const ids = new Set(a.ids);
        const next = list.filter((n) => !ids.has(n.id));
        return next.length === list.length ? pat : { ...pat, notes: { ...pat.notes, [a.trackId]: next } };
      });

    // --- arrangement
    case "addClip": {
      if (!p.patterns.some((x) => x.id === a.clip.patternId)) return p;
      const clip: PatternClip = {
        id: newId("clip"),
        patternId: a.clip.patternId,
        lane: Math.round(clamp(a.clip.lane, 0, 31)),
        start: Math.max(0, Math.round(a.clip.start * 4) / 4),
        length: Math.max(0.25, Math.round(a.clip.length * 4) / 4),
      };
      const lanes = Math.max(p.arrangement.lanes, clip.lane + 1);
      return { ...p, arrangement: { ...p.arrangement, lanes, clips: [...p.arrangement.clips, clip] } };
    }
    case "updateClip": {
      const clips = mapArr(p.arrangement.clips, a.clipId, (c) => {
        const n = { ...c, ...a.patch };
        n.start = Math.max(0, Math.round(n.start * 4) / 4);
        n.length = Math.max(0.25, Math.round(n.length * 4) / 4);
        n.lane = Math.round(clamp(n.lane, 0, 31));
        return sameShallow(c, n) ? c : n;
      });
      if (clips === p.arrangement.clips) return p;
      const lanes = Math.max(p.arrangement.lanes, ...clips.map((c) => c.lane + 1));
      return { ...p, arrangement: { ...p.arrangement, clips, lanes } };
    }
    case "removeClips": {
      const ids = new Set(a.ids);
      const clips = p.arrangement.clips.filter((c) => !ids.has(c.id));
      return clips.length === p.arrangement.clips.length ? p : { ...p, arrangement: { ...p.arrangement, clips } };
    }
    case "duplicateClips": {
      const src = p.arrangement.clips.filter((c) => a.ids.includes(c.id));
      if (!src.length) return p;
      const end = Math.max(...src.map((c) => c.start + c.length));
      const begin = Math.min(...src.map((c) => c.start));
      const copies = src.map((c) => ({ ...c, id: newId("clip"), start: c.start + (end - begin) }));
      return { ...p, arrangement: { ...p.arrangement, clips: [...p.arrangement.clips, ...copies] } };
    }
    case "addSection": {
      const s: Section = { id: newId("sec"), ...a.section, start: Math.max(0, Math.round(a.section.start)), length: Math.max(1, Math.round(a.section.length)) };
      return { ...p, arrangement: { ...p.arrangement, sections: [...p.arrangement.sections, s].sort((x, y) => x.start - y.start) } };
    }
    case "updateSection": {
      const sections = mapArr(p.arrangement.sections, a.sectionId, (s) => {
        const n = { ...s, ...a.patch };
        n.start = Math.max(0, Math.round(n.start));
        n.length = Math.max(1, Math.round(n.length));
        n.name = n.name.trim().slice(0, 30) || s.name;
        return sameShallow(s, n) ? s : n;
      });
      return sections === p.arrangement.sections ? p : { ...p, arrangement: { ...p.arrangement, sections: sections.slice().sort((x, y) => x.start - y.start) } };
    }
    case "removeSection": {
      const sections = p.arrangement.sections.filter((s) => s.id !== a.sectionId);
      return sections.length === p.arrangement.sections.length ? p : { ...p, arrangement: { ...p.arrangement, sections } };
    }
    case "setLoop": {
      const loop = { ...p.arrangement.loop, ...a.loop };
      loop.start = Math.max(0, Math.round(loop.start));
      loop.end = Math.max(loop.start + 1, Math.round(loop.end));
      return sameShallow(p.arrangement.loop, loop) ? p : { ...p, arrangement: { ...p.arrangement, loop } };
    }
    case "setLanes": {
      const lanes = Math.round(clamp(a.lanes, Math.max(1, ...p.arrangement.clips.map((c) => c.lane + 1)), 32));
      return lanes === p.arrangement.lanes ? p : { ...p, arrangement: { ...p.arrangement, lanes } };
    }

    // --- vocals
    case "addVocalTrack": {
      const v = createVocalTrack(a.role, a.name);
      return { ...p, vocals: [...p.vocals, v], channels: insertChannel(p.channels, vocalChannel(v)) };
    }
    case "removeVocalTrack":
      if (!p.vocals.some((v) => v.id === a.trackId)) return p;
      return {
        ...p,
        vocals: p.vocals.filter((v) => v.id !== a.trackId),
        channels: p.channels.filter((c) => c.id !== a.trackId),
        automation: p.automation.filter((l) => l.channelId !== a.trackId),
      };
    case "updateVocalTrack": {
      if (!p.vocals.some((v) => v.id === a.trackId)) return p;
      const vocals = p.vocals.map((v) => {
        if (v.id === a.trackId) {
          const n: VocalTrack = { ...v, ...a.patch, studio: { ...v.studio, ...(a.patch.studio ?? {}) } };
          if (a.patch.name !== undefined) n.name = a.patch.name.trim().slice(0, 40) || v.name;
          return n;
        }
        // Only one armed track at a time keeps recording predictable.
        return a.patch.armed && v.armed ? { ...v, armed: false } : v;
      });
      return { ...p, vocals };
    }
    case "addTake":
      return {
        ...withVocal(p, a.trackId, (v) => ({
          ...v,
          takes: [...v.takes, a.take],
          clips: a.clip ? [...v.clips.filter((c) => !overlaps(c, a.clip!, p.bpm)), { id: newId("aclip"), ...a.clip }] : v.clips,
        })),
        assets: p.assets.some((x) => x.id === a.asset.id) ? p.assets : [...p.assets, a.asset],
      };
    case "renameTake":
      return withVocal(p, a.trackId, (v) => ({ ...v, takes: mapArr(v.takes, a.takeId, (t) => ({ ...t, name: a.name.trim().slice(0, 40) || t.name })) }));
    case "deleteTake":
      return withVocal(p, a.trackId, (v) =>
        v.takes.some((t) => t.id === a.takeId) ? { ...v, takes: v.takes.filter((t) => t.id !== a.takeId), clips: v.clips.filter((c) => c.takeId !== a.takeId) } : v,
      );
    case "setTakeProcessed": {
      const q = withVocal(p, a.trackId, (v) => ({
        ...v,
        takes: mapArr(v.takes, a.takeId, (t) => {
          const n = { ...t };
          if (a.asset) {
            n.processedAssetId = a.asset.id;
            n.processedWith = a.processedWith ?? "";
          } else {
            delete n.processedAssetId;
            delete n.processedWith;
          }
          return n;
        }),
      }));
      return a.asset && !q.assets.some((x) => x.id === a.asset!.id) ? { ...q, assets: [...q.assets, a.asset] } : q;
    }
    case "setTakeScores":
      return withVocal(p, a.trackId, (v) => ({ ...v, takes: v.takes.map((t) => (a.scores[t.id] !== undefined ? { ...t, score: Math.round(a.scores[t.id]) } : t)) }));
    case "updateAudioClip":
      return withVocal(p, a.trackId, (v) => ({
        ...v,
        clips: mapArr(v.clips, a.clipId, (c) => {
          const n = { ...c, ...a.patch };
          n.start = Math.max(0, n.start);
          n.offset = Math.max(0, n.offset);
          n.duration = Math.max(0.01, n.duration);
          n.gainDb = clamp(n.gainDb, -24, 24);
          return sameShallow(c, n) ? c : n;
        }),
      }));
    case "removeAudioClips":
      return withVocal(p, a.trackId, (v) => {
        const ids = new Set(a.ids);
        const clips = v.clips.filter((c) => !ids.has(c.id));
        return clips.length === v.clips.length ? v : { ...v, clips };
      });
    case "setAudioClips":
      return withVocal(p, a.trackId, (v) => ({ ...v, clips: a.clips.map((c) => ({ id: newId("aclip"), ...c })) }));

    // --- automation & MIDI
    case "setAutomation": {
      const lane = { ...a.lane, points: a.lane.points.map((pt) => ({ bar: Math.max(0, pt.bar), value: pt.value })).sort((x, y) => x.bar - y.bar) };
      const exists = p.automation.some((l) => l.id === lane.id);
      return { ...p, automation: exists ? p.automation.map((l) => (l.id === lane.id ? lane : l)) : [...p.automation, lane] };
    }
    case "removeAutomation": {
      const automation = p.automation.filter((l) => l.id !== a.laneId);
      return automation.length === p.automation.length ? p : { ...p, automation };
    }
    case "setMidiMappings":
      return { ...p, midiMappings: a.mappings.map((m) => ({ ...m })) };
  }
}

/** Does a new clip overlap an existing one on the same track (seconds-based)? */
function overlaps(c: AudioClip, n: Omit<AudioClip, "id">, bpm: number): boolean {
  const toSec = (steps: number) => (steps * 60) / (bpm * 4);
  const a0 = toSec(c.start), a1 = a0 + c.duration;
  const b0 = toSec(n.start), b1 = b0 + n.duration;
  // The new take replaces fully covered clips only (partially covered ones stay: comping).
  return b0 <= a0 + 1e-3 && b1 >= a1 - 1e-3;
}

export { PATTERN_COLORS };
