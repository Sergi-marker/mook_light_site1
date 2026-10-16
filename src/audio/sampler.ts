// Loading of the recorded instrument samples (assets/samples → dist/samples).
// Decoded once and shared by every audio context (real-time playback, offline export): an
// AudioBuffer can be played by any context, at any sample rate.

import { filesFor, type SampledInstrument } from "../core/sampleLibrary.ts";

const loaded = new Map<string, AudioBuffer>();
const pending = new Map<string, Promise<AudioBuffer | null>>();
const failed = new Set<string>();

function sampleUrl(file: string): string {
  const base = typeof document !== "undefined" ? document.baseURI : (globalThis as { location?: { href: string } }).location?.href ?? "";
  return new URL(`samples/${file.split("/").map(encodeURIComponent).join("/")}`, base).href;
}

/** Already decoded buffer, or null (not loaded yet / failed). */
export function loadedSample(file: string): AudioBuffer | null {
  return loaded.get(file) ?? null;
}

export function loadSample(ctx: BaseAudioContext, file: string): Promise<AudioBuffer | null> {
  const have = loaded.get(file);
  if (have) return Promise.resolve(have);
  if (failed.has(file)) return Promise.resolve(null);
  let p = pending.get(file);
  if (!p) {
    p = fetch(sampleUrl(file))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => {
        loaded.set(file, buf);
        return buf;
      })
      .catch((e: unknown) => {
        failed.add(file);
        console.warn(`Échantillon introuvable : ${file} (${(e as Error).message})`);
        return null;
      })
      .finally(() => pending.delete(file));
    pending.set(file, p);
  }
  return p;
}

/** Load the zones needed for `pitches` (or the whole instrument). Resolves when they are playable. */
export async function loadInstrument(ctx: BaseAudioContext, inst: SampledInstrument, pitches?: Iterable<number>): Promise<void> {
  await Promise.all(filesFor(inst, pitches).map((f) => loadSample(ctx, f)));
}

export function sampleCacheStats(): { loaded: number; failed: number; pending: number } {
  return { loaded: loaded.size, failed: failed.size, pending: pending.size };
}
