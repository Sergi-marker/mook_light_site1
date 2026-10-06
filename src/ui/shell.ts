import { BPM_MAX, BPM_MIN } from "../core/constants.ts";
import type { App, View } from "./app.ts";
import { createBeatView } from "./views/beat.ts";
import { createHomeView } from "./views/home.ts";
import { createPlaceholderView } from "./views/placeholder.ts";
import { createProjectsView } from "./views/projects.ts";
import { createSettingsView } from "./views/settings.ts";
import { h } from "./dom.ts";
import { CLIP_KNEE } from "../core/softClip.ts";

export type Route =
  | "home" | "beat" | "melody" | "vocals" | "mixer" | "arrangement" | "ai" | "projects" | "settings";

const NAV: { route: Route; label: string; icon: string; ready: boolean }[] = [
  { route: "home", label: "HOME", icon: "⌂", ready: true },
  { route: "beat", label: "BEAT", icon: "▦", ready: true },
  { route: "melody", label: "MELODY", icon: "♪", ready: false },
  { route: "vocals", label: "VOCALS", icon: "🎙", ready: false },
  { route: "mixer", label: "MIXER", icon: "☰", ready: false },
  { route: "arrangement", label: "ARRANGEMENT", icon: "▤", ready: false },
  { route: "ai", label: "AI", icon: "✦", ready: false },
  { route: "projects", label: "PROJECTS", icon: "🗀", ready: true },
  { route: "settings", label: "SETTINGS", icon: "⚙", ready: true },
];

function createView(app: App, route: Route, navigate: (r: Route) => void): View {
  switch (route) {
    case "home":
      return createHomeView(app, navigate);
    case "beat":
      return createBeatView(app);
    case "projects":
      return createProjectsView(app);
    case "settings":
      return createSettingsView(app);
    case "melody":
      return createPlaceholderView("MELODY", 2, [
        "Piano roll : création, déplacement, redimensionnement de notes, vélocité, snap, zoom",
        "Gammes et tonalités avec SCALE LOCK",
        "808 mélodique avec glide / slide",
        "Entrée clavier MIDI",
      ]);
    case "vocals":
      return createPlaceholderView("VOCALS", 3, [
        "Micro USB / XLR via interface audio, monitoring casque",
        "Record / Punch in-out / count-in / métronome",
        "Prises multiples et pistes Lead, Double, Adlibs, Backing",
        "Phase 4 : chaîne vocale temps réel (gate, EQ, de-esser, compresseur, pitch)",
      ]);
    case "mixer":
      return createPlaceholderView("MIXER", 3, [
        "Déjà disponible dans BEAT : volume, pan, mute, solo par piste et volume master",
        "À venir : vue console, meters par piste, sends, bus, effets (EQ, compresseur, reverb, delay…)",
      ]);
    case "arrangement":
      return createPlaceholderView("ARRANGEMENT", 5, [
        "Timeline avec sections Intro / Verse / Chorus / Bridge / Outro et sections personnalisées",
        "Clips déplaçables à la souris, automation",
      ]);
    case "ai":
      return createPlaceholderView("AI", 6, [
        "AI Beat / Melody / Drum Generator produisant du MIDI éditable",
        "AUTO VOICE, AI Mix Assistant, AI Master, assistant de composition",
      ]);
  }
}

export function createShell(app: App, root: HTMLElement): void {
  const { store, engine } = app;
  let route: Route = "home";
  let view: View;

  // --- Transport bar ---
  const playBtn = h("button", { class: "btn btn-play", title: "Play / Stop (Espace)", "aria-label": "Play", onclick: () => void app.togglePlay() }, "▶");
  const bpmInput = h("input", {
    class: "num bpm-input", type: "number", min: BPM_MIN, max: BPM_MAX, step: 1, title: `Tempo (${BPM_MIN}–${BPM_MAX} BPM)`, "aria-label": "BPM",
    onchange: () => store.dispatch({ type: "setBpm", bpm: Number(bpmInput.value) }, { coalesceKey: "bpm" }),
  });
  const bpmNudge = (d: number) => () => store.dispatch({ type: "setBpm", bpm: Math.round(store.getState().bpm) + d }, { coalesceKey: "bpm" });
  const swingInput = h("input", {
    type: "range", min: 0, max: 100, step: 1, title: "Swing", "aria-label": "Swing",
    oninput: () => store.dispatch({ type: "setSwing", swing: Number(swingInput.value) }, { coalesceKey: "swing" }),
  });
  const swingLabel = h("span", { class: "val" });
  const sigBeats = h("select", {
    title: "Signature rythmique (affichage des mesures)", "aria-label": "Temps par mesure",
    onchange: () => store.dispatch({ type: "setTimeSignature", timeSignature: { ...store.getState().timeSignature, beats: Number(sigBeats.value) } }),
  }, ...[2, 3, 4, 5, 6, 7].map((n) => h("option", { value: n }, String(n))));
  const sigUnit = h("select", {
    "aria-label": "Unité",
    onchange: () => store.dispatch({ type: "setTimeSignature", timeSignature: { ...store.getState().timeSignature, beatUnit: Number(sigUnit.value) as 4 | 8 } }),
  }, h("option", { value: 4 }, "4"), h("option", { value: 8 }, "8"));
  const masterInput = h("input", {
    type: "range", min: 0, max: 1.5, step: 0.01, title: "Volume master", "aria-label": "Volume master",
    oninput: () => store.dispatch({ type: "setMasterVolume", volume: Number(masterInput.value) }, { coalesceKey: "master" }),
  });
  const meterFill = h("div", { class: "meter-fill" });
  const clipLed = h("span", { class: "clip-led", title: "Le mix dépasse -2 dBFS : le clipper de sécurité colore le son. Baissez les volumes." }, "CLIP");
  const latencyEl = h("span", { class: "latency", title: "Latence de sortie estimée (buffer + périphérique)" }, "LATENCY: —");
  const undoBtn = h("button", { class: "btn btn-icon", title: "Annuler (Ctrl+Z)", "aria-label": "Undo", onclick: () => store.undo() }, "↶");
  const redoBtn = h("button", { class: "btn btn-icon", title: "Rétablir (Ctrl+Shift+Z)", "aria-label": "Redo", onclick: () => store.redo() }, "↷");
  const saveBtn = h("button", { class: "btn", title: "Sauvegarder (Ctrl+S)", onclick: () => void app.saveProject() }, "Save");
  const nameEl = h("input", {
    class: "project-name", type: "text", "aria-label": "Nom du projet", maxlength: 120,
    onchange: () => store.dispatch({ type: "setName", name: nameEl.value }),
  });
  const dirtyEl = h("span", { class: "dirty" });

  const transport = h(
    "header",
    { class: "transport" },
    h("div", { class: "brand" }, "BEATMAKER", h("b", {}, " STUDIO")),
    h("div", { class: "group" }, nameEl, dirtyEl),
    h("div", { class: "group" }, playBtn),
    h("div", { class: "group" },
      h("label", {}, "BPM"),
      h("button", { class: "btn btn-icon btn-sm", "aria-label": "BPM -1", onclick: bpmNudge(-1) }, "−"),
      bpmInput,
      h("button", { class: "btn btn-icon btn-sm", "aria-label": "BPM +1", onclick: bpmNudge(1) }, "+")),
    h("div", { class: "group" }, h("label", {}, "SWING"), swingInput, swingLabel),
    h("div", { class: "group" }, h("label", {}, "SIG"), sigBeats, h("span", {}, "/"), sigUnit),
    h("div", { class: "group" }, h("label", {}, "MASTER"), masterInput, h("div", { class: "meter", "aria-hidden": "true" }, meterFill), clipLed),
    h("div", { class: "group" }, undoBtn, redoBtn, saveBtn),
    h("div", { class: "group grow-right" }, latencyEl),
  );

  // --- Navigation ---
  const navButtons = new Map<Route, HTMLButtonElement>();
  const nav = h("nav", { class: "sidebar", "aria-label": "Navigation" });
  for (const item of NAV) {
    const b = h("button", { class: "nav-item", title: item.ready ? item.label : `${item.label} — en développement`, onclick: () => navigate(item.route) },
      h("span", { class: "nav-icon", "aria-hidden": "true" }, item.icon),
      h("span", {}, item.label),
      !item.ready && h("span", { class: "badge" }, "dev"));
    navButtons.set(item.route, b);
    nav.append(b);
  }

  const main = h("main", { class: "main" });
  const status = h("footer", { class: "statusbar" });
  root.append(transport, h("div", { class: "body" }, nav, main), status);

  function navigate(r: Route): void {
    route = r;
    for (const [k, b] of navButtons) b.classList.toggle("active", k === r);
    main.textContent = "";
    view = createView(app, r, navigate);
    main.append(view.el);
    view.update(store.getState());
  }

  function updateTransport(): void {
    const p = store.getState();
    if (document.activeElement !== bpmInput) bpmInput.value = String(p.bpm);
    swingInput.value = String(p.swing);
    swingLabel.textContent = `${p.swing}%`;
    sigBeats.value = String(p.timeSignature.beats);
    sigUnit.value = String(p.timeSignature.beatUnit);
    masterInput.value = String(p.masterVolume);
    if (document.activeElement !== nameEl) nameEl.value = p.name;
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
    dirtyEl.textContent = store.isDirty()
      ? "● non sauvegardé"
      : app.fileName ? `✓ ${app.fileName}` : "nouveau projet (pas encore sauvegardé)";
    dirtyEl.classList.toggle("is-dirty", store.isDirty() || !app.fileName);
    playBtn.textContent = engine.isPlaying ? "■" : "▶";
    playBtn.classList.toggle("playing", engine.isPlaying);
    playBtn.setAttribute("aria-label", engine.isPlaying ? "Stop" : "Play");
    const lat = engine.getLatency();
    latencyEl.textContent = lat ? `LATENCY: ${Math.round(lat.totalMs)} ms · ${(lat.sampleRate / 1000).toFixed(1)} kHz` : "LATENCY: — (audio non démarré)";
    const auto = app.lastAutosave ? `Auto-save ${app.lastAutosave.toLocaleTimeString()}` : "Auto-save actif";
    status.textContent = `${p.tracks.length} pistes · ${p.stepCount} steps · ${auto} · Espace = Play/Stop · Ctrl+S = Save · Ctrl+Z / Ctrl+Shift+Z = Undo/Redo · M / S = Mute/Solo (piste sélectionnée)`;
  }

  store.subscribe(() => {
    updateTransport();
    view.update(store.getState());
  });
  app.onChange(() => {
    updateTransport();
    view.update(store.getState());
  });

  let peakHold = 0;
  let clipHold = 0;
  const frame = () => {
    peakHold = Math.max(engine.getMasterPeak(), peakHold * 0.92);
    meterFill.style.width = `${Math.min(100, peakHold * 100)}%`;
    if (engine.getPreClipPeak() > CLIP_KNEE) clipHold = 60;
    clipLed.classList.toggle("on", clipHold-- > 0);
    view.frame?.();
    requestAnimationFrame(frame);
  };

  navigate(route);
  updateTransport();
  requestAnimationFrame(frame);
}
