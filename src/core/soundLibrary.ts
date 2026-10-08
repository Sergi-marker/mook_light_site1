// Sound library: named, ready-to-use instrument sounds (rap / trap / drill / afro / R&B).
// A sound is just a preset + parameter overrides, so applying one stays fully editable.

import { DEFAULT_808, SYNTH_PRESETS } from "./project.ts";
import type { Bass808Params, SynthParams, SynthPreset } from "./types.ts";

export interface LibrarySound {
  id: string;
  name: string;
  category: "Keys" | "Leads" | "Pads" | "Strings" | "Plucks" | "Bells" | "Bass" | "808";
  preset: SynthPreset;
  synth?: Partial<SynthParams>;
  bass808?: Partial<Bass808Params>;
}

export const SOUND_LIBRARY: LibrarySound[] = [
  // Keys
  { id: "grand", name: "Grand Piano", category: "Keys", preset: "piano" },
  { id: "dark-piano", name: "Dark Piano (drill)", category: "Keys", preset: "piano", synth: { cutoff: 2600, release: 0.8 } },
  { id: "lofi-keys", name: "Lo-fi Keys", category: "Keys", preset: "piano", synth: { cutoff: 1800, lfoDepth: 8, lfoRate: 0.7, drive: 0.25 } },
  { id: "rnb-rhodes", name: "R&B Rhodes", category: "Keys", preset: "epiano", synth: { lfoDepth: 6, lfoRate: 4.5, drive: 0.15 } },
  { id: "suitcase", name: "Suitcase EP", category: "Keys", preset: "epiano", synth: { decay: 2.2, release: 0.8, cutoff: 3800 } },
  // Leads
  { id: "trap-lead", name: "Trap Lead", category: "Leads", preset: "synth", synth: { wave: "sawtooth", voices: 3, detune: 14, cutoff: 4200, mono: false } },
  { id: "mono-lead", name: "Mono Glide Lead", category: "Leads", preset: "synth", synth: { wave: "sawtooth", voices: 2, mono: true, glide: 0.08, lfoDepth: 15, lfoRate: 5.5 } },
  { id: "square-lead", name: "Square Lead", category: "Leads", preset: "synth", synth: { wave: "square", voices: 1, cutoff: 2800, resonance: 2, filterEnv: 0.3 } },
  { id: "flute", name: "Soft Flute", category: "Leads", preset: "synth", synth: { wave: "triangle", voices: 1, attack: 0.06, sustain: 0.8, cutoff: 3000, filterEnv: 0, resonance: 0.5, lfoDepth: 18, lfoRate: 5 } },
  { id: "whistle", name: "Whistle", category: "Leads", preset: "synth", synth: { wave: "sine", voices: 1, octave: 1, attack: 0.03, sustain: 0.9, filterEnv: 0, lfoDepth: 20, lfoRate: 6, mono: true, glide: 0.05 } },
  { id: "afro-lead", name: "Afro Lead", category: "Leads", preset: "synth", synth: { wave: "square", voices: 2, detune: 6, decay: 0.25, sustain: 0.3, cutoff: 3500, filterEnv: 0.6 } },
  { id: "rage-lead", name: "Rage Lead (synth saturé)", category: "Leads", preset: "synth", synth: { wave: "square", voices: 4, detune: 24, octave: 1, attack: 0.005, decay: 0.2, sustain: 0.55, release: 0.12, cutoff: 6500, resonance: 2, filterEnv: 0.4, drive: 0.6 } },
  { id: "supersaw", name: "Supersaw (hyperpop)", category: "Leads", preset: "synth", synth: { wave: "sawtooth", voices: 7, detune: 30, octave: 1, attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.2, cutoff: 9000, filterEnv: 0.2, drive: 0.35 } },
  { id: "plugg-lead", name: "Plugg Lead (doux)", category: "Leads", preset: "synth", synth: { wave: "triangle", voices: 2, detune: 8, octave: 1, attack: 0.002, decay: 0.25, sustain: 0.2, release: 0.25, cutoff: 5000, filterEnv: 0.5, lfoDepth: 6, lfoRate: 5 } },
  { id: "cowbell", name: "Cowbell (phonk)", category: "Leads", preset: "synth", synth: { wave: "square", voices: 2, detune: 35, octave: 1, attack: 0.001, decay: 0.12, sustain: 0.05, release: 0.08, cutoff: 3500, resonance: 6, filterEnv: 0.3, drive: 0.3 } },
  // Pads
  { id: "warm-pad", name: "Warm Pad", category: "Pads", preset: "pad" },
  { id: "dark-pad", name: "Dark Pad", category: "Pads", preset: "pad", synth: { cutoff: 1200, lfoFilter: 0.3, lfoRate: 0.2 } },
  { id: "choir", name: "Choir Pad", category: "Pads", preset: "pad", synth: { wave: "triangle", voices: 5, detune: 14, cutoff: 2600, lfoDepth: 8, lfoRate: 4.8 } },
  { id: "air-pad", name: "Airy Pad", category: "Pads", preset: "pad", synth: { wave: "sawtooth", voices: 6, detune: 25, attack: 1.2, release: 2.5, cutoff: 5000, octave: 1 } },
  // Strings
  { id: "strings", name: "String Ensemble", category: "Strings", preset: "strings" },
  { id: "drill-strings", name: "Drill Strings", category: "Strings", preset: "strings", synth: { attack: 0.08, cutoff: 4200, lfoDepth: 16 } },
  { id: "cello", name: "Cello", category: "Strings", preset: "strings", synth: { octave: -1, voices: 2, cutoff: 2000, attack: 0.15 } },
  // Plucks
  { id: "pluck", name: "Guitar Pluck", category: "Plucks", preset: "pluck" },
  { id: "kalimba", name: "Kalimba (afro)", category: "Plucks", preset: "pluck", synth: { cutoff: 3500, octave: 1 } },
  { id: "synth-pluck", name: "Synth Pluck", category: "Plucks", preset: "synth", synth: { wave: "sawtooth", voices: 2, attack: 0.001, decay: 0.18, sustain: 0, release: 0.15, cutoff: 1600, filterEnv: 0.9, resonance: 3 } },
  { id: "harp", name: "Harp", category: "Plucks", preset: "pluck", synth: { cutoff: 7000, release: 0.6 } },
  // Bells
  { id: "bells", name: "Trap Bells", category: "Bells", preset: "bells" },
  { id: "music-box", name: "Music Box", category: "Bells", preset: "bells", synth: { octave: 1, decay: 1.2, release: 0.8 } },
  { id: "glock", name: "Glockenspiel", category: "Bells", preset: "bells", synth: { decay: 2.5, cutoff: 12000 } },
  { id: "vibes", name: "Vibraphone", category: "Bells", preset: "epiano", synth: { lfoDepth: 10, lfoRate: 5, decay: 2.5, release: 1.2 } },
  // Bass
  { id: "synth-bass", name: "Synth Bass", category: "Bass", preset: "bass" },
  { id: "reese", name: "Reese Bass", category: "Bass", preset: "bass", synth: { voices: 4, detune: 22, cutoff: 700, lfoFilter: 0.2, lfoRate: 0.5 } },
  { id: "sub-sine", name: "Sub Sine", category: "Bass", preset: "bass", synth: { wave: "sine", voices: 1, cutoff: 600, filterEnv: 0, resonance: 0.5, drive: 0.1 } },
  { id: "log-drum", name: "Log Drum (amapiano)", category: "Bass", preset: "bass", synth: { wave: "sine", voices: 1, detune: 0, attack: 0.001, decay: 0.22, sustain: 0.1, release: 0.1, cutoff: 1400, resonance: 3, filterEnv: 0.8, drive: 0.45, mono: false } },
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
export function soundParams(s: LibrarySound): { preset: SynthPreset; synth: SynthParams; bass808: Bass808Params } {
  return {
    preset: s.preset,
    synth: { ...SYNTH_PRESETS[s.preset].params, ...s.synth },
    bass808: { ...DEFAULT_808, ...s.bass808 },
  };
}
