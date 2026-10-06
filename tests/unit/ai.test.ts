import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBeatPrompt } from "../../src/core/ai/prompt.ts";
import { generateDrums } from "../../src/core/ai/drums.ts";
import { generateMelody, generateChords, generateBass, chooseProgression } from "../../src/core/ai/melody.ts";
import { generateSong, melodyOptions } from "../../src/core/ai/beat.ts";
import { askAssistant } from "../../src/core/ai/assistant.ts";
import { analyzeMix } from "../../src/core/ai/mix.ts";
import { proposeMaster, refineLimiterGain } from "../../src/core/ai/master.ts";
import { compTakes, takeScores } from "../../src/core/ai/takeComp.ts";
import { inScale } from "../../src/core/music.ts";
import { createDefaultProject, currentPattern, songLengthBars } from "../../src/core/project.ts";
import { reduce } from "../../src/core/reducer.ts";
import { parseProject, projectToJson } from "../../src/core/projectFile.ts";

test("prompt: 'Dark trap beat, 140 BPM, F minor, melancholic, heavy 808.'", () => {
  const r = parseBeatPrompt("Dark trap beat, 140 BPM, F minor, melancholic, heavy 808.");
  assert.equal(r.genre, "trap");
  assert.equal(r.bpm, 140);
  assert.deepEqual(r.key, { root: 5, scale: "minor" });
  assert.equal(r.mood, "dark");
  assert.equal(r.heavy808, true);
});

test("prompt: French, other genres and keys", () => {
  const a = parseBeatPrompt("une prod drill sombre à 144 bpm en C# minor");
  assert.deepEqual([a.genre, a.bpm, a.key.root], ["drill", 144, 1]);
  const b = parseBeatPrompt("Afrobeat joyeux en la majeur");
  assert.deepEqual([b.genre, b.mood, b.key.root, b.key.scale], ["afrobeat", "happy", 9, "major"]);
  const c = parseBeatPrompt("boom bap 90s jazzy");
  assert.equal(c.genre, "boombap");
  assert.equal(c.bpm, 90);
  assert.equal(parseBeatPrompt("something").genre, "trap", "sensible default");
});

test("drum generator: backbone present, density follows energy, deterministic", () => {
  const lo = generateDrums({ genre: "trap", energy: 0.2, complexity: 0.3, stepCount: 64, seed: 1 });
  const hi = generateDrums({ genre: "trap", energy: 1, complexity: 0.9, stepCount: 64, seed: 1 });
  const count = (d: typeof lo) => Object.values(d).reduce((n, s) => n + s.filter((x) => x.on).length, 0);
  assert.ok(count(hi) > count(lo));
  for (let b = 0; b < 4; b++) {
    assert.ok(lo.kick[b * 16].on, "kick on the 1");
    assert.ok(lo.snare[b * 16 + 8].on, "snare on 3 (half-time trap)");
  }
  assert.deepEqual(generateDrums({ genre: "drill", energy: 0.7, complexity: 0.6, stepCount: 16, seed: 9 }), generateDrums({ genre: "drill", energy: 0.7, complexity: 0.6, stepCount: 16, seed: 9 }));
  assert.ok(hi.closedHat.some((s) => (s.roll ?? 1) > 1), "trap hats get rolls at high complexity");
});

test("melodies, chords and bass stay in key and inside the pattern", () => {
  for (const scale of ["minor", "major", "harmonicMinor", "pentaMinor"] as const) {
    const key = { root: 5, scale };
    const prog = chooseProgression("dark", 3);
    const mel = generateMelody({ key, genre: "trap", mood: "dark", complexity: 0.7, stepCount: 64, progression: prog, seed: 11 });
    assert.ok(mel.length >= 12);
    assert.ok(mel.every((n) => inScale(n.pitch, key)), `melody in ${scale}`);
    assert.ok(mel.every((n) => n.start >= 0 && n.start + n.length <= 64));
    const ch = generateChords({ key, progression: prog, stepCount: 64, genre: "trap", seed: 2 });
    assert.ok(ch.length >= 12);
    const bass = generateBass({ key, progression: prog, stepCount: 64, rhythm: generateDrums({ genre: "trap", energy: 0.7, complexity: 0.5, stepCount: 64, seed: 4 })["808"], genre: "trap", seed: 4, slides: true });
    assert.ok(bass.length > 3 && bass.every((n) => n.pitch >= 24 && n.pitch <= 60));
  }
});

test("melody options are different from each other", () => {
  const opts = melodyOptions({ key: { root: 5, scale: "minor" }, genre: "trap", mood: "dark", complexity: 0.6, stepCount: 64, seed: 5 });
  assert.equal(opts.length, 4);
  const sigs = new Set(opts.map((o) => o.notes.map((n) => `${n.pitch}@${n.start}`).join(",")));
  assert.equal(sigs.size, 4);
});

test("beat generator builds an editable song: instruments, patterns, arrangement", () => {
  const p0 = createDefaultProject();
  const req = parseBeatPrompt("Dark trap beat, 140 BPM, F minor, melancholic, heavy 808.");
  const { patch, summary } = generateSong(p0, req, 77);
  const p = reduce(p0, { type: "patchProject", patch });
  assert.equal(p.bpm, 140);
  assert.deepEqual(p.key, { root: 5, scale: "minor" });
  assert.ok(p.instruments.some((i) => i.name === "Melody") && p.instruments.some((i) => i.name === "Chords"));
  assert.ok(p.instruments.every((i) => p.channels.some((c) => c.id === i.id)), "every instrument has a channel");
  assert.equal(p.channels[p.channels.length - 1].id, "master");
  const chorus = p.patterns.find((x) => x.name === "Chorus")!;
  const b808 = p.instruments.find((i) => i.preset === "808")!;
  assert.ok(chorus.notes[b808.id].length > 0, "808 line in chorus");
  assert.ok(Object.values(chorus.drums).some((s) => s.some((x) => x.on)), "drums in chorus");
  assert.ok(p.arrangement.sections.map((s) => s.name).join(",").includes("Chorus"));
  assert.equal(songLengthBars(p), 72);
  assert.ok(b808.bass808.saturation >= 0.7, "heavy 808 applied");
  assert.ok(summary.length >= 3);
  // The generated project survives save/load.
  assert.deepEqual(parseProject(projectToJson(p)).project, p);
});

test("assistant: 'Mon refrain est trop vide.' → actions that add energy", () => {
  let p = createDefaultProject();
  const { patch } = generateSong(p, parseBeatPrompt("trap 140 bpm F minor"), 5);
  p = reduce(p, { type: "patchProject", patch });
  const a = askAssistant(p, "Mon refrain est trop vide.");
  assert.equal(a.topic, "chorus");
  assert.ok(a.suggestions[0].actions.length > 2);
  const chorusBefore = p.patterns.find((x) => x.name === "Chorus")!;
  const after = reduce(p, { type: "batch", actions: a.suggestions[0].actions });
  const chorusAfter = after.patterns.find((x) => x.name === "Chorus")!;
  const hits = (x: typeof chorusBefore) => Object.values(x.drums).reduce((n, s) => n + s.filter((y) => y.on).reduce((m, y) => m + (y.roll ?? 1), 0), 0);
  assert.ok(hits(chorusAfter) > hits(chorusBefore));
});

test("assistant: 808 vs melody fixes out-of-key 808 notes; key; verse 2; structure", () => {
  let p = createDefaultProject();
  const b808 = p.instruments[1].id;
  p = reduce(p, { type: "addNotes", trackId: p.instruments[0].id, notes: [{ pitch: 65, start: 0, length: 4, velocity: 90 }, { pitch: 68, start: 4, length: 4, velocity: 90 }, { pitch: 72, start: 8, length: 8, velocity: 90 }] });
  p = reduce(p, { type: "addNotes", trackId: b808, notes: [{ pitch: 30, start: 0, length: 8, velocity: 110 }] }); // F#1: out of F minor
  const a = askAssistant(p, "Ma 808 ne fonctionne pas avec ma mélodie.");
  assert.equal(a.topic, "808");
  const fixed = reduce(p, { type: "batch", actions: a.suggestions[0].actions });
  assert.ok(currentPattern(fixed).notes[b808].every((n) => inScale(n.pitch, p.key)));
  assert.equal(askAssistant(p, "Quelle tonalité correspond à cette mélodie ?").topic, "key");
  const v2 = askAssistant(p, "Je veux rendre le deuxième couplet plus énergique.");
  assert.equal(v2.topic, "verse2");
  const withV2 = reduce(p, { type: "batch", actions: v2.suggestions[0].actions });
  assert.ok(withV2.patterns.some((x) => / 2$/.test(x.name)));
  const s = askAssistant(p, "Propose-moi une structure de morceau.");
  assert.equal(s.topic, "structure");
  const arranged = reduce(p, { type: "batch", actions: s.suggestions[0].actions });
  assert.equal(songLengthBars(arranged), 72);
});

test("mix assistant detects quiet vocals, loud 808, clipping, imbalance", () => {
  const p = createDefaultProject();
  const bands = { sub: -6, low: -3.5, lowMid: -9, mid: -13, high: -19, air: -29 };
  const g = (lufs: number) => ({ lufs, peakDb: -3, bands });
  const s = analyzeMix(p, {
    mix: { integratedLufs: -12, shortTermMaxLufs: -10, loudnessRange: 5, truePeakDb: 0.5, samplePeakDb: 0.2, plr: 12, clippedSamples: 40, clippingPercent: 0.01, stereoBalance: 0.3, correlation: 0.8, rmsDb: -14, bands },
    drums: g(-16), bass808: g(-10), music: g(-18), vocals: g(-22),
  });
  const ids = s.map((x) => x.id);
  for (const id of ["clip", "vox-low", "808-loud", "balance"]) assert.ok(ids.includes(id), id);
  const vox = s.find((x) => x.id === "vox-low")!;
  const after = reduce(p, { type: "batch", actions: vox.actions });
  assert.ok(after.channels.find((c) => c.id === "bus_vocals")!.volume > p.channels.find((c) => c.id === "bus_vocals")!.volume);
});

test("master assistant: limiter gain targets LUFS, ceiling kept, refinement converges", () => {
  const bands = { sub: -6, low: -3.5, lowMid: -9, mid: -13, high: -19, air: -29 };
  const m = { integratedLufs: -20, shortTermMaxLufs: -17, loudnessRange: 6, truePeakDb: -6, samplePeakDb: -6, plr: 14, clippedSamples: 0, clippingPercent: 0, stereoBalance: 0, correlation: 0.9, rmsDb: -22 };
  const prop = proposeMaster(m, bands, "loud");
  const lim = prop.inserts.find((e) => e.type === "limiter")!;
  assert.equal(lim.params.ceilingDb, -1);
  assert.ok((lim.params.inputGainDb as number) > 8);
  assert.equal(refineLimiterGain(10, { ...m, integratedLufs: -11 }, "loud"), 11);
  assert.ok(refineLimiterGain(10, { ...m, integratedLufs: 5 }, "loud") >= 0, "never negative gain into the limiter");
});

test("take comp prefers the clean take over a clipped one, per bar", () => {
  const sr = 16000, bpm = 120, spb = 16; // 1 bar = 2 s
  const len = sr * 4;
  const voice = (clipBar: number) => Float32Array.from({ length: len }, (_, i) => {
    const t = i / sr;
    const x = 0.4 * Math.sin(2 * Math.PI * 220 * t) + 0.15 * Math.sin(2 * Math.PI * 440 * t);
    return Math.floor(t / 2) === clipBar ? Math.max(-1, Math.min(1, x * 4)) : x;
  });
  const seg = compTakes([
    { takeId: "A", startStep: 0, data: voice(0), sampleRate: sr },
    { takeId: "B", startStep: 0, data: voice(1), sampleRate: sr },
  ], bpm, spb);
  assert.equal(seg.length, 2);
  assert.equal(seg[0].best.takeId, "B", "bar 1: A is clipped");
  assert.equal(seg[1].best.takeId, "A", "bar 2: B is clipped");
  assert.ok(seg[0].best.score > seg[0].alternatives[0].score);
  const sc = takeScores(seg);
  assert.ok(sc.A > 0 && sc.B > 0);
});
