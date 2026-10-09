import { test } from "node:test";
import assert from "node:assert/strict";
import { CLIP_CEILING, CLIP_HEADROOM, CLIP_KNEE, softClip, softClipCurve } from "../../src/core/softClip.ts";

test("soft clip is transparent below the knee", () => {
  for (const x of [-0.8, -0.5, 0, 0.1, 0.79]) assert.equal(softClip(x), x);
});

test("soft clip never exceeds the ceiling, is monotonic and odd", () => {
  let prev = -Infinity;
  for (let x = -20; x <= 20; x += 0.001) {
    const y = softClip(x);
    assert.ok(Math.abs(y) < CLIP_CEILING + 1e-12);
    assert.ok(y >= prev - 1e-12, `monotonic at ${x}`);
    assert.ok(Math.abs(softClip(-x) + y) < 1e-12);
    prev = y;
  }
});

test("curve maps [-1,1] onto ±headroom", () => {
  const c = softClipCurve(8193);
  assert.equal(c[4096], 0);
  assert.ok(Math.abs(c[8192] - softClip(CLIP_HEADROOM)) < 1e-6);
  // Linear zone: shaper input 0.1 (= signal 0.4) → 0.4
  const i = Math.round(((0.1 + 1) / 2) * 8192);
  assert.ok(Math.abs(c[i] - 0.4) < 1e-3);
  assert.ok(CLIP_KNEE < CLIP_CEILING);
});
