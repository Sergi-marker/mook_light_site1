import { test } from "node:test";
import assert from "node:assert/strict";
import { chopPoints, chopRegions, estimateKey, estimateTempo, flipPattern, keyShift, stretchAndShift, timeStretch } from "../../src/core/dsp/sampleFlip.ts";
import { freqToMidi, pitchTrack } from "../../src/core/dsp/yin.ts";

const SR = 44100;
let s = 7;
const noise = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;

/** Two-bar loop: kick / snare / hats + a sustained A minor chord (A3 C4 E4). */
function loop(bpm: number) {
  const step = (60 / bpm / 4) * SR;
  const x = new Float32Array(Math.round(32 * step));
  const hit = (at: number, kind: "kick" | "snare" | "hat") => {
    const a = Math.round(at * step);
    for (let i = 0; i < SR * 0.25 && a + i < x.length; i++) {
      const t = i / SR;
      x[a + i] += kind === "kick" ? Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-t / 0.03)) * t) * Math.exp(-t / 0.12) * 0.9
        : kind === "snare" ? noise() * Math.exp(-t / 0.06) * 0.6
        : noise() * Math.exp(-t / 0.015) * 0.25;
    }
  };
  for (let b = 0; b < 2; b++) {
    for (const k of [0, 10]) hit(b * 16 + k, "kick");
    for (const k of [4, 12]) hit(b * 16 + k, "snare");
    for (let h = 0; h < 16; h += 2) hit(b * 16 + h, "hat");
  }
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    for (const m of [57, 60, 64]) x[i] += 0.08 * Math.sin(2 * Math.PI * 440 * 2 ** ((m - 69) / 12) * t);
  }
  return x;
}
const medianMidi = (d: Float32Array) => {
  const tr = pitchTrack(d, SR).filter((r) => r.freq > 0 && r.confidence > 0.85).map((r) => freqToMidi(r.freq)).sort((a, b) => a - b);
  return tr[tr.length >> 1];
};

test("loop analysis: tempo (and bar count) and key", () => {
  for (const bpm of [86, 92, 140]) {
    const t = estimateTempo(loop(bpm), SR);
    assert.ok(Math.abs(t.bpm - bpm) < 1, `${bpm} → ${t.bpm}`);
    assert.equal(t.bars, 2);
  }
  const k = estimateKey(loop(92), SR)!;
  assert.deepEqual(k.key, { root: 9, scale: "minor" });
  assert.equal(keyShift(k.key, { root: 5, scale: "minor" }), -4, "A minor → F minor");
  assert.equal(keyShift({ root: 0, scale: "major" }, { root: 9, scale: "minor" }), 0, "relative keys");
  assert.equal(keyShift({ root: 0, scale: "minor" }, { root: 11, scale: "minor" }), -1);
});

test("WSOLA stretch keeps the pitch; stretch + shift changes pitch, not timing", () => {
  const tone = Float32Array.from({ length: SR }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR));
  const slow = timeStretch(tone, SR, 1.5);
  assert.ok(Math.abs(slow.length - 1.5 * SR) < 2);
  assert.ok(Math.abs(medianMidi(slow) - 69) < 0.1, `pitch ${medianMidi(slow)}`);
  const fast = timeStretch(tone, SR, 0.7);
  assert.ok(Math.abs(medianMidi(fast) - 69) < 0.1);
  let peak = 0; for (const v of slow.subarray(SR * 0.1, SR * 1.4)) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak > 0.4 && peak < 0.6, `no level jumps (${peak})`);
  const up = stretchAndShift(tone, SR, 1.2, 3);
  assert.ok(Math.abs(up.length - 1.2 * SR) < SR * 0.01, `length ${up.length}`);
  assert.ok(Math.abs(medianMidi(up) - 72) < 0.15, `pitch ${medianMidi(up)}`);
});

test("chops land on the hits; flip and original patterns", () => {
  const bpm = 92, x = loop(bpm), step = (60 / bpm / 4) * SR;
  const pts = chopPoints(x, SR, bpm, 8);
  assert.equal(pts[0], 0);
  assert.ok(pts.length >= 4 && pts.length <= 8);
  for (const p of pts.slice(1)) {
    const off = (p / step) % 2; // hits are on even 16ths
    assert.ok(Math.min(off, 2 - off) < 0.15, `chop at ${(p / step).toFixed(2)} steps is not on a hit`);
  }
  const regions = chopRegions(pts, x.length);
  assert.equal(regions[regions.length - 1].end, 1);
  assert.ok(regions.every((r) => r.end > r.start));
  const chopSteps = pts.map((p) => Math.round(p / step));
  const orig = flipPattern(chopSteps, 64, "original");
  assert.deepEqual(orig.filter((e) => e.step < 32).map((e) => e.step), chopSteps);
  const flip = flipPattern(chopSteps, 64, "flip", 3);
  assert.ok(flip.every((e) => e.chop >= 0 && e.chop < pts.length && e.step < 64));
  for (let bar = 0; bar < 4; bar += 2) assert.ok(flip.some((e) => e.step === bar * 16 && e.chop === 0), "chop 1 on the downbeat");
  assert.notDeepEqual(flip, flipPattern(chopSteps, 64, "flip", 4), "another seed, another flip");
  assert.deepEqual(flip, flipPattern(chopSteps, 64, "flip", 3), "deterministic");
});

test("chop lanes: added in every pattern, untouched by kits / beat generation, removable; conversation + tool", async () => {
  const { createDefaultProject, DEFAULT_SAMPLE_EDIT } = await import("../../src/core/project.ts");
  const { reduce } = await import("../../src/core/reducer.ts");
  const { generateSong } = await import("../../src/core/ai/beat.ts");
  const { parseBeatPrompt } = await import("../../src/core/ai/prompt.ts");
  const { converse } = await import("../../src/core/ai/dialog.ts");
  const { runProducerTool } = await import("../../src/core/ai/producerTools.ts");
  const { parseProject, serializeProject } = await import("../../src/core/projectFile.ts");
  let p = createDefaultProject();
  assert.equal(converse(p, "je veux flipper un sample", {}).reply.flip, "import");
  assert.ok(runProducerTool(p, "flip_sample", { mode: "flip" }).isError, "no chops yet");
  p = reduce(p, { type: "addSample", sample: { id: "smp_loop", name: "loop", mime: "audio/wav" } });
  for (let i = 0; i < 3; i++) {
    p = reduce(p, { type: "addDrumTrack", track: { id: `trk_c${i}`, name: `Chop ${i + 1}`, instrument: "perc", sampleId: "smp_loop", pitch: 0, chokeGroup: 7, chop: true, sampleEdit: { ...DEFAULT_SAMPLE_EDIT, start: i / 3, end: (i + 1) / 3 } } });
  }
  assert.equal(p.tracks.filter((t) => t.chop).length, 3);
  assert.ok(p.patterns.every((pat) => pat.drums.trk_c1?.length === pat.stepCount));
  assert.ok(p.channels.some((c) => c.id === "trk_c1"));
  p = reduce(p, { type: "applyDrumKit", kitId: "boombap" });
  assert.equal(p.tracks.find((t) => t.id === "trk_c0")!.builtinSample, undefined, "kits leave chops alone");
  const song = reduce(p, { type: "patchProject", patch: generateSong(p, parseBeatPrompt("phonk", "phonk", p.key.root), 1).patch });
  const c0 = song.tracks.find((t) => t.id === "trk_c0")!;
  assert.ok(c0.chop && c0.pitch === 0 && c0.sampleId === "smp_loop", "beat generation keeps the chops");
  // Saved and reloaded.
  const back = parseProject(serializeProject(p, { samples: new Map([["smp_loop", new Uint8Array([1, 2, 3])]]), audio: new Map() })).project;
  assert.deepEqual(back.tracks.filter((t) => t.chop).map((t) => [t.id, t.sampleEdit?.start]), [["trk_c0", 0], ["trk_c1", 1 / 3], ["trk_c2", 2 / 3]]);
  // Conversation and tool.
  assert.equal(converse(p, "nouveau flip", {}).reply.flip, "flip");
  assert.equal(converse(p, "remets les chops dans l'ordre d'origine", {}).reply.flip, "original");
  assert.equal(converse(p, "flippe un autre sample", {}).reply.flip, "import");
  assert.equal(runProducerTool(p, "flip_sample", { mode: "original" }).flip, "original");
  // Default lanes can't be removed, chops can.
  const kick = p.tracks.find((t) => t.instrument === "kick")!;
  assert.equal(reduce(p, { type: "removeDrumTrack", trackId: kick.id }), p);
  const removed = reduce(p, { type: "removeDrumTrack", trackId: "trk_c1" });
  assert.ok(!removed.tracks.some((t) => t.id === "trk_c1") && !removed.channels.some((c) => c.id === "trk_c1") && removed.patterns.every((pat) => !("trk_c1" in pat.drums)));
});
