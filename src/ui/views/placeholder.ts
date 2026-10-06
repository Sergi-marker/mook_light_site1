import type { View } from "../app.ts";
import { h } from "../dom.ts";

/** Honest placeholder for modules that are not built yet — no fake controls. */
export function createPlaceholderView(title: string, phase: number, planned: string[]): View {
  const el = h("section", { class: "view placeholder-view" },
    h("h1", {}, title),
    h("div", { class: "card dev-card" },
      h("p", { class: "dev-badge" }, `En développement — Phase ${phase}`),
      h("p", {}, "Ce module n'est pas encore implémenté. Rien sur cette page n'est cliquable tant qu'il ne fonctionne pas réellement."),
      h("h3", {}, "Prévu"),
      h("ul", {}, ...planned.map((x) => h("li", {}, x))),
    ),
  );
  return { el, update: () => {} };
}
