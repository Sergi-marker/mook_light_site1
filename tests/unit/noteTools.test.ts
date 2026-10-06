import { test } from "node:test";
import assert from "node:assert/strict";
import { arpeggiate, chordPitches, humanizeNotes, legatoNotes, reverseNotes, scaleStep, strumNotes, transposeNotes, velocityRamp } from "../../src/core/noteTools.ts";
import { inScale, type Key } from "../../src/core/music.ts";
import { createEmptyProject } from "../../src/core/project.ts";
import { parseProject, projectToJson } from "../../src/core/projectFile.ts";
import { reduce } from "../../src/core/reducer.ts";
import { SOUND_LIBRARY, soundParams } from "../../src/core/soundLibrary.ts";
import type { Note } from "../../src/core/types.ts";

const F_MINOR: Key = { root: 5, scale: "minor" };
const n = (id: string, pitch: number, start: number, length = 2, velocity = 100): Note => ({ id, pitch, start, length, velocity });

test("diatonic chords stay in the key; F minor triad on F = F Ab C", () => {
  assert.deepEqual(chordPitches(53, "triad", F_MINOR), [53, 56, 60]);
  for (const root of [53, 55, 56, 58, 60, 61, 63]) for (const q of chordPitches(root, "seventh", F_MINOR)) assert.ok(inScale(q, F_MINOR), `${root} → ${q}`);
  assert.deepEqual(chordPitches(53, "power", F_MINOR), [53, 60, 65]);
  assert.equal(chordPitches(53, "ninth", F_MINOR).length, 5);
});

test("scale-degree transpose skips out-of-key notes; semitone transpose is exact", () => {
  assert.equal(scaleStep(53, 1, F_MINOR), 55); // F → G
  assert.equal(scaleStep(55, 1, F_MINOR), 56); // G → Ab
  assert.deepEqual(transposeNotes([n("a", 53, 0)], 12, F_MINOR), [{ id: "a", pitch: 65 }]);
  assert.deepEqual(transposeNotes([n("a", 53, 0)], -1, F_MINOR, true), [{ id: "a", pitch: 51 }]);
});

test("legato, strum, reverse, velocity ramp, humanize", () => {
  const notes = [n("a", 53, 0, 1), n("b", 56, 0, 1), n("c", 60, 4, 1)];
  assert.deepEqual(legatoNotes(notes, 16).map((x) => x.length), [4, 4, 12]);
  const strum = strumNotes(notes, 0.25);
  assert.deepEqual(strum.find((x) => x.id === "b"), { id: "b", start: 0.25, length: 0.75 });
  assert.deepEqual(reverseNotes([n("a", 60, 0, 2), n("b", 62, 6, 2)]).map((x) => x.start), [6, 0]);
  assert.deepEqual(velocityRamp(notes, 60, 120).map((x) => x.velocity), [60, 60, 120]);
  const hum = humanizeNotes(notes, 1, 42, 16);
  assert.deepEqual(hum, humanizeNotes(notes, 1, 42, 16), "deterministic for a seed");
  for (const h of hum) assert.ok(h.velocity >= 1 && h.velocity <= 127 && h.start >= 0);
});

test("arpeggiator turns a held chord into a rhythmic sequence", () => {
  const chord = [n("a", 53, 0, 8), n("b", 56, 0, 8), n("c", 60, 0, 8)];
  const up = arpeggiate(chord, 1, "up");
  assert.equal(up.length, 8);
  assert.deepEqual(up.slice(0, 4).map((x) => x.pitch), [53, 56, 60, 53]);
  assert.deepEqual(up.map((x) => x.start), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(arpeggiate(chord, 2, "down").map((x) => x.pitch), [60, 56, 53, 60]);
  assert.deepEqual(arpeggiate(chord, 1, "updown").slice(0, 5).map((x) => x.pitch), [53, 56, 60, 56, 53]);
});

test("library sounds apply through the reducer and survive save/load", () => {
  let p = createEmptyProject("lib");
  p = reduce(p, { type: "addInstrument", preset: "piano" });
  const id = p.instruments[p.instruments.length - 1].id;
  const snd = SOUND_LIBRARY.find((s) => s.id === "mono-lead")!;
  const sp = soundParams(snd);
  p = reduce(p, { type: "updateInstrument", trackId: id, patch: { preset: sp.preset, synth: sp.synth, bass808: sp.bass808 } });
  const ins = p.instruments.find((i) => i.id === id)!;
  assert.equal(ins.preset, "synth");
  assert.equal(ins.synth.mono, true);
  assert.equal(ins.synth.lfoDepth, 15);
  const back = parseProject(projectToJson(p)).project.instruments.find((i) => i.id === id)!;
  assert.deepEqual(back.synth, ins.synth);
  assert.ok(SOUND_LIBRARY.length >= 30);
});
