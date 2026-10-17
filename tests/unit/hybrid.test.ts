import { test } from "node:test";
import assert from "node:assert/strict";
import { designHybrid, hybridPatch, hybridTarget, personalizeSong, roleOf, type HybridRole } from "../../src/core/ai/hybrid.ts";
import { createDefaultProject } from "../../src/core/project.ts";
import { reduce } from "../../src/core/reducer.ts";
import { parseProject, serializeProject } from "../../src/core/projectFile.ts";
import { generateSong } from "../../src/core/ai/beat.ts";
import { parseBeatPrompt } from "../../src/core/ai/prompt.ts";
import { converse } from "../../src/core/ai/dialog.ts";
import { normalize } from "../../src/core/ai/commands.ts";
import { runProducerTool, describeProject } from "../../src/core/ai/producerTools.ts";
import { isSampledInstrument } from "../../src/core/sampleLibrary.ts";

test("hybrid design: a recorded instrument + a synth layer per role, named, deterministic, varied", () => {
  for (const role of ["keys", "pluck", "pad", "lead", "bass"] as HybridRole[]) {
    for (let seed = 1; seed < 30; seed++) {
      const h = designHybrid(seed, role);
      assert.equal(h.role, role);
      assert.ok(h.base.preset === "sampler" && isSampledInstrument(h.base.sample!), `${role} base is a real instrument`);
      assert.ok(h.layer.preset !== "sampler" && h.layer.gainDb <= -4 && h.layer.gainDb >= -16, `${role} layer is a quieter synth`);
      assert.match(h.name, /^\S+ \S+/);
      assert.ok(h.description.length > 30);
    }
  }
  assert.deepEqual({ ...designHybrid(42, "keys"), createdAt: "" }, { ...designHybrid(42, "keys"), createdAt: "" });
  const names = new Set(Array.from({ length: 30 }, (_, i) => designHybrid(i + 1).name));
  assert.ok(names.size > 20, "names vary");
  const h = designHybrid(7, "keys");
  assert.notEqual(designHybrid(7, "keys", [h.name]).name, h.name, "an existing name is avoided");
  assert.equal(designHybrid(5, "bass").layer.synth.octave, -1, "bass: the sub is an octave below");
});

test("hybrid on a track: applied, saved, reloaded; changing the sound by hand clears the name", () => {
  let p = createDefaultProject();
  const ins = p.instruments.find((i) => i.preset !== "808")!;
  const h = designHybrid(3, "keys");
  p = reduce(p, { type: "updateInstrument", trackId: ins.id, patch: hybridPatch(h) });
  let t = p.instruments.find((i) => i.id === ins.id)!;
  assert.equal(t.hybrid, h.name);
  assert.equal(t.preset, "sampler");
  assert.equal(t.layer!.preset, h.layer.preset);
  const back = parseProject(serializeProject(p, { samples: new Map(), audio: new Map() })).project.instruments.find((i) => i.id === ins.id)!;
  assert.deepEqual(back.layer, t.layer);
  assert.equal(back.hybrid, h.name);
  p = reduce(p, { type: "updateInstrument", trackId: ins.id, patch: { sample: "harp" } });
  t = p.instruments.find((i) => i.id === ins.id)!;
  assert.equal(t.hybrid, undefined);
  assert.ok(t.layer, "layer kept until removed");
  p = reduce(p, { type: "updateInstrument", trackId: ins.id, patch: { layer: null } });
  assert.equal(p.instruments.find((i) => i.id === ins.id)!.layer, undefined);
  // Invalid layers are refused.
  assert.equal(reduce(p, { type: "updateInstrument", trackId: ins.id, patch: { layer: { preset: "808" as never, synth: ins.synth, gainDb: 0 } } }).instruments.find((i) => i.id === ins.id)!.layer, undefined);
});

test("favourite hybrids are used by the AI on generated beats (never on the 808)", () => {
  const p0 = createDefaultProject();
  const song = generateSong(p0, parseBeatPrompt("r&b", "rnb", p0.key.root), 4);
  const fav = { ...designHybrid(9, "keys"), favorite: true };
  const out = personalizeSong(song, [fav]);
  const chords = out.patch.instruments!.find((i) => i.id === song.roleIds.chords)!;
  assert.equal(chords.hybrid, fav.name);
  assert.ok(out.summary.some((s) => s.includes(fav.name)));
  const bassFav = { ...designHybrid(9, "bass"), favorite: true };
  const trap = generateSong(p0, parseBeatPrompt("trap", "trap", p0.key.root), 4);
  const bassTrack = trap.patch.instruments!.find((i) => i.id === trap.roleIds.bass)!;
  const after = personalizeSong(trap, [bassFav]).patch.instruments!.find((i) => i.id === trap.roleIds.bass)!;
  if (bassTrack.preset === "808") assert.equal(after.preset, "808", "the 808 stays an 808");
  assert.equal(personalizeSong(song, []), song);
});

test("conversation and tool: « invente un son pour la basse » targets the right instrument", () => {
  const p0 = createDefaultProject();
  const p = reduce(p0, { type: "patchProject", patch: generateSong(p0, parseBeatPrompt("r&b", "rnb", p0.key.root), 2).patch });
  const r = converse(p, "invente-moi un son unique pour le piano", {}).reply;
  assert.ok(r.hybrid && p.instruments.some((i) => i.id === r.hybrid!.trackId && i.preset !== "808"));
  assert.equal(r.hybrid!.role, "keys");
  const t = hybridTarget(p, normalize("un son hybride pour la basse"));
  assert.equal(t?.role, "bass");
  assert.equal(converse(p, "c'est quoi un son hybride ?", {}).reply.hybrid, undefined);
  const named = p.instruments.find((i) => i.preset !== "808")!;
  assert.equal(runProducerTool(p, "create_hybrid", { track: named.name }).hybrid!.trackId, named.id);
  const eight = p.instruments.find((i) => i.preset === "808");
  if (eight) assert.ok(runProducerTool(p, "create_hybrid", { track: eight.name }).isError);
  assert.ok(roleOf({ ...named, name: "Basse", preset: "bass" }) === "bass");
  const withHyb = reduce(p, { type: "updateInstrument", trackId: named.id, patch: hybridPatch(designHybrid(1, "keys")) });
  assert.match(describeProject(withHyb), /son hybride « /);
});
