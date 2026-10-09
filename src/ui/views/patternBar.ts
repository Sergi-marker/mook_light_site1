// Pattern selector shared by BEAT and MELODY: switch, create, copy, rename, delete,
// and drop the pattern on the arrangement timeline.

import { currentPattern, songLengthBars } from "../../core/project.ts";
import type { Project } from "../../core/types.ts";
import type { App } from "../app.ts";
import { confirmDialog, h, toast } from "../dom.ts";

export function patternBar(app: App): { el: HTMLElement; update: (p: Project) => void } {
  const list = h("div", { class: "pattern-list", role: "tablist", "aria-label": "Patterns" });
  const el = h("div", { class: "pattern-bar" },
    h("span", { class: "slider-label" }, "PATTERNS"),
    list,
    h("button", { class: "btn btn-sm", title: "Nouveau pattern vide", onclick: () => app.dispatch({ type: "addPattern" }) }, "+ Nouveau"),
    h("button", { class: "btn btn-sm", title: "Copier le pattern courant (variation)", onclick: () => app.dispatch({ type: "addPattern", copyFrom: app.store.getState().currentPatternId }) }, "Copier"),
    h("button", { class: "btn btn-sm", title: "Renommer", onclick: () => {
      const p = app.store.getState();
      const name = window.prompt("Nom du pattern :", currentPattern(p).name);
      if (name) app.dispatch({ type: "renamePattern", patternId: p.currentPatternId, name });
    } }, "Renommer"),
    h("button", { class: "btn btn-sm", title: "Supprimer le pattern (et ses clips sur la timeline)", onclick: async () => {
      const p = app.store.getState();
      if (p.patterns.length <= 1) return void toast("Il faut garder au moins un pattern.", "error");
      if (await confirmDialog("Supprimer le pattern ?", `« ${currentPattern(p).name} » et ses clips dans l'arrangement seront supprimés (annulable).`, "Supprimer", "Annuler", true))
        app.dispatch({ type: "deletePattern", patternId: p.currentPatternId });
    } }, "Supprimer"),
    h("button", { class: "btn btn-sm", title: "Ajouter ce pattern à la fin de l'arrangement", onclick: () => {
      const p = app.store.getState();
      const pat = currentPattern(p);
      const start = p.arrangement.clips.length ? songLengthBars(p) : 0;
      app.dispatch({ type: "addClip", clip: { patternId: pat.id, lane: 0, start, length: Math.max(1, pat.stepCount / 16) * (pat.stepCount === 16 ? 4 : 1) } });
      toast(`« ${pat.name} » ajouté à l'arrangement (mesure ${start + 1}).`, "ok");
    } }, "→ Arrangement"),
  );
  let sig = "";
  return {
    el,
    update(p) {
      const s = p.patterns.map((x) => `${x.id}:${x.name}:${x.color}`).join("|") + p.currentPatternId;
      if (s === sig) return;
      sig = s;
      list.textContent = "";
      for (const pat of p.patterns) {
        list.append(h("button", {
          class: `pattern-chip ${pat.id === p.currentPatternId ? "active" : ""}`, role: "tab", "aria-selected": String(pat.id === p.currentPatternId),
          style: `--c:${pat.color}`, onclick: () => app.dispatch({ type: "selectPattern", patternId: pat.id }),
        }, pat.name));
      }
    },
  };
}
