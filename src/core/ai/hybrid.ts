// AI HYBRID instruments: a real recorded instrument layered with a synth (or the other way round),
// designed from recipes that producers use — piano + soft pad, nylon guitar + bright pluck an
// octave up, real bass + sine sub, kalimba + bells… — with randomised but tasteful settings and a
// generated name. Saved in a personal library (on this computer) and reused by the AI.

import { createInstrument } from "../project.ts";
import type { InstrumentLayer, InstrumentTrack, Project, SynthParams, SynthPreset } from "../types.ts";
import type { InstrumentPatch } from "../reducer.ts";
import type { GeneratedSong } from "./beat.ts";
import type { SoundRole } from "./memory.ts";

export type HybridRole = "keys" | "pluck" | "pad" | "lead" | "bass";
export const HYBRID_ROLES: Record<HybridRole, string> = { keys: "Clavier", pluck: "Pluck / guitare", pad: "Nappe", lead: "Lead / mélodie", bass: "Basse" };

export interface HybridSound {
  id: string;
  name: string;
  role: HybridRole;
  /** What it is, in plain words. */
  description: string;
  base: { preset: Exclude<SynthPreset, "808">; sample?: string; synth: Partial<SynthParams> };
  layer: InstrumentLayer;
  favorite?: boolean;
  createdAt: string;
}

type Part = { preset: Exclude<SynthPreset, "808">; sample?: string; label: string; synth?: (r: () => number) => Partial<SynthParams> };
interface Recipe { role: HybridRole; base: Part; layer: Part; gain: [number, number]; why: string }

const between = (r: () => number, a: number, b: number) => a + (b - a) * r();
const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length) % xs.length];

const softPad = (r: () => number): Partial<SynthParams> => ({ attack: between(r, 0.25, 0.8), release: between(r, 0.8, 1.6), cutoff: between(r, 1200, 2600), detune: between(r, 12, 24), voices: 3, lfoFilter: between(r, 0, 0.2), lfoRate: between(r, 0.15, 0.4) });
const sparkle = (r: () => number): Partial<SynthParams> => ({ octave: 1, decay: between(r, 0.8, 1.8), cutoff: between(r, 7000, 11000) });
const brightPluck = (r: () => number): Partial<SynthParams> => ({ octave: pick(r, [0, 1]), cutoff: between(r, 3500, 6500), filterEnv: between(r, 0.5, 0.85), decay: between(r, 0.25, 0.5) });
const sub = (r: () => number): Partial<SynthParams> => ({ wave: "sine", voices: 1, octave: -1, cutoff: between(r, 220, 420), resonance: 0.5, drive: between(r, 0, 0.15), filterEnv: 0, detune: 0, sustain: 0.9, attack: 0.004, release: 0.12, mono: true, glide: 0 });
const airyLead = (r: () => number): Partial<SynthParams> => ({ wave: pick(r, ["sawtooth", "square"] as const), cutoff: between(r, 2200, 4200), detune: between(r, 6, 16), voices: 2, attack: between(r, 0.01, 0.06), lfoDepth: between(r, 4, 14), lfoRate: between(r, 4.5, 6) });

const RECIPES: Recipe[] = [
  { role: "keys", base: { preset: "sampler", sample: "grand-piano", label: "piano à queue" }, layer: { preset: "pad", label: "nappe douce", synth: softPad }, gain: [-12, -7], why: "le piano donne l'attaque, la nappe prolonge et adoucit les accords" },
  { role: "keys", base: { preset: "sampler", sample: "upright-piano", label: "piano droit" }, layer: { preset: "bells", label: "clochettes une octave au-dessus", synth: sparkle }, gain: [-16, -11], why: "les clochettes ajoutent de la brillance aux aigus, façon R&B" },
  { role: "keys", base: { preset: "sampler", sample: "wurlitzer", label: "Wurlitzer" }, layer: { preset: "strings", label: "cordes synthé", synth: (r) => ({ attack: between(r, 0.15, 0.4), cutoff: between(r, 1800, 3000), detune: between(r, 8, 16) }) }, gain: [-13, -8], why: "le Wurli garde le côté soul, les cordes donnent de l'ampleur" },
  { role: "keys", base: { preset: "sampler", sample: "vibraphone", label: "vibraphone" }, layer: { preset: "epiano", label: "piano électrique", synth: (r) => ({ cutoff: between(r, 3000, 5000), lfoDepth: between(r, 0, 6) }) }, gain: [-10, -6], why: "le vibraphone et l'e-piano fusionnent en un clavier rêveur, idéal pour le plugg et le lo-fi" },
  { role: "pluck", base: { preset: "sampler", sample: "guitar-nylon", label: "guitare nylon" }, layer: { preset: "pluck", label: "pluck brillant", synth: brightPluck }, gain: [-12, -8], why: "la guitare reste naturelle, le pluck synthé la rend plus moderne et plus présente dans le mix" },
  { role: "pluck", base: { preset: "sampler", sample: "kalimba", label: "kalimba" }, layer: { preset: "bells", label: "clochettes", synth: sparkle }, gain: [-15, -10], why: "un kalimba scintillant, très afro / trap mélodique" },
  { role: "pluck", base: { preset: "sampler", sample: "harp", label: "harpe" }, layer: { preset: "pluck", label: "pluck doux", synth: (r) => ({ octave: 0, cutoff: between(r, 2000, 3500), decay: between(r, 0.4, 0.8) }) }, gain: [-11, -7], why: "une harpe plus percutante, qui garde sa douceur" },
  { role: "pluck", base: { preset: "sampler", sample: "marimba", label: "marimba" }, layer: { preset: "synth", label: "synthé carré court", synth: (r) => ({ wave: "square", attack: 0.002, decay: between(r, 0.15, 0.3), sustain: 0, release: 0.1, cutoff: between(r, 2500, 4500), voices: 1 }) }, gain: [-14, -9], why: "un marimba électronique, parfait pour l'amapiano et l'afro" },
  { role: "pad", base: { preset: "sampler", sample: "strings", label: "ensemble de cordes" }, layer: { preset: "pad", label: "nappe analogique", synth: softPad }, gain: [-9, -5], why: "de vraies cordes portées par une nappe : large et cinématique, pour la drill et les intros" },
  { role: "pad", base: { preset: "sampler", sample: "organ", label: "orgue" }, layer: { preset: "pad", label: "nappe filtrée", synth: (r) => ({ ...softPad(r), cutoff: between(r, 800, 1600) }) }, gain: [-10, -6], why: "un orgue gospel adouci, pour le R&B et le boom bap" },
  { role: "lead", base: { preset: "sampler", sample: "flute", label: "flûte" }, layer: { preset: "synth", label: "lead aérien", synth: airyLead }, gain: [-14, -9], why: "la flûte de la trap, épaissie par un lead discret" },
  { role: "lead", base: { preset: "sampler", sample: "violin", label: "violon" }, layer: { preset: "synth", label: "lead scie doux", synth: airyLead }, gain: [-15, -10], why: "un violon drill plus agressif, qui perce le mix" },
  { role: "lead", base: { preset: "sampler", sample: "saxophone", label: "saxophone" }, layer: { preset: "epiano", label: "piano électrique", synth: (r) => ({ cutoff: between(r, 2500, 4000) }) }, gain: [-14, -10], why: "un sax jazzy avec une attaque plus nette" },
  { role: "bass", base: { preset: "sampler", sample: "bass-electric", label: "basse électrique" }, layer: { preset: "bass", label: "sub sinus une octave en dessous", synth: sub }, gain: [-8, -4], why: "la basse réelle donne le grain, le sub donne le poids dans les enceintes" },
  { role: "bass", base: { preset: "sampler", sample: "cello", label: "violoncelle" }, layer: { preset: "bass", label: "sub sinus", synth: sub }, gain: [-9, -5], why: "une basse jouée au violoncelle, avec un sub : très drill UK" },
];

const NAMES_A = ["Velours", "Cristal", "Néon", "Brume", "Ombre", "Soie", "Ambre", "Chrome", "Opale", "Givre", "Minuit", "Aurore", "Satin", "Encre", "Cobalt", "Onyx", "Corail", "Mirage", "Comète", "Lagon"];
const NAMES_B = ["nocturne", "céleste", "fantôme", "doré", "liquide", "lointain", "électrique", "tropical", "fumé", "sacré", "flottant", "sauvage", "urbain", "lunaire", "brûlant", "glacé"];

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A new hybrid sound for `role` (any role when omitted). `avoid`: names already in the library.
 * Deterministic for a given seed (the UI passes a fresh one each time).
 */
export function designHybrid(seed: number, role?: HybridRole, avoid: string[] = []): HybridSound {
  const r = rng(seed);
  const pool = RECIPES.filter((x) => !role || x.role === role);
  const rec = pick(r, pool.length ? pool : RECIPES);
  const base = { preset: rec.base.preset, sample: rec.base.sample, synth: rec.base.synth?.(r) ?? {} };
  const layerSynth = { ...createInstrument(rec.layer.preset).synth, ...(rec.layer.synth?.(r) ?? {}) };
  for (const k of ["attack", "decay", "release", "cutoff", "detune", "lfoDepth", "lfoRate", "lfoFilter", "filterEnv", "drive"] as const) {
    const v = layerSynth[k];
    if (typeof v === "number") layerSynth[k] = Math.round(v * 1000) / 1000;
  }
  const layer: InstrumentLayer = { preset: rec.layer.preset, sample: rec.layer.sample, synth: layerSynth, gainDb: Math.round(between(r, rec.gain[0], rec.gain[1])) };
  let name = "";
  for (let i = 0; i < 20 && (!name || avoid.includes(name)); i++) name = `${pick(r, NAMES_A)} ${pick(r, NAMES_B)}`;
  if (avoid.includes(name)) name = `${name} ${Math.floor(r() * 90) + 10}`;
  return {
    id: `hyb_${seed.toString(36)}`, name, role: rec.role,
    description: `${capital(rec.base.label)} + ${rec.layer.label} : ${rec.why}.`,
    base, layer, createdAt: new Date().toISOString(),
  };
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Patch putting a hybrid sound on an instrument track. */
export function hybridPatch(h: HybridSound): InstrumentPatch {
  return { preset: h.base.preset, ...(h.base.sample ? { sample: h.base.sample } : {}), synth: h.base.synth, layer: h.layer, hybrid: h.name };
}

/** Role of an instrument track, guessed from its name and sound (for « crée un son hybride pour le piano »). */
export function roleOf(t: InstrumentTrack): HybridRole {
  const s = `${t.name} ${t.preset} ${t.sample ?? ""}`.toLowerCase();
  if (/808|bass|basse|cello|sub/.test(s)) return "bass";
  if (/pad|nappe|string|corde|organ|orgue/.test(s)) return "pad";
  if (/pluck|guitar|guitare|kalimba|harp|marimba|balafon|bells|glock/.test(s)) return "pluck";
  if (/lead|flute|flûte|violin|violon|sax|trumpet|horn|synth|melod|mélod/.test(s)) return "lead";
  return "keys";
}

/** Instrument track carrying a hybrid sound (the track keeps its octave, colour and name). */
export function withHybrid(t: InstrumentTrack, h: HybridSound): InstrumentTrack {
  const fresh = createInstrument(h.base.preset);
  const out: InstrumentTrack = { ...t, preset: h.base.preset, synth: { ...fresh.synth, ...h.base.synth, octave: t.synth.octave ?? 0 }, layer: h.layer, hybrid: h.name };
  if (h.base.sample) out.sample = h.base.sample;
  else delete out.sample;
  return out;
}

/**
 * Favourite (★) hybrid sounds used by the AI: on version 1 of a generated beat, the chords get a
 * favourite keys / pad sound, the melody a lead / pluck one, the bass a bass one — never the 808.
 */
export function personalizeSong(song: GeneratedSong, favorites: HybridSound[]): GeneratedSong {
  const instruments = song.patch.instruments;
  if (!instruments || !favorites.length) return song;
  const wanted: [SoundRole, HybridRole[]][] = [["chords", ["keys", "pad"]], ["lead", ["lead", "pluck"]], ["bass", ["bass"]]];
  const summary = [...song.summary];
  let changed = instruments;
  for (const [role, roles] of wanted) {
    const fav = favorites.find((f) => roles.includes(f.role));
    const id = song.roleIds[role];
    const t = changed.find((x) => x.id === id);
    if (!fav || !t || t.preset === "808") continue;
    changed = changed.map((x) => (x.id === id ? withHybrid(x, fav) : x));
    summary.push(`Ton son perso « ${fav.name} » sur ${t.name}`);
  }
  return changed === instruments ? song : { ...song, patch: { ...song.patch, instruments: changed }, summary };
}

const ROLE_WORDS: [RegExp, HybridRole][] = [
  [/\b(basse|bass|sub)\b/, "bass"], [/\b(nappe|pad|cordes|strings|ambiance)\b/, "pad"],
  [/\b(melodie|lead|flute|violon|sax|saxophone)\b/, "lead"], [/\b(guitare|pluck|kalimba|harpe|marimba)\b/, "pluck"],
  [/\b(piano|accords|clavier|keys|rhodes)\b/, "keys"],
];

/**
 * Instrument a request is about (« un son hybride pour la basse »): a track named in the text,
 * else one of the role asked, else the chords; tracks that play notes first, never an 808.
 * `t` is the normalised text (lowercase, no accents).
 */
export function hybridTarget(p: Project, t: string): { trackId: string; role?: HybridRole } | null {
  const role = ROLE_WORDS.find(([re]) => re.test(t))?.[1];
  const notes = (id: string) => p.patterns.reduce((n, pat) => n + (pat.notes[id]?.length ?? 0), 0);
  const candidates = p.instruments.filter((i) => i.preset !== "808").sort((a, b) => Number(notes(b.id) > 0) - Number(notes(a.id) > 0));
  const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const named = candidates.find((i) => plain(i.name).length > 2 && t.includes(plain(i.name)));
  const pick = named ?? candidates.find((i) => roleOf(i) === (role ?? "keys")) ?? candidates[0];
  return pick ? { trackId: pick.id, ...(role ? { role } : {}) } : null;
}
