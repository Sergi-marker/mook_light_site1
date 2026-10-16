import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { DRUM_KITS, DRUM_SAMPLES, drumSample } from "../../src/core/drumSamples.ts";
import { createDefaultProject } from "../../src/core/project.ts";
import { reduce } from "../../src/core/reducer.ts";
import { parseProject, projectToJson } from "../../src/core/projectFile.ts";
import { generateSong } from "../../src/core/ai/beat.ts";
import { parseBeatPrompt } from "../../src/core/ai/prompt.ts";
import { STYLES, styleDrumKit } from "../../src/core/ai/styles.ts";

test("drum hits: every file is bundled, CC0, level correction bounded", () => {
  assert.ok(DRUM_SAMPLES.length >= 40);
  for (const d of DRUM_SAMPLES) {
    const f = new URL(`../../assets/samples/${d.file}`, import.meta.url);
    assert.ok(existsSync(f) && statSync(f).size > 500, d.file);
    assert.match(d.license, /CC0/);
    assert.ok(d.gainDb >= -6 && d.gainDb <= 9, d.id);
  }
  assert.equal(new Set(DRUM_SAMPLES.map((d) => d.id)).size, DRUM_SAMPLES.length, "unique ids");
});

test("drum kits: every sound exists; every style has a known kit", () => {
  for (const k of DRUM_KITS) for (const id of Object.values(k.sounds)) if (id) assert.ok(drumSample(id), `${k.id}: ${id}`);
  for (const s of STYLES) assert.ok(DRUM_KITS.some((k) => k.id === styleDrumKit(s)), s.id);
  assert.equal(styleDrumKit(STYLES.find((s) => s.id === "amapiano")!), "amapiano");
  assert.equal(styleDrumKit(STYLES.find((s) => s.id === "uk-drill")!), "synth");
});

test("apply a kit, change one lane, save / reload, back to synth", () => {
  let p = createDefaultProject();
  p = reduce(p, { type: "applyDrumKit", kitId: "afro" });
  const by = (k: string) => p.tracks.find((t) => t.instrument === k);
  assert.equal(by("closedHat")?.builtinSample, "shaker");
  assert.equal(by("perc")?.builtinSample, "conga-open");
  assert.equal(by("808")?.builtinSample, undefined, "808 lane untouched");
  const hat = by("closedHat")!;
  p = reduce(p, { type: "updateTrack", trackId: hat.id, patch: { builtinSample: "cabasa" } });
  p = reduce(p, { type: "updateTrack", trackId: hat.id, patch: { builtinSample: "does-not-exist" } });
  assert.equal(by("closedHat")?.builtinSample, "cabasa");
  const back = parseProject(projectToJson(p)).project;
  assert.equal(back.tracks.find((t) => t.instrument === "closedHat")?.builtinSample, "cabasa");
  p = reduce(p, { type: "applyDrumKit", kitId: "synth" });
  assert.ok(p.tracks.every((t) => t.builtinSample === undefined));
  assert.equal(reduce(p, { type: "applyDrumKit", kitId: "nope" }), p);
});

test("AI: an amapiano beat uses the amapiano kit, a UK drill beat the electronic kit", () => {
  const p = createDefaultProject();
  const ama = generateSong(p, parseBeatPrompt("amapiano", "amapiano", p.key.root), 3);
  assert.equal(ama.patch.tracks!.find((t) => t.instrument === "closedHat")?.builtinSample, "shaker-down");
  const drill = generateSong(p, parseBeatPrompt("drill", "uk-drill", p.key.root), 3);
  assert.ok(drill.patch.tracks!.every((t) => !t.builtinSample));
});
