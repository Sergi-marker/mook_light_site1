// Builds the Web Audio sub-graph of one insert effect. Native nodes are used where they add
// no latency (biquads, wave shapers, delay, convolver); dynamics / denoise / pitch run in our
// own zero-look-ahead AudioWorklet DSP (see worklets/processors.ts).

import type { Effect, ParamValue } from "../core/types.ts";

export interface EffectEnv {
  bpm: () => number;
  /** Project key, for AUTO PITCH "use project key". */
  key: () => { root: number; scale: string };
  workletReady: boolean;
  onMeter?: (effectId: string, data: Record<string, number>) => void;
  onLoad?: (load: number) => void;
}

export interface EffectNode {
  id: string;
  type: Effect["type"];
  input: AudioNode;
  output: AudioNode;
  update(e: Effect): void;
  setBypass(b: boolean): void;
  dispose(): void;
}

const num = (v: ParamValue | undefined, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function tanhCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const k = 1 + drive * 12;
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  return c;
}

function hardCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const k = 1 + drive * 30;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * k;
    // Asymmetric clip for a grittier distortion.
    c[i] = Math.max(-0.8, Math.min(0.95, x)) / 0.95;
  }
  return c;
}

/** Stereo reverb impulse: decorrelated noise, exponential decay, darker tail. */
export function makeImpulse(ctx: BaseAudioContext, decay: number, size: number, toneHz: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * Math.min(8, Math.max(0.2, decay))));
  const buf = ctx.createBuffer(2, len, sr);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const lpA = Math.exp((-2 * Math.PI * toneHz) / sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    const early = Math.floor(sr * 0.08 * (0.5 + size));
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.pow(10, (-3 * t) / decay); // -60 dB at `decay`
      // Darken over time: one-pole low-pass whose input gets duller as the tail progresses.
      lp = lpA * lp + (1 - lpA) * rnd();
      const sparse = i < early && rnd() > 0.97 - size * 0.02 ? rnd() * 1.5 : 0;
      d[i] = (lp * 1.6 + sparse) * env;
    }
  }
  return buf;
}

export function delaySeconds(time: ParamValue | undefined, bpm: number): number {
  const beat = 60 / bpm;
  switch (time) {
    case "1/4": return beat;
    case "1/8": return beat / 2;
    case "1/8d": return beat * 0.75;
    case "1/16": return beat / 4;
    case "1/4t": return (beat * 2) / 3;
    case "1/2": return beat * 2;
    default: return Math.min(2, Math.max(0.01, num(time, 250) / 1000));
  }
}

function workletInsert(ctx: BaseAudioContext, e: Effect, env: EffectEnv, paramsFor: (e: Effect) => Record<string, ParamValue>): EffectNode {
  const node = new AudioWorkletNode(ctx, "bs-insert", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions: { kind: e.type, params: paramsFor(e) },
  });
  node.port.onmessage = (m: MessageEvent) => {
    const d = m.data as { meter?: Record<string, number>; load?: number };
    if (d.meter) env.onMeter?.(e.id, d.meter);
    if (d.load !== undefined) env.onLoad?.(d.load);
  };
  return {
    id: e.id,
    type: e.type,
    input: node,
    output: node,
    update: (x) => node.port.postMessage({ params: paramsFor(x) }),
    setBypass: (b) => node.port.postMessage({ bypass: b }),
    dispose: () => {
      node.port.postMessage({ dispose: true });
      node.disconnect();
    },
  };
}

/** Pass-through used when an effect is unavailable (e.g. worklets failed to load). */
function passThrough(ctx: BaseAudioContext, e: Effect): EffectNode {
  const g = ctx.createGain();
  return { id: e.id, type: e.type, input: g, output: g, update: () => {}, setBypass: () => {}, dispose: () => g.disconnect() };
}

/** Dry/wet wrapper: input → [dry gain] + [wet chain → wet gain] → output, with bypass. */
function dryWet(ctx: BaseAudioContext, e: Effect, wetIn: AudioNode, wetOut: AudioNode, apply: (x: Effect) => void, extraDispose: () => void = () => {}): EffectNode {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  input.connect(dry).connect(output);
  input.connect(wetIn);
  wetOut.connect(wet).connect(output);
  let bypass = false;
  let current = e;
  const setMix = () => {
    const mix = bypass ? 0 : Math.min(1, Math.max(0, num(current.params.mix, 1)));
    const t = ctx.currentTime;
    dry.gain.setTargetAtTime(1 - mix, t, 0.01);
    wet.gain.setTargetAtTime(mix, t, 0.01);
  };
  dry.gain.value = 1 - num(e.params.mix, 1);
  wet.gain.value = num(e.params.mix, 1);
  apply(e);
  return {
    id: e.id,
    type: e.type,
    input,
    output,
    update: (x) => {
      current = x;
      apply(x);
      setMix();
    },
    setBypass: (b) => {
      bypass = b;
      setMix();
    },
    dispose: () => {
      input.disconnect();
      output.disconnect();
      dry.disconnect();
      wet.disconnect();
      extraDispose();
    },
  };
}

export function buildEffect(ctx: BaseAudioContext, e: Effect, env: EffectEnv): EffectNode {
  const t = () => ctx.currentTime;
  switch (e.type) {
    case "eq": {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      hp.connect(low).connect(mid).connect(high);
      let bypass = false;
      let cur = e;
      const apply = (x: Effect) => {
        cur = x;
        const p = x.params;
        const on = !bypass;
        const lc = num(p.lowCutHz, 0);
        hp.frequency.setTargetAtTime(on && lc > 0 ? lc : 1, t(), 0.01);
        hp.Q.value = 0.707;
        low.frequency.setTargetAtTime(num(p.lowFreqHz, 100), t(), 0.01);
        low.gain.setTargetAtTime(on ? num(p.lowGainDb, 0) : 0, t(), 0.01);
        mid.frequency.setTargetAtTime(num(p.midFreqHz, 1000), t(), 0.01);
        mid.Q.setTargetAtTime(num(p.midQ, 1), t(), 0.01);
        mid.gain.setTargetAtTime(on ? num(p.midGainDb, 0) : 0, t(), 0.01);
        high.frequency.setTargetAtTime(num(p.highFreqHz, 8000), t(), 0.01);
        high.gain.setTargetAtTime(on ? num(p.highGainDb, 0) : 0, t(), 0.01);
      };
      apply(e);
      return {
        id: e.id, type: e.type, input: hp, output: high, update: apply,
        setBypass: (b) => { bypass = b; apply(cur); },
        dispose: () => [hp, low, mid, high].forEach((n) => n.disconnect()),
      };
    }
    case "saturation": {
      const pre = ctx.createGain();
      const sh = ctx.createWaveShaper();
      const post = ctx.createGain();
      pre.connect(sh).connect(post);
      return dryWet(ctx, e, pre, post, (x) => {
        const d = Math.min(1, Math.max(0, num(x.params.drive, 0.3)));
        sh.curve = tanhCurve(d);
        post.gain.value = 1 / (1 + d * 0.8); // keep perceived level roughly constant
      });
    }
    case "distortion": {
      const sh = ctx.createWaveShaper();
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      const post = ctx.createGain();
      sh.connect(tone).connect(post);
      return dryWet(ctx, e, sh, post, (x) => {
        const d = Math.min(1, Math.max(0, num(x.params.drive, 0.5)));
        sh.curve = hardCurve(d);
        tone.frequency.setTargetAtTime(num(x.params.toneHz, 6000), t(), 0.01);
        post.gain.value = 1 / (1 + d * 1.5);
      });
    }
    case "reverb": {
      const pre = ctx.createDelay(0.5);
      const conv = ctx.createConvolver();
      pre.connect(conv);
      let sig = "";
      return dryWet(ctx, e, pre, conv, (x) => {
        pre.delayTime.setTargetAtTime(num(x.params.preDelayMs, 15) / 1000, t(), 0.01);
        const decay = num(x.params.decay, 2.2), size = num(x.params.size, 0.5), tone = num(x.params.toneHz, 7000);
        const s = `${decay}|${size}|${tone}`;
        if (s !== sig) {
          sig = s;
          conv.buffer = makeImpulse(ctx, decay, size, tone);
        }
      });
    }
    case "delay": {
      const split = ctx.createChannelSplitter(2);
      const merge = ctx.createChannelMerger(2);
      const dl = ctx.createDelay(4);
      const dr = ctx.createDelay(4);
      const fb = ctx.createGain();
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      const inGain = ctx.createGain();
      // Ping-pong: input → L delay → R delay → (feedback) → L delay …
      inGain.connect(dl);
      dl.connect(tone).connect(dr);
      dr.connect(fb).connect(dl);
      dl.connect(merge, 0, 0);
      dr.connect(merge, 0, 1);
      void split;
      let bpmTimer: ReturnType<typeof setInterval> | null = null;
      let current = e;
      const applyTime = () => {
        const s = delaySeconds(current.params.time, env.bpm());
        dl.delayTime.setTargetAtTime(s, t(), 0.02);
        dr.delayTime.setTargetAtTime(current.params.pingPong === false ? 0.0001 : s, t(), 0.02);
      };
      const node = dryWet(ctx, e, inGain, merge, (x) => {
        current = x;
        applyTime();
        fb.gain.setTargetAtTime(Math.min(0.92, Math.max(0, num(x.params.feedback, 0.35))), t(), 0.01);
        tone.frequency.setTargetAtTime(num(x.params.toneHz, 5000), t(), 0.01);
      }, () => { if (bpmTimer) clearInterval(bpmTimer); });
      // Keep tempo-synced delays in time when the BPM changes (real-time contexts only).
      if (typeof setInterval !== "undefined" && "suspend" in ctx && !(ctx instanceof OfflineAudioContext)) {
        let lastBpm = env.bpm();
        bpmTimer = setInterval(() => {
          if (env.bpm() !== lastBpm) {
            lastBpm = env.bpm();
            applyTime();
          }
        }, 250);
      }
      return node;
    }
    case "compressor":
    case "gate":
    case "limiter":
    case "deesser":
    case "denoise":
    case "leveler":
      if (!env.workletReady) return passThrough(ctx, e);
      return workletInsert(ctx, e, env, (x) => x.params);
    case "autopitch":
      if (!env.workletReady) return passThrough(ctx, e);
      return workletInsert(ctx, e, env, (x) => {
        const useKey = x.params.useProjectKey !== false;
        const k = env.key();
        return { ...x.params, root: useKey ? k.root : num(x.params.root, 0), scale: useKey ? k.scale : String(x.params.scale ?? "minor") };
      });
  }
}
