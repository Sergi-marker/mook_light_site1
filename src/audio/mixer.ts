// Mixer graph: one strip per channel (tracks, buses, returns, master).
//
//   sources → input → [inserts…] → pan → fader ─┬→ meter
//                                               ├→ destination channel input (bus / master)
//                                               ├→ reverb send → REVERB return
//                                               └→ delay send  → DELAY return
//   master: … fader → ×¼ → soft clipper (0 latency safety) → meter → speakers / export

import { isChannelAudible, MASTER, RET_DELAY, RET_REVERB } from "../core/project.ts";
import { CLIP_HEADROOM, softClipCurve } from "../core/softClip.ts";
import type { Channel, Effect, Project } from "../core/types.ts";
import { buildEffect, type EffectEnv, type EffectNode } from "./effects.ts";

const SMOOTH = 0.012;

export interface Strip {
  id: string;
  input: GainNode;
  pan: StereoPannerNode;
  fader: GainNode;
  meter: AnalyserNode;
  sendReverb: GainNode;
  sendDelay: GainNode;
  inserts: EffectNode[];
  insertSig: string;
  last: Channel | null;
  outputId: string;
  bypassInserts: boolean;
}

export class MixerGraph {
  private readonly ctx: BaseAudioContext;
  private readonly env: EffectEnv;
  readonly strips = new Map<string, Strip>();
  /** Pre-clipper master analyser (CLIP warning). */
  readonly preClip: AnalyserNode;
  readonly masterOut: AudioNode;
  readonly meterBuf: Float32Array<ArrayBuffer>;
  /** Effect meters (gain reduction, detected pitch…) by effect id. */
  readonly effectMeters = new Map<string, Record<string, number>>();
  private lastKeySig = "";

  constructor(ctx: BaseAudioContext, destination: AudioNode, env: EffectEnv) {
    this.ctx = ctx;
    this.env = { ...env, onMeter: (id, d) => { this.effectMeters.set(id, d); env.onMeter?.(id, d); } };
    this.preClip = ctx.createAnalyser();
    this.preClip.fftSize = 2048;
    const scale = ctx.createGain();
    scale.gain.value = 1 / CLIP_HEADROOM;
    const clipper = ctx.createWaveShaper();
    clipper.curve = softClipCurve();
    clipper.oversample = "none";
    const out = ctx.createAnalyser();
    out.fftSize = 2048;
    scale.connect(clipper).connect(out).connect(destination);
    this.masterOut = out;
    this.meterBuf = new Float32Array(2048);
    // The master strip is created on first sync and connected to `scale` + preClip.
    this.masterSink = scale;
  }

  private readonly masterSink: GainNode;

  /** Where track sources connect (channel input), creating the strip lazily. */
  inputOf(channelId: string): GainNode | null {
    return this.strips.get(channelId)?.input ?? null;
  }

  private createStrip(ch: Channel): Strip {
    const c = this.ctx;
    const s: Strip = {
      id: ch.id,
      input: c.createGain(),
      pan: c.createStereoPanner(),
      fader: c.createGain(),
      meter: c.createAnalyser(),
      sendReverb: c.createGain(),
      sendDelay: c.createGain(),
      inserts: [],
      insertSig: "",
      last: null,
      outputId: "",
      bypassInserts: false,
    };
    s.meter.fftSize = 1024;
    s.pan.connect(s.fader);
    s.fader.connect(s.meter);
    s.fader.connect(s.sendReverb);
    s.fader.connect(s.sendDelay);
    s.sendReverb.gain.value = 0;
    s.sendDelay.gain.value = 0;
    this.strips.set(ch.id, s);
    return s;
  }

  private rebuildInserts(s: Strip, ch: Channel): void {
    for (const fx of s.inserts) fx.dispose();
    s.input.disconnect();
    s.inserts = ch.inserts.filter((e) => e.enabled).map((e) => buildEffect(this.ctx, e, this.env));
    let node: AudioNode = s.input;
    for (const fx of s.inserts) {
      node.connect(fx.input);
      node = fx.output;
      fx.setBypass(s.bypassInserts);
    }
    node.connect(s.pan);
    s.insertSig = sig(ch.inserts);
  }

  private connectOutput(s: Strip, ch: Channel): void {
    s.fader.disconnect();
    s.fader.connect(s.meter);
    s.fader.connect(s.sendReverb);
    s.fader.connect(s.sendDelay);
    if (ch.kind === "master") {
      s.fader.connect(this.masterSink);
      s.fader.connect(this.preClip);
    } else {
      const dest = this.strips.get(ch.output) ?? this.strips.get(MASTER);
      if (dest) s.fader.connect(dest.input);
    }
    s.sendReverb.disconnect();
    s.sendDelay.disconnect();
    const rv = this.strips.get(RET_REVERB);
    const dl = this.strips.get(RET_DELAY);
    if (rv && ch.kind !== "return" && ch.kind !== "master") s.sendReverb.connect(rv.input);
    if (dl && ch.kind !== "return" && ch.kind !== "master") s.sendDelay.connect(dl.input);
    s.outputId = ch.output;
  }

  /** Bring the graph in line with the project (create/remove strips, params, routing). */
  sync(p: Project, immediate = false): void {
    const t = this.ctx.currentTime;
    const set = (param: AudioParam, v: number) => (immediate ? param.setValueAtTime(v, t) : param.setTargetAtTime(v, t, SMOOTH));
    const ids = new Set(p.channels.map((c) => c.id));
    for (const [id, s] of this.strips)
      if (!ids.has(id)) {
        for (const fx of s.inserts) fx.dispose();
        [s.input, s.pan, s.fader, s.meter, s.sendReverb, s.sendDelay].forEach((n) => n.disconnect());
        this.strips.delete(id);
      }
    // Create first so routing can find destinations.
    let created = false;
    for (const ch of p.channels)
      if (!this.strips.has(ch.id)) {
        this.createStrip(ch);
        created = true;
      }
    const keySig = `${p.key.root}|${p.key.scale}`;
    const keyChanged = keySig !== this.lastKeySig;
    this.lastKeySig = keySig;
    for (const ch of p.channels) {
      const s = this.strips.get(ch.id)!;
      const insertSig = sig(ch.inserts);
      if (insertSig !== s.insertSig || !s.last) this.rebuildInserts(s, ch);
      else if (s.last.inserts !== ch.inserts || keyChanged) {
        const enabled = ch.inserts.filter((e) => e.enabled);
        enabled.forEach((e, i) => {
          const prev = s.last!.inserts.find((x) => x.id === e.id);
          if (prev !== e || (keyChanged && e.type === "autopitch")) s.inserts[i]?.update(e);
        });
      }
      if (created || s.outputId !== ch.output || !s.last) this.connectOutput(s, ch);
      const audible = isChannelAudible(ch, p.channels);
      set(s.fader.gain, audible ? ch.volume : 0);
      set(s.pan.pan, ch.pan);
      set(s.sendReverb.gain, ch.sends.reverb);
      set(s.sendDelay.gain, ch.sends.delay);
      s.last = ch;
    }
  }

  /** RAW / PROCESSED: bypass a channel's whole insert chain (A/B comparison). */
  setBypass(channelId: string, bypass: boolean): void {
    const s = this.strips.get(channelId);
    if (!s) return;
    s.bypassInserts = bypass;
    for (const fx of s.inserts) fx.setBypass(bypass);
  }

  isBypassed(channelId: string): boolean {
    return this.strips.get(channelId)?.bypassInserts ?? false;
  }

  /** Apply automation value to a strip's fader / pan at an exact time. */
  automate(channelId: string, param: "volume" | "pan", value: number, time: number): void {
    const s = this.strips.get(channelId);
    if (!s) return;
    if (param === "volume") s.fader.gain.linearRampToValueAtTime(Math.max(0, value), time);
    else s.pan.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, value)), time);
  }

  peak(channelId: string): number {
    const s = this.strips.get(channelId);
    if (!s) return 0;
    return peakOf(s.meter, this.meterBuf);
  }

  masterPeak(): number {
    return peakOf(this.masterOut as AnalyserNode, this.meterBuf);
  }

  preClipPeak(): number {
    return peakOf(this.preClip, this.meterBuf);
  }

  dispose(): void {
    for (const s of this.strips.values()) {
      for (const fx of s.inserts) fx.dispose();
      [s.input, s.pan, s.fader, s.meter, s.sendReverb, s.sendDelay].forEach((n) => n.disconnect());
    }
    this.strips.clear();
    this.preClip.disconnect();
    this.masterOut.disconnect();
    this.masterSink.disconnect();
  }
}

function sig(inserts: Effect[]): string {
  return inserts.filter((e) => e.enabled).map((e) => `${e.id}:${e.type}`).join(",");
}

function peakOf(a: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  const view = buf.length === a.fftSize ? buf : new Float32Array(a.fftSize);
  a.getFloatTimeDomainData(view);
  let p = 0;
  for (let i = 0; i < view.length; i++) {
    const x = Math.abs(view[i]);
    if (x > p) p = x;
  }
  return p;
}
