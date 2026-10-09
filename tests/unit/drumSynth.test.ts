import { test } from "node:test";
import assert from "node:assert/strict";
import { synthesizeDrum } from "../../src/core/drumSynth.ts";
import { INSTRUMENTS } from "../../src/core/constants.ts";

for (const rate of [44100, 48000]) {
  for (const { kind } of INSTRUMENTS) {
    test(`${kind} @ ${rate} Hz is finite, non-silent and never clips`, () => {
      const buf = synthesizeDrum(kind, rate);
      assert.ok(buf.length > rate * 0.05, "has a reasonable length");
      let peak = 0;
      let energy = 0;
      for (const v of buf) {
        assert.ok(Number.isFinite(v), "no NaN / Infinity");
        peak = Math.max(peak, Math.abs(v));
        energy += v * v;
      }
      assert.ok(peak <= 0.9 + 1e-6, `peak ${peak} ≤ 0.9`);
      assert.ok(peak > 0.5, "normalised");
      assert.ok(energy > 1, "not silent");
      assert.ok(Math.abs(buf[buf.length - 1]) < 1e-3, "ends at zero (no click)");
    });
  }
}

test("synthesis is deterministic", () => {
  assert.deepEqual(synthesizeDrum("snare", 44100), synthesizeDrum("snare", 44100));
});

test("808 is bass-heavy: low zero-crossing rate", () => {
  const buf = synthesizeDrum("808", 44100);
  let crossings = 0;
  for (let i = 1; i < 44100; i++) if (buf[i - 1] < 0 !== buf[i] < 0) crossings++;
  // C2 ≈ 65 Hz → ~130 crossings/s (plus the short pitch drop).
  assert.ok(crossings > 100 && crossings < 200, `crossings ${crossings}`);
});

test("closed hat is shorter than open hat", () => {
  assert.ok(synthesizeDrum("closedHat", 44100).length < synthesizeDrum("openHat", 44100).length);
});
