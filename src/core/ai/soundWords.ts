// Instrument words (French / English, accents removed) → library sound ids. Shared by the
// plain-language commands (« change le piano en guitare ») and the beat prompt (« drill avec une
// guitare sombre »).

export const SOUND_WORDS: [RegExp, string][] = [
  [/\bguitare? (espagnole|nylon|classique)|spanish guitar|nylon\b/, "guitar-nylon"],
  [/\bguitare? (electrique|clean)|electric guitar\b/, "guitar-electric"],
  [/\bguitare? afro|highlife\b/, "afro-guitar"],
  [/\bguitare?s? (sombres?|dark|drill|triste|melancolique)|(dark|sombre) guitar(e|s)?\b/, "dark-guitar"],
  [/\bguitare?s?|guitar\b/, "guitar-acoustic"],
  [/\bpiano droit|upright\b/, "upright"],
  [/\b(dark|sombre) piano|piano (dark|sombre)\b/, "dark-piano"],
  [/\bpiano\b/, "grand"],
  [/\bwurli(tzer)?\b/, "wurli"],
  [/\b(rhodes|piano electrique|e-?piano)\b/, "rnb-rhodes"],
  [/\borgue|organ\b/, "organ"],
  [/\bviolon ?celles?|cellos?\b/, "cello"],
  [/\bviolons?|violins?\b/, "violin"],
  [/\bcordes?|strings?\b/, "strings"],
  [/\bflute|flûte\b/, "flute"],
  [/\bsax(ophone)?\b/, "sax"],
  [/\btrompette|trumpet\b/, "trumpet"],
  [/\b(cuivres?|cor|horns?|brass)\b/, "horns"],
  [/\bkalimba\b/, "kalimba"],
  [/\bmarimba\b/, "marimba"],
  [/\bbalafon\b/, "balafon"],
  [/\bvibraphone|vibes\b/, "vibes"],
  [/\bharpe|harp\b/, "harp"],
  [/\b(cloches?|bells?)\b/, "bells"],
  [/\bglockenspiel|glock\b/, "glock"],
  [/\bchoeurs?|choir\b/, "choir"],
  [/\bpad\b/, "warm-pad"],
  [/\bwhistle|sifflement\b/, "whistle"],
  [/\bcowbell\b/, "cowbell"],
  [/\blog ?drum\b/, "log-drum"],
  [/\bbasse electrique|electric bass\b/, "bass-electric"],
  [/\b808 distordue|808 dist|distorted 808\b/, "808-dist"],
  [/\b808 drill\b/, "808-drill"],
];


const BASS_SOUNDS = new Set(["bass-electric", "808-dist", "808-drill", "log-drum", "cowbell"]);

/**
 * Melodic sounds named in a text, in the order they appear (lead first, then chords).
 * A plain « guitare » in a dark or drill / trap context is the dark nylon guitar.
 */
export function melodicSoundsIn(text: string, dark = false): string[] {
  const t = ` ${text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, " ").replace(/[^a-z0-9 -]/g, " ")} `;
  const found: { at: number; id: string; end: number }[] = [];
  for (const [re, id] of SOUND_WORDS) {
    if (BASS_SOUNDS.has(id)) continue;
    const g = new RegExp(re.source, "g");
    for (let m = g.exec(t); m; m = g.exec(t)) {
      // A longer, more precise match already covers this spot (« guitare sombre » vs « guitare »).
      if (found.some((f) => m!.index >= f.at && m!.index < f.end)) continue;
      found.push({ at: m.index, end: m.index + m[0].length, id: id === "guitar-acoustic" && dark ? "dark-guitar" : id });
    }
  }
  return [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.id))];
}
