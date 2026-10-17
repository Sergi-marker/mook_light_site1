import { test } from "node:test";
import assert from "node:assert/strict";
import { downlifter, impact, reverseCymbal, riser } from "../../src/core/dsp/fx.ts";
import { dropAutomation, isDropLane, planTransitions } from "../../src/core/ai/transitions.ts";
import { generateSong } from "../../src/core/ai/beat.ts";
import { parseBeatPrompt } from "../../src/core/ai/prompt.ts";
import { createDefaultProject, BUS_DRUMS } from "../../src/core/project.ts";
import { reduce } from "../../src/core/reducer.ts";
import { valueAt } from "../../src/audio/sequencer.ts";
import { fft } from "../../src/core/dsp/fft.ts";

const SR = 44100;
/** RMS, spectral centroid and share of energy below 200 Hz of a 2048-sample window starting at `at` (0–1 of the length). */
function look(x: Float32Array, at: number) {
  const n = 2048, a = Math.min(x.length - n, Math.floor(at * x.length));
  const re = new Float64Array(n), im = new Float64Array(n);
  let e = 0;
  for (let i = 0; i < n; i++) { re[i] = x[a + i]; e += x[a + i] ** 2; }
  fft(re, im);
  let num = 0, den = 0, low = 0, pow = 0;
  for (let k = 1; k < n / 2; k++) {
    const m = Math.hypot(re[k], im[k]);
    num += ((k * SR) / n) * m; den += m;
    pow += m * m; if ((k * SR) / n < 200) low += m * m;
  }
  return { rms: Math.sqrt(e / n), centroid: num / den, low: low / pow };
}

test("FX sounds: riser rises (louder, brighter), downlifter falls, impact is a low boom, reverse cymbal ends loud", () => {
  const r = riser(SR, 2);
  assert.ok(look(r, 0.9).rms > look(r, 0.2).rms * 4 && look(r, 0.9).centroid > look(r, 0.2).centroid * 2, "riser");
  assert.ok(Math.max(...r.map(Math.abs)) <= 0.71 && Math.abs(r[r.length - 1]) < 0.01, "peak −3 dBFS, no click at the end");
  const d = downlifter(SR, 2);
  assert.ok(look(d, 0.1).centroid > look(d, 0.7).centroid * 2 && look(d, 0.1).rms > look(d, 0.8).rms, "downlifter");
  const i = impact(SR, 2);
  assert.ok(look(i, 0.0).rms > look(i, 0.8).rms * 5 && look(i, 0.05).low > 0.6, "impact");
  const c = reverseCymbal(SR, 1);
  assert.ok(look(c, 0.9).rms > look(c, 0.1).rms * 3, "reverse cymbal grows to the beat");
});

test("transition plan: riser + impact on every chorus, downlifter after, reverse cymbal into verses / bridge", () => {
  const p0 = createDefaultProject();
  const p = reduce(p0, { type: "patchProject", patch: generateSong(p0, parseBeatPrompt("trap", "trap", p0.key.root), 2).patch });
  const plan = planTransitions(p);
  const spb = 16;
  const choruses = p.arrangement.sections.filter((s) => /chorus|hook/i.test(s.name) && s.start > 0);
  assert.ok(choruses.length >= 2);
  for (const c of choruses) {
    const rise = plan.find((f) => f.kind === "riser" && f.section === c.name && Math.abs(f.start + 2 * spb - c.start * spb) < 1e-9);
    assert.ok(rise, `riser before ${c.name}@${c.start}`);
    assert.ok(plan.some((f) => f.kind === "impact" && f.start === c.start * spb), "impact on the downbeat");
  }
  assert.ok(plan.some((f) => f.kind === "downlifter") && plan.some((f) => f.kind === "reverseCymbal"));
  assert.ok(plan.every((f) => f.start >= 0));
});

test("drop: drums and 808 silent only during the last beat before each chorus; user automation untouched", () => {
  const p0 = createDefaultProject();
  const p = reduce(p0, { type: "patchProject", patch: generateSong(p0, parseBeatPrompt("trap", "trap", p0.key.root), 2).patch });
  const lanes = dropAutomation(p);
  const drums = lanes.find((l) => l.channelId === BUS_DRUMS)!;
  assert.ok(drums && isDropLane(drums));
  const c = p.arrangement.sections.find((s) => /chorus|hook/i.test(s.name) && s.start > 0)!;
  assert.equal(valueAt(drums.points, c.start - 0.5), drums.points[0].value, "half a bar before: normal");
  assert.equal(valueAt(drums.points, c.start - 0.2), 0, "last beat: cut");
  assert.equal(valueAt(drums.points, c.start + 0.01), drums.points[0].value, "chorus: back");
  // A user lane on the drums bus is never replaced.
  const withUser = reduce(p, { type: "setAutomation", lane: { id: "auto_user", channelId: BUS_DRUMS, param: "volume", points: [{ bar: 0, value: 0.5 }] } });
  assert.ok(!dropAutomation(withUser).some((l) => l.channelId === BUS_DRUMS));
});

test("conversation and producer tool ask for transitions; the FX track stays in the instrumental", async () => {
  const { converse } = await import("../../src/core/ai/dialog.ts");
  const { runProducerTool } = await import("../../src/core/ai/producerTools.ts");
  const { exportGroups } = await import("../../src/audio/render.ts");
  const p0 = createDefaultProject();
  const p = reduce(p0, { type: "patchProject", patch: generateSong(p0, parseBeatPrompt("trap", "trap", p0.key.root), 2).patch });
  assert.deepEqual(converse(p, "ajoute des transitions avant les refrains", {}).reply.transitions, { drops: true });
  assert.deepEqual(converse(p, "des risers mais sans coupure", {}).reply.transitions, { drops: false });
  assert.equal(converse(p, "c'est quoi un riser ?", {}).reply.transitions, undefined, "a question is not an order");
  assert.equal(converse(p0, "ajoute des transitions", {}).reply.transitions, undefined, "no sections yet → explains");
  assert.deepEqual(runProducerTool(p, "add_transitions", { drops: false }).transitions, { drops: false });
  assert.ok(runProducerTool(p0, "add_transitions", {}).isError);
  const withFx = reduce(p, { type: "addVocalTrack", role: "fx", id: "vox_fx" });
  const fx = withFx.vocals.find((v) => v.role === "fx")!;
  const g = exportGroups(withFx);
  assert.ok(!g.instrumental.has(fx.id) && g.vocalsOnly.has(fx.id), "FX muted only in the a cappella");
});
