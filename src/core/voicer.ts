import { isTrackAudible } from "./project.ts";
import { CLIP_HEADROOM, softClipCurve } from "./softClip.ts";
import { semitonesToRate, velocityToGain } from "./timing.ts";
import type { Project, Track } from "./types.ts";

/** Smoothing time constant for fader moves (avoids zipper noise). */
const PARAM_SMOOTHING = 0.012;
/** Fade applied when a voice is choked, to avoid clicks. */
const CHOKE_FADE = 0.008;

interface Channel {
  gain: GainNode;
  pan: StereoPannerNode;
  last: { volume: number; pan: number; audible: boolean } | null;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export type BufferResolver = (track: Track) => AudioBuffer | undefined;

/**
 * Plays drum hits into a mixer graph. Shared by the real-time engine and offline
 * rendering so both produce identical audio:
 *
 *   source → hit gain (velocity) → channel gain (volume, mute/solo) → pan → master
 *   master gain ─┬→ preAnalyser (detects a mix that is too hot)
 *                └→ ×1/headroom → soft clipper → analyser → destination
 */
export class Voicer {
  readonly master: GainNode;
  readonly clipper: WaveShaperNode;
  /** Post-clipper: what is actually sent to the output. */
  readonly analyser: AnalyserNode;
  /** Pre-clipper: lets the UI warn when the mix drives the safety clipper. */
  readonly preAnalyser: AnalyserNode;
  private channels = new Map<string, Channel>();
  private chokeVoices = new Map<number, Voice>();
  private active = new Set<AudioBufferSourceNode>();

  private readonly ctx: BaseAudioContext;
  private readonly resolveBuffer: BufferResolver;

  constructor(ctx: BaseAudioContext, destination: AudioNode, resolveBuffer: BufferResolver) {
    this.ctx = ctx;
    this.resolveBuffer = resolveBuffer;
    this.master = ctx.createGain();
    this.preAnalyser = ctx.createAnalyser();
    this.preAnalyser.fftSize = 2048;
    this.master.connect(this.preAnalyser);
    const scale = ctx.createGain();
    scale.gain.value = 1 / CLIP_HEADROOM;
    this.clipper = ctx.createWaveShaper();
    this.clipper.curve = softClipCurve();
    this.clipper.oversample = "none"; // oversampling would add latency
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(scale).connect(this.clipper).connect(this.analyser).connect(destination);
  }

  get activeVoices(): number {
    return this.active.size;
  }

  private channel(track: Track): Channel {
    let ch = this.channels.get(track.id);
    if (!ch) {
      const gain = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      gain.connect(pan).connect(this.master);
      ch = { gain, pan, last: null };
      this.channels.set(track.id, ch);
    }
    return ch;
  }

  /** Push current mixer values (volume, pan, mute/solo, master) to the audio graph. */
  syncMixer(project: Project, immediate = false): void {
    const t = this.ctx.currentTime;
    const set = (param: AudioParam, value: number) => {
      if (immediate) param.setValueAtTime(value, t);
      else param.setTargetAtTime(value, t, PARAM_SMOOTHING);
    };
    set(this.master.gain, project.masterVolume);
    const ids = new Set<string>();
    for (const track of project.tracks) {
      ids.add(track.id);
      const ch = this.channel(track);
      const audible = isTrackAudible(track, project.tracks);
      const last = ch.last;
      if (!last || last.volume !== track.volume || last.audible !== audible) {
        set(ch.gain.gain, audible ? track.volume : 0);
      }
      if (!last || last.pan !== track.pan) set(ch.pan.pan, track.pan);
      ch.last = { volume: track.volume, pan: track.pan, audible };
    }
    for (const [id, ch] of this.channels) {
      if (!ids.has(id)) {
        ch.gain.disconnect();
        ch.pan.disconnect();
        this.channels.delete(id);
      }
    }
  }

  /** Schedule one hit of `track` at audio-clock `time`. */
  trigger(track: Track, velocity: number, time: number): void {
    const buffer = this.resolveBuffer(track);
    if (!buffer) return;
    const ch = this.channel(track);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = semitonesToRate(track.pitch);
    const gain = this.ctx.createGain();
    gain.gain.value = velocityToGain(velocity);
    source.connect(gain).connect(ch.gain);

    if (track.chokeGroup !== null) {
      const prev = this.chokeVoices.get(track.chokeGroup);
      if (prev) {
        prev.gain.gain.setValueAtTime(prev.gain.gain.value, time);
        prev.gain.gain.linearRampToValueAtTime(0, time + CHOKE_FADE);
        try {
          prev.source.stop(time + CHOKE_FADE + 0.002);
        } catch {
          /* already stopped */
        }
      }
      this.chokeVoices.set(track.chokeGroup, { source, gain });
    }

    this.active.add(source);
    source.onended = () => {
      this.active.delete(source);
      gain.disconnect();
    };
    source.start(time);
  }

  /** Stop every sounding voice (transport stop / panic). */
  stopAll(fade = 0.01): void {
    const t = this.ctx.currentTime;
    for (const src of this.active) {
      try {
        src.stop(t + fade);
      } catch {
        /* already stopped */
      }
    }
    this.chokeVoices.clear();
  }

  dispose(): void {
    this.stopAll(0);
    this.master.disconnect();
    this.clipper.disconnect();
    this.analyser.disconnect();
    this.preAnalyser.disconnect();
    for (const ch of this.channels.values()) {
      ch.gain.disconnect();
      ch.pan.disconnect();
    }
    this.channels.clear();
  }
}
