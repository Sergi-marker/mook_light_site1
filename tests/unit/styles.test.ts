import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSong } from "../../src/core/ai/beat.ts";
import { generateDrums } from "../../src/core/ai/drums.ts";
import { parseBeatPrompt } from "../../src/core/ai/prompt.ts";
import { detectStyle, parseGrid, STYLES } from "../../src/core/ai/styles.ts";
import { inScale } from "../../src/core/music.ts";
import { createEmptyProject, songLengthBars } from "../../src/core/project.ts";
import { reduce } from "../../src/core/reducer.ts";
import { SOUND_LIBRARY } from "../../src/core/soundLibrary.ts";

test("catalog: ~30 styles, valid grids, known sounds, sane tempos", () => {
  assert.ok(STYLES.length >= 28, `${STYLES.length} styles`);
  const ids = new Set<string>();
  for (const s of STYLES) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`);
    ids.add(s.id);
    for (const [lane, g] of Object.entries(s.drums)) assert.equal(g!.length, 16, `${s.id}/${lane} grid length`);
    if (s.bassGrid) assert.equal(s.bassGrid.length, 16);
    for (const g of s.melody.rhythms ?? []) assert.equal(g.length, 16, `${s.id} melody rhythm`);
    for (const snd of Object.values(s.sounds)) assert.ok(SOUND_LIBRARY.some((x) => x.id === snd), `${s.id}: unknown sound ${snd}`);
    assert.ok(s.bpm[0] <= s.bpm[1] && s.bpm[1] <= s.bpm[2] && s.bpm[0] >= 40 && s.bpm[2] <= 220, s.id);
    assert.ok(s.progressions.length > 0 && s.progressions.every((p) => p.length === 4));
  }
  assert.deepEqual(parseGrid("Xxo-."), [1, 0.8, 0.5, 0.25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test("prompt understands sub-genres in French and English", () => {
  const cases: [string, string][] = [
    ["un son mumble rap triste", "mumble"],
    ["love drill pour ma copine", "love-drill"],
    ["drill love romantique", "love-drill"],
    ["UK drill dark", "uk-drill"],
    ["Pop Smoke type beat", "ny-drill"],
    ["drill française façon Gazo", "drill-fr"],
    ["une prod drill", "uk-drill"],
    ["rage beat comme Playboi Carti", "rage"],
    ["plugg beat", "plugg"],
    ["pluggnb chill", "pluggnb"],
    ["drift phonk pour un edit", "drift-phonk"],
    ["phonk memphis", "phonk"],
    ["amapiano log drum", "amapiano"],
    ["afro trap à la MHD", "afro-trap"],
    ["afrobeat joyeux", "afrobeats"],
    ["trap soul à la Bryson Tiller", "trap-soul"],
    ["jersey club", "jersey"],
    ["emo rap guitare", "emo"],
    ["reggaeton", "reggaeton"],
    ["hyperpop", "hyperpop"],
    ["trap", "trap"],
  ];
  for (const [text, id] of cases) assert.equal(detectStyle(text)?.id, id, text);
  const r = parseBeatPrompt("love drill, Bb minor");
  assert.equal(r.style, "love-drill");
  assert.equal(r.mood, "romantic");
  assert.equal(r.bpm, 142);
  assert.deepEqual(r.key, { root: 10, scale: "minor" });
  // The style picked in the UI is used when the text names none.
  assert.equal(parseBeatPrompt("140 BPM, sad", "plugg").style, "plugg");
});

test("every style generates a full, in-key, editable song with its own sounds", () => {
  for (const s of STYLES) {
    let p = createEmptyProject("s");
    const req = parseBeatPrompt(`${s.label}`, s.id);
    const song = generateSong(p, { ...req, style: s.id }, 7);
    p = reduce(p, { type: "patchProject", patch: song.patch });
    assert.ok(songLengthBars(p) >= 40, `${s.id} length ${songLengthBars(p)}`);
    const lead = p.instruments.find((i) => i.name === "Melody")!;
    const leadSound = SOUND_LIBRARY.find((x) => x.id === s.sounds.lead)!;
    assert.equal(lead.preset, leadSound.preset, `${s.id} lead preset`);
    const chorus = p.patterns.find((x) => x.name === "Chorus")!;
    const notes = Object.values(chorus.notes).flat();
    assert.ok(notes.length > 10, `${s.id}: ${notes.length} notes`);
    const melodic = chorus.notes[lead.id];
    assert.ok(melodic.length >= 4, `${s.id} melody`);
    assert.ok(melodic.every((n) => inScale(n.pitch, p.key)), `${s.id} melody in key`);
    const kick = p.tracks.find((t) => t.instrument === "kick")!;
    assert.ok(chorus.drums[kick.id].some((x) => x.on), `${s.id} kick`);
  }
});

test("styles really differ: amapiano 4/4 kick, drill triplet rolls, rage 8th hats", () => {
  const ama = generateDrums({ genre: "afrobeat", style: STYLES.find((s) => s.id === "amapiano"), energy: 0.7, complexity: 0.5, stepCount: 16, seed: 1 });
  assert.deepEqual([0, 4, 8, 12].map((i) => ama.kick[i].on), [true, true, true, true]);
  const drill = generateDrums({ genre: "drill", style: STYLES.find((s) => s.id === "ny-drill"), energy: 0.9, complexity: 0.9, stepCount: 64, seed: 3 });
  const rolls = drill.closedHat.filter((x) => x.roll && x.roll > 1);
  assert.ok(rolls.length > 0 && rolls.filter((x) => x.roll === 3).length >= rolls.length / 2, "drill rolls are mostly triplets");
  const rage = generateDrums({ genre: "trap", style: STYLES.find((s) => s.id === "rage"), energy: 0.5, complexity: 0.3, stepCount: 16, seed: 2 });
  // Straight 8ths: every even 16th has a closed or (choking) open hat.
  assert.ok([0, 2, 4, 6, 8, 10, 12, 14].every((i) => rage.closedHat[i].on || rage.openHat[i].on));
});

test("the 3 versions really differ (lead sound and/or progression); no key in the text → project root", () => {
  const p = createEmptyProject("v");
  const req = parseBeatPrompt("triste", "mumble", 5);
  assert.equal(req.key.root, 5, "project root kept");
  const sig = (i: number) => {
    const song = generateSong(p, req, 11, i);
    const lead = song.patch.instruments!.find((x) => x.name === "Melody")!;
    return JSON.stringify([lead.synth, song.summary[2]]);
  };
  const all = new Set([sig(0), sig(1), sig(2)]);
  assert.equal(all.size, 3);
});
