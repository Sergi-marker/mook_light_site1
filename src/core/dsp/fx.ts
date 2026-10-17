// TRANSITION FX, synthesised (no licence question): riser, downlifter, impact, reverse cymbal.
// Mono Float32Array at the given sample rate, peak ≈ −3 dBFS. Lengths are in seconds so they
// can be cut to the project's tempo (a riser usually lasts one or two bars).

let seed = 12345;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
};

function normalize(x: Float32Array, peakDb = -3): Float32Array {
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  const g = p > 0 ? 10 ** (peakDb / 20) / p : 1;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

/** State-variable band-pass whose centre frequency follows `freq(t)` (t in 0–1). */
function sweptNoise(sr: number, seconds: number, freq: (t: number) => number, q: number, amp: (t: number) => number): Float32Array {
  const n = Math.round(sr * seconds);
  const out = new Float32Array(n);
  let low = 0, band = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = 2 * Math.sin((Math.PI * Math.min(freq(t), sr * 0.45)) / sr);
    const x = rnd();
    low += f * band;
    const high = x - low - band / q;
    band += f * high;
    out[i] = band * amp(t);
  }
  return out;
}

/** Riser: noise sweeping up (250 Hz → 9 kHz) + a rising tone, growing louder until the drop. */
export function riser(sr: number, seconds: number): Float32Array {
  const n = Math.round(sr * seconds);
  const noise = sweptNoise(sr, seconds, (t) => 250 * Math.pow(36, t), 1.6, (t) => Math.pow(t, 1.8));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    ph += (2 * Math.PI * 180 * Math.pow(4, t)) / sr; // two octaves up
    noise[i] += Math.sin(ph) * 0.12 * Math.pow(t, 2.5);
  }
  // 8 ms fade at the very end: no click when the chorus hits.
  const f = Math.round(sr * 0.008);
  for (let i = 0; i < f; i++) noise[n - 1 - i] *= i / f;
  return normalize(noise);
}

/** Downlifter: noise sweeping down (8 kHz → 200 Hz) and fading out. */
export function downlifter(sr: number, seconds: number): Float32Array {
  const out = sweptNoise(sr, seconds, (t) => 8000 * Math.pow(1 / 40, t), 1.4, (t) => Math.min(1, t * 40) * Math.pow(1 - t, 1.5));
  return normalize(out, -5);
}

/** Impact: sub boom with a pitch drop + a bright noise splash. */
export function impact(sr: number, seconds = 2): Float32Array {
  const n = Math.round(sr * seconds);
  const out = new Float32Array(n);
  let ph = 0, hp = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (2 * Math.PI * (38 + 50 * Math.exp(-t / 0.08))) / sr;
    const boom = Math.sin(ph) * Math.exp(-t / 0.55);
    const w = rnd();
    hp = 0.92 * (hp + w - prev); // high-passed noise
    prev = w;
    out[i] = boom * 0.9 + hp * 0.35 * Math.exp(-t / 0.2);
  }
  return normalize(out, -2);
}

/** Reverse cymbal: a cymbal hit played backwards (from a recording when given), ending on the beat. */
export function reverseCymbal(sr: number, seconds: number, cymbal?: Float32Array): Float32Array {
  const n = Math.round(sr * seconds);
  let src = cymbal;
  if (!src || src.length < sr * 0.3) {
    // Synthetic cymbal: bright noise with a long decay.
    src = new Float32Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const w = rnd();
      src[i] = (w - prev) * Math.exp(-i / (sr * seconds * 0.35));
      prev = w;
    }
  }
  const out = new Float32Array(n);
  const len = Math.min(n, src.length);
  for (let i = 0; i < len; i++) out[n - len + i] = src[len - 1 - i];
  const f = Math.round(sr * 0.006);
  for (let i = 0; i < f; i++) out[n - 1 - i] *= i / f;
  return normalize(out, -4);
}
