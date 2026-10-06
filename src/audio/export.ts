// Export: renders the song offline and encodes real audio files.
//  • WAV 16-bit (TPDF dither) / 24-bit / 32-bit float — built in.
//  • MP3 — encoded with LAME (lamejs). The encoder ships in dist/vendor/lame.min.js when the
//    `lamejs` package is installed (npm install); otherwise MP3 export reports it clearly.

import { encodeWav, type WavBitDepth } from "../core/io/wav.ts";
import { writeZip } from "../core/io/zip.ts";
import { measure, type MixMeasurements } from "../core/dsp/loudness.ts";
import { safeFileName } from "../core/projectFile.ts";
import type { Project } from "../core/types.ts";
import { bufferChannels, exportGroups, renderProject, type RenderMedia } from "./render.ts";
import { songEndStep } from "./sequencer.ts";

export type ExportVariant = "master" | "instrumental" | "vocals" | "stems";
export type ExportFormat = "wav" | "mp3";

export interface ExportOptions {
  variant: ExportVariant;
  format: ExportFormat;
  bitDepth: WavBitDepth;
  sampleRate: 44100 | 48000;
  mp3Kbps?: 128 | 192 | 256 | 320;
  onProgress?: (label: string, fraction: number) => void;
}

export interface ExportedFile {
  name: string;
  bytes: Uint8Array;
  mime: string;
}

export interface ExportResult {
  files: ExportedFile[];
  /** Measurements of the main rendered file (master / instrumental / vocals). */
  measurements: MixMeasurements | null;
}

interface LameEncoder {
  encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array | Uint8Array;
  flush(): Int8Array | Uint8Array;
}
interface LameGlobal {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => LameEncoder;
}

let lamePromise: Promise<LameGlobal | null> | null = null;

/** Load the bundled LAME encoder (dist/vendor/lame.min.js). Resolves null if absent. */
export function loadMp3Encoder(): Promise<LameGlobal | null> {
  const w = globalThis as unknown as { lamejs?: LameGlobal };
  if (w.lamejs) return Promise.resolve(w.lamejs);
  if (lamePromise) return lamePromise;
  lamePromise = new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const s = document.createElement("script");
    s.src = new URL("../../vendor/lame.min.js", import.meta.url).href;
    s.onload = () => resolve(w.lamejs ?? null);
    s.onerror = () => resolve(null);
    document.head.append(s);
  });
  return lamePromise;
}

export async function mp3Available(): Promise<boolean> {
  return (await loadMp3Encoder()) !== null;
}

function toInt16(x: Float32Array): Int16Array {
  const out = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767)));
  return out;
}

export async function encodeMp3(channels: Float32Array[], sampleRate: number, kbps = 320): Promise<Uint8Array> {
  const lame = await loadMp3Encoder();
  if (!lame) throw new Error("Export failed: the MP3 encoder (lamejs) is not installed. Run `npm install` to add it, or export WAV.");
  const enc = new lame.Mp3Encoder(channels.length, sampleRate, kbps);
  const L = toInt16(channels[0]);
  const R = channels[1] ? toInt16(channels[1]) : undefined;
  const parts: Uint8Array[] = [];
  const block = 1152;
  for (let i = 0; i < L.length; i += block) {
    const chunk = enc.encodeBuffer(L.subarray(i, i + block), R?.subarray(i, i + block));
    if (chunk.length) parts.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length));
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end.buffer, end.byteOffset, end.length));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function encode(channels: Float32Array[], sr: number, o: ExportOptions): Promise<{ bytes: Uint8Array; ext: string; mime: string }> {
  if (o.format === "mp3") return { bytes: await encodeMp3(channels, sr, o.mp3Kbps ?? 320), ext: "mp3", mime: "audio/mpeg" };
  return { bytes: encodeWav({ sampleRate: sr, channels }, o.bitDepth), ext: "wav", mime: "audio/wav" };
}

/** Trim trailing silence (keeps tails of reverb/delay down to -90 dBFS). */
function trimTail(channels: Float32Array[], sr: number): Float32Array[] {
  let last = 0;
  for (const c of channels) for (let i = c.length - 1; i > last; i--) if (Math.abs(c[i]) > 3e-5) { last = i; break; }
  const end = Math.min(channels[0].length, last + Math.floor(sr * 0.1));
  return channels.map((c) => c.slice(0, Math.max(end, 1)));
}

export async function exportProject(p: Project, media: RenderMedia, o: ExportOptions): Promise<ExportResult> {
  if (o.format === "mp3" && !(await mp3Available())) {
    throw new Error("Export failed: the MP3 encoder (lamejs) is not installed. Run `npm install` to add it, or export WAV.");
  }
  const base = safeFileName(p.name);
  const groups = exportGroups(p);
  const render = async (muted: Set<string> | undefined, label: string) => {
    // No arrangement yet: export the current pattern looped 4 times.
    const song = songEndStep(p) > 0;
    const buf = await renderProject(p, media, { mode: song ? "song" : "pattern", loops: 4, sampleRate: o.sampleRate, muted, tail: 4, onProgress: (f) => o.onProgress?.(label, f) });
    return trimTail(bufferChannels(buf), o.sampleRate);
  };
  if (o.variant !== "stems") {
    const muted = o.variant === "instrumental" ? groups.instrumental : o.variant === "vocals" ? groups.vocalsOnly : undefined;
    const label = { master: "Master", instrumental: "Instrumental", vocals: "Vocals" }[o.variant];
    const ch = await render(muted, label);
    const m = measure(ch, o.sampleRate);
    const enc = await encode(ch, o.sampleRate, o);
    return { files: [{ name: `${base} - ${label}.${enc.ext}`, bytes: enc.bytes, mime: enc.mime }], measurements: m };
  }
  // Stems: one file per source track (with its own reverb/delay sends), zipped together.
  const sources = [
    ...p.tracks.map((t) => ({ id: t.id, name: `Drums - ${t.name}` })),
    ...p.instruments.map((i) => ({ id: i.id, name: i.name })),
    ...p.vocals.filter((v) => v.clips.length).map((v) => ({ id: v.id, name: `Vocals - ${v.name}` })),
  ].filter((s) => hasContent(p, s.id));
  const entries: { name: string; data: Uint8Array }[] = [];
  for (const s of sources) {
    const ch = await render(groups.stem(s.id), s.name);
    const enc = await encode(ch, o.sampleRate, o);
    entries.push({ name: `${safeFileName(s.name)}.${enc.ext}`, data: enc.bytes });
  }
  return { files: [{ name: `${base} - Stems.zip`, bytes: writeZip(entries), mime: "application/zip" }], measurements: null };
}

/** Does a source play anything in the song? (avoids exporting silent stems) */
function hasContent(p: Project, id: string): boolean {
  const used = new Set(p.arrangement.clips.map((c) => c.patternId));
  if (!used.size) used.add(p.currentPatternId);
  const pats = p.patterns.filter((x) => used.has(x.id));
  if (p.tracks.some((t) => t.id === id)) return pats.some((x) => x.drums[id]?.some((s) => s.on));
  if (p.instruments.some((i) => i.id === id)) return pats.some((x) => (x.notes[id]?.length ?? 0) > 0);
  return p.vocals.some((v) => v.id === id && v.clips.length > 0);
}
