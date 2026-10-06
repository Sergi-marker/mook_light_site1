// Small reusable UI pieces (plain DOM).

import { h } from "./dom.ts";

export interface SliderOpts {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (v: number) => string;
  onInput: (v: number) => void;
  title?: string;
  /** Double-click resets to this value. */
  reset?: number;
  /** MIDI-learnable target id (e.g. "channel:<id>:volume"). */
  learn?: string;
  className?: string;
}

/** Labelled range slider with live value readout. */
export function slider(o: SliderOpts): HTMLElement {
  const val = h("span", { class: "val" }, o.format ? o.format(o.value) : String(o.value));
  const input = h("input", {
    type: "range", min: o.min, max: o.max, step: o.step, value: o.value, "aria-label": o.label, title: o.title ?? o.label,
    "data-learn": o.learn,
    oninput: () => {
      const v = Number(input.value);
      val.textContent = o.format ? o.format(v) : String(v);
      o.onInput(v);
    },
    ondblclick: () => {
      if (o.reset === undefined) return;
      input.value = String(o.reset);
      val.textContent = o.format ? o.format(o.reset) : String(o.reset);
      o.onInput(o.reset);
    },
  });
  return h("label", { class: `slider ${o.className ?? ""}` }, h("span", { class: "slider-label" }, o.label), input, val);
}

export function select<T extends string | number>(label: string, options: { value: T; label: string }[], value: T, onChange: (v: T) => void, title?: string): HTMLElement {
  const sel = h("select", { "aria-label": label, title: title ?? label, onchange: () => {
    const raw = sel.value;
    const opt = options.find((o) => String(o.value) === raw);
    if (opt) onChange(opt.value);
  } }, ...options.map((o) => h("option", { value: String(o.value), selected: o.value === value }, o.label)));
  return h("label", { class: "field" }, h("span", { class: "slider-label" }, label), sel);
}

export function toggle(label: string, on: boolean, onChange: (v: boolean) => void, title?: string, cls = ""): HTMLButtonElement {
  return h("button", { class: `btn btn-toggle ${cls} ${on ? "on" : ""}`, "aria-pressed": String(on), title: title ?? label, onclick: () => onChange(!on) }, label);
}

export function card(title: string, ...children: (Node | string | null | false | undefined)[]): HTMLElement {
  return h("div", { class: "card" }, h("h3", {}, title), ...children);
}

export const fmtDb = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;
export const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
export const fmtGain = (v: number) => (v <= 0 ? "−∞" : `${(20 * Math.log10(v)).toFixed(1)} dB`);
export const fmtPan = (v: number) => (Math.abs(v) < 0.01 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`);
export const fmtHz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} kHz` : `${Math.round(v)} Hz`);
export const fmtMs = (v: number) => `${Math.round(v)} ms`;

/** Peak meter drawn into a small canvas; call update(peak) every frame. */
export function meter(vertical = false): { el: HTMLCanvasElement; update: (peak: number) => void } {
  const el = h("canvas", { class: vertical ? "meter-v" : "meter-h", width: vertical ? 10 : 120, height: vertical ? 120 : 8 });
  let hold = 0;
  const ctx = el.getContext("2d");
  return {
    el,
    update(peak: number) {
      if (!ctx) return;
      hold = Math.max(peak, hold * 0.9);
      const db = hold <= 0 ? -60 : Math.max(-60, 20 * Math.log10(hold));
      const f = (db + 60) / 60;
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.fillStyle = "#1d2230";
      ctx.fillRect(0, 0, el.width, el.height);
      ctx.fillStyle = db > -1 ? "#ef4444" : db > -9 ? "#f59e0b" : "#22c55e";
      if (vertical) ctx.fillRect(0, el.height * (1 - f), el.width, el.height * f);
      else ctx.fillRect(0, 0, el.width * f, el.height);
    },
  };
}

/** Render waveform peaks of `data` into a canvas. */
export function drawWaveform(c: HTMLCanvasElement, data: Float32Array, color = "#a68bff", from = 0, to = data.length): void {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const w = c.width, hgt = c.height;
  ctx.clearRect(0, 0, w, hgt);
  ctx.fillStyle = color;
  const span = Math.max(1, to - from);
  for (let x = 0; x < w; x++) {
    const a = from + Math.floor((x / w) * span);
    const b = Math.min(to, from + Math.floor(((x + 1) / w) * span));
    let mn = 0, mx = 0;
    for (let i = a; i < b; i += Math.max(1, Math.floor((b - a) / 64))) {
      if (data[i] < mn) mn = data[i];
      if (data[i] > mx) mx = data[i];
    }
    const y0 = (1 - mx) * hgt / 2, y1 = (1 - mn) * hgt / 2;
    ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
  }
}

/**
 * Re-render a container on demand, but never while the user is interacting with a control
 * inside it (focused input, pointer held down) — the render is deferred until they finish.
 */
export function reactive(container: HTMLElement, render: () => void): () => void {
  let pending = false;
  let pointerDown = false;
  const busy = () => pointerDown || (document.activeElement instanceof HTMLElement && container.contains(document.activeElement) && document.activeElement.matches("input[type=text], input[type=number], textarea, select"));
  const flush = () => {
    if (!pending || busy()) return;
    pending = false;
    render();
  };
  container.addEventListener("pointerdown", () => (pointerDown = true));
  window.addEventListener("pointerup", () => {
    pointerDown = false;
    setTimeout(flush, 0);
  });
  container.addEventListener("focusout", () => setTimeout(flush, 0));
  return () => {
    pending = true;
    flush();
  };
}
