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
  // Nouvelles animations : mots précis, testés avant les émotions générales.
  ["podium", ["podium", "medaille", "champion", "premiere place", "trophee", "podest", "meister", "medal", "first place", "trophy", "podio", "medalla", "campeon"]],
  ["finish", ["ligne d'arrivee", "l'arrivee", "franchir la ligne", "marathon", "fin de la course", "ziellinie", "ins ziel", "finish line", " finish", "cross the line", "linea de meta", " meta "]],
  ["comeback", ["n'abandonne", "abandonner", "abandonne pas", "ne lache rien", "lache rien", "recommence", "reessa", "reessay", "aufgeben", "gib nicht auf", "nicht aufgeben", "weitermachen", "give up", "never quit", "don't quit", "dont quit", "try again", "keep going", "no te rindas", "rendirse", "rendir"]],
  ["pushup", ["pompes", "une pompe", "push-up", "pushup", "push up", "liegestutz", "flexiones"]],
  ["jumprope", ["corde a sauter", "sauter a la corde", "seilspring", "springseil", "jump rope", "skipping rope", "saltar la cuerda", "comba"]],
  ["boxing", ["boxe", "boxer", "sac de frappe", "coup de poing", "uppercut", "boxen", "boxsack", "faustschlag", " box", "boxing", "punching bag", " punch", "boxeo", "puñetazo", "punetazo"]],
  ["plank", ["gainage", "planche", "abdos", "tiens bon", "tenir bon", "endurance", "planke", "durchhalten", "plank", " abs ", "hold on", "endure", "plancha", "aguanta", "resistencia"]],
  ["jumprope", [" sauter", " saute ", "cardio", "springen", " jump", "saltar"]],
  ["mask", ["masque", "faux sourire", "faire semblant", "fais semblant", "font semblant", "apparence", "maske", "fassade", "so tun als", "mask", "fake smile", "pretend", "facade", "mascara", "fingir", "aparenta"]],
  ["chase", ["poursuiv", "courir apres", "court apres", "cours apres", "poursuis tes", "rattraper", "chasser", "atteindre", "jagen", "verfolg", "hinterher", "nachjagen", "chase", "chasing", "pursue", "catch up", "perseguir", "alcanzar"]],
  ["sleep", ["dormir", " dors ", " dort ", "endormi", "sommeil", " reve ", " reves ", " rever", "revant", "cauchemar", "au lit", "mon lit", "son lit", "ton lit", "schlaf", " traum ", "traume", "albtraum", " bett", "asleep", " sleep", " dream", "nightmare", " bed ", "suenos", " sueno", "dormir", "pesadilla", " cama"]],
  ["stargaze", ["etoile", " ciel", "univers", "cosmos", "galaxie", " lune", " sterne", " stern ", "himmel", " mond ", "universum", "galaxie", " star ", " stars", "starry", " sky", " moon", "universe", "galaxy", "estrella", "cielo", " luna", "universo"]],
  ["door", ["la porte", "une porte", "les portes", "cette porte", "porte s'ouvre", " ouvr", "'ouvr", "opportunit", "nouveau depart", "nouveau chapitre", "nouvelle chance", "nouvelle vie", " tur ", " turen", "offne", "neuanfang", "neue chance", "door", " open", "opportunit", "new beginning", "fresh start", "new chapter", "puerta", "abrir", "oportunidad", "nuevo comienzo"]],
  ["stairs", ["escalier", "marche par marche", "etape par etape", "gravir", " sommet", "progresse", "progression", "monter", "treppe", "stufe", "schritt fur schritt", "aufsteig", "gipfel", "stairs", "staircase", " climb", "step by step", "progress", "level up", " summit", "escalera", "paso a paso", "subir", "cima"]],
  ["lamppost", ["lampadaire", "reverbere", "dans la rue", "t'attendre", "attendre quelqu'un", "je t'attends", "laterne", "auf dich warten", "auf jemanden warten", "streetlight", "street light", "lamppost", "waiting for you", "waiting for someone", "farola", "esperarte"]],
  ["heartbreak", ["coeur brise", "rupture", "m'a quitte", "t'a quitte", "separ", "chagrin d'amour", "larguee", "liebeskummer", "herzschmerz", "trennung", "gebrochenes herz", "schluss gemacht", "heartbreak", "broken heart", "breakup", "break up", "broke up", "dumped", "corazon roto", "ruptura", "desamor"]],
  ["leave", ["s'eloign", "s'en va", "s'en aller", "est parti", "est partie", "sont partis", "walked away", "walks away", "left me", "geht weg", "ging weg", "hat mich verlassen", "se fue", "se aleja", "me dejo"]],
  ["rain", ["pluie", " pleut", "orage", "tempete", "nuage", " regen", "gewitter", " sturm", "wolke", " rain", "storm", "thunder", "cloud", "lluvia", "tormenta", " nube"]],
  ["burden", ["poids", "fardeau", "sur les epaules", "charge mentale", "trop lourd", "porter seul", "belast", "gewicht", "auf den schultern", " last ", "burden", "weight on", "heavy", "carry", "carga", " peso"]],
  ["wall", [" mur ", " murs ", "bloque", "obstacle", "impasse", "coince", "mauer", " wand ", "blockiert", "hindernis", "sackgasse", "feststeck", " wall", "stuck", "blocked", "obstacle", "dead end", " muro", "pared", "atascad", "obstaculo"]],
  ["explode", ["explos", "craque", "peter les plombs", "pete un cable", " crie", "hurle", "hurler", "explodier", " schrei", "ausrast", "platz", "explode", "scream", " yell", "shout", "lose it", "lost it", "explot", "grita", "gritar"]],
  ["calm", ["respire", "respiration", "inspire", "expire", "souffle", "calme", "apaise", "atme", "atmen", "durchatm", "beruhig", "breath", "calm down", "inhale", "exhale", "respira", "calma"]],
  ["rise", ["releve-toi", "releve toi", "relevez", "se relev", "me relev", "te relev", "relever", "debout", "se redresse", "rebondi", "aufsteh", "steh auf", "steht auf", "wieder auf", "aufrappeln", "get up", "got up", "stand up", " rise ", "rise again", "bounce back", "back on my feet", "levant", "levanta"]],
  ["mirror", ["miroir", "reflet", "dans la glace", "image de soi", "spiegel", "mirror", "reflection", "self-image", "self image", "espejo", "reflejo"]],
  ["crowd", ["foule", "les gens", "regard des autres", "ce que pensent", "tout le monde te", "le monde entier", "menge", "die leute", "die anderen", "alle schauen", "crowd", "other people", "what people think", "everyone is watching", "everybody", "multitud", "la gente", "los demas"]],
  ["shame", ["honte", "honteu", " gene ", " genee", "embarrass", "culpabil", "humilie", "scham", "schame", "peinlich", "schuldig", "shame", "ashamed", "embarrass", "guilt", "verguenza", "culpable"]],
  ["anxious", ["anxi", "angoiss", "stress", "panique", "inquiet", "nerveu", " peur", "crainte", " angst", "panik", "nervos", " sorge", "besorgt", "anxious", "anxiety", "panic", "worried", "worry", "nervous", " fear", "scared", "afraid", "ansied", "miedo", "nervios", "preocup"]],
  ["puppet", ["manipul", "marionnette", "tire les ficelles", "toxique", "pervers", "emprise", "controle", "marionette", "kontroll", "toxisch", "puppet", "pulls the strings", "toxic", "gaslight", "control", "titere", "toxico"]],
  ["whisper", ["chuchot", "murmur", "secret", "confie", "a l'oreille", "entre nous", "flust", "geheimnis", "verrat dir", "whisper", "secret", "confide", "between us", "susurr", "secreto"]],
  ["highfive", ["tope la", "bien joue", "en equipe", "equipe", "ensemble", "complice", " ami ", " amis ", " amie ", "amitie", "abklatsch", " team", "zusammen", "freund", "high five", "teamwork", "together", "friend", "buddy", "equipo", "juntos", " amig"]],
  ["backtoback", ["dos a dos", "ne se parlent plus", "se parlent plus", "boude", "rancune", "froid entre", "fache", "rucken an rucken", "schweigen sich", "beleidigt", "back to back", "not speaking", "silent treatment", "sulk", "resent", "espalda con espalda", "rencor"]],
  ["reach", ["main tendue", "tendre la main", "tend la main", "tends la main", "tends-lui", " aider", " aide ", "aide-moi", "soutien", "soutenir", " hilf", "helfen", "unterstutz", " help", "helping hand", "support", "reach out", "ayud", "apoyo"]],
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
  ["idea", ["idee", "comprendre", "comprends", "compris", "realise", "decouvr", "astuce", "solution", "verite", "idee", "versteh", "erkenn", "losung", "wahrheit", "idea", "realize", "understand", "discover", "truth", "solution", " tip", "entend", "verdad", "solucion"]],
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
  anxieux: "anxious", stress: "anxious", angst: "anxious", honte: "shame", scham: "shame", pluie: "rain", regen: "rain",
  coeurbrise: "heartbreak", rupture: "heartbreak", masque: "mask", maske: "mask", poids: "burden", fardeau: "burden", last: "burden",
  mur: "wall", mauer: "wall", explose: "explode", explosion: "explode", respire2: "calm", calme: "calm", atmen: "calm",
  releve: "rise", aufstehen: "rise", miroir: "mirror", spiegel: "mirror", foule: "crowd", menge: "crowd",
  aide: "reach", hilfe: "reach", eloigne: "leave", depart: "leave", dosados: "backtoback", check: "highfive", highfive: "highfive",
  chuchote: "whisper", secret: "whisper", flustern: "whisper", manipulation: "puppet", marionnette: "puppet",
  pompes: "pushup", liegestutze: "pushup", corde: "jumprope", seilspringen: "jumprope", boxe: "boxing", boxen: "boxing",
  gainage: "plank", planche: "plank", planke: "plank", arrivee: "finish", ziel: "finish", podest: "podium",
  abandon: "comeback", aufgeben: "comeback", dormir: "sleep", dort: "sleep", schlafen: "sleep", reve: "sleep", traum: "sleep",
  porte: "door", tur: "door", escalier: "stairs", treppe: "stairs", lampadaire: "lamppost", laterne: "lamppost",
  poursuite: "chase", jagen: "chase", etoiles: "stargaze", sterne: "stargaze", stars: "stargaze",
  bof: "shrug", tombe: "fall", salut: "wave", surpris: "surprised", uberrascht: "surprised", freude: "celebrate", nachdenken: "think", parle2: "speak", ecoute: "listen", zuhoren: "listen", listen: "listen", repos: "idle", titre: "title",
};

/** Retire accents et majuscules pour comparer les mots-clés. */
export function normalize(text) {
  // La ponctuation devient un espace, pour que « court. » ou « seul, » soient reconnus comme des mots.
  return " " + text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/ß/g, "ss").replace(/[’']/g, "'").replace(/[.,!?;:…"«»“”()*]/g, " ").replace(/\s+/g, " ") + " ";
}

/** Animation déduite d'une phrase, ou null si aucun mot-clé. */
export function detectAction(text) {
  const n = normalize(text);
  for (const [action, words] of KEYWORDS) {
    if (words.some((w) => n.includes(w))) return action;
  }
  return null;
}

/** Effets de mise en scène déduits des mots (le premier qui correspond gagne). */
export const FX_KEYWORDS = [
  ["slow", ["au ralenti", "ralenti", "lentement", "le temps s'arrete", "le temps s'est arrete", "temps suspendu", "zeitlupe", "langsam", "die zeit steht still", "die zeit stand still", "slow motion", "slowly", "time stopped", "time stood still", "camara lenta", "lentamente", "el tiempo se detuvo"]],
  ["flash", ["soudain", "tout a coup", "tout d'un coup", "d'un coup", " boom", " bam ", "coup de foudre", "eclair", "explos", "plotzlich", "auf einmal", " blitz", " knall", "suddenly", "all of a sudden", " bang ", "lightning", "de repente", " rayo", "explot"]],
  ["shake", ["tremble", "seisme", "secou", "fracas", " bebt", "erdbeben", "zitter", "erschutter", " shake", "shaking", "earthquake", "tiembla", "terremoto"]],
  ["dark", ["dans le noir", "obscurit", "tenebres", "s'eteint", "lumiere s'eteint", "plus de lumiere", "im dunkeln", "dunkelheit", "finster", "licht aus", "darkness", "in the dark", "lights out", "light went out", "oscuridad", "a oscuras"]],
  ["spot", ["projecteur", "sous les projecteurs", "tous les regards", "lumiere sur", "scheinwerfer", "rampenlicht", "alle augen", "spotlight", "all eyes on", "centro de atencion", " foco"]],
];

/** Transitions déduites des mots : saut dans le temps → fondu au noir, changement de lieu → glissement. */
export const TRANSITION_KEYWORDS = [
  ["black", ["plus tard", "des annees", "le lendemain", "des mois", "quelques jours", "des semaines", " un jour ", "spater", "jahre", "am nachsten tag", "eines tages", " later", "the next day", "one day", "mas tarde", "anos despues", "al dia siguiente", "un dia"]],
  ["slide", ["pendant ce temps", "ailleurs", "de l'autre cote", "inzwischen", "wahrenddessen", "woanders", "meanwhile", "elsewhere", "on the other side", "mientras tanto", "en otro lugar"]],
  ["zoom", ["regarde bien", "ecoute bien", "retiens bien", "voici le secret", "schau genau", "hor genau", "look closely", "listen carefully", "here's the secret", "heres the secret", "mira bien", "escucha bien"]],
];

function firstMatch(table, text) {
  const n = normalize(text);
  for (const [id, words] of table) {
    if (words.some((w) => n.includes(w))) return id;
  }
  return null;
}

/** Effet déduit d'une phrase (slow, flash, shake, dark, spot) ou null. */
export function detectFx(text) {
  return firstMatch(FX_KEYWORDS, plainText(text));
}

/** Transition d'entrée déduite d'une phrase (black, slide, zoom) ou null. */
export function detectTransition(text) {
  return firstMatch(TRANSITION_KEYWORDS, plainText(text));
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
  // Une pause au milieu d'un dialogue garde les deux personnages à l'écran.
  scenes.forEach((sc, i) => {
    if (sc.kind === "pause" && scenes[i - 1]?.figures === 2) sc.figures = 2;
  });
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
