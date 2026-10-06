import { AudioEngine, type EngineConfig } from "../core/engine.ts";
import { ProjectStore } from "../core/store.ts";
import { newId } from "../core/project.ts";
import { parseProject, ProjectFileError, safeFileName, serializeProject } from "../core/projectFile.ts";
import { projectFromTemplate } from "../core/templates.ts";
import type { Project } from "../core/types.ts";
import { confirmDialog, h, readFileBytes, toast } from "./dom.ts";
import {
  clearAutosave,
  forgetFileHandle,
  loadSettings,
  markSessionClosed,
  markSessionOpen,
  pickFile,
  readAutosave,
  saveProjectFile,
  saveSettings,
  writeAutosave,
  type AppSettings,
} from "./persistence.ts";
import { createShell } from "./shell.ts";

export const AUDIO_ACCEPT = ".wav,.mp3,.aif,.aiff,.ogg,.flac,audio/*";
const AUTOSAVE_DELAY_MS = 1500;

export interface View {
  el: HTMLElement;
  update(p: Project): void;
  /** Called every animation frame while the view is visible. */
  frame?(): void;
}

/**
 * Application controller: owns the store, the audio engine, sample bytes, persistence
 * and the keyboard shortcuts. Views only call methods on this object.
 */
export class App {
  readonly store: ProjectStore;
  readonly engine: AudioEngine;
  settings: AppSettings;
  /** Original bytes of imported samples, embedded on save. */
  readonly sampleBytes = new Map<string, Uint8Array>();
  lastAutosave: Date | null = null;
  /** Name of the project file last opened/saved; null = never written to a file. */
  fileName: string | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    this.settings = loadSettings();
    this.store = new ProjectStore(projectFromTemplate("trap", "Untitled Beat"));
    this.engine = new AudioEngine(this.store.getState);
    this.store.subscribe(() => {
      this.engine.syncMixer();
      this.scheduleAutosave();
    });
    this.engine.onChange(() => this.emit());
  }

  /** UI-level change notifications (engine state, settings, save status). */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    for (const fn of this.listeners) fn();
  }

  engineConfig(): EngineConfig {
    const s = this.settings;
    const rate = s.sampleRate === "auto" ? undefined : s.sampleRate;
    const latencyHint = typeof s.latency === "number" ? s.latency / (rate ?? 48000) : s.latency;
    return { latencyHint, sampleRate: rate };
  }

  /** Start audio (needs a user gesture the first time). */
  async ensureAudio(): Promise<boolean> {
    try {
      await this.engine.init(this.engineConfig());
      return true;
    } catch (e) {
      toast(`Impossible de démarrer l'audio : ${(e as Error).message}`, "error", 6000);
      return false;
    }
  }

  async togglePlay(): Promise<void> {
    if (!this.engine.isPlaying && !(await this.ensureAudio())) return;
    await this.engine.toggle();
  }

  async applySettings(next: AppSettings): Promise<void> {
    const audioChanged = next.latency !== this.settings.latency || next.sampleRate !== this.settings.sampleRate;
    this.settings = next;
    saveSettings(next);
    if (audioChanged && this.engine.isReady) await this.ensureAudio();
    this.emit();
  }

  // --- Projects ---------------------------------------------------------------------

  private async confirmDiscard(): Promise<boolean> {
    if (!this.store.isDirty()) return true;
    return confirmDialog(
      "Modifications non sauvegardées",
      "Le projet actuel contient des modifications non sauvegardées dans un fichier. Elles restent dans la sauvegarde automatique jusqu'au prochain changement. Continuer ?",
      "Continuer",
      "Annuler",
      true,
    );
  }

  private async loadProject(p: Project, bytes: Map<string, Uint8Array>, warnings: string[] = []): Promise<void> {
    this.engine.stop();
    this.engine.clearSamples();
    this.sampleBytes.clear();
    for (const [id, b] of bytes) this.sampleBytes.set(id, b);
    if (bytes.size && (await this.ensureAudio())) {
      for (const s of p.samples) {
        const b = bytes.get(s.id);
        if (!b) continue;
        try {
          await this.engine.loadSample(s.id, b);
        } catch {
          warnings.push(`Le sample "${s.name}" n'a pas pu être décodé : son intégré utilisé.`);
        }
      }
    }
    this.store.load(p);
    for (const w of warnings) toast(w, "error", 7000);
  }

  async newProject(templateId: string): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    forgetFileHandle();
    this.fileName = null;
    await this.loadProject(projectFromTemplate(templateId), new Map());
    toast("Nouveau projet créé.", "ok");
  }

  async openProject(file?: File | null): Promise<boolean> {
    if (!(await this.confirmDiscard())) return false;
    const f = file ?? (await pickFile(".bsproj,application/json"));
    if (!f) return false;
    try {
      const parsed = parseProject(await f.text());
      forgetFileHandle();
      this.fileName = f.name;
      await this.loadProject(parsed.project, parsed.sampleBytes, parsed.warnings);
      toast(`Projet « ${parsed.project.name} » ouvert.`, "ok");
      return true;
    } catch (e) {
      const msg = e instanceof ProjectFileError ? e.message : `Lecture impossible : ${(e as Error).message}`;
      toast(msg, "error", 7000);
      return false;
    }
  }

  serialize(): string {
    return serializeProject(this.store.getState(), this.sampleBytes);
  }

  async saveProject(saveAs = false): Promise<void> {
    try {
      const name = await saveProjectFile(this.serialize(), safeFileName(this.store.getState().name), saveAs);
      if (!name) return;
      this.fileName = name;
      this.store.markSaved();
      await this.autosaveNow();
      toast(`Projet sauvegardé : ${name}`, "ok");
    } catch (e) {
      toast(`Échec de la sauvegarde : ${(e as Error).message}`, "error", 7000);
    }
  }

  // --- Samples ----------------------------------------------------------------------

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
    this.store.dispatch({ type: "addSample", sample: { id, name: f.name, mime: f.type || "audio/*" } });
    this.store.dispatch({ type: "assignSample", trackId, sampleId: id });
    toast(`Sample chargé : ${f.name}`, "ok");
  }

  // --- Autosave & recovery ------------------------------------------------------------

  private scheduleAutosave(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.autosaveNow(), AUTOSAVE_DELAY_MS);
  }

  async autosaveNow(): Promise<void> {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    try {
      await writeAutosave({
        text: this.serialize(),
        name: this.store.getState().name,
        savedAt: new Date().toISOString(),
        unsaved: this.store.isDirty(),
        fileName: this.fileName,
      });
      this.lastAutosave = new Date();
      this.emit();
    } catch (e) {
      toast(`Sauvegarde automatique impossible : ${(e as Error).message}`, "error", 6000);
    }
  }

  /** Start-up: reopen the last session, asking first if the app did not exit cleanly. */
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
    if (!saved) return;
    if (crashed && saved.unsaved) {
      const ok = await confirmDialog(
        "Recover previous session?",
        `L'application ne s'est pas fermée correctement. Récupérer « ${saved.name} » (sauvegarde automatique du ${new Date(saved.savedAt).toLocaleString()}) ?`,
        "Récupérer",
        "Ignorer",
      );
      if (!ok) {
        await clearAutosave();
        return;
      }
    }
    try {
      const parsed = parseProject(saved.text);
      await this.loadProject(parsed.project, parsed.sampleBytes, parsed.warnings);
      this.fileName = saved.fileName ?? null;
      if (saved.unsaved) this.store.markDirty();
      if (crashed && saved.unsaved) toast("Session récupérée.", "ok");
    } catch {
      toast("La sauvegarde automatique est illisible et a été ignorée.", "error");
    }
  }

  // --- Keyboard ---------------------------------------------------------------------

  selectedTrackId: string | null = null;

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
      if (typing) return;
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
        toast("Enregistrement vocal : en développement (Phase 3).");
      } else if ((key === "m" || key === "s") && this.selectedTrackId) {
        this.store.dispatch({ type: key === "m" ? "toggleMute" : "toggleSolo", trackId: this.selectedTrackId });
      }
    });
  }
}

export async function startApp(root: HTMLElement): Promise<App> {
  const app = new App();
  (window as unknown as { __app: App }).__app = app; // debugging / end-to-end tests
  app.installShortcuts();
  root.append(h("div", { class: "boot" }, "Chargement…"));
  await app.restoreOnStartup();
  root.textContent = "";
  createShell(app, root);
  return app;
}
