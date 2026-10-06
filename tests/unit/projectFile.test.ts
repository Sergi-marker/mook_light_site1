import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base64ToBytes,
  bytesToBase64,
  parseProject,
  ProjectFileError,
  safeFileName,
  serializeProject,
} from "../../src/core/projectFile.ts";
import { createDefaultProject } from "../../src/core/project.ts";
import { reduce } from "../../src/core/reducer.ts";

test("save → load round-trip preserves the project and sample bytes", () => {
  let p = createDefaultProject("Round Trip");
  p = reduce(p, { type: "setBpm", bpm: 87 });
  p = reduce(p, { type: "setSwing", swing: 35 });
  p = reduce(p, { type: "setStepCount", stepCount: 32 });
  p = reduce(p, { type: "toggleStep", trackId: p.tracks[2].id, step: 31 });
  p = reduce(p, { type: "setStepVelocity", trackId: p.tracks[2].id, step: 31, velocity: 42 });
  p = reduce(p, { type: "updateTrack", trackId: p.tracks[6].id, patch: { pitch: -5, pan: 0.3, volume: 1.2 } });
  p = reduce(p, { type: "toggleMute", trackId: p.tracks[5].id });
  p = reduce(p, { type: "addSample", sample: { id: "smp_1", name: "kick.wav", mime: "audio/wav" } });
  p = reduce(p, { type: "assignSample", trackId: p.tracks[0].id, sampleId: "smp_1" });
  const bytes = new Uint8Array(100_000).map((_, i) => (i * 7) & 0xff);

  const text = serializeProject(p, new Map([["smp_1", bytes]]));
  const { project, sampleBytes, warnings } = parseProject(text);

  assert.deepEqual(project, p);
  assert.deepEqual(sampleBytes.get("smp_1"), bytes);
  assert.deepEqual(warnings, []);
});

test("base64 helpers handle all byte values", () => {
  const all = new Uint8Array(256).map((_, i) => i);
  assert.deepEqual(base64ToBytes(bytesToBase64(all)), all);
});

test("rejects non-project files with a clear error", () => {
  assert.throws(() => parseProject("not json"), ProjectFileError);
  assert.throws(() => parseProject("{}"), /not a Beatmaker Studio project/);
  assert.throws(
    () => parseProject(JSON.stringify({ format: "beatmaker-studio-project", version: 99, project: {} })),
    /newer version/,
  );
});

test("repairs out-of-range and missing values", () => {
  const text = JSON.stringify({
    format: "beatmaker-studio-project",
    version: 1,
    project: {
      bpm: 900,
      swing: -10,
      stepCount: 17,
      tracks: [
        { instrument: "kick", volume: 5, steps: [{ on: true, velocity: 999 }] },
        { instrument: "theremin" },
        { instrument: "snare", sampleId: "missing" },
      ],
    },
  });
  const { project, warnings } = parseProject(text);
  assert.equal(project.bpm, 220);
  assert.equal(project.swing, 0);
  assert.equal(project.stepCount, 16);
  assert.equal(project.tracks.length, 2);
  assert.equal(project.tracks[0].volume, 1.5);
  assert.equal(project.tracks[0].steps.length, 16);
  assert.equal(project.tracks[0].steps[0].velocity, 127);
  assert.equal(project.tracks[1].sampleId, null);
  assert.equal(warnings.length, 2);
});

test("a sample without data is dropped with a warning", () => {
  let p = createDefaultProject("x", false);
  p = reduce(p, { type: "addSample", sample: { id: "s", name: "lost.wav", mime: "audio/wav" } });
  p = reduce(p, { type: "assignSample", trackId: p.tracks[0].id, sampleId: "s" });
  const { project, warnings } = parseProject(serializeProject(p, new Map()));
  assert.equal(project.samples.length, 0);
  assert.equal(project.tracks[0].sampleId, null);
  assert.equal(warnings.length, 2);
});

test("safe file names", () => {
  assert.equal(safeFileName('My: Beat/2?'), "My_ Beat_2_");
  assert.equal(safeFileName("   "), "project");
});
