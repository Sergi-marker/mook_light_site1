// Recorded drum & percussion one-shots (CC0) and the drum kits built from them. Pure data/logic.
import type { InstrumentKind } from "./types.ts";
import { DRUM_SAMPLE_DATA } from "./drumSamples.data.ts";

export interface DrumSample {
  id: string;
  name: string;
  /** Lane it is designed for. */
  kind: Exclude<InstrumentKind, "808">;
  file: string;
  /** Playback gain matching the built-in sound of its lane. */
  gainDb: number;
  license: string;
  credit: string;
}

export const DRUM_SAMPLES: DrumSample[] = DRUM_SAMPLE_DATA;

export function drumSample(id: string | undefined | null): DrumSample | null {
  return (id && DRUM_SAMPLES.find((d) => d.id === id)) || null;
}

export function isDrumSample(id: unknown): id is string {
  return typeof id === "string" && DRUM_SAMPLES.some((d) => d.id === id);
}

type Lane = DrumSample["kind"];

export interface DrumKit {
  id: string;
  name: string;
  description: string;
  /** Sound per lane: a recorded hit id, or null = the built-in synthesised sound. */
  sounds: Record<Lane, string | null>;
}

export const DRUM_KITS: DrumKit[] = [
  { id: "synth", name: "Électronique 808 (trap, drill)", description: "Les sons synthétisés d'origine : kick 808, snare et hats électroniques.",
    sounds: { kick: null, snare: null, clap: null, closedHat: null, openHat: null, perc: null } },
  { id: "trap-hybrid", name: "Trap hybride (snaps et claps réels)", description: "Kick et hats électroniques, claps et snaps enregistrés pour un son moins plastique.",
    sounds: { kick: null, snare: null, clap: "clap-group", closedHat: null, openHat: null, perc: "snap" } },
  { id: "boombap", name: "Boom bap (batterie réelle)", description: "Kick lourd, snare sèche, charley acoustique : rap old school, lo-fi.",
    sounds: { kick: "kick-heavy", snare: "snare-crisp", clap: "clap-group", closedHat: "hat-closed", openHat: "hat-open", perc: "tom-mid" } },
  { id: "live", name: "Batterie live (acoustique)", description: "Vraie batterie : grosse caisse, caisse claire moderne, charley live, toms.",
    sounds: { kick: "kick-acoustic", snare: "snare-modern", clap: "clap-solo", closedHat: "hat-tight", openHat: "hat-open-loose", perc: "tom-low" } },
  { id: "rnb", name: "R&B organique", description: "Kick doux, snare douce, claquements de doigts, charley serré.",
    sounds: { kick: "kick-soft", snare: "snare-soft", clap: "snap", closedHat: "hat-tight", openHat: "hat-open-loose", perc: "bongo-high" } },
  { id: "afro", name: "Afrobeats (percussions réelles)", description: "Shaker, congas, tambourin et claps enregistrés sur un kick doux.",
    sounds: { kick: "kick-soft", snare: "snare-tight", clap: "clap-group", closedHat: "shaker", openHat: "tambourine", perc: "conga-open" } },
  { id: "amapiano", name: "Amapiano", description: "Kick house sec, shaker en aller-retour, claps, quinto : à associer au Log Drum.",
    sounds: { kick: "kick-house", snare: "snare-crisp", clap: "clap-group", closedHat: "shaker-down", openHat: "hat-open-loose", perc: "conga-high" } },
  { id: "dancehall", name: "Dancehall / kompa / zouk", description: "Kick fat, snare dub, gros shaker, cloche et bongos.",
    sounds: { kick: "kick-fat", snare: "snare-dub", clap: "clap-group", closedHat: "shaker-large", openHat: "tambourine", perc: "cowbell-real" } },
];

export function drumKit(id: string | undefined): DrumKit | null {
  return DRUM_KITS.find((k) => k.id === id) ?? null;
}
