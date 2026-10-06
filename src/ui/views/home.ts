import { TEMPLATES } from "../../core/templates.ts";
import type { App, View } from "../app.ts";
import { h } from "../dom.ts";
import type { Route } from "../shell.ts";

export function createHomeView(app: App, navigate: (r: Route) => void): View {
  const current = h("p", { class: "muted" });
  const templates = h("div", { class: "template-grid" },
    ...TEMPLATES.map((t) =>
      h("button", {
        class: "card template", "data-template": t.id,
        onclick: async () => {
          await app.newProject(t.id);
          navigate("beat");
        },
      }, h("h3", {}, t.name), h("p", {}, t.description))));

  const el = h("section", { class: "view home-view" },
    h("h1", {}, "HOME"),
    h("div", { class: "home-actions" },
      h("button", { class: "card action", onclick: () => navigate("beat") },
        h("h3", {}, "▶ Continuer le projet en cours"), current),
      h("button", { class: "card action", onclick: async () => { if (await app.openProject()) navigate("beat"); } },
        h("h3", {}, "🗀 Ouvrir un projet"), h("p", { class: "muted" }, "Fichier .bsproj (Ctrl+O)")),
      h("div", { class: "card action disabled", title: "En développement — Phase 6", "aria-disabled": "true" },
        h("h3", {}, "✦ Assistant IA"), h("p", { class: "muted" }, "En développement (Phase 6)"))),
    h("h2", {}, "Nouveau projet depuis un template"),
    templates,
    h("p", { class: "muted small" }, "Le dernier projet est rouvert automatiquement au démarrage (sauvegarde automatique)."),
  );

  return {
    el,
    update(p) {
      current.textContent = `« ${p.name} » — ${p.bpm} BPM · ${p.stepCount} steps${app.store.isDirty() ? " · non sauvegardé" : ""}`;
    },
  };
}
