import { TEMPLATES } from "../../core/templates.ts";
import { keyLabel } from "../../core/music.ts";
import { songLengthBars } from "../../core/project.ts";
import type { App, View } from "../app.ts";
import { h } from "../dom.ts";
import type { Route } from "../shell.ts";

export function createHomeView(app: App, navigate: (r: Route) => void): View {
  const current = h("p", { class: "muted" });
  const templates = h("div", { class: "template-grid" },
    ...TEMPLATES.map((t) => h("button", { class: "card template", "data-template": t.id, onclick: async () => {
      await app.newProject(t.id);
      navigate("beat");
    } }, h("h3", {}, t.name), h("p", {}, t.description))));
  const steps: [string, Route, string][] = [
    ["1. Beat", "beat", "Drums et 808 au step sequencer"],
    ["2. Mélodie", "melody", "Piano roll, instruments, gamme"],
    ["3. Arrangement", "arrangement", "Intro, couplets, refrains…"],
    ["4. Voix", "vocals", "Micro, prises, AUTO VOICE, pitch"],
    ["5. Mix", "mixer", "Volumes, effets, bus"],
    ["6. IA & Master", "ai", "Assistant, AI MIX, AI MASTER"],
    ["7. Export", "projects", "WAV / MP3, stems"],
  ];
  const el = h("section", { class: "view home-view" },
    h("h1", {}, "HOME"),
    h("div", { class: "home-actions" },
      h("button", { class: "card action", onclick: () => navigate("beat") }, h("h3", {}, "▶ Continuer le projet en cours"), current),
      h("button", { class: "card action", onclick: async () => { if (await app.openProject()) navigate("beat"); } }, h("h3", {}, "🗀 Ouvrir un projet"), h("p", { class: "muted" }, "Fichier .bsproj (Ctrl+O)")),
      h("button", { class: "card action", onclick: () => navigate("ai") }, h("h3", {}, "✦ Assistant IA"), h("p", { class: "muted" }, "Générer un beat, une mélodie, des drums, conseils, mix & master"))),
    h("h2", {}, "Nouveau projet depuis un template"),
    templates,
    h("h2", {}, "Du beat au morceau fini"),
    h("div", { class: "workflow" }, ...steps.map(([t, r, d]) => h("button", { class: "card step", onclick: () => navigate(r) }, h("strong", {}, t), h("span", { class: "muted" }, d)))),
    h("p", { class: "muted small" }, "Le dernier projet est rouvert automatiquement au démarrage (sauvegarde automatique)."),
  );
  return {
    el,
    update(p) {
      current.textContent = `« ${p.name} » — ${p.bpm} BPM · ${keyLabel(p.key)} · ${p.patterns.length} pattern(s) · ${songLengthBars(p)} mesure(s)${app.store.isDirty() ? " · non sauvegardé" : ""}`;
    },
  };
}
