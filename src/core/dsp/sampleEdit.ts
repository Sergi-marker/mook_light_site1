// Non-destructive sample editing: trim, reverse, fades, gain. (Loop is applied at playback.)

import type { SampleEdit } from "../types.ts";

export function applySampleEdit(channels: Float32Array[], sr: number, e: SampleEdit): Float32Array<ArrayBuffer>[] {
  const len = channels[0].length;
  const a = Math.floor(Math.min(e.start, e.end) * len);
  const b = Math.max(a + 1, Math.floor(Math.max(e.start, e.end) * len));
  const g = Math.pow(10, e.gainDb / 20);
  const fi = Math.min(b - a, Math.floor(e.fadeIn * sr));
  const fo = Math.min(b - a, Math.floor(e.fadeOut * sr));
  return channels.map((ch) => {
    const out = new Float32Array(b - a);
    for (let i = 0; i < out.length; i++) out[i] = ch[e.reverse ? b - 1 - i : a + i] * g;
    for (let i = 0; i < fi; i++) out[i] *= i / fi;
    for (let i = 0; i < fo; i++) out[out.length - 1 - i] *= i / fo;
    return out;
  });
}

export function sampleEditKey(e: SampleEdit): string {
  return `${e.start}|${e.end}|${e.reverse}|${e.fadeIn}|${e.fadeOut}|${e.gainDb}`;
}
