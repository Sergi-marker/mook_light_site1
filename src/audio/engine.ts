// Real-time audio engine: AudioContext, transport (pattern / song modes), mixer, instruments,
// decoded audio, metronome, device selection and performance figures.
// It never stores project state: it reads the current project through `getProject`.

import { StepScheduler } from "../core/scheduler.ts";
import { stepDuration } from "../core/timing.ts";
import { stepsPerBarOf } from "../core/project.ts";
import { currentPattern } from "../core/project.ts";
import type { Project } from "../core/types.ts";
import { MixerGraph } from "./mixer.ts";
import { Sequencer, songEndStep, type PlayMode } from "./sequencer.ts";

export type LatencyHint = AudioContextLatencyCategory | number;

export interface EngineConfig {
  latencyHint: LatencyHint;
  sampleRate?: 44100 | 48000;
}

export interface LatencyInfo {
  sampleRate: number;
  baseMs: number;
  outputMs: number | null;
  totalMs: number;
  bufferSamples: number;
}

export const WORKLET_URL = new URL("./worklets/processors.js", import.meta.url).href;

/** Decode any browser-supported audio file (WAV, MP3, AIFF, OGG, FLAC…). */
export async function decodeAudio(ctx: BaseAudioContext, bytes: Uint8Array): Promise<AudioBuffer> {
  return ctx.decodeAudioData(bytes.slice().buffer);
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  mixer: MixerGraph | null = null;
  seq: Sequencer | null = null;
  private scheduler: StepScheduler | null = null;
  readonly getProject: () => Project;
  private readonly AudioCtx: typeof AudioContext | undefined;
  private config: EngineConfig = { latencyHint: "interactive" };
  private listeners = new Set<() => void>();
  private stepListeners = new Set<(pos: number, time: number) => void>();
  private initChain: Promise<void> = Promise.resolve();
  private resumeAfterInit = false;
  private sampleBytes = new Map<string, Uint8Array>();
  private assetBuffers = new Map<string, AudioBuffer>();
  private stepQueue: { pos: number; time: number }[] = [];
  private lastHeard = { pos: 0, time: 0 };
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private outputDeviceId = "";
  workletReady = false;
  workletError = "";
  mode: PlayMode = "pattern";
  /** Song position (steps) where play starts / stop returns to. */
  cursor = 0;
  /** Position when paused. */
  private pausedAt: number | null = null;
  /** DSP load reported by our worklets (0–1 of real time). */
  dspLoad = 0;
  metronomeForced = false;
  /** While recording, playback must not stop at the end of the song (the take would be cut). */
  holdAtSongEnd = false;
  /** Called when playback stops by itself (end of song). */
  onEnded: (() => void) | null = null;

  constructor(getProject: () => Project, AudioCtx: typeof AudioContext | undefined = globalThis.AudioContext) {
    this.getProject = getProject;
    this.AudioCtx = AudioCtx;
  }

  get isReady(): boolean {
    return this.ctx !== null;
  }
  get isPlaying(): boolean {
    return this.scheduler?.isRunning ?? false;
  }
  get isPaused(): boolean {
    return !this.isPlaying && this.pausedAt !== null;
  }
  get context(): AudioContext | null {
    return this.ctx;
  }
  get lateSteps(): number {
    return this.scheduler?.lateSteps ?? 0;
  }
  get activeVoices(): number {
    return this.seq?.activeVoices ?? 0;
  }

  getConfig(): EngineConfig {
    return { ...this.config };
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Every scheduled step (position, audio time) — used by the recorder. */
  onStep(fn: (pos: number, time: number) => void): () => void {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  init(config: Partial<EngineConfig> = {}): Promise<void> {
    const run = this.initChain.then(() => this.doInit(config));
    this.initChain = run.catch(() => {});
    return run;
  }

  private async doInit(config: Partial<EngineConfig>): Promise<void> {
    if (!this.AudioCtx) throw new Error("Web Audio is not available in this environment.");
    const next = { ...this.config, ...config };
    if (this.ctx && next.latencyHint === this.config.latencyHint && next.sampleRate === this.config.sampleRate) {
      // Not awaited: without a user gesture resume() stays pending until the next one.
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
      return;
    }
    const wasPlaying = this.isPlaying || this.resumeAfterInit;
    const resumeFrom = wasPlaying ? this.currentPosition() : null;
    this.resumeAfterInit = wasPlaying;
    await this.disposeContext();
    this.config = next;
    const ctx = new this.AudioCtx({ latencyHint: next.latencyHint, sampleRate: next.sampleRate });
    this.ctx = ctx;
    if (this.outputDeviceId) await this.applySink(this.outputDeviceId).catch(() => {});
    try {
      await ctx.audioWorklet.addModule(WORKLET_URL);
      this.workletReady = true;
      this.workletError = "";
    } catch (e) {
      this.workletReady = false;
      this.workletError = (e as Error).message;
    }
    this.mixer = new MixerGraph(ctx, ctx.destination, {
      bpm: () => this.getProject().bpm,
      key: () => this.getProject().key,
      workletReady: this.workletReady,
      onLoad: (l) => (this.dspLoad = l),
    });
    this.seq = new Sequencer(ctx, this.mixer, ctx.destination);
    this.sync(true);
    for (const [id, bytes] of this.sampleBytes) {
      try {
        this.seq.samples.set(id, await decodeAudio(ctx, bytes));
      } catch {
        /* reported at import time */
      }
    }
    for (const [id, buf] of this.assetBuffers) this.seq.assets.set(id, buf);
    this.scheduler = new StepScheduler({
      now: () => ctx.currentTime,
      getTiming: () => this.timing(),
      onStep: (pos, time) => this.handleStep(pos, time),
    });
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    this.resumeAfterInit = false;
    if (wasPlaying && resumeFrom !== null) this.startTransport(Math.floor(resumeFrom));
    this.emit();
  }

  /** Push project changes to the audio graph (mixer, instruments). */
  sync(immediate = false): void {
    if (!this.mixer || !this.seq) return;
    const p = this.getProject();
    this.mixer.sync(p, immediate);
    this.seq.syncInstruments(p);
  }

  private timing() {
    const p = this.getProject();
    // Swing is applied by the sequencer (so offline export swings identically).
    if (this.mode === "pattern") return { bpm: p.bpm, swing: 0, stepCount: currentPattern(p).stepCount };
    const spb = stepsPerBarOf(p);
    const loop = p.arrangement.loop;
    if (loop.enabled && loop.end > loop.start) return { bpm: p.bpm, swing: 0, stepCount: loop.end * spb, loopStart: loop.start * spb };
    return { bpm: p.bpm, swing: 0, stepCount: Infinity };
  }

  private handleStep(pos: number, time: number): void {
    const p = this.getProject();
    this.seq!.opts.metronome = p.metronome.enabled || this.metronomeForced || pos < 0;
    this.seq!.scheduleStep(p, this.mode, pos, time);
    this.stepQueue.push({ pos, time });
    for (const fn of this.stepListeners) fn(pos, time);
    if (this.mode === "song" && !this.holdAtSongEnd && !p.arrangement.loop.enabled && pos >= Math.max(1, songEndStep(p)) && !this.endTimer) {
      const ms = Math.max(0, (time - this.ctx!.currentTime) * 1000);
      this.endTimer = setTimeout(() => {
        this.endTimer = null;
        this.stop();
        this.onEnded?.();
      }, ms);
    }
  }

  setMode(mode: PlayMode): void {
    if (mode === this.mode) return;
    const playing = this.isPlaying;
    if (playing) this.stop();
    this.mode = mode;
    this.pausedAt = null;
    if (playing) void this.play();
    this.emit();
  }

  async play(from?: number): Promise<void> {
    if (!this.ctx) await this.init();
    if (this.ctx!.state === "suspended") await this.ctx!.resume();
    if (this.isPlaying) return;
    const start = from ?? this.pausedAt ?? (this.mode === "song" ? this.cursor : 0);
    this.startTransport(start);
  }

  private startTransport(from: number): void {
    if (!this.ctx || !this.scheduler || this.isPlaying) return;
    this.stepQueue = [];
    this.pausedAt = null;
    const startTime = this.ctx.currentTime + 0.05;
    const whole = Math.floor(from);
    this.lastHeard = { pos: whole, time: startTime };
    if (this.mode === "song" && whole >= 0) this.seq!.startRunningClips(this.getProject(), whole, startTime);
    this.scheduler.start(startTime, whole);
    this.emit();
  }

  /** Stop and return to the cursor. */
  stop(): void {
    this.resumeAfterInit = false;
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    const was = this.scheduler?.isRunning;
    this.scheduler?.stop();
    this.seq?.stopAll();
    this.stepQueue = [];
    this.pausedAt = null;
    if (was) this.emit();
  }

  /** Stop but keep the position (PAUSE). */
  pause(): void {
    if (!this.isPlaying) return;
    const pos = this.currentPosition();
    this.stop();
    this.pausedAt = Math.max(0, Math.floor(pos));
    this.emit();
  }

  async toggle(): Promise<void> {
    if (this.isPlaying) this.stop();
    else await this.play();
  }

  /** Move the song cursor (steps). */
  seek(pos: number): void {
    this.cursor = Math.max(0, Math.round(pos));
    this.pausedAt = null;
    if (this.isPlaying) {
      this.stop();
      void this.play(this.cursor);
    }
    this.emit();
  }

  /** Position (steps, fractional) currently being heard. */
  currentPosition(): number {
    if (!this.ctx) return this.cursor;
    if (!this.isPlaying) return this.pausedAt ?? (this.mode === "song" ? this.cursor : 0);
    const heardAt = this.ctx.currentTime - (this.ctx.outputLatency || 0);
    while (this.stepQueue.length && this.stepQueue[0].time <= heardAt) this.lastHeard = this.stepQueue.shift()!;
    const dur = stepDuration(this.getProject().bpm);
    return this.lastHeard.pos + Math.min(0.999, Math.max(0, (heardAt - this.lastHeard.time) / dur));
  }

  /** Pattern step being heard (-1 when stopped) — for the step sequencer playhead. */
  getPlayheadStep(): number {
    if (!this.isPlaying) return -1;
    const pos = Math.floor(this.currentPosition());
    if (pos < 0) return -1;
    if (this.mode === "pattern") return pos;
    return -1;
  }

  // --- media ---------------------------------------------------------------------------

  async loadSample(id: string, bytes: Uint8Array): Promise<AudioBuffer> {
    if (!this.ctx) await this.init();
    const buf = await decodeAudio(this.ctx!, bytes);
    this.sampleBytes.set(id, bytes);
    this.seq!.samples.set(id, buf);
    return buf;
  }

  removeSample(id: string): void {
    this.sampleBytes.delete(id);
    this.seq?.samples.delete(id);
  }

  clearMedia(): void {
    this.sampleBytes.clear();
    this.assetBuffers.clear();
    this.seq?.samples.clear();
    this.seq?.assets.clear();
  }

  /** Register decoded audio for a take / processed take. */
  setAsset(id: string, buf: AudioBuffer): void {
    this.assetBuffers.set(id, buf);
    this.seq?.assets.set(id, buf);
  }

  getAsset(id: string): AudioBuffer | undefined {
    return this.assetBuffers.get(id);
  }

  createBuffer(channels: Float32Array[], sampleRate: number): AudioBuffer {
    const ctx = this.ctx;
    const buf = ctx
      ? ctx.createBuffer(channels.length, channels[0].length, sampleRate)
      : new AudioBuffer({ numberOfChannels: channels.length, length: channels[0].length, sampleRate });
    channels.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    return buf;
  }

  // --- auditioning ---------------------------------------------------------------------

  async previewDrum(trackId: string): Promise<void> {
    if (!this.ctx) await this.init();
    if (this.ctx!.state === "suspended") await this.ctx!.resume();
    const t = this.getProject().tracks.find((x) => x.id === trackId);
    if (t) this.seq!.previewDrum(t);
  }

  async previewNote(instrumentId: string, pitch: number, velocity = 100, duration = 0.4): Promise<void> {
    if (!this.ctx) await this.init();
    if (this.ctx!.state === "suspended") await this.ctx!.resume();
    this.seq!.previewNote(instrumentId, pitch, velocity, duration);
  }

  /** Play an AudioBuffer directly (take preview, generator preview). Returns a stop function. */
  playBuffer(buf: AudioBuffer, channelId?: string): () => void {
    if (!this.ctx) return () => {};
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const dest = (channelId && this.mixer?.inputOf(channelId)) || this.mixer?.inputOf("master") || this.ctx.destination;
    src.connect(dest);
    src.start();
    return () => {
      try { src.stop(); } catch { /* ended */ }
    };
  }

  // --- devices & metrics ------------------------------------------------------------------

  private async applySink(deviceId: string): Promise<void> {
    const c = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (!c?.setSinkId) throw new Error("Output device selection is not supported here.");
    await c.setSinkId(deviceId === "default" ? "" : deviceId);
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId;
    if (this.ctx) await this.applySink(deviceId);
    this.emit();
  }

  get outputDevice(): string {
    return this.outputDeviceId;
  }

  getMasterPeak(): number {
    return this.mixer?.masterPeak() ?? 0;
  }

  getPreClipPeak(): number {
    return this.mixer?.preClipPeak() ?? 0;
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
    this.seq?.dispose();
    this.mixer?.dispose();
    const ctx = this.ctx;
    this.ctx = null;
    this.mixer = null;
    this.seq = null;
    this.scheduler = null;
    if (ctx && ctx.state !== "closed") await ctx.close();
  }

  async dispose(): Promise<void> {
    await this.disposeContext();
    this.listeners.clear();
  }
}
