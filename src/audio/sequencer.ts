// Turns the project into scheduled sound events, one 16th-note step at a time.
// Shared by real-time playback (driven by StepScheduler) and offline rendering (export),
// so what you hear is exactly what gets exported.

import { synthesizeDrum } from "../core/drumSynth.ts";
import { MASTER, secondsToSteps, stepsPerBarOf } from "../core/project.ts";
import { semitonesToRate, stepDuration, swingOffset, velocityToGain } from "../core/timing.ts";
import type { InstrumentKind, Pattern, Project, Track } from "../core/types.ts";
import { clickBuffer, InstrumentVoice } from "./instruments.ts";
import type { MixerGraph } from "./mixer.ts";

export type PlayMode = "pattern" | "song";

const DRUM_KINDS: InstrumentKind[] = ["kick", "snare", "clap", "closedHat", "openHat", "perc", "808"];

export interface SequencerOptions {
  /** Channel ids whose sources must not sound (stem rendering). */
  muted?: Set<string>;
  metronome?: boolean;
}

export class Sequencer {
  private readonly ctx: BaseAudioContext;
  private readonly mixer: MixerGraph;
  private builtins = new Map<InstrumentKind, AudioBuffer>();
  /** Decoded imported drum samples by sample id. */
  readonly samples = new Map<string, AudioBuffer>();
  /** Decoded audio assets (takes) by asset id. */
  readonly assets = new Map<string, AudioBuffer>();
  private voices = new Map<string, InstrumentVoice>();
  private chokeVoices = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  private activeSources = new Set<AudioScheduledSourceNode>();
  private metronomeOut: GainNode;
  opts: SequencerOptions = {};

  constructor(ctx: BaseAudioContext, mixer: MixerGraph, metronomeDestination: AudioNode) {
    this.ctx = ctx;
    this.mixer = mixer;
    for (const k of DRUM_KINDS) {
      const d = synthesizeDrum(k, ctx.sampleRate);
      const b = ctx.createBuffer(1, d.length, ctx.sampleRate);
      b.copyToChannel(d, 0);
      this.builtins.set(k, b);
    }
    this.metronomeOut = ctx.createGain();
    this.metronomeOut.connect(metronomeDestination);
  }

  get activeVoices(): number {
    let n = this.activeSources.size;
    for (const v of this.voices.values()) n += v.activeVoices;
    return n;
  }

  /** Keep instrument voices in sync with the project's instrument tracks. */
  syncInstruments(p: Project): void {
    const ids = new Set(p.instruments.map((i) => i.id));
    for (const [id, v] of this.voices)
      if (!ids.has(id)) {
        v.dispose();
        this.voices.delete(id);
      }
    for (const ins of p.instruments) {
      const v = this.voices.get(ins.id);
      if (v) v.update(ins);
      else {
        const dest = this.mixer.inputOf(ins.id);
        if (dest) this.voices.set(ins.id, new InstrumentVoice(this.ctx, dest, ins));
      }
    }
  }

  private silenced(channelId: string): boolean {
    return this.opts.muted?.has(channelId) ?? false;
  }

  bufferForTrack(t: Track): AudioBuffer | undefined {
    return (t.sampleId ? this.samples.get(t.sampleId) : undefined) ?? this.builtins.get(t.instrument);
  }

  /** One drum hit (with optional roll subdivisions) on the track's mixer channel. */
  triggerDrum(t: Track, velocity: number, time: number, roll = 1, stepDur = 0.1): void {
    const buf = this.bufferForTrack(t);
    const dest = this.mixer.inputOf(t.id);
    if (!buf || !dest || this.silenced(t.id)) return;
    for (let r = 0; r < roll; r++) {
      const at = time + (r * stepDur) / roll;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = semitonesToRate(t.pitch);
      const g = this.ctx.createGain();
      g.gain.value = velocityToGain(velocity) * (r === 0 ? 1 : 0.85);
      src.connect(g).connect(dest);
      if (t.chokeGroup !== null) {
        const key = String(t.chokeGroup);
        const prev = this.chokeVoices.get(key);
        if (prev) {
          prev.gain.gain.setValueAtTime(prev.gain.gain.value, at);
          prev.gain.gain.linearRampToValueAtTime(0, at + 0.008);
          try { prev.src.stop(at + 0.01); } catch { /* stopped */ }
        }
        this.chokeVoices.set(key, { src, gain: g });
      }
      this.activeSources.add(src);
      src.onended = () => {
        this.activeSources.delete(src);
        g.disconnect();
      };
      src.start(at);
    }
  }

  /** Audition one drum track now. */
  previewDrum(t: Track): void {
    this.triggerDrum({ ...t, chokeGroup: null }, 110, this.ctx.currentTime + 0.005);
  }

  previewNote(instrumentId: string, pitch: number, velocity = 100, duration = 0.4): void {
    const v = this.voices.get(instrumentId);
    v?.play({ pitch, velocity: velocity / 127, time: this.ctx.currentTime + 0.01, duration });
  }

  /** Live note-on/off from a MIDI keyboard: plays a note of fixed max length. */
  liveNote(instrumentId: string, pitch: number, velocity: number, duration: number): void {
    this.previewNote(instrumentId, pitch, velocity, duration);
  }

  /** Schedule everything of `pattern` at its local `step`, at audio time `time`. */
  private schedulePatternStep(p: Project, pat: Pattern, step: number, time: number, stepDur: number): void {
    for (const t of p.tracks) {
      const s = pat.drums[t.id]?.[step];
      if (s?.on) this.triggerDrum(t, s.velocity, Math.max(0, time + (s.offset ?? 0) * stepDur), s.roll ?? 1, stepDur);
    }
    for (const ins of p.instruments) {
      if (this.silenced(ins.id)) continue;
      const voice = this.voices.get(ins.id);
      const notes = pat.notes[ins.id];
      if (!voice || !notes) continue;
      for (const n of notes) {
        if (n.start >= step && n.start < step + 1) {
          voice.play({ pitch: n.pitch, velocity: n.velocity / 127, time: time + (n.start - step) * stepDur, duration: n.length * stepDur, slide: n.slide });
        }
      }
    }
  }

  /**
   * Schedule global step `pos` (pattern mode: step inside the current pattern;
   * song mode: absolute step in the arrangement) at audio time `time`.
   */
  scheduleStep(p: Project, mode: PlayMode, pos: number, time: number): void {
    const dur = stepDuration(p.bpm);
    const t = time + swingOffset(((pos % 2) + 2) % 2, p.bpm, p.swing);
    const spb = stepsPerBarOf(p);
    if (this.opts.metronome && pos % (16 / p.timeSignature.beatUnit) === 0) {
      const src = this.ctx.createBufferSource();
      src.buffer = clickBuffer(this.ctx, ((pos % spb) + spb) % spb === 0);
      src.connect(this.metronomeOut);
      src.start(Math.max(0, time));
    }
    if (pos < 0) return; // count-in
    if (mode === "pattern") {
      const pat = p.patterns.find((x) => x.id === p.currentPatternId) ?? p.patterns[0];
      this.schedulePatternStep(p, pat, pos % pat.stepCount, t, dur);
      return;
    }
    for (const clip of p.arrangement.clips) {
      const start = clip.start * spb;
      const end = start + clip.length * spb;
      if (pos < start || pos >= end) continue;
      const pat = p.patterns.find((x) => x.id === clip.patternId);
      if (!pat) continue;
      this.schedulePatternStep(p, pat, (pos - start) % pat.stepCount, t, dur);
    }
    this.scheduleAudioClips(p, pos, pos + 1, time, dur);
    this.scheduleAutomation(p, pos, time, dur);
  }

  /** Start vocal clips whose start falls in [from, to) steps. */
  private scheduleAudioClips(p: Project, from: number, to: number, time: number, dur: number): void {
    for (const v of p.vocals) {
      if (this.silenced(v.id)) continue;
      for (const c of v.clips)
        if (c.start >= from && c.start < to) this.startAudioClip(p, v.id, c, time + (c.start - from) * dur, 0);
    }
  }

  /** Clips that are already running at `pos` when playback starts mid-clip. */
  startRunningClips(p: Project, pos: number, time: number): void {
    for (const v of p.vocals) {
      if (this.silenced(v.id)) continue;
      for (const c of v.clips) {
        const into = ((pos - c.start) * 60) / (p.bpm * 4);
        if (pos > c.start && into < c.duration) this.startAudioClip(p, v.id, c, time, into);
      }
    }
  }

  private startAudioClip(p: Project, trackId: string, c: Project["vocals"][number]["clips"][number], time: number, skip: number): void {
    const track = p.vocals.find((v) => v.id === trackId)!;
    const take = track.takes.find((t) => t.id === c.takeId);
    if (!take) return;
    const useProcessed = track.playProcessed && take.processedAssetId && this.assets.has(take.processedAssetId);
    const buf = this.assets.get(useProcessed ? take.processedAssetId! : take.assetId);
    const dest = this.mixer.inputOf(trackId);
    if (!buf || !dest) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = Math.pow(10, c.gainDb / 20);
    src.connect(g).connect(dest);
    const offset = c.offset + skip;
    const dur = c.duration - skip;
    if (dur <= 0 || offset >= buf.duration) return;
    // 5 ms fades avoid clicks at clip edges.
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(Math.pow(10, c.gainDb / 20), time + 0.005);
    g.gain.setValueAtTime(Math.pow(10, c.gainDb / 20), time + Math.max(0.005, dur - 0.005));
    g.gain.linearRampToValueAtTime(0, time + dur);
    this.activeSources.add(src);
    src.onended = () => {
      this.activeSources.delete(src);
      g.disconnect();
    };
    src.start(Math.max(0, time), offset, dur);
  }

  private scheduleAutomation(p: Project, pos: number, time: number, dur: number): void {
    if (!p.automation.length) return;
    const spb = stepsPerBarOf(p);
    for (const lane of p.automation) {
      if (lane.points.length === 0) continue;
      const bar = (pos + 1) / spb;
      this.mixer.automate(lane.channelId, lane.param, valueAt(lane.points, bar), time + dur);
    }
  }

  stopAll(): void {
    const t = this.ctx.currentTime;
    for (const s of this.activeSources) {
      try { s.stop(t + 0.01); } catch { /* not started */ }
    }
    this.activeSources.clear();
    this.chokeVoices.clear();
    for (const v of this.voices.values()) v.stopAll();
  }

  dispose(): void {
    this.stopAll();
    for (const v of this.voices.values()) v.dispose();
    this.voices.clear();
    this.metronomeOut.disconnect();
  }
}

export function valueAt(points: { bar: number; value: number }[], bar: number): number {
  if (bar <= points[0].bar) return points[0].value;
  for (let i = 1; i < points.length; i++) {
    if (bar <= points[i].bar) {
      const a = points[i - 1], b = points[i];
      const f = (bar - a.bar) / Math.max(1e-9, b.bar - a.bar);
      return a.value + (b.value - a.value) * f;
    }
  }
  return points[points.length - 1].value;
}

/** Song end in steps (arrangement + vocal clips). */
export function songEndStep(p: Project): number {
  const spb = stepsPerBarOf(p);
  let end = 0;
  for (const c of p.arrangement.clips) end = Math.max(end, (c.start + c.length) * spb);
  for (const v of p.vocals) for (const c of v.clips) end = Math.max(end, c.start + secondsToSteps(c.duration, p.bpm));
  return Math.ceil(end);
}

export { MASTER };
