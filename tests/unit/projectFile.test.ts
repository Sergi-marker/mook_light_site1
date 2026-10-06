import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProject, ProjectFileError, safeFileName, serializeProject, projectToJson } from "../../src/core/projectFile.ts";
import { createDefaultProject } from "../../src/core/project.ts";
import { reduce } from "../../src/core/reducer.ts";
import { encodeWav, decodeWav } from "../../src/core/io/wav.ts";
import { crc32, readZip, writeZip } from "../../src/core/io/zip.ts";

function richProject() {
  let p = createDefaultProject("Round Trip");
  p = reduce(p, { type: "setBpm", bpm: 87 });
  p = reduce(p, { type: "setKey", key: { root: 2, scale: "dorian" } });
  p = reduce(p, { type: "addPattern", name: "Chorus" });
  p = reduce(p, { type: "addNotes", trackId: p.instruments[0].id, notes: [{ pitch: 62, start: 1.5, length: 2, velocity: 77 }] });
  p = reduce(p, { type: "addNotes", trackId: p.instruments[1].id, notes: [{ pitch: 38, start: 4, length: 3, velocity: 110, slide: true }] });
  p = reduce(p, { type: "addClip", clip: { patternId: p.currentPatternId, lane: 1, start: 4, length: 8 } });
  p = reduce(p, { type: "addSection", section: { name: "Chorus", start: 4, length: 8, color: "#db2777" } });
  p = reduce(p, { type: "addEffect", channelId: p.tracks[0].id, effectType: "distortion" });
  p = reduce(p, { type: "updateChannel", channelId: p.vocals[0].id, patch: { volume: 1.1, sends: { reverb: 0.4 } } });
  p = reduce(p, { type: "addSample", sample: { id: "smp_1", name: "kick.wav", mime: "audio/wav" } });
  p = reduce(p, { type: "assignSample", trackId: p.tracks[0].id, sampleId: "smp_1" });
  const asset = { id: "aud_1", name: "Take 1", sampleRate: 48000, frames: 480, channels: 1 };
  p = reduce(p, { type: "addTake", trackId: p.vocals[0].id, take: { id: "tk1", name: "Take 1", assetId: "aud_1", startStep: 64, recordedAt: "2026-01-01T00:00:00Z" }, asset, clip: { takeId: "tk1", start: 64, offset: 0, duration: 0.01, gainDb: -2 } });
  p = reduce(p, { type: "setAutomation", lane: { id: "au1", channelId: p.vocals[0].id, param: "volume", points: [{ bar: 0, value: 0.5 }, { bar: 4, value: 1 }] } });
  p = reduce(p, { type: "setMidiMappings", mappings: [{ source: "cc:0:7", target: "master:volume" }] });
  return p;
}

test("v2 bundle round trip preserves everything (patterns, notes, mixer, arrangement, takes, samples)", () => {
  const p = richProject();
  const sample = new Uint8Array(5000).map((_, i) => (i * 7) & 0xff);
  const take = encodeWav({ sampleRate: 48000, channels: [new Float32Array(480).map((_, i) => Math.sin(i / 10) * 0.5)] }, 24);
  const bytes = serializeProject(p, { samples: new Map([["smp_1", sample]]), audio: new Map([["aud_1", take]]) });
  assert.equal(bytes[0], 0x50); // "PK": standard zip
  const r = parseProject(bytes);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.project, p);
  assert.deepEqual(r.samples.get("smp_1"), sample);
  assert.deepEqual(r.audio.get("aud_1"), take);
});

test("autosave JSON + external media also round-trips", () => {
  const p = richProject();
  const r = parseProject(projectToJson(p), { samples: new Map([["smp_1", new Uint8Array([1])]]), audio: new Map([["aud_1", new Uint8Array([1])]]) });
  assert.deepEqual(r.project, p);
});

test("a take whose audio is missing is dropped with a warning", () => {
  const p = richProject();
  const bytes = serializeProject(p, { samples: new Map([["smp_1", new Uint8Array([1])]]), audio: new Map() });
  const r = parseProject(bytes);
  assert.equal(r.project.vocals[0].takes.length, 0);
  assert.equal(r.project.vocals[0].clips.length, 0);
  assert.ok(r.warnings.some((w) => w.includes("audio missing")));
});

test("v1 projects (Phase 1 format) are migrated", () => {
  const v1 = JSON.stringify({
    format: "beatmaker-studio-project",
    version: 1,
    project: {
      name: "Old", bpm: 95, swing: 12, stepCount: 32, masterVolume: 0.9,
      tracks: [
        { id: "k", name: "Kick", instrument: "kick", volume: 1.2, pan: -0.3, mute: true, steps: [{ on: true, velocity: 99 }] },
        { id: "s", name: "Snare", instrument: "snare", sampleId: "smp", steps: [] },
      ],
      samples: [{ id: "smp", name: "s.wav", mime: "audio/wav" }],
    },
    sampleData: { smp: btoa("RIFF") },
  });
  const { project, samples, warnings } = parseProject(v1);
  assert.equal(project.bpm, 95);
  assert.equal(project.patterns[0].stepCount, 32);
  assert.equal(project.patterns[0].drums.k[0].velocity, 99);
  const k = project.channels.find((c) => c.id === "k")!;
  assert.deepEqual([k.volume, k.pan, k.mute], [1.2, -0.3, true]);
  assert.equal(project.channels.find((c) => c.id === "master")!.volume, 0.9);
  assert.equal(project.tracks[1].sampleId, "smp");
  assert.equal(new TextDecoder().decode(samples.get("smp")), "RIFF");
  assert.equal(project.instruments.length, 2, "v2 instruments added");
  assert.deepEqual(warnings, []);
});

test("rejects non-project / corrupted files with clear errors", () => {
  assert.throws(() => parseProject("not json"), ProjectFileError);
  assert.throws(() => parseProject("{}"), /not a Beatmaker Studio project/);
  assert.throws(() => parseProject(JSON.stringify({ format: "beatmaker-studio-project", version: 99, project: {} })), /newer version/);
  const bytes = serializeProject(createDefaultProject(), { samples: new Map(), audio: new Map() });
  bytes[60] ^= 0xff; // corrupt project.json
  assert.throws(() => parseProject(bytes), /damaged|CRC/);
});

test("repairs out-of-range values", () => {
  const p = createDefaultProject() as unknown as Record<string, unknown>;
  const bad = JSON.parse(projectToJson(p as never));
  bad.project.bpm = 900;
  bad.project.patterns[0].stepCount = 17;
  bad.project.channels[0].volume = 99;
  bad.project.arrangement.clips = [{ patternId: "missing", start: 0, length: 4 }];
  const r = parseProject(JSON.stringify(bad));
  assert.equal(r.project.bpm, 220);
  assert.equal(r.project.patterns[0].stepCount, 16);
  assert.equal(r.project.channels[0].volume, 1.5);
  assert.equal(r.project.arrangement.clips.length, 0);
});

test("WAV 16/24/32-float encode → decode", () => {
  const ch = [Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7) * 0.8), Float32Array.from({ length: 1000 }, (_, i) => Math.cos(i / 5) * 0.4)];
  for (const [bits, tol] of [[16, 2e-4], [24, 1e-6], [32, 0]] as const) {
    const d = decodeWav(encodeWav({ sampleRate: 44100, channels: ch }, bits, false));
    assert.equal(d.sampleRate, 44100);
    assert.equal(d.channels.length, 2);
    for (let c = 0; c < 2; c++) for (let i = 0; i < 1000; i++) assert.ok(Math.abs(d.channels[c][i] - ch[c][i]) <= tol + 1e-7, `${bits}-bit`);
  }
});

test("ZIP writer/reader and CRC32", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const z = writeZip([{ name: "a.txt", data: new TextEncoder().encode("hello") }, { name: "dir/b.bin", data: new Uint8Array([1, 2, 3]) }]);
  const r = readZip(z);
  assert.equal(new TextDecoder().decode(r.get("a.txt")), "hello");
  assert.deepEqual([...r.get("dir/b.bin")!], [1, 2, 3]);
});

test("safe file names", () => {
  assert.equal(safeFileName('My: Beat/2?'), "My_ Beat_2_");
  assert.equal(safeFileName("   "), "project");
});
