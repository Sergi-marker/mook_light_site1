// Piano roll (canvas). Edits the notes of one instrument in the current pattern.
//  Click = create (snapped; SCALE LOCK snaps the pitch) · drag = move · drag right edge = resize
//  Right-click / double-click = delete · Shift+drag on empty = rubber-band select · Shift+click = add to selection
//  Del = delete · Ctrl+C/V = copy/paste · Ctrl+D = duplicate · Ctrl+A = select all · ↑/↓ transpose · ←/→ move
//  L = toggle 808 slide · Velocity lane at the bottom: drag bars.

import { inScale, noteName, snapToScale } from "../../core/music.ts";
import { arpeggiate, chordPitches, CHORD_SHAPES, humanizeNotes, legatoNotes, reverseNotes, strumNotes, transposeNotes, velocityRamp, type ArpMode, type ChordShape } from "../../core/noteTools.ts";
import { currentPattern } from "../../core/project.ts";
import type { Note, Project } from "../../core/types.ts";
import type { App } from "../app.ts";
import { h, toast } from "../dom.ts";

const MIN_PITCH = 24, MAX_PITCH = 96;
const KEYS_W = 54;
const VEL_H = 70;

export interface PianoRollOptions {
  getTrackId: () => string | null;
  isMono808: () => boolean;
}

export function createPianoRoll(app: App, o: PianoRollOptions) {
  const { store } = app;
  let stepW = 28;
  let rowH = 14;
  let snap = 1;
  let scaleLock = true;
  let defaultLen = 2;
  let selected = new Set<string>();
  let clipboard: Omit<Note, "id">[] = [];
  let chordShape: ChordShape = "single";

  const snapSel = h("select", { "aria-label": "Snap", title: "Grille (snap)", onchange: () => (snap = Number(snapSel.value)) },
    ...[[4, "1/4"], [2, "1/8"], [1, "1/16"], [0.5, "1/32"], [0.0625, "Libre"]].map(([v, l]) => h("option", { value: v, selected: v === 1 }, String(l))));
  const lockBtn = h("button", { class: "btn btn-toggle btn-sm on", title: "SCALE LOCK : les notes restent dans la gamme du projet", onclick: () => {
    scaleLock = !scaleLock;
    lockBtn.classList.toggle("on", scaleLock);
  } }, "SCALE LOCK");
  const zoom = (dx: number, dy: number) => {
    stepW = Math.max(8, Math.min(80, stepW * dx));
    rowH = Math.max(8, Math.min(28, rowH * dy));
    resize();
    draw();
  };
  const toolbar = h("div", { class: "pr-toolbar" },
    h("label", { class: "field" }, h("span", { class: "slider-label" }, "SNAP"), snapSel),
    lockBtn,
    h("button", { class: "btn btn-sm", title: "Quantifier la sélection (ou tout) sur la grille", onclick: () => quantize() }, "Quantifier"),
    h("button", { class: "btn btn-sm", title: "Dupliquer la sélection (Ctrl+D)", onclick: () => duplicate() }, "Dupliquer"),
    h("button", { class: "btn btn-sm", title: "Glide/slide 808 sur la sélection (L)", onclick: () => toggleSlide() }, "Slide 808"),
    h("button", { class: "btn btn-sm", title: "Supprimer la sélection (Suppr)", onclick: () => removeSelected() }, "Supprimer"),
    h("span", { class: "sep" }),
    h("button", { class: "btn btn-icon btn-sm", title: "Zoom horizontal −", onclick: () => zoom(0.8, 1) }, "−↔"),
    h("button", { class: "btn btn-icon btn-sm", title: "Zoom horizontal +", onclick: () => zoom(1.25, 1) }, "+↔"),
    h("button", { class: "btn btn-icon btn-sm", title: "Zoom vertical −", onclick: () => zoom(1, 0.85) }, "−↕"),
    h("button", { class: "btn btn-icon btn-sm", title: "Zoom vertical +", onclick: () => zoom(1, 1.15) }, "+↕"),
    h("span", { class: "hint" }, "Clic = note · glisser = déplacer · bord droit = durée · clic droit = supprimer · Shift+glisser = sélection"),
  );
  const chordSel = h("select", { "aria-label": "Outil de dessin", title: "Ce que crée un clic : une note ou un accord complet (dans la gamme)", onchange: () => (chordShape = chordSel.value as ChordShape) },
    ...CHORD_SHAPES.map((c) => h("option", { value: c.id }, c.label)));
  const lenSel = h("select", { "aria-label": "Longueur de note", title: "Longueur des nouvelles notes", onchange: () => (defaultLen = Number(lenSel.value)) },
    ...[[1, "1/16"], [2, "1/8"], [4, "1/4"], [8, "1/2"], [16, "1 mesure"]].map(([v, l]) => h("option", { value: v, selected: v === 2 }, String(l))));
  const arpSel = h("select", { "aria-label": "Mode d'arpège" }, ...([["up", "↑ Up"], ["down", "↓ Down"], ["updown", "↕ Up/Down"], ["random", "Random"]] as const).map(([v, l]) => h("option", { value: v }, l)));
  const arpRate = h("select", { "aria-label": "Vitesse d'arpège" }, ...[[1, "1/16"], [0.5, "1/32"], [2, "1/8"], [4 / 3, "1/16T"]].map(([v, l]) => h("option", { value: v }, String(l))));
  const target = () => {
    const list = notes();
    return selected.size ? list.filter((n) => selected.has(n.id)) : list;
  };
  const needNotes = (): boolean => {
    if (target().length) return true;
    toast("Aucune note : dessinez ou sélectionnez des notes d'abord.", "error");
    return false;
  };
  const transpose = (amount: number, degrees: boolean) => {
    if (needNotes()) dispatchUpdates(transposeNotes(target(), amount, store.getState().key, degrees));
  };
  const tools = h("div", { class: "pr-toolbar pr-tools" },
    h("label", { class: "field" }, h("span", { class: "slider-label" }, "DESSIN"), chordSel),
    h("label", { class: "field" }, h("span", { class: "slider-label" }, "LONGUEUR"), lenSel),
    h("span", { class: "sep" }),
    h("span", { class: "slider-label" }, "TRANSPOSER"),
    h("button", { class: "btn btn-sm", title: "Octave −", onclick: () => transpose(-12, false) }, "−8va"),
    h("button", { class: "btn btn-sm", title: "Un degré de la gamme plus bas (demi-ton si SCALE LOCK est désactivé)", onclick: () => transpose(-1, scaleLock) }, "−1"),
    h("button", { class: "btn btn-sm", title: "Un degré de la gamme plus haut (demi-ton si SCALE LOCK est désactivé)", onclick: () => transpose(1, scaleLock) }, "+1"),
    h("button", { class: "btn btn-sm", title: "Octave +", onclick: () => transpose(12, false) }, "+8va"),
    h("span", { class: "sep" }),
    h("button", { class: "btn btn-sm", title: "Petites variations de timing et de vélocité (sélection ou tout)", onclick: () => needNotes() && dispatchUpdates(humanizeNotes(target(), 0.6, Math.floor(Math.random() * 1e6), pattern().stepCount)) }, "Humaniser"),
    h("button", { class: "btn btn-sm", title: "Prolonge chaque note jusqu'à la suivante", onclick: () => needNotes() && dispatchUpdates(legatoNotes(target(), pattern().stepCount)) }, "Legato"),
    h("button", { class: "btn btn-sm", title: "Égrène les accords du grave vers l'aigu (guitare, harpe)", onclick: () => needNotes() && dispatchUpdates(strumNotes(target(), 0.25)) }, "Strum"),
    h("button", { class: "btn btn-sm", title: "Inverse l'ordre des notes dans le temps", onclick: () => needNotes() && dispatchUpdates(reverseNotes(target())) }, "Inverser"),
    h("button", { class: "btn btn-sm", title: "Vélocité croissante (crescendo)", onclick: () => needNotes() && dispatchUpdates(velocityRamp(target(), 60, 120)) }, "Vél ↗"),
    h("button", { class: "btn btn-sm", title: "Vélocité décroissante", onclick: () => needNotes() && dispatchUpdates(velocityRamp(target(), 120, 60)) }, "Vél ↘"),
    h("span", { class: "sep" }),
    h("span", { class: "slider-label" }, "ARPÈGE"), arpSel, arpRate,
    h("button", { class: "btn btn-sm", title: "Transforme les accords (sélection ou tout) en arpège", onclick: () => {
      const id = tid();
      if (!id || !needNotes()) return;
      const src = target();
      const gen = arpeggiate(src, Number(arpRate.value), arpSel.value as ArpMode, 1, Math.floor(Math.random() * 1e6));
      app.dispatch({ type: "batch", actions: [{ type: "removeNotes", trackId: id, ids: src.map((n) => n.id) }, { type: "addNotes", trackId: id, notes: gen }] });
      selected.clear();
      toast(`Arpège : ${gen.length} notes.`, "ok");
    } }, "Arpéger"),
  );
  const keys = h("canvas", { class: "pr-keys", width: KEYS_W, height: 100 });
  const canvas = h("canvas", { class: "pr-canvas", tabindex: 0, "aria-label": "Piano roll" });
  const vel = h("canvas", { class: "pr-vel", height: VEL_H });
  const ph = h("div", { class: "pr-ph" });
  const scroll = h("div", { class: "pr-scroll" }, h("div", { class: "pr-inner" }, keys, canvas, ph));
  const velWrap = h("div", { class: "pr-velwrap" }, h("div", { class: "pr-vel-label", style: `width:${KEYS_W}px` }, "VEL"), vel);
  const el = h("div", { class: "piano-roll" }, toolbar, tools, scroll, velWrap);

  const rows = MAX_PITCH - MIN_PITCH + 1;
  const pattern = () => currentPattern(store.getState());
  const notes = (): Note[] => {
    const id = o.getTrackId();
    return id ? pattern().notes[id] ?? [] : [];
  };
  const yOf = (pitch: number) => (MAX_PITCH - pitch) * rowH;
  const pitchAt = (y: number) => MAX_PITCH - Math.floor(y / rowH);
  const stepAt = (x: number) => x / stepW;
  const snapStep = (s: number) => (snap < 0.1 ? Math.round(s * 16) / 16 : Math.floor(s / snap) * snap);
  const lockPitch = (pitch: number) => (scaleLock ? snapToScale(pitch, store.getState().key) : pitch);

  function resize(): void {
    const steps = pattern().stepCount;
    canvas.width = steps * stepW;
    canvas.height = rows * rowH;
    keys.height = rows * rowH;
    vel.width = steps * stepW;
    vel.style.marginLeft = "0";
  }

  function noteAt(x: number, y: number): { note: Note; edge: boolean } | null {
    const p = pitchAt(y);
    const s = stepAt(x);
    const list = notes();
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (n.pitch === p && s >= n.start && s <= n.start + n.length) return { note: n, edge: (n.start + n.length - s) * stepW < 7 };
    }
    return null;
  }

  function draw(): void {
    const ctx = canvas.getContext("2d");
    const kctx = keys.getContext("2d");
    if (!ctx || !kctx) return;
    const p = store.getState();
    const pat = pattern();
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = "#11141c";
    ctx.fillRect(0, 0, W, H);
    for (let pitch = MIN_PITCH; pitch <= MAX_PITCH; pitch++) {
      const y = yOf(pitch);
      const black = [1, 3, 6, 8, 10].includes(pitch % 12);
      const ins = inScale(pitch, p.key);
      ctx.fillStyle = (pitch - p.key.root) % 12 === 0 ? "#2a2440" : ins ? (black ? "#191d29" : "#1c2130") : "#12151d";
      ctx.fillRect(0, y, W, rowH);
      ctx.fillStyle = "#0d1017";
      ctx.fillRect(0, y + rowH - 1, W, 1);
      // keyboard
      kctx.fillStyle = black ? "#222" : "#ddd";
      kctx.fillRect(0, y, KEYS_W, rowH - 1);
      if (ins) {
        kctx.fillStyle = "#7c5cff";
        kctx.fillRect(KEYS_W - 5, y, 5, rowH - 1);
      }
      if (pitch % 12 === 0 || rowH >= 14) {
        kctx.fillStyle = black ? "#bbb" : "#333";
        kctx.font = `${Math.min(10, rowH - 3)}px sans-serif`;
        kctx.fillText(noteName(pitch), 3, y + rowH - 3);
      }
    }
    const spBar = p.timeSignature.beats * 4 * (4 / p.timeSignature.beatUnit);
    for (let s = 0; s <= pat.stepCount; s++) {
      ctx.fillStyle = s % spBar === 0 ? "#4b5568" : s % 4 === 0 ? "#2f3647" : "#1a1f2b";
      ctx.fillRect(s * stepW, 0, 1, H);
    }
    // Ghost notes of the other instruments (orientation).
    for (const [id, list] of Object.entries(pat.notes)) {
      if (id === o.getTrackId()) continue;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      for (const n of list) ctx.fillRect(n.start * stepW, yOf(n.pitch) + 2, n.length * stepW, rowH - 4);
    }
    const ins = p.instruments.find((i) => i.id === o.getTrackId());
    for (const n of notes()) {
      const x = n.start * stepW, y = yOf(n.pitch), w = Math.max(3, n.length * stepW - 1);
      const sel = selected.has(n.id);
      ctx.globalAlpha = 0.45 + 0.55 * (n.velocity / 127);
      ctx.fillStyle = sel ? "#fbbf24" : ins?.color ?? "#7c5cff";
      ctx.fillRect(x, y + 1, w, rowH - 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = sel ? "#fff" : "rgba(0,0,0,0.5)";
      ctx.strokeRect(x + 0.5, y + 1.5, w - 1, rowH - 3);
      if (n.slide) {
        ctx.fillStyle = "#111";
        ctx.font = "bold 9px sans-serif";
        ctx.fillText("↗", x + 2, y + rowH - 3);
      }
    }
    if (band) {
      ctx.strokeStyle = "#fbbf24";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(Math.min(band.x0, band.x1), Math.min(band.y0, band.y1), Math.abs(band.x1 - band.x0), Math.abs(band.y1 - band.y0));
      ctx.setLineDash([]);
    }
    // velocity lane
    const vctx = vel.getContext("2d");
    if (vctx) {
      vctx.fillStyle = "#11141c";
      vctx.fillRect(0, 0, vel.width, VEL_H);
      for (const n of notes()) {
        const hgt = (n.velocity / 127) * (VEL_H - 6);
        vctx.fillStyle = selected.has(n.id) ? "#fbbf24" : "#7c5cff";
        vctx.fillRect(n.start * stepW, VEL_H - hgt, Math.max(3, Math.min(8, n.length * stepW - 1)), hgt);
      }
    }
  }

  // --- editing helpers --------------------------------------------------------------
  const tid = () => o.getTrackId();
  function dispatchUpdates(updates: ({ id: string } & Partial<Note>)[], key?: string): void {
    const id = tid();
    if (id && updates.length) app.dispatch({ type: "updateNotes", trackId: id, updates }, key);
  }
  function removeSelected(): void {
    const id = tid();
    if (id && selected.size) app.dispatch({ type: "removeNotes", trackId: id, ids: [...selected] });
    selected.clear();
  }
  function quantize(): void {
    const list = notes().filter((n) => !selected.size || selected.has(n.id));
    const g = snap < 0.1 ? 1 : snap;
    dispatchUpdates(list.map((n) => ({ id: n.id, start: Math.round(n.start / g) * g, length: Math.max(g, Math.round(n.length / g) * g) })));
  }
  function toggleSlide(): void {
    const list = notes().filter((n) => selected.has(n.id));
    if (!list.length) return;
    const on = !list.every((n) => n.slide);
    dispatchUpdates(list.map((n) => ({ id: n.id, slide: on })));
  }
  function copy(): void {
    const list = notes().filter((n) => selected.has(n.id));
    const base = Math.min(...list.map((n) => n.start));
    clipboard = list.map(({ id: _id, ...rest }) => ({ ...rest, start: rest.start - base }));
  }
  function paste(at?: number): void {
    const id = tid();
    if (!id || !clipboard.length) return;
    const list = notes();
    const sel = list.filter((n) => selected.has(n.id));
    const start = at ?? (sel.length ? Math.max(...sel.map((n) => n.start + n.length)) : 0);
    const before = new Set(list.map((n) => n.id));
    app.dispatch({ type: "addNotes", trackId: id, notes: clipboard.map((n) => ({ ...n, start: n.start + start })) });
    selected = new Set(notes().filter((n) => !before.has(n.id)).map((n) => n.id));
  }
  function duplicate(): void {
    if (!selected.size) return;
    copy();
    paste();
  }

  // --- mouse --------------------------------------------------------------------------
  let drag: null | { kind: "move" | "resize"; startX: number; startY: number; orig: Map<string, Note> } = null;
  let band: null | { x0: number; y0: number; x1: number; y1: number } = null;
  const pos = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const { x, y } = pos(e);
    const hit = noteAt(x, y);
    const id = tid();
    if (hit && id) {
      app.dispatch({ type: "removeNotes", trackId: id, ids: selected.has(hit.note.id) ? [...selected] : [hit.note.id] });
      selected.delete(hit.note.id);
    }
  });
  canvas.addEventListener("dblclick", (e) => {
    const { x, y } = pos(e);
    const hit = noteAt(x, y);
    const id = tid();
    if (hit && id) app.dispatch({ type: "removeNotes", trackId: id, ids: [hit.note.id] });
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    canvas.focus();
    const id = tid();
    if (!id) return;
    const { x, y } = pos(e);
    const hit = noteAt(x, y);
    if (hit) {
      if (e.shiftKey) {
        if (selected.has(hit.note.id)) selected.delete(hit.note.id);
        else selected.add(hit.note.id);
      } else if (!selected.has(hit.note.id)) selected = new Set([hit.note.id]);
      const orig = new Map(notes().filter((n) => selected.has(n.id)).map((n) => [n.id, { ...n }]));
      drag = { kind: hit.edge ? "resize" : "move", startX: x, startY: y, orig };
      if (!hit.edge) void app.engine.previewNote(id, hit.note.pitch, hit.note.velocity, 0.25);
      canvas.setPointerCapture(e.pointerId);
      draw();
      return;
    }
    if (e.shiftKey) {
      band = { x0: x, y0: y, x1: x, y1: y };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    // Create a note.
    const pitch = lockPitch(pitchAt(y));
    const start = Math.min(pattern().stepCount - defaultLen, snapStep(stepAt(x)));
    const before = new Set(notes().map((n) => n.id));
    const pitches = o.isMono808() ? [pitch] : chordPitches(pitch, chordShape, store.getState().key, scaleLock).filter((q) => q >= MIN_PITCH && q <= MAX_PITCH);
    app.dispatch({ type: "addNotes", trackId: id, notes: pitches.map((q) => ({ pitch: q, start: Math.max(0, start), length: defaultLen, velocity: 100 })) });
    const created = notes().filter((n) => !before.has(n.id));
    for (const q of pitches) void app.engine.previewNote(id, q, 100, 0.25);
    if (created.length) {
      selected = new Set(created.map((n) => n.id));
      drag = { kind: "resize", startX: x, startY: y, orig: new Map(created.map((n) => [n.id, { ...n }])) };
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const { x, y } = pos(e);
    if (band) {
      band.x1 = x;
      band.y1 = y;
      const s0 = stepAt(Math.min(band.x0, band.x1)), s1 = stepAt(Math.max(band.x0, band.x1));
      const p0 = pitchAt(Math.max(band.y0, band.y1)), p1 = pitchAt(Math.min(band.y0, band.y1));
      selected = new Set(notes().filter((n) => n.pitch >= p0 && n.pitch <= p1 && n.start + n.length > s0 && n.start < s1).map((n) => n.id));
      draw();
      return;
    }
    if (!drag) {
      const hit = noteAt(x, y);
      canvas.style.cursor = hit ? (hit.edge ? "ew-resize" : "grab") : "crosshair";
      return;
    }
    const ds = stepAt(x - drag.startX);
    const dp = Math.round(-(y - drag.startY) / rowH);
    const updates: ({ id: string } & Partial<Note>)[] = [];
    for (const n of drag.orig.values()) {
      if (drag.kind === "move") {
        const g = snap < 0.1 ? 0.0625 : snap;
        updates.push({ id: n.id, start: Math.max(0, Math.round((n.start + ds) / g) * g), pitch: lockPitch(n.pitch + dp) });
      } else {
        const g = snap < 0.1 ? 0.0625 : snap;
        const len = Math.max(g, Math.round((n.length + ds) / g) * g);
        updates.push({ id: n.id, length: len });
        defaultLen = len;
      }
    }
    dispatchUpdates(updates, "pr-drag");
  });
  const endDrag = () => {
    drag = null;
    if (band) {
      band = null;
      draw();
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.15 : 0.87, 1);
  }, { passive: false });

  // Velocity lane: drag to set the velocity of the note(s) under the cursor.
  const velDrag = (e: PointerEvent) => {
    const r = vel.getBoundingClientRect();
    const s = (e.clientX - r.left) / stepW;
    const v = Math.round(Math.max(1, Math.min(127, (1 - (e.clientY - r.top) / VEL_H) * 127)));
    const hit = notes().filter((n) => s >= n.start && s <= n.start + Math.max(n.length, 0.5) && (!selected.size || selected.has(n.id) || true));
    dispatchUpdates(hit.map((n) => ({ id: n.id, velocity: v })), "pr-vel");
  };
  vel.addEventListener("pointerdown", (e) => {
    vel.setPointerCapture(e.pointerId);
    velDrag(e);
    const mv = (ev: PointerEvent) => velDrag(ev);
    const up = () => {
      vel.removeEventListener("pointermove", mv);
      vel.removeEventListener("pointerup", up);
    };
    vel.addEventListener("pointermove", mv);
    vel.addEventListener("pointerup", up);
  });

  canvas.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (k === "delete" || k === "backspace") { e.preventDefault(); removeSelected(); }
    else if (mod && k === "c") { e.preventDefault(); copy(); }
    else if (mod && k === "v") { e.preventDefault(); paste(); }
    else if (mod && k === "d") { e.preventDefault(); duplicate(); }
    else if (mod && k === "a") { e.preventDefault(); selected = new Set(notes().map((n) => n.id)); draw(); }
    else if (!mod && k === "l") { e.preventDefault(); toggleSlide(); }
    else if (k === "arrowup" || k === "arrowdown") {
      e.preventDefault();
      const d = k === "arrowup" ? 1 : -1;
      const step = e.shiftKey ? 12 : 1;
      dispatchUpdates(notes().filter((n) => selected.has(n.id)).map((n) => {
        let pitch = n.pitch + d * step;
        if (scaleLock && step === 1) {
          while (!inScale(pitch, store.getState().key)) pitch += d;
        }
        return { id: n.id, pitch };
      }), "pr-key");
    } else if (k === "arrowleft" || k === "arrowright") {
      e.preventDefault();
      const g = snap < 0.1 ? 0.25 : snap;
      dispatchUpdates(notes().filter((n) => selected.has(n.id)).map((n) => ({ id: n.id, start: Math.max(0, n.start + (k === "arrowright" ? g : -g)) })), "pr-key");
    } else return;
    e.stopPropagation();
  });

  keys.addEventListener("pointerdown", (e) => {
    const id = tid();
    if (!id) return;
    const r = keys.getBoundingClientRect();
    void app.engine.previewNote(id, pitchAt(e.clientY - r.top), 100, 0.5);
  });

  let sizeSig = "";
  return {
    el,
    update(): void {
      const p = store.getState();
      const s = `${pattern().stepCount}|${stepW}|${rowH}`;
      if (s !== sizeSig) {
        const first = !sizeSig;
        sizeSig = s;
        resize();
        if (first) requestAnimationFrame(() => (scroll.scrollTop = yOf(Math.min(84, p.key.root + 72)) - 40));
      }
      const ids = new Set(notes().map((n) => n.id));
      for (const id of selected) if (!ids.has(id)) selected.delete(id);
      draw();
    },
    frame(): void {
      const step = app.engine.mode === "pattern" && app.engine.isPlaying ? app.engine.currentPosition() % pattern().stepCount : -1;
      ph.style.display = step < 0 ? "none" : "block";
      if (step >= 0) {
        ph.style.left = `${KEYS_W + step * stepW}px`;
        ph.style.height = `${canvas.height}px`;
      }
    },
    scrollToPitch(pitch: number): void {
      scroll.scrollTop = yOf(pitch) - 100;
    },
    get selection(): Set<string> {
      return selected;
    },
  };
}

export type PianoRoll = ReturnType<typeof createPianoRoll>;
void (null as unknown as Project);
