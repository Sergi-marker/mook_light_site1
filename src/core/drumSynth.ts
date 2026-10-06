import type { InstrumentKind } from "./types.ts";

type F32 = Float32Array<ArrayBuffer>;

// Built-in drum kit, synthesised in pure TypeScript (no Web Audio needed), so the app
// makes sound out of the box without shipping sample files, and so the DSP is unit-testable.
// Output: mono Float32Array, peak-normalised to TARGET_PEAK.

const TARGET_PEAK = 0.9;

/** MIDI note the built-in 808 is tuned to (C2). Track pitch shifts from here. */
export const BUILTIN_808_ROOT_MIDI = 36;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type BiquadKind = "lowpass" | "highpass" | "bandpass";

/** RBJ cookbook biquad, processed in place. */
function biquad(buf: F32, sr: number, kind: BiquadKind, freq: number, q: number): void {
  const w0 = (2 * Math.PI * freq) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (kind === "lowpass") {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (kind === "highpass") {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    buf[i] = y;
  }
}

function normalise(buf: F32, sr: number): F32 {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak > 0) {
    const g = TARGET_PEAK / peak;
    for (let i = 0; i < buf.length; i++) buf[i] *= g;
  }
  // 3 ms fade-out so the sample never ends on a click.
  const fade = Math.min(buf.length, Math.round(sr * 0.003));
  for (let i = 0; i < fade; i++) buf[buf.length - 1 - i] *= i / fade;
  return buf;
}

function noise(len: number, seed: number): F32 {
  const rnd = mulberry32(seed);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = rnd() * 2 - 1;
  return out;
}

function kick(sr: number): F32 {
  const len = Math.floor(sr * 0.5);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const freq = 48 + 110 * Math.exp(-t * 28);
    phase += (2 * Math.PI * freq) / sr;
    const amp = Math.exp(-t * 7.5);
    const click = i < sr * 0.004 ? (1 - i / (sr * 0.004)) * 0.35 : 0;
    out[i] = Math.tanh(1.6 * Math.sin(phase) * amp) + click * Math.sin(phase * 7);
  }
  return normalise(out, sr);
}

function snare(sr: number): F32 {
  const len = Math.floor(sr * 0.3);
  const n = noise(len, 11);
  biquad(n, sr, "highpass", 1200, 0.7);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    phase += (2 * Math.PI * (185 + 40 * Math.exp(-t * 40))) / sr;
    out[i] = n[i] * Math.exp(-t * 16) * 0.8 + Math.sin(phase) * Math.exp(-t * 28) * 0.7;
  }
  return normalise(out, sr);
}

function clap(sr: number): F32 {
  const len = Math.floor(sr * 0.35);
  const out = noise(len, 23);
  biquad(out, sr, "bandpass", 1300, 1.2);
  const bursts = [0, 0.011, 0.022, 0.033];
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let env = 0;
    for (const b of bursts.slice(0, 3)) if (t >= b) env = Math.max(env, Math.exp(-(t - b) * 180));
    if (t >= bursts[3]) env = Math.max(env, 0.85 * Math.exp(-(t - bursts[3]) * 14));
    out[i] *= env;
  }
  return normalise(out, sr);
}

function hat(sr: number, decay: number, seed: number): F32 {
  const len = Math.floor(sr * (decay * 6 + 0.02));
  const n = noise(len, seed);
  // A few inharmonic square partials give the metallic 808-style character.
  const partials = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let metal = 0;
    for (const f of partials) metal += Math.sign(Math.sin(2 * Math.PI * f * 2.2 * t));
    n[i] = n[i] * 0.6 + (metal / partials.length) * 0.5;
  }
  biquad(n, sr, "highpass", 7000, 0.8);
  for (let i = 0; i < len; i++) n[i] *= Math.exp(-(i / sr) / decay);
  return normalise(n, sr);
}

function perc(sr: number): F32 {
  const len = Math.floor(sr * 0.18);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    phase += (2 * Math.PI * (820 + 300 * Math.exp(-t * 60))) / sr;
    const tri = (2 / Math.PI) * Math.asin(Math.sin(phase));
    out[i] = tri * Math.exp(-t * 32);
  }
  return normalise(out, sr);
}

function bass808(sr: number): F32 {
  const len = Math.floor(sr * 1.6);
  const out = new Float32Array(len);
  const root = 440 * Math.pow(2, (BUILTIN_808_ROOT_MIDI - 69) / 12);
  let phase = 0;
  const attack = sr * 0.003;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    // Small downward pitch drop at the start gives the 808 its "punch".
    const freq = root * (1 + 0.6 * Math.exp(-t * 45));
    phase += (2 * Math.PI * freq) / sr;
    const env = (i < attack ? i / attack : 1) * Math.exp(-t * 1.6);
    // Soft saturation adds harmonics so the 808 is audible on small speakers.
    out[i] = Math.tanh(2.2 * Math.sin(phase)) * env;
  }
  return normalise(out, sr);
}

export function synthesizeDrum(kind: InstrumentKind, sampleRate: number): F32 {
  switch (kind) {
    case "kick":
      return kick(sampleRate);
    case "snare":
      return snare(sampleRate);
    case "clap":
      return clap(sampleRate);
    case "closedHat":
      return hat(sampleRate, 0.018, 37);
    case "openHat":
      return hat(sampleRate, 0.09, 41);
    case "perc":
      return perc(sampleRate);
    case "808":
      return bass808(sampleRate);
  }
}
