// Zero-latency master safety stage. A DynamicsCompressorNode was tried first, but in
// Chromium it adds a fixed 6 ms look-ahead delay and still overshoots on fast drum
// transients (measured peak 1.31). A static soft-clip curve has no delay and a hard ceiling.

/** Below this level the curve is perfectly linear (≈ -1.9 dBFS). */
export const CLIP_KNEE = 0.8;
/** The output can never exceed this level (≈ -0.18 dBFS). */
export const CLIP_CEILING = 0.98;
/** The WaveShaper input range [-1, 1] maps to [-HEADROOM, HEADROOM] of signal (+12 dB). */
export const CLIP_HEADROOM = 4;

export function softClip(x: number): number {
  const a = Math.abs(x);
  if (a <= CLIP_KNEE) return x;
  const range = CLIP_CEILING - CLIP_KNEE;
  return Math.sign(x) * (CLIP_KNEE + range * Math.tanh((a - CLIP_KNEE) / range));
}

/** WaveShaper curve; feed the shaper with signal × (1 / CLIP_HEADROOM). */
export function softClipCurve(points = 8193): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const u = (i / (points - 1)) * 2 - 1;
    curve[i] = softClip(u * CLIP_HEADROOM);
  }
  return curve;
}
