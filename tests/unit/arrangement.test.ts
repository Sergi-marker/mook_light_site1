import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyProject, stepsPerBarOf } from "../../src/core/project.ts";
import { parseProject, projectToJson } from "../../src/core/projectFile.ts";
import { reduce } from "../../src/core/reducer.ts";
import type { Project } from "../../src/core/types.ts";

function withClip(): Project {
  let p = createEmptyProject("arr");
  p = reduce(p, { type: "setBpm", bpm: 120 });
  p = reduce(p, { type: "addClip", clip: { patternId: p.patterns[0].id, lane: 0, start: 2, length: 8 } });
  return p;
}

function withVocal(p: Project): Project {
  const v = p.vocals[0];
  p = reduce(p, {
    type: "addTake", trackId: v.id,
    take: { id: "tk1", name: "Take 1", assetId: "a1", startStep: 32, recordedAt: "2026-01-01T00:00:00Z" },
    asset: { id: "a1", name: "Take 1", sampleRate: 44100, frames: 44100 * 8, channels: 1 },
    clip: { takeId: "tk1", start: 32, offset: 0, duration: 8, gainDb: 0, fadeIn: 0.2, fadeOut: 0.5 },
  });
  return p;
}

test("split a pattern clip: right part keeps playing from the right place (offset)", () => {
  let p = withClip();
  const id = p.arrangement.clips[0].id;
  p = reduce(p, { type: "splitClips", ids: [id], bar: 5 });
  const [a, b] = p.arrangement.clips;
  assert.deepEqual([a.start, a.length, a.offset ?? 0], [2, 3, 0]);
  assert.deepEqual([b.start, b.length, b.offset], [5, 5, 3]);
  // Splitting outside the clip does nothing.
  assert.equal(reduce(p, { type: "splitClips", ids: [a.id], bar: 9 }), p);
});

test("split an audio clip: offsets and fades are distributed", () => {
  let p = withVocal(withClip());
  const v = p.vocals[0];
  const spb = stepsPerBarOf(p); // 16 steps per bar, 120 BPM → 2 s per bar
  p = reduce(p, { type: "splitAudioClips", trackId: v.id, ids: [v.clips[0].id], step: 32 + spb }); // 2 s into the clip
  const [l, r] = p.vocals[0].clips;
  assert.equal(l.duration, 2);
  assert.equal(l.fadeIn, 0.2);
  assert.equal(l.fadeOut, undefined);
  assert.deepEqual([r.start, r.offset, r.duration, r.fadeOut, r.fadeIn], [48, 2, 6, 0.5, undefined]);
});

test("insert bars shifts clips, sections, vocals, automation and splits spanning clips", () => {
  let p = withVocal(withClip());
  p = reduce(p, { type: "addSection", section: { name: "Verse", start: 0, length: 4, color: "#000" } });
  p = reduce(p, { type: "addSection", section: { name: "Chorus", start: 8, length: 8, color: "#000" } });
  p = reduce(p, { type: "setAutomation", lane: { id: "au", channelId: "master", param: "volume", points: [{ bar: 1, value: 1 }, { bar: 10, value: 0.5 }] } });
  p = reduce(p, { type: "insertBars", at: 4, bars: 2 });
  const clips = p.arrangement.clips.slice().sort((a, b) => a.start - b.start);
  assert.deepEqual(clips.map((c) => [c.start, c.length, c.offset ?? 0]), [[2, 2, 0], [6, 6, 2]]);
  assert.deepEqual(p.arrangement.sections.map((s) => [s.name, s.start, s.length]), [["Verse", 0, 4], ["Chorus", 10, 8]]);
  assert.deepEqual(p.automation[0].points.map((x) => x.bar), [1, 12]);
  // The vocal clip started at bar 2 (step 32) — before the insertion point (bar 4) → split.
  const vc = p.vocals[0].clips.slice().sort((a, b) => a.start - b.start);
  assert.equal(vc.length, 2);
  assert.equal(vc[0].duration, 4);
  assert.deepEqual([vc[1].start, vc[1].offset, vc[1].duration], [96, 4, 4]);
});

test("delete bars removes the range and pulls everything back", () => {
  let p = withClip(); // clip bars 2–10
  p = reduce(p, { type: "addClip", clip: { patternId: p.patterns[0].id, lane: 1, start: 12, length: 4 } });
  p = reduce(p, { type: "addClip", clip: { patternId: p.patterns[0].id, lane: 2, start: 4, length: 2 } }); // fully inside
  p = reduce(p, { type: "setLoop", loop: { start: 12, end: 16 } });
  p = reduce(p, { type: "insertBars", at: 3, bars: -4 }); // delete bars 3–7
  const byLane = (l: number) => p.arrangement.clips.filter((c) => c.lane === l);
  assert.deepEqual(byLane(0).map((c) => [c.start, c.length]), [[2, 4]]);
  assert.deepEqual(byLane(1).map((c) => [c.start, c.length]), [[8, 4]]);
  assert.equal(byLane(2).length, 0);
  assert.deepEqual([p.arrangement.loop.start, p.arrangement.loop.end], [8, 12]);
});

test("lane names, muted clips, fades and lyrics survive save / load", () => {
  let p = withVocal(withClip());
  const v = p.vocals[0];
  p = reduce(p, { type: "setLaneName", lane: 1, name: "Drums B" });
  p = reduce(p, { type: "updateClip", clipId: p.arrangement.clips[0].id, patch: { muted: true, offset: 1 } });
  p = reduce(p, { type: "updateVocalTrack", trackId: v.id, patch: { lyrics: "Couplet 1\nligne 2" } });
  const media = { audio: new Map([["a1", new Uint8Array(8)]]) };
  const back = parseProject(projectToJson(p), media).project;
  assert.deepEqual(back.arrangement.laneNames, ["", "Drums B"]);
  assert.equal(back.arrangement.clips[0].muted, true);
  assert.equal(back.arrangement.clips[0].offset, 1);
  assert.equal(back.vocals[0].clips[0].fadeOut, 0.5);
  assert.equal(back.vocals[0].lyrics, "Couplet 1\nligne 2");
});

test("section length typed in bars: the rest of the song follows, the section's music is stretched", () => {
  let p = createEmptyProject("sec");
  const pat = p.patterns[0].id;
  for (const [name, start, length] of [["Couplet", 0, 8], ["Refrain", 8, 8], ["Couplet 2", 16, 8]] as const) p = reduce(p, { type: "addSection", section: { name, start, length, color: "#888" } });
  p = reduce(p, { type: "addClip", clip: { patternId: pat, lane: 0, start: 8, length: 8 } }); // refrain music
  p = reduce(p, { type: "addClip", clip: { patternId: pat, lane: 0, start: 16, length: 8 } }); // couplet 2 music
  const id = (n: string, q: Project) => q.arrangement.sections.find((s) => s.name === n)!;
  // Refrain 8 → 16 bars.
  const longer = reduce(p, { type: "resizeSection", sectionId: id("Refrain", p).id, length: 16, shift: true });
  assert.deepEqual([id("Refrain", longer).start, id("Refrain", longer).length], [8, 16]);
  assert.equal(id("Couplet 2", longer).start, 24, "next section moved");
  assert.deepEqual(longer.arrangement.clips.map((c) => [c.start, c.length]).sort((a, b) => a[0] - b[0]), [[8, 16], [24, 8]], "refrain clip stretched, next clip moved");
  // Back to 4 bars: the end of the refrain is removed, what follows moves back.
  const shorter = reduce(p, { type: "resizeSection", sectionId: id("Refrain", p).id, length: 4, shift: true });
  assert.deepEqual([id("Refrain", shorter).length, id("Couplet 2", shorter).start], [4, 12]);
  assert.deepEqual(shorter.arrangement.clips.map((c) => [c.start, c.length]).sort((a, b) => a[0] - b[0]), [[8, 4], [12, 8]]);
  // Without « décaler la suite »: only the section changes.
  const alone = reduce(p, { type: "resizeSection", sectionId: id("Refrain", p).id, length: 12, shift: false });
  assert.equal(id("Refrain", alone).length, 12);
  assert.equal(id("Couplet 2", alone).start, 16);
  assert.deepEqual(alone.arrangement.clips, p.arrangement.clips);
  assert.equal(reduce(p, { type: "resizeSection", sectionId: id("Refrain", p).id, length: 8, shift: true }), p, "same length: no change");
});

test("live take: one long pattern (not a loop) holding the notes as played, placed on a free lane", () => {
  let p = createEmptyProject("live");
  p = reduce(p, { type: "addInstrument", preset: "sampler" });
  const ins = p.instruments.at(-1)!;
  p = reduce(p, { type: "addClip", clip: { patternId: p.patterns[0].id, lane: 0, start: 0, length: 16 } });
  // 10 bars of a continuous piano: long notes, one crossing several bars.
  const notes = [{ pitch: 60, start: 0, length: 40, velocity: 90 }, { pitch: 64, start: 37.3, length: 3.2, velocity: 70 }, { pitch: 67, start: 150, length: 9, velocity: 100 }];
  const q = reduce(p, { type: "addLiveTake", instrumentId: ins.id, startBar: 2, bars: 10, notes, name: "Piano live 1", patternId: "pat_live" });
  const pat = q.patterns.find((x) => x.id === "pat_live")!;
  assert.equal(pat.stepCount, 256, "16 bars of room for a 10-bar take");
  assert.deepEqual(pat.notes[ins.id].map((n) => [n.pitch, n.start, n.length]), [[60, 0, 40], [64, 37.3, 3.2], [67, 150, 9]], "timing kept as played");
  const clip = q.arrangement.clips.find((c) => c.patternId === "pat_live")!;
  assert.deepEqual([clip.start, clip.length], [2, 10]);
  assert.equal(clip.lane, 1, "lane 0 is busy over those bars");
  // Saved and reloaded: long patterns survive.
  const back = parseProject(new TextEncoder().encode(projectToJson(q))).project;
  assert.equal(back.patterns.find((x) => x.id === "pat_live")!.stepCount, 256);
  assert.equal(reduce(p, { type: "addLiveTake", instrumentId: ins.id, startBar: 0, bars: 4, notes: [], name: "x" }), p, "no notes: nothing added");
});
