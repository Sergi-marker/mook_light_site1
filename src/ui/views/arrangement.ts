// ARRANGEMENT: song timeline. Sections, pattern clips, vocal clips, loop region,
// automation, cursor & playhead. Positions in bars (pattern clips snap to 1/4 bar).

import { currentPattern, secondsToSteps, songLengthBars, stepsPerBarOf, newId } from "../../core/project.ts";
import type { AudioClip, Project } from "../../core/types.ts";
import type { App, View } from "../app.ts";
import { confirmDialog, h, toast } from "../dom.ts";
import { drawWaveform } from "../widgets.ts";

const SECTION_PRESETS: [string, string][] = [
  ["Intro", "#64748b"], ["Verse", "#2563eb"], ["Pre-Chorus", "#0891b2"], ["Chorus", "#db2777"],
  ["Verse 2", "#4f46e5"], ["Bridge", "#d97706"], ["Outro", "#475569"],
];
const LANE_H = 46;
const HEAD_W = 130;

export function createArrangementView(app: App): View {
  const { store, engine } = app;
  let barW = 36;
  let selected = new Set<string>();
  let armedPattern: string | null = null;
  let autoChannel = "";

  const sectionSel = h("select", { "aria-label": "Section à ajouter" }, ...SECTION_PRESETS.map(([n]) => h("option", { value: n }, n)), h("option", { value: "__custom" }, "Personnalisée…"));
  const loopBtn = h("button", { class: "btn btn-toggle btn-sm", title: "Lecture en boucle de la région (aussi utilisée pour le punch in/out)", onclick: () => app.dispatch({ type: "setLoop", loop: { enabled: !store.getState().arrangement.loop.enabled } }) }, "⟳ LOOP");
  const lengthEl = h("span", { class: "hint" });
  const palette = h("div", { class: "palette" });
  const autoSel = h("select", { "aria-label": "Automation", onchange: () => {
    autoChannel = autoSel.value;
    render();
  } });

  const toolbar = h("div", { class: "toolbar" },
    h("h1", {}, "ARRANGEMENT"),
    sectionSel,
    h("button", { class: "btn btn-sm", title: "Ajoute la section à la fin du morceau (ou au curseur)", onclick: () => addSection() }, "+ Section"),
    loopBtn,
    h("button", { class: "btn btn-sm", title: "Dupliquer la sélection (Ctrl+D)", onclick: () => duplicate() }, "Dupliquer"),
    h("button", { class: "btn btn-sm", title: "Supprimer la sélection (Suppr)", onclick: () => removeSelected() }, "Supprimer"),
    h("button", { class: "btn btn-sm", title: "Ajouter une piste de patterns", onclick: () => app.dispatch({ type: "setLanes", lanes: store.getState().arrangement.lanes + 1 }) }, "+ Piste"),
    h("button", { class: "btn btn-icon btn-sm", title: "Zoom −", onclick: () => { barW = Math.max(10, barW * 0.8); render(); } }, "−"),
    h("button", { class: "btn btn-icon btn-sm", title: "Zoom +", onclick: () => { barW = Math.min(160, barW * 1.25); render(); } }, "+"),
    h("label", { class: "field" }, h("span", { class: "slider-label" }, "AUTOMATION"), autoSel),
    lengthEl,
  );
  const help = h("p", { class: "hint" }, "Choisissez un pattern dans la palette puis cliquez sur une piste pour le poser · glisser = déplacer · bord droit = durée · Alt+glisser = copier · clic droit = supprimer · double-clic = éditer · clic sur la règle = curseur · Shift+glisser sur la règle = boucle");
  const timeline = h("div", { class: "timeline" });
  const scroll = h("div", { class: "tl-scroll" }, timeline);
  const el = h("section", { class: "view arrangement-view", tabindex: 0 }, toolbar, palette, help, scroll);

  const spb = () => stepsPerBarOf(store.getState());
  const totalBars = (p: Project) => Math.max(32, songLengthBars(p) + 8, p.arrangement.loop.end + 4);
  const barAtX = (x: number) => Math.max(0, (x - HEAD_W) / barW);

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
    const actions = [];
    const clipIds = p.arrangement.clips.filter((c) => selected.has(c.id)).map((c) => c.id);
    if (clipIds.length) actions.push({ type: "removeClips" as const, ids: clipIds });
    for (const s of p.arrangement.sections) if (selected.has(s.id)) actions.push({ type: "removeSection" as const, sectionId: s.id });
    for (const v of p.vocals) {
      const ids = v.clips.filter((c) => selected.has(c.id)).map((c) => c.id);
      if (ids.length) actions.push({ type: "removeAudioClips" as const, trackId: v.id, ids });
    }
    if (actions.length) app.dispatch({ type: "batch", actions });
    selected.clear();
  }

  function duplicate(): void {
    const p = store.getState();
    const ids = p.arrangement.clips.filter((c) => selected.has(c.id)).map((c) => c.id);
    if (ids.length) app.dispatch({ type: "duplicateClips", ids });
  }

  el.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).matches("input,select")) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); }
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
    lengthEl.textContent = `Morceau : ${songLengthBars(p)} mesures · ${Math.round((songLengthBars(p) * s * 60) / (p.bpm * 4))} s`;

    // palette
    palette.textContent = "";
    palette.append(h("span", { class: "slider-label" }, "PATTERNS"));
    for (const pat of p.patterns) {
      palette.append(h("button", { class: `pattern-chip ${armedPattern === pat.id ? "active" : ""}`, style: `--c:${pat.color}`, title: "Choisir puis cliquer sur une piste pour le poser", onclick: () => {
        armedPattern = armedPattern === pat.id ? null : pat.id;
        render();
      } }, pat.name));
    }

    // ruler
    const ruler = h("div", { class: "tl-row tl-ruler", style: `height:22px` }, h("div", { class: "tl-head" }, "Mesure"));
    for (let b = 0; b < bars; b++) {
      if (barW >= 18 || b % 4 === 0) ruler.append(h("span", { class: "tl-bar-num", style: `left:${HEAD_W + b * barW}px` }, String(b + 1)));
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
      const b = h("div", { class: `tl-section ${selected.has(sec.id) ? "selected" : ""}`, style: `left:${HEAD_W + sec.start * barW}px;width:${sec.length * barW - 1}px;background:${sec.color}`, title: `${sec.name} — mesures ${sec.start + 1} à ${sec.start + sec.length}` }, sec.name);
      b.addEventListener("contextmenu", (e) => { e.preventDefault(); app.dispatch({ type: "removeSection", sectionId: sec.id }); });
      b.addEventListener("dblclick", () => {
        const n = window.prompt("Nom de la section :", sec.name);
        if (n) app.dispatch({ type: "updateSection", sectionId: sec.id, patch: { name: n } });
      });
      b.addEventListener("click", (e) => { if (!e.shiftKey) selected.clear(); selected.add(sec.id); render(); });
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
      const row = h("div", { class: "tl-row tl-lane", style: `height:${LANE_H}px`, "data-lane": lane }, h("div", { class: "tl-head" }, `Patterns ${lane + 1}`));
      row.addEventListener("pointerdown", (e) => {
        if (e.target !== row || !armedPattern) return;
        const r = timeline.getBoundingClientRect();
        const bar = Math.floor(barAtX(e.clientX - r.left));
        const pat = p.patterns.find((x) => x.id === armedPattern)!;
        app.dispatch({ type: "addClip", clip: { patternId: pat.id, lane, start: bar, length: Math.max(1, pat.stepCount / 16) } });
      });
      for (const c of p.arrangement.clips.filter((x) => x.lane === lane)) {
        const pat = p.patterns.find((x) => x.id === c.patternId);
        if (!pat) continue;
        const patBars = pat.stepCount / 16;
        const repeats = Math.floor(c.length / patBars);
        const b = h("div", { class: `tl-clip ${selected.has(c.id) ? "selected" : ""}`, style: `left:${HEAD_W + c.start * barW}px;width:${c.length * barW - 1}px;--c:${pat.color}`, title: `${pat.name} (${c.length} mesures)`, "data-clip": c.id },
          h("span", {}, pat.name),
          ...Array.from({ length: Math.max(0, repeats - 1) }, (_, i) => h("i", { class: "tl-rep", style: `left:${(i + 1) * patBars * barW}px` })));
        b.addEventListener("click", (e) => { if (!e.shiftKey) selected.clear(); selected.add(c.id); render(); el.focus(); });
        b.addEventListener("contextmenu", (e) => { e.preventDefault(); app.dispatch({ type: "removeClips", ids: [c.id] }); });
        b.addEventListener("dblclick", () => {
          app.dispatch({ type: "selectPattern", patternId: pat.id });
          toast(`Pattern « ${pat.name} » sélectionné : éditez-le dans BEAT ou MELODY.`, "info");
        });
        dragBlock(b, {
          resizable: true,
          lanes: true,
          commit: (mode, dB, dL, alt) => {
            if (mode === "resize") return app.dispatch({ type: "updateClip", clipId: c.id, patch: { length: Math.max(0.25, Math.round((c.length + dB) * 4) / 4) } });
            const target = { start: Math.max(0, Math.round((c.start + dB) * 4) / 4), lane: Math.max(0, c.lane + dL) };
            // Alt+drag = copy (the original stays in place).
            if (alt) app.dispatch({ type: "addClip", clip: { patternId: c.patternId, length: c.length, ...target } });
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
      for (const c of v.clips) {
        const take = v.takes.find((t) => t.id === c.takeId);
        if (!take) continue;
        const x = HEAD_W + (c.start / s) * barW;
        const w = Math.max(4, (secondsToSteps(c.duration, p.bpm) / s) * barW);
        const canvas = h("canvas", { width: Math.min(4000, Math.round(w)), height: LANE_H - 14 });
        const b = h("div", { class: `tl-aclip ${selected.has(c.id) ? "selected" : ""}`, style: `left:${x}px;width:${w}px`, title: `${take.name} · ${c.duration.toFixed(1)} s · gain ${c.gainDb.toFixed(1)} dB (molette)` }, h("span", {}, take.name), canvas);
        const data = app.takeData(take, v.playProcessed);
        if (data) {
          const from = Math.floor(c.offset * data.sampleRate);
          drawWaveform(canvas, data.data, "#c4b5fd", from, Math.min(data.data.length, from + Math.floor(c.duration * data.sampleRate)));
        }
        b.addEventListener("click", (e) => { if (!e.shiftKey) selected.clear(); selected.add(c.id); render(); el.focus(); });
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
          commit: (mode, dB) => {
            const sec = (dB * s * 60) / (p.bpm * 4);
            if (mode === "move") app.dispatch({ type: "updateAudioClip", trackId: v.id, clipId: c.id, patch: { start: Math.max(0, Math.round((c.start + dB * s) * 4) / 4) } });
            else if (mode === "resize") app.dispatch({ type: "updateAudioClip", trackId: v.id, clipId: c.id, patch: { duration: Math.max(0.05, Math.min(takeDur - c.offset, c.duration + sec)) } });
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
    autoSel.append(h("option", { value: "" }, "— aucune —"), ...p.channels.filter((c) => c.kind !== "return").map((c) => h("option", { value: c.id, selected: c.id === autoChannel }, `${c.name} · volume`)));
    if (autoChannel) {
      const ch = p.channels.find((c) => c.id === autoChannel);
      const lane = p.automation.find((l) => l.channelId === autoChannel && l.param === "volume");
      const H = 60;
      const row = h("div", { class: "tl-row tl-auto", style: `height:${H}px` }, h("div", { class: "tl-head" }, `Auto: ${ch?.name ?? ""}`));
      const cv = h("canvas", { width: bars * barW, height: H, style: `left:${HEAD_W}px` });
      const pts = lane?.points ?? [];
      const ctx = cv.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#22d3ee";
        ctx.fillStyle = "#22d3ee";
        ctx.beginPath();
        const yOf = (v: number) => H - (v / 1.5) * (H - 6) - 3;
        if (pts.length) {
          ctx.moveTo(0, yOf(pts[0].value));
          for (const pt of pts) ctx.lineTo(pt.bar * barW, yOf(pt.value));
          ctx.lineTo(cv.width, yOf(pts[pts.length - 1].value));
        }
        ctx.stroke();
        for (const pt of pts) ctx.fillRect(pt.bar * barW - 3, yOf(pt.value) - 3, 6, 6);
      }
      cv.addEventListener("pointerdown", (e) => {
        const r = cv.getBoundingClientRect();
        const bar = Math.max(0, Math.round(((e.clientX - r.left) / barW) * 4) / 4);
        const value = Math.max(0, Math.min(1.5, ((H - 3 - (e.clientY - r.top)) / (H - 6)) * 1.5));
        const existing = pts.findIndex((pt) => Math.abs(pt.bar - bar) * barW < 6);
        let next = pts.slice();
        if (e.button === 2 || e.altKey) {
          if (existing >= 0) next.splice(existing, 1);
        } else if (existing >= 0) next[existing] = { bar, value };
        else next = [...next, { bar, value }];
        app.dispatch({ type: "setAutomation", lane: { id: lane?.id ?? newId("auto"), channelId: autoChannel, param: "volume", points: next } });
      });
      cv.addEventListener("contextmenu", (e) => e.preventDefault());
      row.append(cv);
      if (lane) row.append(h("button", { class: "btn btn-sm tl-auto-clear", onclick: () => app.dispatch({ type: "removeAutomation", laneId: lane.id }) }, "Effacer"));
      timeline.append(row);
    }

    cursorEl.style.left = `${HEAD_W + (engine.cursor / s) * barW}px`;
    timeline.append(cursorEl, playhead);
    if (!p.arrangement.clips.length && !p.vocals.some((v) => v.clips.length))
      timeline.append(h("div", { class: "tl-empty" }, "Arrangement vide : choisissez un pattern dans la palette et cliquez sur une piste, ou utilisez l'AI BEAT GENERATOR / l'assistant (« Propose-moi une structure »)."));
  }

  let sig = "";
  return {
    el,
    update(p) {
      const s = JSON.stringify([p.arrangement, p.vocals.map((v) => [v.clips, v.playProcessed, v.takes.map((t) => t.processedAssetId)]), p.patterns.map((x) => [x.id, x.name, x.color, x.stepCount]), p.automation, p.bpm, p.channels.map((c) => c.name)]);
      if (s === sig) return;
      sig = s;
      render();
    },
    frame() {
      const pos = engine.mode === "song" && (engine.isPlaying || engine.isPaused) ? engine.currentPosition() : -1;
      playhead.style.display = pos < 0 ? "none" : "block";
      if (pos >= 0) playhead.style.left = `${HEAD_W + (pos / spb()) * barW}px`;
      cursorEl.style.left = `${HEAD_W + (engine.cursor / spb()) * barW}px`;
    },
  };
}

void (null as unknown as AudioClip);
void currentPattern;
void confirmDialog;
