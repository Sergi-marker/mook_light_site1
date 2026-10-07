// ARRANGEMENT: song timeline. Sections, pattern clips, vocal clips, loop region,
// automation (volume / pan), cursor & playhead, split / mute / fades / copy-paste,
// insert & delete time. Positions in bars (pattern clips snap to the grid).

import { secondsToSteps, songLengthBars, stepsPerBarOf, stepsToSeconds, newId } from "../../core/project.ts";
import type { Action } from "../../core/reducer.ts";
import type { AudioClip, PatternClip, Project } from "../../core/types.ts";
import type { App, View } from "../app.ts";
import { h, toast } from "../dom.ts";
import { drawWaveform, fmtDb, slider } from "../widgets.ts";

const SECTION_PRESETS: [string, string][] = [
  ["Intro", "#64748b"], ["Verse", "#2563eb"], ["Pre-Chorus", "#0891b2"], ["Chorus", "#db2777"],
  ["Verse 2", "#4f46e5"], ["Bridge", "#d97706"], ["Outro", "#475569"],
];
const LANE_H = 46;
const HEAD_W = 130;

type Clipboard = { pattern: Omit<PatternClip, "id">[]; audio: { trackId: string; clip: Omit<AudioClip, "id"> }[]; originBar: number };

export function createArrangementView(app: App): View {
  const { store, engine } = app;
  let barW = 36;
  let snap = 0.25; // bars
  let selected = new Set<string>();
  let armedPattern: string | null = null;
  let autoTarget = ""; // "<channelId>|volume" or "<channelId>|pan"
  let clipboard: Clipboard | null = null;
  let follow = true;

  const sectionSel = h("select", { "aria-label": "Section à ajouter" }, ...SECTION_PRESETS.map(([n]) => h("option", { value: n }, n)), h("option", { value: "__custom" }, "Personnalisée…"));
  const loopBtn = h("button", { class: "btn btn-toggle btn-sm", title: "Lecture en boucle de la région (aussi utilisée pour le punch in/out)", onclick: () => app.dispatch({ type: "setLoop", loop: { enabled: !store.getState().arrangement.loop.enabled } }) }, "⟳ LOOP");
  const lengthEl = h("span", { class: "hint" });
  const palette = h("div", { class: "palette" });
  const inspector = h("div", { class: "tl-inspector" });
  const autoSel = h("select", { "aria-label": "Automation", onchange: () => {
    autoTarget = autoSel.value;
    render();
  } });
  const snapSel = h("select", { "aria-label": "Grille", title: "Grille de placement des clips", onchange: () => (snap = Number(snapSel.value)) },
    ...[[1, "1 mesure"], [0.5, "1/2"], [0.25, "1 temps"], [1 / 16, "1/16 (voix)"]].map(([v, l]) => h("option", { value: v, selected: v === 0.25 }, String(l))));
  const barsSel = h("select", { "aria-label": "Nombre de mesures" }, ...[1, 2, 4, 8, 16].map((n) => h("option", { value: n, selected: n === 4 }, `${n} mes.`)));
  const followBtn = h("button", { class: "btn btn-toggle btn-sm on", title: "La vue suit la tête de lecture", onclick: () => { follow = !follow; followBtn.classList.toggle("on", follow); } }, "Suivre");

  const cursorBar = () => engine.cursor / spb();
  const toolbar = h("div", { class: "toolbar" },
    h("h1", {}, "ARRANGEMENT"),
    sectionSel,
    h("button", { class: "btn btn-sm", title: "Ajoute la section à la fin du morceau", onclick: () => addSection() }, "+ Section"),
    loopBtn,
    h("label", { class: "field" }, h("span", { class: "slider-label" }, "GRILLE"), snapSel),
    h("button", { class: "btn btn-sm", title: "Couper les clips sélectionnés (ou ceux sous le curseur) au curseur (S)", onclick: () => split() }, "✂ Couper"),
    h("button", { class: "btn btn-sm", title: "Mute / unmute des clips sélectionnés", onclick: () => toggleMute() }, "Mute clip"),
    h("button", { class: "btn btn-sm", title: "Dupliquer la sélection (Ctrl+D)", onclick: () => duplicate() }, "Dupliquer"),
    h("button", { class: "btn btn-sm", title: "Supprimer la sélection (Suppr)", onclick: () => removeSelected() }, "Supprimer"),
    h("button", { class: "btn btn-sm", title: "Ajouter une piste de patterns", onclick: () => app.dispatch({ type: "setLanes", lanes: store.getState().arrangement.lanes + 1 }) }, "+ Piste"),
    h("span", { class: "sep" }),
    barsSel,
    h("button", { class: "btn btn-sm", title: "Insérer du silence au curseur : tout ce qui suit est décalé", onclick: () => insertBars(Number(barsSel.value)) }, "Insérer"),
    h("button", { class: "btn btn-sm", title: "Supprimer ces mesures à partir du curseur : tout ce qui suit est ramené", onclick: () => insertBars(-Number(barsSel.value)) }, "Retirer"),
    h("span", { class: "sep" }),
    h("button", { class: "btn btn-icon btn-sm", title: "Zoom −", onclick: () => { barW = Math.max(10, barW * 0.8); render(); } }, "−"),
    h("button", { class: "btn btn-icon btn-sm", title: "Zoom +", onclick: () => { barW = Math.min(160, barW * 1.25); render(); } }, "+"),
    h("button", { class: "btn btn-sm", title: "Voir tout le morceau", onclick: () => fitAll() }, "Tout voir"),
    followBtn,
    h("label", { class: "field" }, h("span", { class: "slider-label" }, "AUTOMATION"), autoSel),
    lengthEl,
  );
  const help = h("p", { class: "hint" }, "Choisissez un pattern dans la palette puis cliquez sur une piste pour le poser · glisser = déplacer · bord droit = durée · bord gauche (voix) = début · Alt+glisser = copier · clic droit = supprimer · double-clic = éditer le pattern · clic sur la règle = curseur · Shift+glisser sur la règle = boucle · S = couper · Ctrl+C / Ctrl+V = copier / coller au curseur · Ctrl+A = tout sélectionner");
  const timeline = h("div", { class: "timeline" });
  const scroll = h("div", { class: "tl-scroll" }, timeline);
  const el = h("section", { class: "view arrangement-view", tabindex: 0 }, toolbar, palette, help, inspector, scroll);

  const spb = () => stepsPerBarOf(store.getState());
  const totalBars = (p: Project) => Math.max(32, songLengthBars(p) + 8, p.arrangement.loop.end + 4);
  const barAtX = (x: number) => Math.max(0, (x - HEAD_W) / barW);
  const snapBar = (b: number) => Math.max(0, Math.round(b / Math.max(0.25, snap)) * Math.max(0.25, snap));
  const snapStep = (st: number) => Math.max(0, Math.round(st / (snap * spb())) * (snap * spb()));

  function fitAll(): void {
    const p = store.getState();
    const w = scroll.clientWidth - HEAD_W - 20;
    barW = Math.max(10, Math.min(160, w / Math.max(8, songLengthBars(p) + 1)));
    render();
  }

  function addSection(): void {
    const p = store.getState();
    let name = sectionSel.value;
    let color = SECTION_PRESETS.find(([n]) => n === name)?.[1] ?? "#7c5cff";
    if (name === "__custom") {
      const n = window.prompt("Nom de la section :", "Hook");
      if (!n) return;
      name = n;
      color = "#9333ea";
    }
    const end = p.arrangement.sections.reduce((m, s) => Math.max(m, s.start + s.length), 0);
    const len = /chorus|refrain|hook|bridge/i.test(name) ? 8 : /intro|outro/i.test(name) ? 4 : 16;
    app.dispatch({ type: "addSection", section: { name, start: end, length: len, color } });
  }

  function removeSelected(): void {
    const p = store.getState();
    const actions: Action[] = [];
    const clipIds = p.arrangement.clips.filter((c) => selected.has(c.id)).map((c) => c.id);
    if (clipIds.length) actions.push({ type: "removeClips", ids: clipIds });
    for (const s of p.arrangement.sections) if (selected.has(s.id)) actions.push({ type: "removeSection", sectionId: s.id });
    for (const v of p.vocals) {
      const ids = v.clips.filter((c) => selected.has(c.id)).map((c) => c.id);
      if (ids.length) actions.push({ type: "removeAudioClips", trackId: v.id, ids });
    }
    if (actions.length) app.dispatch({ type: "batch", actions });
    selected.clear();
  }

  function duplicate(): void {
    const p = store.getState();
    const ids = p.arrangement.clips.filter((c) => selected.has(c.id)).map((c) => c.id);
    if (ids.length) app.dispatch({ type: "duplicateClips", ids });
  }

  function split(): void {
    const p = store.getState();
    const bar = cursorBar();
    const step = engine.cursor;
    const under = (c: PatternClip) => bar > c.start && bar < c.start + c.length;
    const sel = selected.size > 0;
    const patIds = p.arrangement.clips.filter((c) => (sel ? selected.has(c.id) : true) && under(c)).map((c) => c.id);
    const actions: Action[] = [];
    if (patIds.length) actions.push({ type: "splitClips", ids: patIds, bar });
    for (const v of p.vocals) {
      const ids = v.clips.filter((c) => (sel ? selected.has(c.id) : true) && step > c.start && step < c.start + secondsToSteps(c.duration, p.bpm)).map((c) => c.id);
      if (ids.length) actions.push({ type: "splitAudioClips", trackId: v.id, ids, step });
    }
    if (!actions.length) return void toast("Aucun clip sous le curseur. Placez le curseur (clic sur la règle) au milieu d'un clip.", "error");
    app.dispatch({ type: "batch", actions });
    toast(`Coupé à la mesure ${(bar + 1).toFixed(2).replace(/\.00$/, "")}.`, "ok");
  }

  function toggleMute(): void {
    const p = store.getState();
    const actions: Action[] = [];
    const pat = p.arrangement.clips.filter((c) => selected.has(c.id));
    const aud = p.vocals.flatMap((v) => v.clips.filter((c) => selected.has(c.id)).map((c) => ({ v, c })));
    if (!pat.length && !aud.length) return void toast("Sélectionnez d'abord un ou plusieurs clips.", "error");
    const on = ![...pat, ...aud.map((x) => x.c)].every((c) => c.muted);
    for (const c of pat) actions.push({ type: "updateClip", clipId: c.id, patch: { muted: on } });
    for (const { v, c } of aud) actions.push({ type: "updateAudioClip", trackId: v.id, clipId: c.id, patch: { muted: on } });
    app.dispatch({ type: "batch", actions });
  }

  function insertBars(n: number): void {
    const at = Math.round(cursorBar() * 4) / 4;
    app.dispatch({ type: "insertBars", at, bars: n });
    toast(n > 0 ? `${n} mesure(s) insérée(s) à la mesure ${at + 1}.` : `${-n} mesure(s) retirée(s) à partir de la mesure ${at + 1}.`, "ok");
  }

  function copy(): void {
    const p = store.getState();
    const pattern = p.arrangement.clips.filter((c) => selected.has(c.id));
    const audio = p.vocals.flatMap((v) => v.clips.filter((c) => selected.has(c.id)).map((c) => ({ trackId: v.id, clip: c })));
    if (!pattern.length && !audio.length) return void toast("Rien à copier : sélectionnez des clips.", "error");
    const s = spb();
    const originBar = Math.min(...pattern.map((c) => c.start), ...audio.map((a) => a.clip.start / s));
    clipboard = {
      pattern: pattern.map(({ id: _id, ...c }) => c),
      audio: audio.map(({ trackId, clip: { id: _id, ...c } }) => ({ trackId, clip: c })),
      originBar,
    };
    toast(`${pattern.length + audio.length} clip(s) copié(s). Placez le curseur puis Ctrl+V.`, "info");
  }

  function paste(): void {
    if (!clipboard) return;
    const s = spb();
    const dBar = Math.round(cursorBar() * 4) / 4 - clipboard.originBar;
    const actions: Action[] = clipboard.pattern.map((c) => ({ type: "addClip", clip: { ...c, start: c.start + dBar } }));
    const byTrack = new Map<string, Omit<AudioClip, "id">[]>();
    for (const a of clipboard.audio) byTrack.set(a.trackId, [...(byTrack.get(a.trackId) ?? []), { ...a.clip, start: a.clip.start + dBar * s }]);
    for (const [trackId, clips] of byTrack) actions.push({ type: "addAudioClips", trackId, clips });
    app.dispatch({ type: "batch", actions });
  }

  function selectAll(): void {
    const p = store.getState();
    selected = new Set([...p.arrangement.clips.map((c) => c.id), ...p.vocals.flatMap((v) => v.clips.map((c) => c.id))]);
    render();
  }

  el.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).matches("input,select,textarea")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (k === "delete" || k === "backspace") removeSelected();
    else if (mod && k === "d") duplicate();
    else if (mod && k === "c") copy();
    else if (mod && k === "v") paste();
    else if (mod && k === "a") selectAll();
    else if (!mod && k === "s") split();
    else return;
    e.preventDefault();
  });

  /**
   * Drag helper for clip-like blocks. During the drag only the element is moved (visual
   * feedback); the change is committed once on release → one undo step, no re-render mid-drag.
   */
  function dragBlock(elm: HTMLElement, opts: {
    resizable?: boolean;
    trimmable?: boolean;
    lanes?: boolean;
    commit: (mode: "move" | "resize" | "trim", dBars: number, dLanes: number, alt: boolean) => void;
  }): void {
    elm.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const r = elm.getBoundingClientRect();
      const mode = e.clientX > r.right - 7 && opts.resizable ? "resize" : e.clientX < r.left + 6 && opts.trimmable ? "trim" : "move";
      const x0 = e.clientX, y0 = e.clientY;
      const left0 = parseFloat(elm.style.left), w0 = parseFloat(elm.style.width);
      elm.setPointerCapture(e.pointerId);
      let moved = false;
      let dx = 0, dL = 0;
      const mv = (ev: PointerEvent) => {
        dx = ev.clientX - x0;
        dL = opts.lanes ? Math.round((ev.clientY - y0) / LANE_H) : 0;
        if (Math.abs(dx) > 3 || Math.abs(ev.clientY - y0) > 3) moved = true;
        if (!moved) return;
        elm.classList.add("dragging");
        if (mode === "resize") elm.style.width = `${Math.max(4, w0 + dx)}px`;
        else if (mode === "trim") {
          elm.style.left = `${left0 + dx}px`;
          elm.style.width = `${Math.max(4, w0 - dx)}px`;
        } else elm.style.transform = `translate(${dx}px, ${dL * LANE_H}px)`;
      };
      const up = () => {
        elm.removeEventListener("pointermove", mv);
        elm.removeEventListener("pointerup", up);
        elm.removeEventListener("pointercancel", up);
        if (moved) opts.commit(mode, dx / barW, dL, e.altKey);
      };
      elm.addEventListener("pointermove", mv);
      elm.addEventListener("pointerup", up);
      elm.addEventListener("pointercancel", up);
    });
  }

  const select1 = (id: string, e: MouseEvent) => {
    if (!e.shiftKey) selected.clear();
    selected.add(id);
    render();
    el.focus();
  };

  // --- inspector (one selected clip) --------------------------------------------------------
  function renderInspector(p: Project): void {
    inspector.textContent = "";
    if (selected.size !== 1) return;
    const id = [...selected][0];
    const pc = p.arrangement.clips.find((c) => c.id === id);
    if (pc) {
      const patSel = h("select", { "aria-label": "Pattern du clip", onchange: () => app.dispatch({ type: "updateClip", clipId: pc.id, patch: { patternId: patSel.value } }) },
        ...p.patterns.map((x) => h("option", { value: x.id, selected: x.id === pc.patternId }, x.name)));
      inspector.append(h("div", { class: "card row-inline" },
        h("strong", {}, "Clip pattern"),
        h("label", { class: "field" }, h("span", { class: "slider-label" }, "PATTERN"), patSel),
        h("span", { class: "hint" }, `mesures ${pc.start + 1} → ${pc.start + pc.length + 1} · ${pc.length} mes.${pc.offset ? ` · démarre ${pc.offset} mes. dans le pattern` : ""}`),
        h("button", { class: `btn btn-toggle btn-sm ${pc.muted ? "on" : ""}`, onclick: () => app.dispatch({ type: "updateClip", clipId: pc.id, patch: { muted: !pc.muted } }) }, pc.muted ? "MUTED" : "Mute"),
        h("button", { class: "btn btn-sm", title: "Remettre le clip au début du pattern", disabled: !pc.offset, onclick: () => app.dispatch({ type: "updateClip", clipId: pc.id, patch: { offset: 0 } }) }, "Réinitialiser le départ"),
        h("button", { class: "btn btn-sm", onclick: () => { app.dispatch({ type: "selectPattern", patternId: pc.patternId }); toast("Pattern sélectionné : éditez-le dans BEAT ou MELODY.", "info"); } }, "Éditer le pattern")));
      return;
    }
    for (const v of p.vocals) {
      const c = v.clips.find((x) => x.id === id);
      if (!c) continue;
      const take = v.takes.find((t) => t.id === c.takeId);
      const up = (patch: Partial<AudioClip>, key?: string) => app.dispatch({ type: "updateAudioClip", trackId: v.id, clipId: c.id, patch }, key);
      inspector.append(h("div", { class: "card row-inline" },
        h("strong", {}, `Clip vocal — ${v.name} · ${take?.name ?? ""}`),
        h("span", { class: "hint" }, `début mesure ${(c.start / spb() + 1).toFixed(2)} · ${c.duration.toFixed(2)} s`),
        slider({ label: "Gain", min: -24, max: 12, step: 0.5, value: c.gainDb, format: fmtDb, reset: 0, onInput: (x) => up({ gainDb: x }, `cg:${c.id}`) }),
        slider({ label: "Fade in", min: 0, max: Math.min(5, c.duration / 2), step: 0.01, value: c.fadeIn ?? 0, format: (x) => `${Math.round(x * 1000)} ms`, onInput: (x) => up({ fadeIn: x }, `cfi:${c.id}`) }),
        slider({ label: "Fade out", min: 0, max: Math.min(5, c.duration / 2), step: 0.01, value: c.fadeOut ?? 0, format: (x) => `${Math.round(x * 1000)} ms`, onInput: (x) => up({ fadeOut: x }, `cfo:${c.id}`) }),
        h("button", { class: `btn btn-toggle btn-sm ${c.muted ? "on" : ""}`, onclick: () => up({ muted: !c.muted }) }, c.muted ? "MUTED" : "Mute"),
        h("button", { class: "btn btn-sm", title: "Gain du clip pour un pic à −1 dBFS", onclick: () => {
          const d = take && app.takeData(take, v.playProcessed);
          if (!d) return;
          const from = Math.floor(c.offset * d.sampleRate), to = Math.min(d.data.length, from + Math.floor(c.duration * d.sampleRate));
          let pk = 0;
          for (let i = from; i < to; i++) pk = Math.max(pk, Math.abs(d.data[i]));
          if (pk < 1e-5) return void toast("Clip silencieux.", "error");
          up({ gainDb: Math.max(-24, Math.min(12, -1 - 20 * Math.log10(pk))) });
        } }, "Normaliser")));
      return;
    }
  }

  const playhead = h("div", { class: "tl-playhead" });
  const cursorEl = h("div", { class: "tl-cursor" });

  function render(): void {
    const p = store.getState();
    const bars = totalBars(p);
    const width = HEAD_W + bars * barW;
    const s = spb();
    timeline.textContent = "";
    timeline.style.width = `${width}px`;
    loopBtn.classList.toggle("on", p.arrangement.loop.enabled);
    const secs = Math.round(stepsToSeconds(songLengthBars(p) * s, p.bpm));
    lengthEl.textContent = `Morceau : ${songLengthBars(p)} mesures · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

    // palette
    palette.textContent = "";
    palette.append(h("span", { class: "slider-label" }, "PATTERNS"));
    for (const pat of p.patterns) {
      palette.append(h("button", { class: `pattern-chip ${armedPattern === pat.id ? "active" : ""}`, style: `--c:${pat.color}`, title: "Choisir puis cliquer sur une piste pour le poser", onclick: () => {
        armedPattern = armedPattern === pat.id ? null : pat.id;
        render();
      } }, pat.name));
    }

    // ruler (bars + time every 4 bars)
    const ruler = h("div", { class: "tl-row tl-ruler", style: `height:22px` }, h("div", { class: "tl-head" }, "Mesure"));
    for (let b = 0; b < bars; b++) {
      if (barW >= 18 || b % 4 === 0) ruler.append(h("span", { class: "tl-bar-num", style: `left:${HEAD_W + b * barW}px` }, String(b + 1)));
      if (b % 8 === 0 && barW >= 14) {
        const t = Math.round(stepsToSeconds(b * s, p.bpm));
        ruler.append(h("span", { class: "tl-time", style: `left:${HEAD_W + b * barW + 2}px` }, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`));
      }
    }
    const lp = p.arrangement.loop;
    ruler.append(h("div", { class: `tl-loop ${lp.enabled ? "on" : ""}`, style: `left:${HEAD_W + lp.start * barW}px;width:${(lp.end - lp.start) * barW}px` }));
    ruler.addEventListener("pointerdown", (e) => {
      const r = timeline.getBoundingClientRect();
      const bar = barAtX(e.clientX - r.left);
      if (e.shiftKey) {
        const start = Math.floor(bar);
        const mv = (ev: PointerEvent) => {
          const end = Math.max(start + 1, Math.ceil(barAtX(ev.clientX - r.left)));
          app.dispatch({ type: "setLoop", loop: { start, end, enabled: true } }, "loop-drag");
        };
        const up = () => {
          window.removeEventListener("pointermove", mv);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", mv);
        window.addEventListener("pointerup", up);
        return;
      }
      engine.setMode("song");
      engine.seek(Math.round(bar * 4) / 4 * s);
      render();
    });
    timeline.append(ruler);

    // sections
    const secRow = h("div", { class: "tl-row tl-sections", style: "height:28px" }, h("div", { class: "tl-head" }, "Sections"));
    for (const sec of p.arrangement.sections) {
      const b = h("div", { class: `tl-section ${selected.has(sec.id) ? "selected" : ""}`, style: `left:${HEAD_W + sec.start * barW}px;width:${sec.length * barW - 1}px;background:${sec.color}`, title: `${sec.name} — mesures ${sec.start + 1} à ${sec.start + sec.length} (double-clic = renommer)` }, sec.name);
      b.addEventListener("contextmenu", (e) => { e.preventDefault(); app.dispatch({ type: "removeSection", sectionId: sec.id }); });
      b.addEventListener("dblclick", () => {
        const n = window.prompt("Nom de la section :", sec.name);
        if (n) app.dispatch({ type: "updateSection", sectionId: sec.id, patch: { name: n } });
      });
      b.addEventListener("click", (e) => select1(sec.id, e));
      dragBlock(b, {
        resizable: true,
        commit: (mode, dB) =>
          app.dispatch({ type: "updateSection", sectionId: sec.id, patch: mode === "resize" ? { length: Math.max(1, Math.round(sec.length + dB)) } : { start: Math.max(0, Math.round(sec.start + dB)) } }),
      });
      secRow.append(b);
    }
    timeline.append(secRow);

    // pattern lanes
    for (let lane = 0; lane < p.arrangement.lanes; lane++) {
      const laneName = p.arrangement.laneNames?.[lane] || `Patterns ${lane + 1}`;
      const head = h("div", { class: "tl-head", title: "Double-clic = renommer la piste" }, laneName);
      head.addEventListener("dblclick", () => {
        const n = window.prompt("Nom de la piste :", laneName);
        if (n !== null) app.dispatch({ type: "setLaneName", lane, name: n });
      });
      const row = h("div", { class: "tl-row tl-lane", style: `height:${LANE_H}px`, "data-lane": lane }, head);
      row.addEventListener("pointerdown", (e) => {
        if (e.target !== row) return;
        if (!armedPattern) {
          selected.clear();
          render();
          return;
        }
        const r = timeline.getBoundingClientRect();
        const bar = Math.floor(barAtX(e.clientX - r.left) / Math.max(0.25, snap)) * Math.max(0.25, snap);
        const pat = p.patterns.find((x) => x.id === armedPattern)!;
        app.dispatch({ type: "addClip", clip: { patternId: pat.id, lane, start: bar, length: Math.max(1, pat.stepCount / 16) } });
      });
      for (const c of p.arrangement.clips.filter((x) => x.lane === lane)) {
        const pat = p.patterns.find((x) => x.id === c.patternId);
        if (!pat) continue;
        const patBars = pat.stepCount / 16;
        const first = (patBars - ((c.offset ?? 0) % patBars)) % patBars;
        const marks: number[] = [];
        for (let x = first || patBars; x < c.length - 1e-6; x += patBars) marks.push(x);
        const b = h("div", { class: `tl-clip ${selected.has(c.id) ? "selected" : ""} ${c.muted ? "muted" : ""}`, style: `left:${HEAD_W + c.start * barW}px;width:${c.length * barW - 1}px;--c:${pat.color}`, title: `${pat.name} (${c.length} mesures)${c.muted ? " — muted" : ""}`, "data-clip": c.id },
          h("span", {}, `${c.muted ? "🔇 " : ""}${pat.name}`),
          ...marks.map((x) => h("i", { class: "tl-rep", style: `left:${x * barW}px` })));
        b.addEventListener("click", (e) => select1(c.id, e));
        b.addEventListener("contextmenu", (e) => { e.preventDefault(); app.dispatch({ type: "removeClips", ids: [c.id] }); });
        b.addEventListener("dblclick", () => {
          app.dispatch({ type: "selectPattern", patternId: pat.id });
          toast(`Pattern « ${pat.name} » sélectionné : éditez-le dans BEAT ou MELODY.`, "info");
        });
        dragBlock(b, {
          resizable: true,
          lanes: true,
          commit: (mode, dB, dL, alt) => {
            if (mode === "resize") return app.dispatch({ type: "updateClip", clipId: c.id, patch: { length: Math.max(0.25, snapBar(c.length + dB) || 0.25) } });
            const target = { start: snapBar(c.start + dB), lane: Math.max(0, c.lane + dL) };
            // Alt+drag = copy (the original stays in place).
            if (alt) app.dispatch({ type: "addClip", clip: { patternId: c.patternId, length: c.length, offset: c.offset, muted: c.muted, ...target } });
            else app.dispatch({ type: "updateClip", clipId: c.id, patch: target });
          },
        });
        row.append(b);
      }
      timeline.append(row);
    }

    // vocal lanes
    for (const v of p.vocals) {
      const row = h("div", { class: "tl-row tl-lane tl-vocal", style: `height:${LANE_H}px` }, h("div", { class: "tl-head" }, `🎙 ${v.name}`));
      row.addEventListener("pointerdown", (e) => {
        if (e.target === row) {
          selected.clear();
          render();
        }
      });
      for (const c of v.clips) {
        const take = v.takes.find((t) => t.id === c.takeId);
        if (!take) continue;
        const x = HEAD_W + (c.start / s) * barW;
        const w = Math.max(4, (secondsToSteps(c.duration, p.bpm) / s) * barW);
        const canvas = h("canvas", { width: Math.min(4000, Math.round(w)), height: LANE_H - 14 });
        const pxPerSec = w / c.duration;
        const fades = h("div", { class: "tl-fades" });
        fades.innerHTML = `<svg width="${Math.round(w)}" height="${LANE_H}" viewBox="0 0 ${Math.round(w)} ${LANE_H}">${c.fadeIn ? `<polygon points="0,0 ${(c.fadeIn * pxPerSec).toFixed(1)},0 0,${LANE_H}" />` : ""}${c.fadeOut ? `<polygon points="${w},0 ${(w - c.fadeOut * pxPerSec).toFixed(1)},0 ${w},${LANE_H}" />` : ""}</svg>`;
        const b = h("div", { class: `tl-aclip ${selected.has(c.id) ? "selected" : ""} ${c.muted ? "muted" : ""}`, style: `left:${x}px;width:${w}px`, title: `${take.name} · ${c.duration.toFixed(1)} s · gain ${c.gainDb.toFixed(1)} dB (molette) · sélectionnez pour fades / mute` }, h("span", {}, `${c.muted ? "🔇 " : ""}${take.name}`), canvas, fades);
        const data = app.takeData(take, v.playProcessed);
        if (data) {
          const from = Math.floor(c.offset * data.sampleRate);
          drawWaveform(canvas, data.data, "#c4b5fd", from, Math.min(data.data.length, from + Math.floor(c.duration * data.sampleRate)));
        }
        b.addEventListener("click", (e) => select1(c.id, e));
        b.addEventListener("contextmenu", (e) => { e.preventDefault(); app.dispatch({ type: "removeAudioClips", trackId: v.id, ids: [c.id] }); });
        b.addEventListener("wheel", (e) => {
          e.preventDefault();
          app.dispatch({ type: "updateAudioClip", trackId: v.id, clipId: c.id, patch: { gainDb: c.gainDb + (e.deltaY < 0 ? 0.5 : -0.5) } }, `gain:${c.id}`);
        }, { passive: false });
        const take0 = app.takeData(take);
        const takeDur = take0 ? take0.data.length / take0.sampleRate : c.offset + c.duration;
        dragBlock(b, {
          resizable: true,
          trimmable: true,
          commit: (mode, dB, _dL, alt) => {
            const sec = (dB * s * 60) / (p.bpm * 4);
            const toStep = (st: number) => (snap < 0.25 ? Math.max(0, Math.round(st * 4) / 4) : snapStep(st));
            if (mode === "move") {
              const start = toStep(c.start + dB * s);
              if (alt) app.dispatch({ type: "addAudioClips", trackId: v.id, clips: [{ ...c, start }] });
              else app.dispatch({ type: "updateAudioClip", trackId: v.id, clipId: c.id, patch: { start } });
            } else if (mode === "resize") app.dispatch({ type: "updateAudioClip", trackId: v.id, clipId: c.id, patch: { duration: Math.max(0.05, Math.min(takeDur - c.offset, c.duration + sec)) } });
            else {
              const t = Math.max(-c.offset, Math.min(c.duration - 0.05, sec));
              app.dispatch({ type: "updateAudioClip", trackId: v.id, clipId: c.id, patch: { start: c.start + secondsToSteps(t, p.bpm), offset: c.offset + t, duration: c.duration - t } });
            }
          },
        });
        row.append(b);
      }
      timeline.append(row);
    }

    // automation lane
    autoSel.textContent = "";
    autoSel.append(h("option", { value: "" }, "— aucune —"));
    for (const c of p.channels.filter((x) => x.kind !== "return")) {
      for (const param of ["volume", "pan"] as const) {
        if (c.kind === "master" && param === "pan") continue;
        const v = `${c.id}|${param}`;
        const has = p.automation.some((l) => l.channelId === c.id && l.param === param && l.points.length);
        autoSel.append(h("option", { value: v, selected: v === autoTarget }, `${has ? "● " : ""}${c.name} · ${param}`));
      }
    }
    if (autoTarget) renderAutomation(p, bars);

    renderInspector(p);
    cursorEl.style.left = `${HEAD_W + (engine.cursor / s) * barW}px`;
    timeline.append(cursorEl, playhead);
    if (!p.arrangement.clips.length && !p.vocals.some((v) => v.clips.length))
      timeline.append(h("div", { class: "tl-empty" }, "Arrangement vide : choisissez un pattern dans la palette et cliquez sur une piste, ou utilisez l'AI BEAT GENERATOR / l'onglet STRUCTURE de l'IA."));
  }

  function renderAutomation(p: Project, bars: number): void {
    const [channelId, param] = autoTarget.split("|") as [string, "volume" | "pan"];
    const ch = p.channels.find((c) => c.id === channelId);
    if (!ch) return;
    const lane = p.automation.find((l) => l.channelId === channelId && l.param === param);
    const H = 70;
    const min = param === "pan" ? -1 : 0, max = param === "pan" ? 1 : 1.5;
    const row = h("div", { class: "tl-row tl-auto", style: `height:${H}px` }, h("div", { class: "tl-head" }, `${ch.name} · ${param}`));
    const cv = h("canvas", { width: bars * barW, height: H, style: `left:${HEAD_W}px` });
    const pts = lane?.points ?? [];
    const yOf = (v: number) => H - ((v - min) / (max - min)) * (H - 6) - 3;
    const ctx = cv.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(0, yOf(param === "pan" ? 0 : ch.volume));
      ctx.lineTo(cv.width, yOf(param === "pan" ? 0 : ch.volume));
      ctx.stroke();
      ctx.strokeStyle = "#22d3ee";
      ctx.fillStyle = "#22d3ee";
      ctx.beginPath();
      if (pts.length) {
        ctx.moveTo(0, yOf(pts[0].value));
        for (const pt of pts) ctx.lineTo(pt.bar * barW, yOf(pt.value));
        ctx.lineTo(cv.width, yOf(pts[pts.length - 1].value));
      }
      ctx.stroke();
      for (const pt of pts) ctx.fillRect(pt.bar * barW - 3, yOf(pt.value) - 3, 6, 6);
    }
    const valueAtY = (y: number) => Math.max(min, Math.min(max, min + ((H - 3 - y) / (H - 6)) * (max - min)));
    cv.addEventListener("pointerdown", (e) => {
      const r = cv.getBoundingClientRect();
      const bar = Math.max(0, Math.round(((e.clientX - r.left) / barW) * 4) / 4);
      const existing = pts.findIndex((pt) => Math.abs(pt.bar - bar) * barW < 6);
      let next = pts.slice();
      if (e.button === 2 || e.altKey) {
        if (existing >= 0) next.splice(existing, 1);
      } else if (existing >= 0) next[existing] = { bar, value: valueAtY(e.clientY - r.top) };
      else next = [...next, { bar, value: valueAtY(e.clientY - r.top) }];
      app.dispatch({ type: "setAutomation", lane: { id: lane?.id ?? newId("auto"), channelId, param, points: next } });
    });
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    row.append(cv);
    if (lane) row.append(h("button", { class: "btn btn-sm tl-auto-clear", onclick: () => app.dispatch({ type: "removeAutomation", laneId: lane.id }) }, "Effacer"));
    row.append(h("span", { class: "tl-auto-help hint" }, "clic = point · clic droit / Alt+clic = supprimer"));
    timeline.append(row);
  }

  let sig = "";
  let lastFollow = 0;
  return {
    el,
    update(p) {
      const s = JSON.stringify([p.arrangement, p.vocals.map((v) => [v.name, v.clips, v.playProcessed, v.takes.map((t) => t.processedAssetId)]), p.patterns.map((x) => [x.id, x.name, x.color, x.stepCount]), p.automation, p.bpm, p.channels.map((c) => [c.name, c.volume])]);
      if (s === sig) return;
      sig = s;
      const ids = new Set([...p.arrangement.clips.map((c) => c.id), ...p.arrangement.sections.map((c) => c.id), ...p.vocals.flatMap((v) => v.clips.map((c) => c.id))]);
      for (const id of selected) if (!ids.has(id)) selected.delete(id);
      render();
    },
    frame() {
      const pos = engine.mode === "song" && (engine.isPlaying || engine.isPaused) ? engine.currentPosition() : -1;
      playhead.style.display = pos < 0 ? "none" : "block";
      if (pos >= 0) {
        const x = HEAD_W + (pos / spb()) * barW;
        playhead.style.left = `${x}px`;
        const now = performance.now();
        if (follow && engine.isPlaying && now - lastFollow > 250 && (x > scroll.scrollLeft + scroll.clientWidth - 40 || x < scroll.scrollLeft + HEAD_W)) {
          lastFollow = now;
          scroll.scrollLeft = Math.max(0, x - HEAD_W - 40);
        }
      }
      cursorEl.style.left = `${HEAD_W + (engine.cursor / spb()) * barW}px`;
    },
  };
}
