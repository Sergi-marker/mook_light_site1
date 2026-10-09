// MIDI: Web MIDI input (keyboards, pads), MIDI learn / mapping of CC to parameters,
// and MIDI output of played notes. Works in Electron and Chromium-based browsers.

export interface MidiNoteEvent {
  type: "noteon" | "noteoff";
  note: number;
  velocity: number;
  channel: number;
  input: string;
}

export interface MidiCCEvent {
  controller: number;
  value: number;
  channel: number;
  /** Mapping key, e.g. "cc:0:7" */
  source: string;
}

export class MidiController {
  private access: MIDIAccess | null = null;
  private noteListeners = new Set<(e: MidiNoteEvent) => void>();
  private ccListeners = new Set<(e: MidiCCEvent) => void>();
  private changeListeners = new Set<() => void>();
  /** When set, the next CC received is reported to this callback (MIDI LEARN). */
  private learn: ((source: string) => void) | null = null;
  outputId = "";
  error = "";
  activity = 0;

  get supported(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
  }

  get enabled(): boolean {
    return this.access !== null;
  }

  async enable(): Promise<boolean> {
    if (this.access) return true;
    if (!this.supported) {
      this.error = "MIDI is not supported in this environment.";
      return false;
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      this.error = `MIDI unavailable: ${(e as Error).message}`;
      return false;
    }
    this.error = "";
    this.access.onstatechange = () => {
      this.attach();
      for (const fn of this.changeListeners) fn();
    };
    this.attach();
    return true;
  }

  private attach(): void {
    if (!this.access) return;
    this.access.inputs.forEach((input) => {
      input.onmidimessage = (m) => this.handle(m, input.name ?? input.id);
    });
  }

  inputs(): { id: string; name: string }[] {
    const out: { id: string; name: string }[] = [];
    this.access?.inputs.forEach((i) => out.push({ id: i.id, name: i.name ?? i.id }));
    return out;
  }

  outputs(): { id: string; name: string }[] {
    const out: { id: string; name: string }[] = [];
    this.access?.outputs.forEach((o) => out.push({ id: o.id, name: o.name ?? o.id }));
    return out;
  }

  private handle(m: MIDIMessageEvent, input: string): void {
    const d = m.data;
    if (!d || d.length < 2) return;
    const status = d[0] & 0xf0;
    const channel = d[0] & 0x0f;
    this.activity = performance.now();
    if (status === 0x90 || status === 0x80) {
      const velocity = d[2] ?? 0;
      const type = status === 0x90 && velocity > 0 ? "noteon" : "noteoff";
      for (const fn of this.noteListeners) fn({ type, note: d[1], velocity, channel, input });
      this.forward(type, d[1], velocity);
    } else if (status === 0xb0) {
      const source = `cc:${channel}:${d[1]}`;
      if (this.learn) {
        const cb = this.learn;
        this.learn = null;
        cb(source);
        return;
      }
      for (const fn of this.ccListeners) fn({ controller: d[1], value: d[2] ?? 0, channel, source });
    }
  }

  /** Echo played notes to the selected MIDI output (external synth / DAW). */
  private forward(type: "noteon" | "noteoff", note: number, velocity: number): void {
    if (!this.outputId || !this.access) return;
    const out = this.access.outputs.get(this.outputId);
    out?.send([type === "noteon" ? 0x90 : 0x80, note, velocity]);
  }

  sendNote(note: number, velocity: number, durationMs: number): void {
    if (!this.outputId || !this.access) return;
    const out = this.access.outputs.get(this.outputId);
    if (!out) return;
    out.send([0x90, note, velocity]);
    out.send([0x80, note, 0], performance.now() + durationMs);
  }

  startLearn(cb: (source: string) => void): void {
    this.learn = cb;
  }

  cancelLearn(): void {
    this.learn = null;
  }

  get learning(): boolean {
    return this.learn !== null;
  }

  onNote(fn: (e: MidiNoteEvent) => void): () => void {
    this.noteListeners.add(fn);
    return () => this.noteListeners.delete(fn);
  }

  onCC(fn: (e: MidiCCEvent) => void): () => void {
    this.ccListeners.add(fn);
    return () => this.ccListeners.delete(fn);
  }

  onDevicesChange(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }
}

/** General MIDI drum map → our drum lanes (pads). */
export const GM_DRUMS: Record<number, string> = {
  35: "kick", 36: "kick", 38: "snare", 40: "snare", 39: "clap", 42: "closedHat", 44: "closedHat", 46: "openHat",
  37: "perc", 41: "perc", 43: "perc", 45: "perc", 47: "perc", 48: "perc", 49: "openHat", 50: "perc", 51: "openHat",
};
