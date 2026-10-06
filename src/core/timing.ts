import { STEPS_PER_BEAT, SWING_MAX } from "./constants.ts";

/** Duration of one 16th-note step in seconds. */
export function stepDuration(bpm: number): number {
  return 60 / bpm / STEPS_PER_BEAT;
}

/**
 * Swing delay applied to off-beat 16ths (odd step indexes).
 * swing 0 % = straight, 100 % = delayed by half a step (heavy shuffle).
 * ~33 % ≈ triplet feel.
 */
export function swingOffset(step: number, bpm: number, swing: number): number {
  if (step % 2 === 0 || swing <= 0) return 0;
  return (Math.min(swing, SWING_MAX) / SWING_MAX) * 0.5 * stepDuration(bpm);
}

/** Pattern length in seconds. */
export function patternDuration(bpm: number, stepCount: number): number {
  return stepDuration(bpm) * stepCount;
}

/** Semitones → playback-rate ratio. */
export function semitonesToRate(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/** MIDI-style velocity (1–127) → linear gain with a gentle curve. */
export function velocityToGain(velocity: number): number {
  const v = Math.min(127, Math.max(0, velocity)) / 127;
  return v * v * 0.6 + v * 0.4;
}

/** Equal-power-ish volume: fader value 0–1.5 is used directly as linear gain. */
export function gainToDb(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}
