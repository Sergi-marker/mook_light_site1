// © la triche — Animots
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
  rot: 0,                   // rotation de tout le corps autour des hanches (> 0 = vers l'avant : pompes, gainage, couché)
  set: null,                // décor lié à l'action (mur, porte, escalier, lit, lampadaire, foule…) : voir scenery.js
  setK: 0,                  // avancement du décor (porte qui s'ouvre, sac qui balance…)
});

const pose = (o) => ({ ...BASE, ...o });
const wave = (t, f, a = 1, ph = 0) => a * sin(t * f * 2 * PI + ph);
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const blink = (t, r) => ((t * (0.9 + r * 0.4) + r * 3) % 3.4 < 0.12 ? "closed" : null);

/**
 * Bras à deux segments qui doit atteindre un point (cinématique inverse) : la main se pose au sol.
 * rot : rotation du corps ; (fx, fy) : position de la main par rapport à l'épaule, dans le repère du sol
 * (fx vers l'avant, fy vers le bas, en hauteurs de personnage). Renvoie les angles d'épaule et de coude.
 */
function armIK(rot, lean, fx, fy) {
  const L1 = 0.14, L2 = 0.133;
  const D = Math.min(L1 + L2 - 1e-4, Math.max(0.02, Math.hypot(fx, fy)));
  const th = Math.atan2(fx, fy); // 0 = vers le bas, > 0 = vers l'avant
  const a = Math.acos(Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)));
  const b = Math.acos(Math.min(1, (L2 * L2 + D * D - L1 * L1) / (2 * L2 * D)));
  const upper = th - a, lower = th + b; // coude vers l'arrière
  return { sh: upper + rot - lean, el: lower - upper };
}

/** Respiration commune à toutes les poses debout. */
function breathe(t, r) {
  // Respiration visible + léger transfert du poids d'un pied sur l'autre.
  return {
    lean: wave(t, 0.25 + r * 0.1, 0.03), head: wave(t, 0.25 + r * 0.1, 0.04, 0.6), dx: wave(t, 0.12, 0.01),
    shF: 0.14 + wave(t, 0.25, 0.06), shB: -0.14 - wave(t, 0.25, 0.06),
    hipF: 0.05 + wave(t, 0.12, 0.03), hipB: -0.05 + wave(t, 0.12, 0.03),
  };
}

/**
 * Distance par défaut entre les hanches des deux personnages (en hauteurs de personnage) : format 9:16,
 * style épuré. Les actions à deux qui se touchent (poignée de main, câlin…) la reçoivent en 4e argument
 * (poseAt(…, gap)) pour que les mains se rejoignent quel que soit l'écart choisi par le moteur de rendu.
 */
export const DUO_GAP = 0.765;
/** Le second personnage est animé avec 0,37 s d'avance (renderer.js) : on le recale pour les gestes à deux. */
const SYNC = 0.37;
const sync = (t, role) => (role === 1 ? max(0, t - SYNC) : t);
const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Mélange de deux jeux d'angles (k = 0 → a, 1 → b). */
const mix = (a, b, k) => {
  const o = {};
  for (const key in a) o[key] = a[key] + (b[key] - a[key]) * k;
  return o;
};
const SH = 0.248; // hauteur des épaules au-dessus des hanches
const shX = (lean) => SH * sin(lean); // avancée des épaules quand le buste penche
/** Bras avant / arrière dont la main va au point (fx, fy) depuis l'épaule (fx vers l'avant, fy vers le bas). */
const armF = (lean, fx, fy) => { const a = armIK(0, lean, fx, fy); return { shF: a.sh, elF: a.el }; };
const armB = (lean, fx, fy) => { const a = armIK(0, lean, fx, fy); return { shB: a.sh, elB: a.el }; };
/** Jambe dont le pied va au point (fx, fy) depuis la hanche (genou vers l'avant). */
function legIK(fx, fy) {
  const L = 0.21, D = min(2 * L - 1e-4, max(0.02, Math.hypot(fx, fy)));
  const a = Math.acos(D / (2 * L)), th = Math.atan2(fx, fy);
  return { hip: th + a, kn: -2 * a };
}
const F0 = { shF: 0.14, elF: -0.15 }, B0 = { shB: -0.14, elB: -0.15 }; // bras au repos
const CROSSED = { shF: 0.6, elF: 1.9, shB: 0.6, elB: 1.95 }; // bras croisés
const KNEEL = { hipF: 1.45, knF: -1.5, hipB: -0.25, knB: -1.35 }; // un genou à terre
const SEATED = { hipF: PI / 2, knF: -PI / 2, hipB: PI / 2 - 0.1, knB: -PI / 2 + 0.1, sit: 1 }; // assis sur une chaise
const HIP_HAND = { shB: -0.3, elB: -1.6 }; // main sur la hanche

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

  // Dialogue : celui qui parle fait des gestes, l'autre écoute (hoche la tête, croise les bras par moments).
  speak: (t, r, role) => (role === 1 ? ACTIONS.listen(t, r) : ACTIONS.talk(t, r, 0)),

  listen: (t, r) => {
    const cross = Math.sin(t * 0.35 + r * 6) > 0.3;
    return pose({
      ...breathe(t, r), head: 0.1 + wave(t, 0.9, 0.06), look: 0.1,
      shF: cross ? 0.6 : 0.15, elF: cross ? 1.9 : -0.2, shB: cross ? 0.6 : -0.15, elB: cross ? 1.95 : -0.2,
      face: blink(t, r) ?? "neutral",
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
  // ——— Émotions ———

  anxious: (t, r) => {
    const leg = abs(wave(t, 4.5, 1)); // la jambe tremble
    const look = sin(t * 1.3 + r * 5);
    return pose({
      lean: 0.08 + wave(t, 6, 0.008), head: 0.12 + look * 0.12, look: look > 0.4 ? 0.3 : -0.3,
      // Mains qui se tordent devant le ventre.
      shF: 0.55 + wave(t, 2.6, 0.08), elF: 1.5 + wave(t, 2.6, 0.18), shB: 0.5 - wave(t, 2.6, 0.08), elB: 1.6 - wave(t, 2.6, 0.18),
      hipF: 0.12, knF: -0.08 - leg * 0.14, hipB: -0.06, lift: leg * 0.004,
      face: blink(t, r) ?? "sad", symbol: (t % 2.4) < 1.2 ? "sweat" : "!?",
    });
  },

  shame: (t, r) => pose({
    lean: 0.22 + wave(t, 0.3, 0.02), head: 0.8, look: -1,
    // Une main cache le visage, l'autre pend ; épaules rentrées.
    shF: 1.8, elF: 1.95 + wave(t, 0.4, 0.05), shB: 0.12, elB: 0.15,
    hipF: 0.08, knF: -0.08, hipB: -0.08,
    face: "sad", symbol: "shame",
  }),

  rain: (t, r) => pose({
    lean: 0.24 + wave(t, 0.2, 0.02), head: 0.6 + wave(t, 0.15, 0.04), look: -1,
    shF: 0.02, elF: 0, shB: -0.02, elB: 0, hipF: 0.04, hipB: -0.04,
    face: "sad", set: "rain",
  }),

  heartbreak: (t, r) => pose({
    lean: 0.14 + wave(t, 0.25, 0.02), head: 0.4 + wave(t, 0.2, 0.03), look: -0.7,
    // Main sur le cœur, l'autre bras ballant.
    shF: 0.95, elF: 1.65, shB: 0.05, elB: 0.05, hipF: 0.06, hipB: -0.04,
    face: "sad", symbol: "broken", setK: ease((t - 0.3) / 0.9),
  }),

  mask: (t, r) => {
    // Le sourire de façade : le masque monte devant le visage, puis redescend et montre la vraie tristesse.
    const c = (t % 4.4) / 4.4;
    const up = c < 0.5 ? ease(c / 0.12) : 1 - ease((c - 0.5) / 0.12);
    return pose({
      ...breathe(t, r), head: 0.08 + (1 - up) * 0.32, look: -0.6 * (1 - up),
      shF: 0.3 + 1.42 * up, elF: 0.2 + 1.6 * up, shB: -0.1, elB: -0.15,
      face: up > 0.5 ? "neutral" : "sad", prop: "mask", setK: up,
    });
  },

  burden: (t, r) => {
    // Avance lentement, plié sous un poids énorme.
    const moving = t < 5;
    const w = moving ? walkCycle(t, 0.38, 0.22) : {};
    return pose({
      ...w, dx: -0.25 + 0.3 * ease(min(t, 5) / 5),
      lean: 0.55 + wave(t, 0.38, 0.03), head: -0.25, look: -0.2,
      shF: 0.15, elF: 2.0, shB: 0.0, elB: 2.1, // mains aux bretelles
      knF: (w.knF ?? 0) - 0.25, knB: (w.knB ?? 0) - 0.2,
      face: "sad", symbol: (t % 3) < 1.5 ? "sweat" : null, set: "boulder",
    });
  },

  wall: (t, r) => {
    const push = wave(t, 0.7, 1);
    return pose({
      dx: 0.04, lean: 0.4 + push * 0.03, head: -0.1, look: 0.2,
      shF: 1.2 + push * 0.05, elF: 0.4, shB: 1.1, elB: 0.5,
      hipF: 0.25, knF: -0.25, hipB: -0.45, knB: 0.05,
      face: "angry", symbol: (t % 3) < 1.5 ? "sweat" : null, set: "wall",
    });
  },

  explode: (t, r) => {
    // La colère monte (tremblements), puis explose : bras en l'air, cri, fumée.
    if (t < 1.1) {
      const sh = wave(t, 11, 1) * t * 0.04;
      return pose({
        lean: 0.18 + sh, head: 0.25, look: -0.4, shF: 0.35, elF: 1.9, shB: -0.35, elB: 1.9,
        hipF: 0.18, knF: -0.1, hipB: -0.18, knB: -0.1, face: "angry", symbol: "anger",
      });
    }
    const k = ease((t - 1.1) / 0.25), sh = wave(t, 9, 1);
    return pose({
      lean: 0.18 - 0.33 * k + sh * 0.02, head: 0.25 - 0.55 * k, look: 0.6,
      shF: 0.35 + 2.0 * k, elF: 1.9 - 1.4 * k, shB: -0.35 - 2.0 * k, elB: -1.9 + 1.4 * k,
      hipF: 0.3, knF: -0.1, hipB: -0.3, knB: -0.1,
      face: "angry", mouthOpen: 1, symbol: "anger", set: "steam", setK: k,
    });
  },

  calm: (t, r) => {
    // Respiration lente : on inspire (les bras montent), on expire (ils redescendent).
    const b = (1 - cos((t * 2 * PI) / 4.5)) / 2;
    return pose({
      lean: -0.04 * b, head: -0.12 * b, look: 0.3 * b,
      shF: 0.2 + 1.3 * b, elF: 0.25 - 0.15 * b, shB: 0.12 + 1.3 * b, elB: 0.3 - 0.15 * b,
      lift: 0.004 * b, face: "closed", set: "breath", setK: b,
    });
  },

  rise: (t, r) => {
    // Assis par terre → un genou au sol → debout, puis poing levé.
    const ground = pose({
      lean: -0.35, head: 0.45, look: -1, shF: 0.5, elF: 0.6, shB: 0.4, elB: 0.6,
      hipF: 1.5, knF: -0.1, hipB: 1.45, knB: -0.25, sit: 1, lie: 1, face: "sad",
    });
    const knee = pose({
      lean: 0.3, head: 0.1, look: 0, shF: 0.9, elF: 1.1, shB: -0.2, elB: -0.3,
      hipF: 1.45, knF: -1.5, hipB: -0.25, knB: -1.35, face: "neutral",
    });
    const up = pose({ ...breathe(t, r), head: -0.1, look: 0.4, shF: 2.6, elF: 0.6, face: "happy", symbol: "sparkle" });
    const a = ease((t - 0.5) / 0.9), b = ease((t - 1.7) / 0.9);
    return b > 0 ? lerpPose(knee, up, b) : lerpPose(ground, knee, a);
  },

  mirror: (t, r) => pose({
    ...breathe(t, r), dx: -0.12, head: 0.05 + wave(t, 0.3, 0.05),
    shF: 0.85 + wave(t, 0.35, 0.1), elF: 1.5, shB: -0.1, elB: -0.15,
    face: blink(t, r) ?? "neutral", set: "mirror",
  }),

  crowd: (t, r) => pose({
    lean: 0.15 + wave(t, 0.3, 0.02), head: 0.3 + wave(t, 0.6, 0.1), look: -0.4,
    // Se recroqueville, les bras serrés contre soi.
    shF: 0.7, elF: 1.95, shB: 0.6, elB: 2.0, hipF: 0.06, knF: -0.1, hipB: -0.06, knB: -0.05,
    face: "sad", symbol: "sweat", set: "crowd",
  }),

  // ——— Relations (à deux) ———

  reach: (t, r, role) => {
    // L'un tend la main, l'autre (à terre) la saisit et se relève.
    const k = ease((t - 1.6) / 1.4);
    if (role === 1) {
      const low = pose({
        dx: 0.12, lean: -0.2, head: -0.2, look: 0.8, shF: 1.75, elF: 0.15, shB: -0.3, elB: -0.2,
        hipF: 1.5, knF: -0.3, hipB: 1.4, knB: -0.5, sit: 1, lie: 1, face: "sad",
      });
      const high = pose({ ...breathe(t, r), dx: 0.18, lean: 0.05, shF: 1.35, elF: 0.15, face: "happy", symbol: "sparkle" });
      return lerpPose(low, high, k);
    }
    const a = ease(t / 0.9);
    return pose({
      ...breathe(t, r), dx: 0.3 * a,
      lean: 0.4 * a - 0.3 * k * a, head: -0.25 * a, look: -0.4,
      shF: 0.25 + (0.9 - 0.2 * k) * a, elF: 0.1, shB: -0.2, elB: -0.3,
      hipF: 0.2, knF: -0.3 * a * (1 - k), hipB: -0.3 * a,
      face: "happy",
    });
  },

  leave: (t, r, role) => {
    if (role === 1) {
      // Reste, tend la main, puis la laisse retomber.
      const k = ease(t / 0.8) * (1 - ease((t - 2.6) / 1));
      return pose({
        ...breathe(t, r), dx: 0.06 * ease(t), lean: 0.08,
        shF: 0.2 + 1.2 * k, elF: 0.2, head: 0.1 + (1 - k) * 0.3, look: -0.4 * (1 - k),
        face: "sad", symbol: t > 2.4 ? "tear" : null,
      });
    }
    const w = walkCycle(t, 0.75, 0.38);
    return pose({
      ...w, dir: -1, dx: -0.75 * min(1, t / 5.5), lean: 0.1, head: 0.2, look: -0.4,
      face: "sad",
    });
  },

  backtoback: (t, r, role) => pose({
    ...breathe(t, r + role * 0.3), dir: -1, dx: 0.5,
    head: role ? -0.12 : 0.15, look: role ? 0.3 : -0.3,
    shF: 0.6, elF: 1.9, shB: 0.6, elB: 1.95, // bras croisés
    face: "angry", symbol: (t + role) % 4 < 2 ? (role ? "..." : "anger") : null,
  }),

  highfive: (t, r, role) => {
    const c = t % 2.6;
    const k = c < 0.75 ? ease(c / 0.75) : c < 1.25 ? 1 : 1 - ease((c - 1.25) / 0.5);
    const hit = c > 0.72 && c < 1.15;
    const j = hit ? abs(sin((c - 0.72) * PI / 0.43)) : 0;
    return pose({
      ...breathe(t, r), dx: 0.36 * ease(t / 0.7), lean: 0.06,
      shF: 0.2 + 2.0 * k, elF: 0.4 * (1 - k) + 0.05, shB: -0.3, elB: -0.6,
      lift: j * 0.03, face: hit ? "laugh" : "happy", mouthOpen: 0.6,
      set: role === 0 ? "clap" : null, setK: hit ? 1 - (c - 0.72) / 0.43 : 0,
    });
  },

  whisper: (t, r, role) => {
    if (role === 1) {
      const shocked = t % 3.2 > 1.6;
      return pose({
        ...breathe(t, r), dx: 0.1, head: shocked ? -0.08 : 0.05, look: 0.2,
        shF: shocked ? 0.9 : 0.15, elF: shocked ? 1.7 : -0.2,
        face: shocked ? "surprised" : blink(t, r) ?? "neutral", symbol: shocked ? "!?" : null,
      });
    }
    return pose({
      ...breathe(t, r), dx: 0.42 * ease(t / 0.8), lean: 0.3, head: -0.12,
      shF: 1.95, elF: 1.55, shB: -0.2, elB: -0.3, // main en cornet devant la bouche
      hipF: 0.2, knF: -0.2, face: "talk", mouthOpen: abs(wave(t, 4, 0.35)), symbol: "...",
    });
  },

  puppet: (t, r, role) => {
    const j = wave(t, 1.1, 1), j2 = wave(t, 1.1, 1, 1.7);
    if (role === 1) {
      // Marionnette : membres tirés par les fils, mouvements saccadés.
      return pose({
        lean: 0.05 + j * 0.05, head: 0.4 + j2 * 0.15, look: -0.6,
        shF: 1.3 + j * 0.8, elF: 0.5 - j * 0.4, shB: 0.6 - j * 0.6, elB: 0.4,
        hipF: 0.2 + j2 * 0.3, knF: -0.3 - abs(j2) * 0.2, hipB: -0.1, knB: -0.1,
        lift: 0.02 + abs(j) * 0.02, face: "sad",
      });
    }
    return pose({
      ...breathe(t, r), lean: -0.06, head: -0.1, look: -0.3,
      shF: 2.0 + j * 0.15, elF: -0.2, shB: 1.75 - j * 0.15, elB: 0.05,
      face: "happy", set: "strings",
    });
  },

  // ——— Sport ———

  pushup: (t, r) => {
    const k = (1 - cos(t * 2 * PI * (0.5 + r * 0.15))) / 2; // 0 bras tendus → 1 en bas
    const h = 0.26 - 0.14 * k; // hauteur des épaules au-dessus du sol
    const rot = Math.acos(min(1, h / 0.665));
    const arm = armIK(rot, 0, 0.03, h);
    return pose({
      rot, lean: 0, head: -0.55, look: 0.2,
      shF: arm.sh, elF: arm.el, shB: arm.sh - 0.06, elB: arm.el,
      hipF: 0.02, knF: 0, hipB: -0.02, knB: 0,
      face: k > 0.7 ? "angry" : "neutral", prop: "mat", symbol: k > 0.85 ? "sweat" : null,
    });
  },

  jumprope: (t, r) => {
    const ph = (t * (1.3 + r * 0.2)) % 1; // tour de corde (0 = au-dessus de la tête)
    const under = max(0, -cos(ph * 2 * PI)); // la corde passe sous les pieds : on saute
    const turn = ph * 2 * PI;
    return pose({
      lean: 0.02, head: -0.05, lift: 0.055 * under ** 1.5,
      shF: 0.3 + 0.12 * sin(turn), elF: 0.45, shB: 0.22 + 0.12 * sin(turn), elB: 0.5,
      hipF: 0.06 + 0.08 * under, knF: -0.25 * (1 - under) - 0.15 * under, hipB: 0.02 + 0.08 * under, knB: -0.2,
      face: "neutral", set: "rope", setK: ph, symbol: t > 3 ? "sweat" : null,
    });
  },

  boxing: (t, r) => {
    const c = (t * 1.6) % 2; // deux coups : direct avant puis arrière
    const front = c < 1, u = front ? c : c - 1;
    const p = sin(min(1, u / 0.45) * PI);
    // Le sac balance après chaque impact.
    const since = (u - 0.22 + 1) % 1 / 1.6;
    const swing = 0.22 * Math.exp(-3 * since) * sin(since * 9);
    return pose({
      lean: 0.12 + 0.06 * p, head: 0.1, look: 0,
      shF: 0.85 + (front ? 0.75 * p : 0), elF: 2.2 - (front ? 2.1 * p : 0),
      shB: 0.65 + (front ? 0 : 0.95 * p), elB: 2.3 - (front ? 0 : 2.2 * p),
      hipF: 0.3, knF: -0.25, hipB: -0.3, knB: -0.1, lift: abs(sin(t * 4)) * 0.006,
      face: "angry", symbol: (t % 4) > 3 ? "sweat" : null, set: "bag", setK: swing,
    });
  },

  plank: (t, r) => {
    const rot = Math.acos(0.15 / 0.665) + wave(t, 7, 0.004);
    return pose({
      rot, lean: 0, head: -0.6, look: 0.1,
      shF: rot, elF: PI / 2 - 0.05, shB: rot - 0.06, elB: PI / 2 - 0.05, // avant-bras au sol
      hipF: 0.02, hipB: -0.02,
      face: t > 2.5 ? "angry" : "neutral", prop: "mat", symbol: t > 3 ? "sweat" : null, set: "timer", setK: t,
    });
  },

  finish: (t, r) => {
    const T = 2.2;
    if (t < T) {
      const w = walkCycle(t, 1.7, 0.72, 1);
      return pose({ ...w, dx: -0.7 + 0.8 * (t / T), lean: 0.28, elF: -1.5, elB: -1.5, lift: w.lift * 3, face: "angry", set: "finish", setK: 0 });
    }
    const k = ease((t - T) / 0.5);
    const j = abs(sin((t - T) * PI * 1.6));
    return pose({
      dx: 0.1 + 0.4 * ease((t - T) / 0.9), lean: 0.25 * (1 - k) - 0.08 * k, head: -0.2 * k, look: k,
      shF: 2.6 * k, elF: 0.3, shB: -2.6 * k, elB: -0.3, hipF: 0.1, knF: -j * 0.3 * k, hipB: -0.1, knB: -j * 0.3 * k,
      lift: j * 0.04 * k, face: "laugh", mouthOpen: 0.7, symbol: "sparkle", set: "finish", setK: 1,
    });
  },

  podium: (t, r) => {
    const wv = wave(t, 1.2, 1);
    return pose({
      lean: -0.05, head: -0.15, look: 0.8, lift: 0.17,
      shF: 2.7 + wv * 0.15, elF: 0.3, shB: -2.5 + wv * 0.15, elB: -0.4,
      hipF: 0.05, hipB: -0.05, face: "laugh", mouthOpen: 0.6, symbol: "sparkle", set: "podium",
    });
  },

  comeback: (t, r) => {
    // Abandonne (à genoux), hésite, se relève et repart en courant.
    const stand = pose({ ...breathe(t, r), lean: 0.25, head: 0.4, look: -0.8, face: "sad", symbol: "sweat" });
    const knee = pose({
      lean: 0.35, head: 0.6, look: -1, shF: 0.9, elF: 1.1, shB: 0.1, elB: 0.2,
      hipF: 1.45, knF: -1.5, hipB: -0.25, knB: -1.35, face: "sad", symbol: t > 1.6 ? "..." : null,
    });
    if (t < 2.4) return lerpPose(stand, knee, ease(t / 0.8));
    const w = walkCycle(t, 1.6, 0.7, 1);
    const run = pose({ ...w, dx: 0.35 * ease((t - 3.2) / 2.5), lean: 0.3, head: -0.05, elF: -1.5, elB: -1.5, lift: w.lift * 3, face: "angry", symbol: "sparkle" });
    return lerpPose(knee, run, ease((t - 2.4) / 0.8));
  },

  // ——— Histoires ———

  sleep: (t, r) => pose({
    rot: PI / 2, lean: 0, head: 0.1 + wave(t, 0.25, 0.02), lift: 0.17,
    shF: 0.15 + wave(t, 0.25, 0.03), elF: 0.1, shB: 0.1, elB: 0.1,
    hipF: 0.02, hipB: -0.02, face: "closed", symbol: (t % 5) < 2.4 ? "zzz" : "dream", set: "bed",
  }),

  door: (t, r) => {
    const arrive = 1.8;
    if (t < arrive) {
      const w = walkCycle(t, 0.8, 0.38);
      return pose({ ...w, dx: -0.45 + 0.4 * ease(t / arrive), lean: 0.06, face: "neutral", set: "door", setK: 0 });
    }
    const open = ease((t - arrive - 0.3) / 0.9);
    const reach = ease((t - arrive) / 0.3) * (1 - ease((t - arrive - 1.1) / 0.4));
    const go = ease((t - arrive - 2) / 1.6);
    const w = go > 0 && go < 1 ? walkCycle(t, 0.7, 0.3) : {};
    return pose({
      ...breathe(t, r), ...w, dx: -0.05 + 0.33 * go, lean: 0.04, head: -0.08 * open, look: 0.3 * open,
      shF: 0.2 + 1.3 * reach + 0.3 * open * (1 - reach), elF: 0.2, shB: -0.1 - 0.3 * open, elB: -0.2,
      face: open > 0.5 ? "happy" : "neutral", symbol: open > 0.8 ? "sparkle" : null, set: "door", setK: open,
    });
  },

  stairs: (t, r) => {
    // Monte les marches une à une jusqu'en haut.
    const n = 6, s = max(0, min(n, (t - 0.3) * 0.85));
    const top = s >= n;
    const w = top ? {} : walkCycle(s * 0.5, 1, 0.34);
    const stepK = s - Math.floor(s);
    return pose({
      ...(top ? breathe(t, r) : w),
      dx: -0.3 + 0.16 * (Math.floor(s) + ease(stepK)), lift: 0.07 * (Math.floor(s) + ease(stepK)),
      lean: top ? 0 : 0.18, head: top ? -0.15 : 0, look: top ? 0.8 : 0.4,
      knF: top ? 0 : (w.knF ?? 0) * 1.6, knB: top ? 0 : (w.knB ?? 0) * 1.6,
      shF: top ? 2.6 : w.shF, elF: top ? 0.4 : w.elF,
      face: top ? "happy" : "neutral", symbol: top ? "sparkle" : null, set: "stairs",
    });
  },

  lamppost: (t, r) => {
    const watch = (t % 6) > 3 && (t % 6) < 4.4;
    const look = sin(t * 0.8 + r * 4);
    return pose({
      ...breathe(t, r), head: watch ? 0.4 : 0.05 + look * 0.1, look: watch ? -0.8 : 0,
      shF: watch ? 0.95 : -0.12, elF: watch ? 1.75 : 0.5, shB: -0.18, elB: 0.5, // mains dans les poches
      dir: look > 0.75 ? -1 : 1,
      face: blink(t, r) ?? "neutral", symbol: (t % 6) > 4.6 ? "..." : null, set: "lamp",
    });
  },

  chase: (t, r) => {
    const w = walkCycle(t, 1.6, 0.7, 1);
    return pose({
      ...w, dx: -0.15 + wave(t, 0.2, 0.08), lean: 0.3, head: -0.15, look: 0.4,
      shF: 1.9 + wave(t, 1.6, 0.15), elF: 0.1, elB: -1.5, lift: w.lift * 3,
      face: "neutral", set: "orb", setK: t,
    });
  },

  stargaze: (t, r) => pose({
    lean: -0.45 + wave(t, 0.15, 0.02), head: -0.35 + wave(t, 0.1, 0.05), look: 1,
    shF: 0.02, elF: 0, shB: 0.1, elB: 0, // appuyé sur les mains, en arrière
    hipF: 1.5, knF: -0.05, hipB: 1.35, knB: -0.6, sit: 1, lie: 1,
    face: blink(t, r) ?? "happy", set: "sky", setK: t,
  }),

  // ——— Trahison, confiance, relations (à deux). G : écart entre les deux personnages (voir DUO_GAP) ———

  betray: (t, r, role, G = DUO_GAP) => {
    if (role === 1) {
      // La victime, de dos, confiante… le coup dans le dos, puis elle se retourne, le cœur brisé.
      const u = sync(t, 1);
      if (u < 1.5) return pose({ ...breathe(u, r), dir: -1, dx: 0.1, head: wave(u, 0.3, 0.05), face: blink(u, r) ?? "happy" });
      if (u < 2.7) {
        const k = ease((u - 1.5) / 0.2);
        return pose({
          dir: -1, dx: 0.1 - 0.04 * k, lean: -0.28 * k + wave(u, 8, 0.012), head: -0.3 * k, look: 0.6,
          shF: 0.12 + 1.0 * k, elF: 0.5 * k, shB: -0.12 - 1.0 * k, elB: -0.5 * k, hipF: 0.04, hipB: -0.12,
          face: "shocked", mouthOpen: 0.9, symbol: "!?",
        });
      }
      const b = ease((u - 2.7) / 0.6);
      return pose({
        ...breathe(u, r), dx: 0.06, lean: 0.12 * b, head: 0.15 + 0.25 * b, look: -0.4 * b,
        ...armF(0.12 * b, 0.05, 0.1), shB: -0.05, elB: -0.1,
        face: u > 3.8 ? "cry" : "pain", symbol: u > 3.8 ? "tear" : "broken",
      });
    }
    // Le traître : s'approche en souriant, couteau caché dans le dos, recule le bras (anticipation), frappe,
    // puis recache le couteau en sifflotant.
    const D = max(0, G - 0.56), P = G - D - 0.1, sl = 0.24;
    const stab = armF(sl, P - 0.15 - shX(sl), 0.09);
    const hidden = { shF: -0.7, elF: -0.6 }, wind = { shF: -1.15, elF: -0.9 };
    let arm = hidden, l = 0.1;
    if (t >= 1.15 && t < 1.4) arm = mix(hidden, wind, ease((t - 1.15) / 0.25));
    else if (t >= 1.4 && t < 1.55) { const k = ease((t - 1.4) / 0.15); arm = mix(wind, stab, k); l += (sl - 0.1) * k; }
    else if (t >= 1.55 && t < 2.5) { arm = stab; l = sl; }
    else if (t >= 2.5) { const k = ease((t - 2.5) / 0.5); arm = mix(stab, hidden, k); l = sl + (0.1 - sl) * k; }
    const w = t < 1.1 ? walkCycle(t, 1.1, 0.2, 0) : {};
    return pose({
      ...breathe(t, r), ...w, dx: D * ease(t / 1.1), lean: l, head: 0.05, ...arm, shB: w.shB ?? -0.15, elB: -0.3,
      hipF: t >= 1.4 && t < 2.6 ? 0.3 : w.hipF ?? 0.05, knF: t >= 1.4 && t < 2.6 ? -0.2 : w.knF ?? 0,
      face: t < 1.55 ? "happy" : t < 2.6 ? "suspicious" : "happy", symbol: t > 2.9 ? "music" : null, set: "knife",
    });
  },

  gossip: (t, r, role) => {
    // Parle dans le dos : l'un glisse des ragots à un voisin (au second plan) ; l'autre, de dos, ne voit rien.
    if (role === 1) return pose({ ...ACTIONS.phone(t, r), dir: -1, dx: -0.12, symbol: t % 5 > 3.6 ? "?" : null });
    const laugh = t % 3.2 > 2.2;
    const lean = 0.1 + (laugh ? wave(t, 5, 0.03) : 0);
    return pose({
      ...breathe(t, r), dx: -0.14, lean, head: laugh ? -0.15 : 0.05,
      ...armF(lean, 0.06, -0.08), ...(laugh ? HIP_HAND : armB(lean, 0.25, -0.06)), // main en cornet, l'autre montre la victime
      face: laugh ? "laugh" : "suspicious", mouthOpen: laugh ? 0.8 : abs(wave(t, 4, 0.4)), symbol: laugh ? "haha" : "...", set: "gossip",
    });
  },

  trust: (t, r, role, G = DUO_GAP) => {
    // Chute de confiance : l'un se laisse tomber en arrière, l'autre le rattrape.
    const u = sync(t, role);
    const f = clamp((u - 1.0) / 0.65);
    const a = 0.75 * f * f + (u > 1.65 ? 0.05 * Math.exp(-5 * (u - 1.65)) * sin((u - 1.65) * 14) : 0);
    if (role === 1) {
      const dx = G - 0.766, lean = 0.25 * ease(u / 0.6);
      const legs = mix({ hipF: 0.04, knF: 0, hipB: -0.04, knB: 0 }, { hipF: 0.5, knF: -0.6, hipB: -0.3, knB: -0.2 }, ease((u - 0.3) / 0.6));
      const fx = (G - dx - 0.061) - (0.08 + 0.42 * sin(a) + SH * sin(a)) - 0.02, fy = 0.633 - (0.42 + SH) * cos(a) + 0.02;
      const k = ease((u - 0.8) / 0.6);
      return pose({
        ...breathe(u, r), dx, lean, head: -0.1, look: 0.2, ...legs,
        ...mix({ ...armF(lean, 0.16, 0.14), ...armB(lean, 0.13, 0.15) }, { ...armF(lean, fx, fy), ...armB(lean, fx - 0.03, fy + 0.02) }, k),
        face: u > 1.8 ? "happy" : "determined", symbol: u > 2.2 ? "sparkle" : null,
      });
    }
    return pose({
      dir: -1, rot: -a, dx: 0.08 + 0.42 * sin(a), lean: 0, head: -0.1 * f + wave(u, 0.3, 0.03) * (1 - f),
      ...CROSSED, hipF: 0.02, hipB: -0.02,
      face: u < 0.5 ? "neutral" : u < 1.75 ? (f > 0.2 ? "fear" : "closed") : "joy", symbol: u > 2.3 ? "heart" : u < 0.9 ? "..." : null,
    });
  },

  handshake: (t, r, role, G = DUO_GAP) => {
    const u = sync(t, role);
    const reach = 0.25, D = (G - 2 * reach) / 2;
    const arm = ease((u - 0.5) / 0.5) * (1 - ease((u - 3.0) / 0.5));
    const shake = u > 1.0 && u < 2.6 ? wave(u, 2.4, 0.035) : 0;
    const w = u < 0.9 && abs(D) > 0.04 ? walkCycle(u, 1.1, 0.25, 0) : {};
    return pose({
      ...breathe(u, r), ...w, dx: D * ease(u / 0.9), lean: 0.05,
      ...mix(F0, armF(0.05, reach - shX(0.05), 0.16 + shake), arm), shB: -0.12, elB: -0.2,
      face: u > 1 ? (role ? "happy" : "joy") : "neutral", symbol: role === 0 && u > 1.2 && u < 3 ? "sparkle" : null,
    });
  },

  promise: (t, r, role, G = DUO_GAP) => {
    // Promesse « petit doigt » : les mains se rejoignent à hauteur de poitrine, puis on hoche la tête.
    const u = sync(t, role);
    const reach = 0.23, D = (G - 2 * reach) / 2;
    const arm = ease((u - 0.4) / 0.5);
    const nod = u > 1.6 && u < 2.8 ? max(0, sin((u - 1.6) * PI * 2.5)) : 0;
    return pose({
      ...breathe(u, r), dx: D * ease(u / 0.8), lean: 0.06, head: 0.05 + 0.2 * nod, look: 0.1,
      ...mix(F0, armF(0.06, reach - shX(0.06), 0.02 + wave(u, 1.2, 0.01)), arm), ...HIP_HAND,
      face: u < 1.6 ? "determined" : "happy", symbol: u > 2 ? (role ? "heart" : "sparkle") : null,
      set: role === 0 ? "twinkle" : null, setK: arm,
    });
  },

  gift: (t, r, role, G = DUO_GAP) => {
    const u = sync(t, role);
    const reach = 0.2, D = (G - 0.52) / 2, T = 2.0;
    const hold = (lean, x, y) => ({ ...armF(lean, x - shX(lean), y), ...armB(lean, x - shX(lean) - 0.02, y + 0.01) });
    if (role === 1) {
      if (u < 1.5) {
        const k = ease((u - 0.6) / 0.3);
        return pose({ ...breathe(u, r), ...mix({ ...F0, ...B0 }, { ...armF(0, 0.07, -0.08), ...armB(0, 0.04, -0.08) }, k), face: k > 0.3 ? "surprised" : "neutral", mouthOpen: 0.5 * k, symbol: k > 0.5 ? "!?" : null });
      }
      const k = ease((u - 1.5) / 0.5), w = u < 2 ? walkCycle(u, 1, 0.22, 0) : {};
      const back = ease((u - 2.3) / 0.6);
      return pose({
        ...breathe(u, r), ...w, dx: D * k - 0.1 * back, lean: 0.05,
        ...mix(hold(0.05, reach, 0.1), hold(0.05, 0.12, 0.07), back),
        lift: u > 2.6 ? abs(sin((u - 2.6) * PI * 1.6)) * 0.03 : 0,
        face: u < 2 ? "happy" : "joy", mouthOpen: 0.5, symbol: u > 2.2 ? "heart" : null, set: u >= T ? "gift" : null,
      });
    }
    const w = t < 1 ? walkCycle(t, 1, 0.25, 0) : {};
    const after = ease((t - T) / 0.5);
    return pose({
      ...breathe(t, r), ...w, dx: D * ease(t / 1) - 0.12 * after, lean: 0.05,
      ...mix(hold(0.05, reach, 0.1), { ...armF(0.05, 0.08, 0.04), ...armB(0.05, 0.06, 0.05) }, after),
      face: t < T ? "happy" : "joy", symbol: t > T + 0.3 ? "sparkle" : null, set: t < T ? "gift" : null,
    });
  },

  propose: (t, r, role, G = DUO_GAP) => {
    // Demande en mariage : un genou à terre, l'écrin s'ouvre ; l'autre est surpris, puis saute de joie.
    const u = sync(t, role);
    if (role === 1) {
      if (u < 2.6) {
        const k = ease((u - 0.9) / 0.4);
        return pose({
          ...breathe(u, r), dx: 0.03, lean: -0.08 * k, head: -0.1 * k, look: -0.3,
          ...mix({ ...F0, ...B0 }, { ...armF(-0.08 * k, 0.07, -0.08), ...armB(-0.08 * k, 0.04, -0.08) }, k),
          face: k > 0.3 ? "surprised" : "neutral", mouthOpen: 0.6 * k, symbol: k > 0.5 ? "!?" : null,
        });
      }
      return pose({ ...ACTIONS.celebrate(u, r), dx: 0.03, face: "love", symbol: "heart" });
    }
    const D = max(0, G - 0.62);
    const stand = pose({ ...breathe(t, r), dx: D, lean: 0.05, ...F0, ...B0, face: "shy" });
    const knee = pose({
      ...KNEEL, dx: D + 0.04, lean: 0.06, head: -0.12, look: 0.6,
      ...armF(0.06, 0.21, -0.04 + wave(t, 0.6, 0.008)), shB: 0.25, elB: 1.4,
      face: "love", symbol: t > 1.9 ? "heart" : null, set: "ring", setK: ease((t - 1.2) / 0.35),
    });
    return lerpPose(stand, knee, ease((t - 0.2) / 0.8));
  },

  kiss: (t, r, role, G = DUO_GAP) => {
    // Bisou sur la joue : l'un se penche, l'autre rougit ; des cœurs s'envolent.
    const u = sync(t, role);
    if (role === 1) {
      const k = ease((u - 1.1) / 0.3);
      return pose({
        ...breathe(u, r), dx: 0.05, head: -0.05 + 0.18 * k, look: 0.2 - 0.6 * k,
        ...armF(0, 0.08, 0.14), ...armB(0, 0.06, 0.15),
        face: u < 1.1 ? "happy" : "shy", symbol: u > 1.6 ? "heart" : null,
      });
    }
    const D = G - 0.35;
    const lk = ease((t - 0.7) / 0.4) * (1 - ease((t - 2.4) / 0.4));
    const w = t < 0.8 ? walkCycle(t, 1, 0.22, 0) : {};
    return pose({
      ...breathe(t, r), ...w, dx: D * ease(t / 0.8), lean: 0.06 + 0.22 * lk, head: -0.12 * lk,
      shF: -0.45, elF: -0.9, shB: -0.55, elB: -0.9, // mains derrière le dos
      hipF: 0.05 + 0.15 * lk, knF: 0, hipB: -0.05 - 0.15 * lk,
      face: lk > 0.5 ? "closed" : "happy", symbol: t > 2.5 ? "heart" : null, set: "hearts", setK: ease((t - 1) / 0.3),
    });
  },

  comfort: (t, r, role, G = DUO_GAP) => {
    // Réconforte : main sur l'épaule de l'autre, qui pleure, puis relève la tête.
    const u = sync(t, role);
    if (role === 1) {
      const up = ease((u - 3.2) / 0.8);
      return pose({
        lean: 0.2 - 0.08 * up + wave(u, 2.6, 0.02) * (1 - up), head: 0.45 - 0.3 * up, look: -1 + up,
        ...mix({ shF: 1.75, elF: 1.75, shB: 1.55, elB: 1.85 }, { shF: 0.1, elF: 0.1, shB: -0.05, elB: 0.1 }, up),
        dx: 0.05, hipF: 0.06, knF: -0.08,
        face: up > 0.5 ? (u > 4.5 ? "happy" : "sad") : "cry", symbol: up > 0.5 ? (u > 4.5 ? "heart" : null) : "tear",
      });
    }
    const D = G - 0.42, dx = D * ease(t / 0.8), P = G - dx - 0.05;
    const k = ease((t - 0.6) / 0.5);
    const w = t < 0.8 && abs(D) > 0.05 ? walkCycle(t, 1, 0.22, 0) : {};
    return pose({
      ...breathe(t, r), ...w, dx, lean: 0.1, head: 0.15, look: -0.2,
      ...mix(F0, armF(0.1, P - SH * sin(0.2) - shX(0.1) - 0.02, 0.01 + max(0, wave(t, 1.2, 0.012))), k),
      shB: -0.1, elB: -0.2,
      face: t > 3.6 ? "happy" : "worried", symbol: t > 4 ? "heart" : null,
    });
  },

  reject: (t, r, role, G = DUO_GAP) => {
    // L'un vient les bras ouverts, l'autre le repousse puis lui tourne le dos.
    const u = sync(t, role);
    if (role === 1) {
      if (u < 1.25) {
        const w = walkCycle(u, 1, 0.3, 0);
        return pose({ ...w, dx: 0.15 * ease(u / 1.1), lean: 0.1, shF: 1.6, elF: 0.3, shB: 1.3, elB: 0.4, face: "happy", symbol: "heart" });
      }
      const b = ease((u - 1.25) / 0.35);
      if (u < 2.3) {
        return pose({
          dx: 0.15 - 0.32 * b, lean: 0.1 - 0.35 * b, head: -0.2 * b, look: 0.2,
          shF: 1.6 + 0.5 * b, elF: 0.3, shB: 1.3 - 2.4 * b, elB: 0.4, hipF: 0.04 + 0.3 * b, knF: -0.2 * b, hipB: -0.2,
          face: "shocked", mouthOpen: 0.8, symbol: "!?",
        });
      }
      return pose({ ...ACTIONS.sad(u, r), dx: -0.17, symbol: "broken" });
    }
    const dx = G - 0.5;
    const push = ease((u - 1.0) / 0.2) * (1 - ease((u - 1.7) / 0.4));
    const lean = 0.05 + 0.12 * push;
    if (u > 2.3) return pose({ ...breathe(u, r), dir: -1, dx, ...CROSSED, head: -0.12, face: "angry", symbol: u < 3.2 ? "anger" : null });
    return pose({
      ...breathe(u, r), dx, lean,
      ...mix(CROSSED, { ...armF(lean, 0.25, 0.08), ...armB(lean, 0.23, 0.1) }, push),
      hipF: 0.04 + 0.3 * push, knF: -0.2 * push, hipB: -0.04 - 0.15 * push,
      face: u > 0.8 ? "angry" : "suspicious", mouthOpen: push * 0.7, symbol: push > 0.5 ? "anger" : null,
    });
  },

  fight: (t, r, role, G = DUO_GAP) => {
    // Bagarre de dessin animé : ils se jettent l'un sur l'autre, puis tout disparaît dans un nuage de poussière.
    const u = sync(t, role);
    const D = max(0, G / 2 - 0.1);
    if (u < 0.7) {
      const w = walkCycle(u, 1.8, 0.7, 1);
      return pose({ ...w, dx: D * ease(u / 0.7), lean: 0.3, elF: -1.5, elB: -1.5, lift: w.lift * 3, face: "angry", symbol: "anger" });
    }
    return pose({
      dx: D + wave(u, 1.3, 0.04), lean: 0.2 + wave(u, 2.1, 0.15), head: wave(u, 3.3, 0.2),
      shF: 1.5 + wave(u, 3.1, 1.2), elF: wave(u, 2.3, 1), shB: wave(u, 2.7, 1.5), elB: wave(u, 1.9, 1),
      hipF: 0.3 + wave(u, 2.9, 0.6), knF: -abs(wave(u, 2.9, 0.6)), hipB: -0.3 + wave(u, 2.4, 0.4), knB: -0.3,
      lift: abs(wave(u, 3, 0.03)), face: "angry", symbol: "anger", set: role === 0 ? "brawl" : null, setK: G / 2,
    });
  },

  forgive: (t, r, role, G = DUO_GAP) => {
    // Pardonne : ouvre les bras ; l'autre hésite, s'approche, et ils s'étreignent.
    const u = sync(t, role);
    const D = (G - 0.3) / 2, hug = ease((u - 2.2) / 0.5);
    const hugArms = { shF: 0.2 + 1.2 * hug, elF: 1.1 * hug, shB: 0.1 + 1.0 * hug, elB: 1.2 * hug };
    if (role === 1) {
      if (u < 1.4) return pose({ ...ACTIONS.sad(u, r), symbol: u > 0.6 ? "..." : null });
      const k = ease((u - 1.4) / 0.8), w = u < 2.2 ? walkCycle(u, 1, 0.25, 0) : {};
      return pose({
        ...breathe(u, r), ...w, dx: D * k, lean: 0.1 * hug, head: 0.3 * (1 - k) + 0.15 * hug, look: -0.3 * (1 - k),
        ...hugArms, face: hug > 0.6 ? "closed" : "worried", symbol: u > 2.8 ? "heart" : null,
      });
    }
    const open = ease((u - 0.9) / 0.5) * (1 - hug);
    return pose({
      ...breathe(u, r), dx: D * ease((u - 2.0) / 0.5), lean: 0.1 * hug - 0.05 * open, head: 0.2 * (1 - open) * (1 - hug) + 0.15 * hug,
      ...mix(hug > 0 ? hugArms : { ...F0, ...B0 }, { shF: 1.9, elF: 0.3, shB: 1.5, elB: 0.5 }, open),
      face: hug > 0.6 ? "closed" : open > 0.3 ? "happy" : "sad", symbol: u > 2.8 ? "sparkle" : null,
    });
  },

  dance: (t, r, role, G = DUO_GAP) => {
    // Danse à deux : mains jointes en l'air, balancement en rythme ; de temps en temps l'un tourne sur lui-même.
    const u = sync(t, role);
    const reach = 0.27, D = (G - 2 * reach) / 2;
    const s = sin(u * 2 * PI);
    const twirl = role === 1 && u % 4 > 2.2 && u % 4 < 2.8;
    const lean = 0.04 + s * 0.05;
    return pose({
      dx: D * ease(u / 0.6) + s * 0.03, lean, head: -s * 0.1, lift: abs(s) * 0.012,
      ...(twirl ? { shF: 2.9, elF: 0.1 } : armF(lean, reach - shX(lean), -0.13)), ...HIP_HAND,
      hipF: 0.1 + 0.15 * max(0, s), knF: -0.3 * max(0, s), hipB: -0.1 + 0.1 * max(0, -s), knB: -0.3 * max(0, -s),
      dir: twirl ? -1 : 1, face: "joy", mouthOpen: 0.4, symbol: role === 0 ? "music" : null,
    });
  },

  confront: (t, r, role, G = DUO_GAP) => {
    // Confrontation : l'un brandit la preuve (téléphone), l'autre est pris sur le fait.
    const u = sync(t, role);
    if (role === 1) {
      const k = ease((u - 1.0) / 0.3);
      return pose({
        ...breathe(u, r), dx: 0.05 - 0.12 * k, lean: -0.12 * k, head: -0.1 * k,
        ...mix({ ...F0, ...B0 }, { ...armF(-0.12, 0.12, -0.06), ...armB(-0.12, 0.1, -0.04) }, k),
        hipF: 0.04 + 0.15 * k, hipB: -0.04 - 0.1 * k,
        face: k > 0.5 ? (u > 2.6 ? "worried" : "shocked") : "neutral", mouthOpen: 0.5 * k, symbol: k > 0.5 ? (u > 2.6 ? "sweat" : "!?") : null,
      });
    }
    const D = max(0, G - 0.62), k = ease((t - 0.4) / 0.5);
    return pose({
      ...breathe(t, r), dx: D * ease(t / 0.8), lean: 0.06, head: -0.05,
      ...mix(F0, armF(0.06, 0.2, -0.1 + wave(t, 1.5, 0.01)), k), ...HIP_HAND,
      face: "angry", mouthOpen: abs(wave(t, 3, 0.6)), symbol: t > 1.2 && t % 3 < 1.2 ? "anger" : null, set: "proof", setK: k,
    });
  },

  friends: (t, r, role, G = DUO_GAP) => {
    // Meilleurs amis : main sur l'épaule, ils rient ensemble.
    const u = sync(t, role);
    const sh = wave(u, 4.5, 1), j = abs(sh), fun = u % 3.4 < 2.2;
    if (role === 1) {
      return pose({
        dx: 0.12, lean: -0.08 + sh * 0.03 * fun, head: -0.2, shF: 0.5, elF: 1.5, shB: -0.4 + sh * 0.15, elB: -1.3,
        hipF: 0.06, hipB: -0.06, lift: fun ? j * 0.008 : 0,
        face: fun ? "laugh" : "happy", mouthOpen: fun ? 0.6 + 0.4 * j : 0.3, symbol: fun ? "haha" : null,
      });
    }
    const D = G - 0.43, k = ease((u - 0.4) / 0.5);
    return pose({
      ...breathe(u, r), dx: D * ease(u / 0.8), lean: 0.05 + (fun ? sh * 0.025 : 0), head: -0.12,
      ...mix(F0, armF(0.05, 0.3, 0.0), k), shB: -0.3 + (fun ? sh * 0.2 : 0), elB: -1.2,
      lift: fun ? j * 0.008 : 0, face: fun ? "laugh" : "happy", mouthOpen: fun ? 0.5 + 0.4 * j : 0.3, symbol: fun ? null : "heart",
    });
  },

  // ——— Émotions (seul) ———

  shock: (t, r) => {
    // Choc : sursaut en arrière, mains au visage, bouche ouverte ; le corps tremble puis se fige.
    const k = ease((t - 0.12) / 0.22), settle = ease((t - 2.6) / 0.8);
    const lean = -0.18 * k + wave(t, 10, 0.012) * (1 - ease((t - 1.5) / 1));
    return pose({
      dx: -0.07 * k, lean, head: -0.2 * k + 0.1 * settle, look: 0.2,
      ...mix(F0, armF(lean, 0.07, -0.09), k * (1 - 0.6 * settle)), ...mix(B0, armB(lean, 0.03, -0.1), k * (1 - settle)),
      hipF: 0.04 + 0.2 * k, knF: -0.1 * k, hipB: -0.04 - 0.1 * k, lift: 0.02 * sin(clamp((t - 0.12) / 0.3) * PI),
      face: k > 0.3 ? "shocked" : "neutral", mouthOpen: k, symbol: t < 2 ? "!?" : "...", set: "burst", setK: 1 - ease((t - 0.3) / 0.9),
    });
  },

  doubt: (t, r) => {
    // Doute / méfiance : bras croisés, regarde par-dessus son épaule ; un petit nuage gris tourne au-dessus de la tête.
    const c = t % 4, glance = c > 2.2 && c < 3.0;
    return pose({
      ...breathe(t, r), ...CROSSED, head: 0.2 + wave(t, 0.4, 0.06), look: glance ? 0.2 : -0.4, dir: glance ? -1 : 1,
      hipF: 0.12, knF: -0.05, hipB: -0.08,
      face: glance ? "suspicious" : blink(t, r) ?? "worried", symbol: glance ? "?" : c < 1.4 ? "..." : null, set: "doubt",
    });
  },

  proud: (t, r) => {
    // Fier / sait ce qu'il vaut : se redresse, menton levé, main sur le cœur, halo doré.
    const k = ease(t / 0.9), lean = -0.06 * k + wave(t, 0.25, 0.015);
    return pose({
      ...breathe(t, r), lean, head: -0.18 * k, look: 0.3 * k,
      ...mix(F0, armF(lean, 0.06, 0.1), k), shB: -0.3, elB: -1.6 * k, hipF: 0.12, hipB: -0.12, lift: 0.004 * k,
      face: k > 0.5 ? "proud" : "neutral", symbol: t > 1 ? "sparkle" : null, set: "glow", setK: k,
    });
  },

  scared: (t, r) => {
    // Peur : recule en tremblant, se protège le visage ; une ombre menaçante grandit devant lui.
    const tr = wave(t, 9, 1), k = ease(t / 0.4), lean = -0.1 * k + tr * 0.012;
    return pose({
      dx: -0.08 * k + tr * 0.004, lean, head: 0.15 + tr * 0.03, look: 0.2,
      ...mix({ ...F0, ...B0 }, { ...armF(lean, 0.1, -0.05), ...armB(lean, 0.07, -0.02) }, k),
      hipF: 0.04 + 0.3 * k, knF: -0.6 * k, hipB: -0.04 + 0.2 * k, knB: -0.5 * k,
      face: "fear", mouthOpen: 0.4, symbol: t % 2 < 1 ? "sweat" : "!?", set: "shadow", setK: ease(t / 2),
    });
  },

  hide: (t, r) => {
    // Se cache derrière un buisson, sort la tête pour regarder, puis replonge.
    const c = (t + 0.4) % 3.4;
    const up = ease((c - 1.0) / 0.35) * (1 - ease((c - 2.6) / 0.3));
    const low = { lean: 0.45, hipF: 1.75, knF: -2.45, hipB: 1.6, knB: -2.4, shF: 0.9, elF: 1.3, shB: 0.8, elB: 1.4, head: 0.2 };
    const peek = { lean: 0.2, hipF: 0.9, knF: -1.4, hipB: 0.75, knB: -1.3, ...armF(0.2, 0.16, 0.12), ...armB(0.2, 0.14, 0.13), head: -0.05 };
    const lookAround = c > 1.6 && c < 2.3 ? -0.6 : 0.2;
    return pose({ ...mix(low, peek, up), look: up > 0.5 ? lookAround : -0.3, face: up > 0.5 ? "suspicious" : "fear", symbol: up > 0.5 ? null : "...", set: "bush", setK: up });
  },

  pray: (t, r) => {
    // Prière : se met à genoux, mains jointes, tête baissée ; une lumière descend.
    const k = ease((t - 0.2) / 0.8), lean = 0.08 + wave(t, 0.25, 0.015);
    const stand = pose({ ...breathe(t, r), head: 0.2, face: "neutral", set: "light", setK: 0 });
    const kneel = pose({
      ...KNEEL, lean, head: 0.35 + wave(t, 0.2, 0.03), look: -0.5, ...armF(lean, 0.1, -0.03), ...armB(lean, 0.085, -0.02),
      face: "closed", symbol: t > 2.4 ? "sparkle" : null, set: "light", setK: ease((t - 0.8) / 1.5),
    });
    return lerpPose(stand, kneel, k);
  },

  hope: (t, r) => {
    // Espoir : lève les yeux vers la lumière, mains jointes sur la poitrine, se hisse sur la pointe des pieds.
    const k = ease(t / 1.2), lean = -0.1 * k + wave(t, 0.25, 0.015);
    return pose({
      ...breathe(t, r), lean, head: -0.3 * k, look: k,
      ...mix({ ...F0, ...B0 }, { ...armF(lean, 0.09, 0.06), ...armB(lean, 0.07, 0.07) }, k),
      lift: 0.006 * k + max(0, wave(t, 0.5, 0.004)), face: k > 0.5 ? "happy" : "neutral", symbol: t > 1.5 ? "sparkle" : null, set: "light", setK: k,
    });
  },

  facepalm: (t, r) => {
    // La main claque sur le front, la tête tombe dedans et secoue doucement.
    const k = ease((t - 0.35) / 0.2), lean = 0.08 + 0.1 * k;
    const hit = t > 0.55 && t < 0.85;
    return pose({
      ...breathe(t, r), lean, head: -0.12 * (1 - k) + (0.3 + wave(t, 0.6, 0.06)) * k, look: -0.3,
      ...mix({ shF: 0.3, elF: 0.4 }, armF(lean, 0.09, -0.11), k), shB: -0.1, elB: -0.2,
      face: k > 0.5 ? "closed" : "bored", symbol: t > 1 ? (t % 3 < 1.5 ? "sweat" : "...") : null, set: "clap", setK: hit ? 1 - (t - 0.55) / 0.3 : 0,
    });
  },

  nod: (t, r) => {
    // Dit oui : hoche la tête par séries, pouce levé.
    const c = t % 2.6, n = c < 1.2 ? sin(c * 2 * PI * 2.2) * (1 - c / 1.2) : 0;
    const k = ease(t / 0.4);
    return pose({
      ...breathe(t, r), head: 0.06 + 0.22 * n, look: 0.1, ...mix(F0, armF(0.03, 0.14, 0.02), k),
      face: "happy", symbol: null, set: "yes", setK: k,
    });
  },

  refuse: (t, r) => {
    // Dit non : agite l'index, secoue la tête.
    const wag = wave(t, 2.6, 1), lean = -0.04, a = armF(lean, 0.12, -0.1);
    return pose({
      ...breathe(t, r), lean, head: 0.05 + wave(t, 1.3, 0.1), shF: a.shF, elF: a.elF + wag * 0.3, ...HIP_HAND,
      face: "determined", mouthOpen: abs(wave(t, 2, 0.4)), set: "nope", setK: ease(t / 0.4),
    });
  },

  bow: (t, r) => {
    // Révérence / merci : s'incline lentement, main sur le ventre, puis se redresse.
    const c = t % 4.2, k = ease((c - 0.3) / 0.7) * (1 - ease((c - 2.6) / 0.7));
    return pose({
      ...breathe(t, r), lean: 0.55 * k, head: 0.4 * k, look: -0.3 * k,
      shF: 0.3 + 0.1 * k, elF: 1.3, shB: -0.5, elB: 1.2,
      face: k > 0.4 ? "closed" : "happy", symbol: c > 3.1 ? "sparkle" : null,
    });
  },

  apologize: (t, r) => {
    // S'excuse : s'incline, mains jointes ; puis se gratte la tête, gêné.
    const c = t % 4.6, k = ease((c - 0.2) / 0.5) * (1 - ease((c - 2.4) / 0.5));
    const sc = ease((c - 2.6) / 0.4) * (1 - ease((c - 4.2) / 0.3));
    const arms = mix(mix({ ...F0, ...B0 }, { shF: 0.9, elF: 1.0, shB: 0.8, elB: 1.1 }, k), { shF: 2.7, elF: 1.5 + wave(t, 3, 0.2), shB: -0.15, elB: -0.2 }, sc);
    return pose({
      ...breathe(t, r), lean: 0.45 * k, head: 0.35 * k + 0.15 * sc, look: -0.4 * k, ...arms,
      face: k > 0.4 ? "worried" : sc > 0.3 ? "shy" : "worried", symbol: "sweat",
    });
  },

  wakeup: (t, r) => {
    // Réveil : grand étirement en bâillant sur la pointe des pieds, le soleil se lève, puis se frotte l'œil.
    const s = ease((t - 0.3) / 0.8) * (1 - ease((t - 2.6) / 0.7)), rub = ease((t - 3.3) / 0.4);
    const lean = -0.12 * s;
    return pose({
      ...breathe(t, r), lean, head: -0.3 * s + 0.12 * (1 - s), look: 0.3 * s,
      ...mix(mix(F0, { shF: 2.95, elF: 0.05 }, s), armF(lean, 0.08, -0.1 + wave(t, 2.5, 0.01)), rub * (1 - s)),
      ...mix(B0, { shB: 2.8, elB: 0.1 }, s), lift: 0.012 * s,
      face: s > 0.4 ? "surprised" : rub > 0.5 ? "closed" : t > 4 ? "happy" : "bored", mouthOpen: s, symbol: s > 0.4 ? "zzz" : null,
      set: "sunrise", setK: ease(t / 4),
    });
  },

  dizzy: (t, r) => {
    // Étourdi : vacille en rond, bras écartés pour l'équilibre ; des étoiles tournent autour de la tête.
    const a = t * 2 * PI * 0.55, s = sin(a);
    return pose({
      dx: cos(a) * 0.05, lean: s * 0.16, head: -sin(a + 0.8) * 0.25, look: cos(a * 1.3) * 0.5,
      shF: 0.6 + sin(a + 1) * 0.4, elF: 0.3, shB: -0.6 + sin(a + 2) * 0.4, elB: -0.3,
      hipF: 0.12 + s * 0.12, knF: -0.15 - max(0, s) * 0.2, hipB: -0.12 + s * 0.12, knB: -0.15 - max(0, -s) * 0.2,
      face: "dizzy", set: "stars",
    });
  },

  jealous: (t, r) => {
    // Jaloux : bras croisés, regard noir, tape du pied ; une aura verte ondule autour de lui.
    const c = t % 2.8, stomp = c > 2.3 ? sin(((c - 2.3) / 0.5) * PI) : 0;
    return pose({
      ...breathe(t, r), ...CROSSED, lean: 0.06, head: 0.12 + wave(t, 0.3, 0.04), look: -0.2,
      hipF: 0.04 + 0.35 * stomp, knF: -0.5 * stomp,
      face: t % 5 > 3.5 ? "angry" : "suspicious", symbol: t % 4 < 1 ? "anger" : null, set: "envy",
    });
  },

  sick: (t, r) => {
    // Malade : grelotte, thermomètre dans la bouche… et éternue (« Atchoum ! »).
    const c = t % 3.8, pre = ease((c - 2.2) / 0.6);
    const sk = c > 2.8 && c < 3.6 ? ease((c - 2.8) / 0.12) * (1 - ease((c - 3.0) / 0.5)) : 0;
    const lean = 0.18 - 0.2 * pre * (1 - sk) + 0.35 * sk + wave(t, 7, 0.01);
    return pose({
      lean, head: 0.25 - 0.4 * pre * (1 - sk) + 0.3 * sk, look: -0.3,
      shF: 0.7, elF: 1.95, shB: 0.6, elB: 2.0, hipF: 0.06, knF: -0.12, hipB: -0.06, knB: -0.08,
      face: sk > 0.3 ? "closed" : pre > 0.3 ? "surprised" : "pain", mouthOpen: pre * 0.6 * (1 - sk) + sk,
      symbol: c < 2 ? "sweat" : null, set: "sick", setK: sk > 0.05 ? sk : pre > 0.3 ? 0.01 : 0,
    });
  },

  scheme: (t, r) => {
    // Prépare sa vengeance : se frotte les mains, sourire en coin, puis rire diabolique.
    const rub = wave(t, 3.2, 1), cackle = t % 4 > 2.6;
    const lean = 0.2 + (cackle ? -0.25 + wave(t, 6, 0.03) : 0);
    return pose({
      ...breathe(t, r), lean, head: cackle ? -0.3 : 0.25, look: cackle ? 0.5 : 0.4,
      ...armF(lean, 0.12 + rub * 0.025, 0.08), ...armB(lean, 0.1 - rub * 0.025, 0.09),
      hipF: 0.15, knF: -0.15, hipB: -0.12, knB: -0.1,
      face: cackle ? "laugh" : "suspicious", mouthOpen: cackle ? 0.8 : 0, symbol: cackle ? "haha" : null, set: "evil",
    });
  },

  eavesdrop: (t, r) => {
    // Écoute aux portes : l'oreille collée au mur, la main en cornet ; des bulles de l'autre côté.
    const c = t % 4.2, gasp = c > 2.8 && c < 3.8, lean = 0.3 + (gasp ? -0.12 : 0);
    return pose({
      dx: 0.07 - (gasp ? 0.04 : 0), lean, head: 0.35 + wave(t, 0.4, 0.03), look: 0,
      ...armF(lean, 0.3 - 0.07 - shX(lean), -0.03), ...armB(lean, 0.06, -0.1),
      hipF: 0.2, knF: -0.15, hipB: -0.15, knB: -0.05,
      face: gasp ? "shocked" : blink(t, r) ?? "suspicious", mouthOpen: gasp ? 0.6 : 0, symbol: gasp ? "!?" : null, set: "listenwall",
    });
  },

  // ——— Vie quotidienne ———

  work: (t, r) => {
    // Travaille sur un ordinateur portable, assis à un bureau.
    const lean = 0.15, ty = (k) => abs(sin(t * (7 + k) + k)) * 0.012;
    return pose({
      ...SEATED, lean: lean + wave(t, 0.25, 0.01), head: 0.18 + wave(t, 0.3, 0.03), look: -0.1,
      ...armF(lean, 0.2, 0.1 - ty(0)), ...armB(lean, 0.17, 0.1 - ty(1.7)),
      face: blink(t, r) ?? "neutral", symbol: t % 6 > 4.6 ? "idea" : t % 6 > 3 ? "..." : null, set: "desk",
    });
  },

  study: (t, r) => {
    // Étudie : écrit dans un cahier, assis au bureau sous une lampe.
    const lean = 0.25;
    return pose({
      ...SEATED, lean, head: 0.35 + wave(t, 0.3, 0.03), look: -0.8,
      ...armF(lean, 0.18 + wave(t, 1.6, 0.025), 0.12 + wave(t, 4.5, 0.006)), ...armB(lean, 0.15, 0.13),
      face: blink(t, r) ?? "pensive", symbol: t % 5 > 3.8 ? "idea" : null, set: "study",
    });
  },

  teach: (t, r) => {
    // Enseigne : montre le tableau avec une baguette, puis explique en faisant des gestes.
    const c = t % 5, show = c < 3;
    const lean = 0.02;
    return pose({
      ...breathe(t, r), lean, head: show ? -0.1 : 0.05, look: show ? 0.3 : 0,
      ...(show ? armF(lean, 0.24, -0.16 + wave(t, 0.8, 0.05)) : { shF: 0.9 + wave(t, 1, 0.3), elF: 0.9 }),
      ...(show ? HIP_HAND : { shB: 0.5 + wave(t, 1.3, 0.3), elB: 1.2 }),
      face: "talk", mouthOpen: abs(wave(t, 3.3, 0.7)), set: "board",
    });
  },

  cook: (t, r) => {
    // Cuisine : poêle sur le feu, fait sauter la crêpe de temps en temps.
    const c = t % 2.4, toss = c > 1.4 && c < 1.8 ? sin(((c - 1.4) / 0.4) * PI) : 0;
    const lean = 0.08;
    return pose({
      ...breathe(t, r), lean, head: 0.25, look: -0.5 + toss * 0.8,
      ...armF(lean, 0.17, 0.2 - 0.06 * toss), ...HIP_HAND,
      face: toss > 0.3 ? "joy" : blink(t, r) ?? "happy", symbol: t > 3 && t % 5 < 1.5 ? "sparkle" : null, set: "stove", setK: c,
    });
  },

  eat: (t, r) => {
    // Mange un burger : le porte à la bouche, croque, mâche.
    const c = t % 2.4, bite = ease((c - 0.2) / 0.35) * (1 - ease((c - 0.9) / 0.35));
    const chew = c > 1.1 ? abs(wave(t, 2.5, 1)) : 0;
    return pose({
      ...breathe(t, r), head: 0.05 - 0.05 * bite, look: -0.2,
      ...mix(armF(0.03, 0.12, 0.09), armF(0.03, 0.08, -0.08), bite), ...armB(0.03, 0.1, 0.1),
      face: chew ? "happy" : "neutral", mouthOpen: bite > 0.6 ? 0.8 : chew * 0.35, symbol: c > 1.6 && t > 2 ? "heart" : null,
      set: "burger", setK: Math.floor((t + 1.5) / 2.4),
    });
  },

  coffee: (t, r) => {
    // Boit un café : tasse fumante, gorgée de temps en temps.
    const c = t % 3.2, sip = ease((c - 1.6) / 0.4) * (1 - ease((c - 2.6) / 0.4));
    return pose({
      ...breathe(t, r), head: 0.12 - 0.22 * sip, look: -0.3 + 0.3 * sip,
      ...mix(armF(0.02, 0.12, 0.08), armF(-0.02, 0.08, -0.07), sip), shB: -0.15, elB: 0.6,
      face: sip > 0.5 ? "closed" : blink(t, r) ?? "happy", symbol: sip > 0.5 ? null : t % 6.4 > 4 ? "heart" : null, set: "cup", setK: sip,
    });
  },

  drive: (t, r) => {
    // Conduit : assis dans la voiture, mains au volant ; la route défile.
    const steer = wave(t, 0.4, 0.02), lean = 0.06;
    return pose({
      ...SEATED, lean, head: -0.05 + wave(t, 0.5, 0.04), look: 0.1, lift: abs(wave(t, 1.7, 0.004)),
      ...armF(lean, 0.19, 0.06 + steer), ...armB(lean, 0.17, 0.08 - steer),
      face: blink(t, r) ?? "happy", symbol: t % 7 > 5.5 ? "music" : null, set: "car", setK: t,
    });
  },

  travel: (t, r) => {
    // Voyage : marche en tirant sa valise à roulettes ; un avion passe dans le ciel.
    const w = walkCycle(t, 0.9, 0.38);
    return pose({
      ...w, dx: -0.3 + 0.6 * clamp(t / 7), lean: 0.06, head: -0.05, look: 0.2,
      shB: -0.42 + w.shB * 0.1, elB: 0.05, face: blink(t, r) ?? "happy", set: "suitcase", setK: t,
    });
  },

  bike: (t, r) => {
    // Fait du vélo : pédale (les pieds tournent avec le pédalier), le décor défile.
    const th = t * 2 * PI * 1.1, R = 0.075, cx = 0.07, cy = 0.33;
    const fF = legIK(cx + R * sin(th), cy + R * cos(th)), fB = legIK(cx - R * sin(th), cy - R * cos(th));
    const lean = 0.42;
    return pose({
      lean, head: -0.32, look: 0.3, ...armF(lean, 0.2, 0.12), ...armB(lean, 0.19, 0.125),
      hipF: fF.hip, knF: fF.kn, hipB: fB.hip, knB: fB.kn, lift: 0.05 + R * (1 - abs(cos(th))),
      face: "happy", set: "bike", setK: th,
    });
  },

  shopping: (t, r) => {
    // Shopping : marche, un sac dans chaque main.
    const w = walkCycle(t, 0.9, 0.36, 0.12);
    return pose({
      ...w, dx: -0.3 + 0.6 * clamp(t / 7), lean: 0.04, head: -0.08, elF: -0.08, elB: -0.08,
      face: "joy", mouthOpen: 0.3, symbol: t % 4 > 2.8 ? "heart" : null, set: "bags", setK: t,
    });
  },

  clean: (t, r) => {
    // Fait le ménage : balaie, la poussière s'envole.
    const s = sin(t * 2 * PI * 0.9), lean = 0.22;
    return pose({
      ...breathe(t, r), lean, head: 0.3, look: -0.6,
      ...armF(lean, 0.13 + 0.07 * s, 0.2), ...armB(lean, 0.06 + 0.05 * s, 0.03),
      hipF: 0.2, knF: -0.15, hipB: -0.15, knB: -0.05,
      face: t > 3 ? "happy" : "neutral", symbol: t > 3.4 ? "sparkle" : null, set: "broom", setK: s,
    });
  },

  money: (t, r) => {
    // Argent : compte ses billets ; il en pleut tout autour.
    const flick = abs(sin(t * PI * 2.2));
    return pose({
      ...breathe(t, r), head: 0.2, look: -0.5,
      ...armF(0.03, 0.15 + 0.03 * flick, 0.05 - 0.02 * flick), ...armB(0.03, 0.12, 0.08),
      face: "joy", mouthOpen: 0.4, symbol: t % 4 < 2 ? "sparkle" : null, set: "cash", setK: t,
    });
  },

  late: (t, r) => {
    // En retard : regarde sa montre, sursaute, puis court ; la grande horloge s'affole.
    if (t < 1.4) {
      const k = ease(t / 0.4), s = ease((t - 0.8) / 0.15);
      return pose({
        ...breathe(t, r), head: 0.3 * k - 0.2 * s, look: -0.6 * k, ...mix(F0, armF(0.03, 0.13, 0.05), k * (1 - s * 0.5)),
        face: s > 0.5 ? "shocked" : "neutral", mouthOpen: s, symbol: s > 0.5 ? "!?" : null, set: "clock", setK: 0,
      });
    }
    const w = walkCycle(t, 1.8, 0.75, 1);
    return pose({
      ...w, dx: wave(t, 0.25, 0.06), lean: 0.3, head: -0.05, elF: -1.5, elB: -1.5, lift: w.lift * 3,
      face: "fear", symbol: "sweat", set: "clock", setK: ease((t - 1.4) / 0.3),
    });
  },

  knock: (t, r) => {
    // Frappe à la porte (toc toc), attend… la porte s'ouvre.
    const open = ease((t - 3.0) / 0.9), c = t % 1.5;
    const tap = t < 2.8 && c < 0.75 ? abs(sin(c * PI * 4)) : 0;
    const lean = 0.05 - 0.08 * open;
    return pose({
      ...breathe(t, r), dx: -0.15 - 0.05 * open, lean, head: -0.05 * open, look: 0.3 * open,
      ...mix(armF(lean, 0.2 - 0.05 * tap, -0.02), F0, open), shB: -0.1, elB: -0.2,
      face: open > 0.5 ? "happy" : t > 1.6 ? blink(t, r) ?? "neutral" : "neutral", symbol: open > 0.8 ? "sparkle" : t > 1.6 && t < 3 ? "..." : null,
      set: "knock", setK: open,
    });
  },

  selfie: (t, r) => {
    // Selfie : téléphone à bout de bras, signe « V », sourire… flash !
    const c = t % 2.2, lean = -0.05;
    return pose({
      ...breathe(t, r), lean, head: -0.15 + (t % 4.4 < 2.2 ? 0.1 : -0.1), look: 0.4,
      ...armF(lean, 0.2, -0.18), ...armB(lean, 0.05, -0.13),
      face: c < 1.4 ? "happy" : "joy", set: "selfie", setK: c > 1.6 && c < 1.8 ? 1 - (c - 1.6) / 0.2 : 0,
    });
  },

  sing: (t, r) => {
    // Chante au micro : l'autre bras s'envole sur les notes tenues.
    const held = t % 3 > 1.8, lean = held ? -0.1 : 0.03;
    return pose({
      ...breathe(t, r), lean, head: held ? -0.25 : 0.05 + wave(t, 1.2, 0.05), look: held ? 0.5 : 0,
      ...armF(lean, 0.09, -0.06), shB: held ? 2.2 : 0.4 + wave(t, 0.6, 0.3), elB: held ? 0.3 : 0.6,
      face: held ? "closed" : "talk", mouthOpen: held ? 0.9 : abs(wave(t, 3, 0.8)), symbol: "music", set: "mic", setK: t,
    });
  },

  guitar: (t, r) => {
    // Joue de la guitare : gratte les cordes, tape du pied, hoche la tête.
    const strum = wave(t, 2.4, 1), lean = 0.05;
    return pose({
      ...breathe(t, r), lean, head: 0.15 + abs(strum) * 0.08, look: -0.4,
      ...armF(lean, 0.22, 0.13 + wave(t, 0.7, 0.01)), ...armB(lean, 0.07, 0.19 + strum * 0.035),
      hipF: 0.12 + max(0, wave(t, 1.2, 0.12)), knF: -0.1,
      face: t % 4 > 2.5 ? "closed" : "joy", symbol: "music", set: "guitar", setK: t,
    });
  },

  paint: (t, r) => {
    // Peint sur une toile : le tableau se remplit peu à peu.
    const lean = 0.06;
    return pose({
      ...breathe(t, r), lean, head: 0.05, look: 0.1,
      ...armF(lean, 0.2 + wave(t, 0.7, 0.03), -0.06 + wave(t, 1.3, 0.04)), shB: 0.5, elB: 1.2,
      face: blink(t, r) ?? "happy", symbol: t > 3.5 ? "sparkle" : null, set: "easel", setK: clamp(t / 5),
    });
  },

  plant: (t, r) => {
    // Arrose une plante qui pousse et fleurit.
    const lean = 0.15;
    return pose({
      ...breathe(t, r), lean, head: 0.3, look: -0.6, ...armF(lean, 0.17, 0.13), ...HIP_HAND,
      face: t > 3 ? "joy" : "happy", symbol: t > 3.4 ? "sparkle" : null, set: "plant", setK: ease((t - 0.4) / 3),
    });
  },

  peak: (t, r) => {
    // Au sommet de la montagne : brandit le drapeau, le plante, lève les bras.
    const T = 1.5, k = ease((t - T) / 0.4);
    const raise = { ...armF(-0.02, 0.1, -0.14), ...armB(-0.02, 0.09, -0.04) };
    return pose({
      ...breathe(t, r), lean: -0.04, head: -0.15, look: 0.6, lift: 0.3,
      ...mix(raise, { shF: 2.6 + wave(t, 1.2, 0.1), elF: 0.4, shB: -2.5, elB: -0.4 }, k),
      face: t > T ? "joy" : "determined", mouthOpen: 0.4 * k, symbol: t > T + 0.3 ? "sparkle" : null, set: "peak", setK: t < T ? 0 : 1,
    });
  },

  swim: (t, r) => {
    // Nage le crawl (les jambes restent sous l'eau : le corps ne monte ni ne descend).
    const th = t * 2 * PI * 0.65;
    return pose({
      rot: 1.1, lean: 0, head: -0.45, look: 0.4,
      shF: th, elF: 0.25, shB: th + PI, elB: 0.25,
      hipF: -0.05 + wave(t, 2.2, 0.15), knF: -0.1, hipB: 0.15, knB: 0,
      face: "happy", set: "water", setK: t,
    });
  },

  fish: (t, r) => {
    // Pêche : attend, le bouchon plonge, il ferre et sort un poisson.
    const c = t % 6, pull = ease((c - 3.6) / 0.3) * (1 - ease((c - 5.6) / 0.4));
    const lean = 0.05 - 0.15 * pull;
    return pose({
      ...breathe(t, r), lean, head: 0.15 - 0.3 * pull, look: -0.2 + 0.6 * pull,
      ...mix({ ...armF(0.05, 0.14, 0.08), ...armB(0.05, 0.04, 0.17) }, { ...armF(lean, 0.1, -0.06), ...armB(lean, 0.02, 0.08) }, pull),
      hipF: 0.1 + 0.15 * pull, hipB: -0.1 - 0.1 * pull,
      face: pull > 0.5 ? "joy" : c > 3.2 ? "surprised" : blink(t, r) ?? "neutral",
      symbol: c > 3.2 && c < 3.7 ? "!?" : pull > 0.5 ? "sparkle" : null, set: "fishing", setK: c,
    });
  },

  applause: (t, r) => {
    // Applaudit avec enthousiasme.
    const open = abs(sin(t * PI * 2.6)), lean = 0.03;
    return pose({
      ...breathe(t, r), lean, head: -0.08, look: 0.3,
      ...armF(lean, 0.16, 0.05), ...armB(lean, 0.16 - 0.09 * open, 0.06),
      face: "joy", mouthOpen: 0.5, symbol: t % 3 < 1.5 ? "sparkle" : null, set: "clap", setK: max(0, 1 - open * 4),
    });
  },

  graduate: (t, r) => {
    // Diplômé : s'accroupit, saute et lance sa toque en l'air ; elle retombe sur sa tête.
    const c = t % 4.2;
    const crouch = ease((c - 0.9) / 0.3) * (1 - ease((c - 1.2) / 0.12));
    const air = c > 1.3 && c < 1.9 ? sin(((c - 1.3) / 0.6) * PI) : 0;
    const up = ease((c - 1.2) / 0.2) * (1 - ease((c - 3.2) / 0.5));
    return pose({
      lean: 0.15 * crouch - 0.05 * up, head: -0.25 * up, look: up,
      shF: 0.14 + 2.7 * up, elF: 0.3 - 0.45 * crouch, ...armB(0.05, 0.1, 0.1),
      hipF: 0.04 + 0.9 * crouch, knF: -1.3 * crouch, hipB: -0.04 + 0.8 * crouch, knB: -1.2 * crouch, lift: air * 0.09,
      face: up > 0.3 ? "joy" : "proud", mouthOpen: up * 0.6, symbol: up > 0.5 ? "sparkle" : null, set: "gradcap", setK: c,
    });
  },

  birthday: (t, r) => {
    // Anniversaire : fait un vœu, souffle les bougies, puis fait la fête.
    const blow = ease((t - 1.6) / 0.3) * (1 - ease((t - 2.4) / 0.3));
    const party = ease((t - 2.7) / 0.4);
    const j = party ? abs(sin((t - 2.7) * PI * 1.5)) * party : 0;
    const wish = t > 0.5 && t < 1.5;
    return pose({
      ...breathe(t, r), lean: 0.3 * blow - 0.05 * party, head: 0.15 * blow - 0.15 * party, look: party,
      ...mix(mix({ ...F0, ...B0 }, { ...armF(0.03, 0.1, 0.05), ...armB(0.03, 0.08, 0.06) }, wish ? 1 : 0), { shF: 2.7, elF: 0.25, shB: -2.7, elB: -0.25 }, party),
      lift: j * 0.05, knF: -j * 0.3, knB: -j * 0.3,
      face: blow > 0.3 ? "surprised" : wish ? "closed" : party > 0.5 ? "joy" : "happy", mouthOpen: blow ? 0.9 : party * 0.6,
      symbol: party > 0.5 ? "sparkle" : null, set: "cake", setK: ease((t - 1.8) / 0.4),
    });
  },

  grave: (t, r) => {
    // Deuil : dépose des fleurs devant la tombe, à genoux, tête baissée.
    const k = ease((t - 0.9) / 0.9), place = ease((t - 1.6) / 0.5) * (1 - ease((t - 2.3) / 0.5));
    const lean = 0.08 + 0.25 * place;
    const stand = pose({ ...breathe(t, r), head: 0.35, look: -0.6, ...armF(0.03, 0.12, 0.08), shB: -0.05, elB: -0.1, face: "sad" });
    const kneel = pose({
      ...KNEEL, lean, head: 0.5 - 0.2 * place, look: -0.8,
      ...mix({ shF: 0.9, elF: 1.1 }, armF(lean, 0.27, 0.25), place), shB: 0.1, elB: 0.3,
      face: "sad", symbol: t > 3.2 ? "tear" : null,
    });
    return { ...lerpPose(stand, kneel, k), set: "grave", setK: t > 2.05 ? 1 : 0 };
  },

  freedom: (t, r) => {
    // Liberté : tire sur ses chaînes, les brise, et lève les bras au ciel.
    const T = 1.5;
    if (t < T) {
      const lean = 0.15 + wave(t, 7, 0.012);
      return pose({
        lean, head: 0.15, look: -0.3, ...armF(lean, 0.12, 0.17 + wave(t, 6, 0.01)), ...armB(lean, 0.11, 0.18),
        hipF: 0.25, knF: -0.3, hipB: -0.2, knB: -0.15,
        face: "determined", symbol: "sweat", set: "chains", setK: t / T,
      });
    }
    const k = ease((t - T) / 0.25), j = abs(sin((t - T) * PI * 1.3)) * ease((t - T) / 0.3) * (t < T + 2.4 ? 1 : 0);
    return pose({
      lean: 0.15 - 0.2 * k, head: -0.25 * k, look: k,
      shF: 0.5 + 2.3 * k, elF: 0.25, shB: -0.5 - 2.3 * k, elB: -0.25, hipF: 0.1, knF: -j * 0.3, hipB: -0.1, knB: -j * 0.3,
      lift: j * 0.05, face: "joy", mouthOpen: 0.6, symbol: "sparkle", set: "chains", setK: 1 + (t - T),
    });
  },

  trapped: (t, r) => {
    // Enfermé dans une cage : secoue les barreaux, puis s'affaisse.
    const c = t % 5, slump = ease((c - 3.2) / 0.5) * (1 - ease((c - 4.6) / 0.4));
    const sh = wave(t, 3, 1) * (1 - slump);
    const lean = 0.08 + 0.2 * slump + sh * 0.03;
    return pose({
      dx: 0.02 + sh * 0.012, lean, head: 0.05 + 0.4 * slump, look: -0.6 * slump,
      ...armF(lean, 0.27 - shX(lean), 0.02 + 0.1 * slump), ...armB(lean, 0.25 - shX(lean), -0.04 + 0.1 * slump),
      hipF: 0.15, knF: -0.1 - 0.2 * slump, hipB: -0.12, knB: -0.1 * slump,
      face: slump > 0.5 ? "sad" : "fear", mouthOpen: slump > 0.5 ? 0 : abs(sh) * 0.5, symbol: slump > 0.5 ? "..." : "sweat", set: "cage",
    });
  },

  announce: (t, r) => {
    // Annonce au mégaphone : les ondes sonores partent devant.
    const lean = -0.03 + wave(t, 1.6, 0.03);
    return pose({
      ...breathe(t, r), lean, head: -0.05, look: 0.2, ...armF(lean, 0.09, -0.05), ...HIP_HAND,
      hipF: 0.15, hipB: -0.12, face: "talk", mouthOpen: 0.5 + abs(wave(t, 3, 0.5)), set: "megaphone", setK: t,
    });
  },
};

/** Nombre de personnages par défaut selon l'action. */
export const DUO_ACTIONS = new Set([
  "mock", "argue", "talk", "point", "ignore", "hug", "reach", "leave", "backtoback", "highfive", "whisper", "puppet",
  "betray", "gossip", "trust", "handshake", "promise", "gift", "propose", "kiss", "comfort", "reject", "fight", "forgive", "dance", "confront", "friends",
]);

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
  speak: ["Parle (dialogue)", "Spricht (Dialog)", "Speaks (dialogue)"], listen: ["Écoute", "Hört zu", "Listens"],
  read: ["Lit / histoire", "Liest / Geschichte", "Reads / story"], lift: ["Musculation", "Krafttraining", "Lifts weights"],
  exercise: ["Squats / sport", "Kniebeugen / Sport", "Squats / sport"], meditate: ["Médite", "Meditiert", "Meditates"],
  anxious: ["Anxieux", "Ängstlich", "Anxious"], shame: ["Honte", "Scham", "Shame"], rain: ["Sous la pluie", "Im Regen", "In the rain"],
  heartbreak: ["Cœur brisé", "Gebrochenes Herz", "Heartbreak"], mask: ["Masque / faux sourire", "Maske / falsches Lächeln", "Mask / fake smile"],
  burden: ["Poids sur les épaules", "Last auf den Schultern", "Carries a burden"], wall: ["Face au mur", "Vor der Mauer", "Facing a wall"],
  explode: ["Explose de colère", "Wutausbruch", "Explodes in anger"], calm: ["Respire / se calme", "Atmet / beruhigt sich", "Breathes / calms down"],
  rise: ["Se relève", "Steht wieder auf", "Gets back up"], mirror: ["Miroir", "Spiegel", "Mirror"], crowd: ["Foule qui juge", "Urteilende Menge", "Judging crowd"],
  reach: ["Main tendue (2)", "Helfende Hand (2)", "Helping hand (2)"], leave: ["S'éloigne (2)", "Geht weg (2)", "Walks away (2)"],
  backtoback: ["Dos à dos (2)", "Rücken an Rücken (2)", "Back to back (2)"], highfive: ["Check / high five (2)", "Abklatschen (2)", "High five (2)"],
  whisper: ["Chuchote un secret (2)", "Flüstert (2)", "Whispers (2)"], puppet: ["Manipulation (2)", "Manipulation (2)", "Manipulation (2)"],
  pushup: ["Pompes", "Liegestütze", "Push-ups"], jumprope: ["Corde à sauter", "Seilspringen", "Jump rope"], boxing: ["Boxe", "Boxen", "Boxing"],
  plank: ["Gainage + chrono", "Planke + Timer", "Plank + timer"], finish: ["Ligne d'arrivée", "Ziellinie", "Finish line"],
  podium: ["Podium", "Podest", "Podium"], comeback: ["Abandonne puis repart", "Gibt auf, macht weiter", "Gives up, then goes on"],
  sleep: ["Dort / rêve", "Schläft / träumt", "Sleeps / dreams"], door: ["Ouvre une porte", "Öffnet eine Tür", "Opens a door"],
  stairs: ["Monte l'escalier", "Steigt die Treppe", "Climbs stairs"], lamppost: ["Attend sous un lampadaire", "Wartet unter der Laterne", "Waits under a streetlight"],
  chase: ["Court après un rêve", "Jagt einem Traum nach", "Chases a dream"], stargaze: ["Regarde les étoiles", "Schaut in die Sterne", "Stargazing"],
  betray: ["Trahison, coup dans le dos (2)", "Verrat, Messer in den Rücken (2)", "Betrayal, stab in the back (2)"],
  gossip: ["Parle dans le dos (2)", "Lästert hinter dem Rücken (2)", "Talks behind the back (2)"],
  trust: ["Confiance (se laisse tomber) (2)", "Vertrauen (lässt sich fallen) (2)", "Trust fall (2)"],
  handshake: ["Poignée de main (2)", "Händedruck (2)", "Handshake (2)"], promise: ["Promesse (2)", "Versprechen (2)", "Pinky promise (2)"],
  gift: ["Offre un cadeau (2)", "Schenkt etwas (2)", "Gives a gift (2)"], propose: ["Demande en mariage (2)", "Heiratsantrag (2)", "Proposal (2)"],
  kiss: ["Bisou (2)", "Küsschen (2)", "Kiss (2)"], comfort: ["Réconforte (2)", "Tröstet (2)", "Comforts (2)"],
  reject: ["Repousse (2)", "Stößt weg (2)", "Rejects (2)"], fight: ["Bagarre (2)", "Prügelei (2)", "Fight (2)"],
  forgive: ["Pardonne (2)", "Verzeiht (2)", "Forgives (2)"], dance: ["Danse à deux (2)", "Tanzt zu zweit (2)", "Dance (2)"],
  confront: ["Confronte avec une preuve (2)", "Konfrontiert mit Beweis (2)", "Confronts with proof (2)"],
  friends: ["Meilleurs amis (2)", "Beste Freunde (2)", "Best friends (2)"],
  shock: ["Sous le choc", "Schockiert", "Shocked"], doubt: ["Doute / méfiance", "Zweifel / Misstrauen", "Doubt / distrust"],
  proud: ["Fier / sa valeur", "Stolz / sein Wert", "Proud / self-worth"], scared: ["A peur", "Hat Angst", "Scared"],
  hide: ["Se cache", "Versteckt sich", "Hides"], pray: ["Prie", "Betet", "Prays"], hope: ["Espoir", "Hoffnung", "Hope"],
  facepalm: ["Se tape le front", "Facepalm", "Facepalm"], nod: ["Dit oui", "Sagt ja", "Says yes"], refuse: ["Dit non", "Sagt nein", "Says no"],
  bow: ["S'incline / merci", "Verbeugt sich / danke", "Bows / thanks"], apologize: ["S'excuse", "Entschuldigt sich", "Apologizes"],
  wakeup: ["Se réveille / s'étire", "Wacht auf / streckt sich", "Wakes up / stretches"], dizzy: ["Étourdi", "Schwindelig", "Dizzy"],
  jealous: ["Jaloux", "Eifersüchtig", "Jealous"], sick: ["Malade", "Krank", "Sick"], scheme: ["Prépare sa vengeance", "Plant Rache", "Plots revenge"],
  eavesdrop: ["Écoute aux portes", "Lauscht an der Wand", "Eavesdrops"],
  work: ["Travaille (ordinateur)", "Arbeitet (Laptop)", "Works (laptop)"], study: ["Étudie / écrit", "Lernt / schreibt", "Studies / writes"],
  teach: ["Enseigne au tableau", "Unterrichtet an der Tafel", "Teaches"], cook: ["Cuisine", "Kocht", "Cooks"], eat: ["Mange", "Isst", "Eats"],
  coffee: ["Boit un café", "Trinkt Kaffee", "Drinks coffee"], drive: ["Conduit", "Fährt Auto", "Drives"], travel: ["Voyage (valise)", "Reist (Koffer)", "Travels (suitcase)"],
  bike: ["Fait du vélo", "Fährt Fahrrad", "Rides a bike"], shopping: ["Shopping", "Shopping", "Shopping"], clean: ["Fait le ménage", "Putzt", "Cleans"],
  money: ["Argent", "Geld", "Money"], late: ["En retard", "Zu spät", "Running late"], knock: ["Frappe à la porte", "Klopft an die Tür", "Knocks on the door"],
  selfie: ["Selfie", "Selfie", "Selfie"], sing: ["Chante", "Singt", "Sings"], guitar: ["Guitare", "Gitarre", "Plays guitar"], paint: ["Peint", "Malt", "Paints"],
  plant: ["Arrose une plante", "Gießt eine Pflanze", "Waters a plant"], peak: ["Au sommet (drapeau)", "Auf dem Gipfel (Fahne)", "On the summit (flag)"],
  swim: ["Nage", "Schwimmt", "Swims"], fish: ["Pêche", "Angelt", "Fishes"], applause: ["Applaudit", "Applaudiert", "Applauds"],
  graduate: ["Diplômé", "Abschluss", "Graduates"], birthday: ["Anniversaire", "Geburtstag", "Birthday"], grave: ["Deuil / tombe", "Trauer / Grab", "Mourning / grave"],
  freedom: ["Brise ses chaînes", "Sprengt die Ketten", "Breaks free"], trapped: ["Enfermé (cage)", "Gefangen (Käfig)", "Trapped (cage)"],
  announce: ["Annonce (mégaphone)", "Verkündet (Megafon)", "Announces (megaphone)"],
};

const NUM_KEYS = ["dx", "lift", "lean", "head", "shF", "elF", "shB", "elB", "hipF", "knF", "hipB", "knB", "mouthOpen", "look", "sit", "lie", "rot", "setK"];

/** Interpolation entre deux poses (k = 0 → a, 1 → b). Les champs non numériques basculent à mi-chemin. */
export function lerpPose(a, b, k) {
  if (k <= 0) return a;
  if (k === 1) return b; // k > 1 : léger dépassement (rebond), utilisé pour les transitions
  const out = { ...(k < 0.5 ? a : b) };
  for (const key of NUM_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

/**
 * Pose à l'instant t d'une action, avec repli sur « idle » pour un id inconnu.
 * gap : écart entre les hanches des deux personnages, en hauteurs de personnage (actions à deux).
 */
export function poseAt(action, t, r = 0.5, role = 0, gap = DUO_GAP) {
  const fn = ACTIONS[action] ?? ACTIONS.idle;
  return fn(Math.max(0, t), r, role, gap);
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
  if (p.rot) {
    // Tout le corps pivote autour des hanches (pompes, gainage, allongé).
    const a = d * p.rot, c = cos(a), s = sin(a);
    for (const pt of [neck, shoulder, headC, elbowF, handF, elbowB, handB, kneeF, footF, kneeB, footB]) {
      const [x, y] = pt;
      pt[0] = x * c - y * s;
      pt[1] = x * s + y * c;
    }
  }
  return { hip, neck, shoulder, headC, headR, elbowF, handF, elbowB, handB, kneeF, footF, kneeB, footB, legLen, torso };
}
