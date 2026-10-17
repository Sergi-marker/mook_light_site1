// Application controller: owns the store, audio engine, recorder, MIDI, media (samples and
// recorded audio), persistence, AI preview and keyboard shortcuts. Views only call into it.

import { AudioEngine, decodeAudio, type EngineConfig } from "../audio/engine.ts";
import { exportProject, type ExportOptions } from "../audio/export.ts";
import { MidiController, GM_DRUMS } from "../audio/midi.ts";
import { clickBuffer } from "../audio/instruments.ts";
import { Recorder, RecorderError } from "../audio/recorder.ts";
import { renderProject, type RenderMedia } from "../audio/render.ts";
import { flipSample, processTake, voiceLayer } from "../audio/studio.ts";
import { chopRegions, flipPattern, mixToMono } from "../core/dsp/sampleFlip.ts";
import { parseLexicon, type Lexicon } from "../core/lyrics/writing.ts";
import type { Key } from "../core/music.ts";
import { HARMONY_STEPS, type HarmonyKind } from "../core/dsp/harmony.ts";
import { downlifter, impact, reverseCymbal, riser } from "../core/dsp/fx.ts";
import { dropAutomation, FX_LABELS, isDropLane, planTransitions, type FxPlacement } from "../core/ai/transitions.ts";
import { drumSample } from "../core/drumSamples.ts";
import { loadSample } from "../audio/sampler.ts";
import { AUTO_PITCH_PRESETS, type AutoPitchPreset } from "../core/dsp/autopitch.ts";
import { encodeWav, decodeWav } from "../core/io/wav.ts";
import { currentPattern, DEFAULT_SAMPLE_EDIT, emptySteps, getChannel, newId, secondsToSteps, stepsPerBarOf } from "../core/project.ts";
import { parseProject, ProjectFileError, projectToJson, referencedAssetIds, safeFileName, serializeProject } from "../core/projectFile.ts";
import type { Action } from "../core/reducer.ts";
import type { GeneratedSong } from "../core/ai/beat.ts";
import { emptyMemory, learn, type MemoryEvent, type SoundRole, type TasteMemory } from "../core/ai/memory.ts";
import { ProjectStore } from "../core/store.ts";
import { projectFromTemplate } from "../core/templates.ts";
import type { AudioAsset, AudioClip, Project, Take, Track } from "../core/types.ts";
import { confirmDialog, h, readFileBytes, toast } from "./dom.ts";
import {
  clearAutosave, forgetFileHandle, loadSettings, markSessionClosed, markSessionOpen, pickFile, pruneMedia,
  loadGuide, loadMemory, readAutosave, readMedia, saveGuide, saveMemory, saveProjectFile, saveSettings, writeAutosave, writeMedia, type AppSettings,
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
  /** One turn of the AI producer conversation (tools run in the renderer). */
  chatClaude?(req: { apiKey: string; model: string; system: string; tools: unknown[]; messages: ChatMessage[]; webSearch: boolean }): Promise<{ content?: ChatBlock[]; stop_reason?: string; error?: string }>;
  metrics(): Promise<{ cpuPercent: number; memoryMB: number }>;
}

/** Messages / content blocks of the Anthropic Messages API, as plain JSON (passed through unchanged). */
export type ChatBlock = { type: string; [k: string]: unknown };
export type ChatMessage = { role: "user" | "assistant"; content: string | ChatBlock[] };

export function desktop(): DesktopBridge | null {
  return (window as unknown as { beatmakerDesktop?: DesktopBridge }).beatmakerDesktop ?? null;
}

export class App {
  readonly store: ProjectStore;
  readonly engine: AudioEngine;
  readonly recorder: Recorder;
  readonly midi = new MidiController();
  settings: AppSettings;
  /** AI producer memory: your taste, learnt from your choices (stored only on this computer). */
  memory: TasteMemory = loadMemory();
  /** Last generated beat applied: what the AI chose, to learn from what you change afterwards. */
  private taste: { styleId: string; sounds: Record<SoundRole, string>; bpm: number; roleIds: Record<SoundRole, string>; kit: string | null } | null = null;
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

  dispatch = (a: Action, coalesceKey?: string): void => {
    this.observe(a);
    this.store.dispatch(a, coalesceKey ? { coalesceKey } : {});
  };

  // --- AI producer memory ------------------------------------------------------------

  /** Guided mode: a step that cannot be read from the project (master applied, export done…). */
  markGuide(step: string): void {
    const g = loadGuide();
    const k = this.store.getState().createdAt;
    if ((g[k] ??= []).includes(step)) return;
    g[k].push(step);
    saveGuide(g);
    this.emit();
  }

  guideDone(step: string): boolean {
    return loadGuide()[this.store.getState().createdAt]?.includes(step) ?? false;
  }

  remember(e: MemoryEvent): void {
    this.memory = learn(this.memory, e);
    saveMemory(this.memory);
  }

  forgetTaste(): void {
    this.memory = emptyMemory();
    this.taste = null;
    saveMemory(this.memory);
  }

  /** A generated beat was applied: remember it, and watch what you change afterwards. */
  startTasteSession(song: GeneratedSong): void {
    this.commitTasteSession();
    this.remember({ type: "apply", styleId: song.styleId, sounds: song.sounds });
    this.taste = { styleId: song.styleId, sounds: { ...song.sounds }, bpm: song.patch.bpm ?? this.store.getState().bpm, roleIds: song.roleIds, kit: null };
  }

  /** Learn the final tempo / kit of the last generated beat (next generation, or closing the app). */
  commitTasteSession(): void {
    const t = this.taste;
    if (!t) return;
    const bpm = this.store.getState().bpm;
    if (bpm !== t.bpm) this.remember({ type: "tempo", styleId: t.styleId, offset: bpm - t.bpm });
    if (t.kit) this.remember({ type: "kit", styleId: t.styleId, kitId: t.kit });
    this.taste = null;
  }

  /** You picked a library sound for an instrument (MELODY, commands). */
  noteSoundChoice(instrumentId: string, soundId: string): void {
    const t = this.taste;
    if (!t) return;
    const role = (Object.keys(t.roleIds) as SoundRole[]).find((r) => t.roleIds[r] === instrumentId);
    if (!role || t.sounds[role] === soundId) return;
    this.remember({ type: "soundChange", styleId: t.styleId, role, from: t.sounds[role], to: soundId });
    this.markGuide("adjust");
    t.sounds[role] = soundId;
  }

  private observe(a: Action): void {
    if (a.type === "batch") for (const x of a.actions) this.observe(x);
    else if (a.type === "applyDrumKit" && this.taste) this.taste.kit = a.kitId;
  }

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
    if (next.inputChannel !== prev.inputChannel) this.recorder.setInputChannel(next.inputChannel);
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
    for (const a of actions) this.observe(a);
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
      this.markGuide("export");
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

  // --- writing help -------------------------------------------------------------------

  private lexiconLoad: Promise<Lexicon | null> | null = null;

  /** French word list (assets/lexique, ~1.2 MB), loaded once, on first use. */
  lexicon(): Promise<Lexicon | null> {
    this.lexiconLoad ??= fetch(new URL("lexique/fr.tsv", document.baseURI).href)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(parseLexicon)
      .catch(() => {
        this.lexiconLoad = null; // try again next time
        return null;
      });
    return this.lexiconLoad;
  }

  // --- sample flip --------------------------------------------------------------------

  /** Seed of the last flip pattern (each « nouveau flip » takes the next one). */
  private flipSeed = 1;

  /** Lanes of the current sample flip, in chop order. */
  chopTracks(p = this.store.getState()): Track[] {
    return p.tracks.filter((t) => t.chop);
  }

  /**
   * SAMPLE FLIP: import a loop, bring it to the project's tempo and key, chop it on its attacks —
   * one BEAT lane per chop, all in one choke group (each chop cuts the previous one, like an MPC) —
   * and write a flip pattern in the current pattern. A new flip replaces the previous chops.
   */
  async sampleFlip(file?: File | null): Promise<{ name: string; sourceBpm: number; bars: number | null; sourceKey: Key | null; shift: number; chops: number; trimmed: boolean } | null> {
    const f = file ?? (await pickFile(AUDIO_ACCEPT));
    if (!f || !(await this.ensureAudio())) return null;
    let buf: AudioBuffer;
    try {
      buf = await decodeAudio(this.engine.context!, await readFileBytes(f));
    } catch {
      toast(`Format non supporté ou fichier corrompu : ${f.name}`, "error", 6000);
      return null;
    }
    const sr = buf.sampleRate;
    let data = mixToMono(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)));
    // 30 s is plenty for a loop and keeps the analysis quick.
    const trimmed = data.length > 30 * sr;
    if (trimmed) data = data.subarray(0, 30 * sr);
    const p = this.store.getState();
    const res = await flipSample(data, sr, p.bpm, p.key);
    const wav = encodeWav({ sampleRate: sr, channels: [res.output] }, 16);
    const sampleId = newId("smp");
    await this.engine.loadSample(sampleId, wav);
    this.sampleBytes.set(sampleId, wav);
    void writeMedia("sample", sampleId, wav);
    const name = f.name.replace(/\.[^.]+$/, "").slice(0, 40);
    const old = this.chopTracks(p);
    const actions: Action[] = old.map((t) => ({ type: "removeDrumTrack", trackId: t.id }));
    // The previous flipped sample goes too when nothing else plays it.
    for (const sid of new Set(old.map((t) => t.sampleId))) {
      if (sid && !p.tracks.some((t) => t.sampleId === sid && !t.chop)) actions.push({ type: "removeSample", sampleId: sid });
    }
    actions.push({ type: "addSample", sample: { id: sampleId, name: `${name} (flip ${p.bpm} BPM)`, mime: "audio/wav" } });
    const tracks: Track[] = chopRegions(res.points, res.output.length).map((r, i) => ({
      id: newId("trk"), name: `Chop ${i + 1}`, instrument: "perc", sampleId, pitch: 0, chokeGroup: 7, chop: true,
      sampleEdit: { ...DEFAULT_SAMPLE_EDIT, start: r.start, end: r.end, fadeOut: 0.01 },
    }));
    for (const track of tracks) actions.push({ type: "addDrumTrack", track });
    const stepDur = 60 / p.bpm / 4;
    this.flipSeed = 1;
    actions.push(...this.flipSteps(tracks, res.points.map((pt) => Math.round(pt / sr / stepDur)), "flip", this.flipSeed, p));
    this.applyActions(actions, "");
    return { name, sourceBpm: res.sourceBpm, bars: res.bars, sourceKey: res.sourceKey, shift: res.shift, chops: tracks.length, trimmed };
  }

  /** New flip of the current chops (« flip »: another rhythm and order; « original »: the loop as it was). */
  reflip(mode: "flip" | "original"): boolean {
    const p = this.store.getState();
    const chops = this.chopTracks(p);
    const buf = chops[0]?.sampleId ? this.engine.seq?.samples.get(chops[0].sampleId) : undefined;
    if (!chops.length || !buf) return false;
    if (mode === "flip") this.flipSeed++;
    const stepDur = 60 / p.bpm / 4;
    const starts = chops.map((t) => Math.round(((t.sampleEdit?.start ?? 0) * buf.duration) / stepDur));
    this.applyActions(this.flipSteps(chops, starts, mode, this.flipSeed, p), "");
    return true;
  }

  private flipSteps(chops: Track[], chopSteps: number[], mode: "flip" | "original", seed: number, p: Project): Action[] {
    const pat = currentPattern(p);
    const steps = chops.map(() => emptySteps(pat.stepCount));
    for (const e of flipPattern(chopSteps, pat.stepCount, mode, seed)) steps[e.chop][e.step] = { on: true, velocity: e.velocity };
    return chops.map((t, i) => ({ type: "setDrumSteps", trackId: t.id, steps: steps[i], patternId: pat.id }));
  }

  // --- recording ----------------------------------------------------------------------

  async openMic(): Promise<boolean> {
    if (!(await this.ensureAudio())) return false;
    try {
      this.recorder.inputChannel = this.settings.inputChannel;
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
    if (!p.arrangement.clips.length)
      toast("L'arrangement est vide : vous enregistrez sur le métronome seul. Pour entendre votre beat pendant la prise, placez vos patterns dans ARRANGEMENT.", "info", 8000);
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
    const quiet = take.peak < 0.06;
    const advice = clipped
      ? " ⚠ Saturation détectée : baissez le gain du micro (sur l'interface ou dans Windows) et refaites la prise."
      : quiet ? ` ⚠ Niveau très faible (pic ${(20 * Math.log10(Math.max(1e-6, take.peak))).toFixed(0)} dBFS) : rapprochez-vous du micro ou montez son gain.` : "";
    toast(`${t.name} enregistrée sur « ${track.name} » (${(take.data.length / take.sampleRate).toFixed(1)} s, latence compensée ${(take.compensation * 1000).toFixed(0)} ms).${advice}${this.settings.autoCleanTakes ? " Nettoyage automatique en cours (la version brute est conservée)…" : ""}`, clipped || quiet ? "error" : "ok", 8000);
    if (this.settings.autoCleanTakes) void this.autoCleanTake(track.id, t.id).catch((e) => toast(`Nettoyage automatique impossible : ${(e as Error).message}`, "error"));
  }

  /** Room-noise spectrum from the last MIC CHECK (only valid at the current sample rate). */
  roomProfile(): Float32Array | null {
    const m = this.settings.micCheck;
    const sr = this.engine.context?.sampleRate;
    return m && sr && m.sampleRate === sr ? Float32Array.from(m.profile) : null;
  }

  /**
   * Automatic, non-destructive cleaning of a new take (AI VOICE CLEAN with the room profile,
   * + STUDIO PITCH when enabled). Runs in the worker; RAW stays available.
   */
  private async autoCleanTake(trackId: string, takeId: string): Promise<void> {
    const p = this.store.getState();
    const v = p.vocals.find((x) => x.id === trackId);
    const t = v?.takes.find((x) => x.id === takeId);
    const raw = t && this.takeData(t);
    if (!v || !t || !raw) return;
    const clean = v.studio.clean !== "off" ? v.studio.clean : this.settings.micCheck?.clean ?? "low";
    const pitch = v.studio.pitch.enabled ? { key: p.key, correction: v.studio.pitch.correction, retuneMs: v.studio.pitch.retuneMs, humanize: v.studio.pitch.humanize, formant: v.studio.pitch.formant } : null;
    const profile = this.roomProfile();
    const out = await processTake(raw.data, raw.sampleRate, clean, pitch, profile);
    const id = newId("aud");
    const wav = encodeWav({ sampleRate: raw.sampleRate, channels: [out] }, 24);
    this.audioBytes.set(id, wav);
    this.engine.setAsset(id, this.engine.createBuffer([out], raw.sampleRate));
    void writeMedia("audio", id, wav);
    const sig = JSON.stringify({ clean, pitch, key: p.key, room: profile ? this.settings.micCheck?.at : null });
    this.dispatch({ type: "setTakeProcessed", trackId, takeId, asset: { id, name: `${t.name} (studio)`, sampleRate: raw.sampleRate, frames: out.length, channels: 1 }, processedWith: sig });
    this.dispatch({ type: "updateVocalTrack", trackId, patch: { playProcessed: true, studio: { ...v.studio, clean } } });
  }

  /** Audio data of a take (raw or processed). */
  takeData(take: Take, processed = false): { data: Float32Array; sampleRate: number } | null {
    const buf = this.engine.getAsset(processed && take.processedAssetId ? take.processedAssetId : take.assetId);
    if (!buf) return null;
    return { data: buf.getChannelData(0), sampleRate: buf.sampleRate };
  }

  /**
   * DOUBLES & HARMONIES: from the takes played on `trackId` (processed version when it exists),
   * create one new vocal track per layer — same clip positions, same vocal chain, mixed lower
   * and spread in stereo. One undo step for everything.
   */
  async makeVoiceLayers(trackId: string, kinds: (HarmonyKind | "double")[]): Promise<number> {
    const p = this.store.getState();
    const v = p.vocals.find((x) => x.id === trackId);
    if (!v || !v.clips.length || !kinds.length) return 0;
    const src = getChannel(p, v.id);
    const usedTakes = v.takes.filter((t) => v.clips.some((c) => c.takeId === t.id));
    const actions: Action[] = [];
    let made = 0;
    for (const [n, kind] of kinds.entries()) {
      const label = kind === "double" ? "Double" : HARMONY_STEPS[kind].label;
      const newTrack = newId("voc");
      actions.push({ type: "addVocalTrack", role: kind === "double" ? "double" : "backing", name: `${v.name} — ${label}`.slice(0, 40), id: newTrack });
      const takeMap = new Map<string, string>();
      for (const t of usedTakes) {
        const raw = this.takeData(t, v.playProcessed);
        if (!raw) continue;
        const out = await voiceLayer(raw.data, raw.sampleRate, p.key, kind, n + 1);
        const assetId = newId("aud");
        const wav = encodeWav({ sampleRate: raw.sampleRate, channels: [out] }, 24);
        this.audioBytes.set(assetId, wav);
        this.engine.setAsset(assetId, this.engine.createBuffer([out], raw.sampleRate));
        void writeMedia("audio", assetId, wav);
        const takeId = newId("take");
        takeMap.set(t.id, takeId);
        actions.push({ type: "addTake", trackId: newTrack, take: { id: takeId, name: `${t.name} (${label})`, assetId, startStep: t.startStep, recordedAt: new Date().toISOString() }, asset: { id: assetId, name: `${t.name} (${label})`, sampleRate: raw.sampleRate, frames: out.length, channels: 1 }, clip: null });
      }
      if (!takeMap.size) continue;
      actions.push({ type: "setAudioClips", trackId: newTrack, clips: v.clips.filter((c) => takeMap.has(c.takeId)).map(({ id: _id, ...c }) => ({ ...c, takeId: takeMap.get(c.takeId)! })) });
      // Same vocal chain as the lead; doubles −6 dB, harmonies −8 dB, alternately left / right.
      if (src) actions.push({ type: "setInserts", channelId: newTrack, inserts: src.inserts.map((e) => ({ ...e, id: newId("fx") })) });
      const side = n % 2 === 0 ? -1 : 1;
      actions.push({ type: "updateChannel", channelId: newTrack, patch: { volume: Math.round((src?.volume ?? 0.8) * 10 ** ((kind === "double" ? -6 : -8) / 20) * 1000) / 1000, pan: side * (kind === "double" ? 0.35 : 0.5), sends: { reverb: Math.min(1, (src?.sends.reverb ?? 0.15) + 0.1) } } });
      made++;
    }
    if (made) this.applyActions(actions, "");
    return made;
  }

  /**
   * TRANSITIONS: risers before choruses, impacts on their downbeat, downlifters after them,
   * reverse cymbals into verses / bridges (+ optional drums cut on the last beat before each
   * chorus). Placed as clips on an "FX / Transitions" audio track. One undo step.
   */
  async addTransitions(withDrops = true): Promise<{ placed: FxPlacement[]; drops: number } | null> {
    if (!(await this.ensureAudio())) return null;
    const p = this.store.getState();
    const plan = planTransitions(p);
    if (!plan.length) return { placed: [], drops: 0 };
    const sr = this.engine.context!.sampleRate;
    const crashInfo = drumSample("crash");
    const crash = crashInfo ? (await loadSample(this.engine.context!, crashInfo.file))?.getChannelData(0) : undefined;
    const existing = p.vocals.find((v) => v.role === "fx");
    const trackId = existing?.id ?? newId("voc");
    const actions: Action[] = existing ? [] : [{ type: "addVocalTrack", role: "fx", name: "FX / Transitions", id: trackId }];
    // One rendered sound per kind and length.
    const takes = new Map<string, string>();
    const clips: Omit<AudioClip, "id">[] = [];
    for (const f of plan) {
      const key = `${f.kind}:${f.duration.toFixed(3)}`;
      if (!takes.has(key)) {
        const data = f.kind === "riser" ? riser(sr, f.duration) : f.kind === "downlifter" ? downlifter(sr, f.duration) : f.kind === "impact" ? impact(sr, f.duration) : reverseCymbal(sr, f.duration, crash);
        const assetId = newId("aud"), takeId = newId("take");
        const wav = encodeWav({ sampleRate: sr, channels: [data] }, 24);
        this.audioBytes.set(assetId, wav);
        this.engine.setAsset(assetId, this.engine.createBuffer([data], sr));
        void writeMedia("audio", assetId, wav);
        actions.push({ type: "addTake", trackId, take: { id: takeId, name: FX_LABELS[f.kind], assetId, startStep: 0, recordedAt: new Date().toISOString() }, asset: { id: assetId, name: FX_LABELS[f.kind], sampleRate: sr, frames: data.length, channels: 1 }, clip: null });
        takes.set(key, takeId);
      }
      clips.push({ takeId: takes.get(key)!, start: f.start, offset: 0, duration: f.duration, gainDb: f.kind === "impact" ? -2 : -4 });
    }
    actions.push({ type: "setAudioClips", trackId, clips });
    // Cuts from a previous run are replaced (or removed when no longer wanted).
    for (const l of p.automation.filter(isDropLane)) actions.push({ type: "removeAutomation", laneId: l.id });
    const lanes = withDrops ? dropAutomation(p) : [];
    for (const lane of lanes) actions.push({ type: "setAutomation", lane });
    this.applyActions(actions, "");
    return { placed: plan, drops: lanes.length ? p.arrangement.sections.filter((x) => /chorus|refrain|hook|drop/i.test(x.name) && x.start > 0).length : 0 };
  }

  /**
   * Record the mic while a metronome plays: 1 bar of count-in, then `bars` bars (current tempo).
   * Used by HUM → MELODY and BEATBOX → DRUMS. Latency is corrected later from the onsets.
   */
  async captureOverClick(bars: number, onPhase?: (msg: string) => void): Promise<{ data: Float32Array; sampleRate: number; countIn: number } | null> {
    if (!this.recorder.isOpen && !(await this.openMic())) return null;
    const ctx = this.engine.context!;
    const p = this.store.getState();
    const beat = 60 / p.bpm;
    const beats = (bars + 1) * 4;
    const sr = ctx.sampleRate;
    const click = new Float32Array(Math.ceil((beats * beat + 0.2) * sr));
    for (let b = 0; b < beats; b++) {
      const src = clickBuffer(ctx, b % 4 === 0).getChannelData(0);
      click.set(src.subarray(0, Math.min(src.length, click.length - Math.round(b * beat * sr))), Math.round(b * beat * sr));
    }
    this.engine.stop();
    onPhase?.("1 mesure de décompte…");
    const stop = this.engine.playBuffer(this.engine.createBuffer([click], sr));
    const timer = setTimeout(() => onPhase?.("À toi !"), 4 * beat * 1000);
    try {
      const snap = await this.recorder.captureSnapshot(beats * beat + 0.25);
      return { ...snap, countIn: 4 * beat };
    } finally {
      clearTimeout(timer);
      stop();
    }
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
    const profile = this.roomProfile();
    const sig = JSON.stringify({ clean: st.clean, pitch, key: p.key, room: profile ? this.settings.micCheck?.at : null });
    await this.task("Traitement STUDIO…", async () => {
      let i = 0;
      for (const t of v.takes) {
        i++;
        this.busy = `Traitement STUDIO ${i}/${v.takes.length}…`;
        this.emit();
        if (t.processedWith === sig && t.processedAssetId && this.engine.getAsset(t.processedAssetId)) continue;
        const raw = this.takeData(t);
        if (!raw) continue;
        const out = await processTake(raw.data, raw.sampleRate, st.clean, pitch, profile);
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
    window.addEventListener("pagehide", () => {
      this.commitTasteSession();
      markSessionClosed();
    });
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
