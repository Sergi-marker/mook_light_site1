// Sound library: named, ready-to-use instrument sounds (rap / trap / drill / afro / R&B).
// A sound is just a preset + parameter overrides, so applying one stays fully editable.
// "Real" sounds use the sampler preset: recorded instruments (core/sampleLibrary).

import { DEFAULT_808, SYNTH_PRESETS } from "./project.ts";
import type { Bass808Params, SynthParams, SynthPreset } from "./types.ts";

export interface LibrarySound {
  id: string;
  name: string;
  category: "Keys" | "Guitars" | "Leads" | "Winds" | "Pads" | "Strings" | "Plucks" | "Bells" | "Bass" | "808";
  preset: SynthPreset;
  /** Recorded instrument (preset "sampler"). */
  sample?: string;
  synth?: Partial<SynthParams>;
  bass808?: Partial<Bass808Params>;
}

export const SOUND_LIBRARY: LibrarySound[] = [
  // Keys
  { id: "grand", name: "Piano à queue (réel)", category: "Keys", preset: "sampler", sample: "grand-piano", synth: { release: 0.35 } },
  { id: "dark-piano", name: "Dark Piano (drill, réel)", category: "Keys", preset: "sampler", sample: "grand-piano", synth: { cutoff: 2400, release: 0.9 } },
  { id: "bright-piano", name: "Piano brillant (pop, afro)", category: "Keys", preset: "sampler", sample: "grand-piano", synth: { release: 0.25, drive: 0.08 } },
  { id: "upright", name: "Piano droit (réel)", category: "Keys", preset: "sampler", sample: "upright-piano", synth: { release: 0.3 } },
  { id: "lofi-keys", name: "Lo-fi Keys (piano droit usé)", category: "Keys", preset: "sampler", sample: "upright-piano", synth: { cutoff: 2200, lfoDepth: 7, lfoRate: 0.6, drive: 0.2, release: 0.4 } },
  { id: "wurli", name: "Wurlitzer (réel)", category: "Keys", preset: "sampler", sample: "wurlitzer", synth: { release: 0.25 } },
  { id: "rnb-rhodes", name: "R&B Rhodes (synthé)", category: "Keys", preset: "epiano", synth: { lfoDepth: 6, lfoRate: 4.5, drive: 0.15 } },
  { id: "suitcase", name: "Suitcase EP (Wurlitzer trémolo)", category: "Keys", preset: "sampler", sample: "wurlitzer", synth: { lfoDepth: 5, lfoRate: 5, release: 0.4, cutoff: 5500 } },
  { id: "organ", name: "Orgue (gospel, réel)", category: "Keys", preset: "sampler", sample: "organ", synth: { attack: 0.01, release: 0.15 } },
  // Guitars (recorded)
  { id: "guitar-acoustic", name: "Guitare acoustique (réelle)", category: "Guitars", preset: "sampler", sample: "guitar-acoustic", synth: { release: 0.3 } },
  { id: "guitar-nylon", name: "Guitare espagnole / nylon (drill, afro)", category: "Guitars", preset: "sampler", sample: "guitar-nylon", synth: { release: 0.3 } },
  { id: "guitar-electric", name: "Guitare électrique clean (R&B)", category: "Guitars", preset: "sampler", sample: "guitar-electric", synth: { release: 0.25 } },
  { id: "afro-guitar", name: "Guitare afro (highlife, sèche et brillante)", category: "Guitars", preset: "sampler", sample: "guitar-electric", synth: { decay: 0.35, sustain: 0.25, release: 0.12 } },
  // Leads
  { id: "trap-lead", name: "Trap Lead", category: "Leads", preset: "synth", synth: { wave: "sawtooth", voices: 3, detune: 14, cutoff: 4200, mono: false } },
  { id: "mono-lead", name: "Mono Glide Lead", category: "Leads", preset: "synth", synth: { wave: "sawtooth", voices: 2, mono: true, glide: 0.08, lfoDepth: 15, lfoRate: 5.5 } },
  { id: "square-lead", name: "Square Lead", category: "Leads", preset: "synth", synth: { wave: "square", voices: 1, cutoff: 2800, resonance: 2, filterEnv: 0.3 } },
  { id: "flute", name: "Flûte (réelle)", category: "Winds", preset: "sampler", sample: "flute", synth: { attack: 0.02, release: 0.15, lfoDepth: 6, lfoRate: 5 } },
  { id: "synth-flute", name: "Soft Flute (synthé)", category: "Leads", preset: "synth", synth: { wave: "triangle", voices: 1, attack: 0.06, sustain: 0.8, cutoff: 3000, filterEnv: 0, resonance: 0.5, lfoDepth: 18, lfoRate: 5 } },
  { id: "whistle", name: "Whistle", category: "Leads", preset: "synth", synth: { wave: "sine", voices: 1, octave: 1, attack: 0.03, sustain: 0.9, filterEnv: 0, lfoDepth: 20, lfoRate: 6, mono: true, glide: 0.05 } },
  { id: "afro-lead", name: "Afro Lead", category: "Leads", preset: "synth", synth: { wave: "square", voices: 2, detune: 6, decay: 0.25, sustain: 0.3, cutoff: 3500, filterEnv: 0.6 } },
  { id: "rage-lead", name: "Rage Lead (synth saturé)", category: "Leads", preset: "synth", synth: { wave: "square", voices: 4, detune: 24, octave: 1, attack: 0.005, decay: 0.2, sustain: 0.55, release: 0.12, cutoff: 6500, resonance: 2, filterEnv: 0.4, drive: 0.6 } },
  { id: "supersaw", name: "Supersaw (hyperpop)", category: "Leads", preset: "synth", synth: { wave: "sawtooth", voices: 7, detune: 30, octave: 1, attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.2, cutoff: 9000, filterEnv: 0.2, drive: 0.35 } },
  { id: "plugg-lead", name: "Plugg Lead (doux)", category: "Leads", preset: "synth", synth: { wave: "triangle", voices: 2, detune: 8, octave: 1, attack: 0.002, decay: 0.25, sustain: 0.2, release: 0.25, cutoff: 5000, filterEnv: 0.5, lfoDepth: 6, lfoRate: 5 } },
  { id: "cowbell", name: "Cowbell (phonk)", category: "Leads", preset: "synth", synth: { wave: "square", voices: 2, detune: 35, octave: 1, attack: 0.001, decay: 0.12, sustain: 0.05, release: 0.08, cutoff: 3500, resonance: 6, filterEnv: 0.3, drive: 0.3 } },
  // Winds (recorded)
  { id: "sax", name: "Saxophone (réel)", category: "Winds", preset: "sampler", sample: "saxophone", synth: { attack: 0.01, release: 0.12 } },
  { id: "trumpet", name: "Trompette (réelle)", category: "Winds", preset: "sampler", sample: "trumpet", synth: { attack: 0.01, release: 0.1 } },
  { id: "horns", name: "Cor / cuivres doux (réel)", category: "Winds", preset: "sampler", sample: "french-horn", synth: { attack: 0.03, release: 0.2 } },
  // Pads
  { id: "warm-pad", name: "Warm Pad", category: "Pads", preset: "pad" },
  { id: "dark-pad", name: "Dark Pad", category: "Pads", preset: "pad", synth: { cutoff: 1200, lfoFilter: 0.3, lfoRate: 0.2 } },
  { id: "choir", name: "Choir Pad", category: "Pads", preset: "pad", synth: { wave: "triangle", voices: 5, detune: 14, cutoff: 2600, lfoDepth: 8, lfoRate: 4.8 } },
  { id: "air-pad", name: "Airy Pad", category: "Pads", preset: "pad", synth: { wave: "sawtooth", voices: 6, detune: 25, attack: 1.2, release: 2.5, cutoff: 5000, octave: 1 } },
  // Strings
  { id: "strings", name: "Ensemble de cordes (réel)", category: "Strings", preset: "sampler", sample: "strings", synth: { attack: 0.06, release: 0.35 } },
  { id: "drill-strings", name: "Drill Strings (cordes réelles, attaque sèche)", category: "Strings", preset: "sampler", sample: "strings", synth: { attack: 0.01, decay: 0.5, sustain: 0.55, release: 0.2 } },
  { id: "violin", name: "Violon (réel)", category: "Strings", preset: "sampler", sample: "violin", synth: { attack: 0.04, release: 0.3, lfoDepth: 5, lfoRate: 5.5 } },
  { id: "cello", name: "Violoncelle (réel)", category: "Strings", preset: "sampler", sample: "cello", synth: { attack: 0.05, release: 0.3 } },
  { id: "synth-strings", name: "String Ensemble (synthé)", category: "Strings", preset: "strings" },
  // Plucks
  { id: "pluck", name: "Guitar Pluck (nylon réelle)", category: "Plucks", preset: "sampler", sample: "guitar-nylon", synth: { decay: 0.6, sustain: 0.3, release: 0.2 } },
  { id: "kalimba", name: "Kalimba (réel)", category: "Plucks", preset: "sampler", sample: "kalimba", synth: { release: 0.4 } },
  { id: "synth-pluck-guitar", name: "Pluck (synthé Karplus)", category: "Plucks", preset: "pluck" },
  { id: "synth-pluck", name: "Synth Pluck", category: "Plucks", preset: "synth", synth: { wave: "sawtooth", voices: 2, attack: 0.001, decay: 0.18, sustain: 0, release: 0.15, cutoff: 1600, filterEnv: 0.9, resonance: 3 } },
  { id: "harp", name: "Harpe (réelle)", category: "Plucks", preset: "sampler", sample: "harp", synth: { release: 0.5 } },
  // Bells
  { id: "bells", name: "Trap Bells", category: "Bells", preset: "bells" },
  { id: "music-box", name: "Music Box", category: "Bells", preset: "bells", synth: { octave: 1, decay: 1.2, release: 0.8 } },
  { id: "glock", name: "Glockenspiel (réel)", category: "Bells", preset: "sampler", sample: "glockenspiel", synth: { release: 0.6 } },
  { id: "vibes", name: "Vibraphone (réel)", category: "Bells", preset: "sampler", sample: "vibraphone", synth: { release: 0.6, lfoDepth: 4, lfoRate: 5 } },
  { id: "marimba", name: "Marimba (réel)", category: "Bells", preset: "sampler", sample: "marimba", synth: { release: 0.3 } },
  { id: "balafon", name: "Balafon (Afrique de l'Ouest, réel)", category: "Bells", preset: "sampler", sample: "balafon", synth: { release: 0.3 } },
  // Bass
  { id: "bass-electric", name: "Basse électrique (réelle)", category: "Bass", preset: "sampler", sample: "bass-electric", synth: { release: 0.1 } },
  { id: "synth-bass", name: "Synth Bass", category: "Bass", preset: "bass" },
  { id: "reese", name: "Reese Bass", category: "Bass", preset: "bass", synth: { voices: 4, detune: 22, cutoff: 700, lfoFilter: 0.2, lfoRate: 0.5 } },
  { id: "sub-sine", name: "Sub Sine", category: "Bass", preset: "bass", synth: { wave: "sine", voices: 1, cutoff: 600, filterEnv: 0, resonance: 0.5, drive: 0.1 } },
  // Log drum: a short pitched hit an octave above the 808, with a pitch drop (punch), saturation
  // and glides between notes — the signature of amapiano.
  { id: "log-drum", name: "Log Drum (amapiano)", category: "Bass", preset: "808", bass808: { tune: 12, glide: 0.07, attack: 0.001, decay: 0.3, sustain: 0.06, release: 0.08, distortion: 0.3, saturation: 0.65, lowBoostDb: 1, highCutHz: 5200, compression: 0.45, punch: 0.9 } },
  { id: "log-drum-deep", name: "Log Drum profond (private school)", category: "Bass", preset: "808", bass808: { tune: 12, glide: 0.09, attack: 0.002, decay: 0.45, sustain: 0.12, release: 0.12, distortion: 0.1, saturation: 0.45, lowBoostDb: 3, highCutHz: 3500, compression: 0.35, punch: 0.65 } },
  { id: "synth-log-drum", name: "Log Drum (ancien, synthé)", category: "Bass", preset: "bass", synth: { wave: "sine", voices: 1, detune: 0, attack: 0.001, decay: 0.22, sustain: 0.1, release: 0.1, cutoff: 1400, resonance: 3, filterEnv: 0.8, drive: 0.45, mono: false } },
  { id: "afro-bass", name: "Afro Log Bass", category: "Bass", preset: "bass", synth: { wave: "triangle", voices: 1, decay: 0.25, sustain: 0.3, cutoff: 1100, filterEnv: 0.7, drive: 0.35 } },
  // 808
  { id: "808-clean", name: "808 Clean", category: "808", preset: "808", bass808: { distortion: 0, saturation: 0.15, punch: 0.3 } },
  { id: "808-trap", name: "808 Trap (default)", category: "808", preset: "808" },
  { id: "808-dist", name: "808 Distorted", category: "808", preset: "808", bass808: { distortion: 0.55, saturation: 0.7, compression: 0.5, highCutHz: 9000 } },
  { id: "808-drill", name: "808 Drill (sliding)", category: "808", preset: "808", bass808: { glide: 0.12, decay: 2, sustain: 0.7, punch: 0.35, saturation: 0.5 } },
  { id: "808-short", name: "808 Short Punch", category: "808", preset: "808", bass808: { decay: 0.45, sustain: 0.15, release: 0.12, punch: 0.8 } },
  { id: "808-long", name: "808 Long Boom", category: "808", preset: "808", bass808: { decay: 3, sustain: 0.8, release: 0.6, lowBoostDb: 4 } },
];

/** Full parameters of a library sound (preset defaults + overrides). */
export function soundParams(s: LibrarySound): { preset: SynthPreset; synth: SynthParams; bass808: Bass808Params; sample?: string } {
  return {
    preset: s.preset,
    synth: { ...SYNTH_PRESETS[s.preset].params, ...s.synth },
    bass808: { ...DEFAULT_808, ...s.bass808 },
    ...(s.preset === "sampler" ? { sample: s.sample } : {}),
  };
}
