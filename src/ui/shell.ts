import { BPM_MAX, BPM_MIN } from "../core/constants.ts";
import { NOTE_NAMES, SCALES, type ScaleId } from "../core/music.ts";
import { masterChannel, stepsPerBarOf } from "../core/project.ts";
import { CLIP_KNEE } from "../core/softClip.ts";
import { desktop, type App, type View } from "./app.ts";
import { h } from "./dom.ts";
import { meter } from "./widgets.ts";
import { createAiView } from "./views/ai.ts";
import { createArrangementView } from "./views/arrangement.ts";
import { createBeatView } from "./views/beat.ts";
import { createHomeView } from "./views/home.ts";
import { createMelodyView } from "./views/melody.ts";
import { createMixerView } from "./views/mixer.ts";
import { createProjectsView } from "./views/projects.ts";
import { createSettingsView } from "./views/settings.ts";
import { createVocalsView } from "./views/vocals.ts";

export type Route = "home" | "beat" | "melody" | "vocals" | "mixer" | "arrangement" | "ai" | "projects" | "settings";

const NAV: { route: Route; label: string; icon: string; key: string }[] = [
  { route: "home", label: "HOME", icon: "⌂", key: "1" },
  { route: "beat", label: "BEAT", icon: "▦", key: "2" },
  { route: "melody", label: "MELODY", icon: "♪", key: "3" },
  { route: "vocals", label: "VOCALS", icon: "🎙", key: "4" },
  { route: "mixer", label: "MIXER", icon: "☰", key: "5" },
  { route: "arrangement", label: "ARRANGEMENT", icon: "▤", key: "6" },
  { route: "ai", label: "AI", icon: "✦", key: "7" },
  { route: "projects", label: "PROJECTS", icon: "🗀", key: "8" },
  { route: "settings", label: "SETTINGS", icon: "⚙", key: "9" },
];

function createView(app: App, route: Route, navigate: (r: Route) => void): View {
  switch (route) {
    case "home": return createHomeView(app, navigate);
    case "beat": return createBeatView(app);
    case "melody": return createMelodyView(app);
    case "vocals": return createVocalsView(app);
    case "mixer": return createMixerView(app);
    case "arrangement": return createArrangementView(app);
    case "ai": return createAiView(app, navigate);
    case "projects": return createProjectsView(app);
    case "settings": return createSettingsView(app);
  }
}

function fmtPos(pos: number, spb: number): string {
  if (pos < 0) return `Count-in ${Math.ceil(-pos / 4)}`;
  const bar = Math.floor(pos / spb) + 1;
  const beat = Math.floor((pos % spb) / 4) + 1;
  const six = Math.floor(pos % 4) + 1;
  return `${bar}.${beat}.${six}`;
}

export function createShell(app: App, root: HTMLElement): void {
  const { store, engine } = app;
  let route: Route = "home";
  let view: View;

  // --- transport -------------------------------------------------------------------
  const modeBtn = h("button", { class: "btn btn-mode", title: "PATTERN : boucle le pattern en cours · SONG : joue l'arrangement", onclick: () => engine.setMode(engine.mode === "pattern" ? "song" : "pattern") });
  const stopBtn = h("button", { class: "btn btn-icon", title: "Stop (retour au curseur) — Entrée : retour au début", "aria-label": "Stop", onclick: () => app.stop() }, "■");
  const playBtn = h("button", { class: "btn btn-play", title: "Play / Stop (Espace)", "aria-label": "Play", onclick: () => void app.togglePlay() }, "▶");
  const pauseBtn = h("button", { class: "btn btn-icon", title: "Pause", "aria-label": "Pause", onclick: () => app.pause() }, "❚❚");
  const recBtn = h("button", { class: "btn btn-rec", title: "Record sur la piste vocale armée (R)", "aria-label": "Record", onclick: () => void (app.recorder.isRecording ? app.stopRecording() : app.startRecording()) }, "●");
  const posEl = h("span", { class: "position", title: "Position (mesure.temps.double-croche)" });
  const bpmInput = h("input", {
    class: "num bpm-input", type: "number", min: BPM_MIN, max: BPM_MAX, step: 1, title: `Tempo (${BPM_MIN}–${BPM_MAX} BPM)`, "aria-label": "BPM",
    onchange: () => app.dispatch({ type: "setBpm", bpm: Number(bpmInput.value) }, "bpm"),
  });
  const bpmNudge = (d: number) => () => app.dispatch({ type: "setBpm", bpm: Math.round(store.getState().bpm) + d }, "bpm");
  const keyRoot = h("select", { "aria-label": "Tonalité", title: "Tonalité (KEY)", onchange: () => app.dispatch({ type: "setKey", key: { ...store.getState().key, root: Number(keyRoot.value) } }) },
    ...NOTE_NAMES.map((n, i) => h("option", { value: i }, n)));
  const keyScale = h("select", { "aria-label": "Gamme", title: "Gamme (SCALE)", onchange: () => app.dispatch({ type: "setKey", key: { ...store.getState().key, scale: keyScale.value as ScaleId } }) },
    ...(Object.keys(SCALES) as ScaleId[]).map((s) => h("option", { value: s }, SCALES[s].label)));
  const swingInput = h("input", { type: "range", min: 0, max: 100, step: 1, title: "Swing", "aria-label": "Swing", oninput: () => app.dispatch({ type: "setSwing", swing: Number(swingInput.value) }, "swing") });
  const swingLabel = h("span", { class: "val" });
  const metroBtn = h("button", { class: "btn btn-toggle btn-sm", title: "Métronome", "aria-label": "Métronome", onclick: () => app.dispatch({ type: "setMetronome", metronome: { enabled: !store.getState().metronome.enabled } }) }, "♩ CLICK");
  const masterInput = h("input", { type: "range", min: 0, max: 1.5, step: 0.01, title: "Volume master", "aria-label": "Volume master", "data-learn": "master:volume", oninput: () => app.dispatch({ type: "setMasterVolume", volume: Number(masterInput.value) }, "master") });
  const masterMeter = meter();
  const clipLed = h("span", { class: "clip-led", title: "Le mix atteint la zone de saturation du clipper de sécurité : baissez les volumes." }, "CLIP");
  const perfEl = h("span", { class: "latency", title: "Latence de sortie estimée · charge DSP des effets" });
  const undoBtn = h("button", { class: "btn btn-icon", title: "Annuler (Ctrl+Z)", "aria-label": "Undo", onclick: () => store.undo() }, "↶");
  const redoBtn = h("button", { class: "btn btn-icon", title: "Rétablir (Ctrl+Shift+Z)", "aria-label": "Redo", onclick: () => store.redo() }, "↷");
  const saveBtn = h("button", { class: "btn", title: "Sauvegarder (Ctrl+S)", onclick: () => void app.saveProject() }, "Save");
  const nameEl = h("input", { class: "project-name", type: "text", "aria-label": "Nom du projet", maxlength: 120, onchange: () => app.dispatch({ type: "setName", name: nameEl.value }) });
  const dirtyEl = h("span", { class: "dirty" });
  const busyEl = h("span", { class: "busy" });

  const transport = h("header", { class: "transport" },
    h("div", { class: "brand" }, "BEATMAKER", h("b", {}, " STUDIO")),
    h("div", { class: "group" }, nameEl, dirtyEl),
    h("div", { class: "group" }, modeBtn, stopBtn, playBtn, pauseBtn, recBtn, posEl),
    h("div", { class: "group" }, h("label", {}, "BPM"),
      h("button", { class: "btn btn-icon btn-sm", "aria-label": "BPM -1", onclick: bpmNudge(-1) }, "−"), bpmInput,
      h("button", { class: "btn btn-icon btn-sm", "aria-label": "BPM +1", onclick: bpmNudge(1) }, "+")),
    h("div", { class: "group" }, h("label", {}, "KEY"), keyRoot, keyScale),
    h("div", { class: "group" }, h("label", {}, "SWING"), swingInput, swingLabel, metroBtn),
    h("div", { class: "group" }, h("label", {}, "MASTER"), masterInput, masterMeter.el, clipLed),
    h("div", { class: "group" }, undoBtn, redoBtn, saveBtn),
    h("div", { class: "group grow-right" }, busyEl, perfEl),
  );

  const previewBar = h("div", { class: "preview-bar" });

  // --- navigation -----------------------------------------------------------------
  const navButtons = new Map<Route, HTMLButtonElement>();
  const nav = h("nav", { class: "sidebar", "aria-label": "Navigation" });
  for (const item of NAV) {
    const b = h("button", { class: "nav-item", title: `${item.label} (Alt+${item.key})`, onclick: () => navigate(item.route) },
      h("span", { class: "nav-icon", "aria-hidden": "true" }, item.icon), h("span", {}, item.label));
    navButtons.set(item.route, b);
    nav.append(b);
  }
  document.addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey) return;
    const item = NAV.find((n) => n.key === e.key);
    if (item) {
      e.preventDefault();
      navigate(item.route);
    }
  });

  const main = h("main", { class: "main" });
  const status = h("footer", { class: "statusbar" });
  root.append(transport, previewBar, h("div", { class: "body" }, nav, main), status);

  function navigate(r: Route): void {
    route = r;
    for (const [k, b] of navButtons) b.classList.toggle("active", k === r);
    view?.dispose?.();
    main.textContent = "";
    view = createView(app, r, navigate);
    main.append(view.el);
    view.update(store.getState());
  }

  let cpu = "";
  const d = desktop();
  if (d) setInterval(() => void d.metrics().then((m) => (cpu = ` · CPU ${m.cpuPercent.toFixed(0)} % · ${m.memoryMB.toFixed(0)} Mo`)).catch(() => {}), 2000);

  function updateTransport(): void {
    const p = store.getState();
    if (document.activeElement !== bpmInput) bpmInput.value = String(p.bpm);
    keyRoot.value = String(p.key.root);
    keyScale.value = p.key.scale;
    swingInput.value = String(p.swing);
    swingLabel.textContent = `${p.swing}%`;
    metroBtn.classList.toggle("on", p.metronome.enabled);
    masterInput.value = String(masterChannel(p).volume);
    if (document.activeElement !== nameEl) nameEl.value = p.name;
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
    dirtyEl.textContent = store.isDirty() ? "● non sauvegardé" : app.fileName ? `✓ ${app.fileName}` : "nouveau projet (pas encore sauvegardé)";
    dirtyEl.classList.toggle("is-dirty", store.isDirty() || !app.fileName);
    modeBtn.textContent = engine.mode === "pattern" ? "PATTERN" : "SONG";
    modeBtn.classList.toggle("song", engine.mode === "song");
    playBtn.textContent = engine.isPlaying ? "■" : "▶";
    playBtn.classList.toggle("playing", engine.isPlaying);
    playBtn.setAttribute("aria-label", engine.isPlaying ? "Stop" : "Play");
    recBtn.classList.toggle("recording", app.recorder.isRecording);
    busyEl.textContent = app.busy ?? "";
    previewBar.textContent = "";
    if (app.previewActive) {
      previewBar.append(h("span", {}, `PREVIEW : ${app.previewLabel} — vous écoutez la proposition, le projet n'est pas modifié.`),
        h("button", { class: "btn btn-sm", onclick: () => app.cancelPreview() }, "Annuler la preview"));
    }
    previewBar.classList.toggle("on", app.previewActive);
    const auto = app.lastAutosave ? `Auto-save ${app.lastAutosave.toLocaleTimeString()}` : "Auto-save actif";
    const midi = app.midi.enabled ? ` · MIDI ${app.midi.inputs().length} entrée(s)` : "";
    status.textContent = `${p.patterns.length} pattern(s) · ${p.instruments.length} instrument(s) · ${p.vocals.length} piste(s) vocale(s) · ${auto}${midi} · Espace Play/Stop · R Record · Ctrl+S Save · Ctrl+Z/Ctrl+Shift+Z Undo/Redo · Alt+1…9 navigation`;
  }

  const refresh = () => {
    updateTransport();
    view.update(store.getState());
  };
  store.subscribe(refresh);
  app.onChange(refresh);

  let clipHold = 0;
  let tick = 0;
  const frame = () => {
    masterMeter.update(engine.getMasterPeak());
    if (engine.getPreClipPeak() > CLIP_KNEE) clipHold = 60;
    clipLed.classList.toggle("on", clipHold-- > 0);
    const p = store.getState();
    posEl.textContent = fmtPos(engine.isPlaying || engine.isPaused ? engine.currentPosition() : engine.mode === "song" ? engine.cursor : 0, stepsPerBarOf(p));
    if (++tick % 20 === 0) {
      const lat = engine.getLatency();
      perfEl.textContent = lat ? `LATENCY: ${Math.round(lat.totalMs)} ms · ${(lat.sampleRate / 1000).toFixed(1)} kHz · DSP ${(engine.dspLoad * 100).toFixed(0)} %${cpu}` : "LATENCY: — (audio non démarré)";
    }
    view.frame?.();
    requestAnimationFrame(frame);
  };

  navigate(route);
  updateTransport();
  requestAnimationFrame(frame);
}
