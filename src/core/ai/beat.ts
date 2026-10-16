// AI BEAT GENERATOR: turns a request into an editable song — drums, 808, chords, melody,
// patterns per section and a full arrangement. Never a flat audio file.

import { createInstrument, createPattern, insertChannel, instrumentChannel, PATTERN_COLORS, newId } from "../project.ts";
import type { ProjectPatch } from "../reducer.ts";
import type { InstrumentKind, InstrumentTrack, Pattern, PatternClip, Project, Section, SynthPreset, Track } from "../types.ts";
import { generateDrums } from "./drums.ts";
import { chooseProgression, generateBass, generateChords, generateMelody } from "./melody.ts";
import type { BeatRequest, Genre, Mood } from "./prompt.ts";
import { rng } from "./rng.ts";
import { styleById, styleDrumKit } from "./styles.ts";
import { SOUND_LIBRARY, soundParams } from "../soundLibrary.ts";
import { drumKit } from "../drumSamples.ts";
import type { Preferences, SoundRole } from "./memory.ts";

export interface GeneratedSong {
  patch: ProjectPatch;
  summary: string[];
  /** What was chosen (for the producer memory). */
  styleId: string;
  sounds: Record<SoundRole, string>;
  kitId: string;
  /** Version shaped by what the AI learnt about your taste. */
  learned: boolean;
  /** Instrument track of each role. */
  roleIds: Record<SoundRole, string>;
}

function leadPreset(genre: Genre, mood: Mood, seed: number): SynthPreset {
  const r = rng(seed);
  const by: Record<Genre, SynthPreset[]> = {
    trap: mood === "dark" ? ["bells", "pluck", "piano"] : ["pluck", "piano", "synth"],
    drill: ["piano", "strings", "bells"],
    afrobeat: ["pluck", "synth", "epiano"],
    boombap: ["piano", "epiano"],
    rnb: ["epiano", "piano"],
    lofi: ["epiano", "piano"],
    dancehall: ["pluck", "synth"],
    pop: ["synth", "piano", "pluck"],
  };
  const list = by[genre];
  return list[Math.floor(r() * list.length)];
}

function chordPreset(genre: Genre, mood: Mood): SynthPreset {
  if (genre === "drill" || mood === "epic") return "strings";
  if (genre === "rnb" || genre === "lofi" || genre === "boombap") return "epiano";
  return "pad";
}

const SECTION_COLORS: Record<string, string> = { Intro: "#64748b", Verse: "#2563eb", Chorus: "#db2777", Bridge: "#d97706", Outro: "#475569" };

/**
 * @param variant 0 = the style's reference sounds; 1, 2… = alternative lead sound of the same
 *   family and another progression (the "3 versions" button).
 */
/**
 * @param prefs what the producer memory learnt (applied to version 0 only; versions 1, 2…
 *   keep exploring so taste can still evolve).
 */
export function generateSong(p: Project, reqIn: BeatRequest, seed = Date.now() % 100000, variant = 0, prefs?: Preferences): GeneratedSong {
  const style = styleById(reqIn.style);
  const learned = variant === 0 && prefs ? prefs : undefined;
  const req: BeatRequest = learned?.bpmOffset ? { ...reqIn, bpm: Math.round(Math.max(50, Math.min(200, reqIn.bpm + learned.bpmOffset))) } : reqIn;
  const sounds: Record<SoundRole, string> = {
    lead: learned?.sounds.lead ?? style.sounds.lead,
    chords: learned?.sounds.chords ?? style.sounds.chords,
    bass: learned?.sounds.bass ?? style.sounds.bass,
  };
  const summary: string[] = [];
  const instruments: InstrumentTrack[] = [...p.instruments];
  let channels = [...p.channels];
  /** Create (or re-voice) the instrument `name` with a sound from the library. */
  const ensureSound = (soundId: string, name: string, fallback: SynthPreset): InstrumentTrack => {
    const snd = SOUND_LIBRARY.find((x) => x.id === soundId);
    const sp: ReturnType<typeof soundParams> = snd ? soundParams(snd) : { preset: fallback, synth: createInstrument(fallback).synth, bass808: createInstrument(fallback).bass808 };
    const existing = instruments.find((i) => i.name === name);
    const base = createInstrument(sp.preset, name);
    const ins: InstrumentTrack = { ...base, id: existing?.id ?? base.id, synth: sp.synth, bass808: sp.bass808 };
    if (sp.preset === "sampler") ins.sample = sp.sample ?? base.sample;
    else delete ins.sample;
    if (existing) instruments[instruments.indexOf(existing)] = ins;
    else {
      instruments.push(ins);
      channels = insertChannel(channels, instrumentChannel(ins));
    }
    return ins;
  };
  const bassSound = SOUND_LIBRARY.find((x) => x.id === sounds.bass);
  const bassIs808 = !bassSound || bassSound.preset === "808";
  // The project's existing 808 keeps its name; other basses get their own track.
  const bassName = bassIs808 ? (instruments.find((i) => i.preset === "808")?.name ?? "808 Bass") : "Bass";
  let bass = ensureSound(sounds.bass, bassName, "808");
  // The 808 track becomes "Log Drum" in amapiano (and back to "808 Bass" in other styles).
  const wantName = style.bassMode === "log" ? "Log Drum" : bass.name === "Log Drum" ? "808 Bass" : bass.name;
  if (bass.preset === "808" && wantName !== bass.name) {
    bass = { ...bass, name: wantName };
    instruments[instruments.findIndex((i) => i.id === bass.id)] = bass;
    channels = channels.map((c) => (c.id === bass.id ? { ...c, name: wantName } : c));
  }
  if (req.heavy808 && bass.preset === "808") {
    bass = { ...bass, bass808: { ...bass.bass808, saturation: Math.max(bass.bass808.saturation, 0.7), distortion: Math.max(bass.bass808.distortion, 0.3), lowBoostDb: Math.max(bass.bass808.lowBoostDb, 3), punch: Math.max(bass.bass808.punch, 0.6) } };
    instruments[instruments.findIndex((i) => i.id === bass.id)] = bass;
  }
  const leadId = variant === 0 ? sounds.lead : altSound(style.sounds.lead, variant);
  const lead = ensureSound(leadId, "Melody", leadPreset(req.genre, req.mood, seed));
  const chords = ensureSound(sounds.chords, "Chords", chordPreset(req.genre, req.mood));
  const bassId = bass.id;
  const r = rng(seed * 31 + 7);
  const progression = style.progressions.length
    ? style.progressions[(variant === 0 ? Math.floor(r() * style.progressions.length) : variant) % style.progressions.length]
    : chooseProgression(req.mood, seed);
  const steps = 64; // 4-bar patterns
  const kindId = (k: InstrumentKind) => p.tracks.find((t) => t.instrument === k)?.id;
  // Drum kit tuning of the style (e.g. higher cowbell-like perc for phonk).
  // and its drum sounds: recorded percussion for afro / amapiano / boom bap / R&B, electronic for trap.
  const kit = drumKit(learned?.kit ?? styleDrumKit(style));
  const tracks = p.tracks.map((t) => {
    const next: Track = { ...t, pitch: style.kit?.[t.instrument] ?? t.pitch };
    if (kit && t.instrument !== "808") {
      const snd = kit.sounds[t.instrument];
      if (snd) next.builtinSample = snd;
      else delete next.builtinSample;
    }
    return next;
  });
  if (kit) summary.push(`Batterie : kit « ${kit.name} »`);

  const make = (name: string, idx: number, o: { drums: number; melody: boolean; chords: boolean; bass: boolean; variation: number; energy: number }): Pattern => {
    const pat = createPattern({ tracks: p.tracks, instruments }, name, steps, idx);
    pat.color = PATTERN_COLORS[idx % PATTERN_COLORS.length];
    const drums = generateDrums({ genre: req.genre, style, energy: Math.min(1, req.energy * o.energy), complexity: req.complexity, stepCount: steps, seed, variation: o.variation });
    if (o.drums > 0) {
      for (const k of Object.keys(drums) as InstrumentKind[]) {
        const id = kindId(k);
        if (!id) continue;
        // drums < 1 → thinned section (bridge): keep kick/hat only.
        if (o.drums < 1 && (k === "snare" || k === "clap" || k === "perc")) continue;
        pat.drums[id] = drums[k].map((s) => ({ ...s }));
      }
      // The 808 is played by the melodic bass instrument, not the 808 drum lane.
      const lane808 = kindId("808");
      if (lane808) pat.drums[lane808] = pat.drums[lane808].map((s) => ({ ...s, on: false }));
    }
    if (o.bass) {
      const rhythmSrc = drums["808"].some((s) => s.on) ? drums["808"] : drums.kick;
      pat.notes[bassId] = generateBass({ key: req.key, progression, stepCount: steps, rhythm: rhythmSrc, genre: req.genre, seed: seed + o.variation, slides: style.slides > 0 && bass.preset === "808", slideAmount: style.slides, mode: style.bassMode }).map((n) => ({ ...n, id: newId("n") }));
    }
    if (o.chords) pat.notes[chords.id] = generateChords({ key: req.key, progression, stepCount: steps, genre: req.genre, seed, style: style.chordStyle, size: style.chordSize, hits: style.chordHits }).map((n) => ({ ...n, id: newId("n") }));
    if (o.melody)
      pat.notes[lead.id] = generateMelody({
        key: req.key, genre: req.genre, mood: req.mood, complexity: req.complexity * (o.variation === 1 ? 1.15 : 0.9), stepCount: steps, progression, seed: seed + o.variation * 3,
        mode: style.melody.mode, rhythms: style.melody.rhythms, range: style.melody.range,
      }).map((n) => ({ ...n, id: newId("n") }));
    return pat;
  };

  const intro = make("Intro", 0, { drums: 0, melody: true, chords: true, bass: false, variation: 0, energy: 0.5 });
  const verse = make("Verse", 1, { drums: 1, melody: style.melody.mode === "arp", chords: true, bass: true, variation: 0, energy: 0.85 });
  const chorus = make("Chorus", 2, { drums: 1, melody: true, chords: true, bass: true, variation: 1, energy: 1.1 });
  const bridge = make("Bridge", 3, { drums: 0.5, melody: true, chords: true, bass: false, variation: 2, energy: 0.6 });
  const outro = make("Outro", 4, { drums: 0, melody: true, chords: false, bass: false, variation: 0, energy: 0.4 });
  // Existing patterns get (empty) lanes for the instruments created here.
  const existing = p.patterns.map((pat) => ({ ...pat, notes: Object.fromEntries(instruments.map((i) => [i.id, pat.notes[i.id] ?? []])) }));
  const patterns = [...existing, intro, verse, chorus, bridge, outro];

  const LAYOUTS: Record<string, [string, Pattern, number][]> = {
    standard: [["Intro", intro, 4], ["Verse", verse, 16], ["Chorus", chorus, 8], ["Verse", verse, 16], ["Chorus", chorus, 8], ["Bridge", bridge, 8], ["Chorus", chorus, 8], ["Outro", outro, 4]],
    hookFirst: [["Intro", intro, 4], ["Chorus", chorus, 8], ["Verse", verse, 16], ["Chorus", chorus, 8], ["Verse", verse, 16], ["Chorus", chorus, 8], ["Outro", outro, 4]],
    short: [["Intro", intro, 4], ["Chorus", chorus, 8], ["Verse", verse, 12], ["Chorus", chorus, 8], ["Bridge", bridge, 4], ["Chorus", chorus, 8], ["Outro", outro, 4]],
    long: [["Intro", intro, 8], ["Verse", verse, 16], ["Chorus", chorus, 8], ["Verse", verse, 16], ["Chorus", chorus, 8], ["Bridge", bridge, 8], ["Verse", verse, 8], ["Chorus", chorus, 8], ["Outro", outro, 8]],
  };
  const layout = LAYOUTS[style.layout] ?? LAYOUTS.standard;
  const clips: PatternClip[] = [];
  const sections: Section[] = [];
  let bar = 0;
  let verseN = 0;
  for (const [name, pat, len] of layout) {
    const label = name === "Verse" ? `Verse ${++verseN}` : name === "Chorus" && style.layout !== "standard" && style.layout !== "long" ? "Hook" : name;
    sections.push({ id: newId("sec"), name: label, start: bar, length: len, color: SECTION_COLORS[name] });
    clips.push({ id: newId("clip"), patternId: pat.id, lane: 0, start: bar, length: len });
    bar += len;
  }
  const soundName = (id: string) => SOUND_LIBRARY.find((x) => x.id === id)?.name ?? id;
  summary.push(`${style.label.toUpperCase()} · ${req.bpm} BPM · ${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][req.key.root]} ${req.key.scale} · humeur ${req.mood}`);
  summary.push(`Sons : mélodie « ${soundName(leadId)} », accords « ${soundName(sounds.chords)} », basse « ${soundName(sounds.bass)} »${req.heavy808 ? " (saturée)" : ""}.`);
  const tasteApplied = !!learned && (Object.keys(learned.sounds).length > 0 || learned.bpmOffset !== 0 || !!learned.kit);
  if (tasteApplied) summary.unshift("🧠 Version selon vos goûts (ce que l'IA a appris de vos choix).");
  summary.push(`Progression (degrés) : ${progression.map((d) => ["I", "II", "III", "IV", "V", "VI", "VII"][d]).join(" – ")} · écriture ${style.melody.mode} · accords ${style.chordStyle}${style.bassMode === "log" ? " · log drum qui rebondit et glisse" : style.slides >= 0.4 ? " · 808 qui glisse beaucoup" : ""}${style.chordSize === 5 ? " · accords de 9e" : style.chordSize === 4 ? " · accords de 7e" : ""}.`);
  summary.push(`Structure : ${sections.map((s) => `${s.name} (${s.length})`).join(" → ")} = ${bar} mesures.`);
  return {
    patch: {
      bpm: req.bpm,
      swing: req.swing,
      key: req.key,
      tracks,
      instruments,
      channels,
      patterns,
      currentPatternId: chorus.id,
      arrangement: { ...p.arrangement, clips, sections, lanes: Math.max(1, p.arrangement.lanes) },
    },
    summary,
    styleId: style.id,
    sounds: { lead: leadId, chords: sounds.chords, bass: sounds.bass },
    kitId: kit?.id ?? "synth",
    learned: tasteApplied,
    roleIds: { lead: lead.id, chords: chords.id, bass: bass.id },
  };
}

/** Another sound of the same category as `id` (deterministic per variant). */
function altSound(id: string, variant: number): string {
  const snd = SOUND_LIBRARY.find((x) => x.id === id);
  if (!snd) return id;
  // Signature sounds stay with their own styles (no cowbell in a mumble rap version).
  const SIGNATURE = new Set(["cowbell", "rage-lead", "supersaw", "log-drum", "log-drum-deep"]);
  const pool = SOUND_LIBRARY.filter((x) => x.category === snd.category && x.id !== id && x.preset !== "808" && !SIGNATURE.has(x.id));
  return pool.length ? pool[(variant * 3 + id.length) % pool.length].id : id;
}

/** Several melody propositions for the AI MELODY GENERATOR. */
export function melodyOptions(o: { key: BeatRequest["key"]; genre: Genre; mood: Mood; complexity: number; stepCount: number; count?: number; seed?: number; range?: [number, number]; style?: string }) {
  const base = o.seed ?? Math.floor(Math.random() * 100000);
  const st = o.style ? styleById(o.style) : null;
  const prog = st?.progressions.length ? st.progressions[base % st.progressions.length] : chooseProgression(o.mood, base);
  return Array.from({ length: o.count ?? 4 }, (_, i) => ({
    name: `Option ${i + 1}`,
    progression: prog,
    notes: generateMelody({ key: o.key, genre: st?.genre ?? o.genre, mood: o.mood, complexity: o.complexity, stepCount: o.stepCount, progression: prog, seed: base + i * 1009, range: o.range ?? st?.melody.range, mode: st?.melody.mode, rhythms: st?.melody.rhythms }),
  }));
}
