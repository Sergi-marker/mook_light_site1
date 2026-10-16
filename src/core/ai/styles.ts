// AI STYLE CATALOG: precise sub-genres (mumble rap, love drill, rage, plugg, phonk, amapiano…).
// Each style defines its own drum grids, 808 behaviour, sounds (from the sound library),
// melody writing, harmony, tempo, key, kit tuning and song structure. Everything the AI
// produces from a style stays ordinary, editable project data.

import type { ScaleId } from "../music.ts";
import type { InstrumentKind } from "../types.ts";
import type { Genre, Mood } from "./prompt.ts";

/**
 * Drum grids are written as 16 characters per lane (one bar of 16ths):
 *   X = always (backbone) · x = 80 % · o = 50 % · - = 25 % · . = never
 */
export type GridString = string;

export type MelodyMode = "motif" | "bounce" | "arp" | "sustain" | "sparse";
export type Layout = "standard" | "hookFirst" | "short" | "long";

export interface StyleDef {
  id: string;
  label: string;
  family: "Trap" | "Drill" | "Afro" | "Caraïbes" | "Old school" | "R&B / Chill" | "Club / Latin" | "Pop / Alternatif";
  description: string;
  /** Base family used for generic behaviour (melody rhythms fallback, bass). */
  genre: Genre;
  /** min, default, max BPM. */
  bpm: [number, number, number];
  swing: number;
  scales: ScaleId[];
  mood: Mood;
  energy: number;
  complexity: number;
  drums: Partial<Record<InstrumentKind, GridString>>;
  /** 0–1: hi-hat rolls (×2 / ×3 / ×4) density. */
  hatRolls: number;
  /** Prefer triplet rolls (×3) — drill / jersey bounce. */
  tripletRolls?: boolean;
  /** 808 rhythm: follow the kick, or its own grid. */
  bassGrid?: GridString;
  /** 0–1 probability of 808 slides. */
  slides: number;
  sounds: { lead: string; chords: string; bass: string };
  /** 808 extra character (applied on top of the library sound). */
  heavy808?: boolean;
  melody: { mode: MelodyMode; rhythms?: GridString[]; range?: [number, number]; density?: number };
  chordStyle: "sustain" | "stabs" | "arp";
  /** 3 = triads, 4 = 7th chords, 5 = 9th chords. */
  chordSize?: number;
  /** Stab rhythm (16th positions in the bar) for chordStyle "stabs". */
  chordHits?: number[];
  /** Bass writing: held notes (808 / bass) or amapiano log drum bounces. */
  bassMode?: "follow" | "log";
  /** Scale-degree progressions (one chord per bar). */
  progressions: number[][];
  /** Drum kit tuning in semitones. */
  kit?: Partial<Record<InstrumentKind, number>>;
  /** Drum sounds (core/drumSamples DRUM_KITS id); default from STYLE_DRUM_KITS. */
  drumKit?: string;
  layout: Layout;
  /** Words that select this style in a free-text prompt (FR / EN, "type beat" names). */
  keywords: RegExp;
}

const DARK: number[][] = [[0, 5, 2, 6], [0, 3, 5, 4], [0, 0, 5, 6], [0, 5, 3, 4]];
const SAD: number[][] = [[0, 5, 2, 6], [5, 3, 0, 4], [0, 3, 6, 2], [0, 5, 3, 3]];
const LOVE: number[][] = [[0, 4, 5, 3], [3, 4, 2, 5], [0, 5, 1, 4], [5, 3, 0, 4]];
const JAZZY: number[][] = [[1, 4, 0, 0], [0, 5, 1, 4], [3, 2, 1, 0], [1, 4, 2, 5]];
const HAPPY: number[][] = [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 0, 5], [0, 3, 4, 4]];
const TENSE: number[][] = [[0, 1, 0, 6], [0, 0, 5, 6], [0, 6, 5, 6], [0, 1, 6, 5]];

export const STYLES: StyleDef[] = [
  // ---------------------------------------------------------------- TRAP
  {
    id: "trap", label: "Trap (Atlanta)", family: "Trap", description: "Le classique : 808 calée sur le kick, charleys en doubles-croches avec rolls, snare sur le 3e temps.",
    genre: "trap", bpm: [130, 140, 150], swing: 0, scales: ["minor"], mood: "dark", energy: 0.75, complexity: 0.5,
    drums: { kick: "X..-...x..x...-.", snare: "........X.......", clap: "........x.......", closedHat: "X-X-X-X-X-X-X-X-", openHat: "...............-", perc: "......-......-.." },
    hatRolls: 0.45, slides: 0.2, sounds: { lead: "bells", chords: "dark-pad", bass: "808-trap" },
    melody: { mode: "motif" }, chordStyle: "sustain", progressions: DARK, layout: "standard",
    keywords: /\b(trap|atlanta|atl|migos|21 ?savage|metro ?boomin)\b/,
  },
  {
    id: "dark-trap", label: "Dark trap", family: "Trap", description: "Sombre et menaçant : gamme phrygienne, piano grave, chœurs, 808 saturée.",
    genre: "trap", bpm: [130, 140, 150], swing: 0, scales: ["phrygian", "harmonicMinor"], mood: "dark", energy: 0.75, complexity: 0.5,
    drums: { kick: "X......x..x.....", snare: "........X.......", clap: "........x.......", closedHat: "X-X-X-X-X-X-XoXo", openHat: "................", perc: "...-.......-...." },
    hatRolls: 0.5, slides: 0.25, heavy808: true, sounds: { lead: "dark-piano", chords: "choir", bass: "808-dist" },
    melody: { mode: "sparse", range: [55, 74] }, chordStyle: "sustain", progressions: TENSE, layout: "standard",
    keywords: /\b(dark ?trap|horror ?trap|trap ?sombre)\b/,
  },
  {
    id: "mumble", label: "Mumble rap / trap mélodique", family: "Trap", description: "Rebondissant et mélodique (Future, Young Thug, Lil Uzi) : tempo rapide, beaucoup de rolls, flûte ou whistle, 808 longue.",
    genre: "trap", bpm: [140, 152, 165], swing: 0, scales: ["minor", "harmonicMinor"], mood: "sad", energy: 0.8, complexity: 0.65,
    drums: { kick: "X.....x...x...-.", snare: "........X.......", clap: "........x.......", closedHat: "X-X-XoX-X-X-XoX-", openHat: "......-.........", perc: "..-.......-....." },
    hatRolls: 0.7, slides: 0.35, sounds: { lead: "flute", chords: "dark-pad", bass: "808-long" },
    melody: { mode: "motif", range: [67, 86], density: 0.7, rhythms: ["X..x..x.X..x.x..", "X.x...x.x..x..x.", "..x.x...X.x..x.."] },
    chordStyle: "sustain", progressions: SAD, layout: "hookFirst",
    keywords: /\b(mumble|melodic ?trap|trap ?m[ée]lodique|future|young ?thug|lil ?uzi|uzi|gunna|lil ?baby)\b/,
  },
  {
    id: "rage", label: "Rage", family: "Trap", description: "Énergie maximale (Playboi Carti, Trippie Redd) : synthé saturé en arpège, 808 distordue dense, charleys droits.",
    genre: "trap", bpm: [150, 160, 170], swing: 0, scales: ["minor"], mood: "aggressive", energy: 0.95, complexity: 0.6,
    drums: { kick: "X...x..xX..x..x.", snare: "........X.......", clap: "........X.......", closedHat: "X.X.X.X.X.X.X.X.", openHat: "......x.......x.", perc: "................" },
    hatRolls: 0.25, slides: 0.15, heavy808: true, sounds: { lead: "rage-lead", chords: "supersaw", bass: "808-dist" },
    melody: { mode: "arp", range: [60, 84] }, chordStyle: "sustain", progressions: [[0, 5, 6, 4], [0, 3, 5, 6], [0, 0, 6, 5]], layout: "hookFirst",
    keywords: /\b(rage|carti|playboi|trippie|ken ?carson|destroy ?lonely|opium)\b/,
  },
  {
    id: "plugg", label: "Plugg", family: "Trap", description: "Doux et rebondissant (Pi'erre Bourne) : mélodie staccato aiguë, kick épuré, peu de rolls.",
    genre: "trap", bpm: [140, 150, 160], swing: 0, scales: ["major", "minor"], mood: "chill", energy: 0.6, complexity: 0.45,
    drums: { kick: "X.....X...X.....", snare: "........X.......", clap: "........X.......", closedHat: "X.X.X.X.X.X.X.X.", openHat: "................", perc: "....-.......-..." },
    hatRolls: 0.1, slides: 0.1, sounds: { lead: "plugg-lead", chords: "warm-pad", bass: "808-clean" },
    melody: { mode: "bounce", range: [72, 91], rhythms: ["X.x.x...x.x.x...", "X..x.x..X..x.x..", "x.x.x.x.x...x.x."] }, chordStyle: "sustain", progressions: HAPPY, layout: "hookFirst",
    keywords: /\bplugg\b|\b(pi'?erre|pierre ?bourne|summrs|autumn)\b/,
  },
  {
    id: "pluggnb", label: "PluggnB", family: "Trap", description: "Plugg + R&B : accords de Rhodes romantiques, lead doux, 808 propre qui glisse.",
    genre: "trap", bpm: [140, 148, 158], swing: 0, scales: ["dorian", "major"], mood: "romantic", energy: 0.55, complexity: 0.5,
    drums: { kick: "X.....X...X.....", snare: "........X.......", clap: "........X.......", closedHat: "X.X.X.X.X.XoX.X.", openHat: "...............-", perc: "................" },
    hatRolls: 0.2, slides: 0.3, sounds: { lead: "plugg-lead", chords: "rnb-rhodes", bass: "808-clean" },
    melody: { mode: "bounce", range: [70, 88] }, chordStyle: "sustain", progressions: LOVE, layout: "hookFirst",
    keywords: /\b(plugg ?n ?b|pluggnb|plug ?n ?b|summrs ?rnb)\b/,
  },
  {
    id: "cloud", label: "Cloud rap", family: "Trap", description: "Planant et brumeux : pads aériens, drums espacés, beaucoup de réverbe.",
    genre: "trap", bpm: [125, 132, 140], swing: 0, scales: ["minor", "dorian"], mood: "chill", energy: 0.45, complexity: 0.35,
    drums: { kick: "X.........x.....", snare: "........X.......", clap: "................", closedHat: "X...X...X.-.X...", openHat: "......-.........", perc: "................" },
    hatRolls: 0.15, slides: 0.2, sounds: { lead: "air-pad", chords: "choir", bass: "808-long" },
    melody: { mode: "sustain", range: [64, 84] }, chordStyle: "sustain", progressions: SAD, layout: "standard",
    keywords: /\b(cloud ?rap|cloud|ethereal|a[ée]rien|dreamy|planant|yung ?lean|bladee)\b/,
  },
  {
    id: "emo", label: "Emo rap", family: "Trap", description: "Mélancolique (Juice WRLD, Lil Peep) : guitare en arpège, mineur, émotion.",
    genre: "trap", bpm: [140, 150, 160], swing: 0, scales: ["minor"], mood: "sad", energy: 0.65, complexity: 0.5,
    drums: { kick: "X......x..x.....", snare: "........X.......", clap: "........x.......", closedHat: "X-X-X-X-X-X-X-X-", openHat: "...............-", perc: "................" },
    hatRolls: 0.35, slides: 0.2, sounds: { lead: "pluck", chords: "pluck", bass: "808-trap" },
    melody: { mode: "motif", range: [64, 81] }, chordStyle: "arp", progressions: SAD, layout: "hookFirst",
    keywords: /\b(emo|juice ?wrld|lil ?peep|xxxtentacion|xxx|guitar|guitare|sad ?trap)\b/,
  },
  {
    id: "detroit", label: "Detroit", family: "Trap", description: "Rebond Detroit (Babyface Ray, Icewear) : tempo moyen, piano dark, kick et 808 très rythmés.",
    genre: "trap", bpm: [95, 100, 108], swing: 4, scales: ["minor", "harmonicMinor"], mood: "dark", energy: 0.8, complexity: 0.6,
    drums: { kick: "X..x..X...x.x...", snare: "....X.......X...", clap: "....X.......X...", closedHat: "X.XxX.X.X.XxX.X.", openHat: "......-.........", perc: "...........-...." },
    hatRolls: 0.2, slides: 0.1, sounds: { lead: "dark-piano", chords: "strings", bass: "808-short" },
    melody: { mode: "sparse", range: [60, 79] }, chordStyle: "stabs", progressions: TENSE, layout: "short",
    keywords: /\b(detroit|babyface ?ray|icewear|veeze|sada ?baby|bouncy)\b/,
  },
  {
    id: "phonk", label: "Phonk (Memphis)", family: "Trap", description: "Memphis rap : cowbell en mélodie, ambiance lo-fi sombre, rolls rapides.",
    genre: "trap", bpm: [125, 135, 145], swing: 4, scales: ["phrygian", "minor"], mood: "dark", energy: 0.7, complexity: 0.55,
    drums: { kick: "X......x..X.....", snare: "........X.......", clap: "........X.......", closedHat: "XoXoXoXoXoXoXoXo", openHat: "................", perc: "..x..x....x..x.." },
    hatRolls: 0.55, slides: 0.15, sounds: { lead: "cowbell", chords: "dark-pad", bass: "808-dist" },
    melody: { mode: "bounce", range: [70, 86], rhythms: ["X..X..X...X..X..", "X..X..X.X..X..X."] }, chordStyle: "sustain", progressions: TENSE, kit: { perc: 7 }, layout: "short",
    keywords: /\b(phonk|memphis|cowbell|dj ?smokey|three ?6)\b/,
  },
  {
    id: "drift-phonk", label: "Drift phonk", family: "Trap", description: "Le phonk des edits voiture : kick à chaque temps, 808 ultra-distordue, cowbell agressive.",
    genre: "trap", bpm: [140, 150, 165], swing: 0, scales: ["phrygian"], mood: "aggressive", energy: 0.95, complexity: 0.5,
    drums: { kick: "X...X...X...X...", snare: "........X.......", clap: "....X.......X...", closedHat: "..X...X...X...X.", openHat: "................", perc: "..x..x....x..x.." },
    hatRolls: 0.2, bassGrid: "X...X...X...X.x.", slides: 0.35, heavy808: true, sounds: { lead: "cowbell", chords: "supersaw", bass: "808-dist" },
    melody: { mode: "bounce", range: [70, 88], rhythms: ["X..X..X.X..X..X.", "X.XX.X.XX.X.X.X."] }, chordStyle: "sustain", progressions: TENSE, kit: { perc: 9 }, layout: "short",
    keywords: /\b(drift ?phonk|brazilian ?phonk|kordhell|car ?edit)\b/,
  },
  {
    id: "guitar-trap", label: "Trap guitare (mélancolique)", family: "Trap", description: "Rod Wave, Lil Tjay, Toosii : guitare acoustique ou nylon en arpèges, accords tristes, 808 longue, chant émotionnel.",
    genre: "trap", bpm: [130, 140, 150], swing: 0, scales: ["minor", "major"], mood: "sad", energy: 0.6, complexity: 0.55,
    drums: { kick: "X.....x...x.....", snare: "........X.......", clap: "........x.......", closedHat: "X-X-X-X-X-X-X-X-", openHat: "..............-.", perc: "................" },
    hatRolls: 0.4, slides: 0.25, sounds: { lead: "guitar-nylon", chords: "guitar-acoustic", bass: "808-long" },
    melody: { mode: "arp", range: [55, 79] }, chordStyle: "arp", progressions: SAD, layout: "hookFirst", drumKit: "trap-hybrid",
    keywords: /\b(guitar ?trap|trap ?guitare|rod ?wave|lil ?tjay|toosii|polo ?g)\b/,
  },
  {
    id: "orchestral-trap", label: "Trap orchestrale / épique", family: "Trap", description: "Cordes, cuivres et piano à queue : intro de film, tension, 808 massive (Metro Boomin « Heroes & Villains »).",
    genre: "trap", bpm: [130, 140, 150], swing: 0, scales: ["harmonicMinor", "minor"], mood: "epic", energy: 0.85, complexity: 0.6,
    drums: { kick: "X......x..x.....", snare: "........X.......", clap: "........X.......", closedHat: "X-X-X-X-X-XoX-X-", openHat: "................", perc: "...........-...." },
    hatRolls: 0.45, slides: 0.2, heavy808: true, sounds: { lead: "horns", chords: "strings", bass: "808-dist" },
    melody: { mode: "sparse", range: [55, 79] }, chordStyle: "sustain", progressions: TENSE, layout: "standard",
    keywords: /\b(orchestr\w*|cin[ée]matique|heroes|villains|trap ?[ée]pique|epic ?trap)\b/,
  },
  {
    id: "trap-fr", label: "Trap FR", family: "Trap", description: "Trap à la française : piano et cordes mélodiques, 808 propre, ambiance street-mélancolique.",
    genre: "trap", bpm: [135, 140, 150], swing: 0, scales: ["harmonicMinor", "minor"], mood: "sad", energy: 0.7, complexity: 0.5,
    drums: { kick: "X......x..x...-.", snare: "........X.......", clap: "........x.......", closedHat: "X-X-X-X-X-X-XoX-", openHat: "...............-", perc: "................" },
    hatRolls: 0.4, slides: 0.25, sounds: { lead: "grand", chords: "drill-strings", bass: "808-trap" },
    melody: { mode: "motif", range: [62, 82] }, chordStyle: "sustain", progressions: SAD, layout: "standard",
    keywords: /\b(trap ?fr|french ?trap|trap ?fran[cç]aise|ninho|jul|pnl|sch|niska|gazo ?trap)\b/,
  },
  // ---------------------------------------------------------------- DRILL
  {
    id: "uk-drill", label: "UK drill", family: "Drill", description: "Londres : kick décalé, snare tardive, charleys en triolets, 808 qui glisse en permanence.",
    genre: "drill", bpm: [138, 142, 146], swing: 6, scales: ["harmonicMinor", "minor"], mood: "dark", energy: 0.8, complexity: 0.6,
    drums: { kick: "X.........x...o.", snare: "........X.....-.", clap: "........o.......", closedHat: "X..x..X...X..x..", openHat: "................", perc: "..-..o...-..o..." },
    hatRolls: 0.35, tripletRolls: true, bassGrid: "X..o......x..o..", slides: 0.55, sounds: { lead: "dark-piano", chords: "drill-strings", bass: "808-drill" },
    melody: { mode: "sparse", range: [60, 79] }, chordStyle: "sustain", progressions: TENSE, kit: { snare: 2 }, layout: "hookFirst",
    keywords: /\b(uk ?drill|london ?drill|headie ?one|digga ?d|central ?cee|k ?trap)\b/,
  },
  {
    id: "ny-drill", label: "NY / Brooklyn drill", family: "Drill", description: "New York (Pop Smoke, Fivio) : 808 énormes et glissantes, chœurs samplés, énergie agressive.",
    genre: "drill", bpm: [140, 144, 148], swing: 4, scales: ["harmonicMinor"], mood: "aggressive", energy: 0.9, complexity: 0.6,
    drums: { kick: "X.....x...x...x.", snare: "........X.....o.", clap: "........X.......", closedHat: "X..x..X..x..X.x.", openHat: "................", perc: "...o......o..o.." },
    hatRolls: 0.4, tripletRolls: true, bassGrid: "X..x..x...X..x..", slides: 0.65, heavy808: true, sounds: { lead: "choir", chords: "dark-pad", bass: "808-drill" },
    melody: { mode: "sparse", range: [58, 77] }, chordStyle: "sustain", progressions: TENSE, layout: "hookFirst",
    keywords: /\b(ny ?drill|brooklyn|bronx ?drill|pop ?smoke|fivio|sheff ?g|kay ?flock)\b/,
  },
  {
    id: "love-drill", label: "Love drill / drill mélodique", family: "Drill", description: "Drill romantique : accords R&B (Rhodes, piano), mélodie chantée, whistle, 808 drill douce.",
    genre: "drill", bpm: [138, 142, 146], swing: 6, scales: ["minor", "dorian"], mood: "romantic", energy: 0.65, complexity: 0.55,
    drums: { kick: "X.........x...o.", snare: "........X.......", clap: "........x.......", closedHat: "X..x..X...X..x..", openHat: "................", perc: "..-......-......" },
    hatRolls: 0.25, tripletRolls: true, bassGrid: "X.........x..o..", slides: 0.45, sounds: { lead: "whistle", chords: "rnb-rhodes", bass: "808-drill" },
    melody: { mode: "motif", range: [65, 84], rhythms: ["X..x..x.....x...", "X.....x..x..x...", "X..x....x..x..x."] }, chordStyle: "sustain", progressions: LOVE, layout: "hookFirst",
    keywords: /\b(love ?drill|drill ?love|melodic ?drill|drill ?m[ée]lodique|r ?&? ?b ?drill|drill ?romantique|sad ?drill)\b/,
  },
  {
    id: "drill-fr", label: "Drill FR", family: "Drill", description: "Drill française (Gazo, Tiakola) : base UK drill, cordes et piano, mélodie plus présente.",
    genre: "drill", bpm: [138, 141, 146], swing: 6, scales: ["harmonicMinor"], mood: "dark", energy: 0.8, complexity: 0.55,
    drums: { kick: "X.........x...o.", snare: "........X.....-.", clap: "........o.......", closedHat: "X..x..X...X..x..", openHat: "................", perc: "..-..o...-..o..." },
    hatRolls: 0.35, tripletRolls: true, bassGrid: "X..o......x..o..", slides: 0.5, sounds: { lead: "drill-strings", chords: "dark-piano", bass: "808-drill" },
    melody: { mode: "motif", range: [62, 81] }, chordStyle: "stabs", progressions: TENSE, layout: "hookFirst",
    keywords: /\b(drill ?fr|french ?drill|drill ?fran[cç]aise|gazo|tiakola|ziak|kerchak)\b/,
  },
  {
    id: "chicago-drill", label: "Chicago drill", family: "Drill", description: "L'originale (Chief Keef, King Von) : trap lente et menaçante, piano/cloches sombres, 808 lourde peu glissante, charleys en triolets.",
    genre: "drill", bpm: [62, 66, 72], swing: 0, scales: ["harmonicMinor", "minor"], mood: "dark", energy: 0.75, complexity: 0.5,
    drums: { kick: "X..x......x.....", snare: "........X.......", clap: "........x.......", closedHat: "X.X.X.X.X.X.X.X.", openHat: "...........-....", perc: "......-........." },
    hatRolls: 0.5, tripletRolls: true, slides: 0.15, heavy808: true, sounds: { lead: "bells", chords: "dark-piano", bass: "808-dist" },
    melody: { mode: "motif", range: [62, 82] }, chordStyle: "sustain", progressions: TENSE, layout: "standard",
    keywords: /\b(chicago ?drill|chi ?drill|chief ?keef|king ?von|lil ?durk|g ?herbo)\b/,
  },
  {
    id: "sexy-drill", label: "Sexy drill", family: "Drill", description: "Drill sur des samples R&B des années 2000 (Cash Cobain) : guitare et piano électrique chauds, drill rebondie, 808 qui glisse.",
    genre: "drill", bpm: [138, 142, 146], swing: 0, scales: ["minor", "dorian"], mood: "romantic", energy: 0.7, complexity: 0.55,
    drums: { kick: "X.........x..o..", snare: "....X.......X...", clap: "....x.......x...", closedHat: "X..X..X.X..X..X.", openHat: "........-.......", perc: "..-.......-....." },
    hatRolls: 0.3, tripletRolls: true, bassGrid: "X.........x..o..", slides: 0.5, sounds: { lead: "guitar-electric", chords: "suitcase", bass: "808-drill" },
    melody: { mode: "motif", range: [62, 81] }, chordStyle: "stabs", chordSize: 4, progressions: LOVE, layout: "hookFirst", drumKit: "trap-hybrid",
    keywords: /\b(sexy ?drill|cash ?cobain|bay ?swag)\b/,
  },
  {
    id: "afro-drill", label: "Afro drill", family: "Drill", description: "Drill + percussions africaines : charleys en triolets, congas et shakers réels, kalimba ou guitare, 808 drill.",
    genre: "drill", bpm: [138, 142, 146], swing: 6, scales: ["minor"], mood: "dark", energy: 0.8, complexity: 0.6,
    drums: { kick: "X..o......x..o..", snare: "....X.......X...", clap: "....x.......x...", closedHat: "X..X..X.X..X..X.", openHat: "................", perc: "..x..x....x..x.x" },
    hatRolls: 0.3, tripletRolls: true, bassGrid: "X..o......x..o..", slides: 0.5, sounds: { lead: "kalimba", chords: "dark-piano", bass: "808-drill" },
    melody: { mode: "motif", range: [64, 83] }, chordStyle: "stabs", progressions: DARK, layout: "standard", drumKit: "afro",
    keywords: /\b(afro ?drill)\b/,
  },
  {
    id: "jersey", label: "Jersey club / Jersey drill", family: "Club / Latin", description: "Kicks en rebond (5 coups), claps rapides, énergie dansante, tempo ~145.",
    genre: "drill", bpm: [138, 145, 150], swing: 0, scales: ["minor"], mood: "aggressive", energy: 0.9, complexity: 0.55,
    drums: { kick: "X..X..X.X..X..X.", snare: "....X.......X...", clap: "....X..x....X...", closedHat: "X.X.X.X.X.X.X.X.", openHat: "..............x.", perc: "..x.......x....." },
    hatRolls: 0.2, tripletRolls: true, slides: 0.2, sounds: { lead: "synth-pluck", chords: "warm-pad", bass: "808-short" },
    melody: { mode: "bounce", range: [64, 84] }, chordStyle: "stabs", progressions: DARK, layout: "short",
    keywords: /\b(jersey|jersey ?club|jersey ?drill|bed ?squeak)\b/,
  },
  // ---------------------------------------------------------------- AFRO
  {
    id: "afrobeats", label: "Afrobeats", family: "Afro", description: "Nigeria (Burna Boy, Wizkid) : percussions chaloupées, swing, guitare/kalimba, basse ronde.",
    genre: "afrobeat", bpm: [98, 105, 112], swing: 18, scales: ["minor", "major"], mood: "happy", energy: 0.7, complexity: 0.55,
    drums: { kick: "X.....o...X.....", snare: "....x.......x...", clap: ".......o.......-", closedHat: "o.X.o.X.o.X.o.X.", openHat: ".......o........", perc: "...x.x...x.x...o" },
    hatRolls: 0, slides: 0, sounds: { lead: "kalimba", chords: "rnb-rhodes", bass: "afro-bass" },
    melody: { mode: "motif", range: [64, 81] }, chordStyle: "stabs", progressions: HAPPY, layout: "standard",
    keywords: /\b(afro ?beats?|afrobeat|naija|burna|wizkid|davido|rema|asake)\b/,
  },
  {
    id: "afro-trap", label: "Afro trap", family: "Afro", description: "Afro + trap à la française (MHD) : percussions afro, charleys trap, 808.",
    genre: "afrobeat", bpm: [96, 102, 110], swing: 12, scales: ["minor"], mood: "happy", energy: 0.8, complexity: 0.6,
    drums: { kick: "X.....x...X.....", snare: "....X.......X...", clap: "....x.......x...", closedHat: "X-X-X-X-X-X-X-X-", openHat: ".......-........", perc: "...x.x...x.x...o" },
    hatRolls: 0.3, slides: 0.15, sounds: { lead: "afro-lead", chords: "warm-pad", bass: "808-trap" },
    melody: { mode: "motif", range: [64, 83] }, chordStyle: "stabs", progressions: HAPPY, layout: "short",
    keywords: /\b(afro ?trap|mhd)\b/,
  },
  {
    id: "amapiano", label: "Amapiano", family: "Afro", description: "Afrique du Sud (Kabza De Small, Focalistic) : kick 4/4, shakers, log drum qui rebondit et glisse, accords de piano jazzy (7e, 9e) en stabs syncopés.",
    genre: "afrobeat", bpm: [110, 113, 116], swing: 14, scales: ["dorian", "minor"], mood: "chill", energy: 0.65, complexity: 0.55,
    drums: { kick: "X...X...X...X...", snare: "................", clap: "....X.......X...", closedHat: "xoxoxoxoxoxoxoxo", openHat: "..o...o...o...X.", perc: "...x..x.-..x..x." },
    hatRolls: 0, bassGrid: "X..x..x...x.x..o", bassMode: "log", slides: 0.4, sounds: { lead: "grand", chords: "wurli", bass: "log-drum" },
    melody: { mode: "sparse", range: [67, 86], density: 0.45 }, chordStyle: "stabs", chordSize: 4, chordHits: [0, 3, 6, 10, 13], progressions: JAZZY, layout: "long",
    keywords: /\b(amapiano|piano ?piano|log ?drum|kabza|focalistic|asake ?amapiano)\b/,
  },
  {
    id: "amapiano-private", label: "Amapiano « private school »", family: "Afro", description: "La version douce et jazzy (Kelvin Momo, Mhaw Keys) : log drum profond, saxophone, accords de 9e, plus lent et plus aéré.",
    genre: "afrobeat", bpm: [108, 111, 113], swing: 16, scales: ["dorian", "major"], mood: "romantic", energy: 0.5, complexity: 0.65,
    drums: { kick: "X...X...X...X...", snare: "................", clap: "....x.......x...", closedHat: "-o-o-o-o-o-o-o-o", openHat: "..-...o...-...o.", perc: "......x.......x." },
    hatRolls: 0, bassGrid: "X.....x...x.....", bassMode: "log", slides: 0.5, sounds: { lead: "sax", chords: "grand", bass: "log-drum-deep" },
    melody: { mode: "sparse", range: [62, 81], density: 0.35 }, chordStyle: "stabs", chordSize: 5, chordHits: [0, 6, 10], progressions: JAZZY, layout: "long", drumKit: "amapiano",
    keywords: /\b(private ?school|kelvin ?momo|mhaw ?keys|soulful ?amapiano|amapiano ?(doux|jazz))\b/,
  },
  {
    id: "afro-house", label: "Afro house", family: "Afro", description: "Club africain (Black Coffee, Keinemusik) : kick 4/4, congas et shakers, accords profonds, groove hypnotique.",
    genre: "afrobeat", bpm: [118, 122, 125], swing: 8, scales: ["minor", "dorian"], mood: "chill", energy: 0.7, complexity: 0.5,
    drums: { kick: "X...X...X...X...", snare: "................", clap: "....X.......X...", closedHat: "..X...X...X...X.", openHat: "......-.......o.", perc: "x..x..x...x..x.." },
    hatRolls: 0, bassGrid: "X.....x...X.....", slides: 0, sounds: { lead: "kalimba", chords: "warm-pad", bass: "sub-sine" },
    melody: { mode: "sparse", range: [64, 84], density: 0.4 }, chordStyle: "stabs", chordSize: 4, chordHits: [2, 6, 10, 14], progressions: JAZZY, layout: "long", drumKit: "afro",
    keywords: /\b(afro ?house|black ?coffee|keinemusik|afro ?tech)\b/,
  },
  {
    id: "gqom", label: "Gqom", family: "Afro", description: "Durban : kick cassé et lourd, pas de charleys continus, toms sombres, ambiance brute et hypnotique.",
    genre: "afrobeat", bpm: [122, 126, 130], swing: 0, scales: ["phrygian", "minor"], mood: "dark", energy: 0.85, complexity: 0.45,
    drums: { kick: "X..X..X...X..X..", snare: "........X.......", clap: "....x.......x...", closedHat: "................", openHat: "..-.......-.....", perc: "...x......x..x.." },
    hatRolls: 0, slides: 0, sounds: { lead: "dark-piano", chords: "dark-pad", bass: "sub-sine" },
    melody: { mode: "sparse", range: [55, 72], density: 0.3 }, chordStyle: "sustain", progressions: TENSE, layout: "long", drumKit: "live",
    keywords: /\b(gqom|durban|dj ?lag)\b/,
  },
  {
    id: "coupe-decale", label: "Coupé-décalé", family: "Afro", description: "Côte d'Ivoire (DJ Arafat, Serge Beynaud) : tempo rapide, caisse claire sèche, percussions qui roulent, guitare et synthés joyeux.",
    genre: "afrobeat", bpm: [122, 128, 134], swing: 6, scales: ["major", "minor"], mood: "happy", energy: 0.9, complexity: 0.6,
    drums: { kick: "X...X...X...X...", snare: "....X.......X...", clap: "....x.......x..-", closedHat: "XxXxXxXxXxXxXxXx", openHat: "..o...o...o...o.", perc: "x.xx.x.xx.x.xx.x" },
    hatRolls: 0, bassGrid: "X..x..X.X..x..X.", slides: 0, sounds: { lead: "afro-guitar", chords: "bright-piano", bass: "bass-electric" },
    melody: { mode: "bounce", range: [64, 86] }, chordStyle: "stabs", progressions: HAPPY, layout: "short", drumKit: "afro",
    keywords: /\b(coup[ée] ?d[ée]cal[ée]|arafat|serge ?beynaud|ivoir)\b/,
  },
  {
    id: "afroswing", label: "Afroswing (UK)", family: "Afro", description: "Londres : dancehall + afrobeats, rythme syncopé, ambiance chaude.",
    genre: "afrobeat", bpm: [98, 102, 108], swing: 16, scales: ["minor"], mood: "romantic", energy: 0.65, complexity: 0.5,
    drums: { kick: "X..x....X.......", snare: "......X.......x.", clap: "...x..x....x..x.", closedHat: "X.X.X.X.X.X.X.X.", openHat: "................", perc: "..x.......x....." },
    hatRolls: 0, slides: 0.1, sounds: { lead: "afro-lead", chords: "rnb-rhodes", bass: "808-clean" },
    melody: { mode: "motif", range: [64, 81] }, chordStyle: "stabs", progressions: LOVE, layout: "standard",
    keywords: /\b(afro ?swing|j ?hus|not3s|kojo ?funds)\b/,
  },
  // ---------------------------------------------------------------- OLD SCHOOL
  {
    id: "boombap", label: "Boom bap", family: "Old school", description: "Années 90 : kick/snare francs sur 2 et 4, swing, piano ou cordes samplés, basse discrète.",
    genre: "boombap", bpm: [85, 90, 96], swing: 28, scales: ["minor", "dorian"], mood: "dark", energy: 0.65, complexity: 0.5,
    drums: { kick: "X......x.x....-.", snare: "....X.......X..-", clap: "................", closedHat: "X.X.X.X.X.X.X.X-", openHat: "..............-.", perc: "...........-...." },
    hatRolls: 0, slides: 0, sounds: { lead: "dark-piano", chords: "strings", bass: "synth-bass" },
    melody: { mode: "sparse", range: [60, 79] }, chordStyle: "sustain", progressions: DARK, layout: "long",
    keywords: /\b(boom ?bap|old ?school|oldschool|90s|nas|wu ?tang|dilla|premier)\b/,
  },
  {
    id: "lofi", label: "Lo-fi hip-hop", family: "Old school", description: "Détendu et chaleureux : Rhodes jazzy, swing important, drums feutrés.",
    genre: "lofi", bpm: [75, 82, 90], swing: 32, scales: ["dorian"], mood: "chill", energy: 0.45, complexity: 0.45,
    drums: { kick: "X......o.o......", snare: "....X.......X...", clap: "................", closedHat: "x.x.x.x.x.x.x.xo", openHat: "................", perc: "..........-....." },
    hatRolls: 0, slides: 0, sounds: { lead: "lofi-keys", chords: "lofi-keys", bass: "sub-sine" },
    melody: { mode: "sparse", range: [64, 81] }, chordStyle: "sustain", progressions: JAZZY, layout: "long",
    keywords: /\b(lo-?fi|chill ?hop|study|nujabes)\b/,
  },
  {
    id: "jazz-rap", label: "Jazz rap", family: "Old school", description: "Boom bap jazzy : vibraphone, accords 7e/9e, swing.",
    genre: "boombap", bpm: [86, 92, 98], swing: 30, scales: ["dorian"], mood: "chill", energy: 0.55, complexity: 0.6,
    drums: { kick: "X......x.x......", snare: "....X.......X...", clap: "................", closedHat: "X.XxX.XxX.XxX.Xx", openHat: "................", perc: "................" },
    hatRolls: 0, slides: 0, sounds: { lead: "vibes", chords: "suitcase", bass: "synth-bass" },
    melody: { mode: "motif", range: [64, 84] }, chordStyle: "stabs", progressions: JAZZY, layout: "long",
    keywords: /\b(jazz|jazzy|jazz ?rap|tribe|madlib)\b/,
  },
  // ---------------------------------------------------------------- R&B / CHILL
  {
    id: "rnb", label: "R&B", family: "R&B / Chill", description: "Sensuel : Rhodes, groove posé, claps sur 2 et 4, basse ronde.",
    genre: "rnb", bpm: [68, 75, 85], swing: 14, scales: ["dorian", "major"], mood: "romantic", energy: 0.5, complexity: 0.5,
    drums: { kick: "X.........X....-", snare: "................", clap: "....X.......X...", closedHat: "X.x.X.x.X.x.X.x-", openHat: "..............-.", perc: "...........-...." },
    hatRolls: 0.1, slides: 0.15, sounds: { lead: "rnb-rhodes", chords: "rnb-rhodes", bass: "808-clean" },
    melody: { mode: "sustain", range: [64, 81] }, chordStyle: "sustain", progressions: LOVE, layout: "standard",
    keywords: /\b(r ?& ?b|rnb|soul|sensual|sensuel)\b/,
  },
  {
    id: "trap-soul", label: "Trap soul", family: "R&B / Chill", description: "Trap lente et chantée (Bryson Tiller) : charleys trap, accords R&B, 808 longue.",
    genre: "rnb", bpm: [60, 70, 80], swing: 8, scales: ["minor", "dorian"], mood: "romantic", energy: 0.5, complexity: 0.55,
    drums: { kick: "X......x..x.....", snare: "........X.......", clap: "........X.......", closedHat: "X-X-X-X-X-XoX-X-", openHat: "................", perc: "................" },
    hatRolls: 0.5, slides: 0.3, sounds: { lead: "rnb-rhodes", chords: "warm-pad", bass: "808-long" },
    melody: { mode: "sustain", range: [62, 79] }, chordStyle: "sustain", progressions: LOVE, layout: "standard",
    keywords: /\b(trap ?soul|bryson|6lack|the ?weeknd|weeknd|pnd)\b/,
  },
  // ---------------------------------------------------------------- CLUB / LATIN
  {
    id: "kompa", label: "Kompa (konpa)", family: "Caraïbes", description: "Haïti (Carimi, T-Vice, Kenny Haiti) : groove chaloupé, cloche continue, guitare en riffs, claviers, basse ronde.",
    genre: "dancehall", bpm: [95, 104, 118], swing: 10, scales: ["major", "minor"], mood: "romantic", energy: 0.6, complexity: 0.55,
    drums: { kick: "X.....x.X.....x.", snare: "....X.......X...", clap: "................", closedHat: "x.xxx.xxx.xxx.xx", openHat: "................", perc: "X.x.X.x.X.x.X.x." },
    hatRolls: 0, bassGrid: "X..x..x.X..x..x.", slides: 0, sounds: { lead: "guitar-electric", chords: "organ", bass: "bass-electric" },
    melody: { mode: "motif", range: [62, 84] }, chordStyle: "stabs", chordSize: 4, chordHits: [0, 3, 6, 8, 11, 14], progressions: LOVE, layout: "long", drumKit: "dancehall",
    keywords: /\b(kompa|konpa|compas|ha[iï]ti|carimi|t-?vice|kenny ?haiti|gouyad)\b/,
  },
  {
    id: "zouk", label: "Zouk", family: "Caraïbes", description: "Antilles (Kassav', Kalash, Tayc) : rythme tibwa syncopé, accords doux et romantiques, basse qui chante.",
    genre: "dancehall", bpm: [88, 94, 100], swing: 8, scales: ["minor", "major"], mood: "romantic", energy: 0.55, complexity: 0.5,
    drums: { kick: "X..x..x.X..x..x.", snare: "......X.......X.", clap: "...x..x....x..x.", closedHat: "x.x.x.x.x.x.x.x.", openHat: "................", perc: "x..x..x.x..x..x." },
    hatRolls: 0, bassGrid: "X..x..x.X..x....", slides: 0.1, sounds: { lead: "guitar-nylon", chords: "wurli", bass: "bass-electric" },
    melody: { mode: "motif", range: [62, 81] }, chordStyle: "stabs", chordSize: 4, progressions: LOVE, layout: "standard", drumKit: "dancehall",
    keywords: /\b(zouk|kassav|kalash|antilles|martinique|guadeloupe|tayc)\b/,
  },
  {
    id: "dancehall", label: "Dancehall", family: "Club / Latin", description: "Jamaïque : rythme 3+3+2, percussions, ambiance festive.",
    genre: "dancehall", bpm: [92, 100, 108], swing: 8, scales: ["minor"], mood: "happy", energy: 0.75, complexity: 0.5,
    drums: { kick: "X.......X.......", snare: "...X.......X....", clap: "......X.......X.", closedHat: "X.X.X.X.X.X.X.X.", openHat: "................", perc: "..o..o....o..o.." },
    hatRolls: 0, slides: 0, sounds: { lead: "synth-pluck", chords: "warm-pad", bass: "808-clean" },
    melody: { mode: "motif", range: [64, 81] }, chordStyle: "stabs", progressions: HAPPY, layout: "standard",
    keywords: /\b(dancehall|shatta|bashment|vybz)\b/,
  },
  {
    id: "reggaeton", label: "Reggaeton", family: "Club / Latin", description: "Dembow (kick 4/4 + snare 3+3+2), synthés latins, très dansant.",
    genre: "dancehall", bpm: [88, 95, 100], swing: 0, scales: ["minor"], mood: "romantic", energy: 0.8, complexity: 0.45,
    drums: { kick: "X...X...X...X...", snare: "...x..x....x..x.", clap: "...X..X....X..X.", closedHat: "X.X.X.X.X.X.X.X.", openHat: "................", perc: "......-.......-." },
    hatRolls: 0, slides: 0, sounds: { lead: "synth-pluck", chords: "warm-pad", bass: "808-short" },
    melody: { mode: "motif", range: [64, 81] }, chordStyle: "stabs", progressions: [[0, 5, 2, 6], [5, 3, 0, 4]], layout: "short",
    keywords: /\b(reggaeton|dembow|perreo|bad ?bunny|latin ?pop)\b/,
  },
  {
    id: "latin-trap", label: "Latin trap", family: "Club / Latin", description: "Trap + guitare espagnole, mode phrygien, ambiance sombre et chaude.",
    genre: "trap", bpm: [130, 140, 150], swing: 0, scales: ["phrygian", "harmonicMinor"], mood: "dark", energy: 0.75, complexity: 0.5,
    drums: { kick: "X......x..x.....", snare: "........X.......", clap: "........x.......", closedHat: "X-X-X-X-X-X-X-X-", openHat: "...............-", perc: "................" },
    hatRolls: 0.4, slides: 0.2, sounds: { lead: "harp", chords: "pluck", bass: "808-trap" },
    melody: { mode: "motif", range: [62, 81] }, chordStyle: "arp", progressions: [[0, 1, 0, 6], [0, 6, 5, 1]], layout: "standard",
    keywords: /\b(latin ?trap|spanish ?guitar|guitare ?espagnole|flamenco|anuel)\b/,
  },
  // ---------------------------------------------------------------- POP / ALTERNATIF
  {
    id: "pop-rap", label: "Pop rap", family: "Pop / Alternatif", description: "Accessible et radio : majeur, accords clairs, refrain entêtant.",
    genre: "pop", bpm: [95, 105, 120], swing: 0, scales: ["major"], mood: "happy", energy: 0.7, complexity: 0.45,
    drums: { kick: "X.......X.o.....", snare: "....X.......X...", clap: "....X.......X...", closedHat: "X.X.X.X.X.X.X.X.", openHat: "...............o", perc: "................" },
    hatRolls: 0, slides: 0, sounds: { lead: "synth-pluck", chords: "grand", bass: "808-clean" },
    melody: { mode: "motif", range: [64, 81] }, chordStyle: "sustain", progressions: HAPPY, layout: "hookFirst",
    keywords: /\b(pop ?rap|pop|commercial|radio|mainstream)\b/,
  },
  {
    id: "hyperpop", label: "Hyperpop", family: "Pop / Alternatif", description: "Excessif et brillant : supersaw, tempo rapide, 808 saturée, énergie digitale.",
    genre: "pop", bpm: [150, 160, 175], swing: 0, scales: ["major", "lydian"], mood: "happy", energy: 0.95, complexity: 0.65,
    drums: { kick: "X...X..xX...X...", snare: "....X.......X...", clap: "....X.......X..x", closedHat: "XxXxXxXxXxXxXxXx", openHat: "................", perc: "...........x...." },
    hatRolls: 0.3, slides: 0.2, heavy808: true, sounds: { lead: "supersaw", chords: "supersaw", bass: "808-dist" },
    melody: { mode: "arp", range: [67, 91] }, chordStyle: "sustain", progressions: HAPPY, layout: "short",
    keywords: /\b(hyperpop|hyper ?pop|glitch|100 ?gecs|digicore)\b/,
  },
];

export const STYLE_FAMILIES = [...new Set(STYLES.map((s) => s.family))];

export function styleById(id: string): StyleDef {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

/** Default style of a broad genre (older settings, simple pickers). */
export function styleForGenre(g: Genre): StyleDef {
  const map: Record<Genre, string> = { trap: "trap", drill: "uk-drill", afrobeat: "afrobeats", boombap: "boombap", rnb: "rnb", lofi: "lofi", dancehall: "dancehall", pop: "pop-rap" };
  return styleById(map[g]);
}

/**
 * Detect a style in free text. Specific styles (love drill, drift phonk, pluggnb, afro trap,
 * trap soul…) are tested before generic ones (drill, phonk, plugg, afro, trap).
 */
export function detectStyle(text: string): StyleDef | null {
  const t = ` ${text.toLowerCase().replace(/[,.;!?]/g, " ")} `;
  const order = ["chicago-drill", "sexy-drill", "afro-drill", "love-drill", "drill-fr", "ny-drill", "uk-drill", "jersey", "drift-phonk", "phonk", "pluggnb", "plugg", "afro-trap", "afroswing", "amapiano-private", "amapiano", "afro-house", "gqom", "coupe-decale", "kompa", "zouk", "afrobeats",
    "trap-soul", "latin-trap", "orchestral-trap", "trap-fr", "dark-trap", "mumble", "rage", "cloud", "guitar-trap", "emo", "detroit", "hyperpop", "reggaeton", "dancehall", "jazz-rap", "lofi", "boombap", "rnb", "pop-rap", "trap"];
  for (const id of order) {
    if (styleById(id).keywords.test(t)) return styleById(id);
    // Generic words, checked once their specific variants have had their chance.
    if (id === "uk-drill" && /\bdrill\b/.test(t)) return styleById("uk-drill");
    if (id === "afrobeats" && /\bafro\b/.test(t)) return styleById("afrobeats");
  }
  return null;
}

/** Parse a 16-char grid into probabilities. */
export function parseGrid(g: GridString | undefined): number[] {
  const map: Record<string, number> = { X: 1, x: 0.8, o: 0.5, "-": 0.25, ".": 0 };
  const s = (g ?? "").padEnd(16, ".").slice(0, 16);
  return [...s].map((c) => map[c] ?? 0);
}

/** Onset positions (0–15) of a melody rhythm grid. */
export function gridOnsets(g: GridString): number[] {
  return [...g.padEnd(16, ".").slice(0, 16)].flatMap((c, i) => (c !== "." ? [i] : []));
}

/**
 * Drum kit of each style. Trap / drill drums are electronic by nature (808 machines); afro,
 * amapiano, boom bap, R&B and Caribbean styles get recorded percussion.
 */
export const STYLE_DRUM_KITS: Record<string, string> = {
  pluggnb: "trap-hybrid", emo: "trap-hybrid", "trap-fr": "trap-hybrid", "love-drill": "trap-hybrid", "drill-fr": "trap-hybrid",
  jersey: "trap-hybrid", "trap-soul": "trap-hybrid", "latin-trap": "trap-hybrid", "pop-rap": "trap-hybrid", "afro-trap": "afro",
  afrobeats: "afro", afroswing: "afro", amapiano: "amapiano",
  boombap: "boombap", lofi: "boombap", "jazz-rap": "live",
  rnb: "rnb",
  dancehall: "dancehall", reggaeton: "dancehall",
};

export function styleDrumKit(style: StyleDef): string {
  return style.drumKit ?? STYLE_DRUM_KITS[style.id] ?? "synth";
}
