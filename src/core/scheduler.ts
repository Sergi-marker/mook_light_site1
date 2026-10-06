import { stepDuration, swingOffset } from "./timing.ts";

export interface SchedulerTiming {
  bpm: number;
  swing: number;
  stepCount: number;
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

  constructor(opts: SchedulerOptions) {
    this.opts = {
      lookahead: 0.12,
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
    const horizon = now + this.opts.lookahead;
    // Max steps per tick guards against an infinite loop on absurd clock values.
    for (let guard = 0; guard < 4096 && this.nextGridTime < horizon; guard++) {
      const { bpm, swing, stepCount } = this.opts.getTiming();
      const step = this.stepIndex % stepCount;
      const time = this.nextGridTime + swingOffset(step, bpm, swing);
      if (time < now - 0.01) {
        // Woke up too late (tab throttled, debugger, GC pause…): skip rather than burst.
        this.lateSteps++;
      } else {
        this.opts.onStep(step, Math.max(time, now));
      }
      this.nextGridTime += stepDuration(bpm);
      this.stepIndex = (step + 1) % stepCount;
    }
  }
}
