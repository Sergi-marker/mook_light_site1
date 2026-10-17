// VOCAL HARMONIES & DOUBLES from one take (offline DSP, same TD-PSOLA engine as AUTO PITCH).
//  • Harmony: each sung note is moved by a number of SCALE DEGREES (a diatonic third, fifth or a
//    sixth below), so the harmony always stays in the key — and lands exactly on the scale note.
//  • Double: the same performance, very slightly detuned (slow drift of a few cents), delayed by
//    ~20 ms and a little darker — the classic "doubled vocal" thickness, without re-recording.

import { degreeToMidi, SCALES, type Key } from "../music.ts";
import { psolaRender } from "./autopitch.ts";
import { freqToMidi, pitchTrack } from "./yin.ts";

export type HarmonyKind = "third-up" | "fifth-up" | "sixth-down" | "octave-up" | "octave-down";

export const HARMONY_STEPS: Record<HarmonyKind, { steps: number; label: string }> = {
  "third-up": { steps: 2, label: "Tierce au-dessus" },
  "fifth-up": { steps: 4, label: "Quinte au-dessus" },
  "sixth-down": { steps: -2, label: "Tierce en dessous (sixte)" },
  "octave-up": { steps: 7, label: "Octave au-dessus" },
  "octave-down": { steps: -7, label: "Octave en dessous" },
};

/** Pitch of scale degree `d` (0 = the tonic of MIDI octave −1, n = one octave higher…). */
const degreePitch = (d: number, key: Key) => degreeToMidi(d, key, key.root);

/** Scale degree closest to a MIDI pitch (ties → the lower degree). */
function degreeOf(midi: number, key: Key): number {
  const n = SCALES[key.scale].intervals.length;
  const around = Math.floor((midi - key.root) / 12) * n;
  let best = around, bd = Infinity;
  for (let d = around - n; d <= around + 2 * n; d++) {
    const dist = Math.abs(degreePitch(d, key) - midi);
    if (dist < bd) { bd = dist; best = d; }
  }
  return best;
}

/** Target pitch (MIDI) of the harmony for a sung pitch: `steps` scale degrees away, in the key. */
export function harmonyTarget(midi: number, key: Key, steps: number): number {
  return degreePitch(degreeOf(midi, key) + steps, key);
}

const HOP = 256, WIN = 2048;

function analyse(data: Float32Array, sr: number) {
  const track = pitchTrack(data, sr, HOP, WIN);
  const frameF0 = (i: number): number => {
    const r = track[Math.max(0, Math.min(track.length - 1, Math.floor((i - WIN / 2) / HOP)))];
    return r && r.confidence > 0.55 ? r.freq : 0;
  };
  return { track, frameF0, frameAt: (i: number) => Math.max(0, Math.min(track.length - 1, Math.floor((i - WIN / 2) / HOP))) };
}

/** A harmony voice from a take: in key, slightly smoothed transitions (≈ 40 ms glide). */
export function harmonyVoice(data: Float32Array, sr: number, key: Key, kind: HarmonyKind, formant = 0): Float32Array {
  const { track, frameF0, frameAt } = analyse(data, sr);
  const steps = HARMONY_STEPS[kind].steps;
  const shifts: number[] = [];
  let s = 0;
  const a = 1 - Math.exp(-(HOP / sr) / 0.04);
  for (const r of track) {
    if (r.freq > 0 && r.confidence > 0.55) {
      const m = freqToMidi(r.freq);
      const desired = harmonyTarget(m, key, steps) - m;
      // Jump straight to a new note interval when it changes a lot, glide otherwise.
      s = Math.abs(desired - s) > 2.5 ? desired : s + (desired - s) * a;
    }
    shifts.push(s);
  }
  // Octaves keep the timbre natural with a small formant compensation.
  const f = formant || (kind === "octave-up" ? -2 : kind === "octave-down" ? 2 : 0);
  return psolaRender(data, sr, frameF0, (i) => shifts[frameAt(i)] ?? 0, f);
}

/** A "double": same take, slow ±`cents` drift, delayed `delayMs`, gently low-passed. */
export function doubleVoice(data: Float32Array, sr: number, opts: { cents?: number; delayMs?: number; seed?: number } = {}): Float32Array {
  const cents = opts.cents ?? 9, delay = Math.round(((opts.delayMs ?? 22) / 1000) * sr);
  const { frameF0 } = analyse(data, sr);
  const ph = ((opts.seed ?? 1) * 2.399) % (2 * Math.PI);
  // Two slow sines: not periodic-sounding, never more than ±cents.
  const shiftAt = (i: number) => ((Math.sin((2 * Math.PI * 0.21 * i) / sr + ph) * 0.65 + Math.sin((2 * Math.PI * 0.53 * i) / sr + 2 * ph) * 0.35) * cents) / 100;
  const shifted = psolaRender(data, sr, frameF0, shiftAt, 0);
  const out = new Float32Array(data.length);
  // Delay + one-pole low-pass (~6 kHz): a double sits behind the lead.
  const k = 1 - Math.exp((-2 * Math.PI * 6000) / sr);
  let y = 0;
  for (let i = 0; i < out.length; i++) {
    const x = i - delay >= 0 ? shifted[i - delay] : 0;
    y += k * (x - y);
    out[i] = y;
  }
  return out;
}
