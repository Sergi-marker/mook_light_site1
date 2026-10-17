#!/usr/bin/env node
// Builds the French word list used by the WRITING help (syllables, rhymes): assets/lexique/fr.tsv.
//
// Developer tool — the generated file is committed, so users never need to run it (and the app
// works offline). Source: Lexique 3.83 (New, Pallier et al., www.lexique.org), licence CC BY-SA 4.0.
// The derived list keeps that licence (assets/lexique/LICENCE.txt); the app's code stays MIT.
//
// Output, one word per line, most frequent first: spelling <TAB> pronunciation (Lexique's phonetic
// code) <TAB> syllables. Words used less than 0.3 times per million (films + books) are left out.
//
// Usage: node scripts/build-lexicon.mjs [--tsv path/to/Lexique383.tsv]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const OUT = join(root, "assets", "lexique");
const args = process.argv.slice(2);
const local = args.includes("--tsv") ? args[args.indexOf("--tsv") + 1] : null;
const URL_TSV = "https://www.lexique.org/databases/Lexique383/Lexique383.tsv";

const text = local && existsSync(local) ? readFileSync(local, "utf8") : await (await fetch(URL_TSV)).text();
const lines = text.split("\n");
const head = lines[0].split("\t");
const col = (name) => head.indexOf(name);
const [cOrtho, cPhon, cSyll, cFilms, cBooks] = ["ortho", "phon", "nbsyll", "freqfilms2", "freqlivres"].map(col);
if ([cOrtho, cPhon, cSyll, cFilms, cBooks].some((c) => c < 0)) throw new Error("Unexpected Lexique columns");

/** Most frequent reading of each spelling. */
const best = new Map();
for (const line of lines.slice(1)) {
  const f = line.split("\t");
  const w = f[cOrtho]?.trim().toLowerCase();
  if (!w || /[\s\d]/.test(w)) continue;
  const freq = Number(f[cFilms] || 0) + Number(f[cBooks] || 0);
  const cur = best.get(w);
  if (!cur || freq > cur.freq) best.set(w, { freq, phon: f[cPhon], syll: Number(f[cSyll]) || 1 });
}
const words = [...best.entries()].filter(([, v]) => v.freq >= 0.3 && v.phon).sort((a, b) => b[1].freq - a[1].freq);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "fr.tsv"), words.map(([w, v]) => `${w}\t${v.phon}\t${v.syll}`).join("\n") + "\n");
writeFileSync(join(OUT, "LICENCE.txt"), `fr.tsv — liste de mots français avec prononciation et nombre de syllabes,
dérivée de Lexique 3.83 (Boris New, Christophe Pallier et al., http://www.lexique.org).

Licence : Creative Commons Attribution - Partage dans les mêmes conditions 4.0 International
(CC BY-SA 4.0) — https://creativecommons.org/licenses/by-sa/4.0/deed.fr

Modifications : mots utilisés au moins 0,3 fois par million (films + livres), une prononciation
par orthographe (la plus fréquente), colonnes réduites à orthographe / phonétique / syllabes.

Références : New, B., Pallier, C., Brysbaert, M., Ferrand, L. (2004) Lexique 2 : A New French
Lexical Database. Behavior Research Methods, Instruments, & Computers, 36(3), 516-524.
New, B., Pallier, C., Ferrand, L., Matos, R. (2001) Une base de données lexicales du français
contemporain sur internet : LEXIQUE. L'Année Psychologique, 101, 447-462.
`);
console.log(`${words.length} words → assets/lexique/fr.tsv`);
