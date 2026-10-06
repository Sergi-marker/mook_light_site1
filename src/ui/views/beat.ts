import { instrumentDef, PITCH_RANGE, STEP_COUNTS, STEPS_PER_BEAT } from "../../core/constants.ts";
import type { Project, StepCount, Track } from "../../core/types.ts";
import type { App, View } from "../app.ts";
import { confirmDialog, h } from "../dom.ts";

interface Row {
  track: Track;
  el: HTMLElement;
  nameBtn: HTMLButtonElement;
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
  const stepsSelect = h("select", {
    "aria-label": "Nombre de steps",
    onchange: () => store.dispatch({ type: "setStepCount", stepCount: Number(stepsSelect.value) as StepCount }),
  }, ...STEP_COUNTS.map((n) => h("option", { value: n }, `${n} steps`)));

  const toolbar = h("div", { class: "toolbar" },
    h("h1", {}, "BEAT"),
    stepsSelect,
    h("button", { class: "btn", title: "Double la longueur du pattern en recopiant son contenu (16→32→64)", onclick: () => store.dispatch({ type: "duplicatePattern" }) }, "Dupliquer ×2"),
    h("button", {
      class: "btn", title: "Effacer toutes les notes",
      onclick: async () => {
        if (await confirmDialog("Effacer le pattern ?", "Toutes les notes de toutes les pistes seront supprimées (annulable avec Ctrl+Z).", "Effacer", "Annuler", true))
          store.dispatch({ type: "clearPattern" });
      },
    }, "Effacer"),
    h("span", { class: "hint" }, "Clic = activer · Molette ou Shift+glisser sur une note = vélocité · Clic sur le nom = écouter / sélectionner"),
  );
  const grid = h("div", { class: "grid", role: "grid", "aria-label": "Step sequencer" });
  const el = h("section", { class: "view beat-view" }, toolbar, h("div", { class: "grid-scroll" }, grid));

  let rows: Row[] = [];
  let layoutKey = "";
  let lastPlayhead = -1;

  function soundOptions(p: Project, t: Track): HTMLOptionElement[] {
    return [
      h("option", { value: "" }, "Son intégré"),
      ...p.samples.map((s) => h("option", { value: s.id }, s.name)),
      h("option", { value: "__import" }, "Importer un fichier…"),
    ].map((o) => {
      o.selected = (o.value || null) === t.sampleId;
      return o;
    });
  }

  function buildRow(p: Project, t: Track): Row {
    const def = instrumentDef(t.instrument);
    const id = t.id;
    const nameBtn = h("button", {
      class: "track-name", title: "Écouter et sélectionner (M / S agissent sur la piste sélectionnée)",
      onclick: () => {
        app.selectedTrackId = id;
        update(store.getState());
        void engine.preview(id);
      },
    }, h("i", { class: "swatch", style: `background:${def.color}` }), t.name);
    const mute = h("button", { class: "btn btn-toggle btn-sm", title: "Mute (M)", onclick: () => store.dispatch({ type: "toggleMute", trackId: id }) }, "M");
    const solo = h("button", { class: "btn btn-toggle btn-sm solo", title: "Solo (S)", onclick: () => store.dispatch({ type: "toggleSolo", trackId: id }) }, "S");
    const vol = h("input", {
      type: "range", min: 0, max: 1.5, step: 0.01, class: "vol", "aria-label": `Volume ${t.name}`,
      oninput: () => store.dispatch({ type: "updateTrack", trackId: id, patch: { volume: Number(vol.value) } }, { coalesceKey: `vol:${id}` }),
      ondblclick: () => store.dispatch({ type: "updateTrack", trackId: id, patch: { volume: 0.8 } }),
    });
    const volLabel = h("span", { class: "val small" });
    const pan = h("input", {
      type: "range", min: -1, max: 1, step: 0.01, class: "pan pro-only", "aria-label": `Pan ${t.name}`, title: "Pan (double-clic = centre)",
      oninput: () => store.dispatch({ type: "updateTrack", trackId: id, patch: { pan: Number(pan.value) } }, { coalesceKey: `pan:${id}` }),
      ondblclick: () => store.dispatch({ type: "updateTrack", trackId: id, patch: { pan: 0 } }),
    });
    const pitch = h("input", {
      type: "number", min: -PITCH_RANGE, max: PITCH_RANGE, step: 1, class: "num pitch pro-only", "aria-label": `Pitch ${t.name}`, title: "Pitch en demi-tons",
      onchange: () => store.dispatch({ type: "updateTrack", trackId: id, patch: { pitch: Number(pitch.value) } }),
    });
    const sound = h("select", {
      class: "sound", "aria-label": `Son ${t.name}`,
      onchange: () => {
        const v = sound.value;
        if (v === "__import") {
          update(store.getState(), true);
          void app.importSample(id);
        } else {
          store.dispatch({ type: "assignSample", trackId: id, sampleId: v || null });
        }
      },
    }, ...soundOptions(p, t));

    const cells = t.steps.map((_, i) => {
      const c = h("button", {
        class: "cell", role: "gridcell", "data-step": i, "aria-label": `${t.name} step ${i + 1}`,
        onclick: (e: Event) => {
          if ((e as MouseEvent).shiftKey) return;
          store.dispatch({ type: "toggleStep", trackId: id, step: i });
        },
      });
      if (i % STEPS_PER_BEAT === 0) c.classList.add("beat-start");
      if (i % (p.timeSignature.beats * STEPS_PER_BEAT * (4 / p.timeSignature.beatUnit)) === 0) c.classList.add("bar-start");
      c.addEventListener("wheel", (e) => {
        const step = store.getState().tracks.find((x) => x.id === id)?.steps[i];
        if (!step?.on) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? VEL_STEP : -VEL_STEP;
        store.dispatch({ type: "setStepVelocity", trackId: id, step: i, velocity: step.velocity + delta }, { coalesceKey: `vel:${id}:${i}` });
      }, { passive: false });
      c.addEventListener("pointerdown", (e) => {
        const step = store.getState().tracks.find((x) => x.id === id)?.steps[i];
        if (!e.shiftKey || !step?.on) return;
        e.preventDefault();
        const startY = e.clientY;
        const startVel = step.velocity;
        c.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) =>
          store.dispatch({ type: "setStepVelocity", trackId: id, step: i, velocity: startVel + (startY - ev.clientY) }, { coalesceKey: `vel:${id}:${i}` });
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
        h("button", { class: "btn btn-icon btn-sm", title: "Effacer la piste", "aria-label": `Effacer ${t.name}`, onclick: () => store.dispatch({ type: "clearTrack", trackId: id }) }, "⌫")),
      h("div", { class: "cells", style: `--steps:${t.steps.length}` }, ...cells),
    );
    return { track: t, el, nameBtn, mute, solo, vol, volLabel, pan, pitch, sound, cells };
  }

  function update(p: Project, forceRebuild = false): void {
    stepsSelect.value = String(p.stepCount);
    el.classList.toggle("mode-pro", app.settings.mode === "pro");
    const key = [p.stepCount, p.timeSignature.beats, p.timeSignature.beatUnit, p.samples.map((s) => s.id).join(), p.tracks.map((t) => `${t.id}:${t.name}`).join()].join("|");
    if (key !== layoutKey || forceRebuild) {
      layoutKey = key;
      grid.textContent = "";
      rows = p.tracks.map((t) => buildRow(p, t));
      grid.append(...rows.map((r) => r.el));
      lastPlayhead = -1;
    }
    const anySolo = p.tracks.some((t) => t.solo);
    p.tracks.forEach((t, idx) => {
      const r = rows[idx];
      r.track = t;
      r.el.classList.toggle("selected", app.selectedTrackId === t.id);
      r.el.classList.toggle("silenced", t.mute || (anySolo && !t.solo));
      r.mute.classList.toggle("on", t.mute);
      r.solo.classList.toggle("on", t.solo);
      r.mute.setAttribute("aria-pressed", String(t.mute));
      r.solo.setAttribute("aria-pressed", String(t.solo));
      if (document.activeElement !== r.vol) r.vol.value = String(t.volume);
      r.volLabel.textContent = `${Math.round(t.volume * 100)}%`;
      if (document.activeElement !== r.pan) r.pan.value = String(t.pan);
      if (document.activeElement !== r.pitch) r.pitch.value = String(t.pitch);
      r.sound.value = t.sampleId ?? "";
      t.steps.forEach((s, i) => {
        const c = r.cells[i];
        c.classList.toggle("on", s.on);
        c.style.setProperty("--vel", String(s.velocity / 127));
        c.setAttribute("aria-pressed", String(s.on));
        c.title = s.on ? `Vélocité ${s.velocity}` : "";
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

  return { el, update: (p) => update(p), frame };
}
