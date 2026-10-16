import { test } from "node:test";
import assert from "node:assert/strict";
import { describeMemory, emptyMemory, favouriteStyles, learn, parseMemory, preferencesFor, type TasteMemory } from "../../src/core/ai/memory.ts";
import { generateSong } from "../../src/core/ai/beat.ts";
import { parseBeatPrompt } from "../../src/core/ai/prompt.ts";
import { styleById } from "../../src/core/ai/styles.ts";
import { createDefaultProject } from "../../src/core/project.ts";

const drill = styleById("uk-drill");
const def = drill.sounds;

test("learning: a sound you replace becomes the preference; a single 👍 is not enough", () => {
  let m = emptyMemory();
  m = learn(m, { type: "soundChange", styleId: "uk-drill", role: "lead", from: def.lead, to: "guitar-nylon" });
  assert.equal(preferencesFor(m, "uk-drill", def).sounds.lead, "guitar-nylon", "replacement = strong signal (+2)");
  m = emptyMemory();
  m = learn(m, { type: "rate", styleId: "uk-drill", sounds: { ...def, lead: "flute" }, liked: true });
  assert.equal(preferencesFor(m, "uk-drill", def).sounds.lead, undefined, "a single 👍 is not enough");
  m = learn(m, { type: "rate", styleId: "uk-drill", sounds: { ...def, lead: "flute" }, liked: true });
  assert.equal(preferencesFor(m, "uk-drill", def).sounds.lead, "flute");
  // Other styles are not affected.
  assert.deepEqual(preferencesFor(m, "trap", styleById("trap").sounds).sounds, {});
});

test("learning: tempo (median of the last changes), kit, favourite styles, commands", () => {
  let m = emptyMemory();
  m = learn(m, { type: "tempo", styleId: "afrobeats", offset: 4 });
  assert.equal(preferencesFor(m, "afrobeats", def).bpmOffset, 0, "one change is not a habit");
  m = learn(m, { type: "tempo", styleId: "afrobeats", offset: 6 });
  m = learn(m, { type: "tempo", styleId: "afrobeats", offset: 5 });
  assert.equal(preferencesFor(m, "afrobeats", def).bpmOffset, 5);
  m = learn(m, { type: "kit", styleId: "afrobeats", kitId: "amapiano" });
  assert.equal(preferencesFor(m, "afrobeats", def).kit, "amapiano");
  m = learn(m, { type: "rate", styleId: "amapiano", sounds: def, liked: true });
  m = learn(m, { type: "rate", styleId: "rage", sounds: def, liked: false });
  assert.deepEqual(favouriteStyles(m), ["amapiano"]);
  m = learn(m, { type: "command", text: "plus de basse" });
  m = learn(m, { type: "command", text: "plus de basse" });
  assert.deepEqual(m.commands, ["plus de basse"]);
  const lines = describeMemory(m, (id) => id);
  assert.ok(lines.some((l) => l.includes("Styles préférés : amapiano")));
  assert.ok(lines.some((l) => l.includes("5 BPM plus vite")));
});

test("memory file: survives a round trip, corrupt data never crashes", () => {
  let m: TasteMemory = emptyMemory();
  m = learn(m, { type: "soundChange", styleId: "trap", role: "chords", from: "dark-pad", to: "strings" });
  assert.deepEqual(parseMemory(JSON.parse(JSON.stringify(m))), m);
  for (const bad of [null, 3, "x", [], { styles: 4, sounds: { trap: { lead: { a: "z" } } }, tempo: { t: [999, 3] }, commands: [1, "ok"] }]) {
    const p = parseMemory(bad);
    assert.equal(p.version, 1);
  }
  const p = parseMemory({ tempo: { t: [999, 3] }, commands: [1, "ok"], sounds: { trap: { lead: { a: "z" } } } });
  assert.deepEqual(p.tempo.t, [3]);
  assert.deepEqual(p.commands, ["ok"]);
  assert.equal(p.sounds.trap.lead!.a, 0);
  assert.deepEqual(describeMemory(emptyMemory(), (x) => x).length, 1);
});

test("generation: version 1 follows the learnt taste, versions 2–3 keep exploring", () => {
  let m = emptyMemory();
  m = learn(m, { type: "soundChange", styleId: "uk-drill", role: "lead", from: def.lead, to: "guitar-nylon" });
  m = learn(m, { type: "tempo", styleId: "uk-drill", offset: -4 });
  m = learn(m, { type: "tempo", styleId: "uk-drill", offset: -4 });
  m = learn(m, { type: "kit", styleId: "uk-drill", kitId: "trap-hybrid" });
  const p = createDefaultProject();
  const req = parseBeatPrompt("drill", "uk-drill", p.key.root);
  const prefs = preferencesFor(m, "uk-drill", def);
  const v1 = generateSong(p, req, 9, 0, prefs);
  assert.equal(v1.learned, true);
  assert.equal(v1.sounds.lead, "guitar-nylon");
  assert.equal(v1.patch.bpm, req.bpm - 4);
  assert.equal(v1.kitId, "trap-hybrid");
  assert.match(v1.summary[0], /vos goûts/);
  assert.equal(v1.patch.instruments!.find((i) => i.name === "Melody")!.sample, "guitar-nylon");
  const v2 = generateSong(p, req, 9, 1, prefs);
  assert.equal(v2.learned, false);
  assert.equal(v2.patch.bpm, req.bpm);
  // No memory → exactly the style's reference sounds.
  assert.equal(generateSong(p, req, 9, 0).sounds.lead, def.lead);
});
