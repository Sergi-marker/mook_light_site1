import { synthesizeDrum } from "./drumSynth.ts";
import { StepScheduler } from "./scheduler.ts";
import { stepDuration, swingOffset } from "./timing.ts";
import type { InstrumentKind, Project, Track } from "./types.ts";
import { Voicer } from "./voicer.ts";

export type LatencyHint = AudioContextLatencyCategory | number;

export interface EngineConfig {
  /** "interactive" = lowest latency, "playback" = lowest CPU, or a buffer duration in seconds. */
  latencyHint: LatencyHint;
  /** undefined = let the OS / device choose. */
  sampleRate?: 44100 | 48000;
}

export interface LatencyInfo {
  sampleRate: number;
  /** Processing latency of the context (≈ buffer size). */
  baseMs: number;
  /** Output (driver/device) latency reported by the browser, if available. */
  outputMs: number | null;
  totalMs: number;
  /** baseLatency expressed in samples — the effective render buffer size. */
  bufferSamples: number;
}

type AudioContextCtor = typeof AudioContext;

const BUILTIN_KINDS: InstrumentKind[] = ["kick", "snare", "clap", "closedHat", "openHat", "perc", "808"];

function createBuiltinBuffers(ctx: BaseAudioContext): Map<InstrumentKind, AudioBuffer> {
  const out = new Map<InstrumentKind, AudioBuffer>();
  for (const kind of BUILTIN_KINDS) {
    const data = synthesizeDrum(kind, ctx.sampleRate);
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.copyToChannel(data, 0);
    out.set(kind, buf);
  }
  return out;
}

/**
 * Real-time audio engine (Web Audio). Owns the AudioContext, the look-ahead step
 * scheduler and the decoded sounds. It never stores project state: it reads the
 * current project through `getProject` so it always plays what the user sees.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private voicer: Voicer | null = null;
  private scheduler: StepScheduler | null = null;
  private builtins = new Map<InstrumentKind, AudioBuffer>();
  private decoded = new Map<string, AudioBuffer>();
  private sampleBytes = new Map<string, Uint8Array>();
  /** Steps scheduled but not yet heard, for the UI playhead. */
  private stepQueue: { step: number; time: number }[] = [];
  private currentStep = -1;
  private meterBuf: Float32Array<ArrayBuffer> | null = null;
  private listeners = new Set<() => void>();
  private config: EngineConfig = { latencyHint: "interactive" };

  private readonly getProject: () => Project;
  private readonly AudioCtx: AudioContextCtor | undefined;

  constructor(getProject: () => Project, AudioCtx: AudioContextCtor | undefined = globalThis.AudioContext) {
    this.getProject = getProject;
    this.AudioCtx = AudioCtx;
  }

  get isReady(): boolean {
    return this.ctx !== null;
  }

  get isPlaying(): boolean {
    return this.scheduler?.isRunning ?? false;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get lateSteps(): number {
    return this.scheduler?.lateSteps ?? 0;
  }

  get activeVoices(): number {
    return this.voicer?.activeVoices ?? 0;
  }

  getConfig(): EngineConfig {
    return { ...this.config };
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /**
   * Create (or re-create) the AudioContext. Browsers only allow audio to start after a user
   * gesture, so this is called from the first click / key press.
   */
  async init(config: Partial<EngineConfig> = {}): Promise<void> {
    if (!this.AudioCtx) throw new Error("Web Audio is not available in this environment.");
    const next = { ...this.config, ...config };
    if (this.ctx && next.latencyHint === this.config.latencyHint && next.sampleRate === this.config.sampleRate) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const wasPlaying = this.isPlaying;
    await this.disposeContext();
    this.config = next;
    const ctx = new this.AudioCtx({ latencyHint: next.latencyHint, sampleRate: next.sampleRate });
    this.ctx = ctx;
    this.builtins = createBuiltinBuffers(ctx);
    this.voicer = new Voicer(ctx, ctx.destination, (t) => this.bufferFor(t));
    this.voicer.syncMixer(this.getProject(), true);
    this.meterBuf = new Float32Array(this.voicer.analyser.fftSize);
    this.scheduler = new StepScheduler({
      now: () => ctx.currentTime,
      getTiming: () => {
        const p = this.getProject();
        return { bpm: p.bpm, swing: p.swing, stepCount: p.stepCount };
      },
      onStep: (step, time) => this.playStep(step, time),
    });
    // Re-decode imported samples for the new context (sample rate may have changed).
    this.decoded.clear();
    await Promise.all([...this.sampleBytes].map(([id, bytes]) => this.decode(id, bytes)));
    if (ctx.state === "suspended") await ctx.resume();
    if (wasPlaying) this.play();
    this.emit();
  }

  private bufferFor(track: Track): AudioBuffer | undefined {
    if (track.sampleId) {
      const b = this.decoded.get(track.sampleId);
      if (b) return b;
    }
    return this.builtins.get(track.instrument);
  }

  private async decode(id: string, bytes: Uint8Array): Promise<AudioBuffer> {
    if (!this.ctx) throw new Error("Audio engine not initialised.");
    // decodeAudioData detaches the buffer it receives, so give it a copy.
    const copy = bytes.slice().buffer;
    const buf = await this.ctx.decodeAudioData(copy);
    this.decoded.set(id, buf);
    return buf;
  }

  /** Decode and register an imported audio file. Rejects if the format is unsupported. */
  async loadSample(id: string, bytes: Uint8Array): Promise<AudioBuffer> {
    if (!this.ctx) await this.init();
    const buf = await this.decode(id, bytes);
    this.sampleBytes.set(id, bytes);
    return buf;
  }

  removeSample(id: string): void {
    this.sampleBytes.delete(id);
    this.decoded.delete(id);
  }

  clearSamples(): void {
    this.sampleBytes.clear();
    this.decoded.clear();
  }

  getSampleBuffer(id: string): AudioBuffer | undefined {
    return this.decoded.get(id);
  }

  private playStep(step: number, time: number): void {
    const p = this.getProject();
    this.voicer!.syncMixer(p);
    for (const track of p.tracks) {
      const s = track.steps[step];
      if (s?.on) this.voicer!.trigger(track, s.velocity, time);
    }
    this.stepQueue.push({ step, time });
  }

  /** Push mixer changes immediately (called by the app on every project change). */
  syncMixer(): void {
    this.voicer?.syncMixer(this.getProject());
  }

  async play(): Promise<void> {
    if (!this.ctx) await this.init();
    if (this.ctx!.state === "suspended") await this.ctx!.resume();
    if (this.isPlaying) return;
    this.stepQueue = [];
    this.currentStep = -1;
    // Small offset so the first step is never scheduled in the past.
    this.scheduler!.start(this.ctx!.currentTime + 0.05);
    this.emit();
  }

  stop(): void {
    if (!this.scheduler?.isRunning) return;
    this.scheduler.stop();
    this.voicer?.stopAll();
    this.stepQueue = [];
    this.currentStep = -1;
    this.emit();
  }

  async toggle(): Promise<void> {
    if (this.isPlaying) this.stop();
    else await this.play();
  }

  /** Audition one track right now (clicking an instrument name). */
  async preview(trackId: string): Promise<void> {
    if (!this.ctx) await this.init();
    const p = this.getProject();
    const track = p.tracks.find((t) => t.id === trackId);
    if (!track) return;
    this.voicer!.syncMixer(p);
    this.voicer!.trigger({ ...track, chokeGroup: null }, 110, this.ctx!.currentTime + 0.005);
  }

  /** Step currently being heard (-1 when stopped). Call from requestAnimationFrame. */
  getPlayheadStep(): number {
    if (!this.ctx || !this.isPlaying) return -1;
    const heardAt = this.ctx.currentTime - (this.ctx.outputLatency || 0);
    while (this.stepQueue.length && this.stepQueue[0].time <= heardAt) {
      this.currentStep = this.stepQueue.shift()!.step;
    }
    return this.currentStep;
  }

  private peakOf(analyser: AnalyserNode): number {
    if (!this.meterBuf) return 0;
    analyser.getFloatTimeDomainData(this.meterBuf);
    let peak = 0;
    for (let i = 0; i < this.meterBuf.length; i++) peak = Math.max(peak, Math.abs(this.meterBuf[i]));
    return peak;
  }

  /** Output peak level (post safety clipper, never above ~0.98) over the last ~46 ms. */
  getMasterPeak(): number {
    return this.voicer ? this.peakOf(this.voicer.analyser) : 0;
  }

  /** Mix peak before the safety clipper. Above CLIP_KNEE the clipper is colouring the sound. */
  getPreClipPeak(): number {
    return this.voicer ? this.peakOf(this.voicer.preAnalyser) : 0;
  }

  getLatency(): LatencyInfo | null {
    if (!this.ctx) return null;
    const base = this.ctx.baseLatency || 0;
    const out = typeof this.ctx.outputLatency === "number" ? this.ctx.outputLatency : null;
    return {
      sampleRate: this.ctx.sampleRate,
      baseMs: base * 1000,
      outputMs: out === null ? null : out * 1000,
      totalMs: (base + (out ?? 0)) * 1000,
      bufferSamples: Math.round(base * this.ctx.sampleRate),
    };
  }

  private async disposeContext(): Promise<void> {
    this.scheduler?.stop();
    this.voicer?.dispose();
    const ctx = this.ctx;
    this.ctx = null;
    this.voicer = null;
    this.scheduler = null;
    if (ctx && ctx.state !== "closed") await ctx.close();
  }

  async dispose(): Promise<void> {
    await this.disposeContext();
    this.listeners.clear();
  }
}

export interface OfflineRenderOptions {
  sampleRate?: number;
  /** Number of pattern repetitions to render. */
  loops?: number;
  /** Extra seconds after the last step so tails (808, open hat) are not cut. */
  tail?: number;
  /** Decoded imported samples by id (decode with the offline context's rate). */
  samples?: ReadonlyMap<string, AudioBuffer>;
  OfflineCtx?: typeof OfflineAudioContext;
}

/**
 * Render the pattern faster than real time with exactly the same voice/mixer code as the
 * live engine. Used by tests today and by WAV export in a later phase.
 */
export async function renderPatternOffline(
  project: Project,
  opts: OfflineRenderOptions = {},
): Promise<AudioBuffer> {
  const sampleRate = opts.sampleRate ?? 44100;
  const loops = opts.loops ?? 1;
  const tail = opts.tail ?? 1.5;
  const Ctor = opts.OfflineCtx ?? globalThis.OfflineAudioContext;
  const dur = stepDuration(project.bpm);
  const totalSteps = project.stepCount * loops;
  const length = Math.ceil((totalSteps * dur + tail) * sampleRate);
  const ctx = new Ctor({ numberOfChannels: 2, length, sampleRate });
  const builtins = createBuiltinBuffers(ctx);
  const voicer = new Voicer(ctx, ctx.destination, (t) =>
    (t.sampleId ? opts.samples?.get(t.sampleId) : undefined) ?? builtins.get(t.instrument),
  );
  voicer.syncMixer(project, true);
  for (let i = 0; i < totalSteps; i++) {
    const step = i % project.stepCount;
    const time = i * dur + swingOffset(step, project.bpm, project.swing);
    for (const track of project.tracks) {
      const s = track.steps[step];
      if (s?.on) voicer.trigger(track, s.velocity, time);
    }
  }
  return ctx.startRendering();
}
