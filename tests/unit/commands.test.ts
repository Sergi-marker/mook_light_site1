import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMAND_EXAMPLES, interpretCommand } from "../../src/core/ai/commands.ts";
import { generateSong } from "../../src/core/ai/beat.ts";
import { parseBeatPrompt } from "../../src/core/ai/prompt.ts";
import { createDefaultProject, getChannel } from "../../src/core/project.ts";
import { reduce } from "../../src/core/reducer.ts";
import type { Project } from "../../src/core/types.ts";
import { inScale } from "../../src/core/music.ts";

const run = (p: Project, text: string) => {
  const r = interpretCommand(p, text);
  return { ...r, p: r.actions.reduce((acc, a) => reduce(acc, a), p) };
};
const song = () => {
  const p = createDefaultProject();
  return reduce(p, { type: "patchProject", patch: generateSong(p, parseBeatPrompt("trap", "trap-fr", p.key.root), 4).patch });
};

test("every example command is understood on a generated beat", () => {
  const p = song();
  for (const ex of COMMAND_EXAMPLES) {
    const r = run(p, ex);
    assert.deepEqual(r.notUnderstood, [], ex);
    assert.ok(r.actions.length > 0 && r.done.length > 0, ex);
  }
});

test("volume: « plus de basse » +3 dB on the 808, « moins de charleys » −3 dB on the hats", () => {
  const p = createDefaultProject();
  const b = p.instruments.find((i) => i.preset === "808")!;
  const hat = p.tracks.find((t) => t.instrument === "closedHat")!;
  const r = run(p, "plus de basse et moins de charleys");
  assert.ok(Math.abs(getChannel(r.p, b.id)!.volume / getChannel(p, b.id)!.volume - 10 ** (3 / 20)) < 0.01);
  assert.ok(Math.abs(getChannel(r.p, hat.id)!.volume / getChannel(p, hat.id)!.volume - 10 ** (-3 / 20)) < 0.01);
  assert.equal(r.done.length, 2);
});

test("sound change by role, by track name and by current sound", () => {
  let p = song();
  const melody = p.instruments.find((i) => i.name === "Melody")!;
  let r = run(p, "mets une flûte sur la mélodie");
  assert.equal(r.p.instruments.find((i) => i.id === melody.id)!.sample, "flute");
  // Default project: the track is literally named « Piano ».
  p = createDefaultProject();
  r = run(p, "change le piano en guitare");
  assert.equal(r.p.instruments.find((i) => i.name === "Piano")!.sample, "guitar-acoustic");
  r = run(p, "remplace le piano par une guitare espagnole");
  assert.equal(r.p.instruments.find((i) => i.name === "Piano")!.sample, "guitar-nylon");
  // Generated beat: the piano is the sound of the track named « Melody » or « Chords ».
  p = song();
  const pianoTrack = p.instruments.find((i) => i.preset === "sampler" && i.sample === "grand-piano");
  assert.ok(pianoTrack, "trap FR uses the real piano");
  {
    r = run(p, "change le piano en violoncelle");
    assert.equal(r.p.instruments.find((i) => i.id === pianoTrack.id)!.sample, "cello");
  }
});

test("tempo, swing, key (notes transposed and in scale), kit, mute, reverb, energy", () => {
  const p = song();
  let r = run(p, "tempo 128");
  assert.equal(r.p.bpm, 128);
  r = run(p, "un peu plus rapide");
  assert.equal(r.p.bpm, p.bpm + 5);
  r = run(p, "plus de swing");
  assert.ok(r.p.swing > p.swing);
  r = run(p, "passe en fa# mineur");
  assert.deepEqual(r.p.key, { root: 6, scale: "minor" });
  const before = p.patterns.flatMap((x) => Object.values(x.notes).flat()).length;
  const after = r.p.patterns.flatMap((x) => Object.values(x.notes).flat());
  assert.equal(after.length, before, "no note lost");
  const drums = new Set(r.p.instruments.filter((i) => i.preset === "808").map((i) => i.id));
  for (const pat of r.p.patterns) for (const [id, ns] of Object.entries(pat.notes)) if (!drums.has(id)) for (const n of ns) assert.ok(inScale(n.pitch, r.p.key), `note ${n.pitch} out of F# minor`);
  r = run(p, "passe en sol mineur");
  assert.deepEqual(r.p.key, { root: 7, scale: "minor" });
  r = run(p, "kit amapiano");
  assert.equal(r.p.tracks.find((t) => t.instrument === "closedHat")!.builtinSample, "shaker-down");
  r = run(p, "batterie plus réelle");
  assert.equal(r.p.tracks.find((t) => t.instrument === "snare")!.builtinSample, "snare-modern");
  const perc = p.tracks.find((t) => t.instrument === "perc")!;
  r = run(p, "coupe les percs");
  assert.equal(getChannel(r.p, perc.id)!.mute, true);
  const v = p.vocals[0];
  r = run(p, "plus de reverb sur la voix");
  assert.ok(getChannel(r.p, v.id)!.sends.reverb > getChannel(p, v.id)!.sends.reverb);
  r = run(p, "plus d'énergie");
  assert.ok(r.actions.length > 2);
});

test("several commands in one sentence; unknown parts are reported, not guessed", () => {
  const p = song();
  const r = run(p, "plus de basse, tempo 150 et fais-moi un café");
  assert.equal(r.p.bpm, 150);
  assert.equal(r.done.length, 2);
  assert.deepEqual(r.notUnderstood, ["fais-moi un cafe"]);
  assert.deepEqual(run(p, "bonjour").actions, []);
});

test("« change le piano en guitare » on a generated beat changes the track that PLAYS the piano, not the empty template « Piano » track", () => {
  const p = createDefaultProject();
  const q = reduce(p, { type: "patchProject", patch: generateSong(p, parseBeatPrompt("amapiano", "amapiano", p.key.root), 3).patch });
  const melody = q.instruments.find((i) => i.name === "Melody")!;
  assert.equal(melody.sample, "grand-piano");
  const r = run(q, "change le piano en guitare espagnole");
  assert.equal(r.p.instruments.find((i) => i.id === melody.id)!.sample, "guitar-nylon");
  assert.equal(r.p.instruments.find((i) => i.name === "Piano")!.sample, "grand-piano", "empty template track untouched");
});
