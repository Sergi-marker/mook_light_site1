import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, projectFromTemplate } from "../../src/core/templates.ts";
import { parseProject, serializeProject } from "../../src/core/projectFile.ts";

for (const t of TEMPLATES) {
  test(`template ${t.id} builds a valid project`, () => {
    const p = projectFromTemplate(t.id);
    assert.equal(p.bpm, t.bpm);
    assert.equal(p.swing, t.swing);
    for (const [kind, steps] of Object.entries(t.pattern)) {
      const track = p.tracks.find((x) => x.instrument === kind)!;
      assert.equal(p.patterns[0].drums[track.id].filter((s) => s.on).length, steps!.length, `${t.id}/${kind}`);
    }
    assert.deepEqual(parseProject(serializeProject(p, { samples: new Map(), audio: new Map() })).project, p);
  });
}

test("accents use velocity 127", () => {
  const p = projectFromTemplate("trap");
  const hat = p.patterns[0].drums[p.tracks.find((t) => t.instrument === "closedHat")!.id];
  assert.equal(hat[0].velocity, 127);
  assert.equal(hat[2].velocity, 100);
});

test("unknown template falls back to empty", () => {
  assert.ok(Object.values(projectFromTemplate("nope").patterns[0].drums).every((st) => st.every((s) => !s.on)));
});
