import type { App, View } from "../app.ts";
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
  const latency = h("select", { "aria-label": "Latence / buffer" },
    ...LATENCY_OPTIONS.map((o) => h("option", { value: String(o.value) }, o.label)));
  const rate = h("select", { "aria-label": "Fréquence d'échantillonnage" },
    h("option", { value: "auto" }, "Auto (périphérique)"), h("option", { value: "44100" }, "44.1 kHz"), h("option", { value: "48000" }, "48 kHz"));
  const mode = h("select", { "aria-label": "Mode d'interface" },
    h("option", { value: "simple" }, "SIMPLE — l'essentiel"), h("option", { value: "pro" }, "PRO — pan, pitch par piste"));
  const apply = async () => {
    const l = latency.value;
    await app.applySettings({
      latency: /^\d+$/.test(l) ? Number(l) : (l as AppSettings["latency"]),
      sampleRate: rate.value === "auto" ? "auto" : (Number(rate.value) as 44100 | 48000),
      mode: mode.value as AppSettings["mode"],
    });
  };
  latency.addEventListener("change", apply);
  rate.addEventListener("change", apply);
  mode.addEventListener("change", apply);

  const stats = h("dl", { class: "kv" });
  const el = h("section", { class: "view settings-view" },
    h("h1", {}, "SETTINGS"),
    h("div", { class: "card" },
      h("h3", {}, "Audio"),
      h("div", { class: "form-row" }, h("label", {}, "Latence"), latency),
      h("div", { class: "form-row" }, h("label", {}, "Sample rate"), rate),
      h("p", { class: "muted small" },
        "LOW LATENCY ↔ LOW CPU : un petit buffer réagit plus vite (indispensable pour le monitoring vocal) mais demande plus au processeur ; un grand buffer évite les craquements sur une machine chargée. ",
        "La taille de buffer est une demande faite au système : la valeur réellement obtenue est affichée ci-dessous. ",
        "Le choix du périphérique de sortie (interface audio, casque) se fait dans Windows pour l'instant ; la sélection dans l'application arrive avec la Phase 3."),
      stats),
    h("div", { class: "card" },
      h("h3", {}, "Interface"),
      h("div", { class: "form-row" }, h("label", {}, "Mode"), mode)),
    h("div", { class: "card" },
      h("h3", {}, "Raccourcis"),
      h("ul", { class: "shortcuts" },
        ...[["Espace", "Play / Stop"], ["Ctrl+S", "Sauvegarder"], ["Ctrl+Shift+S", "Sauvegarder sous"], ["Ctrl+O", "Ouvrir"], ["Ctrl+Z", "Annuler"], ["Ctrl+Shift+Z / Ctrl+Y", "Rétablir"], ["M / S", "Mute / Solo de la piste sélectionnée"], ["R", "Record (Phase 3)"]]
          .map(([k, v]) => h("li", {}, h("kbd", {}, k), " ", v)))),
  );

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
          ["Voix actives", String(engine.activeVoices)],
          ["Steps en retard (underruns du scheduler)", String(engine.lateSteps)],
          ["Mémoire JS", mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(0)} Mo` : "non disponible"],
          ["CPU audio", "non mesurable via Web Audio — prévu avec le moteur natif (Phase 7)"],
        ]
      : [["État", "Audio non démarré : appuyez sur Play ou cliquez sur un instrument."]];
    stats.textContent = "";
    for (const [k, v] of rows) stats.append(h("dt", {}, k), h("dd", {}, v));
  }

  return {
    el,
    update() {
      const s = app.settings;
      latency.value = String(s.latency);
      rate.value = String(s.sampleRate);
      mode.value = s.mode;
      renderStats();
    },
    frame() {
      if (++tick % 30 === 0) renderStats();
    },
  };
}
