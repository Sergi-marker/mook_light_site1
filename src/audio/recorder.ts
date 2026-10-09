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
          channelCount: { ideal: 1 },
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
    this.source.connect(this.tap);
    // Keep the tap pulled by the graph even when not monitoring.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    this.tap.connect(sink).connect(ctx.destination);
    if (this.monitorTarget) this.setMonitoring(this.monitorTarget);
  }

  /** Called when the input device disappears (unplugged). */
  onDisconnect: (() => void) | null = null;

  close(): void {
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
    await this.engine.play(o.startStep - o.countInBars * spb);
  }

  private engineProject() {
    return this.engine.getProject();
  }

  private stopCapture(): void {
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
