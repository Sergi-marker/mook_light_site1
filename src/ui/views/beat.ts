import { generateDrums } from "../../core/ai/drums.ts";
import { STYLE_FAMILIES, STYLES, styleById } from "../../core/ai/styles.ts";
import { instrumentDef, PITCH_RANGE, STEP_COUNTS, STEPS_PER_BEAT } from "../../core/constants.ts";
import { currentPattern, getChannel } from "../../core/project.ts";
import type { Action } from "../../core/reducer.ts";
import type { Project, Step, StepCount, Track } from "../../core/types.ts";
import type { App, View } from "../app.ts";
import { confirmDialog, h, toast } from "../dom.ts";
import { patternBar } from "./patternBar.ts";
import { DEFAULT_SAMPLE_EDIT } from "../../core/project.ts";
import { drawWaveform, fmtDb, reactive, slider } from "../widgets.ts";

interface Row {
  el: HTMLElement;
  mute: HTMLButtonElement;
  solo: HTMLButtonElement;
  vol: HTMLInputElement;
  volLabel: HTMLElement;
  pan: HTMLInputElement;
  pitch: HTMLInputElement;
  sound: HTMLSelectElement;
  cells: HTMLButtonElement[];
}

const VEL_STEP = 8;

export function createBeatView(app: App): View {
  const { store, engine } = app;
  const stepsSelect = h("select", { "aria-label": "Nombre de steps", onchange: () => app.dispatch({ type: "setStepCount", stepCount: Number(stepsSelect.value) as StepCount }) },
    ...STEP_COUNTS.map((n) => h("option", { value: n }, `${n} steps`)));
  const genreSel = h("select", { "aria-label": "Style du générateur" }, ...STYLE_FAMILIES.map((fam) => h("optgroup", { label: fam },
    ...STYLES.filter((x) => x.family === fam).map((x) => h("option", { value: x.id }, x.label)))));
  const humanAmt = h("input", { type: "range", min: 0, max: 1, step: 0.05, value: 0.5, "aria-label": "Quantité d'humanisation", title: "Quantité d'humanisation" });

  const generate = async () => {
    const p = store.getState();
    const pat = currentPattern(p);
    if (Object.values(pat.drums).some((s) => s.some((x) => x.on)) && !(await confirmDialog("Remplacer les drums ?", "Le générateur va remplacer les drums de ce pattern (annulable avec Ctrl+Z).", "Générer", "Annuler"))) return;
    const st = styleById(genreSel.value);
    const drums = generateDrums({ genre: st.genre, style: st, energy: st.energy, complexity: st.complexity, stepCount: pat.stepCount, seed: Math.floor(Math.random() * 1e6) });
    const actions: Action[] = p.tracks.map((t) => ({ type: "setDrumSteps", trackId: t.id, steps: drums[t.instrument] }));
    if (p.swing === 0 && st.swing) actions.push({ type: "setSwing", swing: st.swing });
    app.dispatch({ type: "batch", actions });
  };

  let laneClipboard: Step[] | null = null;
  const selTrack = (): Track | null => {
    const p = store.getState();
    const t = p.tracks.find((x) => x.id === app.selectedTrackId);
    if (!t) toast("Sélectionnez d'abord une piste (clic sur son nom).", "error");
    return t ?? null;
  };
  const laneSteps = (t: Track) => currentPattern(store.getState()).drums[t.id] ?? [];
  const shiftLane = (d: number) => {
    const t = selTrack();
    if (!t) return;
    const st = laneSteps(t);
    const n = st.length;
    app.dispatch({ type: "setDrumSteps", trackId: t.id, steps: st.map((_, i) => ({ ...st[(i - d + n) % n] })) }, `shift:${t.id}`);
  };
  const selName = h("span", { class: "hint" });
  const laneTools = h("div", { class: "toolbar lane-tools" },
    h("span", { class: "slider-label" }, "PISTE"), selName,
    h("button", { class: "btn btn-sm", title: "Décaler la piste d'un step vers la gauche (rotation)", onclick: () => shiftLane(-1) }, "◀ Décaler"),
    h("button", { class: "btn btn-sm", title: "Décaler la piste d'un step vers la droite (rotation)", onclick: () => shiftLane(1) }, "Décaler ▶"),
    h("button", { class: "btn btn-sm", title: "Copier les steps de la piste", onclick: () => {
      const t = selTrack();
      if (!t) return;
      laneClipboard = laneSteps(t).map((x) => ({ ...x }));
      toast(`Piste « ${t.name} » copiée — collez-la sur une autre piste ou un autre pattern.`, "info");
    } }, "Copier"),
    h("button", { class: "btn btn-sm", title: "Coller les steps copiés sur la piste sélectionnée", onclick: () => {
      const t = selTrack();
      if (!t || !laneClipboard) return;
      const n = currentPattern(store.getState()).stepCount;
      app.dispatch({ type: "setDrumSteps", trackId: t.id, steps: Array.from({ length: n }, (_, i) => ({ ...laneClipboard![i % laneClipboard!.length] })) });
    } }, "Coller"),
    h("button", { class: "btn btn-sm", title: "Inverser la piste (de la fin vers le début)", onclick: () => {
      const t = selTrack();
      if (t) app.dispatch({ type: "setDrumSteps", trackId: t.id, steps: laneSteps(t).slice().reverse().map((x) => ({ ...x })) });
    } }, "Inverser"),
  );

  const toolbar = h("div", { class: "toolbar" },
    h("h1", {}, "BEAT"),
    stepsSelect,
    h("button", { class: "btn", title: "Double la longueur du pattern en recopiant son contenu (16→32→64)", onclick: () => app.dispatch({ type: "duplicatePattern" }) }, "Dupliquer ×2"),
    h("button", { class: "btn", title: "Humaniser : micro-décalages et variations de vélocité", onclick: () => app.dispatch({ type: "humanize", amount: Number(humanAmt.value), seed: Date.now() % 100000 }) }, "Humaniser"), humanAmt,
    h("button", { class: "btn", title: "Quantifier : remet tous les coups sur la grille", onclick: () => app.dispatch({ type: "quantize" }) }, "Quantifier"),
    h("button", { class: "btn", title: "Effacer toutes les notes du pattern", onclick: async () => {
      if (await confirmDialog("Effacer le pattern ?", "Toutes les notes de ce pattern seront supprimées (annulable avec Ctrl+Z).", "Effacer", "Annuler", true)) app.dispatch({ type: "clearPattern" });
    } }, "Effacer"),
    h("span", { class: "sep" }),
    genreSel,
    h("button", { class: "btn btn-ai", title: "AI DRUM GENERATOR : pattern éditable du style choisi", onclick: () => void generate() }, "✨ Générer drums"),
  );
  const help = h("p", { class: "hint" }, "Clic = note · Molette / Shift+glisser = vélocité · Alt+clic = roll (×2, ×3, ×4) · Clic sur le nom = écouter et sélectionner (M/S)");
  const pbar = patternBar(app);
  const grid = h("div", { class: "grid", role: "grid", "aria-label": "Step sequencer" });
  const editor = h("div", { class: "card sample-editor" });
  const el = h("section", { class: "view beat-view" }, toolbar, pbar.el, laneTools, help, h("div", { class: "grid-scroll" }, grid), editor);

  /** SAMPLER panel for the selected drum lane: trim, reverse, fades, gain, loop (non-destructive). */
  function renderEditor(): void {
    editor.textContent = "";
    const p = store.getState();
    const t = p.tracks.find((x) => x.id === app.selectedTrackId);
    if (!t) {
      editor.append(h("p", { class: "hint" }, "SAMPLER : cliquez sur le nom d'une piste pour éditer son son (découpe, reverse, fondus, gain, boucle)."));
      return;
    }
    const e = { ...DEFAULT_SAMPLE_EDIT, ...(t.sampleEdit ?? {}) };
    const set = (patch: Partial<typeof e>) => app.dispatch({ type: "editSample", trackId: t.id, edit: patch }, `se:${t.id}`);
    const raw = (t.sampleId ? engine.seq?.samples.get(t.sampleId) : undefined) ?? undefined;
    const cv = h("canvas", { class: "se-wave", width: 520, height: 70 });
    const buf = raw ?? (engine.seq ? engine.seq.bufferForTrack({ ...t, sampleEdit: undefined }) : undefined);
    if (buf) {
      drawWaveform(cv, buf.getChannelData(0), "#a68bff");
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, e.start * cv.width, cv.height);
      ctx.fillRect(e.end * cv.width, 0, cv.width - e.end * cv.width, cv.height);
    }
    const name = t.sampleId ? p.samples.find((x) => x.id === t.sampleId)?.name ?? "sample" : "son intégré";
    editor.append(
      h("div", { class: "row-inline" }, h("h3", {}, `SAMPLER — ${t.name}`), h("span", { class: "hint" }, `${name}${buf ? ` · ${buf.duration.toFixed(2)} s` : " · démarrez l'audio (Play) pour voir la forme d'onde"}`),
        h("button", { class: "btn btn-sm", onclick: () => void engine.previewDrum(t.id) }, "▶ Écouter"),
        h("button", { class: "btn btn-sm", onclick: () => void app.importSample(t.id) }, "Importer WAV/MP3/AIFF/OGG…"),
        h("button", { class: "btn btn-sm", onclick: () => app.dispatch({ type: "editSample", trackId: t.id, edit: null }) }, "Réinitialiser")),
      cv,
      h("div", { class: "sliders" },
        slider({ label: "Début", min: 0, max: 0.99, step: 0.005, value: e.start, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => set({ start: v }) }),
        slider({ label: "Fin", min: 0.01, max: 1, step: 0.005, value: e.end, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => set({ end: v }) }),
        slider({ label: "Fade in", min: 0, max: 0.5, step: 0.001, value: e.fadeIn, format: (v) => `${Math.round(v * 1000)} ms`, onInput: (v) => set({ fadeIn: v }) }),
        slider({ label: "Fade out", min: 0, max: 1, step: 0.001, value: e.fadeOut, format: (v) => `${Math.round(v * 1000)} ms`, onInput: (v) => set({ fadeOut: v }) }),
        slider({ label: "Gain", min: -24, max: 12, step: 0.5, value: e.gainDb, format: fmtDb, reset: 0, onInput: (v) => set({ gainDb: v }) }),
        slider({ label: "Pitch", min: -24, max: 24, step: 1, value: t.pitch, format: (v) => `${v > 0 ? "+" : ""}${v} st`, reset: 0, onInput: (v) => app.dispatch({ type: "updateTrack", trackId: t.id, patch: { pitch: v } }, `pitch:${t.id}`) })),
      h("div", { class: "row-inline" },
        h("button", { class: `btn btn-toggle btn-sm ${e.reverse ? "on" : ""}`, onclick: () => set({ reverse: !e.reverse }) }, "⇄ Reverse"),
        h("button", { class: `btn btn-toggle btn-sm ${e.loop ? "on" : ""}`, title: "Boucle la zone jusqu'au coup suivant de la piste", onclick: () => set({ loop: !e.loop }) }, "⟳ Loop"),
        h("span", { class: "hint" }, "Time-stretch : non disponible (le pitch change la durée, comme sur un sampler classique).")));
  }
  const rerenderEditor = reactive(editor, renderEditor);
  let editorSig = "";

  let rows: Row[] = [];
  let layoutKey = "";
  let lastPlayhead = -1;

  function buildRow(p: Project, t: Track, steps: number): Row {
    const def = instrumentDef(t.instrument);
    const id = t.id;
    const nameBtn = h("button", { class: "track-name", title: "Écouter et sélectionner (M / S)", onclick: () => {
      app.selectedTrackId = id;
      update(store.getState());
      void engine.previewDrum(id);
    } }, h("i", { class: "swatch", style: `background:${def.color}` }), t.name);
    const mute = h("button", { class: "btn btn-toggle btn-sm", title: "Mute (M)", onclick: () => app.dispatch({ type: "toggleMute", trackId: id }) }, "M");
    const solo = h("button", { class: "btn btn-toggle btn-sm solo", title: "Solo (S)", onclick: () => app.dispatch({ type: "toggleSolo", trackId: id }) }, "S");
    const vol = h("input", { type: "range", min: 0, max: 1.5, step: 0.01, class: "vol", "aria-label": `Volume ${t.name}`, "data-learn": `channel:${id}:volume`,
      oninput: () => app.dispatch({ type: "updateChannel", channelId: id, patch: { volume: Number(vol.value) } }, `vol:${id}`),
      ondblclick: () => app.dispatch({ type: "updateChannel", channelId: id, patch: { volume: 0.8 } }) });
    const volLabel = h("span", { class: "val small" });
    const pan = h("input", { type: "range", min: -1, max: 1, step: 0.01, class: "pan pro-only", "aria-label": `Pan ${t.name}`, title: "Pan (double-clic = centre)",
      oninput: () => app.dispatch({ type: "updateChannel", channelId: id, patch: { pan: Number(pan.value) } }, `pan:${id}`),
      ondblclick: () => app.dispatch({ type: "updateChannel", channelId: id, patch: { pan: 0 } }) });
    const pitch = h("input", { type: "number", min: -PITCH_RANGE, max: PITCH_RANGE, step: 1, class: "num pitch pro-only", "aria-label": `Pitch ${t.name}`, title: "Pitch en demi-tons",
      onchange: () => app.dispatch({ type: "updateTrack", trackId: id, patch: { pitch: Number(pitch.value) } }) });
    const sound = h("select", { class: "sound", "aria-label": `Son ${t.name}`, onchange: () => {
      const v = sound.value;
      if (v === "__import") {
        sound.value = store.getState().tracks.find((x) => x.id === id)?.sampleId ?? "";
        void app.importSample(id);
      } else app.dispatch({ type: "assignSample", trackId: id, sampleId: v || null });
    } }, h("option", { value: "" }, "Son intégré"), ...p.samples.map((s) => h("option", { value: s.id }, s.name)), h("option", { value: "__import" }, "Importer un fichier…"));
    const spBar = p.timeSignature.beats * STEPS_PER_BEAT * (4 / p.timeSignature.beatUnit);
    const cells = Array.from({ length: steps }, (_, i) => {
      const c = h("button", { class: "cell", role: "gridcell", "data-step": i, "aria-label": `${t.name} step ${i + 1}`,
        onclick: (e: Event) => {
          const me = e as MouseEvent;
          if (me.shiftKey) return;
          const s = currentPattern(store.getState()).drums[id]?.[i];
          if (me.altKey) {
            if (!s?.on) app.dispatch({ type: "setStep", trackId: id, step: i, value: { on: true, roll: 2 } });
            else app.dispatch({ type: "setStep", trackId: id, step: i, value: { roll: ((s.roll ?? 1) % 4) + 1 } });
            return;
          }
          app.dispatch({ type: "toggleStep", trackId: id, step: i });
        } });
      if (i % STEPS_PER_BEAT === 0) c.classList.add("beat-start");
      if (i % spBar === 0) c.classList.add("bar-start");
      c.addEventListener("wheel", (e) => {
        const s = currentPattern(store.getState()).drums[id]?.[i];
        if (!s?.on) return;
        e.preventDefault();
        app.dispatch({ type: "setStepVelocity", trackId: id, step: i, velocity: s.velocity + (e.deltaY < 0 ? VEL_STEP : -VEL_STEP) }, `vel:${id}:${i}`);
      }, { passive: false });
      c.addEventListener("pointerdown", (e) => {
        const s = currentPattern(store.getState()).drums[id]?.[i];
        if (!e.shiftKey || !s?.on) return;
        e.preventDefault();
        const startY = e.clientY, startVel = s.velocity;
        c.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => app.dispatch({ type: "setStepVelocity", trackId: id, step: i, velocity: startVel + (startY - ev.clientY) }, `vel:${id}:${i}`);
        const up = () => {
          c.removeEventListener("pointermove", move);
          c.removeEventListener("pointerup", up);
        };
        c.addEventListener("pointermove", move);
        c.addEventListener("pointerup", up);
      });
      return c;
    });
    const el = h("div", { class: "row", role: "row" },
      h("div", { class: "row-head" }, nameBtn, mute, solo, vol, volLabel, pan, pitch, sound,
        h("button", { class: "btn btn-icon btn-sm", title: "Effacer la piste", "aria-label": `Effacer ${t.name}`, onclick: () => app.dispatch({ type: "clearTrack", trackId: id }) }, "⌫")),
      h("div", { class: "cells", style: `--steps:${steps}` }, ...cells));
    return { el, mute, solo, vol, volLabel, pan, pitch, sound, cells };
  }

  function update(p: Project): void {
    const pat = currentPattern(p);
    pbar.update(p);
    const sel = p.tracks.find((x) => x.id === app.selectedTrackId);
    selName.textContent = sel ? `« ${sel.name} »` : "(cliquez sur un nom de piste)";
    const es = sel ? `${sel.id}|${sel.sampleId}|${sel.pitch}|${JSON.stringify(sel.sampleEdit ?? null)}|${engine.isReady}` : "";
    if (es !== editorSig) {
      editorSig = es;
      rerenderEditor();
    }
    stepsSelect.value = String(pat.stepCount);
    el.classList.toggle("mode-pro", app.settings.mode === "pro");
    const key = [pat.stepCount, p.timeSignature.beats, p.timeSignature.beatUnit, p.samples.map((s) => s.id).join(), p.tracks.map((t) => `${t.id}:${t.name}`).join()].join("|");
    if (key !== layoutKey) {
      layoutKey = key;
      grid.textContent = "";
      rows = p.tracks.map((t) => buildRow(p, t, pat.stepCount));
      grid.append(...rows.map((r) => r.el));
      lastPlayhead = -1;
    }
    const anySolo = p.channels.some((c) => c.solo && (c.kind === "drum" || c.kind === "instrument" || c.kind === "vocal"));
    p.tracks.forEach((t, idx) => {
      const r = rows[idx];
      const ch = getChannel(p, t.id)!;
      r.el.classList.toggle("selected", app.selectedTrackId === t.id);
      r.el.classList.toggle("silenced", ch.mute || (anySolo && !ch.solo));
      r.mute.classList.toggle("on", ch.mute);
      r.solo.classList.toggle("on", ch.solo);
      r.mute.setAttribute("aria-pressed", String(ch.mute));
      r.solo.setAttribute("aria-pressed", String(ch.solo));
      if (document.activeElement !== r.vol) r.vol.value = String(ch.volume);
      r.volLabel.textContent = `${Math.round(ch.volume * 100)}%`;
      if (document.activeElement !== r.pan) r.pan.value = String(ch.pan);
      if (document.activeElement !== r.pitch) r.pitch.value = String(t.pitch);
      r.sound.value = t.sampleId ?? "";
      const steps = pat.drums[t.id] ?? [];
      steps.forEach((s, i) => {
        const c = r.cells[i];
        if (!c) return;
        c.classList.toggle("on", s.on);
        c.style.setProperty("--vel", String(s.velocity / 127));
        c.setAttribute("aria-pressed", String(s.on));
        c.dataset.roll = s.on && (s.roll ?? 1) > 1 ? `×${s.roll}` : "";
        c.title = s.on ? `Vélocité ${s.velocity}${(s.roll ?? 1) > 1 ? ` · roll ×${s.roll}` : ""}${s.offset ? ` · décalage ${(s.offset * 100).toFixed(0)}%` : ""}` : "";
      });
    });
  }

  function frame(): void {
    const step = engine.getPlayheadStep();
    if (step === lastPlayhead) return;
    for (const r of rows) {
      r.cells[lastPlayhead]?.classList.remove("ph");
      r.cells[step]?.classList.add("ph");
    }
    lastPlayhead = step;
  }

  return { el, update, frame };
}
