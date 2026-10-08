// Understands a free-text beat request, e.g. "Dark trap beat, 140 BPM, F minor, melancholic,
// heavy 808". Works offline (keyword parsing in French and English).

import { parseNoteName, type Key, type ScaleId } from "../music.ts";
import { detectStyle, styleById, styleForGenre } from "./styles.ts";

export type Genre = "trap" | "drill" | "afrobeat" | "boombap" | "rnb" | "lofi" | "dancehall" | "pop";
export type Mood = "dark" | "sad" | "happy" | "aggressive" | "chill" | "epic" | "romantic";

export interface BeatRequest {
  /** Precise sub-genre (see styles.ts). */
  style: string;
  genre: Genre;
  bpm: number;
  key: Key;
  mood: Mood;
  /** 0–1 */
  energy: number;
  /** 0–1 */
  complexity: number;
  heavy808: boolean;
  swing: number;
  /** What was understood, for display. */
  understood: string[];
}

export const GENRE_DEFAULTS: Record<Genre, { bpm: number; swing: number; scale: ScaleId; label: string }> = {
  trap: { bpm: 140, swing: 0, scale: "minor", label: "Trap" },
  drill: { bpm: 142, swing: 6, scale: "harmonicMinor", label: "Drill" },
  afrobeat: { bpm: 105, swing: 18, scale: "minor", label: "Afrobeat" },
  boombap: { bpm: 90, swing: 28, scale: "minor", label: "Boom Bap" },
  rnb: { bpm: 75, swing: 14, scale: "dorian", label: "R&B" },
  lofi: { bpm: 82, swing: 30, scale: "dorian", label: "Lo-fi" },
  dancehall: { bpm: 100, swing: 8, scale: "minor", label: "Dancehall" },
  pop: { bpm: 110, swing: 0, scale: "major", label: "Pop rap" },
};

const GENRE_WORDS: [Genre, RegExp][] = [
  ["drill", /\b(uk ?drill|ny ?drill|drill)\b/],
  ["trap", /\b(trap|rage|plugg)\b/],
  ["afrobeat", /\b(afro ?beats?|afro|amapiano|afro ?swing)\b/],
  ["boombap", /\b(boom ?bap|old ?school|90s|oldschool)\b/],
  ["rnb", /\b(r ?& ?b|rnb|soul)\b/],
  ["lofi", /\b(lo-?fi|chill ?hop|jazzy)\b/],
  ["dancehall", /\b(dancehall|reggaeton|shatta)\b/],
  ["pop", /\b(pop|commercial|radio)\b/],
];

const MOOD_WORDS: [Mood, RegExp][] = [
  ["dark", /\b(dark|sombre|noir|evil|sinister|menaçant|mysterious|mystérieux)\b/],
  ["sad", /\b(sad|triste|melanchol\w*|mélancol\w*|emotional|émotion\w*|pain|nostalgi\w*)\b/],
  ["aggressive", /\b(aggressive|agressi\w*|hard|violent|energetic|énergique|rage|bouncy)\b/],
  ["happy", /\b(happy|joyeux|joyful|summer|été|uplifting|positive|positif|feel ?good)\b/],
  ["chill", /\b(chill|calm|calme|smooth|relax\w*|doux|soft)\b/],
  ["epic", /\b(epic|épique|cinematic|cinématique|orchestral)\b/],
  ["romantic", /\b(love|amour|romantic|romantique|sensual|sensuel)\b/],
];

/**
 * @param fallbackStyle style used when the text names none (the style picked in the UI).
 */
export function parseBeatPrompt(text: string, fallbackStyle?: string, defaultRoot = 9): BeatRequest {
  const t = ` ${text.toLowerCase().replace(/[,.;!?]/g, " ")} `;
  const understood: string[] = [];
  let style = detectStyle(text);
  if (!style) {
    for (const [g, re] of GENRE_WORDS) if (re.test(t)) { style = styleForGenre(g); break; }
  }
  if (style) understood.push(`style: ${style.label}`);
  else style = styleById(fallbackStyle ?? "trap");
  const genre: Genre = style.genre;
  const d = { bpm: style.bpm[1], scale: style.scales[0] };
  let bpm = d.bpm;
  const bpmM = t.match(/(\d{2,3})\s*(bpm|b\.p\.m)/) ?? t.match(/\b(?:tempo|à)\s*(\d{2,3})\b/);
  if (bpmM) {
    bpm = Math.min(220, Math.max(40, parseInt(bpmM[1], 10)));
    understood.push(`BPM: ${bpm}`);
  }
  // No key in the text → the project's current root with the style's scale colour.
  let key: Key = { root: defaultRoot, scale: d.scale };
  const keyM = text.match(/\b([A-G])\s*([#♯b♭]?)\s*(minor|min|mineur|m(?![a-z])|major|maj|majeur)?\b/);
  const solfege = t.match(/\b(do|ré|re|mi|fa|sol|la|si)\s*(#|dièse|bémol|b)?\s*(mineur|majeur|minor|major)\b/);
  if (keyM && (keyM[3] || /key|tonalit|gamme|scale/i.test(text))) {
    const root = parseNoteName(keyM[1] + (keyM[2] === "♯" ? "#" : keyM[2] === "♭" ? "b" : keyM[2]));
    if (root !== null) {
      const minor = !keyM[3] || /min|mineur|^m$/i.test(keyM[3]);
      // An explicit "minor" / "major" wins over the style's own scale colour.
      key = { root, scale: minor ? (keyM[3] ? "minor" : d.scale === "major" ? "minor" : d.scale) : "major" };
      understood.push(`tonalité: ${keyM[1]}${keyM[2] ?? ""} ${minor ? "minor" : "major"}`);
    }
  } else if (solfege) {
    const map: Record<string, number> = { do: 0, ré: 2, re: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };
    let root = map[solfege[1]];
    if (solfege[2] === "#" || solfege[2] === "dièse") root = (root + 1) % 12;
    if (solfege[2] === "b" || solfege[2] === "bémol") root = (root + 11) % 12;
    const minor = /min/.test(solfege[3]);
    key = { root, scale: minor ? "minor" : "major" };
    understood.push(`tonalité: ${solfege[0]}`);
  }
  let mood: Mood = style.mood;
  for (const [m, re] of MOOD_WORDS) if (re.test(t)) { mood = m; understood.push(`humeur: ${m}`); break; }
  if ((mood === "happy" || mood === "romantic") && !/minor|mineur|\bm\b/.test(t) && key.scale !== "major" && !keyM?.[3]) key = { ...key, scale: genre === "rnb" ? "major" : key.scale };
  const heavy808 = /\b(heavy|lourde?|big|grosse?|hard|distorted|saturée?)\s*808\b|\b808\s*(heavy|lourde?|saturée?)\b/.test(t);
  if (heavy808) understood.push("808 lourde");
  let energy = style.energy + (mood === "aggressive" ? 0.1 : mood === "chill" || mood === "sad" ? -0.1 : 0);
  if (/\b(energetic|énergique|hype|banger|turn ?up)\b/.test(t)) energy = 0.9;
  let complexity = style.complexity;
  if (/\b(simple|minimal|minimaliste|sparse)\b/.test(t)) { complexity = 0.25; understood.push("simple"); }
  if (/\b(complex|complexe|busy|technique|crazy)\b/.test(t)) { complexity = 0.85; understood.push("complexe"); }
  return { style: style.id, genre, bpm, key, mood, energy: Math.max(0.2, Math.min(1, energy)), complexity, heavy808: heavy808 || !!style.heavy808, swing: style.swing, understood };
}
