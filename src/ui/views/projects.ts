import { PROJECT_EXTENSION } from "../../core/constants.ts";
import type { App, View } from "../app.ts";
import { h } from "../dom.ts";
import { hasFileHandle } from "../persistence.ts";

export function createProjectsView(app: App): View {
  const info = h("dl", { class: "kv" });
  const el = h("section", { class: "view projects-view" },
    h("h1", {}, "PROJECTS"),
    h("div", { class: "button-row" },
      h("button", { class: "btn btn-primary", onclick: () => void app.saveProject() }, "Sauvegarder (Ctrl+S)"),
      h("button", { class: "btn", onclick: () => void app.saveProject(true) }, "Sauvegarder sous… (Ctrl+Shift+S)"),
      h("button", { class: "btn", onclick: () => void app.openProject() }, "Ouvrir… (Ctrl+O)"),
      h("button", { class: "btn", onclick: () => void app.newProject("empty") }, "Nouveau projet vide")),
    h("div", { class: "card" }, h("h3", {}, "Projet courant"), info),
    h("div", { class: "card" },
      h("h3", {}, "Format & sécurité"),
      h("ul", {},
        h("li", {}, `Format ${PROJECT_EXTENSION} : un fichier JSON autonome (BPM, signature, pistes, pattern, réglages, samples importés inclus).`),
        h("li", {}, "Sauvegarde automatique 1,5 s après chaque modification (stockage local de l'application)."),
        h("li", {}, "Crash recovery : si l'application ne s'est pas fermée correctement, elle propose « Recover previous session? » au démarrage."),
        h("li", {}, "Aucun projet n'est supprimé sans confirmation."))),
  );
  return {
    el,
    update(p) {
      const rows: [string, string][] = [
        ["Nom", p.name],
        ["Tempo", `${p.bpm} BPM · swing ${p.swing}% · ${p.timeSignature.beats}/${p.timeSignature.beatUnit}`],
        ["Pattern", `${p.stepCount} steps · ${p.tracks.length} pistes · ${p.tracks.reduce((n, t) => n + t.steps.filter((s) => s.on).length, 0)} notes`],
        ["Samples importés", p.samples.length ? p.samples.map((s) => s.name).join(", ") : "aucun"],
        ["État", app.store.isDirty() ? "Modifications non sauvegardées dans un fichier" : app.fileName ? "Sauvegardé" : "Jamais sauvegardé dans un fichier"],
        ["Fichier", app.fileName ? `${app.fileName}${hasFileHandle() ? " (Ctrl+S réécrit ce fichier)" : ""}` : "aucun"],
        ["Dernière sauvegarde auto", app.lastAutosave ? app.lastAutosave.toLocaleTimeString() : "—"],
      ];
      info.textContent = "";
      for (const [k, v] of rows) info.append(h("dt", {}, k), h("dd", {}, v));
    },
  };
}
