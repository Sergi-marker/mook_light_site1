import { test } from "node:test";
import assert from "node:assert/strict";
import { StepScheduler } from "../../src/core/scheduler.ts";
import { stepDuration, swingOffset, patternDuration, semitonesToRate, velocityToGain } from "../../src/core/timing.ts";

function harness(timing = { bpm: 120, swing: 0, stepCount: 16 }) {
  let now = 0;
  const events: { step: number; time: number }[] = [];
  const s = new StepScheduler({
    now: () => now,
    getTiming: () => timing,
    onStep: (step, time) => events.push({ step, time }),
    lookahead: 0.1,
    setTimer: () => 1,
    clearTimer: () => {},
  });
  /** Advance the clock in 25 ms ticks, like the real timer. */
  const runUntil = (t: number) => {
    while (now < t - 1e-9) {
      now = Math.min(t, now + 0.025);
      s.tick();
    }
  };
  return { s, events, timing, runUntil, setNow: (t: number) => (now = t) };
}

test("timing math", () => {
  assert.equal(stepDuration(120), 0.125);
  assert.equal(stepDuration(60), 0.25);
  assert.equal(patternDuration(120, 16), 2);
  assert.equal(swingOffset(0, 120, 100), 0, "on-beat steps never swing");
  assert.equal(swingOffset(1, 120, 100), 0.0625, "100 % = half a step");
  assert.equal(swingOffset(3, 120, 50), 0.03125);
  assert.ok(Math.abs(semitonesToRate(12) - 2) < 1e-12);
  assert.ok(Math.abs(semitonesToRate(-12) - 0.5) < 1e-12);
  assert.equal(velocityToGain(127), 1);
  assert.equal(velocityToGain(0), 0);
  assert.ok(velocityToGain(64) < velocityToGain(100));
});

test("schedules exactly the steps inside the look-ahead window", () => {
  const { s, events, runUntil } = harness();
  s.start(0);
  // window [0, 0.1): only step 0 (0.125 is outside)
  assert.deepEqual(events.map((e) => e.step), [0]);
  runUntil(0.2); // window up to 0.3 → steps 1 (0.125) and 2 (0.25)
  assert.deepEqual(events.map((e) => e.step), [0, 1, 2]);
  assert.deepEqual(events.map((e) => e.time), [0, 0.125, 0.25]);
});

test("loops over the pattern and keeps sample-accurate times", () => {
  const { s, events, setNow, runUntil } = harness();
  setNow(1);
  s.start(1);
  runUntil(5.05);
  const steps = events.map((e) => e.step);
  assert.deepEqual(steps.slice(0, 18), [...Array(16).keys(), 0, 1]);
  events.forEach((e, i) => assert.ok(Math.abs(e.time - (1 + i * 0.125)) < 1e-9, `step ${i} time`));
  assert.equal(s.lateSteps, 0);
});

test("swing delays odd steps only", () => {
  const { s, events, runUntil } = harness({ bpm: 120, swing: 100, stepCount: 16 });
  s.start(0);
  runUntil(0.5);
  assert.equal(events[0].time, 0);
  assert.equal(events[1].time, 0.125 + 0.0625);
  assert.equal(events[2].time, 0.25);
});

test("BPM change applies on the next step", () => {
  const { s, events, runUntil, timing } = harness();
  s.start(0);
  timing.bpm = 60; // step = 0.25 s from now on
  runUntil(0.6);
  assert.deepEqual(events.map((e) => e.time), [0, 0.125, 0.375, 0.625].filter((t) => t < 0.7));
});

test("shrinking the pattern while playing wraps safely", () => {
  const { s, events, runUntil, timing } = harness({ bpm: 120, swing: 0, stepCount: 32 });
  s.start(0);
  runUntil(2.5); // up to step 20
  timing.stepCount = 16;
  runUntil(3);
  assert.ok(events.every((e) => e.step < 32));
  assert.ok(events.slice(-3).every((e) => e.step < 16));
  assert.equal(s.lateSteps, 0);
});

test("a stalled main thread skips late steps instead of bursting them", () => {
  const { s, events, setNow } = harness();
  s.start(0);
  setNow(5); // 5 s freeze
  s.tick();
  assert.ok(s.lateSteps > 30);
  // Only steps inside [now-10ms, now+lookahead) are played.
  assert.ok(events.slice(1).every((e) => e.time >= 4.99));
  assert.ok(events.length <= 3);
});

test("stop prevents further scheduling", () => {
  const { s, events, setNow } = harness();
  s.start(0);
  s.stop();
  setNow(1);
  s.tick();
  assert.equal(events.length, 1);
  assert.equal(s.isRunning, false);
});
