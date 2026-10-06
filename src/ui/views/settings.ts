import { Recorder, type InputInfo } from "../../audio/recorder.ts";
import type { App, View } from "../app.ts";
import { desktop } from "../app.ts";
import { h } from "../dom.ts";
import type { AppSettings } from "../persistence.ts";

const LATENCY_OPTIONS: { value: AppSettings["latency"]; label: string }[] = [
  { value: "interactive", label: "Latence minimale (recommandé)" },
  { value: "balanced", label: "Équilibré" },
  { value: "playback", label: "Économie CPU (latence élevée)" },
  { value: 64, label: "Buffer 64 samples" },
  { value: 128, label: "Buffer 128 samples" },
  { value: 256, label: "Buffer 256 samples" },
  { value: 512, label: "Buffer 512 samples" },
  { value: 1024, label: "Buffer 1024 samples" },
];

export function createSettingsView(app: App): View {
  const { engine } = app;
  let inputs: InputInfo[] = [];
  let outputs: InputInfo[] = [];
  const latency = h("select", { "aria-label": "Latence / buffer" }, ...LATENCY_OPTIONS.map((o) => h("option", { value: String(o.value) }, o.label)));
  const rate = h("select", { "aria-label": "Fréquence d'échantillonnage" }, h("option", { value: "auto" }, "Auto (périphérique)"), h("option", { value: "44100" }, "44.1 kHz"), h("option", { value: "48000" }, "48 kHz"));
  const mode = h("select", { "aria-label": "Mode d'interface" }, h("option", { value: "simple" }, "SIMPLE — l'essentiel"), h("option", { value: "pro" }, "PRO — pan, pitch par piste"));
  const inSel = h("select", { "aria-label": "Entrée audio" });
  const outSel = h("select", { "aria-label": "Sortie audio" });
  const midiOut = h("select", { "aria-label": "Sortie MIDI" });
  const apiKey = h("input", { type: "password", "aria-label": "Clé API Anthropic", placeholder: "sk-ant-… (optionnel)", autocomplete: "off" });
  const model = h("select", { "aria-label": "Modèle" }, ...[["claude-opus-5-5", "Claude Opus 5.5"], ["claude-sonnet-5-5", "Claude Sonnet 5.5"], ["claude-haiku-4-5", "Claude Haiku 4.5"]].map(([v, l]) => h("option", { value: v }, l)));
  const apply = async () => {
    const l = latency.value;
    await app.applySettings({
      ...app.settings,
      latency: /^\d+$/.test(l) ? Number(l) : (l as AppSettings["latency"]),
      sampleRate: rate.value === "auto" ? "auto" : (Number(rate.value) as 44100 | 48000),
      mode: mode.value as AppSettings["mode"],
      inputDevice: inSel.value,
      outputDevice: outSel.value,
      midiOutput: midiOut.value,
      aiApiKey: apiKey.value.trim(),
      aiModel: model.value,
    });
  };
  [latency, rate, mode, inSel, outSel, midiOut, model].forEach((x) => x.addEventListener("change", () => void apply()));
  apiKey.addEventListener("change", () => void apply());
  const midiBox = h("div", {});
  const stats = h("dl", { class: "kv" });
  const refreshDevices = async () => {
    inputs = await Recorder.listInputs();
    outputs = await Recorder.listOutputs();
    renderDevices();
  };
  const renderDevices = () => {
    inSel.textContent = "";
    inSel.append(h("option", { value: "" }, "Entrée par défaut (Windows)"), ...inputs.map((d) => h("option", { value: d.deviceId, selected: d.deviceId === app.settings.inputDevice }, d.label)));
    outSel.textContent = "";
    outSel.append(h("option", { value: "" }, "Sortie par défaut (Windows)"), ...outputs.map((d) => h("option", { value: d.deviceId, selected: d.deviceId === app.settings.outputDevice }, d.label)));
  };
  const renderMidi = () => {
    const p = app.store.getState();
    midiBox.textContent = "";
    midiOut.textContent = "";
    midiOut.append(h("option", { value: "" }, "Aucune"), ...app.midi.outputs().map((o) => h("option", { value: o.id, selected: o.id === app.settings.midiOutput }, o.name)));
    if (!app.midi.enabled) {
      midiBox.append(h("button", { class: "btn", onclick: async () => { await app.enableMidi(); await app.applySettings({ ...app.settings, midiEnabled: true }); renderMidi(); } }, "Activer le MIDI"));
      if (app.midi.error) midiBox.append(h("p", { class: "hint" }, app.midi.error));
      return;
    }
    const ins = app.midi.inputs();
    const targets: [string, string][] = [["master:volume", "Volume master"], ["bpm", "Tempo (BPM)"], ...p.channels.filter((c) => c.kind !== "master").map((c): [string, string] => [`channel:${c.id}:volume`, `${c.name} — volume`])];
    midiBox.append(
      h("p", {}, ins.length ? `Entrées : ${ins.map((i) => i.name).join(", ")}. Le clavier joue l'instrument sélectionné dans MELODY ; les pads (canal 10) jouent les drums.` : "Aucun clavier/pad MIDI détecté. Branchez-le : il apparaîtra automatiquement."),
      h("label", { class: "field" }, h("span", { class: "slider-label" }, "Sortie MIDI"), midiOut),
      h("h4", {}, "MIDI LEARN / mapping"),
      h("div", { class: "row-inline" }, ...targets.slice(0, 14).map(([t, label]) => h("button", { class: "btn btn-sm", onclick: () => app.learnMidi(t, label) }, `🎛 ${label}`))),
      p.midiMappings.length ? h("ul", {}, ...p.midiMappings.map((m) => h("li", {}, `${m.source} → ${targets.find(([t]) => t === m.target)?.[1] ?? m.target} `,
        h("button", { class: "btn btn-icon btn-sm", onclick: () => app.dispatch({ type: "setMidiMappings", mappings: p.midiMappings.filter((x) => x !== m) }) }, "✕")))) : h("p", { class: "hint" }, "Aucun mapping."));
  };
  const el = h("section", { class: "view settings-view" },
    h("h1", {}, "SETTINGS"),
    h("div", { class: "card" }, h("h3", {}, "Audio"),
      h("div", { class: "form-row" }, h("label", {}, "Latence"), latency),
      h("div", { class: "form-row" }, h("label", {}, "Sample rate"), rate),
      h("div", { class: "form-row" }, h("label", {}, "Entrée (micro)"), inSel),
      h("div", { class: "form-row" }, h("label", {}, "Sortie (casque)"), outSel, h("button", { class: "btn btn-sm", onclick: () => void refreshDevices() }, "↻ Actualiser")),
      h("p", { class: "muted small" },
        "LOW LATENCY ↔ LOW CPU : un petit buffer réagit plus vite (indispensable pour le monitoring vocal) mais charge davantage le processeur ; un grand buffer évite les craquements sur une machine chargée. ",
        "La taille de buffer est une demande faite au système : la valeur réellement obtenue est affichée ci-dessous. Pour descendre sous ~10 ms en monitoring, utilisez une interface audio avec un pilote récent."),
      stats),
    h("div", { class: "card" }, h("h3", {}, "MIDI"), midiBox),
    h("div", { class: "card" }, h("h3", {}, "IA en ligne (optionnelle)"),
      h("p", { class: "muted small" }, "Toutes les fonctions IA marchent hors ligne. Une clé API Anthropic active en plus l'assistant en ligne (questions libres) dans l'application desktop. La clé reste sur cet ordinateur ; seul un résumé texte du projet est envoyé, après votre accord — jamais d'audio."),
      h("div", { class: "form-row" }, h("label", {}, "Clé API"), apiKey),
      h("div", { class: "form-row" }, h("label", {}, "Modèle"), model)),
    h("div", { class: "card" }, h("h3", {}, "Interface"), h("div", { class: "form-row" }, h("label", {}, "Mode"), mode)),
    h("div", { class: "card" }, h("h3", {}, "Raccourcis"),
      h("ul", { class: "shortcuts" }, ...[["Espace", "Play / Stop"], ["R", "Record / Stop record"], ["Entrée", "Retour au début"], ["Ctrl+S", "Sauvegarder"], ["Ctrl+Shift+S", "Sauvegarder sous"], ["Ctrl+O", "Ouvrir"], ["Ctrl+Z", "Annuler"], ["Ctrl+Shift+Z / Ctrl+Y", "Rétablir"], ["M / S", "Mute / Solo de la piste sélectionnée"], ["Alt+1…9", "Changer de page"], ["Piano roll", "Suppr, Ctrl+C/V/D/A, ↑↓←→, L = slide"]].map(([k, v]) => h("li", {}, h("kbd", {}, k), " ", v)))));
  let tick = 0;
  function renderStats(): void {
    const lat = engine.getLatency();
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const rows: [string, string][] = lat
      ? [
          ["Sample rate effectif", `${lat.sampleRate} Hz`],
          ["Buffer effectif", `${lat.bufferSamples} samples (${lat.baseMs.toFixed(1)} ms)`],
          ["Latence sortie (pilote)", lat.outputMs === null ? "non communiquée" : `${lat.outputMs.toFixed(1)} ms`],
          ["LATENCY totale estimée", `${Math.round(lat.totalMs)} ms`],
          ["Monitoring micro (aller-retour)", app.recorder.isOpen ? `${Math.round(app.recorder.monitoringLatencyMs())} ms` : "micro non activé"],
          ["Charge DSP (effets temps réel)", `${(engine.dspLoad * 100).toFixed(1)} %`],
          ["Voix actives", String(engine.activeVoices)],
          ["Steps en retard (underruns du scheduler)", String(engine.lateSteps)],
          ["Mémoire JS", mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(0)} Mo` : "—"],
          ["CPU (processus)", desktop() ? "affiché dans la barre du haut" : "disponible dans l'application desktop"],
        ]
      : [["État", "Audio non démarré : appuyez sur Play."]];
    stats.textContent = "";
    for (const [k, v] of rows) stats.append(h("dt", {}, k), h("dd", {}, v));
  }
  void refreshDevices();
  return {
    el,
    update() {
      const s = app.settings;
      latency.value = String(s.latency);
      rate.value = String(s.sampleRate);
      mode.value = s.mode;
      model.value = s.aiModel;
      if (document.activeElement !== apiKey) apiKey.value = s.aiApiKey;
      renderStats();
      renderMidi();
    },
    frame() {
      if (++tick % 30 === 0) renderStats();
    },
  };
}
