import { test } from "node:test";
import assert from "node:assert/strict";
import { reduce } from "../../src/core/reducer.ts";
import { createDefaultProject, isTrackAudible } from "../../src/core/project.ts";
import { BPM_MAX, BPM_MIN } from "../../src/core/constants.ts";

const fresh = () => createDefaultProject("Test", false);

test("BPM is clamped to 40–220", () => {
  const p = fresh();
  assert.equal(reduce(p, { type: "setBpm", bpm: 10 }).bpm, BPM_MIN);
  assert.equal(reduce(p, { type: "setBpm", bpm: 999 }).bpm, BPM_MAX);
  assert.equal(reduce(p, { type: "setBpm", bpm: 92.5 }).bpm, 92.5);
  assert.equal(reduce(p, { type: "setBpm", bpm: Number.NaN }).bpm, BPM_MIN);
});

test("no-op actions return the same object", () => {
  const p = fresh();
  assert.equal(reduce(p, { type: "setBpm", bpm: p.bpm }), p);
  assert.equal(reduce(p, { type: "clearPattern" }), p);
  assert.equal(reduce(p, { type: "toggleStep", trackId: "nope", step: 0 }), p);
  assert.equal(reduce(p, { type: "toggleStep", trackId: p.tracks[0].id, step: 99 }), p);
  assert.equal(reduce(p, { type: "updateTrack", trackId: p.tracks[0].id, patch: { pan: 0 } }), p);
});

test("toggleStep only touches the targeted step", () => {
  const p = fresh();
  const id = p.tracks[1].id;
  const n = reduce(p, { type: "toggleStep", trackId: id, step: 4 });
  assert.equal(n.tracks[1].steps[4].on, true);
  assert.equal(n.tracks[1].steps.filter((s) => s.on).length, 1);
  assert.equal(n.tracks[0], p.tracks[0], "other tracks keep identity");
  assert.equal(p.tracks[1].steps[4].on, false, "original is not mutated");
  assert.equal(reduce(n, { type: "toggleStep", trackId: id, step: 4 }).tracks[1].steps[4].on, false);
});

test("velocity is clamped to 1–127", () => {
  const p = fresh();
  const id = p.tracks[0].id;
  assert.equal(reduce(p, { type: "setStepVelocity", trackId: id, step: 0, velocity: 500 }).tracks[0].steps[0].velocity, 127);
  assert.equal(reduce(p, { type: "setStepVelocity", trackId: id, step: 0, velocity: -3 }).tracks[0].steps[0].velocity, 1);
});

test("step count resize keeps existing steps", () => {
  let p = fresh();
  const id = p.tracks[0].id;
  p = reduce(p, { type: "toggleStep", trackId: id, step: 3 });
  const big = reduce(p, { type: "setStepCount", stepCount: 64 });
  assert.equal(big.stepCount, 64);
  assert.ok(big.tracks.every((t) => t.steps.length === 64));
  assert.equal(big.tracks[0].steps[3].on, true);
  const small = reduce(big, { type: "setStepCount", stepCount: 16 });
  assert.ok(small.tracks.every((t) => t.steps.length === 16));
  assert.equal(small.tracks[0].steps[3].on, true);
});

test("duplicatePattern doubles length and copies content", () => {
  let p = fresh();
  p = reduce(p, { type: "toggleStep", trackId: p.tracks[0].id, step: 2 });
  const d = reduce(p, { type: "duplicatePattern" });
  assert.equal(d.stepCount, 32);
  assert.equal(d.tracks[0].steps[2].on, true);
  assert.equal(d.tracks[0].steps[18].on, true);
  const d64 = reduce(d, { type: "duplicatePattern" });
  assert.equal(d64.stepCount, 64);
  assert.equal(reduce(d64, { type: "duplicatePattern" }), d64, "64 is the max");
});

test("mute and solo logic", () => {
  let p = fresh();
  const [a, b] = p.tracks;
  assert.ok(isTrackAudible(a, p.tracks));
  p = reduce(p, { type: "toggleSolo", trackId: b.id });
  assert.equal(isTrackAudible(p.tracks[0], p.tracks), false, "non-solo track silent when another is soloed");
  assert.equal(isTrackAudible(p.tracks[1], p.tracks), true);
  p = reduce(p, { type: "toggleMute", trackId: b.id });
  assert.equal(isTrackAudible(p.tracks[1], p.tracks), false, "mute wins over solo");
});

test("track params are clamped", () => {
  const p = fresh();
  const id = p.tracks[0].id;
  const t = reduce(p, { type: "updateTrack", trackId: id, patch: { volume: 9, pan: -4, pitch: 30.4 } }).tracks[0];
  assert.equal(t.volume, 1.5);
  assert.equal(t.pan, -1);
  assert.equal(t.pitch, 24);
});

test("samples: assign requires a known sample, remove reverts tracks to built-in", () => {
  let p = fresh();
  const id = p.tracks[0].id;
  assert.equal(reduce(p, { type: "assignSample", trackId: id, sampleId: "smp_x" }), p);
  p = reduce(p, { type: "addSample", sample: { id: "smp_x", name: "kick.wav", mime: "audio/wav" } });
  p = reduce(p, { type: "assignSample", trackId: id, sampleId: "smp_x" });
  assert.equal(p.tracks[0].sampleId, "smp_x");
  p = reduce(p, { type: "removeSample", sampleId: "smp_x" });
  assert.equal(p.tracks[0].sampleId, null);
  assert.equal(p.samples.length, 0);
});

test("default project has the 7 required instruments", () => {
  const p = createDefaultProject();
  assert.deepEqual(
    p.tracks.map((t) => t.instrument),
    ["kick", "snare", "clap", "closedHat", "openHat", "perc", "808"],
  );
  assert.ok(p.tracks.some((t) => t.steps.some((s) => s.on)), "starter pattern present");
});
