// AI MIX ASSISTANT: reads measurements of the rendered mix and of each group, then proposes
// concrete, reversible changes (as reducer actions). Preview first, then apply.

import type { MixMeasurements } from "../dsp/loudness.ts";
import { RAP_REFERENCE, type BandBalance } from "../dsp/spectrum.ts";
import { BUS_DRUMS, BUS_MUSIC, BUS_VOCALS, effect, getChannel } from "../project.ts";
import type { Action } from "../reducer.ts";
import type { Channel, Effect, Project } from "../types.ts";

export interface GroupMeasure {
  lufs: number;
  peakDb: number;
  bands: BandBalance;
}

export interface MixAnalysisInput {
  mix: MixMeasurements & { bands: BandBalance };
  drums: GroupMeasure | null;
  bass808: GroupMeasure | null;
  music: GroupMeasure | null;
  vocals: GroupMeasure | null;
}

export type Severity = "ok" | "info" | "warn" | "issue";

export interface Suggestion {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  actions: Action[];
}

const db2g = (db: number) => Math.pow(10, db / 20);
const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "−∞");

function scaleVolume(p: Project, id: string, db: number): Action | null {
  const ch = getChannel(p, id);
  if (!ch) return null;
  return { type: "updateChannel", channelId: id, patch: { volume: Math.min(1.5, Math.max(0, ch.volume * db2g(db))) } };
}

/** Ensure an enabled EQ insert on a channel with the given params merged in. */
function eqAction(ch: Channel, params: Effect["params"]): Action {
  const eq = ch.inserts.find((e) => e.type === "eq");
  if (eq) return { type: "updateEffect", channelId: ch.id, effectId: eq.id, params, enabled: true };
  return { type: "setInserts", channelId: ch.id, inserts: [effect("eq", params), ...ch.inserts] };
}

export function analyzeMix(p: Project, m: MixAnalysisInput): Suggestion[] {
  const out: Suggestion[] = [];
  const b808 = p.instruments.find((i) => i.preset === "808");
  // 1. Clipping / headroom before the master chain.
  if (m.mix.samplePeakDb > -0.3 || m.mix.clippedSamples > 0) {
    const cut = Math.max(1.5, m.mix.samplePeakDb + 3);
    out.push({
      id: "clip", severity: "issue", title: "Clipping dans le mix",
      detail: `Crête à ${fmt(m.mix.samplePeakDb)} dBFS avant le master (${m.mix.clippedSamples} échantillons saturés). Baisser les bus de ${cut.toFixed(1)} dB redonne de la marge au mastering.`,
      actions: [BUS_DRUMS, BUS_MUSIC, BUS_VOCALS].map((id) => scaleVolume(p, id, -cut)).filter(Boolean) as Action[],
    });
  }
  // 2. Vocal level vs beat.
  if (m.vocals && m.music && m.drums && Number.isFinite(m.vocals.lufs)) {
    const beat = 10 * Math.log10(Math.pow(10, m.music.lufs / 10) + Math.pow(10, m.drums.lufs / 10) + (m.bass808 ? Math.pow(10, m.bass808.lufs / 10) : 0));
    const diff = m.vocals.lufs - beat;
    if (diff < -3) {
      out.push({ id: "vox-low", severity: "issue", title: "Voix trop faible", detail: `La voix est ${fmt(-diff)} dB sous le beat (cible rap : entre −2 et +1 dB). Monter le VOCAL BUS de ${(-1 - diff).toFixed(1)} dB.`, actions: [scaleVolume(p, BUS_VOCALS, -1 - diff)].filter(Boolean) as Action[] });
    } else if (diff > 3) {
      out.push({ id: "vox-high", severity: "warn", title: "Voix trop forte", detail: `La voix dépasse le beat de ${fmt(diff)} dB : elle semble posée par-dessus. Baisser le VOCAL BUS de ${(diff - 1).toFixed(1)} dB.`, actions: [scaleVolume(p, BUS_VOCALS, -(diff - 1))].filter(Boolean) as Action[] });
    } else out.push({ id: "vox-ok", severity: "ok", title: "Niveau de la voix équilibré", detail: `Voix ${diff >= 0 ? "+" : ""}${fmt(diff)} dB par rapport au beat.`, actions: [] });
  } else if (!m.vocals || !Number.isFinite(m.vocals?.lufs ?? NaN)) {
    out.push({ id: "vox-none", severity: "info", title: "Pas de voix dans l'arrangement", detail: "L'analyse voix/beat sera disponible quand des prises seront placées sur la timeline.", actions: [] });
  }
  // 3. 808 vs drums.
  if (m.bass808 && m.drums && b808 && Number.isFinite(m.bass808.lufs)) {
    const diff = m.bass808.lufs - m.drums.lufs;
    if (diff > 4) out.push({ id: "808-loud", severity: "warn", title: "808 trop forte", detail: `La 808 est ${fmt(diff)} dB au-dessus des drums : elle écrase le kick et prend toute la marge. Baisser la 808 de ${(diff - 2).toFixed(1)} dB.`, actions: [scaleVolume(p, b808.id, -(diff - 2))].filter(Boolean) as Action[] });
    else if (diff < -8) out.push({ id: "808-soft", severity: "info", title: "808 discrète", detail: `La 808 est ${fmt(-diff)} dB sous les drums. Pour du rap moderne, la monter de ${(-diff - 5).toFixed(1)} dB.`, actions: [scaleVolume(p, b808.id, -diff - 5)].filter(Boolean) as Action[] });
  }
  // 4. Tonal balance vs reference.
  const bands = m.mix.bands;
  const music = getChannel(p, BUS_MUSIC);
  if (bands.sub - RAP_REFERENCE.sub > 4 && b808) {
    const ch = getChannel(p, b808.id)!;
    out.push({ id: "sub", severity: "warn", title: "Trop de sub-basses", detail: `Le sub (20–60 Hz) est ${fmt(bands.sub - RAP_REFERENCE.sub)} dB au-dessus de la référence : le mix va sonner flou et perdre en volume. Couper sous 30 Hz et réduire le boost grave de la 808.`, actions: [eqAction(ch, { lowCutHz: 30 }), { type: "updateInstrument", trackId: b808.id, patch: { bass808: { lowBoostDb: Math.max(0, b808.bass808.lowBoostDb - 2) } } }] });
  }
  if (bands.lowMid - RAP_REFERENCE.lowMid > 3 && music) {
    out.push({ id: "mud", severity: "warn", title: "Bas-médiums chargés (boue)", detail: `250–1000 Hz : +${fmt(bands.lowMid - RAP_REFERENCE.lowMid)} dB. Une coupe large à 400 Hz sur le MUSIC BUS libère la place pour la voix.`, actions: [eqAction(music, { midFreqHz: 400, midGainDb: -2.5, midQ: 0.8 })] });
  }
  if (bands.high - RAP_REFERENCE.high > 4 && music) {
    out.push({ id: "harsh", severity: "warn", title: "Aigus agressifs", detail: `4–10 kHz : +${fmt(bands.high - RAP_REFERENCE.high)} dB. Atténuer légèrement les aigus du MUSIC BUS (−2 dB shelving à 8 kHz).`, actions: [eqAction(music, { highFreqHz: 8000, highGainDb: -2 })] });
  }
  if (bands.mid - RAP_REFERENCE.mid < -5 && m.vocals) {
    out.push({ id: "dull", severity: "info", title: "Manque de présence", detail: "Les médiums (1–4 kHz) sont faibles : la voix risque de manquer d'intelligibilité. Un léger boost de présence sur le VOCAL BUS aide.", actions: getChannel(p, BUS_VOCALS) ? [eqAction(getChannel(p, BUS_VOCALS)!, { midFreqHz: 3000, midGainDb: 2, midQ: 1 })] : [] });
  }
  // 5. Stereo.
  if (Math.abs(m.mix.stereoBalance) > 0.15) {
    const side = m.mix.stereoBalance > 0 ? "droite" : "gauche";
    const culprit = p.channels.filter((c) => ["drum", "instrument", "vocal"].includes(c.kind) && Math.sign(c.pan) === Math.sign(m.mix.stereoBalance) && Math.abs(c.pan) > 0.2).sort((a, b) => Math.abs(b.pan) * b.volume - Math.abs(a.pan) * a.volume)[0];
    out.push({ id: "balance", severity: "warn", title: "Mix déséquilibré", detail: `Le mix penche à ${side} (${(m.mix.stereoBalance * 100).toFixed(0)} %).${culprit ? ` « ${culprit.name} » est très panoramiqué : le recentrer.` : ""}`, actions: culprit ? [{ type: "updateChannel", channelId: culprit.id, patch: { pan: culprit.pan * 0.4 } }] : [] });
  }
  if (m.mix.correlation < 0.2) out.push({ id: "phase", severity: "warn", title: "Compatibilité mono faible", detail: `Corrélation de phase ${m.mix.correlation.toFixed(2)} : sur un téléphone ou une enceinte mono, une partie du mix disparaîtra. Réduire les effets stéréo / ping-pong.`, actions: [] });
  // 6. Dynamics.
  if (m.mix.plr < 7) out.push({ id: "squashed", severity: "warn", title: "Mix déjà très compressé", detail: `Rapport crête/loudness ${fmt(m.mix.plr)} dB : il reste peu de dynamique pour le mastering.`, actions: [] });
  else if (m.mix.plr > 18) {
    const bus = getChannel(p, BUS_DRUMS);
    const comp = bus?.inserts.find((e) => e.type === "compressor");
    out.push({ id: "dynamic", severity: "info", title: "Drums peu tenus", detail: `Dynamique élevée (${fmt(m.mix.plr)} dB) : une compression douce du DRUM BUS donnera de la cohésion.`, actions: bus && comp ? [{ type: "updateEffect", channelId: bus.id, effectId: comp.id, enabled: true, params: { thresholdDb: -14, ratio: 2.5, attackMs: 25, releaseMs: 150 } }] : [] });
  }
  if (!out.some((s) => s.severity === "issue" || s.severity === "warn")) out.push({ id: "ok", severity: "ok", title: "Mix sain", detail: "Aucun problème majeur détecté : niveaux, balance tonale et stéréo sont dans les cibles.", actions: [] });
  return out;
}

export { db2g };
