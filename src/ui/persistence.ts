import { PROJECT_EXTENSION } from "../core/constants.ts";

// Autosave lives in IndexedDB (localStorage is limited to ~5 MB, too small once samples
// are embedded). Explicit saves go to a real file the user chooses.

const DB_NAME = "beatmaker-studio";
const STORE = "kv";
const AUTOSAVE_KEY = "autosave";
const SESSION_FLAG = "bs.session-open";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kv<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export interface Autosave {
  text: string;
  name: string;
  savedAt: string;
  /** True if the autosaved state had changes not written to a project file. */
  unsaved: boolean;
  fileName?: string | null;
}

export const writeAutosave = (a: Autosave) => kv<void>("readwrite", (s) => s.put(a, AUTOSAVE_KEY));
export const readAutosave = () =>
  kv<Autosave | undefined>("readonly", (s) => s.get(AUTOSAVE_KEY)).catch(() => undefined);
export const clearAutosave = () => kv<void>("readwrite", (s) => s.delete(AUTOSAVE_KEY));

/**
 * Crash detection: the flag is set while the app runs and removed on a clean exit.
 * If it is still there at start-up, the previous session ended abnormally.
 */
export function markSessionOpen(): boolean {
  let crashed = false;
  try {
    crashed = localStorage.getItem(SESSION_FLAG) === "1";
    localStorage.setItem(SESSION_FLAG, "1");
  } catch {
    /* storage disabled */
  }
  return crashed;
}

export function markSessionClosed(): void {
  try {
    localStorage.removeItem(SESSION_FLAG);
  } catch {
    /* storage disabled */
  }
}

// --- Project files --------------------------------------------------------------------

interface FileHandleLike {
  name: string;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}
type SavePicker = (opts: unknown) => Promise<FileHandleLike>;

/** Handle of the file the current project was last saved to (so Ctrl+S overwrites it). */
let currentHandle: FileHandleLike | null = null;

export function forgetFileHandle(): void {
  currentHandle = null;
}

export function hasFileHandle(): boolean {
  return currentHandle !== null;
}

/**
 * Save the project text. Uses the File System Access API (Chromium / Electron) so the user
 * picks a location once and later saves overwrite it; falls back to a download elsewhere.
 * Returns the file name, or null if the user cancelled.
 */
export async function saveProjectFile(text: string, baseName: string, saveAs = false): Promise<string | null> {
  const blob = new Blob([text], { type: "application/json" });
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      if (!currentHandle || saveAs) {
        currentHandle = await picker({
          suggestedName: baseName + PROJECT_EXTENSION,
          types: [{ description: "Beatmaker Studio project", accept: { "application/json": [PROJECT_EXTENSION] } }],
        });
      }
      const w = await currentHandle.createWritable();
      await w.write(blob);
      await w.close();
      return currentHandle.name;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return null;
      throw e;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = baseName + PROJECT_EXTENSION;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return a.download;
}

/** Ask the user for a file. Resolves null if nothing was chosen. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

// --- Settings ---------------------------------------------------------------------------

export interface AppSettings {
  /** "interactive" | "balanced" | "playback" or a buffer size in samples. */
  latency: "interactive" | "balanced" | "playback" | number;
  sampleRate: "auto" | 44100 | 48000;
  mode: "simple" | "pro";
}

const SETTINGS_KEY = "bs.settings";
export const DEFAULT_SETTINGS: AppSettings = { latency: "interactive", sampleRate: "auto", mode: "simple" };

export function loadSettings(): AppSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage disabled */
  }
}
