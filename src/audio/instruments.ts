// Melodic instruments. Every note is scheduled ahead of time on the audio clock, so the same
// code drives real-time playback and offline export.
//  • piano / pluck: pre-rendered note buffers (additive piano with inharmonicity, Karplus-Strong)
//  • epiano / bells: FM pairs   • synth / pad / strings / bass: detuned oscillators + filter
//  • 808: monophonic voice with glide/slide, punch, ADSR and its own processing chain.

import type { Bass808Params, InstrumentTrack, SynthParams } from "../core/types.ts";

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// --- pre-rendered sources ------------------------------------------------------------------

const bufferCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

function cached(ctx: BaseAudioContext, key: string, make: () => Float32Array<ArrayBuffer>): AudioBuffer {
  let m = bufferCache.get(ctx);
  if (!m) bufferCache.set(ctx, (m = new Map()));
  let b = m.get(key);
  if (!b) {
    const data = make();
    b = ctx.createBuffer(1, data.length, ctx.sampleRate);
    b.copyToChannel(data, 0);
    m.set(key, b);
  }
  return b;
}

/** Additive piano tone: inharmonic partials, faster decay for higher partials, hammer noise. */
export function renderPianoNote(midi: number, sr: number): Float32Array<ArrayBuffer> {
  const f0 = midiHz(midi);
  const dur = Math.min(4, 1.2 + (90 - Math.min(90, midi)) * 0.05);
  const len = Math.floor(sr * dur);
  const out = new Float32Array(len);
  const B = 0.0004 * Math.pow(2, (midi - 60) / 24); // inharmonicity
  const partials = Math.max(4, Math.min(16, Math.floor(8000 / f0)));
  for (let h = 1; h <= partials; h++) {
    const fh = f0 * h * Math.sqrt(1 + B * h * h);
    if (fh > sr * 0.45) break;
    const amp = (1 / Math.pow(h, 1.1)) * (h === 1 ? 1 : 0.8);
    const decay = (1.8 + (60 - midi) * 0.02) / Math.pow(h, 0.7);
    const w = (2 * Math.PI * fh) / sr;
    const ph = h * 0.7;
    for (let i = 0; i < len; i++) out[i] += amp * Math.sin(w * i + ph) * Math.exp(-i / sr / Math.max(0.15, decay));
  }
  // Hammer: short filtered noise burst.
  let seed = midi * 7919;
  let lp = 0;
  const hamLen = Math.floor(sr * 0.012);
  for (let i = 0; i < hamLen; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    lp = 0.7 * lp + 0.3 * (seed / 4294967296 - 0.5);
    out[i] += lp * 0.6 * (1 - i / hamLen);
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < len; i++) {
    out[i] = (out[i] / (peak || 1)) * 0.8;
    if (i > len - fade) out[i] *= (len - i) / fade;
  }
  return out;
}

/** Karplus-Strong plucked string. */
export function renderPluckNote(midi: number, sr: number): Float32Array<ArrayBuffer> {
  const f0 = midiHz(midi);
  const period = sr / f0;
  const n = Math.max(2, Math.floor(period));
  const frac = period - n;
  const len = Math.floor(sr * 1.6);
  const out = new Float32Array(len);
  const ring = new Float32Array(n + 1);
  let seed = midi * 104729;
  for (let i = 0; i < ring.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    ring[i] = seed / 4294967296 - 0.5;
  }
  let idx = 0;
  let prev = 0;
  const damp = 0.996 - Math.max(0, midi - 60) * 0.0004;
  for (let i = 0; i < len; i++) {
    const a = ring[idx];
    const b = ring[(idx + 1) % ring.length];
    const s = a * (1 - frac) + b * frac;
    const y = damp * 0.5 * (s + prev);
    prev = s;
    ring[idx] = y;
    idx = (idx + 1) % ring.length;
    out[i] = y * 1.4;
  }
  const fade = Math.floor(sr * 0.05);
  for (let i = len - fade; i < len; i++) out[i] *= (len - i) / fade;
  return out;
}

// --- voices --------------------------------------------------------------------------------

function adsr(param: AudioParam, t: number, end: number, peak: number, s: SynthParams): number {
  const a = Math.max(0.001, s.attack);
  const d = Math.max(0.01, s.decay);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.setTargetAtTime(peak * s.sustain, t + a, d / 3);
  const relStart = Math.max(end, t + a);
  param.cancelScheduledValues(relStart);
  param.setTargetAtTime(0, relStart, Math.max(0.01, s.release) / 4);
  return relStart + Math.max(0.01, s.release) * 1.5;
}

function filterEnv(f: BiquadFilterNode, t: number, end: number, s: SynthParams, velGain: number): void {
  const base = Math.min(18000, s.cutoff);
  const top = Math.min(18000, base * (1 + s.filterEnv * 6 * (0.5 + velGain / 2)));
  f.Q.value = s.resonance;
  f.frequency.setValueAtTime(top, t);
  f.frequency.setTargetAtTime(base, t + Math.max(0.001, s.attack), Math.max(0.02, s.decay) / 2);
  void end;
}

export interface NoteEvent {
  pitch: number;
  /** 0–1 */
  velocity: number;
  time: number;
  duration: number;
  slide?: boolean;
}

/** One polyphonic (or mono-808) instrument instance connected to its mixer channel input. */
export class InstrumentVoice {
  private readonly ctx: BaseAudioContext;
  readonly output: GainNode;
  private track: InstrumentTrack;
  private active = new Set<AudioScheduledSourceNode>();
  // 808 mono voice state
  private osc808: OscillatorNode | null = null;
  private amp808: GainNode | null = null;
  private chain808: { input: GainNode; sat: WaveShaperNode; dist: WaveShaperNode; low: BiquadFilterNode; lp: BiquadFilterNode; comp: DynamicsCompressorNode | null; post: GainNode } | null = null;
  private last808End = -1;
  private last808Freq = 0;

  constructor(ctx: BaseAudioContext, destination: AudioNode, track: InstrumentTrack) {
    this.ctx = ctx;
    this.track = track;
    this.output = ctx.createGain();
    this.output.connect(destination);
    if (track.preset === "808") this.build808();
  }

  get activeVoices(): number {
    return this.active.size;
  }

  update(track: InstrumentTrack): void {
    const presetChanged = track.preset !== this.track.preset;
    this.track = track;
    if (presetChanged) {
      this.teardown808();
      if (track.preset === "808") this.build808();
    } else if (this.chain808) {
      this.apply808(track.bass808);
    }
  }

  private build808(): void {
    const c = this.ctx;
    const input = c.createGain();
    const sat = c.createWaveShaper();
    const dist = c.createWaveShaper();
    const low = c.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 60;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    const post = c.createGain();
    // Compression for the 808: native compressor (its fixed 6 ms look-ahead is applied to the
    // whole 808 voice, so we pre-schedule 808 notes 6 ms early to stay aligned with the kick).
    const comp = c.createDynamicsCompressor();
    input.connect(sat).connect(dist).connect(low).connect(lp).connect(comp).connect(post).connect(this.output);
    this.chain808 = { input, sat, dist, low, lp, comp, post };
    const osc = c.createOscillator();
    osc.type = "sine";
    const amp = c.createGain();
    amp.gain.value = 0;
    osc.connect(amp).connect(input);
    osc.start();
    this.osc808 = osc;
    this.amp808 = amp;
    this.apply808(this.track.bass808);
  }

  private apply808(p: Bass808Params): void {
    const ch = this.chain808!;
    const satAmt = Math.min(1, Math.max(0, p.saturation));
    const k = 1 + satAmt * 6;
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    ch.sat.curve = curve;
    const d = Math.min(1, Math.max(0, p.distortion));
    const dc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * (1 + d * 8);
      dc[i] = Math.max(-1, Math.min(1, x));
    }
    ch.dist.curve = dc;
    ch.low.gain.value = p.lowBoostDb;
    ch.lp.frequency.value = Math.max(200, p.highCutHz);
    if (ch.comp) {
      ch.comp.threshold.value = -6 - p.compression * 24;
      ch.comp.ratio.value = 1 + p.compression * 7;
      ch.comp.attack.value = 0.01;
      ch.comp.release.value = 0.15;
      ch.comp.knee.value = 6;
    }
    ch.post.gain.value = 0.9 / (1 + d * 1.2 + satAmt * 0.3);
  }

  private teardown808(): void {
    if (this.osc808) {
      try { this.osc808.stop(); } catch { /* already stopped */ }
      this.osc808.disconnect();
    }
    this.amp808?.disconnect();
    if (this.chain808) Object.values(this.chain808).forEach((nd) => nd && (nd as AudioNode).disconnect());
    this.osc808 = null;
    this.amp808 = null;
    this.chain808 = null;
  }

  /** Compensation for the 808 chain's compressor look-ahead (Chromium: 6 ms). */
  static readonly LOOKAHEAD_808 = 0.006;

  play(ev: NoteEvent): void {
    if (this.track.preset === "808") return this.play808(ev);
    const c = this.ctx;
    const s = this.track.synth;
    const t = ev.time;
    const end = t + Math.max(0.03, ev.duration);
    const vel = 0.25 + 0.75 * ev.velocity;
    const f0 = midiHz(ev.pitch);
    const voiceGain = c.createGain();
    voiceGain.gain.value = 0;
    voiceGain.connect(this.output);
    let stopAt: number;
    const sources: AudioScheduledSourceNode[] = [];
    switch (this.track.preset) {
      case "piano":
      case "pluck": {
        const buf = cached(c, `${this.track.preset}:${ev.pitch}`, () => (this.track.preset === "piano" ? renderPianoNote(ev.pitch, c.sampleRate) : renderPluckNote(ev.pitch, c.sampleRate)));
        const src = c.createBufferSource();
        src.buffer = buf;
        const lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = Math.min(18000, s.cutoff * (0.6 + ev.velocity * 0.8));
        src.connect(lp).connect(voiceGain);
        voiceGain.gain.setValueAtTime(vel, t);
        const rel = Math.max(0.05, s.release);
        voiceGain.gain.setTargetAtTime(0, end, rel / 4);
        stopAt = Math.min(t + buf.duration, end + rel * 1.5);
        src.start(t);
        sources.push(src);
        break;
      }
      case "epiano":
      case "bells": {
        const car = c.createOscillator();
        const mod = c.createOscillator();
        const modGain = c.createGain();
        const ratio = this.track.preset === "bells" ? 3.5 : 1;
        car.frequency.value = f0;
        mod.frequency.value = f0 * ratio;
        const index = (this.track.preset === "bells" ? 6 : 2.2) * f0 * (0.4 + ev.velocity);
        modGain.gain.setValueAtTime(index, t);
        modGain.gain.setTargetAtTime(index * 0.15, t, this.track.preset === "bells" ? 0.4 : 0.25);
        mod.connect(modGain).connect(car.frequency);
        car.connect(voiceGain);
        stopAt = adsr(voiceGain.gain, t, end, vel * 0.6, s);
        car.start(t);
        mod.start(t);
        sources.push(car, mod);
        break;
      }
      default: {
        // synth, pad, strings, bass: detuned saws (+ square sub for bass) through a filter.
        const filter = c.createBiquadFilter();
        filter.type = "lowpass";
        filter.connect(voiceGain);
        filterEnv(filter, t, end, s, ev.velocity);
        const count = this.track.preset === "pad" ? 4 : this.track.preset === "strings" ? 3 : 2;
        const mix = c.createGain();
        mix.gain.value = 0.5 / Math.sqrt(count);
        mix.connect(filter);
        for (let i = 0; i < count; i++) {
          const o = c.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = f0;
          o.detune.value = ((i / (count - 1)) * 2 - 1) * s.detune;
          o.connect(mix);
          sources.push(o);
        }
        if (this.track.preset === "bass") {
          const sub = c.createOscillator();
          // Square at the written pitch (a sub-octave would make the note sound an octave low).
          sub.type = "square";
          sub.frequency.value = f0;
          const sg = c.createGain();
          sg.gain.value = 0.25;
          sub.connect(sg).connect(filter);
          sources.push(sub);
        }
        if (this.track.preset === "strings") {
          const lfo = c.createOscillator();
          lfo.frequency.value = 5.5;
          const depth = c.createGain();
          depth.gain.setValueAtTime(0, t);
          depth.gain.linearRampToValueAtTime(12, t + 0.4);
          lfo.connect(depth);
          for (const o of sources) depth.connect((o as OscillatorNode).detune);
          sources.push(lfo);
        }
        stopAt = adsr(voiceGain.gain, t, end, vel * (this.track.preset === "pad" ? 0.5 : 0.7), s);
        for (const o of sources) o.start(t);
      }
    }
    const last = sources[0];
    for (const src of sources) {
      src.stop(stopAt);
      this.active.add(src);
    }
    last.onended = () => {
      for (const src of sources) this.active.delete(src);
      voiceGain.disconnect();
    };
  }

  private play808(ev: NoteEvent): void {
    const p = this.track.bass808;
    const osc = this.osc808!;
    const amp = this.amp808!;
    const t = Math.max(0, ev.time - InstrumentVoice.LOOKAHEAD_808);
    const f = midiHz(ev.pitch + p.tune);
    const legato = (ev.slide || t < this.last808End - 0.005) && this.last808Freq > 0;
    osc.frequency.cancelScheduledValues(t);
    amp.gain.cancelScheduledValues(t);
    const vel = 0.3 + 0.7 * ev.velocity;
    if (legato) {
      // Glide from the previous pitch, without retriggering the envelope.
      osc.frequency.setValueAtTime(this.last808Freq, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + Math.max(0.01, p.glide));
      amp.gain.setTargetAtTime(vel * Math.max(0.05, p.sustain), t, 0.02);
    } else {
      osc.frequency.setValueAtTime(f * (1 + p.punch * 1.5), t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.03 + p.punch * 0.05);
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(vel, t + Math.max(0.001, p.attack));
      amp.gain.setTargetAtTime(vel * p.sustain, t + Math.max(0.001, p.attack), Math.max(0.02, p.decay) / 3);
    }
    const end = t + Math.max(0.03, ev.duration);
    amp.gain.setTargetAtTime(0, end, Math.max(0.01, p.release) / 4);
    this.last808End = end;
    this.last808Freq = f;
  }

  /** Silence everything immediately (transport stop). */
  stopAll(): void {
    const t = this.ctx.currentTime;
    for (const s of this.active) {
      try { s.stop(t + 0.02); } catch { /* not started */ }
    }
    if (this.amp808) {
      this.amp808.gain.cancelScheduledValues(t);
      this.amp808.gain.setTargetAtTime(0, t, 0.01);
      this.osc808!.frequency.cancelScheduledValues(t);
      this.last808End = -1;
      this.last808Freq = 0;
    }
  }

  dispose(): void {
    this.stopAll();
    this.teardown808();
    this.output.disconnect();
  }
}

/** Short click for the metronome (accent = downbeat). */
export function clickBuffer(ctx: BaseAudioContext, accent: boolean): AudioBuffer {
  return cached(ctx, accent ? "click:hi" : "click:lo", () => {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 0.04);
    const out = new Float32Array(len);
    const f = accent ? 1760 : 1180;
    for (let i = 0; i < len; i++) out[i] = Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (sr * 0.008)) * 0.8;
    return out;
  });
}
