// MIC CHECK: measures a recording setup from two short captures — silence (room / preamp
// noise) and normal singing or rapping — and turns the numbers into plain advice and settings.
//   • noise floor (dBFS), voice level (peak / RMS), signal-to-noise ratio
//   • mains hum (50 Hz Europe/Africa, 60 Hz Americas) and its harmonics
//   • clipping
//   • a noise profile (spectrum of the silence) used by AI VOICE CLEAN for a precise cleanup

import type { CleanLevel } from "./denoise.ts";
import { noiseProfile } from "./denoise.ts";
import { fft, hann } from "./fft.ts";

export interface MicCheckResult {
  noiseFloorDb: number;
  voicePeakDb: number;
  voiceRmsDb: number;
  snrDb: number;
  clipped: boolean;
  hum: { freq: 50 | 60; strengthDb: number } | null;
  verdict: "excellent" | "good" | "noisy" | "bad";
  /** Gain to add (+) or remove (−) on the interface / Windows, dB (0 = fine). */
  gainAdviceDb: number;
  advice: string[];
  /** Settings the app applies when the user accepts. */
  settings: { gateThresholdDb: number | null; liveDenoiseDb: number | null; clean: CleanLevel; dehum: 50 | 60 | null };
  /** Spectrum of the room noise (for studioDenoise). */
  profile: Float32Array;
}

const db = (x: number) => (x > 1e-9 ? 20 * Math.log10(x) : -180);

function rms(d: Float32Array, from = 0, to = d.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Hum detection: energy at 50/60 Hz and their harmonics vs. the neighbouring spectrum. */
export function detectHum(data: Float32Array, sr: number): { freq: 50 | 60; strengthDb: number } | null {
  const N = 16384;
  if (data.length < N) return null;
  const win = hann(N);
  const avg = new Float64Array(N / 2);
  let frames = 0;
  for (let start = 0; start + N <= data.length && frames < 12; start += N / 2, frames++) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = data[start + i] * win[i];
    fft(re, im);
    for (let k = 0; k < N / 2; k++) avg[k] += Math.hypot(re[k], im[k]);
  }
  const binHz = sr / N;
  const score = (f0: number) => {
    let sum = 0;
    for (let h = 1; h <= 4; h++) {
      const k = Math.round((f0 * h) / binHz);
      let peak = 0;
      for (let d = -1; d <= 1; d++) peak = Math.max(peak, avg[k + d] ?? 0);
      // Neighbourhood: ±(8…25) Hz, median.
      const ring: number[] = [];
      for (let d = Math.round(8 / binHz); d <= Math.round(25 / binHz); d++) ring.push(avg[k - d] ?? 0, avg[k + d] ?? 0);
      ring.sort((a, b) => a - b);
      const floor = ring[Math.floor(ring.length / 2)] || 1e-12;
      sum += db(peak / floor);
    }
    return sum / 4;
  };
  const s50 = score(50), s60 = score(60);
  const best = s50 >= s60 ? { freq: 50 as const, strengthDb: s50 } : { freq: 60 as const, strengthDb: s60 };
  return best.strengthDb >= 12 ? best : null;
}

export function analyzeMicCheck(silence: Float32Array, voice: Float32Array, sr: number): MicCheckResult {
  const noiseRms = rms(silence);
  const noiseFloorDb = db(noiseRms);
  // Voice: RMS of the louder 50 ms frames (the actual phrases, not the pauses).
  const hop = Math.round(sr * 0.05);
  const frames: number[] = [];
  let peak = 0;
  for (let i = 0; i + hop <= voice.length; i += hop) frames.push(rms(voice, i, i + hop));
  for (const x of voice) peak = Math.max(peak, Math.abs(x));
  frames.sort((a, b) => b - a);
  const top = frames.slice(0, Math.max(1, Math.floor(frames.length * 0.3)));
  const voiceRms = Math.sqrt(top.reduce((s, x) => s + x * x, 0) / top.length);
  const voicePeakDb = db(peak), voiceRmsDb = db(voiceRms);
  const snrDb = voiceRmsDb - noiseFloorDb;
  let clippedSamples = 0;
  for (const x of voice) if (Math.abs(x) >= 0.995) clippedSamples++;
  const clipped = clippedSamples > voice.length * 0.0005;
  const hum = detectHum(silence, sr);

  const advice: string[] = [];
  // Target: peaks around −10…−6 dBFS.
  let gainAdviceDb = 0;
  if (clipped || voicePeakDb > -2) {
    gainAdviceDb = Math.round(-8 - Math.max(0, voicePeakDb + 2));
    advice.push(`Votre voix sature (pic ${voicePeakDb.toFixed(1)} dBFS) : baissez le gain du micro sur la carte son d'environ ${-gainAdviceDb} dB.`);
  } else if (voicePeakDb < -20) {
    gainAdviceDb = Math.round(-10 - voicePeakDb);
    advice.push(`Le niveau est faible (pic ${voicePeakDb.toFixed(1)} dBFS) : montez le gain du micro sur la carte son d'environ ${gainAdviceDb} dB, ou rapprochez-vous (10–20 cm).`);
  } else advice.push(`Niveau de voix correct (pic ${voicePeakDb.toFixed(1)} dBFS).`);

  const verdict: MicCheckResult["verdict"] = snrDb >= 45 ? "excellent" : snrDb >= 35 ? "good" : snrDb >= 25 ? "noisy" : "bad";
  if (verdict === "excellent") advice.push(`Bruit de fond très bas (${noiseFloorDb.toFixed(0)} dBFS, rapport voix/bruit ${snrDb.toFixed(0)} dB) : enregistrement propre.`);
  else if (verdict === "good") advice.push(`Bruit de fond correct (rapport voix/bruit ${snrDb.toFixed(0)} dB). Un nettoyage léger sera appliqué aux prises.`);
  else {
    advice.push(`Bruit de fond audible (rapport voix/bruit ${snrDb.toFixed(0)} dB, bruit à ${noiseFloorDb.toFixed(0)} dBFS). Le nettoyage automatique sera renforcé.`);
    advice.push("Pour un son plus propre : éteignez ventilateurs / climatisation, éloignez le micro du PC, chantez plus près du micro et baissez plutôt le gain que l'inverse.");
    if (noiseFloorDb > -50) advice.push("Le bruit est fort même en silence : vérifiez que le gain de l'entrée inutilisée de la carte son est à zéro et que l'alimentation fantôme (48V) n'est activée que pour un micro statique.");
  }
  if (hum) advice.push(`Ronflement électrique détecté à ${hum.freq} Hz : le filtre anti-ronflement sera activé. Essayez aussi une autre prise électrique ou un câble XLR blindé.`);

  // Gate just above the room noise; live noise reduction when the room is audible.
  const gateThresholdDb = verdict === "excellent" ? null : Math.round(Math.min(-30, noiseFloorDb + 10));
  const liveDenoiseDb = verdict === "noisy" ? 10 : verdict === "bad" ? 16 : null;
  const clean: CleanLevel = verdict === "excellent" ? "low" : verdict === "good" ? "low" : verdict === "noisy" ? "medium" : "high";
  return {
    noiseFloorDb, voicePeakDb, voiceRmsDb, snrDb, clipped, hum, verdict, gainAdviceDb, advice,
    settings: { gateThresholdDb, liveDenoiseDb, clean, dehum: hum?.freq ?? null },
    profile: noiseProfile(silence),
  };
}
