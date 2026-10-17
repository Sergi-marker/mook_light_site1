// WRITING help under the lyrics: flow grid (syllables per bar on the 16ths, density at the
// tempo, rhyme scheme), French rhyme finder and plain-language advice. Updates while typing.

import { analyzeFlow, findRhymes, flowAdvice, gridPositions, type Lexicon, type LineFlow, type Rhyme } from "../../core/lyrics/writing.ts";
import { words } from "../../core/lyrics/phonetics.ts";
import type { App } from "../app.ts";
import { h } from "../dom.ts";

const DENSITY_CLASS: Record<LineFlow["density"], string> = { vide: "d0", aéré: "d1", posé: "d2", rapide: "d3", "très rapide": "d4", "trop dense": "d5" };

/** Rhyme search of each vocal track: the view is rebuilt often (every project change), the search stays. */
const searches = new Map<string, { target: string; syllables: string; shown: boolean }>();

export function writingPanel(app: App, trackId: string, textarea: HTMLTextAreaElement, onInsert: (text: string) => void): HTMLElement {
  let lex: Lexicon | null = null;
  const search = searches.get(trackId) ?? { target: "", syllables: "", shown: false };
  searches.set(trackId, search);
  const status = h("span", { class: "hint" }, "Chargement du dictionnaire…");
  const grid = h("div", { class: "flow-grid", role: "table", "aria-label": "Grille de flow" });
  const advice = h("ul", { class: "flow-advice" });
  const target = h("input", { type: "text", class: "rhyme-target", placeholder: "mot ou fin de phrase", "aria-label": "Trouver des rimes pour" }) as HTMLInputElement;
  const syll = h("select", { "aria-label": "Nombre de syllabes" }, h("option", { value: "" }, "toutes longueurs"), ...[1, 2, 3, 4].map((n) => h("option", { value: String(n) }, `${n} syllabe${n > 1 ? "s" : ""}`))) as HTMLSelectElement;
  const results = h("div", { class: "rhyme-results" });
  target.value = search.target;
  syll.value = search.syllables;
  target.addEventListener("input", () => (search.target = target.value));
  syll.addEventListener("change", () => {
    search.syllables = syll.value;
    if (search.shown) showRhymes();
  });

  /** End of the line under the cursor (its last two words), as the default rhyme target. */
  function currentLineEnd(): string {
    const v = textarea.value;
    const pos = textarea.selectionStart ?? v.length;
    const start = v.lastIndexOf("\n", pos - 1) + 1;
    const end = v.indexOf("\n", pos);
    const line = v.slice(start, end < 0 ? v.length : end);
    return words(line).slice(-2).join(" ");
  }

  function showRhymes(): void {
    const t = target.value.trim() || currentLineEnd();
    if (!t) {
      results.replaceChildren(h("p", { class: "hint" }, "Tape un mot (ou place le curseur au bout d'une ligne) puis « Rimes »."));
      return;
    }
    if (!lex) {
      results.replaceChildren(h("p", { class: "hint" }, "Le dictionnaire n'est pas encore chargé…"));
      return;
    }
    target.value = search.target = t;
    search.shown = true;
    const all = findRhymes(t, lex, { max: 80, syllables: Number(syll.value) || undefined });
    const group = (title: string, list: Rhyme[]) => list.length ? h("div", { class: "rhyme-group" }, h("strong", {}, title),
      h("div", { class: "chips" }, ...list.slice(0, 24).map((r) => h("button", { class: "chip", title: `${r.syllables} syllabe(s) — cliquer pour insérer`, onclick: () => onInsert(r.word) }, r.word)))) : null;
    const multi = all.filter((r) => r.multi >= 2);
    const rest = all.filter((r) => r.multi < 2);
    const groups = [
      group("Multi-syllabes (les plus fortes en rap)", multi),
      group("Rimes riches", rest.filter((r) => r.kind === "riche")),
      group("Rimes", rest.filter((r) => r.kind === "rime")),
    ].filter((g): g is HTMLDivElement => !!g);
    results.replaceChildren(...(groups.length ? groups : [h("p", { class: "hint" }, `Pas de rime trouvée pour « ${t} » dans le dictionnaire.`)]));
  }

  function renderFlow(): void {
    const p = app.store.getState();
    const flows = analyzeFlow(textarea.value, p.bpm, lex);
    grid.replaceChildren(...flows.map((f) => {
      const cells = Array.from({ length: 16 }, (_, i) => h("i", { class: `cell${i % 4 === 0 ? " beat" : ""}` }));
      const pos = gridPositions(f.syllables);
      let k = 0;
      for (const w of f.words) {
        for (let s = 0; s < w.syllables; s++, k++) {
          const c = cells[pos[k]];
          if (!c) continue;
          c.classList.add("on");
          if (w.rhymeVowel && f.scheme) c.classList.add(`rh-${f.scheme.toLowerCase()}`);
          if (s === 0 && !c.textContent) c.textContent = w.word.slice(0, 5);
        }
      }
      return h("div", { class: "flow-row", role: "row" },
        h("span", { class: `scheme${f.scheme ? ` rh-${f.scheme.toLowerCase()}` : ""}`, title: f.rhymeSyllables >= 2 ? `Rime sur ${f.rhymeSyllables} syllabes` : "Lettre de rime (même son en fin de ligne)" }, f.scheme || "·"),
        h("span", { class: `density ${DENSITY_CLASS[f.density]}`, title: `${f.rate} syllabes / seconde à ${p.bpm} BPM (une ligne = une mesure)${f.min < f.syllables ? ` · ${f.min} en avalant les « e »` : ""}` }, `${f.syllables}${f.min < f.syllables ? `/${f.min}` : ""} · ${f.density}`),
        h("span", { class: "cells" }, ...cells),
        h("span", { class: "flow-text" }, f.text));
    }));
    advice.replaceChildren(...flowAdvice(flows, p.bpm).map((a) => h("li", {}, a)));
  }

  let timer = 0;
  textarea.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(renderFlow, 200);
  });
  target.addEventListener("keydown", (e) => { if (e.key === "Enter") showRhymes(); });
  void app.lexicon().then((l) => {
    lex = l;
    if (search.shown) showRhymes();
    status.textContent = l ? `Dictionnaire : ${l.entries.length.toLocaleString("fr-FR")} mots (Lexique 3, CC BY-SA 4.0)` : "Dictionnaire indisponible : syllabes estimées par les règles d'orthographe.";
    renderFlow();
  });
  renderFlow();
  return h("div", { class: "writing" },
    h("h4", {}, "✍️ Aide à l'écriture"),
    h("p", { class: "hint" }, "Une ligne = une mesure. La grille place tes syllabes sur les 16 doubles-croches ; les couleurs montrent les fins de ligne qui riment et les voyelles qui sonnent pareil (assonances)."),
    grid,
    advice,
    h("div", { class: "row-inline" }, target, syll, h("button", { class: "btn btn-ai", onclick: showRhymes, title: "Rimes pour le mot tapé, ou pour la fin de la ligne où se trouve le curseur" }, "Rimes"), status),
    results);
}
