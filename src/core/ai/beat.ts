// AI BEAT GENERATOR: turns a request into an editable song — drums, 808, chords, melody,
// patterns per section and a full arrangement. Never a flat audio file.

import { createInstrument, createPattern, insertChannel, instrumentChannel, PATTERN_COLORS, newId } from "../project.ts";
import type { ProjectPatch } from "../reducer.ts";
import type { InstrumentKind, InstrumentTrack, Pattern, PatternClip, Project, Section, SynthPreset } from "../types.ts";
import { generateDrums } from "./drums.ts";
import { chooseProgression, generateBass, generateChords, generateMelody } from "./melody.ts";
import type { BeatRequest, Genre, Mood } from "./prompt.ts";
import { rng } from "./rng.ts";
import { styleById } from "./styles.ts";
import { SOUND_LIBRARY, soundParams } from "../soundLibrary.ts";

export interface GeneratedSong {
  patch: ProjectPatch;
  summary: string[];
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
export function generateSong(p: Project, req: BeatRequest, seed = Date.now() % 100000, variant = 0): GeneratedSong {
  const style = styleById(req.style);
  const summary: string[] = [];
  const instruments: InstrumentTrack[] = [...p.instruments];
  let channels = [...p.channels];
  /** Create (or re-voice) the instrument `name` with a sound from the library. */
  const ensureSound = (soundId: string, name: string, fallback: SynthPreset): InstrumentTrack => {
    const snd = SOUND_LIBRARY.find((x) => x.id === soundId);
    const sp = snd ? soundParams(snd) : { preset: fallback, synth: createInstrument(fallback).synth, bass808: createInstrument(fallback).bass808 };
    const existing = instruments.find((i) => i.name === name);
    const base = createInstrument(sp.preset, name);
    const ins: InstrumentTrack = { ...base, id: existing?.id ?? base.id, synth: sp.synth, bass808: sp.bass808 };
    if (existing) instruments[instruments.indexOf(existing)] = ins;
    else {
      instruments.push(ins);
      channels = insertChannel(channels, instrumentChannel(ins));
    }
    return ins;
  };
  const bassSound = SOUND_LIBRARY.find((x) => x.id === style.sounds.bass);
  const bassIs808 = !bassSound || bassSound.preset === "808";
  // The project's existing 808 keeps its name; other basses get their own track.
  const bassName = bassIs808 ? (instruments.find((i) => i.preset === "808")?.name ?? "808 Bass") : "Bass";
  let bass = ensureSound(style.sounds.bass, bassName, "808");
  if (req.heavy808 && bass.preset === "808") {
    bass = { ...bass, bass808: { ...bass.bass808, saturation: Math.max(bass.bass808.saturation, 0.7), distortion: Math.max(bass.bass808.distortion, 0.3), lowBoostDb: Math.max(bass.bass808.lowBoostDb, 3), punch: Math.max(bass.bass808.punch, 0.6) } };
    instruments[instruments.findIndex((i) => i.id === bass.id)] = bass;
  }
  const leadId = variant === 0 ? style.sounds.lead : altSound(style.sounds.lead, variant);
  const lead = ensureSound(leadId, "Melody", leadPreset(req.genre, req.mood, seed));
  const chords = ensureSound(style.sounds.chords, "Chords", chordPreset(req.genre, req.mood));
  const bassId = bass.id;
  const r = rng(seed * 31 + 7);
  const progression = style.progressions.length
    ? style.progressions[(variant === 0 ? Math.floor(r() * style.progressions.length) : variant) % style.progressions.length]
    : chooseProgression(req.mood, seed);
  const steps = 64; // 4-bar patterns
  const kindId = (k: InstrumentKind) => p.tracks.find((t) => t.instrument === k)?.id;
  // Drum kit tuning of the style (e.g. higher cowbell-like perc for phonk).
  const tracks = p.tracks.map((t) => ({ ...t, pitch: style.kit?.[t.instrument] ?? t.pitch }));

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
      pat.notes[bassId] = generateBass({ key: req.key, progression, stepCount: steps, rhythm: rhythmSrc, genre: req.genre, seed: seed + o.variation, slides: style.slides > 0 && bass.preset === "808", slideAmount: style.slides }).map((n) => ({ ...n, id: newId("n") }));
    }
    if (o.chords) pat.notes[chords.id] = generateChords({ key: req.key, progression, stepCount: steps, genre: req.genre, seed, style: style.chordStyle }).map((n) => ({ ...n, id: newId("n") }));
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
  summary.push(`Sons : mélodie « ${soundName(leadId)} », accords « ${soundName(style.sounds.chords)} », basse « ${soundName(style.sounds.bass)} »${req.heavy808 ? " (saturée)" : ""}.`);
  summary.push(`Progression (degrés) : ${progression.map((d) => ["I", "II", "III", "IV", "V", "VI", "VII"][d]).join(" – ")} · écriture ${style.melody.mode} · accords ${style.chordStyle}${style.slides >= 0.4 ? " · 808 qui glisse beaucoup" : ""}.`);
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
  };
}

/** Another sound of the same category as `id` (deterministic per variant). */
function altSound(id: string, variant: number): string {
  const snd = SOUND_LIBRARY.find((x) => x.id === id);
  if (!snd) return id;
  // Signature sounds stay with their own styles (no cowbell in a mumble rap version).
  const SIGNATURE = new Set(["cowbell", "rage-lead", "supersaw", "log-drum"]);
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
