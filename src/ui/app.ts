// Application controller: owns the store, audio engine, recorder, MIDI, media (samples and
// recorded audio), persistence, AI preview and keyboard shortcuts. Views only call into it.

import { AudioEngine, decodeAudio, type EngineConfig } from "../audio/engine.ts";
import { exportProject, type ExportOptions } from "../audio/export.ts";
import { MidiController, GM_DRUMS } from "../audio/midi.ts";
import { Recorder, RecorderError } from "../audio/recorder.ts";
import { renderProject, type RenderMedia } from "../audio/render.ts";
import { processTake } from "../audio/studio.ts";
import { AUTO_PITCH_PRESETS, type AutoPitchPreset } from "../core/dsp/autopitch.ts";
import { encodeWav, decodeWav } from "../core/io/wav.ts";
import { currentPattern, newId, secondsToSteps, stepsPerBarOf } from "../core/project.ts";
import { parseProject, ProjectFileError, projectToJson, referencedAssetIds, safeFileName, serializeProject } from "../core/projectFile.ts";
import type { Action } from "../core/reducer.ts";
import { ProjectStore } from "../core/store.ts";
import { projectFromTemplate } from "../core/templates.ts";
import type { AudioAsset, Project, Take } from "../core/types.ts";
import { confirmDialog, h, readFileBytes, toast } from "./dom.ts";
import {
  clearAutosave, forgetFileHandle, loadSettings, markSessionClosed, markSessionOpen, pickFile, pruneMedia,
  readAutosave, readMedia, saveProjectFile, saveSettings, writeAutosave, writeMedia, type AppSettings,
} from "./persistence.ts";
import { createShell } from "./shell.ts";

export const AUDIO_ACCEPT = ".wav,.mp3,.aif,.aiff,.ogg,.flac,audio/*";
const AUTOSAVE_DELAY_MS = 1500;

export interface View {
  el: HTMLElement;
  update(p: Project): void;
  /** Called every animation frame while the view is visible. */
  frame?(): void;
  /** Called when the view is removed. */
  dispose?(): void;
}

/** Bridge exposed by electron/preload.cjs (absent in the browser build). */
export interface DesktopBridge {
  askClaude(req: { apiKey: string; model: string; system: string; messages: { role: "user" | "assistant"; content: string }[] }): Promise<{ text?: string; error?: string; refusal?: boolean }>;
  metrics(): Promise<{ cpuPercent: number; memoryMB: number }>;
}

export function desktop(): DesktopBridge | null {
  return (window as unknown as { beatmakerDesktop?: DesktopBridge }).beatmakerDesktop ?? null;
}

export class App {
  readonly store: ProjectStore;
  readonly engine: AudioEngine;
  readonly recorder: Recorder;
  readonly midi = new MidiController();
  settings: AppSettings;
  /** Imported drum samples: original bytes. */
  readonly sampleBytes = new Map<string, Uint8Array>();
  /** Recorded / processed audio: WAV bytes (what is saved). */
  readonly audioBytes = new Map<string, Uint8Array>();
  lastAutosave: Date | null = null;
  fileName: string | null = null;
  selectedTrackId: string | null = null;
  /** Instrument receiving MIDI keyboard notes / piano-roll auditions. */
  selectedInstrumentId: string | null = null;
  /** AI PREVIEW: when set, the engine plays this project instead of the store's. */
  private preview: Project | null = null;
  previewLabel = "";
  /** Notes captured from the MIDI keyboard while recording into the piano roll. */
  midiRecord = false;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private autosaveCount = 0;
  private listeners = new Set<() => void>();
  busy: string | null = null;

  constructor() {
    this.settings = loadSettings();
    this.store = new ProjectStore(projectFromTemplate("trap", "Untitled Beat"));
    this.engine = new AudioEngine(() => this.preview ?? this.store.getState());
    this.recorder = new Recorder(this.engine);
    this.recorder.inputDeviceId = this.settings.inputDevice;
    this.recorder.onDisconnect = () => toast("Audio device disconnected: the microphone was unplugged or disabled.", "error", 8000);
    this.store.subscribe(() => {
      this.engine.sync();
      this.scheduleAutosave();
    });
    this.engine.onChange(() => this.emit());
    this.engine.onEnded = () => this.emit();
    this.installMidi();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    for (const fn of this.listeners) fn();
  }

  dispatch = (a: Action, coalesceKey?: string): void => this.store.dispatch(a, coalesceKey ? { coalesceKey } : {});

  /** Run a long task with a busy indicator; errors become a clear message instead of a crash. */
  async task<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    this.busy = label;
    this.emit();
    try {
      return await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error", 8000);
      return undefined;
    } finally {
      this.busy = null;
      this.emit();
    }
  }

  // --- audio ------------------------------------------------------------------------

  engineConfig(): EngineConfig {
    const s = this.settings;
    const rate = s.sampleRate === "auto" ? undefined : s.sampleRate;
    const latencyHint = typeof s.latency === "number" ? s.latency / (rate ?? 48000) : s.latency;
    return { latencyHint, sampleRate: rate };
  }

  async ensureAudio(): Promise<boolean> {
    try {
      await this.engine.init(this.engineConfig());
      if (this.settings.outputDevice && this.engine.outputDevice !== this.settings.outputDevice) {
        await this.engine.setOutputDevice(this.settings.outputDevice).catch(() => toast("Audio device unavailable: the selected output was not found, using the default output.", "error"));
      }
      if (!this.engine.workletReady) toast(`Moteur d'effets indisponible (${this.engine.workletError}) : effets dynamiques désactivés.`, "error", 8000);
      return true;
    } catch (e) {
      toast(`Impossible de démarrer l'audio : ${(e as Error).message}`, "error", 6000);
      return false;
    }
  }

  async togglePlay(): Promise<void> {
    if (this.recorder.isRecording) return this.stopRecording();
    if (!this.engine.isPlaying && !(await this.ensureAudio())) return;
    await this.engine.toggle();
  }

  /** PAUSE: keeps the position; while recording, the take recorded so far is kept. */
  pause(): void {
    if (this.recorder.isRecording) {
      const pos = this.engine.currentPosition();
      void this.stopRecording().then(() => {
        this.engine.cursor = Math.max(0, Math.floor(pos));
        this.emit();
      });
      return;
    }
    this.engine.pause();
  }

  stop(): void {
    if (this.recorder.isRecording) {
      void this.stopRecording();
      return;
    }
    this.engine.stop();
  }

  async applySettings(next: AppSettings): Promise<void> {
    const prev = this.settings;
    this.settings = next;
    saveSettings(next);
    if ((next.latency !== prev.latency || next.sampleRate !== prev.sampleRate) && this.engine.isReady) await this.ensureAudio();
    if (next.outputDevice !== prev.outputDevice && this.engine.isReady) {
      await this.engine.setOutputDevice(next.outputDevice).catch((e) => toast(`Audio device unavailable: ${(e as Error).message}`, "error"));
    }
    if (next.inputDevice !== prev.inputDevice) {
      this.recorder.inputDeviceId = next.inputDevice;
      if (this.recorder.isOpen) await this.openMic().catch(() => {});
    }
    this.midi.outputId = next.midiOutput;
    this.emit();
  }

  media(): RenderMedia {
    const samples = new Map<string, AudioBuffer>();
    const assets = new Map<string, AudioBuffer>();
    for (const s of this.store.getState().samples) {
      const b = this.engine.seq?.samples.get(s.id);
      if (b) samples.set(s.id, b);
    }
    for (const a of this.store.getState().assets) {
      const b = this.engine.getAsset(a.id);
      if (b) assets.set(a.id, b);
    }
    return { samples, assets };
  }

  // --- AI preview (PREVIEW → APPLY / CANCEL) ------------------------------------------

  get previewActive(): boolean {
    return this.preview !== null;
  }

  /** Hear the project with `actions` applied, without touching the real project/history. */
  startPreview(label: string, actions: Action[] | Project): void {
    const base = this.store.getState();
    this.preview = Array.isArray(actions) ? actions.reduce((p, a) => this.reducePreview(p, a), base) : actions;
    this.previewLabel = label;
    this.engine.sync();
    this.emit();
  }

  private reducePreview(p: Project, a: Action): Project {
    // Local import keeps the reducer pure and shared.
    return reduceAction(p, a);
  }

  cancelPreview(): void {
    if (!this.preview) return;
    this.preview = null;
    this.previewLabel = "";
    this.engine.sync();
    this.emit();
  }

  applyActions(actions: Action[], label = ""): void {
    this.preview = null;
    this.previewLabel = "";
    if (actions.length) this.store.dispatch({ type: "batch", actions });
    this.engine.sync();
    if (label) toast(label, "ok");
    this.emit();
  }

  // --- projects --------------------------------------------------------------------

  private async confirmDiscard(): Promise<boolean> {
    if (!this.store.isDirty()) return true;
    return confirmDialog(
      "Modifications non sauvegardées",
      "Le projet actuel contient des modifications non sauvegardées dans un fichier. Elles restent dans la sauvegarde automatique jusqu'au prochain changement. Continuer ?",
      "Continuer", "Annuler", true,
    );
  }

  private async loadProject(p: Project, samples: Map<string, Uint8Array>, audio: Map<string, Uint8Array>, warnings: string[] = []): Promise<void> {
    this.engine.stop();
    this.cancelPreview();
    this.engine.clearMedia();
    this.sampleBytes.clear();
    this.audioBytes.clear();
    for (const [id, b] of samples) this.sampleBytes.set(id, b);
    for (const [id, b] of audio) this.audioBytes.set(id, b);
    if ((samples.size || audio.size) && (await this.ensureAudio())) {
      for (const s of p.samples) {
        const b = samples.get(s.id);
        if (!b) continue;
        try {
          await this.engine.loadSample(s.id, b);
        } catch {
          warnings.push(`Le sample "${s.name}" n'a pas pu être décodé : son intégré utilisé.`);
        }
      }
      for (const a of p.assets) {
        const b = audio.get(a.id);
        if (!b) continue;
        try {
          const pcm = decodeWav(b);
          this.engine.setAsset(a.id, this.engine.createBuffer(pcm.channels, pcm.sampleRate));
        } catch {
          warnings.push(`L'audio "${a.name}" est illisible.`);
        }
      }
    }
    this.store.load(p);
    this.selectedInstrumentId = p.instruments[0]?.id ?? null;
    for (const w of warnings) toast(w, "error", 7000);
  }

  async newProject(templateId: string): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    forgetFileHandle();
    this.fileName = null;
    await this.loadProject(projectFromTemplate(templateId), new Map(), new Map());
    toast("Nouveau projet créé.", "ok");
  }

  async openProject(file?: File | null): Promise<boolean> {
    if (!(await this.confirmDiscard())) return false;
    const f = file ?? (await pickFile(".bsproj,application/json,application/zip"));
    if (!f) return false;
    try {
      const parsed = parseProject(await readFileBytes(f));
      forgetFileHandle();
      this.fileName = f.name;
      await this.loadProject(parsed.project, parsed.samples, parsed.audio, parsed.warnings);
      await this.persistMedia();
      toast(`Projet « ${parsed.project.name} » ouvert.`, "ok");
      return true;
    } catch (e) {
      toast(e instanceof ProjectFileError ? e.message : `Project could not be loaded: ${(e as Error).message}`, "error", 7000);
      return false;
    }
  }

  bundle(): Uint8Array {
    return serializeProject(this.store.getState(), { samples: this.sampleBytes, audio: this.audioBytes });
  }

  async saveProject(saveAs = false): Promise<void> {
    try {
      const name = await saveProjectFile(this.bundle(), safeFileName(this.store.getState().name), saveAs);
      if (!name) return;
      this.fileName = name;
      this.store.markSaved();
      await this.autosaveNow();
      toast(`Projet sauvegardé : ${name}`, "ok");
    } catch (e) {
      toast(`Échec de la sauvegarde : ${(e as Error).message}`, "error", 7000);
    }
  }

  async exportAudio(o: Omit<ExportOptions, "onProgress">): Promise<void> {
    if (!(await this.ensureAudio())) return;
    this.engine.stop();
    await this.task("Export…", async () => {
      const res = await exportProject(this.store.getState(), this.media(), {
        ...o,
        onProgress: (label, f) => {
          this.busy = `Export ${label} ${Math.round(f * 100)} %`;
          this.emit();
        },
      });
      for (const f of res.files) downloadFile(f.name, f.bytes, f.mime);
      const m = res.measurements;
      toast(m ? `Export terminé : ${res.files[0].name} — ${m.integratedLufs.toFixed(1)} LUFS, true peak ${m.truePeakDb.toFixed(1)} dBTP.` : `Export terminé : ${res.files[0].name}`, "ok", 9000);
      this.lastExport = { files: res.files.map((f) => ({ name: f.name, size: f.bytes.length })), measurements: m };
      this.emit();
    });
  }

  lastExport: { files: { name: string; size: number }[]; measurements: import("../core/dsp/loudness.ts").MixMeasurements | null } | null = null;

  // --- samples ---------------------------------------------------------------------

  async importSample(trackId: string, file?: File | null): Promise<void> {
    const f = file ?? (await pickFile(AUDIO_ACCEPT));
    if (!f) return;
    if (!(await this.ensureAudio())) return;
    const bytes = await readFileBytes(f);
    const id = newId("smp");
    try {
      await this.engine.loadSample(id, bytes);
    } catch {
      toast(`Format non supporté ou fichier corrompu : ${f.name}`, "error", 6000);
      return;
    }
    this.sampleBytes.set(id, bytes);
    void writeMedia("sample", id, bytes);
    this.store.dispatch({ type: "batch", actions: [{ type: "addSample", sample: { id, name: f.name, mime: f.type || "audio/*" } }, { type: "assignSample", trackId, sampleId: id }] });
    toast(`Sample chargé : ${f.name}`, "ok");
  }

  // --- recording ----------------------------------------------------------------------

  async openMic(): Promise<boolean> {
    if (!(await this.ensureAudio())) return false;
    try {
      await this.recorder.open(this.settings.inputDevice);
      this.emit();
      return true;
    } catch (e) {
      toast(e instanceof RecorderError ? e.message : `Microphone unavailable: ${(e as Error).message}`, "error", 8000);
      return false;
    }
  }

  armedTrack() {
    const p = this.store.getState();
    return p.vocals.find((v) => v.armed) ?? p.vocals[0];
  }

  /** R / RECORD: record on the armed vocal track from the song cursor (with count-in). */
  async startRecording(opts: { punch?: boolean } = {}): Promise<void> {
    const track = this.armedTrack();
    if (!track) return void toast("Ajoutez une piste vocale pour enregistrer.", "error");
    if (!this.recorder.isOpen && !(await this.openMic())) return;
    const p = this.store.getState();
    const spb = stepsPerBarOf(p);
    const loop = p.arrangement.loop;
    const punch: [number, number] | undefined = opts.punch && loop.enabled ? [loop.start * spb, loop.end * spb] : undefined;
    const start = punch ? Math.max(0, punch[0] - spb) : Math.round(this.engine.cursor);
    try {
      await this.recorder.start({ trackId: track.id, startStep: start, countInBars: punch ? 0 : p.metronome.countInBars, punch });
      this.emit();
    } catch (e) {
      toast((e as Error).message, "error", 8000);
    }
  }

  async stopRecording(): Promise<void> {
    const track = this.armedTrack();
    const take = this.recorder.stop();
    this.emit();
    if (!take || !track) {
      toast("Enregistrement trop court : rien n'a été gardé.", "error");
      return;
    }
    const assetId = newId("aud");
    const n = track.takes.length + 1;
    const wav = encodeWav({ sampleRate: take.sampleRate, channels: [take.data] }, 24);
    this.audioBytes.set(assetId, wav);
    this.engine.setAsset(assetId, this.engine.createBuffer([take.data], take.sampleRate));
    void writeMedia("audio", assetId, wav);
    const asset: AudioAsset = { id: assetId, name: `${track.name} take ${n}`, sampleRate: take.sampleRate, frames: take.data.length, channels: 1 };
    const t: Take = { id: newId("take"), name: `Take ${n}`, assetId, startStep: take.startStep, recordedAt: new Date().toISOString() };
    this.store.dispatch({ type: "addTake", trackId: track.id, take: t, asset, clip: { takeId: t.id, start: take.startStep, offset: 0, duration: take.data.length / take.sampleRate, gainDb: 0 } });
    this.engine.cursor = take.startStep;
    const clipped = take.peak >= 0.99;
    toast(`${t.name} enregistrée sur « ${track.name} » (${(take.data.length / take.sampleRate).toFixed(1)} s, latence compensée ${(take.compensation * 1000).toFixed(0)} ms).${clipped ? " ⚠ Saturation détectée : baissez le gain du micro." : ""}`, clipped ? "error" : "ok", 8000);
  }

  /** Audio data of a take (raw or processed). */
  takeData(take: Take, processed = false): { data: Float32Array; sampleRate: number } | null {
    const buf = this.engine.getAsset(processed && take.processedAssetId ? take.processedAssetId : take.assetId);
    if (!buf) return null;
    return { data: buf.getChannelData(0), sampleRate: buf.sampleRate };
  }

  /** STUDIO processing (AI VOICE CLEAN + STUDIO PITCH) of every take of a track, non-destructive. */
  async processVocalTrack(trackId: string): Promise<void> {
    const p = this.store.getState();
    const v = p.vocals.find((x) => x.id === trackId);
    if (!v || !v.takes.length) return void toast("Aucune prise à traiter sur cette piste.", "error");
    const st = v.studio;
    if (st.clean === "off" && !st.pitch.enabled) {
      for (const t of v.takes) if (t.processedAssetId) this.dispatch({ type: "setTakeProcessed", trackId, takeId: t.id, asset: null });
      return void toast("Traitement STUDIO désactivé : lecture des prises brutes.", "ok");
    }
    const preset = AUTO_PITCH_PRESETS[st.pitch.preset as AutoPitchPreset];
    const pitch = st.pitch.enabled ? { key: p.key, correction: st.pitch.correction, retuneMs: st.pitch.retuneMs, humanize: st.pitch.humanize, formant: st.pitch.formant } : null;
    void preset;
    const sig = JSON.stringify({ clean: st.clean, pitch, key: p.key });
    await this.task("Traitement STUDIO…", async () => {
      let i = 0;
      for (const t of v.takes) {
        i++;
        this.busy = `Traitement STUDIO ${i}/${v.takes.length}…`;
        this.emit();
        if (t.processedWith === sig && t.processedAssetId && this.engine.getAsset(t.processedAssetId)) continue;
        const raw = this.takeData(t);
        if (!raw) continue;
        const out = await processTake(raw.data, raw.sampleRate, st.clean, pitch);
        const id = newId("aud");
        const wav = encodeWav({ sampleRate: raw.sampleRate, channels: [out] }, 24);
        this.audioBytes.set(id, wav);
        this.engine.setAsset(id, this.engine.createBuffer([out], raw.sampleRate));
        void writeMedia("audio", id, wav);
        this.dispatch({ type: "setTakeProcessed", trackId, takeId: t.id, asset: { id, name: `${t.name} (studio)`, sampleRate: raw.sampleRate, frames: out.length, channels: 1 }, processedWith: sig });
      }
      this.dispatch({ type: "updateVocalTrack", trackId, patch: { playProcessed: true } });
      toast("Traitement STUDIO terminé : comparez avec RAW / PROCESSED.", "ok");
    });
  }

  /** Render the current pattern or song to a buffer (generator previews). */
  async renderPreview(p: Project, mode: "pattern" | "song", loops = 1): Promise<AudioBuffer | null> {
    if (!(await this.ensureAudio())) return null;
    return renderProject(p, this.media(), { mode, loops, tail: 1 });
  }

  private stopPreviewBuffer: (() => void) | null = null;
  playPreviewBuffer(buf: AudioBuffer): void {
    this.stopPreviewBuffer?.();
    this.engine.stop();
    this.stopPreviewBuffer = this.engine.playBuffer(buf);
  }
  stopPreviewPlayback(): void {
    this.stopPreviewBuffer?.();
    this.stopPreviewBuffer = null;
  }

  // --- MIDI ---------------------------------------------------------------------------

  private midiHeld = new Map<number, { t: number; vel: number; step: number }>();

  private installMidi(): void {
    this.midi.onNote((e) => {
      const p = this.store.getState();
      // Pads on channel 10 → drum lanes.
      const drumKind = e.channel === 9 ? GM_DRUMS[e.note] : undefined;
      if (drumKind) {
        if (e.type !== "noteon") return;
        const t = p.tracks.find((x) => x.instrument === drumKind);
        if (!t) return;
        void this.engine.previewDrum(t.id);
        if (this.midiRecord && this.engine.isPlaying && this.engine.mode === "pattern") {
          const step = Math.round(this.engine.currentPosition()) % currentPattern(p).stepCount;
          this.dispatch({ type: "setStep", trackId: t.id, step, value: { on: true, velocity: e.velocity } });
        }
        return;
      }
      const ins = this.selectedInstrumentId ?? p.instruments[0]?.id;
      if (!ins) return;
      if (e.type === "noteon") {
        void this.engine.previewNote(ins, e.note, e.velocity, 4);
        this.midiHeld.set(e.note, { t: performance.now(), vel: e.velocity, step: this.engine.isPlaying ? this.engine.currentPosition() : -1 });
      } else {
        const held = this.midiHeld.get(e.note);
        this.midiHeld.delete(e.note);
        this.engine.seq?.stopAll();
        if (held && this.midiRecord && held.step >= 0 && this.engine.mode === "pattern") {
          const pat = currentPattern(p);
          const lenSteps = secondsToSteps((performance.now() - held.t) / 1000, p.bpm);
          const start = Math.round((held.step % pat.stepCount) * 4) / 4;
          this.dispatch({ type: "addNotes", trackId: ins, notes: [{ pitch: e.note, start, length: Math.max(0.25, Math.round(lenSteps * 4) / 4), velocity: held.vel }] });
        }
      }
      this.emit();
    });
    this.midi.onCC((e) => {
      const p = this.store.getState();
      const map = p.midiMappings.find((m) => m.source === e.source);
      if (!map) return;
      const v = e.value / 127;
      const parts = map.target.split(":");
      if (map.target === "master:volume") this.dispatch({ type: "setMasterVolume", volume: v * 1.5 }, "midi-master");
      else if (map.target === "bpm") this.dispatch({ type: "setBpm", bpm: 40 + v * 180 }, "midi-bpm");
      else if (parts[0] === "channel" && parts[2] === "volume") this.dispatch({ type: "updateChannel", channelId: parts[1], patch: { volume: v * 1.5 } }, `midi-${parts[1]}-vol`);
      else if (parts[0] === "channel" && parts[2] === "pan") this.dispatch({ type: "updateChannel", channelId: parts[1], patch: { pan: v * 2 - 1 } }, `midi-${parts[1]}-pan`);
    });
  }

  async enableMidi(): Promise<void> {
    if (await this.midi.enable()) {
      this.midi.outputId = this.settings.midiOutput;
      this.midi.onDevicesChange(() => this.emit());
    }
    this.emit();
  }

  /** MIDI LEARN: next controller moved is mapped to `target`. */
  learnMidi(target: string, label: string): void {
    if (!this.midi.enabled) return void toast("Activez le MIDI dans SETTINGS d'abord.", "error");
    toast(`MIDI LEARN : bougez un bouton/fader de votre contrôleur pour « ${label} »…`, "info", 6000);
    this.midi.startLearn((source) => {
      const maps = this.store.getState().midiMappings.filter((m) => m.target !== target && m.source !== source);
      this.dispatch({ type: "setMidiMappings", mappings: [...maps, { source, target }] });
      toast(`« ${label} » contrôlé par ${source}.`, "ok");
    });
  }

  // --- autosave & recovery ------------------------------------------------------------

  private scheduleAutosave(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.autosaveNow(), AUTOSAVE_DELAY_MS);
  }

  private async persistMedia(): Promise<void> {
    for (const [id, b] of this.sampleBytes) await writeMedia("sample", id, b);
    for (const [id, b] of this.audioBytes) await writeMedia("audio", id, b);
  }

  async autosaveNow(): Promise<void> {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    try {
      const p = this.store.getState();
      await this.persistMedia();
      await writeAutosave({ text: projectToJson(p), name: p.name, savedAt: new Date().toISOString(), unsaved: this.store.isDirty(), fileName: this.fileName });
      if (++this.autosaveCount % 20 === 0) await pruneMedia(new Set([...p.samples.map((s) => s.id), ...referencedAssetIds(p)]));
      this.lastAutosave = new Date();
      this.emit();
    } catch (e) {
      toast(`Sauvegarde automatique impossible : ${(e as Error).message}`, "error", 6000);
    }
  }

  async restoreOnStartup(): Promise<void> {
    const crashed = markSessionOpen();
    window.addEventListener("pagehide", () => markSessionClosed());
    window.addEventListener("beforeunload", (e) => {
      if (this.store.isDirty()) {
        void this.autosaveNow();
        e.preventDefault();
      }
    });
    const saved = await readAutosave();
    if (!saved) {
      this.selectedInstrumentId = this.store.getState().instruments[0]?.id ?? null;
      return;
    }
    if (crashed && saved.unsaved) {
      const ok = await confirmDialog(
        "Recover previous session?",
        `L'application ne s'est pas fermée correctement. Récupérer « ${saved.name} » (sauvegarde automatique du ${new Date(saved.savedAt).toLocaleString()}) ?`,
        "Récupérer", "Ignorer",
      );
      if (!ok) {
        await clearAutosave();
        return;
      }
    }
    try {
      const head = parseProject(saved.text);
      const samples = await readMedia("sample", head.project.samples.map((s) => s.id));
      const audio = await readMedia("audio", JSON.parse(saved.text).project.assets?.map((a: { id: string }) => a.id) ?? []);
      const parsed = parseProject(saved.text, { samples, audio });
      await this.loadProject(parsed.project, parsed.samples, parsed.audio, parsed.warnings);
      this.fileName = saved.fileName ?? null;
      if (saved.unsaved) this.store.markDirty();
      if (crashed && saved.unsaved) toast("Session récupérée.", "ok");
    } catch {
      toast("Project could not be loaded: la sauvegarde automatique est illisible et a été ignorée.", "error");
    }
  }

  // --- keyboard ------------------------------------------------------------------------

  installShortcuts(): void {
    document.addEventListener("keydown", (e) => {
      if (document.querySelector(".modal-overlay")) return;
      const target = e.target as HTMLElement;
      const typing =
        (target instanceof HTMLInputElement && !["range", "checkbox", "button"].includes(target.type)) ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "s") {
        e.preventDefault();
        void this.saveProject(e.shiftKey);
        return;
      }
      if (mod && key === "o") {
        e.preventDefault();
        void this.openProject();
        return;
      }
      if (typing || e.defaultPrevented) return;
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) this.store.redo();
        else this.store.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        this.store.redo();
        return;
      }
      if (mod || e.altKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        void this.togglePlay();
      } else if (key === "r") {
        e.preventDefault();
        if (this.recorder.isRecording) void this.stopRecording();
        else void this.startRecording();
      } else if ((key === "m" || key === "s") && this.selectedTrackId) {
        this.dispatch({ type: key === "m" ? "toggleMute" : "toggleSolo", trackId: this.selectedTrackId });
      } else if (key === "enter") {
        this.engine.seek(0);
      }
    });
  }
}

import { reduce as reduceAction } from "../core/reducer.ts";

export function downloadFile(name: string, bytes: Uint8Array, mime: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

export async function decodeFile(app: App, bytes: Uint8Array): Promise<AudioBuffer> {
  await app.ensureAudio();
  return decodeAudio(app.engine.context!, bytes);
}

export async function startApp(root: HTMLElement): Promise<App> {
  const app = new App();
  (window as unknown as { __app: App }).__app = app; // debugging / end-to-end tests
  // Never fail silently: unexpected errors become a visible message.
  window.addEventListener("error", (e) => toast(`Erreur inattendue : ${e.message}`, "error", 8000));
  window.addEventListener("unhandledrejection", (e) => toast(`Erreur inattendue : ${(e.reason as Error)?.message ?? e.reason}`, "error", 8000));
  app.installShortcuts();
  root.append(h("div", { class: "boot" }, "Chargement…"));
  await app.restoreOnStartup();
  if (app.settings.midiEnabled) void app.enableMidi();
  root.textContent = "";
  createShell(app, root);
  return app;
}
