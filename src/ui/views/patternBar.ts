// Pattern selector shared by BEAT and MELODY: switch, create, copy, rename, delete,
// and drop the pattern on the arrangement timeline.

import { currentPattern, songLengthBars } from "../../core/project.ts";
import type { Project } from "../../core/types.ts";
import type { App } from "../app.ts";
import { confirmDialog, h, promptDialog, toast } from "../dom.ts";

export function patternBar(app: App): { el: HTMLElement; update: (p: Project) => void } {
  const rename = async (patternId: string) => {
    const pat = app.store.getState().patterns.find((x) => x.id === patternId);
    if (!pat) return;
    const name = await promptDialog("Nom du pattern", pat.name);
    if (name) app.dispatch({ type: "renamePattern", patternId, name });
  };
  const list = h("div", { class: "pattern-list", role: "tablist", "aria-label": "Patterns" });
  /** How many arrangement clips play the current pattern (they all change when it is edited). */
  const uses = h("span", { class: "hint pattern-uses" });
  const el = h("div", { class: "pattern-bar" },
    h("span", { class: "slider-label" }, "PATTERNS"),
    list,
    uses,
    h("button", { class: "btn btn-sm", title: "Nouveau pattern vide", onclick: () => app.dispatch({ type: "addPattern" }) }, "+ Nouveau"),
    h("button", { class: "btn btn-sm", title: "Copier le pattern courant (variation)", onclick: () => app.dispatch({ type: "addPattern", copyFrom: app.store.getState().currentPatternId }) }, "Copier"),
    h("button", { class: "btn btn-sm", title: "Renommer le pattern (ou double-clic sur son nom)", onclick: () => void rename(app.store.getState().currentPatternId) }, "Renommer"),
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
      const n = p.arrangement.clips.filter((c) => c.patternId === p.currentPatternId).length;
      uses.textContent = n > 1 ? `🔗 joué ${n}× dans l'arrangement : tes modifications s'entendent aux ${n} endroits` : n === 1 ? "joué 1× dans l'arrangement" : "pas encore dans l'arrangement";
      // The chips are kept when only the current pattern changes (a double-click to rename
      // must land on the same element as its first click).
      const s = p.patterns.map((x) => `${x.id}:${x.name}:${x.color}`).join("|");
      if (s === sig) {
        for (const chip of list.children) {
          const on = (chip as HTMLElement).dataset.id === p.currentPatternId;
          chip.classList.toggle("active", on);
          chip.setAttribute("aria-selected", String(on));
        }
        return;
      }
      sig = s;
      list.textContent = "";
      for (const pat of p.patterns) {
        list.append(h("button", {
          class: `pattern-chip ${pat.id === p.currentPatternId ? "active" : ""}`, role: "tab", "data-id": pat.id, "aria-selected": String(pat.id === p.currentPatternId),
          style: `--c:${pat.color}`, title: "Clic = choisir · double-clic = renommer", onclick: () => app.dispatch({ type: "selectPattern", patternId: pat.id }),
          ondblclick: () => void rename(pat.id),
        }, pat.name));
      }
    },
  };
}
