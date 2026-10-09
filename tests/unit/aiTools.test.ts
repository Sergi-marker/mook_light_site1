import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDrums } from "../../src/core/ai/drums.ts";
import { generateChords, progressionsFor } from "../../src/core/ai/melody.ts";
import { assignPatterns, buildStructure, patternEnergy, STRUCTURES } from "../../src/core/ai/structure.ts";
import { drumVariation, VARIATIONS } from "../../src/core/ai/variation.ts";
import { inScale } from "../../src/core/music.ts";
import { createEmptyProject, currentPattern, songLengthBars } from "../../src/core/project.ts";
import { reduce } from "../../src/core/reducer.ts";
import type { Project } from "../../src/core/types.ts";

function beat(): Project {
  let p = createEmptyProject("ai");
  const d = generateDrums({ genre: "trap", energy: 0.7, complexity: 0.5, swing: 0, stepCount: 16, seed: 3 });
  for (const t of p.tracks) p = reduce(p, { type: "setDrumSteps", trackId: t.id, steps: d[t.instrument] });
  return p;
}
const hits = (steps: { on: boolean }[]) => steps.filter((s) => s.on).length;

test("every drum variation returns full lanes and does what it says", () => {
  const p = beat();
  const pat = currentPattern(p);
  const lane = (k: string) => p.tracks.find((t) => t.instrument === k)!.id;
  for (const v of VARIATIONS) {
    const out = drumVariation(pat.drums, p.tracks, v.id, 16, 5);
    for (const t of p.tracks) assert.equal(out[t.id].length, 16, `${v.id}/${t.instrument}`);
  }
  const drop = drumVariation(pat.drums, p.tracks, "dropout", 16);
  assert.equal(hits(drop[lane("kick")]), 0);
  assert.equal(hits(drop[lane("snare")]), hits(pat.drums[lane("snare")]));
  const fill = drumVariation(pat.drums, p.tracks, "fill", 16);
  assert.equal(hits(fill[lane("snare")].slice(12)), 4, "snare roll on the last beat");
  assert.equal(hits(fill[lane("kick")].slice(12)), 0);
  const half = drumVariation(pat.drums, p.tracks, "halfTime", 16);
  assert.ok(half[lane("snare")][8].on && !half[lane("snare")][4].on && !half[lane("snare")][12].on);
  const sparse = drumVariation(pat.drums, p.tracks, "sparse", 16);
  assert.ok(hits(sparse[lane("closedHat")]) < hits(pat.drums[lane("closedHat")]));
  const busy = drumVariation(pat.drums, p.tracks, "busy", 16);
  assert.equal(hits(busy[lane("closedHat")]), 16);
  // Original untouched.
  assert.equal(hits(pat.drums[lane("kick")]) > 0, true);
});

test("structure maps patterns by name, then by energy; arrangement is contiguous", () => {
  let p = beat();
  p = reduce(p, { type: "renamePattern", patternId: p.patterns[0].id, name: "Couplet" });
  p = reduce(p, { type: "addPattern", name: "Refrain", copyFrom: p.patterns[0].id });
  p = reduce(p, { type: "addPattern", name: "Intro calme" });
  const map = assignPatterns(p.patterns);
  assert.equal(map.Verse.name, "Couplet");
  assert.equal(map.Chorus.name, "Refrain");
  assert.equal(map.Intro.name, "Intro calme");
  for (const st of STRUCTURES) {
    const { arrangement } = buildStructure(p, st.id);
    let bar = 0;
    for (const s of arrangement.sections) {
      assert.equal(s.start, bar);
      bar += s.length;
    }
    assert.equal(arrangement.clips.length, st.sections.length);
    const q = reduce(p, { type: "patchProject", patch: { arrangement } });
    assert.equal(songLengthBars(q), bar, st.id);
  }
});

test("energy: a busier pattern scores higher; unnamed patterns use energy", () => {
  const p = beat();
  const pat = currentPattern(p);
  const empty = { ...pat, drums: Object.fromEntries(Object.keys(pat.drums).map((k) => [k, pat.drums[k].map((s) => ({ ...s, on: false }))])) };
  assert.ok(patternEnergy(pat) > patternEnergy(empty));
  const map = assignPatterns([{ ...empty, id: "e", name: "A" }, { ...pat, id: "b", name: "B" }]);
  assert.equal(map.Chorus.id, "b");
  assert.equal(map.Intro.id, "e");
});

test("chord progressions: every listed progression yields in-key chords", () => {
  const key = { root: 5, scale: "minor" as const };
  for (const mood of ["dark", "sad", "happy", "chill"] as const)
    for (const prog of progressionsFor(mood)) {
      const notes = generateChords({ key, progression: prog, stepCount: 64, genre: "trap", seed: 1 });
      assert.equal(new Set(notes.map((n) => n.start)).size, 4);
      assert.ok(notes.every((n) => inScale(n.pitch, key)), `${mood} ${prog}`);
    }
});
