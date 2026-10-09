import { test } from "node:test";
import assert from "node:assert/strict";
import { reduce } from "../../src/core/reducer.ts";
import { createEmptyProject, createDefaultProject, currentPattern, getChannel, isChannelAudible, BUS_VOCALS } from "../../src/core/project.ts";
import { BPM_MAX, BPM_MIN } from "../../src/core/constants.ts";

const fresh = () => createEmptyProject("Test");
const drumId = (p: ReturnType<typeof fresh>, i = 0) => p.tracks[i].id;

test("BPM is clamped to 40–220", () => {
  const p = fresh();
  assert.equal(reduce(p, { type: "setBpm", bpm: 10 }).bpm, BPM_MIN);
  assert.equal(reduce(p, { type: "setBpm", bpm: 999 }).bpm, BPM_MAX);
  assert.equal(reduce(p, { type: "setBpm", bpm: 92.5 }).bpm, 92.5);
});

test("no-op actions return the same object", () => {
  const p = fresh();
  assert.equal(reduce(p, { type: "setBpm", bpm: p.bpm }), p);
  assert.equal(reduce(p, { type: "clearPattern" }), p);
  assert.equal(reduce(p, { type: "toggleStep", trackId: "nope", step: 0 }), p);
  assert.equal(reduce(p, { type: "toggleStep", trackId: drumId(p), step: 99 }), p);
  assert.equal(reduce(p, { type: "updateChannel", channelId: drumId(p), patch: { pan: 0 } }), p);
  assert.equal(reduce(p, { type: "setKey", key: p.key }), p);
});

test("toggleStep edits only the current pattern", () => {
  let p = fresh();
  p = reduce(p, { type: "addPattern", name: "B" });
  const b = p.currentPatternId;
  p = reduce(p, { type: "toggleStep", trackId: drumId(p, 1), step: 4 });
  assert.equal(currentPattern(p).drums[drumId(p, 1)][4].on, true);
  assert.equal(p.patterns[0].drums[drumId(p, 1)][4].on, false);
  p = reduce(p, { type: "selectPattern", patternId: p.patterns[0].id });
  assert.notEqual(p.currentPatternId, b);
});

test("pattern copy is deep, delete keeps one pattern and removes its clips", () => {
  let p = createDefaultProject();
  const first = p.patterns[0].id;
  p = reduce(p, { type: "addPattern", copyFrom: first });
  const copy = p.currentPatternId;
  p = reduce(p, { type: "toggleStep", trackId: drumId(p), step: 0 });
  assert.notEqual(p.patterns[0].drums[drumId(p)][0].on, p.patterns[1].drums[drumId(p)][0].on);
  p = reduce(p, { type: "addClip", clip: { patternId: copy, lane: 0, start: 0, length: 4 } });
  p = reduce(p, { type: "deletePattern", patternId: copy });
  assert.equal(p.patterns.length, 1);
  assert.equal(p.arrangement.clips.length, 0);
  assert.equal(reduce(p, { type: "deletePattern", patternId: first }), p, "last pattern cannot be deleted");
});

test("step count resize and duplicate (16→32→64) keep content incl. notes", () => {
  let p = fresh();
  const ins = p.instruments[0].id;
  p = reduce(p, { type: "toggleStep", trackId: drumId(p), step: 2 });
  p = reduce(p, { type: "addNotes", trackId: ins, notes: [{ pitch: 60, start: 3, length: 2, velocity: 90 }] });
  const d = reduce(p, { type: "duplicatePattern" });
  assert.equal(currentPattern(d).stepCount, 32);
  assert.equal(currentPattern(d).drums[drumId(d)][18].on, true);
  assert.deepEqual(currentPattern(d).notes[ins].map((n) => n.start), [3, 19]);
  const small = reduce(reduce(d, { type: "setStepCount", stepCount: 64 }), { type: "setStepCount", stepCount: 16 });
  assert.deepEqual(currentPattern(small).notes[ins].map((n) => n.start), [3]);
});

test("rolls, micro-timing, humanize and quantize", () => {
  let p = fresh();
  const t = drumId(p, 3);
  p = reduce(p, { type: "toggleStep", trackId: t, step: 0 });
  p = reduce(p, { type: "setStep", trackId: t, step: 0, value: { roll: 9 } });
  assert.equal(currentPattern(p).drums[t][0].roll, 4);
  p = reduce(p, { type: "humanize", amount: 1, seed: 3 });
  const st = currentPattern(p).drums[t][0];
  assert.ok(st.offset !== undefined && Math.abs(st.offset) <= 0.12);
  p = reduce(p, { type: "quantize" });
  assert.equal(currentPattern(p).drums[t][0].offset, undefined);
});

test("notes: add, clamp, move, remove", () => {
  let p = fresh();
  const ins = p.instruments[0].id;
  p = reduce(p, { type: "addNotes", trackId: ins, notes: [{ pitch: 200, start: -3, length: 0, velocity: 300 }] });
  const n = currentPattern(p).notes[ins][0];
  assert.deepEqual([n.pitch, n.start, n.length, n.velocity], [127, 0, 0.0625, 127]);
  p = reduce(p, { type: "updateNotes", trackId: ins, updates: [{ id: n.id, pitch: 64, start: 4, slide: true }] });
  assert.equal(currentPattern(p).notes[ins][0].pitch, 64);
  assert.equal(currentPattern(p).notes[ins][0].slide, true);
  p = reduce(p, { type: "removeNotes", trackId: ins, ids: [n.id] });
  assert.equal(currentPattern(p).notes[ins].length, 0);
});

test("mixer: channels, solo logic incl. bus solo, effects", () => {
  let p = fresh();
  const kick = drumId(p, 0), snare = drumId(p, 1);
  const ch = (id: string) => getChannel(p, id)!;
  assert.ok(isChannelAudible(ch(kick), p.channels));
  p = reduce(p, { type: "toggleSolo", trackId: snare });
  assert.equal(isChannelAudible(ch(kick), p.channels), false);
  assert.equal(isChannelAudible(ch(snare), p.channels), true);
  assert.equal(isChannelAudible(ch("master"), p.channels), true, "buses keep playing");
  p = reduce(p, { type: "toggleSolo", trackId: snare });
  p = reduce(p, { type: "toggleSolo", trackId: BUS_VOCALS });
  assert.equal(isChannelAudible(ch(p.vocals[0].id), p.channels), true, "vocal tracks feed the soloed bus");
  assert.equal(isChannelAudible(ch(kick), p.channels), false);
  p = reduce(p, { type: "addEffect", channelId: kick, effectType: "compressor" });
  const fx = ch(kick).inserts[0];
  p = reduce(p, { type: "updateEffect", channelId: kick, effectId: fx.id, params: { ratio: 6 } });
  assert.equal(ch(kick).inserts[0].params.ratio, 6);
  p = reduce(p, { type: "addEffect", channelId: kick, effectType: "eq" });
  p = reduce(p, { type: "moveEffect", channelId: kick, effectId: fx.id, delta: 1 });
  assert.equal(ch(kick).inserts[1].id, fx.id);
  p = reduce(p, { type: "removeEffect", channelId: kick, effectId: fx.id });
  assert.equal(ch(kick).inserts.length, 1);
});

test("instruments: add creates channel + empty note lanes; remove cleans up", () => {
  let p = fresh();
  p = reduce(p, { type: "addPattern" });
  p = reduce(p, { type: "addInstrument", preset: "pad" });
  const ins = p.instruments[p.instruments.length - 1];
  assert.ok(getChannel(p, ins.id));
  assert.ok(p.patterns.every((x) => Array.isArray(x.notes[ins.id])));
  assert.equal(p.channels[p.channels.length - 1].id, "master", "buses stay last");
  p = reduce(p, { type: "updateInstrument", trackId: ins.id, patch: { preset: "strings" } });
  assert.equal(p.instruments.find((i) => i.id === ins.id)!.preset, "strings");
  p = reduce(p, { type: "removeInstrument", trackId: ins.id });
  assert.equal(getChannel(p, ins.id), undefined);
  assert.ok(p.patterns.every((x) => x.notes[ins.id] === undefined));
});

test("arrangement: clips snap to quarter bars, duplicate, sections sorted, loop", () => {
  let p = fresh();
  const pat = p.patterns[0].id;
  p = reduce(p, { type: "addClip", clip: { patternId: pat, lane: 5, start: 1.13, length: 3.9 } });
  const c = p.arrangement.clips[0];
  assert.deepEqual([c.start, c.length, p.arrangement.lanes], [1.25, 4, 6]);
  p = reduce(p, { type: "duplicateClips", ids: [c.id] });
  assert.equal(p.arrangement.clips[1].start, 5.25);
  p = reduce(p, { type: "addSection", section: { name: "Chorus", start: 8, length: 8, color: "#f00" } });
  p = reduce(p, { type: "addSection", section: { name: "Intro", start: 0, length: 4, color: "#0f0" } });
  assert.deepEqual(p.arrangement.sections.map((s) => s.name), ["Intro", "Chorus"]);
  p = reduce(p, { type: "setLoop", loop: { enabled: true, start: 4, end: 2 } });
  assert.deepEqual(p.arrangement.loop, { enabled: true, start: 4, end: 5 });
});

test("vocals: one armed track, takes with assets, delete take removes its clips", () => {
  let p = fresh();
  const [lead, dbl] = p.vocals;
  assert.equal(lead.armed, true);
  p = reduce(p, { type: "updateVocalTrack", trackId: dbl.id, patch: { armed: true } });
  assert.deepEqual(p.vocals.map((v) => v.armed).slice(0, 2), [false, true]);
  const asset = { id: "a1", name: "x", sampleRate: 48000, frames: 48000, channels: 1 };
  p = reduce(p, { type: "addTake", trackId: lead.id, take: { id: "t1", name: "Take 1", assetId: "a1", startStep: 16, recordedAt: "" }, asset, clip: { takeId: "t1", start: 16, offset: 0, duration: 1, gainDb: 0 } });
  p = reduce(p, { type: "addTake", trackId: lead.id, take: { id: "t2", name: "Take 2", assetId: "a1", startStep: 16, recordedAt: "" }, asset, clip: { takeId: "t2", start: 16, offset: 0, duration: 1, gainDb: 0 } });
  const v = p.vocals[0];
  assert.equal(v.takes.length, 2);
  assert.equal(v.clips.length, 1, "new take replaces the fully covered clip");
  assert.equal(v.clips[0].takeId, "t2");
  assert.equal(p.assets.length, 1);
  p = reduce(p, { type: "deleteTake", trackId: lead.id, takeId: "t2" });
  assert.equal(p.vocals[0].clips.length, 0);
});

test("batch applies several actions as one transition", () => {
  const p = fresh();
  const n = reduce(p, { type: "batch", actions: [{ type: "setBpm", bpm: 100 }, { type: "setSwing", swing: 20 }] });
  assert.deepEqual([n.bpm, n.swing], [100, 20]);
});

test("default project: 7 drum lanes, piano + 808, 4 vocal tracks, buses", () => {
  const p = createDefaultProject();
  assert.deepEqual(p.tracks.map((t) => t.instrument), ["kick", "snare", "clap", "closedHat", "openHat", "perc", "808"]);
  assert.deepEqual(p.instruments.map((i) => i.preset), ["piano", "808"]);
  assert.deepEqual(p.vocals.map((v) => v.role), ["lead", "double", "adlibs", "backing"]);
  for (const id of ["bus_drums", "bus_music", "bus_vocals", "ret_reverb", "ret_delay", "master"]) assert.ok(getChannel(p, id), id);
  assert.ok(Object.values(currentPattern(p).drums).some((s) => s.some((x) => x.on)));
});
