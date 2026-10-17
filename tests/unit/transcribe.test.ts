import { test } from "node:test";
import assert from "node:assert/strict";
import { beatboxToHits, gridOffset, humToNotes } from "../../src/core/dsp/transcribe.ts";

const SR = 44100;
let seed = 5;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1; };
const BPM = 100, STEP = 60 / BPM / 4, COUNT_IN = 4 * 4 * STEP, LATENCY = 0.06;

/** A hummed melody: notes (midi, start step, length steps), slightly off-pitch, sung LATENCY late. */
function hum(notes: [number, number, number][]): Float32Array {
  const out = new Float32Array(Math.round((COUNT_IN + 16 * STEP + 0.5) * SR));
  for (const [m, s, l] of notes) {
    const f = 440 * 2 ** ((m + 0.3 - 69) / 12); // 30 cents sharp: a real hum is never exact
    const a = Math.round((COUNT_IN + s * STEP + LATENCY) * SR), n = Math.round(l * STEP * SR * 0.85);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / (SR * 0.02), (n - i) / (SR * 0.03));
      let x = 0;
      for (let h = 1; h <= 4; h++) x += Math.sin((2 * Math.PI * f * h * i) / SR) / h;
      out[a + i] += 0.3 * env * x + 0.002 * rnd();
    }
  }
  return out;
}

test("grid offset: a constant latency is measured from the onsets", () => {
  assert.ok(Math.abs(gridOffset([0.06, 0.21, 0.66, 1.26].map((t) => t), 0.15) - 0.06) < 1e-9);
});

test("hum → melody: right notes, on the grid despite latency, snapped to the key", () => {
  const sung: [number, number, number][] = [[60, 0, 4], [63, 4, 2], [65, 6, 2], [67, 8, 4], [65, 12, 4]];
  const notes = humToNotes(hum(sung), SR, { bpm: BPM, key: { root: 0, scale: "minor" }, countIn: COUNT_IN, steps: 16 });
  assert.deepEqual(notes.map((n) => [n.pitch, n.start]), sung.map(([m, s]) => [m, s]), JSON.stringify(notes));
  for (const [i, n] of notes.entries()) assert.ok(Math.abs(n.length - sung[i][2]) <= 1, `length ${n.length} vs ${sung[i][2]}`);
});

/** Beatbox sounds: « boum » (low sweep), « pff / k » snare (mid noise + body), « ts » (bright noise). */
function beatbox(hits: [string, number][]): Float32Array {
  const out = new Float32Array(Math.round((COUNT_IN + 16 * STEP + 0.5) * SR));
  for (const [kind, s] of hits) {
    const a = Math.round((COUNT_IN + s * STEP + LATENCY) * SR);
    let lp = 0, prev = 0;
    for (let i = 0; i < SR * 0.12; i++) {
      const env = Math.exp(-i / (SR * (kind === "k" ? 0.05 : kind === "s" ? 0.04 : 0.015)));
      let x: number;
      if (kind === "k") x = Math.sin(2 * Math.PI * (60 + 100 * Math.exp(-i / (SR * 0.02))) * (i / SR)) * 0.8;
      else if (kind === "s") { const w = rnd(); lp += 0.3 * (w - lp); x = lp * 1.6 + 0.35 * Math.sin((2 * Math.PI * 190 * i) / SR); } // mid noise (~2–3 kHz) + body
      else { const w = rnd(); x = (w - prev) * 0.5; prev = w; } // bright noise
      out[a + i] += env * x * 0.6;
    }
  }
  return out;
}

test("beatbox → drums: kick / snare / hi-hat recognised and placed on the grid", () => {
  const pattern: [string, number][] = [["k", 0], ["h", 2], ["s", 4], ["h", 6], ["k", 8], ["k", 10], ["s", 12], ["h", 14]];
  const hits = beatboxToHits(beatbox(pattern), SR, { bpm: BPM, countIn: COUNT_IN, steps: 16 });
  const map: Record<string, string> = { k: "kick", s: "snare", h: "closedHat" };
  assert.deepEqual(hits.map((h) => [h.step, h.kind]), pattern.map(([k, s]) => [s, map[k]]), JSON.stringify(hits));
});

test("hum → melody: a first note sung a little early (during the count-in) is kept on beat 1", () => {
  const out = hum([[64, 4, 4]]);
  // Add an E that starts 0.3 s before the end of the count-in and lasts until step 3.
  const f = 440 * 2 ** ((60 - 69) / 12), a = Math.round((COUNT_IN - 0.3) * SR), n = Math.round((0.3 + 3 * STEP) * SR);
  for (let i = 0; i < n; i++) out[a + i] += 0.3 * Math.min(1, i / (SR * 0.02), (n - i) / (SR * 0.03)) * Math.sin((2 * Math.PI * f * i) / SR);
  const notes = humToNotes(out, SR, { bpm: BPM, key: { root: 0, scale: "minor" }, countIn: COUNT_IN, steps: 16 });
  assert.deepEqual(notes.map((x) => [x.pitch, x.start]), [[60, 0], [63, 4]], JSON.stringify(notes));
});
