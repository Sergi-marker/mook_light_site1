import { reduce, type Action } from "./reducer.ts";
import type { Project } from "./types.ts";

export interface DispatchOptions {
  /**
   * Consecutive dispatches with the same key inside `coalesceMs` share one undo entry
   * (e.g. dragging a volume fader produces one undo step, not hundreds).
   */
  coalesceKey?: string;
}

export interface StoreOptions {
  historyLimit?: number;
  coalesceMs?: number;
  now?: () => number;
}

type Listener = () => void;

/**
 * Framework-agnostic project store with undo/redo history.
 * The UI subscribes through `useSyncExternalStore`; the audio engine reads `getState()`
 * on every scheduler tick so edits made during playback are heard immediately.
 */
export class ProjectStore {
  private state: Project;
  private past: Project[] = [];
  private future: Project[] = [];
  private listeners = new Set<Listener>();
  private lastKey: string | null = null;
  private lastTime = 0;
  private dirty = false;
  private readonly historyLimit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;

  constructor(initial: Project, opts: StoreOptions = {}) {
    this.state = initial;
    this.historyLimit = opts.historyLimit ?? 200;
    this.coalesceMs = opts.coalesceMs ?? 600;
    this.now = opts.now ?? (() => Date.now());
  }

  getState = (): Project => this.state;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  dispatch = (action: Action, opts: DispatchOptions = {}): void => {
    const next = reduce(this.state, action);
    if (next === this.state) return;
    const t = this.now();
    const coalesce =
      opts.coalesceKey !== undefined &&
      opts.coalesceKey === this.lastKey &&
      t - this.lastTime < this.coalesceMs;
    if (!coalesce) {
      this.past.push(this.state);
      if (this.past.length > this.historyLimit) this.past.shift();
    }
    this.future = [];
    this.lastKey = opts.coalesceKey ?? null;
    this.lastTime = t;
    this.commit({ ...next, updatedAt: new Date(t).toISOString() });
  };

  canUndo = (): boolean => this.past.length > 0;
  canRedo = (): boolean => this.future.length > 0;

  undo = (): void => {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.state);
    this.lastKey = null;
    this.commit(prev);
  };

  redo = (): void => {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state);
    this.lastKey = null;
    this.commit(next);
  };

  /** Replace the whole project (new / open / recover). Clears history. */
  load = (project: Project): void => {
    this.past = [];
    this.future = [];
    this.lastKey = null;
    this.state = project;
    this.dirty = false;
    this.emit();
  };

  isDirty = (): boolean => this.dirty;

  markSaved = (): void => {
    if (!this.dirty) return;
    this.dirty = false;
    this.emit();
  };

  private commit(p: Project): void {
    this.state = p;
    this.dirty = true;
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
