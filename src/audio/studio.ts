// Promise wrapper around the studio worker. Falls back to the main thread if workers are
// unavailable (the processing is identical, only slower to keep the UI responsive).

import { studioPitchCorrect, type AutoPitchParams } from "../core/dsp/autopitch.ts";
import { studioDenoise, type CleanLevel } from "../core/dsp/denoise.ts";
import { measure, type MixMeasurements } from "../core/dsp/loudness.ts";
import { analyzeVoice, recommendChain, type VoiceAnalysis, type VoiceRecommendation } from "../core/dsp/voiceAnalysis.ts";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./studioWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<Record<string, unknown> & { id: number; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data);
    };
    worker.onerror = () => {
      for (const p of pending.values()) p.reject(new Error("Studio processing failed."));
      pending.clear();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

function call(msg: Record<string, unknown>, transfer: Transferable[] = []): Promise<Record<string, unknown>> | null {
  const w = getWorker();
  if (!w) return null;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ ...msg, id }, transfer);
  });
}

/** STUDIO processing of a take: optional spectral clean, then optional PSOLA pitch correction. */
export async function processTake(data: Float32Array, sr: number, clean: CleanLevel, pitch: AutoPitchParams | null): Promise<Float32Array> {
  const copy = data.slice();
  const r = call({ op: "process", data: copy, sr, clean, pitch }, [copy.buffer]);
  if (r) return (await r).output as Float32Array;
  let d = data;
  if (clean !== "off") d = studioDenoise(d, sr, clean).output;
  if (pitch) d = studioPitchCorrect(d, sr, pitch).output;
  return d;
}

export async function analyzeTake(data: Float32Array, sr: number): Promise<{ analysis: VoiceAnalysis; recommendation: VoiceRecommendation }> {
  const copy = data.slice();
  const r = call({ op: "analyze", data: copy, sr }, [copy.buffer]);
  if (r) {
    const res = await r;
    return { analysis: res.analysis as VoiceAnalysis, recommendation: res.recommendation as VoiceRecommendation };
  }
  const analysis = analyzeVoice(data, sr);
  return { analysis, recommendation: recommendChain(analysis) };
}

export async function measureMix(channels: Float32Array[], sr: number): Promise<MixMeasurements> {
  const copies = channels.map((c) => c.slice());
  const r = call({ op: "measure", channels: copies, sr }, copies.map((c) => c.buffer));
  if (r) return (await r).measurements as MixMeasurements;
  return measure(channels, sr);
}
