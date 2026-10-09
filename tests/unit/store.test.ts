import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectStore } from "../../src/core/store.ts";
import { createDefaultProject } from "../../src/core/project.ts";

function makeStore() {
  let clock = 0;
  const store = new ProjectStore(createDefaultProject("T", false), { now: () => clock, coalesceMs: 500 });
  const firstStep = () => store.getState().patterns[0].drums[store.getState().tracks[0].id][0];
  return { store, firstStep, advance: (ms: number) => (clock += ms) };
}

test("undo / redo restores previous states", () => {
  const { store, advance, firstStep } = makeStore();
  const id = store.getState().tracks[0].id;
  store.dispatch({ type: "toggleStep", trackId: id, step: 0 });
  advance(1000);
  store.dispatch({ type: "setBpm", bpm: 90 });
  assert.equal(store.getState().bpm, 90);
  store.undo();
  assert.equal(store.getState().bpm, 140);
  assert.equal(firstStep().on, true);
  store.undo();
  assert.equal(firstStep().on, false);
  assert.equal(store.canUndo(), false);
  store.redo();
  store.redo();
  assert.equal(store.getState().bpm, 90);
  assert.equal(store.canRedo(), false);
});

test("a new edit clears the redo stack", () => {
  const { store } = makeStore();
  store.dispatch({ type: "setBpm", bpm: 100 });
  store.undo();
  store.dispatch({ type: "setBpm", bpm: 120 });
  assert.equal(store.canRedo(), false);
});

test("coalesced edits make a single undo entry", () => {
  const { store, advance } = makeStore();
  for (const bpm of [141, 142, 143, 144]) {
    store.dispatch({ type: "setBpm", bpm }, { coalesceKey: "bpm" });
    advance(100);
  }
  assert.equal(store.getState().bpm, 144);
  store.undo();
  assert.equal(store.getState().bpm, 140);
  assert.equal(store.canUndo(), false);
});

test("edits after the coalesce window create new entries", () => {
  const { store, advance } = makeStore();
  store.dispatch({ type: "setBpm", bpm: 150 }, { coalesceKey: "bpm" });
  advance(2000);
  store.dispatch({ type: "setBpm", bpm: 160 }, { coalesceKey: "bpm" });
  store.undo();
  assert.equal(store.getState().bpm, 150);
});

test("no-op dispatch neither notifies nor dirties", () => {
  const { store } = makeStore();
  let calls = 0;
  store.subscribe(() => calls++);
  store.dispatch({ type: "setBpm", bpm: 140 });
  assert.equal(calls, 0);
  assert.equal(store.isDirty(), false);
  store.dispatch({ type: "setBpm", bpm: 141 });
  assert.equal(calls, 1);
  assert.equal(store.isDirty(), true);
  store.markSaved();
  assert.equal(store.isDirty(), false);
});

test("load replaces the project and clears history", () => {
  const { store } = makeStore();
  store.dispatch({ type: "setBpm", bpm: 99 });
  const other = createDefaultProject("Other");
  store.load(other);
  assert.equal(store.getState(), other);
  assert.equal(store.canUndo(), false);
  assert.equal(store.isDirty(), false);
});
