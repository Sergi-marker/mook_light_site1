// Texte → scènes. Module pur (aucun accès au DOM) : testable sous Node.
//
// Règles :
//  - une ligne qui commence par « # » devient un carton de titre ;
//  - le reste est découpé en phrases (. ! ? … et retours à la ligne) ;
//  - une phrase trop longue pour un sous-titre est recoupée aux virgules / points-virgules ;
//  - « [action] » en début de phrase impose l'animation (ex. « [rire] Pourtant tu rigoles. ») ;
//  - sinon l'animation est déduite des mots de la phrase (français, allemand, anglais, espagnol…).

import { ACTIONS } from "./poses.js";

/** Mots-clés (sans accents, en minuscules) → action. Le premier qui correspond gagne, dans l'ordre du tableau. */
export const KEYWORDS = [
  ["mock", ["moque", "moquer", "se moquent", "ridicul", "humili", "lacht dich aus", "auslachen", "verspott", "mock", "make fun", "laugh at", "burla", "se rien de"]],
  ["laugh", ["rigol", "rire", " rit ", " ris ", "riant", "drole", "marrant", "humour", "blague", "lach", "witz", "lustig", "laugh", "funny", "joke", "lol", "haha", "reir", "risa", "gracioso"]],
  ["cry", ["pleur", "larme", "sanglot", "wein", "trane", "cry", "tears", "sob", "llor", "lagrima"]],
  ["sad", ["triste", "tristesse", "chagrin", "peine", "deprim", "melancol", "malheureu", "souffr", "douleur", " blesse", "brise", " vide", "traurig", "trauer", "schmerz", "leer", "verletzt", "sad", "sorrow", "grief", " pain ", "hurt", "broken", "empty", "depress", "dolor", "vacio"]],
  ["alone", [" seul ", " seule ", " seuls", " seules", "solitude", "isole", "personne ne", "abandon", "silence", "allein", "einsam", "niemand", "stille", "alone", "lonely", "loneliness", "nobody", "isolated", "solo", "soledad", "nadie"]],
  ["angry", ["colere", "enerv", "furieu", " rage", "haine", "deteste", "agace", "wut", "wutend", "sauer", "hass", "argerlich", "angry", "anger", "furious", "hate", "mad at", "enojo", "furia", "odio"]],
  ["argue", ["dispute", "conflit", "engueul", "se battre", "bagarre", "streit", "konflikt", "argue", "fight", "conflict", "pelea", "discut"]],
  ["hug", ["calin", "serrer dans", "etreint", "embrass", "consol", "umarm", "trost", "hug", "embrace", "comfort", "abrazo", "consuel"]],
  ["love", ["amour", " aime ", " aimes ", "aimer", "'aime", "coeur", "couple", "tendresse", "liebe", "lieb", "herz", "love", "heart", "darling", "amor", "corazon", "querer"]],
  ["talk", ["parle", "parler", "discute", " dire ", "dit ", "dis-", "conversation", "explique", "ecoute", "repond", "demande", "sprech", "rede", "sagt", "erklar", "zuhor", " frag", "talk", "speak", " say", "tell", "explain", "listen", " ask", "conversation", "habl", "decir", "escuch"]],
  ["point", ["accuse", "juge", "jugement", "critiqu", "regard des autres", "pointe", "beschuldig", "urteil", "kritik", "judge", "blame", "criticiz", "point at", "juzg", "culpa"]],
  ["ignore", ["ignore", "ignorer", "tourne le dos", "indifferen", "ghost", "ignorier", "gleichgult", "turn away", "indiferen"]],
  ["think", [" pense", "repense", "penser", "pensee", "reflechi", "reflexion", "esprit", "mental", "cerveau", "psycholog", "pourquoi", "question", "doute", "denk", "gedank", "nachdenk", "warum", "zweifel", "psycholog", "think", "thought", "mind", "brain", "why", "wonder", "doubt", "pensar", "mente", "por que"]],
  ["confused", ["perdu", "confus", "comprends pas", "comprend pas", "sais plus", "sais pas", "bizarre", "etrange", "verwirr", "verloren", "versteh nicht", "confus", "lost", "don't understand", "dont understand", "strange", "weird", "confund", "perdido"]],
  ["idea", ["idee", "comprendre", "comprends", "compris", "realise", "decouvr", "astuce", "secret", "solution", "verite", "idee", "versteh", "erkenn", "losung", "wahrheit", "idea", "realize", "understand", "discover", "secret", "truth", "solution", " tip", "entend", "verdad", "solucion"]],
  ["lift", ["muscu", "haltere", "souleve", "musculation", "fitness", "gym", "hantel", "kraft", "training", "trainier", "lift", "weight", "strength", "workout", "pesas", "fuerza", "gimnasio"]],
  ["run", ["courir", " cours ", " court ", "course", "course", "courir", "sprint", "fuir", "fuis", " vite", "lauf", " renn", "sprint", "flieh", "schnell", " run", "running", "sprint", "flee", " fast", " corr", "huir", "rapido"]],
  ["exercise", ["sport", "entrain", "echauffe", "squat", "pompe", "etire", "athlet", "uebung", "ubung", "dehn", "exercise", "stretch", "squat", "push-up", "pushup", "athlete", "ejercicio", "estir"]],
  ["meditate", ["medit", "respire", "respiration", "calme", "paix", "zen", "serenit", "detend", "yoga", "atme", "ruhe", "frieden", "entspann", "meditat", "breath", "calm", "peace", "relax", "respir", "paz", "tranquil"]],
  ["celebrate", ["victoire", "gagne", "reussi", "reussite", "bravo", " fier", "heureu", "joie", " content", "bonheur", "sieg", "gewonnen", "erfolg", "stolz", "glucklich", "freude", "victory", " win", " won", "success", "proud", "happy", "joy", "victoria", "gane", "ganar", "exito", "feliz", "alegr"]],
  ["tired", ["fatigue", "epuise", "dormir", "sommeil", "nuit", "soir", "lassitude", "mude", "erschopft", "schlaf", "nacht", "abend", "tired", "exhausted", "sleep", "night", "evening", "cansad", "dormir", "noche"]],
  ["phone", ["telephone", "portable", "message", "ecran", "reseaux", "notification", "texto", "handy", "nachricht", "bildschirm", "phone", "text me", "screen", "social media", "notification", "telefono", "mensaje", "pantalla"]],
  ["read", ["histoire", "livre", "lire", " lis ", " conte ", "il etait une fois", "chapitre", "geschichte", "buch", "lesen", "es war einmal", "story", "book", " read", "once upon", "chapter", "historia", "libro", "leer", "erase una vez"]],
  ["sit", ["assis", "asseoir", "attend", "attente", "patience", "banc", "sitz", "wart", "bank", "geduld", " sit ", "wait", "bench", "patience", "sentad", "esper", "banco"]],
  ["walk", ["marche", "avance", "chemin", "partir", " pars ", "quitte", "route", "voyage", "pas a pas", "geh", "weg", "reise", "verlass", "walk", "move on", "path", "leave", "journey", " step", "camin", "viaje", "dejar"]],
  ["shrug", ["peu importe", "tant pis", "bof", "rien a faire", "pas grave", " egal ", "whatever", "doesn't matter", "so what", "da igual", "que mas da"]],
  ["fall", ["tomb", "chute", "echec", " rate ", " rater", "erreur", "fall", "fail", "mistake", "sturz", "fehler", "scheiter", "caer", "fracas", "error"]],
  ["wave", ["bonjour", "salut", "au revoir", "adieu", "bienvenue", "hallo", "tschuss", "willkommen", "hello", " hi ", "bye", "goodbye", "welcome", "hola", "adios", "bienvenid"]],
  ["surprised", ["surpris", "choc", "choque", "incroyable", " oh ", "wow", "uberrasch", "schock", "unglaublich", "surprise", "shock", "incredible", "sorpres", "increible"]],
];

/** Alias acceptés dans « [action] ». */
export const TAG_ALIASES = {
  rire: "laugh", rigole: "laugh", lachen: "laugh", moquerie: "mock", moque: "mock",
  pleure: "cry", pleurer: "cry", weinen: "cry", triste: "sad", traurig: "sad", seul: "alone", allein: "alone",
  colere: "angry", wut: "angry", dispute: "argue", streit: "argue", calin: "hug", umarmung: "hug",
  amour: "love", liebe: "love", parle: "talk", parler: "talk", reden: "talk", accuse: "point", juge: "point",
  pense: "think", reflechit: "think", denken: "think", perdu: "confused", verwirrt: "confused", idee: "idea",
  muscu: "lift", haltere: "lift", court: "run", courir: "run", laufen: "run", sport: "exercise",
  medite: "meditate", respire: "meditate", victoire: "celebrate", joie: "celebrate", fatigue: "tired", mude: "tired",
  telephone: "phone", livre: "read", lire: "read", assis: "sit", attente: "sit", marche: "walk", gehen: "walk",
  bof: "shrug", tombe: "fall", salut: "wave", surpris: "surprised", uberrascht: "surprised", freude: "celebrate", nachdenken: "think", parle2: "speak", ecoute: "listen", zuhoren: "listen", listen: "listen", repos: "idle", titre: "title",
};

/** Retire accents et majuscules pour comparer les mots-clés. */
export function normalize(text) {
  // La ponctuation devient un espace, pour que « court. » ou « seul, » soient reconnus comme des mots.
  return " " + text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").replace(/[.,!?;:…"«»“”()*]/g, " ").replace(/\s+/g, " ") + " ";
}

/** Animation déduite d'une phrase, ou null si aucun mot-clé. */
export function detectAction(text) {
  const n = normalize(text);
  for (const [action, words] of KEYWORDS) {
    if (words.some((w) => n.includes(w))) return action;
  }
  return null;
}

/** Résout un tag « [xxx] » vers un id d'action, ou null. */
export function resolveTag(tag) {
  const k = normalize(tag).trim();
  if (ACTIONS[k]) return k;
  return TAG_ALIASES[k] ?? null;
}

/** Découpe une phrase trop longue en morceaux lisibles (≈ maxWords mots). */
export function splitLong(sentence, maxWords = 14) {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [sentence.trim()];
  // D'abord aux virgules / points-virgules / deux-points.
  const parts = sentence.split(/(?<=[,;:])\s+/);
  const out = [];
  let cur = "";
  for (const p of parts) {
    const candidate = cur ? `${cur} ${p}` : p;
    if (candidate.split(/\s+/).length > maxWords && cur) { out.push(cur); cur = p; } else cur = candidate;
  }
  if (cur) out.push(cur);
  // Puis coupe en blocs réguliers ce qui reste trop long.
  return out.flatMap((chunk) => {
    const w = chunk.split(/\s+/);
    if (w.length <= maxWords) return [chunk.trim()];
    const n = Math.ceil(w.length / maxWords), size = Math.ceil(w.length / n), res = [];
    for (let i = 0; i < w.length; i += size) res.push(w.slice(i, i + size).join(" "));
    return res;
  });
}

/** Petit générateur pseudo-aléatoire déterministe (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Quand rien n'est détecté : alterne des animations neutres pour que la vidéo ne soit jamais figée. */
const NEUTRAL_CYCLE = ["think", "walk", "idle", "talk", "sit", "think", "walk"];

/** Noms qui désignent la voix off (pas un personnage à l'écran). */
const NARRATOR_NAMES = new Set(["narrateur", "narratrice", "narrator", "erzahler", "erzahlerin", "voix off", "voice over", "off"]);

/** Texte sans balises de mise en forme (*mot*), pour la voix et la détection. */
export function plainText(text) {
  return String(text ?? "").replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim();
}

/** « Nom : réplique » → { name, text } (nom de 1 à 3 mots, 24 caractères max), sinon null. */
export function splitSpeaker(line) {
  const m = /^([\p{L}][\p{L}\p{N}' .-]{0,23}?)\s*:\s+(.+)$/u.exec(line);
  if (!m) return null;
  const name = m[1].trim();
  if (name.split(/\s+/).length > 3) return null;
  return { name, text: m[2].trim() };
}

/**
 * Texte complet → liste de scènes.
 * Dialogues : « Lui : … » / « Elle : … ». Un nom n'est reconnu comme personnage que s'il ouvre au moins
 * deux lignes (pour ne pas confondre avec « Règle numéro un : … »). Le premier nom est le personnage 1,
 * le deuxième le personnage 2 ; « Narrateur : … » est la voix off.
 * « [pause] » ou « [pause 2] » seul sur une ligne : un temps de silence (en secondes).
 * @param {string} text
 * @param {{ maxWords?: number, seed?: number }} [opts]
 */
export function parseScript(text, opts = {}) {
  const maxWords = opts.maxWords ?? 14;
  const baseSeed = opts.seed ?? 1;
  const scenes = [];
  let neutral = 0;
  let prevAction = null;
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").map((l) => l.trim());

  // Noms de personnages : ceux qui ouvrent au moins deux lignes.
  const counts = new Map();
  for (const l of lines) {
    const sp = !l.startsWith("#") && splitSpeaker(l.replace(/^\[[^\]]+\]\s*/, ""));
    if (sp) counts.set(normalize(sp.name).trim(), (counts.get(normalize(sp.name).trim()) ?? 0) + 1);
  }
  const speakers = [];
  const speakerIndex = (name) => {
    const k = normalize(name).trim();
    if (NARRATOR_NAMES.has(k)) return null;
    let i = speakers.findIndex((s) => normalize(s).trim() === k);
    if (i < 0) { speakers.push(name); i = speakers.length - 1; }
    return i % 2;
  };

  for (const rawLine of lines) {
    let line = rawLine;
    if (!line) continue;
    if (line.startsWith("#")) {
      const title = line.replace(/^#+\s*/, "").trim();
      if (title) scenes.push({ kind: "title", text: title, action: "idle", auto: true });
      continue;
    }
    const pause = /^\[\s*(?:pause|stille|silence)\s*([\d.,]+)?\s*(?:s|sec)?\s*\]$/i.exec(line);
    if (pause) {
      scenes.push({ kind: "pause", text: "", action: "idle", auto: true, duration: Math.min(10, Math.max(0.3, Number((pause[1] ?? "1").replace(",", ".")) || 1)) });
      continue;
    }
    // Réplique d'un personnage ?
    let speaker = null, speakerName = null;
    const lead = /^\[[^\]]+\]\s*/.exec(line)?.[0] ?? "";
    const sp = splitSpeaker(line.slice(lead.length));
    if (sp && ((counts.get(normalize(sp.name).trim()) ?? 0) >= 2 || NARRATOR_NAMES.has(normalize(sp.name).trim()))) {
      speaker = speakerIndex(sp.name);
      speakerName = speaker == null ? null : sp.name;
      line = lead + sp.text;
    }
    // Phrases : coupe après . ! ? … en gardant la ponctuation ; garde « [tag] » collé à sa phrase.
    const sentences = line.match(/[^.!?…]+(?:[.!?…]+["»”)*]*|$)/g) ?? [line];
    let pendingTag = null;
    for (let s of sentences) {
      s = s.trim();
      if (!s) continue;
      const tagMatch = s.match(/^\[([^\]]+)\]\s*/);
      let forced = pendingTag;
      pendingTag = null;
      if (tagMatch) {
        forced = resolveTag(tagMatch[1]) ?? forced;
        s = s.slice(tagMatch[0].length).trim();
        if (!s) { pendingTag = forced; continue; }
      }
      const chunks = splitLong(s, maxWords);
      // L'action est déduite de la phrase entière, puis gardée sur ses morceaux.
      let action = forced ?? detectAction(plainText(s));
      const auto = !forced;
      if (!action) {
        // En dialogue, celui qui parle fait des gestes ; sinon on varie les animations neutres.
        action = speaker != null ? "speak" : NEUTRAL_CYCLE[neutral++ % NEUTRAL_CYCLE.length];
        if (action === prevAction && speaker == null) action = NEUTRAL_CYCLE[neutral++ % NEUTRAL_CYCLE.length];
      }
      if (action === "title") { scenes.push({ kind: "title", text: s, action: "idle", auto }); continue; }
      for (const c of chunks) {
        const sc = { kind: "scene", text: c, action, auto };
        if (speaker != null) Object.assign(sc, { speaker, speakerName, figures: 2 });
        scenes.push(sc);
      }
      prevAction = action;
    }
  }
  return scenes.map((sc, i) => ({ id: `s${i + 1}`, ...sc, seed: (hashString(sc.text) ^ Math.imul(baseSeed, 2654435761) ^ i) >>> 0 }));
}

/**
 * Ajoute l'accroche d'ouverture et l'écran de fin (réglages de marque) autour des scènes du texte.
 * settings.hook : texte de l'accroche (vide = pas d'accroche) ; settings.outro : texte de fin (vide = pas d'écran de fin).
 */
export function withBrand(scenes, settings = {}) {
  const out = [];
  const hook = String(settings.hook ?? "").trim();
  if (hook) out.push({ id: "hook", kind: "hook", text: hook, action: detectAction(plainText(hook)) ?? "surprised", auto: true, seed: hashString(hook) });
  out.push(...scenes);
  const outro = String(settings.outro ?? "").trim();
  if (outro) out.push({ id: "outro", kind: "outro", text: outro, action: "wave", auto: true, seed: hashString(outro) + 1 });
  return out;
}

/** Durée d'affichage d'une scène (secondes) selon le nombre de mots et la vitesse de lecture (mots/s). */
export function sceneDuration(scene, wordsPerSecond = 2.4) {
  if (scene.duration) return scene.duration;
  const words = plainText(scene.text).split(/\s+/).filter(Boolean).length;
  if (scene.kind === "pause") return 1;
  if (scene.kind === "outro") return 3.2;
  if (scene.kind === "hook") return Math.max(2.2, words / wordsPerSecond + 1.2);
  if (scene.kind === "title") return Math.max(2.5, words / wordsPerSecond + 1.5);
  return Math.max(2.2, words / wordsPerSecond + 1.0);
}

/** Début de la voix off après le début de la scène (s), et silence gardé après elle. */
export const VOICE_LEAD = 0.25;
const VOICE_TAIL = 0.45;

/**
 * Positions de début de chaque scène et durée totale.
 * voiceDurs (optionnel) : durée de la voix off de chaque scène ; une scène dure alors le temps de sa voix.
 */
export function timeline(scenes, wordsPerSecond = 2.4, voiceDurs = null) {
  let t = 0;
  const items = scenes.map((s, i) => {
    const voiceDur = voiceDurs?.[i] ?? null;
    const d = s.duration ?? (voiceDur != null ? Math.max(1.5, VOICE_LEAD + voiceDur + VOICE_TAIL) : sceneDuration(s, wordsPerSecond));
    const item = { scene: s, start: t, duration: d, voiceDur };
    t += d;
    return item;
  });
  return { items, total: t };
}

/** Scène active à l'instant t (secondes). */
export function sceneAt(tl, t) {
  const { items } = tl;
  if (!items.length) return null;
  let lo = 0, hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (items[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return { index: lo, item: items[lo], local: Math.max(0, t - items[lo].start) };
}
