// WRITING help: syllables per line, flow density at the project's tempo, rhyme scheme, and a
// French rhyme finder (rich rhymes, rhymes, multi-syllable assonances) on the Lexique word list.

import { g2p, isVowel, rimeOf, syllablesOf, vowelClass, vowelsOf, words } from "./phonetics.ts";

export interface LexEntry { word: string; phon: string; syll: number; rank: number }
export interface Lexicon { byWord: Map<string, LexEntry>; entries: LexEntry[] }

/** Parses assets/lexique/fr.tsv (spelling, pronunciation, syllables; most frequent first). */
export function parseLexicon(tsv: string): Lexicon {
  const entries: LexEntry[] = [];
  const byWord = new Map<string, LexEntry>();
  for (const line of tsv.split("\n")) {
    const [word, phon, syll] = line.split("\t");
    if (!word || !phon) continue;
    const e = { word, phon, syll: Number(syll) || 1, rank: entries.length };
    entries.push(e);
    if (!byWord.has(word)) byWord.set(word, e);
  }
  return { byWord, entries };
}

/** Pronunciation of a word: from the list, or from the spelling rules. */
export function phonOf(word: string, lex: Lexicon | null): { phon: string; known: boolean } {
  const w = word.toLowerCase();
  const e = lex?.byWord.get(w) ?? lex?.byWord.get(w.replace(/s$/, ""));
  return e ? { phon: e.phon, known: true } : { phon: g2p(w), known: false };
}

// --- rhymes --------------------------------------------------------------------------------

export type RhymeKind = "riche" | "rime" | "assonance";
export interface Rhyme {
  word: string;
  kind: RhymeKind;
  syllables: number;
  /** Vowels shared from the end (2+ = multi-syllable rhyme / assonance). */
  multi: number;
  score: number;
}

/**
 * Words rhyming with `target` (a word or the end of a line). Scored on the shared ending, sound by
 * sound from the end: same sound = 1, same rhyme class (é/è, o/ɔ, eu/œ, in/un) = 0.75.
 *  • riche: the rhyme + the sound before it (« chanson / garçon »), or two vowels or more;
 *  • rime: last vowel and what follows (« nuit / pluie »);
 *  • assonance: the last two vowels or more only (« bébé / été », the multi-syllable rap rhyme).
 */
export function findRhymes(target: string, lex: Lexicon, o: { max?: number; syllables?: number } = {}): Rhyme[] {
  const ws = words(target);
  if (!ws.length) return [];
  const phon = ws.map((w) => phonOf(w, lex).phon).join("").replace(/°$/, "");
  const last = ws[ws.length - 1];
  const tv = vowelsOf(phon);
  if (!tv.length) return [];
  const tRime = rimeOf(phon);
  const out: Rhyme[] = [];
  for (const e of lex.entries) {
    if (e.word.length < 2 || e.word.includes("-")) continue;
    // Same word in another form (« noir / noire / noirs ») is a repetition, not a rhyme.
    if (e.word.startsWith(last) || (last.length >= 4 && last.startsWith(e.word)) || e.word.endsWith(last)) continue;
    if (o.syllables && e.syll !== o.syllables) continue;
    const p = e.phon.replace(/°$/, "");
    if (p === phon) continue; // same sound: not a rhyme, a repetition
    // Shared ending, sound by sound.
    let i = phon.length - 1, j = p.length - 1, score = 0, vowelsMatched = 0;
    while (i >= 0 && j >= 0) {
      const a = phon[i], b = p[j];
      if (a === b) score += 1;
      else if (isVowel(a) && isVowel(b) && vowelClass(a) === vowelClass(b)) score += 0.75;
      else break;
      if (isVowel(a)) vowelsMatched++;
      i--; j--;
    }
    const rimeLen = rimeOf(p).length;
    const rhymes = vowelsMatched >= 1 && score >= Math.min(tRime.length, rimeLen) * 0.75 && j < p.length - rimeLen + 1 && i < phon.length - tRime.length + 1;
    // Multi-syllable assonance: the last vowels are the same, whatever the consonants.
    const ev = vowelsOf(p);
    let assoc = 0;
    while (assoc < tv.length && assoc < ev.length && tv[tv.length - 1 - assoc] === ev[ev.length - 1 - assoc]) assoc++;
    let kind: RhymeKind | null = null;
    if (rhymes && (vowelsMatched >= 2 || score >= tRime.length + 1)) kind = "riche";
    else if (rhymes) kind = "rime";
    else if (assoc >= 2 && tv.length >= 2) kind = "assonance";
    if (!kind) continue;
    // Multi-syllable rhymes first (that's what makes a rap verse sound), then rich ones, then
    // frequent words: a common word is easier to place than a rare one.
    const quality = assoc * 1.5 + (kind === "riche" ? 1.5 : kind === "rime" ? 1 : 0) + score / 10;
    out.push({ word: e.word, kind, syllables: e.syll, multi: assoc, score: quality - Math.log10(1 + e.rank) / 3 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, o.max ?? 60);
}

// --- flow ----------------------------------------------------------------------------------

export type Density = "vide" | "aéré" | "posé" | "rapide" | "très rapide" | "trop dense";
export interface LineFlow {
  text: string;
  /** Syllables, read normally / with every elidable « e » dropped. */
  syllables: number;
  min: number;
  /** Syllables per second at the tempo, 1 line = 1 bar. */
  rate: number;
  density: Density;
  /** Rhyme letter (A, B…) — lines with the same end sound share it; "" when alone. */
  scheme: string;
  /** Vowels (rhyme classes) shared with the previous line of the same letter. */
  rhymeSyllables: number;
  /** Words of the line with their syllable count (for the grid). */
  words: { word: string; syllables: number; rhymeVowel: boolean }[];
}

const DENSITY: [number, Density][] = [[0.01, "vide"], [3, "aéré"], [5, "posé"], [7, "rapide"], [9.5, "très rapide"], [Infinity, "trop dense"]];

/** Line-by-line analysis of lyrics (1 line = 1 bar at `bpm`). Empty lines and [tags] are skipped. */
export function analyzeFlow(text: string, bpm: number, lex: Lexicon | null): LineFlow[] {
  const bar = 240 / bpm;
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !/^\[.*\]$/.test(l));
  const flows = lines.map((line): LineFlow & { phon: string } => {
    const ws = words(line);
    const parts = ws.map((w) => {
      const { phon, known } = phonOf(w, lex);
      const s = syllablesOf(phon);
      const lexSyll = known ? lex!.byWord.get(w)?.syll : undefined;
      return { word: w, phon, full: lexSyll ?? s.full, min: Math.min(lexSyll ?? s.full, s.min) };
    });
    const syllables = parts.reduce((n, p) => n + p.full, 0);
    const min = parts.reduce((n, p) => n + p.min, 0);
    const rate = syllables / bar;
    const phon = parts.map((p) => p.phon).join("");
    const endVowel = vowelsOf(phon).pop();
    return {
      text: line, syllables, min, rate: Math.round(rate * 10) / 10,
      density: DENSITY.find(([lim]) => rate < lim)![1], scheme: "", rhymeSyllables: 0, phon,
      words: parts.map((p) => ({ word: p.word, syllables: p.full, rhymeVowel: !!endVowel && vowelsOf(p.phon).includes(endVowel) })),
    };
  });
  // Rhyme scheme: same end sound (rhyme class of the last vowel + what follows).
  const key = (phon: string) => {
    const r = rimeOf(phon);
    return vowelClass(r[0] ?? "") + r.slice(1).replace(/[°]/g, "");
  };
  const letters = new Map<string, string>();
  const lastOf = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const f of flows) counts.set(key(f.phon), (counts.get(key(f.phon)) ?? 0) + 1);
  flows.forEach((f, i) => {
    const k = key(f.phon);
    if (!f.phon || (counts.get(k) ?? 0) < 2) return;
    if (!letters.has(k)) letters.set(k, String.fromCharCode(65 + letters.size));
    f.scheme = letters.get(k)!;
    const prev = lastOf.get(k);
    if (prev !== undefined) {
      const a = vowelsOf(flows[prev].phon), b = vowelsOf(f.phon);
      let n = 0;
      while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
      f.rhymeSyllables = n;
      if (!flows[prev].rhymeSyllables) flows[prev].rhymeSyllables = n;
    }
    lastOf.set(k, i);
  });
  return flows.map(({ phon: _phon, ...f }) => f);
}

/** Positions (0–15) of a line's syllables on the bar's 16ths, evenly spread (a writing guide). */
export function gridPositions(syllables: number): number[] {
  if (syllables <= 0) return [];
  return Array.from({ length: syllables }, (_, i) => Math.min(15, Math.floor((i * 16) / Math.max(syllables, 1))));
}

/** Plain-language advice on the flow of a text. */
export function flowAdvice(flows: LineFlow[], bpm: number): string[] {
  if (!flows.length) return ["Écris quelques lignes (une ligne = une mesure) et je te dis comment elles tombent sur le beat."];
  const out: string[] = [];
  const avg = flows.reduce((n, f) => n + f.syllables, 0) / flows.length;
  out.push(`${flows.length} ligne(s), ${avg.toFixed(1)} syllabes par mesure en moyenne à ${bpm} BPM.`);
  const dense = flows.filter((f) => f.density === "trop dense");
  if (dense.length) out.push(`${dense.length} ligne(s) trop chargée(s) pour ce tempo (plus de ${Math.round((9.5 * 240) / bpm)} syllabes) : coupe des mots, élide des « e » (« j'suis », « p'tit ») ou étale sur deux mesures.`);
  const spread = Math.max(...flows.map((f) => f.syllables)) - Math.min(...flows.map((f) => f.syllables));
  if (flows.length >= 4 && spread > 8) out.push("Le nombre de syllabes varie beaucoup d'une ligne à l'autre : c'est voulu pour casser le flow ? Sinon, équilibre les mesures.");
  const rhymed = flows.filter((f) => f.scheme).length;
  if (flows.length >= 4 && rhymed < flows.length / 2) out.push("Peu de lignes riment entre elles : cherche des rimes pour les fins de ligne (bouton « Rimes »).");
  const multi = flows.filter((f) => f.rhymeSyllables >= 2).length;
  if (multi) out.push(`${multi} ligne(s) avec des rimes multi-syllabiques : c'est ce qui fait sonner un couplet.`);
  else if (rhymed >= 2) out.push("Tes rimes portent sur une seule syllabe : essaie de faire rimer les deux ou trois dernières (« j'suis dans l'bloc / j'suis dans l'froc ») pour plus d'impact.");
  return out;
}
