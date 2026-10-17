// Web Worker for heavy offline processing (STUDIO pitch, AI VOICE CLEAN, analyses), so the
// interface and the real-time audio thread never stall.

import { studioPitchCorrect, type AutoPitchParams } from "../core/dsp/autopitch.ts";
import { studioDenoise, type CleanLevel } from "../core/dsp/denoise.ts";
import { analyzeVoice, recommendChain } from "../core/dsp/voiceAnalysis.ts";
import { measure } from "../core/dsp/loudness.ts";
import { doubleVoice, harmonyVoice, type HarmonyKind } from "../core/dsp/harmony.ts";
import type { Key } from "../core/music.ts";

export type StudioRequest =
  | { id: number; op: "pitch"; data: Float32Array; sr: number; params: AutoPitchParams }
  | { id: number; op: "clean"; data: Float32Array; sr: number; level: Exclude<CleanLevel, "off"> }
  | { id: number; op: "process"; data: Float32Array; sr: number; clean: CleanLevel; pitch: AutoPitchParams | null; profile?: Float32Array | null }
  | { id: number; op: "analyze"; data: Float32Array; sr: number }
  | { id: number; op: "measure"; channels: Float32Array[]; sr: number }
  | { id: number; op: "layer"; data: Float32Array; sr: number; key: Key; kind: HarmonyKind | "double"; seed: number };

const scope = self as unknown as { onmessage: (e: MessageEvent<StudioRequest>) => void; postMessage: (m: unknown, t?: Transferable[]) => void };

scope.onmessage = (e) => {
  const r = e.data;
  try {
    switch (r.op) {
      case "pitch": {
        const { output } = studioPitchCorrect(r.data, r.sr, r.params);
        scope.postMessage({ id: r.id, output }, [output.buffer]);
        break;
      }
      case "clean": {
        const res = studioDenoise(r.data, r.sr, r.level);
        scope.postMessage({ id: r.id, output: res.output, reductionDb: res.reductionDb }, [res.output.buffer]);
        break;
      }
      case "process": {
        let data = r.data;
        if (r.clean !== "off") data = studioDenoise(data, r.sr, r.clean, true, r.profile).output;
        if (r.pitch) data = studioPitchCorrect(data, r.sr, r.pitch).output;
        scope.postMessage({ id: r.id, output: data }, [data.buffer]);
        break;
      }
      case "analyze": {
        const analysis = analyzeVoice(r.data, r.sr);
        scope.postMessage({ id: r.id, analysis, recommendation: recommendChain(analysis) });
        break;
      }
      case "layer": {
        const output = r.kind === "double" ? doubleVoice(r.data, r.sr, { seed: r.seed }) : harmonyVoice(r.data, r.sr, r.key, r.kind);
        scope.postMessage({ id: r.id, output }, [output.buffer]);
        break;
      }
      case "measure":
        scope.postMessage({ id: r.id, measurements: measure(r.channels, r.sr) });
        break;
    }
  } catch (err) {
    scope.postMessage({ id: r.id, error: (err as Error).message });
  }
};
