// AudioWorklet processors (run on the real-time audio thread).
// All DSP comes from src/core/dsp and is unit-tested outside the browser.

import { Compressor, DeEsser, Gate, Leveler, Limiter, dbToGain } from "../../core/dsp/dynamics.ts";
import { LiveDenoiser } from "../../core/dsp/denoise.ts";
import { LivePitchCorrector, type AutoPitchParams } from "../../core/dsp/autopitch.ts";

type Params = Record<string, number | string | boolean>;
const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Shared DSP-load accounting: each processor adds the ms it spent; reported once per second. */
let loadMs = 0;
let loadWindowStart = 0;

interface Dsp {
  /** Process one block in place on every channel. */
  run(chans: Float32Array[], outs: Float32Array[]): void;
  set(p: Params): void;
  meter(): Record<string, number>;
}

function makeDsp(kind: string, sr: number, p: Params): Dsp {
  switch (kind) {
    case "compressor": {
      const toP = (q: Params) => ({ thresholdDb: n(q.thresholdDb, -18), ratio: n(q.ratio, 3), attackMs: n(q.attackMs, 10), releaseMs: n(q.releaseMs, 120), kneeDb: n(q.kneeDb, 6), makeupDb: n(q.makeupDb, 0) });
      const c = new Compressor(sr, toP(p));
      return {
        run(ins, outs) {
          const len = ins[0].length;
          for (let i = 0; i < len; i++) {
            let d = 0;
            for (const ch of ins) d = Math.max(d, Math.abs(ch[i]));
            const g = c.gainFor(d);
            for (let k = 0; k < outs.length; k++) outs[k][i] = (ins[k] ?? ins[0])[i] * g;
          }
        },
        set: (q) => c.set(toP(q)),
        meter: () => ({ gr: c.reduction }),
      };
    }
    case "gate": {
      const toP = (q: Params) => ({ thresholdDb: n(q.thresholdDb, -50), rangeDb: n(q.rangeDb, 30), attackMs: n(q.attackMs, 1), holdMs: n(q.holdMs, 40), releaseMs: n(q.releaseMs, 120) });
      const g = new Gate(sr, toP(p));
      let last = 1;
      return {
        run(ins, outs) {
          for (let i = 0; i < ins[0].length; i++) {
            let d = 0;
            for (const ch of ins) d = Math.max(d, Math.abs(ch[i]));
            last = g.gainFor(d);
            for (let k = 0; k < outs.length; k++) outs[k][i] = (ins[k] ?? ins[0])[i] * last;
          }
        },
        set: (q) => { g.p = toP(q); },
        meter: () => ({ gr: -20 * Math.log10(last + 1e-9) }),
      };
    }
    case "limiter": {
      const l = new Limiter(sr, n(p.ceilingDb, -1), n(p.releaseMs, 80));
      let inGain = dbToGain(n(p.inputGainDb, 0));
      return {
        run(ins, outs) {
          for (let i = 0; i < ins[0].length; i++) {
            let d = 0;
            for (const ch of ins) d = Math.max(d, Math.abs(ch[i] * inGain));
            const g = l.gainFor(d) * inGain;
            for (let k = 0; k < outs.length; k++) outs[k][i] = (ins[k] ?? ins[0])[i] * g;
          }
        },
        set: (q) => { l.set(n(q.ceilingDb, -1), n(q.releaseMs, 80)); inGain = dbToGain(n(q.inputGainDb, 0)); },
        meter: () => ({ gr: l.reductionDb }),
      };
    }
    case "leveler": {
      const make = (q: Params) => new Leveler(sr, n(q.targetDb, -18), n(q.maxDb, 9) * (n(q.amount, 50) / 100), n(q.speedMs, 400));
      let lv = make(p);
      return {
        run(ins, outs) {
          for (let i = 0; i < ins[0].length; i++) {
            let d = 0;
            for (const ch of ins) d += ch[i];
            const g = lv.gainFor(d / ins.length);
            for (let k = 0; k < outs.length; k++) outs[k][i] = (ins[k] ?? ins[0])[i] * g;
          }
        },
        set: (q) => {
          const next = make(q);
          lv = next;
        },
        meter: () => ({ gain: lv.currentGainDb }),
      };
    }
    case "deesser": {
      const toP = (q: Params) => ({ freq: n(q.freq, 6000), thresholdDb: n(q.thresholdDb, -30), rangeDb: n(q.rangeDb, 8) });
      const per: DeEsser[] = [];
      return {
        run(ins, outs) {
          for (let k = 0; k < outs.length; k++) {
            const d = (per[k] ??= new DeEsser(sr, toP(p)));
            const src = ins[k] ?? ins[0];
            for (let i = 0; i < src.length; i++) outs[k][i] = d.process(src[i]);
          }
        },
        set: (q) => { p = q; for (const d of per) d.set(toP(q)); },
        meter: () => ({ gr: per[0]?.reduction ?? 0 }),
      };
    }
    case "denoise": {
      const per: LiveDenoiser[] = [];
      return {
        run(ins, outs) {
          for (let k = 0; k < outs.length; k++) {
            const d = (per[k] ??= new LiveDenoiser(sr, n(p.amountDb, 12)));
            const src = ins[k] ?? ins[0];
            for (let i = 0; i < src.length; i++) outs[k][i] = d.process(src[i]);
          }
        },
        set: (q) => { p = q; for (const d of per) d.amountDb = n(q.amountDb, 12); },
        meter: () => ({}),
      };
    }
    case "autopitch": {
      const toP = (q: Params): AutoPitchParams => ({
        key: { root: n(q.root, 0), scale: (q.scale as AutoPitchParams["key"]["scale"]) ?? "minor" },
        correction: n(q.correction, 45), retuneMs: n(q.retuneMs, 120), humanize: n(q.humanize, 60), formant: n(q.formant, 0),
      });
      const per: LivePitchCorrector[] = [];
      return {
        run(ins, outs) {
          for (let k = 0; k < outs.length; k++) {
            const c = (per[k] ??= new LivePitchCorrector(sr, toP(p)));
            c.process(ins[k] ?? ins[0], outs[k]);
          }
        },
        set: (q) => { p = q; for (const c of per) c.params = toP(q); },
        meter: () => ({ detected: per[0]?.detectedMidi ?? 0, shift: per[0]?.appliedShift ?? 0 }),
      };
    }
    default:
      throw new Error(`Unknown DSP ${kind}`);
  }
}

class InsertProcessor extends AudioWorkletProcessor {
  private dsp: Dsp;
  private bypass = false;
  private frames = 0;
  private alive = true;

  constructor(options: { processorOptions?: unknown }) {
    super();
    const o = (options.processorOptions ?? {}) as { kind: string; params: Params };
    this.dsp = makeDsp(o.kind, sampleRate, o.params ?? {});
    this.port.onmessage = (e: MessageEvent) => {
      const m = e.data as { params?: Params; bypass?: boolean; dispose?: boolean };
      if (m.params) this.dsp.set(m.params);
      if (m.bypass !== undefined) this.bypass = m.bypass;
      if (m.dispose) this.alive = false;
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const t0 = Date.now();
    const ins = inputs[0];
    const outs = outputs[0];
    if (!ins || ins.length === 0) {
      for (const o of outs) o.fill(0);
    } else if (this.bypass) {
      for (let k = 0; k < outs.length; k++) outs[k].set(ins[k] ?? ins[0]);
    } else {
      this.dsp.run(ins, outs);
    }
    this.frames += 128;
    if (this.frames >= sampleRate / 15) {
      this.frames = 0;
      this.port.postMessage({ meter: this.dsp.meter() });
    }
    loadMs += Date.now() - t0;
    if (currentTime - loadWindowStart >= 1) {
      this.port.postMessage({ load: loadMs / ((currentTime - loadWindowStart) * 1000) });
      loadMs = 0;
      loadWindowStart = currentTime;
    }
    return this.alive;
  }
}

/** Taps the input (raw microphone) and streams it to the main thread while recording. */
class RecorderProcessor extends AudioWorkletProcessor {
  private recording = false;
  private peak = 0;
  private frames = 0;
  private alive = true;
  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const m = e.data as { record?: boolean; dispose?: boolean };
      if (m.record !== undefined) this.recording = m.record;
      if (m.dispose) this.alive = false;
    };
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const ins = inputs[0];
    const out = outputs[0];
    if (ins && ins.length) {
      for (let k = 0; k < out.length; k++) out[k].set(ins[k] ?? ins[0]);
      const ch0 = ins[0];
      for (let i = 0; i < ch0.length; i++) {
        const a = Math.abs(ch0[i]);
        if (a > this.peak) this.peak = a;
      }
      if (this.recording) this.port.postMessage({ frame: currentFrame, data: ch0.slice(0) });
    }
    this.frames += 128;
    if (this.frames >= sampleRate / 20) {
      this.frames = 0;
      this.port.postMessage({ level: this.peak });
      this.peak = 0;
    }
    return this.alive;
  }
}

registerProcessor("bs-insert", InsertProcessor);
registerProcessor("bs-recorder", RecorderProcessor);
