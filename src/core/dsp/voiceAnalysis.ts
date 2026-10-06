// Voice analysis used by AUTO VOICE, VOICE CONSISTENCY and AI TAKE COMP.
// Everything is computed locally from the audio; nothing is sent anywhere.

import { detectKey, type Key } from "../music.ts";
import { hann, magnitudeSpectrum } from "./fft.ts";
import { integratedLoudness } from "./loudness.ts";
import { freqToMidi, pitchTrack } from "./yin.ts";

export type Level3 = "LOW" | "MEDIUM" | "HIGH";

export interface VoiceAnalysis {
  durationSec: number;
  noiseFloorDb: number;
  speechLevelDb: number;
  snrDb: number;
  noise: Level3;
  /** Spread (dB) between loud and soft voiced passages. */
  dynamicRangeDb: number;
  dynamics: Level3;
  /** Energy 5–10 kHz relative to the whole voiced spectrum, dB. */
  sibilanceDb: number;
  sibilance: Level3;
  /** % of voiced frames within ±30 cents of a semitone. */
  pitchStability: number;
  voicedRatio: number;
  medianPitchMidi: number;
  clippingPercent: number;
  peakDb: number;
  lufs: number;
  /** Energy below 150 Hz relative to total (proximity effect / rumble), dB. */
  lowEndDb: number;
  /** Energy 200–500 Hz relative to total ("mud"), dB. */
  mudDb: number;
  /** Energy 2–5 kHz relative to total (presence), dB. */
  presenceDb: number;
  detectedKey: Key | null;
}

const pct = (arr: number[], p: number) => {
  if (!arr.length) return -120;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
};
const lvl3 = (x: number, lo: number, hi: number): Level3 => (x < lo ? "LOW" : x < hi ? "MEDIUM" : "HIGH");

export function analyzeVoice(data: Float32Array, sr: number): VoiceAnalysis {
  const frame = Math.round(sr * 0.05);
  const rmsDb: number[] = [];
  let clipped = 0, peak = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a >= 0.99) clipped++;
    if (a > peak) peak = a;
  }
  for (let s = 0; s + frame <= data.length; s += frame) {
    let e = 0;
    for (let i = s; i < s + frame; i++) e += data[i] * data[i];
    rmsDb.push(10 * Math.log10(e / frame + 1e-12));
  }
  const noiseFloorDb = pct(rmsDb, 0.1);
  const speechLevelDb = pct(rmsDb, 0.95);
  const snrDb = speechLevelDb - noiseFloorDb;
  const active = rmsDb.filter((x) => x > noiseFloorDb + 12);
  const dynamicRangeDb = active.length ? pct(active, 0.95) - pct(active, 0.2) : 0;

  // Spectral balance over active frames.
  const N = 2048;
  const w = hann(N);
  const binHz = sr / N;
  let tot = 0, sib = 0, low = 0, mud = 0, pres = 0;
  const actThreshold = Math.pow(10, (noiseFloorDb + 12) / 10);
  for (let s = 0; s + N <= data.length; s += N) {
    let e = 0;
    for (let i = s; i < s + N; i++) e += data[i] * data[i];
    if (e / N < actThreshold) continue;
    const m = magnitudeSpectrum(data.subarray(s, s + N), w);
    for (let k = 1; k < m.length; k++) {
      const f = k * binHz, p = m[k] * m[k];
      tot += p;
      if (f >= 5000 && f <= 10000) sib += p;
      if (f < 150) low += p;
      if (f >= 200 && f <= 500) mud += p;
      if (f >= 2000 && f <= 5000) pres += p;
    }
  }
  const rel = (x: number) => 10 * Math.log10((x + 1e-12) / (tot + 1e-12));

  const track = pitchTrack(data, sr, 512, 2048);
  const voiced = track.filter((r) => r.freq > 0 && r.confidence > 0.6);
  const midis = voiced.map((r) => freqToMidi(r.freq));
  const stable = midis.filter((m) => Math.abs(m - Math.round(m)) < 0.3).length;
  const pitchStability = midis.length ? (stable / midis.length) * 100 : 0;
  const det = midis.length > 10 ? detectKey(midis.map((m) => ({ pitch: Math.round(m), length: 1 }))) : null;

  const sibilanceDb = rel(sib);
  return {
    durationSec: data.length / sr,
    noiseFloorDb,
    speechLevelDb,
    snrDb,
    noise: snrDb > 45 ? "LOW" : snrDb > 28 ? "MEDIUM" : "HIGH",
    dynamicRangeDb,
    dynamics: lvl3(dynamicRangeDb, 8, 15),
    sibilanceDb,
    sibilance: lvl3(sibilanceDb, -24, -16),
    pitchStability,
    voicedRatio: track.length ? voiced.length / track.length : 0,
    medianPitchMidi: midis.length ? pct(midis, 0.5) : 0,
    clippingPercent: (clipped / Math.max(1, data.length)) * 100,
    peakDb: 20 * Math.log10(peak + 1e-12),
    lufs: integratedLoudness([data], sr),
    lowEndDb: rel(low),
    mudDb: rel(mud),
    presenceDb: rel(pres),
    detectedKey: det && det.confidence > 0.5 ? det.key : null,
  };
}

export interface VoiceRecommendation {
  clean: "off" | "low" | "medium" | "high";
  gateThresholdDb: number | null;
  highPassHz: number;
  mudCutDb: number;
  presenceBoostDb: number;
  deEsserThresholdDb: number | null;
  compression: Level3;
  compressor: { thresholdDb: number; ratio: number; attackMs: number; releaseMs: number; makeupDb: number };
  autoLevel: "off" | "light" | "normal" | "strong";
  pitchCorrection: number;
  limiterCeilingDb: number;
  inputGainDb: number;
  eqLabel: string;
  notes: string[];
}

/** Turn an analysis into a vocal chain proposal. Conservative: never extreme settings. */
export function recommendChain(a: VoiceAnalysis): VoiceRecommendation {
  const notes: string[] = [];
  const clean = a.noise === "HIGH" ? (a.snrDb < 20 ? "high" : "medium") : a.noise === "MEDIUM" ? "low" : "off";
  if (clean !== "off") notes.push(`Bruit de fond détecté (rapport signal/bruit ${a.snrDb.toFixed(0)} dB) → nettoyage ${clean}.`);
  const gateThresholdDb = a.snrDb > 18 ? Math.round(a.noiseFloorDb + Math.min(10, a.snrDb / 3)) : null;
  const highPassHz = a.lowEndDb > -18 ? 110 : 80;
  if (a.lowEndDb > -18) notes.push("Beaucoup de graves (effet de proximité ou grondement) → coupe-bas à 110 Hz.");
  const mudCutDb = a.mudDb > -6 ? -4 : a.mudDb > -9 ? -2 : 0;
  if (mudCutDb) notes.push("Bas-médiums chargés (200–500 Hz) → légère coupe.");
  const presenceBoostDb = a.presenceDb < -20 ? 3 : a.presenceDb < -15 ? 1.5 : 0;
  if (presenceBoostDb) notes.push("Voix un peu sourde → présence +" + presenceBoostDb + " dB vers 3 kHz.");
  const deEsserThresholdDb = a.sibilance !== "LOW" ? Math.round(a.speechLevelDb - (a.sibilance === "HIGH" ? 12 : 8)) : null;
  if (deEsserThresholdDb !== null) notes.push(`Sibilances ${a.sibilance === "HIGH" ? "fortes" : "modérées"} → de-esser.`);
  const compression: Level3 = a.dynamics;
  const ratio = compression === "HIGH" ? 4 : compression === "MEDIUM" ? 3 : 2;
  const thresholdDb = Math.round(a.speechLevelDb - (compression === "HIGH" ? 14 : compression === "MEDIUM" ? 10 : 6));
  const autoLevel = a.dynamicRangeDb > 18 ? "strong" : a.dynamicRangeDb > 12 ? "normal" : a.dynamicRangeDb > 7 ? "light" : "off";
  const melodic = a.voicedRatio > 0.45;
  let pitchCorrection = melodic ? Math.round(Math.min(70, Math.max(20, (100 - a.pitchStability) * 0.9))) : 15;
  if (a.voicedRatio < 0.2) pitchCorrection = 0;
  notes.push(melodic ? `Voix chantée, stabilité ${a.pitchStability.toFixed(0)} % → correction ${pitchCorrection} %.` : "Voix surtout parlée/rappée → correction de pitch légère.");
  if (a.clippingPercent > 0.01) notes.push(`Saturation à l'enregistrement (${a.clippingPercent.toFixed(2)} % d'échantillons) : baissez le gain du micro, le traitement ne peut pas réparer complètement.`);
  const inputGainDb = Math.max(-12, Math.min(12, Math.round(-18 - a.lufs)));
  return {
    clean,
    gateThresholdDb,
    highPassHz,
    mudCutDb,
    presenceBoostDb,
    deEsserThresholdDb,
    compression,
    compressor: { thresholdDb, ratio, attackMs: compression === "HIGH" ? 5 : 10, releaseMs: 120, makeupDb: Math.round((Math.abs(Math.min(0, thresholdDb - a.speechLevelDb)) * (1 - 1 / ratio)) / 2) },
    autoLevel,
    pitchCorrection,
    limiterCeilingDb: -1,
    inputGainDb: Number.isFinite(inputGainDb) ? inputGainDb : 0,
    eqLabel: presenceBoostDb ? "Vocal Presence" : mudCutDb ? "Clarity (anti-mud)" : "Gentle Clean",
    notes,
  };
}
