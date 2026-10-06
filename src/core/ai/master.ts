// AI MASTER: analyses the raw mix (master chain bypassed) and proposes a master chain —
// EQ, glue compression, light saturation, limiter — aimed at a loudness target while
// keeping the true peak at or below the ceiling. Never pushes into clipping.

import type { MixMeasurements } from "../dsp/loudness.ts";
import { RAP_REFERENCE, type BandBalance } from "../dsp/spectrum.ts";
import { effect } from "../project.ts";
import type { Effect } from "../types.ts";

export type MasterTarget = "streaming" | "loud" | "club";
export const MASTER_TARGETS: Record<MasterTarget, { label: string; lufs: number; ceilingDb: number }> = {
  streaming: { label: "Streaming (−14 LUFS)", lufs: -14, ceilingDb: -1 },
  loud: { label: "Rap moderne (−10 LUFS)", lufs: -10, ceilingDb: -1 },
  club: { label: "Très fort (−8 LUFS)", lufs: -8, ceilingDb: -1 },
};

export interface MasterProposal {
  inserts: Effect[];
  notes: string[];
  limiterInputDb: number;
}

export function proposeMaster(m: MixMeasurements, bands: BandBalance, target: MasterTarget): MasterProposal {
  const t = MASTER_TARGETS[target];
  const notes: string[] = [];
  // Tonal correction: half of the deviation from the reference, capped at ±3 dB.
  const dev = (k: keyof BandBalance) => Math.max(-3, Math.min(3, -(bands[k] - RAP_REFERENCE[k]) / 2));
  const lowGain = Math.round(dev("low") * 2) / 2;
  const midGain = Math.round(dev("lowMid") * 2) / 2;
  const highGain = Math.round(((dev("high") + dev("air")) / 2) * 2) / 2;
  if (lowGain) notes.push(`EQ graves ${lowGain > 0 ? "+" : ""}${lowGain} dB (balance tonale).`);
  if (midGain) notes.push(`EQ bas-médiums ${midGain > 0 ? "+" : ""}${midGain} dB à 400 Hz.`);
  if (highGain) notes.push(`EQ aigus ${highGain > 0 ? "+" : ""}${highGain} dB.`);
  const eq = effect("eq", { lowCutHz: 25, lowFreqHz: 90, lowGainDb: lowGain, midFreqHz: 400, midGainDb: midGain, midQ: 0.8, highFreqHz: 9000, highGainDb: highGain });
  // Glue compression: gentle, only if the mix is dynamic.
  const ratio = m.plr > 14 ? 2 : m.plr > 10 ? 1.6 : 1.3;
  const comp = effect("compressor", { thresholdDb: Math.round(m.rmsDb + 4), ratio, attackMs: 30, releaseMs: 200, kneeDb: 6, makeupDb: 0 });
  notes.push(`Compression de cohésion ${ratio}:1 (dynamique actuelle ${m.plr.toFixed(1)} dB).`);
  const sat = effect("saturation", { drive: 0.12, mix: 0.6 });
  notes.push("Saturation légère pour la densité.");
  // Limiter gain to reach the target (estimate; verified by a second render).
  const compReduction = Math.max(0, (m.plr - 8) * 0.15);
  let gain = t.lufs - m.integratedLufs + compReduction;
  gain = Math.max(0, Math.min(12, gain));
  if (!Number.isFinite(gain)) gain = 0;
  const lim = effect("limiter", { ceilingDb: t.ceilingDb, releaseMs: 80, inputGainDb: Math.round(gain * 10) / 10 });
  notes.push(`Limiteur : gain +${gain.toFixed(1)} dB, plafond ${t.ceilingDb} dBTP (objectif ${t.lufs} LUFS).`);
  if (m.integratedLufs > t.lufs) notes.push("Le mix est déjà plus fort que l'objectif : le limiteur ne sert que de sécurité.");
  return { inserts: [eq, comp, sat, lim], notes, limiterInputDb: gain };
}

/** Second pass: correct the limiter gain from the measured result (keeps TP ≤ ceiling). */
export function refineLimiterGain(currentGainDb: number, measured: MixMeasurements, target: MasterTarget): number {
  const t = MASTER_TARGETS[target];
  let g = currentGainDb + (t.lufs - measured.integratedLufs);
  // Pushing beyond ~+6 dB into the limiter starts to audibly crush transients.
  g = Math.max(0, Math.min(12, g));
  return Math.round(g * 10) / 10;
}
