// Vocal recording: microphone input, live monitoring through the track's real-time chain,
// count-in, punch in/out, and sample-accurate capture with latency compensation.
//
// The take is always recorded RAW (before any processing): the vocal chain is applied
// non-destructively at playback, so every setting can still be changed afterwards.

import { stepsPerBarOf } from "../core/project.ts";
import type { AudioEngine } from "./engine.ts";

export class RecorderError extends Error {}

export interface InputInfo {
  deviceId: string;
  label: string;
}

export interface RecordingOptions {
  trackId: string;
  /** Global step where the take starts. */
  startStep: number;
  countInBars: number;
  /** Optional punch region [inStep, outStep): only that part is kept. */
  punch?: [number, number];
}

/** Which input of the audio interface feeds the recording. */
export type InputChannel = "auto" | "left" | "right" | "mix";

export interface RecordedTake {
  data: Float32Array;
  sampleRate: number;
  startStep: number;
  /** Latency that was compensated, seconds. */
  compensation: number;
  peak: number;
}

export class Recorder {
  private readonly engine: AudioEngine;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private tap: AudioWorkletNode | null = null;
  // Per-channel routing: audio interfaces expose their inputs as one stereo device (input 1 =
  // left, input 2 = right). Mixing both (the old behaviour, and what Windows does when asked for
  // mono) halves the voice and adds the hiss of the unused input. We pick the right one.
  private splitter: ChannelSplitterNode | null = null;
  private chanGains: [GainNode, GainNode] | null = null;
  private mono: GainNode | null = null;
  private analysers: [AnalyserNode, AnalyserNode] | null = null;
  private chanTimer: ReturnType<typeof setInterval> | null = null;
  private chanPeakDb: [number, number] = [-120, -120];
  /** Requested input channel ("auto" = detect where the microphone is). */
  inputChannel: InputChannel = "auto";
  /** Channel actually used, number of input channels, recent levels (dBFS). */
  channelState: { count: number; used: Exclude<InputChannel, "auto">; levelsDb: [number, number] } = { count: 1, used: "left", levelsDb: [-120, -120] };
  private monitorTarget: string | null = null;
  private chunks: { frame: number; data: Float32Array }[] = [];
  private recordFrame = -1;
  private opts: RecordingOptions | null = null;
  private unsubscribe: (() => void) | null = null;
  private stopFrame = -1;
  inputDeviceId = "";
  inputLatency = 0;
  /** Input peak level 0–1 (updated ~20×/s). */
  level = 0;
  levelListeners = new Set<(l: number) => void>();
  get isOpen(): boolean {
    return this.stream !== null;
  }
  get isRecording(): boolean {
    return this.opts !== null;
  }
  get monitoringTrack(): string | null {
    return this.monitorTarget;
  }

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  static async listInputs(): Promise<InputInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter((d) => d.kind === "audioinput").map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  }

  static async listOutputs(): Promise<InputInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter((d) => d.kind === "audiooutput").map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Sortie ${i + 1}` }));
  }

  /** Open the microphone (raw: no browser echo cancellation / noise suppression / AGC). */
  async open(deviceId = this.inputDeviceId): Promise<void> {
    await this.engine.init();
    const ctx = this.engine.context!;
    if (!this.engine.workletReady) throw new RecorderError("Audio engine incomplete (worklets unavailable): recording is disabled.");
    if (!navigator.mediaDevices?.getUserMedia) throw new RecorderError("Microphone unavailable: this environment has no audio input API.");
    this.close();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: { ideal: 2 },
          sampleRate: ctx.sampleRate,
        },
      });
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === "NotAllowedError") throw new RecorderError("Microphone unavailable: access was refused. Allow the microphone in Windows privacy settings.");
      if (name === "NotFoundError" || name === "OverconstrainedError") throw new RecorderError("Microphone unavailable: no input device found. Plug in your microphone or audio interface.");
      throw new RecorderError(`Microphone unavailable: ${(e as Error).message}`);
    }
    this.inputDeviceId = deviceId;
    const track = this.stream.getAudioTracks()[0];
    const settings = track.getSettings() as MediaTrackSettings & { latency?: number };
    this.inputLatency = typeof settings.latency === "number" ? settings.latency : 0.01;
    track.addEventListener("ended", () => {
      this.close();
      this.onDisconnect?.();
    });
    this.source = ctx.createMediaStreamSource(this.stream);
    this.tap = new AudioWorkletNode(ctx, "bs-recorder", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: "explicit" });
    this.tap.port.onmessage = (e: MessageEvent) => this.onTap(e.data as { frame?: number; data?: Float32Array; level?: number });
    const count = Math.max(1, Math.min(2, Number(settings.channelCount) || this.source.channelCount || 1));
    this.splitter = ctx.createChannelSplitter(2);
    this.chanGains = [ctx.createGain(), ctx.createGain()];
    this.mono = ctx.createGain();
    this.mono.channelCount = 1;
    this.mono.channelCountMode = "explicit";
    this.analysers = [ctx.createAnalyser(), ctx.createAnalyser()];
    this.source.connect(this.splitter);
    for (const i of [0, 1] as const) {
      this.splitter.connect(this.chanGains[i], i).connect(this.mono);
      this.splitter.connect(this.analysers[i], i);
      this.analysers[i].fftSize = 2048;
    }
    this.mono.connect(this.tap);
    this.channelState = { count, used: "left", levelsDb: [-120, -120] };
    this.chanPeakDb = [-120, -120];
    this.applyChannel(count === 1 ? "left" : this.inputChannel === "auto" ? "left" : this.inputChannel);
    this.chanTimer = setInterval(() => this.watchChannels(), 200);
    // Keep the tap pulled by the graph even when not monitoring.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    this.tap.connect(sink).connect(ctx.destination);
    if (this.monitorTarget) this.setMonitoring(this.monitorTarget);
  }

  /** Called when the input device disappears (unplugged). */
  onDisconnect: (() => void) | null = null;

  close(): void {
    if (this.chanTimer) clearInterval(this.chanTimer);
    this.chanTimer = null;
    for (const n of [this.splitter, this.mono, ...(this.chanGains ?? []), ...(this.analysers ?? [])]) n?.disconnect();
    this.splitter = this.mono = null;
    this.chanGains = null;
    this.analysers = null;
    this.stopCapture();
    this.tap?.port.postMessage({ dispose: true });
    this.tap?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.tap = null;
    this.source = null;
    this.stream = null;
    this.level = 0;
  }

  /** Choose the input channel (user setting). */
  setInputChannel(c: InputChannel): void {
    this.inputChannel = c;
    if (!this.chanGains) return;
    if (c !== "auto") this.applyChannel(this.channelState.count === 1 ? "left" : c);
    else this.watchChannels(true);
  }

  private applyChannel(used: Exclude<InputChannel, "auto">): void {
    if (!this.chanGains) return;
    const [l, r] = used === "left" ? [1, 0] : used === "right" ? [0, 1] : [0.5, 0.5];
    const t = this.engine.context!.currentTime;
    this.chanGains[0].gain.setTargetAtTime(l, t, 0.01);
    this.chanGains[1].gain.setTargetAtTime(r, t, 0.01);
    this.channelState.used = used;
  }

  /**
   * Measure each input; in "auto", use the input that carries the voice: when one input is
   * ≥ 12 dB louder than the other (an empty interface input only carries preamp hiss), only
   * that one is recorded. Never switches during a take.
   */
  private watchChannels(force = false): void {
    if (!this.analysers) return;
    const buf = new Float32Array(2048);
    for (const i of [0, 1] as const) {
      this.analysers[i].getFloatTimeDomainData(buf);
      let pk = 0;
      for (const x of buf) pk = Math.max(pk, Math.abs(x));
      const db = pk > 1e-6 ? 20 * Math.log10(pk) : -120;
      // Fast attack, slow decay: remembers the last time someone spoke on that input.
      this.chanPeakDb[i] = Math.max(db, this.chanPeakDb[i] - 0.4);
    }
    this.channelState.levelsDb = [Math.round(this.chanPeakDb[0]), Math.round(this.chanPeakDb[1])];
    if (this.inputChannel !== "auto" || (this.opts && !force)) return;
    const [l, r] = this.chanPeakDb;
    let used: Exclude<InputChannel, "auto"> = "mix";
    if (this.channelState.count === 1 || r < -90) used = "left";
    else if (l < -90) used = "right";
    else if (l - r >= 12) used = "left";
    else if (r - l >= 12) used = "right";
    if (used !== this.channelState.used) this.applyChannel(used);
  }

  /** Route the (raw) microphone into a vocal channel so it is heard through its live chain. */
  setMonitoring(trackId: string | null): void {
    this.monitorTarget = trackId;
    if (!this.tap) return;
    this.tap.disconnect();
    const ctx = this.engine.context!;
    const sink = ctx.createGain();
    sink.gain.value = 0;
    this.tap.connect(sink).connect(ctx.destination);
    if (trackId) {
      const input = this.engine.mixer?.inputOf(trackId);
      if (input) this.tap.connect(input);
    }
  }

  /** Estimated round-trip monitoring latency (input + processing + output), ms. */
  monitoringLatencyMs(): number {
    const l = this.engine.getLatency();
    return (this.inputLatency + (l ? l.totalMs / 1000 : 0)) * 1000;
  }

  private snapshot: Float32Array[] | null = null;

  private onTap(m: { frame?: number; data?: Float32Array; level?: number }): void {
    if (m.level !== undefined) {
      this.level = m.level;
      for (const fn of this.levelListeners) fn(m.level);
    }
    if (m.data && m.frame !== undefined && this.opts) this.chunks.push({ frame: m.frame, data: m.data });
    if (m.data && this.snapshot) this.snapshot.push(m.data);
  }

  /** Capture `seconds` of raw microphone input without touching the transport (AUTO VOICE). */
  async captureSnapshot(seconds: number): Promise<{ data: Float32Array; sampleRate: number }> {
    if (!this.tap) await this.open();
    if (this.opts) throw new RecorderError("Recording in progress.");
    this.snapshot = [];
    this.tap!.port.postMessage({ record: true });
    await new Promise((r) => setTimeout(r, seconds * 1000));
    this.tap!.port.postMessage({ record: false });
    const parts = this.snapshot;
    this.snapshot = null;
    const total = parts.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(total);
    let o = 0;
    for (const c of parts) {
      out.set(c, o);
      o += c.length;
    }
    return { data: out, sampleRate: this.engine.context!.sampleRate };
  }

  /**
   * Start recording: the transport starts `countInBars` before `startStep` (metronome clicks),
   * capture is aligned to the exact audio frame where `startStep` sounds.
   */
  async start(o: RecordingOptions): Promise<void> {
    if (!this.tap) await this.open();
    if (this.opts) return;
    const p = this.engineProject();
    const spb = stepsPerBarOf(p);
    this.opts = o;
    this.chunks = [];
    this.recordFrame = -1;
    this.stopFrame = -1;
    const ctx = this.engine.context!;
    const target = o.punch ? o.punch[0] : o.startStep;
    this.unsubscribe = this.engine.onStep((pos, time) => {
      if (pos === target && this.recordFrame < 0) this.recordFrame = Math.round(time * ctx.sampleRate);
      if (o.punch && pos === o.punch[1] && this.stopFrame < 0) this.stopFrame = Math.round(time * ctx.sampleRate);
    });
    this.tap!.port.postMessage({ record: true });
    this.engine.stop();
    this.engine.setMode("song");
    this.engine.metronomeForced = p.metronome.enabled;
    this.engine.holdAtSongEnd = !o.punch;
    await this.engine.play(o.startStep - o.countInBars * spb);
  }

  private engineProject() {
    return this.engine.getProject();
  }

  private stopCapture(): void {
    this.engine.holdAtSongEnd = false;
    this.tap?.port.postMessage({ record: false });
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Stop the transport and return the aligned take (null if nothing usable was captured). */
  stop(): RecordedTake | null {
    const o = this.opts;
    if (!o) return null;
    this.stopCapture();
    this.engine.stop();
    this.engine.metronomeForced = false;
    this.opts = null;
    const ctx = this.engine.context!;
    const sr = ctx.sampleRate;
    if (this.recordFrame < 0 || !this.chunks.length) return null;
    // What the singer hears at position P was rendered at T_P and reaches the speakers after
    // the output latency; their voice then needs the input latency to come back in.
    const lat = this.engine.getLatency();
    const compensation = (lat ? lat.totalMs / 1000 : 0) + this.inputLatency;
    const startFrame = this.recordFrame + Math.round(compensation * sr);
    const endFrame = this.stopFrame > 0 ? this.stopFrame + Math.round(compensation * sr) : Infinity;
    const first = this.chunks[0].frame;
    const lastChunk = this.chunks[this.chunks.length - 1];
    const total = Math.min(lastChunk.frame + lastChunk.data.length, endFrame) - startFrame;
    if (total < sr * 0.1) return null;
    const out = new Float32Array(total);
    let peak = 0;
    for (const c of this.chunks) {
      for (let i = 0; i < c.data.length; i++) {
        const idx = c.frame + i - startFrame;
        if (idx >= 0 && idx < total) {
          out[idx] = c.data[i];
          const a = Math.abs(c.data[i]);
          if (a > peak) peak = a;
        }
      }
    }
    void first;
    this.chunks = [];
    return { data: out, sampleRate: sr, startStep: o.punch ? o.punch[0] : o.startStep, compensation, peak };
  }
}
