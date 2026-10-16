import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { filesFor, pickZone, playablePitch, sampledInstrument, SAMPLED_INSTRUMENTS, zoneRate } from "../../src/core/sampleLibrary.ts";
import { SOUND_LIBRARY, soundParams } from "../../src/core/soundLibrary.ts";
import { createDefaultProject } from "../../src/core/project.ts";
import { reduce } from "../../src/core/reducer.ts";
import { parseProject, projectToJson } from "../../src/core/projectFile.ts";

test("sample library: every zone's audio file is bundled, licences are commercial-friendly", () => {
  assert.ok(SAMPLED_INSTRUMENTS.length >= 20);
  for (const inst of SAMPLED_INSTRUMENTS) {
    assert.ok(inst.zones.length >= 4, inst.id);
    assert.doesNotMatch(inst.license, /NC|non.?commercial/i, `${inst.id}: ${inst.license}`);
    assert.ok(inst.credit.length > 10, inst.id);
    for (const z of inst.zones) {
      const f = new URL(`../../assets/samples/${z.file}`, import.meta.url);
      assert.ok(existsSync(f) && statSync(f).size > 1000, z.file);
      if (z.loop) assert.ok(z.loop[0] > 0 && z.loop[1] > z.loop[0] + 0.02, `${z.file} loop`);
    }
  }
});

test("sample zones: velocity layers, nearest recorded note, tuning", () => {
  const piano = sampledInstrument("grand-piano");
  const soft = pickZone(piano, 60, 0.3), loud = pickZone(piano, 60, 0.95);
  assert.notEqual(soft.file, loud.file, "two velocity layers");
  assert.ok(soft.vel && soft.vel[1] <= loud.vel![0] + 1e-9);
  assert.ok(Math.abs(soft.note - 60) <= 2 && Math.abs(loud.note - 60) <= 2);
  assert.equal(zoneRate({ note: 60, file: "x" }, 72), 2);
  assert.ok(Math.abs(zoneRate({ note: 60, file: "x", tune: -100 }, 60) - 2 ** (-1 / 12)) < 1e-12);
  // Unknown id → the default piano, never a crash.
  assert.equal(sampledInstrument("nope").id, "grand-piano");
});

test("sample range: notes far outside a real instrument's range move by octaves", () => {
  const kalimba = sampledInstrument("kalimba");
  const lo = Math.min(...kalimba.zones.map((z) => z.note)), hi = Math.max(...kalimba.zones.map((z) => z.note));
  const p = playablePitch(kalimba, 36);
  assert.ok(p >= lo - 7 && p <= hi + 7 && (p - 36) % 12 === 0, `36 → ${p}`);
  assert.equal(playablePitch(kalimba, lo + 3), lo + 3, "in range: unchanged");
  const piano = sampledInstrument("grand-piano");
  assert.equal(playablePitch(piano, 30), 30);
});

test("string ensemble: cello below G3, violin above", () => {
  const s = sampledInstrument("strings");
  assert.match(pickZone(s, 45, 0.7).file, /^cello\//);
  assert.match(pickZone(s, 76, 0.7).file, /^violin\//);
  assert.ok(filesFor(s, [45, 76]).length === 2);
});

test("sound library: real-instrument sounds point to existing recordings", () => {
  const real = SOUND_LIBRARY.filter((x) => x.preset === "sampler");
  assert.ok(real.length >= 20);
  for (const snd of real) assert.equal(sampledInstrument(snd.sample).id, snd.sample, snd.id);
  for (const id of ["grand", "dark-piano", "strings", "flute", "kalimba", "guitar-nylon", "bass-electric"]) assert.equal(SOUND_LIBRARY.find((x) => x.id === id)?.preset, "sampler", id);
  assert.equal(soundParams(SOUND_LIBRARY.find((x) => x.id === "guitar-nylon")!).sample, "guitar-nylon");
  assert.equal(soundParams(SOUND_LIBRARY.find((x) => x.id === "808-trap")!).sample, undefined);
});

test("sampler instrument: change sound, switch engine, save and reload", () => {
  let p = createDefaultProject();
  const id = p.instruments[0].id;
  p = reduce(p, { type: "updateInstrument", trackId: id, patch: { sample: "guitar-acoustic" } });
  assert.equal(p.instruments[0].sample, "guitar-acoustic");
  p = reduce(p, { type: "updateInstrument", trackId: id, patch: { sample: "not-a-real-instrument" } });
  assert.equal(p.instruments[0].sample, "guitar-acoustic", "unknown id ignored");
  const back = parseProject(projectToJson(p)).project;
  assert.equal(back.instruments[0].preset, "sampler");
  assert.equal(back.instruments[0].sample, "guitar-acoustic");
  p = reduce(p, { type: "updateInstrument", trackId: id, patch: { preset: "pad" } });
  assert.equal(p.instruments[0].sample, undefined);
  p = reduce(p, { type: "updateInstrument", trackId: id, patch: { preset: "sampler" } });
  assert.equal(p.instruments[0].sample, "grand-piano");
  // Hand-edited file with a bad sample id → default piano, no crash.
  const raw = JSON.parse(projectToJson(p));
  raw.project.instruments[0].sample = 42;
  assert.equal(parseProject(JSON.stringify(raw)).project.instruments[0].sample, "grand-piano");
});
