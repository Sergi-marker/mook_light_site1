import { stepDuration, swingOffset } from "./timing.ts";

export interface SchedulerTiming {
  bpm: number;
  swing: number;
  /** Loop end (exclusive). Infinity = no loop. */
  stepCount: number;
  /** Where playback jumps when reaching `stepCount` (default 0). */
  loopStart?: number;
}

export interface SchedulerOptions {
  /** Audio clock in seconds (AudioContext.currentTime). */
  now: () => number;
  /** Read on every step, so BPM / swing / length edits apply while playing. */
  getTiming: () => SchedulerTiming;
  /** Called once per step, ahead of time, with the exact audio-clock time it must sound. */
  onStep: (step: number, time: number) => void;
  /** How far ahead (s) events are scheduled. Bigger = more robust, slower reaction to edits. */
  lookahead?: number;
  /**
   * Upper bound (s) for the adaptive look-ahead: when the timer wakes up late (main thread busy:
   * UI work, GC, a slow PC), the window grows so the next stall of the same size causes no gap.
   * Equal to `lookahead` = fixed window.
   */
  maxLookahead?: number;
  /** Timer period (ms) that wakes the scheduler. */
  intervalMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * "Two clocks" look-ahead scheduler: a coarse JS timer wakes up regularly and schedules
 * every step falling inside the look-ahead window on the sample-accurate audio clock.
 * Timer jitter therefore never shifts the beat; it only needs to wake up before the window
 * runs dry.
 */
export class StepScheduler {
  private readonly opts: Required<Omit<SchedulerOptions, "setTimer" | "clearTimer">> & {
    setTimer: (fn: () => void, ms: number) => unknown;
    clearTimer: (handle: unknown) => void;
  };
  private handle: unknown = null;
  private nextGridTime = 0;
  private stepIndex = 0;
  private running = false;
  /** Steps dropped because the scheduler woke up too late (main thread stalled). */
  lateSteps = 0;
  /** Current look-ahead window (s); grows after stalls. */
  window = 0;
  private lastTickAt = -1;

  constructor(opts: SchedulerOptions) {
    this.opts = {
      lookahead: 0.12,
      maxLookahead: opts.lookahead ?? 0.12,
      intervalMs: 25,
      setTimer: (fn, ms) => setInterval(fn, ms),
      clearTimer: (h) => clearInterval(h as ReturnType<typeof setInterval>),
      ...opts,
    };
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(startTime: number, fromStep = 0): void {
    this.stop();
    this.running = true;
    this.nextGridTime = startTime;
    this.stepIndex = fromStep;
    this.lateSteps = 0;
    this.window = this.opts.lookahead;
    this.lastTickAt = -1;
    this.tick();
    this.handle = this.opts.setTimer(() => this.tick(), this.opts.intervalMs);
  }

  stop(): void {
    if (this.handle !== null) this.opts.clearTimer(this.handle);
    this.handle = null;
    this.running = false;
  }

  tick(): void {
    if (!this.running) return;
    const now = this.opts.now();
    // Adaptive window: a gap between two ticks close to the window means the main thread was
    // blocked; widen the window so the same stall would still find notes already scheduled.
    if (this.lastTickAt >= 0) {
      const gap = now - this.lastTickAt;
      if (gap > this.window * 0.6 && this.window < this.opts.maxLookahead) this.window = Math.min(this.opts.maxLookahead, gap * 1.6 + 0.05);
    }
    this.lastTickAt = now;
    if (this.window <= 0) this.window = this.opts.lookahead;
    const horizon = now + this.window;
    // Max steps per tick guards against an infinite loop on absurd clock values.
    for (let guard = 0; guard < 4096 && this.nextGridTime < horizon; guard++) {
      const { bpm, swing, stepCount, loopStart = 0 } = this.opts.getTiming();
      // Negative steps are a count-in and never wrap; a shrunk loop restarts at loopStart.
      const step = this.stepIndex >= stepCount ? loopStart : this.stepIndex;
      const time = this.nextGridTime + swingOffset(((step % 2) + 2) % 2, bpm, swing);
      if (time < now - 0.01) {
        // Woke up too late (tab throttled, debugger, GC pause…): skip rather than burst.
        this.lateSteps++;
      } else {
        this.opts.onStep(step, Math.max(time, now));
      }
      this.nextGridTime += stepDuration(bpm);
      this.stepIndex = step + 1 >= stepCount ? loopStart : step + 1;
    }
  }
}
