import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChain, cloneChain, EFFECT_PRESETS, VOCAL_CHAIN_PRESETS } from "../../src/core/effectPresets.ts";
import { BUS_DRUMS, BUS_VOCALS, createEmptyProject, EFFECT_DEFAULTS, getChannel, MASTER } from "../../src/core/project.ts";
import { parseProject, projectToJson } from "../../src/core/projectFile.ts";
import { reduce } from "../../src/core/reducer.ts";

test("routing: track channels go to a bus or the master only; survives save/load", () => {
  let p = createEmptyProject("mix");
  const kick = p.tracks[0].id;
  p = reduce(p, { type: "updateChannel", channelId: kick, patch: { output: BUS_VOCALS } });
  assert.equal(getChannel(p, kick)!.output, BUS_VOCALS);
  p = reduce(p, { type: "updateChannel", channelId: kick, patch: { output: MASTER } });
  assert.equal(getChannel(p, kick)!.output, MASTER);
  // Invalid targets are ignored: another track, a return, unknown ids; buses cannot be re-routed.
  const before = p;
  p = reduce(p, { type: "updateChannel", channelId: kick, patch: { output: p.tracks[1].id } });
  p = reduce(p, { type: "updateChannel", channelId: kick, patch: { output: "nope" } });
  p = reduce(p, { type: "updateChannel", channelId: BUS_DRUMS, patch: { output: BUS_VOCALS } });
  assert.equal(p, before);
  const back = parseProject(projectToJson(p)).project;
  assert.equal(getChannel(back, kick)!.output, MASTER);
});

test("effect presets only use known parameters", () => {
  for (const [type, list] of Object.entries(EFFECT_PRESETS)) {
    const known = new Set(Object.keys(EFFECT_DEFAULTS[type as keyof typeof EFFECT_DEFAULTS]));
    for (const pr of list!) for (const k of Object.keys(pr.params)) assert.ok(known.has(k), `${type} preset "${pr.name}": unknown param ${k}`);
  }
});

test("vocal chain presets keep the canonical order and reuse existing effect ids", () => {
  const p = createEmptyProject("v");
  const current = getChannel(p, p.vocals[0].id)!.inserts;
  for (const preset of VOCAL_CHAIN_PRESETS) {
    const chain = buildChain(preset, current);
    assert.deepEqual(chain.map((e) => e.type), current.map((e) => e.type), preset.id);
    assert.deepEqual(chain.map((e) => e.id), current.map((e) => e.id));
    for (const c of preset.chain) for (const k of Object.keys(c.params ?? {})) assert.ok(k in EFFECT_DEFAULTS[c.type], `${preset.id}/${c.type}: ${k}`);
  }
  const cloned = cloneChain(current);
  assert.notEqual(cloned[0].id, current[0].id);
  assert.deepEqual(cloned.map((e) => e.params), current.map((e) => e.params));
});
