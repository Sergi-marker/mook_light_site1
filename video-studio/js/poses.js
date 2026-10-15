// Poses et animations du personnage. Module pur (aucun accès au DOM).
//
// Un squelette est décrit par des angles (radians). 0 = membre vers le bas, +π/2 = vers l'avant
// (le côté où regarde le personnage), π = vers le haut. Les bras sont relatifs au buste (lean),
// les avant-bras et tibias relatifs au segment précédent.
//
// Une action est une fonction (t, r, role) → pose, où t est le temps local de la scène (s),
// r un tirage pseudo-aléatoire stable par scène (0..1) pour varier amplitude et vitesse, et role
// 0 (personnage principal) ou 1 (second personnage).

const { sin, cos, PI, abs, max, min } = Math;

/** Pose neutre debout. */
export const BASE = Object.freeze({
  dx: 0,          // décalage horizontal (en hauteurs de personnage)
  lift: 0,        // décollement du sol (en hauteurs de personnage, saut)
  lean: 0,        // inclinaison du buste
  head: 0,        // inclinaison de la tête
  shF: 0.12, elF: -0.15,   // bras avant : épaule, coude
  shB: -0.12, elB: -0.15,  // bras arrière
  hipF: 0.04, knF: 0,      // jambe avant : hanche, genou
  hipB: -0.04, knB: 0,     // jambe arrière
  face: "neutral",          // neutral | happy | laugh | sad | angry | surprised | closed | talk
  mouthOpen: 0,             // 0..1
  look: 0,                  // regard vertical (-1 bas … 1 haut)
  dir: 1,                   // 1 = regarde vers la droite, -1 = vers la gauche
  symbol: null,             // "?", "!?", "...", "heart", "tear", "zzz", "haha", "anger", "idea", "sweat", "sparkle", "music"
  prop: null,               // "bench", "dumbbell", "phone", "book", "cloud", "mat"
  sit: 0,                   // 0..1 : le personnage est assis sur le banc (les hanches restent à la hauteur du banc)
  lie: 0,                   // 0..1 : allongé (tomber)
});

const pose = (o) => ({ ...BASE, ...o });
const wave = (t, f, a = 1, ph = 0) => a * sin(t * f * 2 * PI + ph);
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const blink = (t, r) => ((t * (0.9 + r * 0.4) + r * 3) % 3.4 < 0.12 ? "closed" : null);

/** Respiration commune à toutes les poses debout. */
function breathe(t, r) {
  return { lean: wave(t, 0.25 + r * 0.1, 0.015), shF: 0.12 + wave(t, 0.25, 0.03), shB: -0.12 - wave(t, 0.25, 0.03) };
}

/** Cycle de marche. speed = cycles par seconde, amp = amplitude des pas. */
function walkCycle(t, speed, amp, armAmp = amp) {
  const p = t * speed * 2 * PI;
  const s = sin(p);
  return {
    hipF: s * amp, knF: -max(0, -cos(p)) * amp * 1.4,
    hipB: -s * amp, knB: -max(0, cos(p)) * amp * 1.4,
    shF: -s * armAmp * 0.9, elF: -0.35, shB: s * armAmp * 0.9, elB: -0.35,
    lift: abs(sin(p)) * 0.012 * (amp / 0.4),
  };
}

export const ACTIONS = {
  idle: (t, r) => pose({ ...breathe(t, r), head: wave(t, 0.15, 0.05), face: blink(t, r) ?? "neutral" }),

  think: (t, r) => pose({
    ...breathe(t, r),
    head: 0.22 + wave(t, 0.2, 0.05), look: 0.6,
    // Main sous le menton.
    shF: 0.55, elF: 2.35 + wave(t, 0.3, 0.05),
    shB: -0.05, elB: -0.1,
    face: blink(t, r) ?? "neutral",
    symbol: (t % 4) < 2.6 ? "?" : "...",
  }),

  confused: (t, r) => pose({
    lean: -0.08 + wave(t, 0.4, 0.04), head: 0.3 + wave(t, 0.5, 0.08),
    // Se gratte la tête.
    shF: 2.6, elF: 1.6 + wave(t, 3 + r, 0.25),
    shB: -0.25, elB: -0.6,
    hipF: 0.18, knF: -0.2, hipB: -0.12, knB: 0,
    face: "surprised", symbol: "!?",
  }),

  idea: (t, r) => {
    const k = ease(t / 0.8);
    return pose({
      ...breathe(t, r), head: -0.12 * k, look: 0.8 * k,
      shF: 0.4 + 1.85 * k, elF: 0.75 * k + wave(t, 1.2, 0.08) * k,
      face: k > 0.5 ? "happy" : "surprised", symbol: k > 0.3 ? "idea" : null,
    });
  },

  sad: (t, r) => pose({
    lean: 0.18 + wave(t, 0.2, 0.02), head: 0.55 + wave(t, 0.15, 0.04), look: -1,
    shF: 0.02, elF: 0, shB: -0.02, elB: 0,
    face: "sad", symbol: r > 0.5 ? "tear" : null,
  }),

  cry: (t, r) => pose({
    lean: 0.22 + wave(t, 2.6, 0.025), head: 0.45 + wave(t, 2.6, 0.04), look: -1,
    // Mains sur le visage.
    shF: 1.75, elF: 1.75, shB: 1.55, elB: 1.85,
    hipF: 0.06, knF: -0.08,
    face: "sad", symbol: "tear",
  }),

  alone: (t, r) => {
    // Marche lente, tête basse, puis s'arrête.
    const moving = t < 3.2;
    const w = moving ? walkCycle(t, 0.55, 0.28) : {};
    return pose({
      ...w, dx: -0.45 + 0.45 * ease(min(t, 3.2) / 3.2),
      lean: 0.16, head: 0.5, look: -1, face: "sad",
      shF: moving ? w.shF * 0.4 : 0.02, shB: moving ? w.shB * 0.4 : -0.02, elF: 0, elB: 0,
      symbol: moving ? null : "...",
    });
  },

  tired: (t, r) => pose({
    lean: 0.28 + wave(t, 0.18, 0.04), head: 0.7 + wave(t, 0.18, 0.06), look: -1,
    shF: 0.08, elF: 0, shB: -0.02, elB: 0, hipF: 0.1, knF: -0.18, hipB: -0.02, knB: -0.05,
    face: "closed", symbol: "zzz",
  }),

  walk: (t, r) => pose({
    ...walkCycle(t, 0.85 + r * 0.25, 0.42),
    dx: -0.55 + ((t * (0.16 + r * 0.05)) % 1.1),
    lean: 0.06, head: 0.06, face: blink(t, r) ?? "neutral",
  }),

  run: (t, r) => {
    const w = walkCycle(t, 1.7 + r * 0.3, 0.75, 1.0);
    return pose({
      ...w, dx: -0.6 + ((t * 0.32) % 1.3),
      lean: 0.28, head: -0.05, elF: -1.5, elB: -1.5,
      knF: w.knF * 1.15, knB: w.knB * 1.15, lift: w.lift * 3,
      face: "neutral", symbol: "sweat",
    });
  },

  laugh: (t, r) => {
    const shake = wave(t, 5 + r * 2, 1);
    return pose({
      lean: -0.15 + shake * 0.04, head: -0.25 + shake * 0.06,
      // Une main sur le ventre, l'autre qui s'agite.
      shF: 0.5, elF: 1.5, shB: -0.4 + shake * 0.15, elB: -1.3,
      lift: abs(shake) * 0.01,
      face: "laugh", mouthOpen: 0.6 + abs(shake) * 0.4, symbol: "haha",
    });
  },

  mock: (t, r, role) => {
    if (role === 1) return ACTIONS.surprised(t, r);
    // Rit en montrant l'autre du doigt (comme sur la vidéo d'exemple).
    const shake = wave(t, 5, 1);
    return pose({
      lean: -0.12 + shake * 0.03, head: -0.2 + shake * 0.05,
      shF: 1.45 + shake * 0.05, elF: 0.05,
      shB: 2.8, elB: 0.6 + shake * 0.2, // l'autre main levée, s'agite
      face: "laugh", mouthOpen: 0.7 + abs(shake) * 0.3, symbol: "haha",
    });
  },

  surprised: (t, r) => {
    const k = ease(t / 0.3);
    return pose({
      lean: -0.1 * k, head: -0.1 * k, look: 0.3,
      shF: 0.6 * k + 0.1, elF: 1.6 * k, shB: 0.4 * k, elB: 1.8 * k, // mains vers la bouche / poitrine
      hipF: 0.15, hipB: -0.1,
      face: "surprised", mouthOpen: 0.8, symbol: t < 1.6 ? "!?" : null,
    });
  },

  angry: (t, r) => {
    const shake = wave(t, 7, 1);
    return pose({
      lean: 0.1 + shake * 0.015, head: 0.1,
      shF: 0.55 + shake * 0.05, elF: 1.9, shB: -0.55 - shake * 0.05, elB: 1.9, // poings serrés
      hipF: 0.2, hipB: -0.2,
      face: "angry", symbol: "anger",
    });
  },

  argue: (t, r, role) => {
    const talk = wave(t + role * 0.6, 2.2, 1);
    return pose({
      lean: 0.12 + talk * 0.03, head: 0.05,
      shF: 1.2 + talk * 0.3, elF: 0.4 + talk * 0.4, shB: -0.4, elB: -0.6,
      hipF: 0.2, hipB: -0.15,
      face: "angry", mouthOpen: max(0, talk) * 0.8, symbol: "anger",
    });
  },

  talk: (t, r, role) => {
    // Le principal parle (gestes), le second écoute (hoche la tête).
    if (role === 1) {
      return pose({ ...breathe(t, r), head: 0.08 + wave(t, 0.8, 0.07), face: blink(t, r) ?? "neutral", shF: 0.15, elF: -0.2 });
    }
    const g = wave(t, 0.9 + r * 0.5, 1);
    return pose({
      ...breathe(t, r), head: -0.04 + wave(t, 0.7, 0.05),
      shF: 0.9 + g * 0.35, elF: 0.9 + wave(t, 1.3, 0.3),
      shB: -0.1 + max(0, -g) * 0.5, elB: -0.2 - max(0, -g) * 0.6,
      face: "talk", mouthOpen: abs(wave(t, 3.5, 1)) * 0.8,
    });
  },

  point: (t, r, role) => {
    if (role === 1) return pose({ ...ACTIONS.sad(t, r), symbol: "sweat" });
    return pose({
      ...breathe(t, r), lean: -0.05, head: -0.05,
      shF: 1.5 + wave(t, 1.5, 0.06), elF: 0.02, shB: -0.3, elB: -1.6, // main sur la hanche
      face: "angry", mouthOpen: abs(wave(t, 2.5, 0.6)),
    });
  },

  ignore: (t, r, role) => {
    if (role === 1) return pose({ ...ACTIONS.idle(t, r), dir: -1, head: -0.15, shF: 0.6, elF: 1.9, shB: 0.6, elB: 1.9 }); // bras croisés, dos tourné
    return pose({ ...ACTIONS.sad(t, r), symbol: "..." });
  },

  hug: (t, r) => {
    const k = ease(t / 0.9);
    return pose({
      ...breathe(t, r), dx: 0.1 * k, lean: 0.1 * k, head: 0.15 * k,
      shF: 0.2 + 1.2 * k, elF: 1.1 * k, shB: 0.1 + 1.0 * k, elB: 1.2 * k,
      face: k > 0.6 ? "closed" : "happy", symbol: k > 0.8 ? "heart" : null,
    });
  },

  love: (t, r) => pose({
    ...breathe(t, r), head: 0.12 + wave(t, 0.5, 0.06), look: 0.3,
    // Mains jointes sur la poitrine.
    shF: 0.65, elF: 1.85, shB: 0.55, elB: 1.95,
    lift: max(0, wave(t, 0.8, 0.008)),
    face: "happy", symbol: "heart",
  }),

  celebrate: (t, r) => {
    const j = abs(sin(t * PI * (1.4 + r * 0.4)));
    return pose({
      lean: -0.05, head: -0.15, look: 1,
      shF: 2.7 + wave(t, 1.4, 0.15), elF: 0.25, shB: -2.7 - wave(t, 1.4, 0.15), elB: -0.25,
      hipF: 0.1 + j * 0.1, knF: -j * 0.5, hipB: -0.1 - j * 0.1, knB: -j * 0.5,
      lift: j * 0.08,
      face: "laugh", mouthOpen: 0.6, symbol: "sparkle",
    });
  },

  shrug: (t, r) => {
    const k = ease((t % 3) / 0.5) * (1 - ease(((t % 3) - 2) / 0.5));
    return pose({
      ...breathe(t, r), head: 0.15 * k,
      shF: 0.5 + 0.6 * k, elF: 1.6 * k, shB: -0.5 - 0.6 * k, elB: -1.6 * k,
      face: "neutral", symbol: k > 0.5 ? "..." : null,
    });
  },

  fall: (t, r) => {
    // Trébuche puis se retrouve assis par terre.
    const k = ease(t / 0.9);
    return pose({
      lean: -0.5 * k, head: 0.2 * k,
      shF: 1.2 * k, elF: 0.4, shB: -1.2 * k, elB: -0.4,
      hipF: 1.5 * k, knF: -0.1 * k, hipB: 1.45 * k, knB: -0.25 * k,
      sit: k, lie: k,
      face: k > 0.5 ? "sad" : "surprised", symbol: t > 1 ? "sweat" : "!?",
    });
  },

  wave: (t, r) => pose({
    ...breathe(t, r), head: -0.05,
    shF: 2.2, elF: 0.55 + wave(t, 1.8, 0.4),
    face: "happy",
  }),

  sit: (t, r) => pose({
    lean: 0.2 + wave(t, 0.2, 0.02), head: 0.35 + wave(t, 0.15, 0.04), look: -0.5,
    // Assis sur le banc, avant-bras sur les cuisses.
    shF: 0.55, elF: 0.9, shB: 0.45, elB: 1.0,
    hipF: PI / 2, knF: -PI / 2, hipB: PI / 2 - 0.1, knB: -PI / 2 + 0.1,
    sit: 1, prop: "bench", face: blink(t, r) ?? "neutral",
  }),

  phone: (t, r) => pose({
    ...breathe(t, r), head: 0.45, look: -1,
    shF: 0.5, elF: 1.9, shB: 0.4, elB: 1.95,
    face: blink(t, r) ?? "neutral", prop: "phone",
  }),

  read: (t, r) => pose({
    ...breathe(t, r), head: 0.35, look: -0.8,
    shF: 0.65, elF: 1.6, shB: 0.55, elB: 1.7,
    face: blink(t, r) ?? "neutral", prop: "book",
  }),

  lift: (t, r) => {
    // Développé : haltère qui monte et descend.
    const k = (1 - cos(t * PI * (0.9 + r * 0.3))) / 2;
    return pose({
      head: -0.05, lean: -0.02,
      shF: 0.45 + 2.3 * k, elF: 2.2 * (1 - k) + 0.1, shB: 0.35 + 2.3 * k, elB: 2.2 * (1 - k) + 0.1,
      hipF: 0.15, hipB: -0.15, knF: -0.05, knB: -0.05,
      face: k > 0.6 ? "angry" : "neutral", prop: "dumbbell", symbol: k > 0.8 ? "sweat" : null,
    });
  },

  exercise: (t, r) => {
    // Squats.
    const k = (1 - cos(t * PI * (0.8 + r * 0.3))) / 2;
    return pose({
      lean: 0.35 * k, head: -0.2 * k,
      shF: 1.5 * k + 0.1, elF: 0, shB: 1.4 * k + 0.05, elB: 0,
      hipF: 1.3 * k, knF: -1.9 * k, hipB: 1.2 * k, knB: -1.8 * k,
      face: k > 0.7 ? "angry" : "neutral", prop: "mat", symbol: k > 0.85 ? "sweat" : null,
    });
  },

  meditate: (t, r) => pose({
    lean: 0, head: wave(t, 0.12, 0.03),
    // Assis en tailleur, mains sur les genoux.
    shF: 0.55, elF: 0.4, shB: -0.55, elB: -0.4,
    hipF: 1.45, knF: -2.6, hipB: -1.45, knB: 2.6,
    sit: 1, lift: 0.02 + wave(t, 0.25, 0.006),
    face: "closed", symbol: "music", prop: "mat",
  }),
};

/** Nombre de personnages par défaut selon l'action. */
export const DUO_ACTIONS = new Set(["mock", "argue", "talk", "point", "ignore", "hug"]);

/** Libellés (fr / de / en) pour l'éditeur de scènes. */
export const ACTION_LABELS = {
  idle: ["Repos", "Ruhe", "Idle"], think: ["Réfléchit", "Denkt nach", "Thinks"], confused: ["Perdu", "Verwirrt", "Confused"],
  idea: ["Idée", "Idee", "Idea"], sad: ["Triste", "Traurig", "Sad"], cry: ["Pleure", "Weint", "Cries"], alone: ["Seul", "Allein", "Alone"],
  tired: ["Fatigué", "Müde", "Tired"], walk: ["Marche", "Geht", "Walks"], run: ["Court", "Rennt", "Runs"], laugh: ["Rit", "Lacht", "Laughs"],
  mock: ["Se moque (2)", "Lacht aus (2)", "Mocks (2)"], surprised: ["Surpris", "Überrascht", "Surprised"], angry: ["En colère", "Wütend", "Angry"],
  argue: ["Dispute (2)", "Streit (2)", "Argue (2)"], talk: ["Parle (2)", "Redet (2)", "Talks (2)"], point: ["Accuse (2)", "Beschuldigt (2)", "Blames (2)"],
  ignore: ["Ignore (2)", "Ignoriert (2)", "Ignores (2)"], hug: ["Câlin (2)", "Umarmung (2)", "Hug (2)"], love: ["Amour", "Liebe", "Love"],
  celebrate: ["Joie", "Freude", "Celebrates"], shrug: ["Hausse les épaules", "Zuckt die Schultern", "Shrugs"], fall: ["Tombe", "Fällt", "Falls"],
  wave: ["Salue", "Winkt", "Waves"], sit: ["Assis / attend", "Sitzt / wartet", "Sits / waits"], phone: ["Téléphone", "Handy", "Phone"],
  read: ["Lit / histoire", "Liest / Geschichte", "Reads / story"], lift: ["Musculation", "Krafttraining", "Lifts weights"],
  exercise: ["Squats / sport", "Kniebeugen / Sport", "Squats / sport"], meditate: ["Médite", "Meditiert", "Meditates"],
};

const NUM_KEYS = ["dx", "lift", "lean", "head", "shF", "elF", "shB", "elB", "hipF", "knF", "hipB", "knB", "mouthOpen", "look", "sit", "lie"];

/** Interpolation entre deux poses (k = 0 → a, 1 → b). Les champs non numériques basculent à mi-chemin. */
export function lerpPose(a, b, k) {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const out = { ...(k < 0.5 ? a : b) };
  for (const key of NUM_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

/** Pose à l'instant t d'une action, avec repli sur « idle » pour un id inconnu. */
export function poseAt(action, t, r = 0.5, role = 0) {
  const fn = ACTIONS[action] ?? ACTIONS.idle;
  return fn(Math.max(0, t), r, role);
}

/**
 * Position des articulations (en unités « hauteur du personnage = 1 », origine = milieu des hanches,
 * y vers le bas). morph : proportions choisies par l'utilisateur.
 */
export function skeleton(p, morph = {}) {
  const legLen = 0.42 * (morph.legs ?? 1);
  const torso = 0.27 * (morph.torso ?? 1);
  const arm = 0.14 * (morph.arms ?? 1);
  const headR = 0.1 * (morph.headSize ?? 1);
  const d = p.dir ?? 1;
  const vec = (a, len) => [d * sin(a) * len, cos(a) * len]; // a=0 → vers le bas
  const add = (o, v) => [o[0] + v[0], o[1] + v[1]];
  const hip = [0, 0];
  const neck = add(hip, vec(PI - p.lean, torso)); // buste vers le haut (lean > 0 = penché en avant)
  const shoulder = add(hip, vec(PI - p.lean, torso * 0.92));
  const headC = add(neck, vec(PI - p.lean - p.head * 0.6, headR * 1.05));
  const elbowF = add(shoulder, vec(p.lean + p.shF, arm));
  const handF = add(elbowF, vec(p.lean + p.shF + p.elF, arm * 0.95));
  const elbowB = add(shoulder, vec(p.lean + p.shB, arm));
  const handB = add(elbowB, vec(p.lean + p.shB + p.elB, arm * 0.95));
  const thigh = legLen * 0.5, shin = legLen * 0.5;
  const kneeF = add(hip, vec(p.hipF, thigh));
  const footF = add(kneeF, vec(p.hipF + p.knF, shin));
  const kneeB = add(hip, vec(p.hipB, thigh));
  const footB = add(kneeB, vec(p.hipB + p.knB, shin));
  return { hip, neck, shoulder, headC, headR, elbowF, handF, elbowB, handB, kneeF, footF, kneeB, footB, legLen, torso };
}
