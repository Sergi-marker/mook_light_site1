// French pronunciation for the WRITING help, in Lexique's phonetic code (one character per sound):
//   vowels  a e(é) E(è) i o(ô) O(ɔ) u(ou) y(u) 2(eu) 9(œ) °(e muet) @(an) 5(in) 1(un) §(on)
//   others  p b t d k g f v s z S(ch) Z(j) m n N(gn) G(ng) l R j(y) w(ou-) 8(u-)
// Known words come from the Lexique list (assets/lexique); unknown ones (slang, verlan, names)
// go through the spelling rules below — approximate, but good enough for rhymes and syllables.

export const VOWELS = new Set(["a", "e", "E", "i", "o", "O", "u", "y", "2", "9", "°", "@", "5", "1", "§"]);
export const isVowel = (c: string) => VOWELS.has(c);

/** Lowercase, keep letters (accents included), apostrophes and hyphens become spaces. */
export function words(text: string): string[] {
  return text.toLowerCase().replace(/[’']/g, "' ").split(/[^a-zàâäçéèêëîïôöùûüÿœæ']+/).map((w) => w.replace(/'/g, "")).filter(Boolean);
}

const V = "aeiouyàâäéèêëîïôöùûüÿœæ";
const isV = (ch: string | undefined) => !!ch && V.includes(ch);

/** Spelling → pronunciation (rule-based, for words missing from the list). */
export function g2p(word: string): string {
  let w = word.toLowerCase().replace(/[^a-zàâäçéèêëîïôöùûüÿœæ]/g, "");
  if (!w) return "";
  // Silent endings.
  // Silent endings: verb « -ent » (not « -ment »), plural « s / x », final t d p g (« nuit », « grand »)
  // except after a lone « e » (« net », « bled »). The final « e » / « es » is handled by the rules.
  if (w.length > 4 && /[^m]ent$/.test(w)) w = w.slice(0, -2);
  if (w.length > 2) w = w.replace(/([^e])es$/, "$1e").replace(/(.)[sx]$/, "$1");
  if (w.length > 2 && /[tdpg]$/.test(w) && !/[^aeiouy]e[tdpg]$/.test(w) && !/^e[tdpg]$/.test(w.slice(-2))) w = w.slice(0, -1);
  const out: string[] = [];
  let i = 0;
  const at = (s: string) => w.startsWith(s, i);
  const next = (k: number) => w[i + k];
  // A vowel + n / m is nasal unless a vowel (or h + vowel) follows: « bon » / « bonne », « bonheur ».
  const nasalOk = (k: number) => !isV(next(k)) && next(k) !== "n" && next(k) !== "m" && !(next(k) === "h" && isV(next(k + 1)));
  while (i < w.length) {
    const end = w.length - i;
    const rules: [string, string, boolean?][] = [
      ["eaux", "o"], ["eau", "o"], ["aille", "aj"], ["eille", "Ej"], ["ouille", "uj"], ["euille", "9j"], ["ille", "ij", i > 0], ["eil", "Ej", end === 3], ["ail", "aj", end === 3], ["euil", "9j", end === 4],
      ["tion", "sj§", i > 0], ["oin", "w5", nasalOk(3)], ["ain", "5", nasalOk(3)], ["ein", "5", nasalOk(3)], ["ien", "j5", nasalOk(3)],
      ["oi", "wa"], ["ou", isV(next(2)) ? "w" : "u"], ["au", "o"], ["ai", end === 2 ? "e" : "E"], ["ei", "E"], ["œu", "2"], ["eu", end === 2 || (end === 3 && /[sxt]/.test(next(2) ?? "")) ? "2" : "9"],
      ["an", "@", nasalOk(2)], ["am", "@", nasalOk(2)], ["en", "@", nasalOk(2)], ["em", "@", nasalOk(2)],
      ["on", "§", nasalOk(2)], ["om", "§", nasalOk(2)], ["in", "5", nasalOk(2)], ["im", "5", nasalOk(2)], ["un", "1", nasalOk(2)], ["um", "1", nasalOk(2) && end > 2], ["yn", "5", nasalOk(2)],
      ["er", "e", end === 2 && i > 1], ["ez", "e", end === 2], ["et", "E", end === 2 && i > 0],
      ["ch", "S"], ["ph", "f"], ["gn", "N"], ["qu", "k"], ["gu", "g", isV(next(2))], ["ss", "s"], ["ll", "l"], ["th", "t"], ["sh", "S"],
      ["ç", "s"], ["c", "s", /[eiyéèê]/.test(next(1) ?? "")], ["c", "k"], ["g", "Z", /[eiyéèê]/.test(next(1) ?? "")], ["g", "g"],
      ["s", "z", i > 0 && isV(w[i - 1]) && isV(next(1))], ["s", "s"], ["x", "ks"], ["h", ""], ["j", "Z"], ["r", "R"], ["q", "k"], ["w", "w"],
      ["y", isV(next(1)) && i > 0 ? "j" : "i"], ["é", "e"], ["è", "E"], ["ê", "E"], ["ë", "E"], ["à", "a"], ["â", "a"], ["ä", "a"], ["ô", "o"], ["ö", "o"], ["û", "y"], ["ù", "u"], ["ü", "y"], ["î", "i"], ["ï", "i"], ["œ", "9"], ["æ", "e"],
      // « o » is closed in an open syllable (« moment », « dos »), open before a closed one (« porte »).
      ["o", end === 1 || (!isV(next(1)) && (end === 2 || isV(next(2)) || next(2) === "h")) ? "o" : "O"],
      ["u", isV(next(1)) && !(next(1) === "e" && i + 2 >= w.length) ? "8" : "y"], ["a", "a"],
      ["i", i > 0 && isV(next(1)) && !(next(1) === "e" && i + 2 >= w.length) ? "j" : "i"],
      // « e »: è before two consonants or a final consonant, mute otherwise.
      ["e", end === 1 ? "" : (!isV(next(1)) && (!isV(next(2)) || end === 2)) ? "E" : "°"],
    ];
    let done = false;
    for (const [g, ph, cond] of rules) {
      if (cond === false || !at(g)) continue;
      out.push(ph);
      i += g.length;
      done = true;
      break;
    }
    if (!done) {
      const ch = w[i];
      // Double consonants are one sound.
      if (out.length && out[out.length - 1].endsWith(ch) && !isV(ch)) { i++; continue; }
      out.push(/[bdfklmnptvz]/.test(ch) ? ch : "");
      i++;
    }
  }
  return out.join("").replace(/(.)\1+/g, (m, c) => (isVowel(c) ? m : c));
}

/** Number of syllables of a pronunciation (« ° » inside a word can be dropped: « sam'di »). */
export function syllablesOf(phon: string): { full: number; min: number } {
  const v = [...phon].filter(isVowel);
  const elidable = [...phon].filter((c, i) => c === "°" && i > 0).length;
  return { full: v.length, min: Math.max(v.length ? 1 : 0, v.length - elidable) };
}

/** Rhyme equivalences heard in French rap: é ~ è, o ~ ɔ, eu ~ œ ~ e muet, in ~ un. */
const VOWEL_CLASS: Record<string, string> = { e: "E", E: "E", o: "O", O: "O", "2": "9", "9": "9", "°": "9", "5": "5", "1": "5" };
export const vowelClass = (c: string) => VOWEL_CLASS[c] ?? c;

/** Rhyme part of a pronunciation: from its last vowel to the end (final « ° » ignored). */
export function rimeOf(phon: string): string {
  const p = phon.replace(/°$/, "");
  for (let i = p.length - 1; i >= 0; i--) if (isVowel(p[i])) return p.slice(i);
  return p;
}

/** Vowels of a pronunciation, in order, by rhyme class (for multi-syllable assonances). */
export const vowelsOf = (phon: string) => [...phon.replace(/°$/, "")].filter(isVowel).map(vowelClass);
