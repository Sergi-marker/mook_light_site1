// Effect presets (one effect) and vocal chain presets (a whole channel strip).
// Presets are plain parameter sets: applying one stays fully editable and undoable.

import { effect } from "./project.ts";
import type { Effect, EffectType, ParamValue, VocalRole } from "./types.ts";

export interface EffectPreset {
  name: string;
  params: Record<string, ParamValue>;
}

export const EFFECT_PRESETS: Partial<Record<EffectType, EffectPreset[]>> = {
  eq: [
    { name: "Neutre", params: { lowCutHz: 0, lowGainDb: 0, midGainDb: 0, highGainDb: 0 } },
    { name: "Voix rap — présence", params: { lowCutHz: 100, lowFreqHz: 200, lowGainDb: -1, midFreqHz: 350, midGainDb: -2.5, midQ: 1, highFreqHz: 5000, highGainDb: 3 } },
    { name: "Voix — air", params: { lowCutHz: 90, midFreqHz: 2500, midGainDb: 1, midQ: 0.8, highFreqHz: 12000, highGainDb: 4 } },
    { name: "Kick punch", params: { lowCutHz: 30, lowFreqHz: 60, lowGainDb: 3, midFreqHz: 300, midGainDb: -4, midQ: 1.2, highFreqHz: 4000, highGainDb: 2 } },
    { name: "Snare crack", params: { lowCutHz: 80, lowFreqHz: 200, lowGainDb: 2, midFreqHz: 800, midGainDb: -2, midQ: 1, highFreqHz: 6000, highGainDb: 3 } },
    { name: "Hi-hats brillants", params: { lowCutHz: 300, midFreqHz: 1000, midGainDb: -2, midQ: 0.7, highFreqHz: 10000, highGainDb: 3 } },
    { name: "808 propre", params: { lowCutHz: 25, lowFreqHz: 50, lowGainDb: 1.5, midFreqHz: 250, midGainDb: -3, midQ: 1, highFreqHz: 6000, highGainDb: 0 } },
    { name: "Mélodie — laisser la place à la voix", params: { lowCutHz: 150, midFreqHz: 2500, midGainDb: -3, midQ: 0.9, highFreqHz: 9000, highGainDb: 0 } },
    { name: "Lo-fi (téléphone)", params: { lowCutHz: 400, midFreqHz: 1500, midGainDb: 4, midQ: 0.7, highFreqHz: 4000, highGainDb: -12 } },
  ],
  compressor: [
    { name: "Voix rap (contrôlée)", params: { thresholdDb: -22, ratio: 4, attackMs: 5, releaseMs: 90, kneeDb: 6, makeupDb: 5 } },
    { name: "Voix chantée (douce)", params: { thresholdDb: -20, ratio: 2.5, attackMs: 12, releaseMs: 160, kneeDb: 8, makeupDb: 3 } },
    { name: "Glue bus", params: { thresholdDb: -14, ratio: 2, attackMs: 30, releaseMs: 200, kneeDb: 6, makeupDb: 1.5 } },
    { name: "Drums punch", params: { thresholdDb: -16, ratio: 4, attackMs: 25, releaseMs: 80, kneeDb: 3, makeupDb: 3 } },
    { name: "Écrasé (parallèle)", params: { thresholdDb: -35, ratio: 12, attackMs: 1, releaseMs: 60, kneeDb: 0, makeupDb: 12 } },
  ],
  reverb: [
    { name: "Room", params: { size: 0.25, decay: 0.8, preDelayMs: 5, toneHz: 8000, mix: 1 } },
    { name: "Plate voix", params: { size: 0.5, decay: 1.8, preDelayMs: 25, toneHz: 7000, mix: 1 } },
    { name: "Hall", params: { size: 0.8, decay: 3.5, preDelayMs: 30, toneHz: 6000, mix: 1 } },
    { name: "Ambiance sombre (drill)", params: { size: 0.9, decay: 5, preDelayMs: 40, toneHz: 3500, mix: 1 } },
  ],
  delay: [
    { name: "Écho 1/4 trap", params: { time: "1/4", feedback: 0.35, toneHz: 4500, mix: 1, pingPong: false } },
    { name: "Ping-pong 1/8", params: { time: "1/8", feedback: 0.4, toneHz: 5000, mix: 1, pingPong: true } },
    { name: "Slapback", params: { time: "1/16", feedback: 0.1, toneHz: 6000, mix: 1, pingPong: false } },
    { name: "Dotted 1/8 (adlibs)", params: { time: "1/8d", feedback: 0.45, toneHz: 3500, mix: 1, pingPong: true } },
  ],
  saturation: [
    { name: "Chaleur légère", params: { drive: 0.15, mix: 0.5 } },
    { name: "Tape", params: { drive: 0.35, mix: 0.7 } },
    { name: "Grosse saturation", params: { drive: 0.7, mix: 1 } },
  ],
  distortion: [
    { name: "Crunch", params: { drive: 0.35, toneHz: 6000, mix: 0.5 } },
    { name: "Radio", params: { drive: 0.6, toneHz: 3000, mix: 0.8 } },
  ],
  limiter: [
    { name: "Sécurité −1 dB", params: { inputGainDb: 0, ceilingDb: -1, releaseMs: 80 } },
    { name: "Fort (+4 dB)", params: { inputGainDb: 4, ceilingDb: -1, releaseMs: 60 } },
  ],
  deesser: [
    { name: "Doux", params: { freq: 6500, thresholdDb: -28, rangeDb: 5 } },
    { name: "Fort", params: { freq: 6000, thresholdDb: -36, rangeDb: 10 } },
  ],
  gate: [
    { name: "Home studio (léger)", params: { thresholdDb: -50, rangeDb: 15, attackMs: 1, holdMs: 60, releaseMs: 150 } },
    { name: "Pièce bruyante", params: { thresholdDb: -40, rangeDb: 30, attackMs: 1, holdMs: 40, releaseMs: 120 } },
  ],
  width: [
    { name: "Mono", params: { width: 0 } },
    { name: "Large", params: { width: 1.4 } },
    { name: "Très large", params: { width: 1.8 } },
  ],
};

export interface ChainPreset {
  id: string;
  name: string;
  description: string;
  sends: { reverb: number; delay: number };
  chain: { type: EffectType; enabled: boolean; params?: Record<string, ParamValue> }[];
}

const ch = (type: EffectType, enabled: boolean, params?: Record<string, ParamValue>) => ({ type, enabled, params });

/** Complete real-time vocal chains, in the canonical processing order. */
export const VOCAL_CHAIN_PRESETS: ChainPreset[] = [
  {
    id: "rap-lead", name: "Rap Lead", description: "Voix devant, contrôlée, présente — rap / trap.",
    sends: { reverb: 0.1, delay: 0.05 },
    chain: [ch("denoise", false), ch("gate", true, { thresholdDb: -50, rangeDb: 15 }), ch("eq", true, EFFECT_PRESETS.eq![1].params), ch("deesser", true, { thresholdDb: -30, rangeDb: 7 }),
      ch("compressor", true, EFFECT_PRESETS.compressor![0].params), ch("autopitch", false), ch("leveler", true, { amount: 50 }), ch("saturation", true, { drive: 0.15, mix: 0.4 }), ch("limiter", true, { ceilingDb: -2 })],
  },
  {
    id: "melodic", name: "Melodic / Autotune", description: "Voix chantée, AUTO PITCH LIVE rapide, réverb plate.",
    sends: { reverb: 0.22, delay: 0.12 },
    chain: [ch("denoise", false), ch("gate", false), ch("eq", true, EFFECT_PRESETS.eq![2].params), ch("deesser", true, { thresholdDb: -30, rangeDb: 8 }),
      ch("compressor", true, EFFECT_PRESETS.compressor![1].params), ch("autopitch", true, { preset: "modern", correction: 85, retuneMs: 25, humanize: 25 }), ch("leveler", true, { amount: 40 }), ch("saturation", false), ch("limiter", true, { ceilingDb: -2 })],
  },
  {
    id: "hard-tune", name: "Hard Tune", description: "Effet autotune robotique (T-Pain / trap mélodique).",
    sends: { reverb: 0.18, delay: 0.15 },
    chain: [ch("denoise", false), ch("gate", true, { thresholdDb: -48, rangeDb: 20 }), ch("eq", true, EFFECT_PRESETS.eq![1].params), ch("deesser", true),
      ch("compressor", true, EFFECT_PRESETS.compressor![0].params), ch("autopitch", true, { preset: "hardTune", correction: 100, retuneMs: 0, humanize: 0 }), ch("leveler", false), ch("saturation", true, { drive: 0.2, mix: 0.5 }), ch("limiter", true, { ceilingDb: -2 })],
  },
  {
    id: "drill", name: "Drill", description: "Voix sèche et agressive, peu de réverb.",
    sends: { reverb: 0.06, delay: 0.04 },
    chain: [ch("denoise", false), ch("gate", true, { thresholdDb: -45, rangeDb: 25 }), ch("eq", true, { lowCutHz: 120, midFreqHz: 400, midGainDb: -3, highFreqHz: 4500, highGainDb: 3.5 }), ch("deesser", true, { thresholdDb: -32, rangeDb: 8 }),
      ch("compressor", true, { thresholdDb: -24, ratio: 6, attackMs: 3, releaseMs: 70, kneeDb: 3, makeupDb: 7 }), ch("autopitch", false), ch("leveler", true, { amount: 60 }), ch("saturation", true, { drive: 0.3, mix: 0.5 }), ch("limiter", true, { ceilingDb: -2 })],
  },
  {
    id: "adlibs", name: "Adlibs", description: "Plus fin, plus large, delay dotted pour les ad-libs.",
    sends: { reverb: 0.3, delay: 0.25 },
    chain: [ch("denoise", false), ch("gate", true, { thresholdDb: -45, rangeDb: 30 }), ch("eq", true, { lowCutHz: 200, midFreqHz: 1500, midGainDb: 2, highFreqHz: 8000, highGainDb: 3 }), ch("deesser", true),
      ch("compressor", true, EFFECT_PRESETS.compressor![0].params), ch("autopitch", false), ch("leveler", false), ch("saturation", true, { drive: 0.3, mix: 0.6 }), ch("limiter", true, { ceilingDb: -3 })],
  },
  {
    id: "backing", name: "Doubles / Backing", description: "Moins de présence pour rester derrière le lead.",
    sends: { reverb: 0.25, delay: 0.08 },
    chain: [ch("denoise", false), ch("gate", true, { thresholdDb: -45, rangeDb: 25 }), ch("eq", true, { lowCutHz: 180, midFreqHz: 3000, midGainDb: -2, highFreqHz: 9000, highGainDb: 1 }), ch("deesser", true, { thresholdDb: -34, rangeDb: 10 }),
      ch("compressor", true, { thresholdDb: -24, ratio: 4, attackMs: 8, releaseMs: 120, kneeDb: 6, makeupDb: 4 }), ch("autopitch", false), ch("leveler", true, { amount: 50 }), ch("saturation", false), ch("limiter", true, { ceilingDb: -4 })],
  },
  {
    id: "rnb", name: "R&B Smooth", description: "Douce, aérée, réverb longue.",
    sends: { reverb: 0.3, delay: 0.1 },
    chain: [ch("denoise", false), ch("gate", false), ch("eq", true, { lowCutHz: 80, midFreqHz: 300, midGainDb: -1.5, highFreqHz: 12000, highGainDb: 4 }), ch("deesser", true, { thresholdDb: -30, rangeDb: 8 }),
      ch("compressor", true, EFFECT_PRESETS.compressor![1].params), ch("autopitch", true, { preset: "natural", correction: 50, retuneMs: 100, humanize: 60 }), ch("leveler", true, { amount: 35 }), ch("saturation", true, { drive: 0.1, mix: 0.4 }), ch("limiter", true, { ceilingDb: -2 })],
  },
];

/** Suggested chain for a vocal role. */
export function defaultChainFor(role: VocalRole): ChainPreset {
  const id = role === "adlibs" ? "adlibs" : role === "double" || role === "backing" ? "backing" : "rap-lead";
  return VOCAL_CHAIN_PRESETS.find((c) => c.id === id)!;
}

/**
 * Build the inserts of a chain preset. Existing effects of the same type keep their id
 * (so live audio nodes are updated, not rebuilt) and get the preset's parameters.
 */
export function buildChain(preset: ChainPreset, current: Effect[]): Effect[] {
  const used = new Set<string>();
  return preset.chain.map((c) => {
    const ex = current.find((e) => e.type === c.type && !used.has(e.id));
    if (ex) {
      used.add(ex.id);
      return { ...ex, enabled: c.enabled, params: { ...effect(c.type).params, ...(c.params ?? {}) } };
    }
    return effect(c.type, c.params ?? {}, c.enabled);
  });
}

/** Deep copy of an insert chain with fresh effect ids (copy / paste between channels). */
export function cloneChain(chain: Effect[]): Effect[] {
  return chain.map((e) => effect(e.type, { ...e.params }, e.enabled));
}
