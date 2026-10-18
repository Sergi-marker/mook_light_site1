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
  const D = Math.min(L1 + L2 - 1e-4, Math.hypot(fx, fy));
  const th = Math.atan2(fx, fy); // 0 = vers le bas, > 0 = vers l'avant
  const a = Math.acos((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D));
  const b = Math.acos((L2 * L2 + D * D - L1 * L1) / (2 * L2 * D));
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
};

/** Nombre de personnages par défaut selon l'action. */
export const DUO_ACTIONS = new Set(["mock", "argue", "talk", "point", "ignore", "hug", "reach", "leave", "backtoback", "highfive", "whisper", "puppet"]);

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
