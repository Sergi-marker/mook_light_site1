// AI BEAT GENERATOR: turns a request into an editable song — drums, 808, chords, melody,
// patterns per section and a full arrangement. Never a flat audio file.

import { createInstrument, createPattern, insertChannel, instrumentChannel, PATTERN_COLORS, newId } from "../project.ts";
import type { ProjectPatch } from "../reducer.ts";
import type { InstrumentKind, InstrumentTrack, Pattern, PatternClip, Project, Section, SynthPreset } from "../types.ts";
import { generateDrums } from "./drums.ts";
import { chooseProgression, generateBass, generateChords, generateMelody } from "./melody.ts";
import type { BeatRequest, Genre, Mood } from "./prompt.ts";
import { rng } from "./rng.ts";

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

export function generateSong(p: Project, req: BeatRequest, seed = Date.now() % 100000): GeneratedSong {
  const summary: string[] = [];
  const instruments: InstrumentTrack[] = [...p.instruments];
  let channels = [...p.channels];
  const ensure = (preset: SynthPreset, name: string): InstrumentTrack => {
    const existing = instruments.find((i) => i.name === name);
    if (existing) {
      const updated = existing.preset === preset ? existing : { ...createInstrument(preset, name), id: existing.id };
      instruments[instruments.indexOf(existing)] = updated;
      return updated;
    }
    const ins = createInstrument(preset, name);
    instruments.push(ins);
    channels = insertChannel(channels, instrumentChannel(ins));
    return ins;
  };
  const bass = instruments.find((i) => i.preset === "808") ?? ensure("808", "808 Bass");
  if (req.heavy808) {
    instruments[instruments.indexOf(bass)] = { ...bass, bass808: { ...bass.bass808, saturation: 0.75, distortion: 0.35, lowBoostDb: 4, punch: 0.7 } };
  }
  const lead = ensure(leadPreset(req.genre, req.mood, seed), "Melody");
  const chords = ensure(chordPreset(req.genre, req.mood), "Chords");
  const bassId = bass.id;
  const progression = chooseProgression(req.mood, seed);
  const steps = 64; // 4-bar patterns
  const kindId = (k: InstrumentKind) => p.tracks.find((t) => t.instrument === k)?.id;

  const make = (name: string, idx: number, o: { drums: number; melody: boolean; chords: boolean; bass: boolean; variation: number; energy: number }): Pattern => {
    const pat = createPattern({ tracks: p.tracks, instruments }, name, steps, idx);
    pat.color = PATTERN_COLORS[idx % PATTERN_COLORS.length];
    const drums = generateDrums({ genre: req.genre, energy: req.energy * o.energy, complexity: req.complexity, stepCount: steps, seed, variation: o.variation });
    if (o.drums > 0) {
      for (const k of Object.keys(drums) as InstrumentKind[]) {
        const id = kindId(k);
        if (!id) continue;
        // drums < 1 → thinned section (bridge): keep kick/hat only.
        if (o.drums < 1 && (k === "snare" || k === "clap" || k === "perc")) continue;
        pat.drums[id] = drums[k].map((s) => ({ ...s }));
      }
      // The 808 is played by the melodic 808 instrument, not the 808 drum lane.
      const lane808 = kindId("808");
      if (lane808) pat.drums[lane808] = pat.drums[lane808].map((s) => ({ ...s, on: false }));
    }
    if (o.bass) {
      const rhythmSrc = drums[req.genre === "boombap" || req.genre === "lofi" ? "kick" : "808"];
      const useRhythm = rhythmSrc.some((s) => s.on) ? rhythmSrc : drums.kick;
      pat.notes[bassId] = generateBass({ key: req.key, progression, stepCount: steps, rhythm: useRhythm, genre: req.genre, seed: seed + o.variation, slides: req.genre === "trap" || req.genre === "drill" }).map((n) => ({ ...n, id: newId("n") }));
    }
    if (o.chords) pat.notes[chords.id] = generateChords({ key: req.key, progression, stepCount: steps, genre: req.genre, seed }).map((n) => ({ ...n, id: newId("n") }));
    if (o.melody) pat.notes[lead.id] = generateMelody({ key: req.key, genre: req.genre, mood: req.mood, complexity: req.complexity * (o.variation === 1 ? 1.15 : 0.9), stepCount: steps, progression, seed: seed + o.variation * 3 }).map((n) => ({ ...n, id: newId("n") }));
    return pat;
  };

  const intro = make("Intro", 0, { drums: 0, melody: true, chords: true, bass: false, variation: 0, energy: 0.5 });
  const verse = make("Verse", 1, { drums: 1, melody: false, chords: true, bass: true, variation: 0, energy: 0.85 });
  const chorus = make("Chorus", 2, { drums: 1, melody: true, chords: true, bass: true, variation: 1, energy: 1.1 });
  const bridge = make("Bridge", 3, { drums: 0.5, melody: true, chords: true, bass: false, variation: 2, energy: 0.6 });
  const outro = make("Outro", 4, { drums: 0, melody: true, chords: false, bass: false, variation: 0, energy: 0.4 });
  // Existing patterns get (empty) lanes for the instruments created here.
  const existing = p.patterns.map((pat) => ({ ...pat, notes: Object.fromEntries(instruments.map((i) => [i.id, pat.notes[i.id] ?? []])) }));
  const patterns = [...existing, intro, verse, chorus, bridge, outro];

  const layout: [string, Pattern, number][] = [
    ["Intro", intro, 4], ["Verse", verse, 16], ["Chorus", chorus, 8], ["Verse", verse, 16],
    ["Chorus", chorus, 8], ["Bridge", bridge, 8], ["Chorus", chorus, 8], ["Outro", outro, 4],
  ];
  const clips: PatternClip[] = [];
  const sections: Section[] = [];
  let bar = 0;
  let verseN = 0;
  for (const [name, pat, len] of layout) {
    const label = name === "Verse" ? `Verse ${++verseN}` : name;
    sections.push({ id: newId("sec"), name: label, start: bar, length: len, color: SECTION_COLORS[name] });
    clips.push({ id: newId("clip"), patternId: pat.id, lane: 0, start: bar, length: len });
    bar += len;
  }
  summary.push(`${req.genre.toUpperCase()} · ${req.bpm} BPM · ${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][req.key.root]} ${req.key.scale} · humeur ${req.mood}`);
  summary.push(`Instruments : mélodie ${lead.preset}, accords ${chords.preset}, 808${req.heavy808 ? " lourde (saturée)" : ""}.`);
  summary.push(`Progression (degrés) : ${progression.map((d) => ["I", "II", "III", "IV", "V", "VI", "VII"][d]).join(" – ")}.`);
  summary.push(`Structure : ${sections.map((s) => `${s.name} (${s.length})`).join(" → ")} = ${bar} mesures.`);
  return {
    patch: {
      bpm: req.bpm,
      swing: req.swing,
      key: req.key,
      instruments,
      channels,
      patterns,
      currentPatternId: chorus.id,
      arrangement: { ...p.arrangement, clips, sections, lanes: Math.max(1, p.arrangement.lanes) },
    },
    summary,
  };
}

/** Several melody propositions for the AI MELODY GENERATOR. */
export function melodyOptions(o: { key: BeatRequest["key"]; genre: Genre; mood: Mood; complexity: number; stepCount: number; count?: number; seed?: number; range?: [number, number] }) {
  const base = o.seed ?? Math.floor(Math.random() * 100000);
  const prog = chooseProgression(o.mood, base);
  return Array.from({ length: o.count ?? 4 }, (_, i) => ({
    name: `Option ${i + 1}`,
    progression: prog,
    notes: generateMelody({ key: o.key, genre: o.genre, mood: o.mood, complexity: o.complexity, stepCount: o.stepCount, progression: prog, seed: base + i * 1009, range: o.range }),
  }));
}
