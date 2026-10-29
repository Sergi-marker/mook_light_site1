// © la triche — Animots
// Dessin d'un personnage « pictogramme » (membres épais et arrondis, grosse tête, deux yeux),
// avec morphologie et accessoires réglables. Toutes les coordonnées sont en unités « hauteur = 1 ».

import { skeleton } from "./poses.js";

/** Morphologie par défaut et préréglages. */
export const DEFAULT_MORPH = Object.freeze({
  height: 1, build: 1, belly: 0, headSize: 1, legs: 1, arms: 1, torso: 1,
  color: "#f1f1f3", detail: "#22232b",
  hair: "none", glasses: false, beard: false, cap: false, headband: false, skirt: false, tie: false,
  // Vêtements : haut (voir TOPS) et bas (voir BOTTOMS), avec leur couleur.
  top: "none", topColor: "#3b6fd8", bottom: "none", bottomColor: "#2a2d3a",
  // Yeux : points, grands, cils, endormis.
  eyes: "dots",
  // Chapeau (voir HATS ; l'ancien booléen cap vaut « casquette »), sa couleur (null : couleur propre au chapeau).
  hat: "none", hatColor: null,
  // Accessoires (écharpe, sac à dos, casque audio, boucles d'oreilles, moustache) et leur couleur vive.
  scarf: false, backpack: false, headphones: false, earrings: false, mustache: false, accentColor: "#d8423a",
  shoeColor: "#16161d",
  // Numéro du maillot de sport.
  number: 10,
});

/** Hauts proposés (libellés français, allemand, anglais). */
export const TOPS = {
  none: ["Aucun", "Keins", "None"],
  tshirt: ["T-shirt", "T-Shirt", "T-shirt"],
  hoodie: ["Sweat à capuche", "Kapuzenpulli", "Hoodie"],
  shirt: ["Chemise", "Hemd", "Shirt"],
  dress: ["Robe", "Kleid", "Dress"],
  jacket: ["Veste", "Jacke", "Jacket"],
  suit: ["Costume", "Anzug", "Suit"],
  sweater: ["Pull", "Pullover", "Sweater"],
  tank: ["Débardeur", "Tanktop", "Tank top"],
  coat: ["Manteau long", "Langer Mantel", "Long coat"],
  labcoat: ["Blouse blanche", "Laborkittel", "Lab coat"],
  jersey: ["Maillot de sport", "Trikot", "Jersey"],
};
/** Bas proposés. */
export const BOTTOMS = {
  none: ["Aucun", "Keins", "None"],
  pants: ["Pantalon", "Hose", "Trousers"],
  shorts: ["Short", "Shorts", "Shorts"],
  skirt: ["Jupe", "Rock", "Skirt"],
  longskirt: ["Jupe longue", "Langer Rock", "Long skirt"],
};
/** Chapeaux proposés. */
export const HATS = {
  none: ["Aucun", "Keiner", "None"],
  cap: ["Casquette", "Kappe", "Cap"],
  beanie: ["Bonnet", "Mütze", "Beanie"],
  fedora: ["Chapeau", "Hut", "Fedora"],
  crown: ["Couronne", "Krone", "Crown"],
  cowboy: ["Chapeau de cow-boy", "Cowboyhut", "Cowboy hat"],
  bow: ["Nœud", "Schleife", "Hair bow"],
};
/** Coiffures proposées. */
export const HAIRS = {
  none: ["Chauve", "Glatze", "Bald"],
  short: ["Courts", "Kurz", "Short"],
  long: ["Longs", "Lang", "Long"],
  bob: ["Carré", "Bob", "Bob"],
  bun: ["Chignon", "Dutt", "Bun"],
  ponytail: ["Queue de cheval", "Pferdeschwanz", "Ponytail"],
  braids: ["Tresses", "Zöpfe", "Braids"],
  curly: ["Frisés", "Lockig", "Curly"],
  spiky: ["En pointes", "Stachelig", "Spiky"],
  mohawk: ["Crête", "Irokese", "Mohawk"],
};
/** Accessoires (cases à cocher). */
export const ACCESSORIES = {
  glasses: ["Lunettes", "Brille", "Glasses"],
  beard: ["Barbe", "Bart", "Beard"],
  mustache: ["Moustache", "Schnurrbart", "Mustache"],
  scarf: ["Écharpe", "Schal", "Scarf"],
  backpack: ["Sac à dos", "Rucksack", "Backpack"],
  headphones: ["Casque audio", "Kopfhörer", "Headphones"],
  earrings: ["Boucles d'oreilles", "Ohrringe", "Earrings"],
  tie: ["Cravate", "Krawatte", "Tie"],
  headband: ["Bandeau", "Stirnband", "Headband"],
};

/** Teintes de peau proposées (pictogramme blanc, gris, puis tons de peau réalistes). */
export const SKIN_TONES = ["#f1f1f3", "#b9babf", "#f6dcc4", "#e8b98f", "#c68b5e", "#9a6440", "#6e4529", "#45291a"];

function luminance(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function lerpPt(a, b, k) {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

export const PRESETS = {
  penseur: { label: ["Penseur", "Denker", "Thinker"], morph: {} },
  gris: { label: ["Gris (duo)", "Grau (Duo)", "Grey (duo)"], morph: { color: "#b9babf", glasses: true } },
  sportif: { label: ["Sportif", "Sportler", "Athlete"], morph: { build: 1.15, legs: 1.05, arms: 1.05, headSize: 0.92, headband: true, color: "#f1f1f3", detail: "#e0344b" } },
  femme: { label: ["Femme", "Frau", "Woman"], morph: { build: 0.88, hair: "long", skirt: true, headSize: 1.02 } },
  ado: { label: ["Ado", "Teenager", "Teen"], morph: { height: 0.9, build: 0.85, headSize: 1.08, hair: "short", cap: true, detail: "#2f6fdc" } },
  enfant: { label: ["Enfant", "Kind", "Child"], morph: { height: 0.68, build: 0.95, headSize: 1.35, legs: 0.85, hair: "bun" } },
  costaud: { label: ["Costaud", "Kräftig", "Stocky"], morph: { build: 1.5, belly: 0.8, headSize: 0.95, beard: true } },
  ancien: { label: ["Grand-père", "Opa", "Grandpa"], morph: { height: 0.95, build: 0.9, glasses: true, beard: true, hair: "short", detail: "#9a9aa3" } },
  pro: { label: ["Bureau", "Büro", "Office"], morph: { build: 1, tie: true, hair: "short", detail: "#3a2a20", top: "shirt", topColor: "#e9edf5", bottom: "pants", bottomColor: "#2a2d3a" } },
  urbain: { label: ["Urbain (sweat)", "Urban (Hoodie)", "Urban (hoodie)"], morph: { color: "#c68b5e", hair: "curly", detail: "#1b1410", top: "hoodie", topColor: "#2d2f3a", bottom: "pants", bottomColor: "#4a5a7a" } },
  etudiante: { label: ["Étudiante", "Studentin", "Student"], morph: { color: "#9a6440", build: 0.88, hair: "ponytail", detail: "#1b1410", top: "tshirt", topColor: "#e2557a", bottom: "pants", bottomColor: "#2f3e63", eyes: "lashes" } },
  coach: { label: ["Coach sport", "Trainer", "Coach"], morph: { color: "#e8b98f", build: 1.2, hair: "spiky", detail: "#2a1d14", top: "tshirt", topColor: "#ff7a1a", bottom: "shorts", bottomColor: "#1f2230", headband: true } },
  medecin: { label: ["Médecin", "Ärztin", "Doctor"], morph: { color: "#e8b98f", hair: "bob", detail: "#3a2618", top: "labcoat", bottom: "pants", bottomColor: "#34405a", glasses: true, eyes: "lashes" } },
  elegante: { label: ["Élégante", "Elegante Dame", "Elegant lady"], morph: { color: "#6e4529", build: 0.86, hair: "bun", detail: "#120c08", top: "tshirt", topColor: "#7a1f3d", bottom: "longskirt", bottomColor: "#7a1f3d", earrings: true, eyes: "lashes", shoeColor: "#2a0f18" } },
  rappeur: { label: ["Rappeur", "Rapper", "Rapper"], morph: { color: "#9a6440", build: 1.05, detail: "#1b1410", top: "hoodie", topColor: "#f2c230", bottom: "pants", bottomColor: "#22252f", hat: "beanie", hatColor: "#1d1f27", headphones: true, accentColor: "#e0344b", shoeColor: "#f4f4f6" } },
  cowboy: { label: ["Cow-boy", "Cowboy", "Cowboy"], morph: { color: "#e8b98f", build: 1.1, detail: "#5a3a22", top: "shirt", topColor: "#b5523a", bottom: "pants", bottomColor: "#3d5a8a", hat: "cowboy", mustache: true, scarf: true, accentColor: "#d8423a", shoeColor: "#5a3a22" } },
  reine: { label: ["Reine", "Königin", "Queen"], morph: { color: "#f6dcc4", build: 0.88, hair: "long", detail: "#c8902e", top: "dress", topColor: "#6a3fb5", bottom: "longskirt", bottomColor: "#6a3fb5", hat: "crown", earrings: true, eyes: "lashes" } },
  ecolier: { label: ["Écolier", "Schüler", "Schoolboy"], morph: { height: 0.72, build: 0.95, headSize: 1.3, legs: 0.88, color: "#c68b5e", hair: "short", detail: "#1b1410", top: "jersey", topColor: "#2f8f5b", bottom: "shorts", bottomColor: "#2a2d3a", backpack: true, accentColor: "#e0453a", number: 7 } },
};

export function morphFrom(m) {
  return { ...DEFAULT_MORPH, ...(m ?? {}) };
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Point le plus bas du personnage (pour le poser au sol), en unités de hauteur. */
export function lowestPoint(sk, p) {
  let low = Math.max(sk.footF[1], sk.footB[1], sk.kneeF[1], sk.kneeB[1]);
  if (p.lie > 0) low = Math.max(low, 0.035);
  // Corps pivoté (pompes, gainage, couché) : les mains, coudes et la tête peuvent toucher le sol.
  if (p.rot) low = Math.max(low, sk.handF[1], sk.handB[1], sk.elbowF[1], sk.elbowB[1], sk.headC[1] + sk.headR, sk.shoulder[1] + 0.05);
  return low;
}

/** Couleur du fin liseré qui sépare les parties du corps quand elles se chevauchent (style pictogramme). */
const SEP = "#0b0b12";
/** Épaisseur de ce liseré (unités « hauteur = 1 »). */
const SEP_W = 0.012;

/**
 * Dessine une partie du corps en deux passes : d'abord la silhouette un peu élargie dans la couleur du
 * liseré, puis la partie dans sa couleur. Sur le fond sombre le liseré ne se voit pas ; il n'apparaît que
 * là où la partie passe devant une autre (bras devant le buste, bras devant la tête…), comme sur les
 * vidéos de référence.
 */
let sepOn = true;
function part(ctx, color, geom) {
  if (!sepOn) { ctx.strokeStyle = color; ctx.fillStyle = color; geom(0); return; }
  ctx.strokeStyle = SEP;
  ctx.fillStyle = SEP;
  geom(SEP_W * 2);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  geom(0);
}

/** Courbe qui passe par l'articulation b (coude, genou) : membres souples plutôt que des bâtons. */
function curveThrough(ctx, a, b, c) {
  const cx = 2 * b[0] - (a[0] + c[0]) / 2, cy = 2 * b[1] - (a[1] + c[1]) / 2;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.quadraticCurveTo(cx, cy, c[0], c[1]);
}

/** Point de la courbe a→b→c à la fraction t (pour les manches et les pantalons). */
function pointOnCurve(a, b, c, t) {
  const cx = 2 * b[0] - (a[0] + c[0]) / 2, cy = 2 * b[1] - (a[1] + c[1]) / 2;
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * cx + t * t * c[0], u * u * a[1] + 2 * u * t * cy + t * t * c[1]];
}

function partialCurve(ctx, a, b, c, t1) {
  // Sous-courbe de 0 à t1 (de Casteljau).
  const cx = 2 * b[0] - (a[0] + c[0]) / 2, cy = 2 * b[1] - (a[1] + c[1]) / 2;
  const q = [a[0] + (cx - a[0]) * t1, a[1] + (cy - a[1]) * t1];
  const e = pointOnCurve(a, b, c, t1);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.quadraticCurveTo(q[0], q[1], e[0], e[1]);
}

/** Bras ou jambe avec sa main / son pied, en une seule pièce (pas de trait entre l'avant-bras et la main). */
function limbPart(ctx, a, b, c, w, color, end) {
  part(ctx, color, (ext) => {
    ctx.lineWidth = w + ext;
    curveThrough(ctx, a, b, c);
    ctx.stroke();
    if (end === "hand") {
      ctx.beginPath();
      ctx.arc(c[0], c[1], w * 0.62 + ext / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (end?.foot) {
      ctx.lineWidth = w * 0.95 + ext;
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(end.foot[0], end.foot[1]);
      ctx.stroke();
    }
  });
}

/** Pointe du pied : perpendiculaire au tibia, du côté où regarde le personnage. */
function footTip(knee, ankle, d) {
  const ang = Math.atan2(ankle[1] - knee[1], ankle[0] - knee[0]) - (d * Math.PI) / 2;
  return [ankle[0] + Math.cos(ang) * 0.05, ankle[1] + Math.sin(ang) * 0.05];
}

/** Contour fermé lissé passant près des points donnés (coins arrondis). */
function smoothClosed(ctx, pts) {
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const n = pts.length;
  ctx.beginPath();
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  ctx.closePath();
}

/** Buste galbé : épaules larges, taille plus fine, hanches arrondies (et ventre selon la morphologie). */
function torsoShape(ctx, sk, bodyW, belly, d) {
  const S = sk.shoulder, Hp = sk.hip;
  let ux = S[0] - Hp[0], uy = S[1] - Hp[1];
  const len = Math.hypot(ux, uy) || 1;
  ux /= len; uy /= len;
  const nx = -uy, ny = ux; // perpendiculaire
  const at = (k, half, side) => [Hp[0] + ux * len * k + nx * half * side, Hp[1] + uy * len * k + ny * half * side];
  const sw = bodyW * 0.62, ww = bodyW * (0.46 + 0.18 * belly), hw = bodyW * 0.52;
  // Le ventre ressort du côté où regarde le personnage.
  const front = d, back = -d;
  const pts = [
    at(1.12, bodyW * 0.18, 1), at(1.12, bodyW * 0.18, -1), // haut arrondi
    at(0.95, sw, -1), at(0.5, belly ? ww * (back === -1 ? 0.9 : 1.15) : ww, -1), at(0.02, hw, -1), at(-0.12, hw * 0.55, -1),
    at(-0.12, hw * 0.55, 1), at(0.02, hw, 1), at(0.5, belly ? ww * (front === 1 ? 1.15 : 0.9) : ww, 1), at(0.95, sw, 1),
  ];
  smoothClosed(ctx, pts);
}

/** Hauts à manches longues ; manteaux qui descendent jusqu'aux genoux. */
const LONG_SLEEVES = new Set(["hoodie", "shirt", "jacket", "suit", "sweater", "coat", "labcoat"]);
const LONG_COATS = new Set(["coat", "labcoat"]);
const LABCOAT = "#f4f6f9";

/** Chapeau porté (l'ancien booléen cap vaut une casquette). */
function hatOf(m) {
  const h = m.hat ?? "none";
  return h !== "none" && HATS[h] ? h : m.cap ? "cap" : "none";
}

/**
 * Vêtement qui descend des hanches sur les jambes (jupe, jupe longue, pan de manteau) : trapèze entre la
 * taille et les genoux (to = "knee") ou les chevilles (to = "ankle"), qui suit les jambes quand elles bougent.
 */
function legGarment(sk, to, waist, pad) {
  const Hp = sk.hip;
  let ux = sk.neck[0] - Hp[0], uy = sk.neck[1] - Hp[1];
  const n = Math.hypot(ux, uy) || 1;
  ux /= n; uy /= n;
  const vx = -uy, vy = ux;
  const pts = to === "ankle" ? [sk.footF, sk.footB] : [sk.kneeF, sk.kneeB];
  let lo = -waist, hi = waist, len = 0;
  for (const q of pts) {
    const rx = q[0] - Hp[0], ry = q[1] - Hp[1];
    const across = rx * vx + ry * vy;
    lo = Math.min(lo, across - pad);
    hi = Math.max(hi, across + pad);
    len = Math.max(len, -(rx * ux + ry * uy));
  }
  len += to === "ankle" ? -0.035 : 0.035;
  const at = (k, a) => [Hp[0] + ux * k + vx * a, Hp[1] + uy * k + vy * a];
  return [at(0.07, -waist * 0.9), at(0.07, waist * 0.9), at(-len, hi), at(-len, lo)];
}

function polyPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
  ctx.closePath();
}

/** Dessin « à plat » du personnage, à l'origine (x, groundY). */
function drawFlat(ctx, p, m, x, groundY, h) {
  const sk = skeleton(p, m);
  const low = lowestPoint(sk, p);
  const d = p.dir ?? 1;
  const limbW = 0.084 * m.build;
  const bodyW = 0.2 * m.build;
  const back = shade(m.color, 0.86);
  const top = TOPS[m.top] ? m.top : "none", bottom = BOTTOMS[m.bottom] ? m.bottom : "none";
  const topC = top === "labcoat" ? LABCOAT : m.topColor ?? "#3b6fd8", botC = m.bottomColor ?? "#2a2d3a";
  const bodyColor = top !== "none" && top !== "dress" ? topC : m.color;
  const shoe = m.shoeColor ?? "#16161d";
  const accent = m.accentColor ?? "#d8423a";
  const skirted = bottom === "skirt" || bottom === "longskirt";
  // Axe du buste (vers le haut) et direction de la poitrine (vers l'avant).
  let ux = sk.neck[0] - sk.hip[0], uy = sk.neck[1] - sk.hip[1];
  const tl = Math.hypot(ux, uy) || 1;
  ux /= tl; uy /= tl;
  const fwd = [-uy * d, ux * d];
  const onTorso = (k, f) => [sk.hip[0] + ux * tl * k + fwd[0] * f, sk.hip[1] + uy * tl * k + fwd[1] * f];

  // Manches (t-shirt, maillot : courtes ; sweat, chemise, veste, pull, manteau : longues ; débardeur : aucune).
  const sleeve = (a, b, c, dark) => {
    if (top === "none" || top === "dress" || top === "tank") return;
    const long = LONG_SLEEVES.has(top);
    part(ctx, dark ? shade(topC, 0.86) : topC, (ext) => {
      ctx.lineWidth = limbW * (LONG_COATS.has(top) || top === "suit" || top === "jacket" ? 1.22 : 1.14) + ext;
      partialCurve(ctx, a, b, c, long ? 0.86 : 0.32);
      ctx.stroke();
    });
    // Poignet côtelé du pull.
    if (top === "sweater") {
      const q0 = pointOnCurve(a, b, c, 0.78), q1 = pointOnCurve(a, b, c, 0.88);
      ctx.strokeStyle = shade(topC, dark ? 0.7 : 0.8);
      ctx.lineWidth = limbW * 1.18;
      ctx.beginPath();
      ctx.moveTo(q0[0], q0[1]);
      ctx.lineTo(q1[0], q1[1]);
      ctx.stroke();
    }
  };
  const trouser = (a, b, c, dark) => {
    if (bottom !== "pants" && bottom !== "shorts") return;
    part(ctx, dark ? shade(botC, 0.86) : botC, (ext) => {
      ctx.lineWidth = limbW * 1.18 + ext;
      partialCurve(ctx, a, b, c, bottom === "shorts" ? 0.42 : 0.94);
      ctx.stroke();
    });
  };
  const shoes = (knee, foot) => {
    if (bottom === "none") return;
    part(ctx, shoe, (ext) => { ctx.lineWidth = limbW * 0.95 + ext; ctx.beginPath(); ctx.moveTo(foot[0], foot[1]); const f = footTip(knee, foot, d); ctx.lineTo(f[0], f[1]); ctx.stroke(); });
  };
  const legEnd = (knee, foot) => ({ foot: footTip(knee, foot, d) });
  // Fin trait de séparation (revers, ourlets) : seulement dans le dessin avec liserés.
  const seam = (pts, w = SEP_W) => {
    if (!sepOn) return;
    ctx.strokeStyle = SEP;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  };

  ctx.save();
  ctx.translate(x, groundY - (low + (p.lift ?? 0)) * h);
  // Étirement / écrasement selon la vitesse verticale (sauts, réceptions), autour des pieds.
  const st = Math.max(-0.12, Math.min(0.12, p.stretch ?? 0));
  if (st) {
    ctx.translate(0, low * h);
    ctx.scale(1 - st * 0.5, 1 + st);
    ctx.translate(0, -low * h);
  }
  ctx.scale(h, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  drawPropsBehind(ctx, p, sk, low, d, m);

  // Côté arrière (légèrement plus sombre pour la profondeur).
  limbPart(ctx, sk.shoulder, sk.elbowB, sk.handB, limbW, back, "hand");
  sleeve(sk.shoulder, sk.elbowB, sk.handB, true);
  if (p.prop === "dumbbell") drawDumbbell(ctx, sk.handB, back);
  limbPart(ctx, sk.hip, sk.kneeB, sk.footB, limbW * 1.1, back, legEnd(sk.kneeB, sk.footB));
  trouser(sk.hip, sk.kneeB, sk.footB, true);
  shoes(sk.kneeB, sk.footB);

  // Derrière la tête : cheveux longs, carré, tresses, capuche.
  const hc = sk.headC, hr = sk.headR;
  if (m.hair === "long" || m.hair === "bob") {
    part(ctx, m.detail, () => {
      const r = hr * 1.08;
      ctx.beginPath();
      if (m.hair === "long") ctx.ellipse(hc[0] - d * r * 0.25, hc[1] + r * 0.55, r * 0.95, r * 1.3, 0, 0, Math.PI * 2);
      else ctx.ellipse(hc[0] - d * r * 0.3, hc[1] + r * 0.12, r * 0.9, r * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  if (m.hair === "braids") {
    // Tresse : chapelet de mèches qui descend dans le dos.
    for (let i = 0; i < 6; i++) {
      const k = i / 5;
      part(ctx, m.detail, (ext) => {
        ctx.beginPath();
        ctx.ellipse(hc[0] - d * hr * (0.75 + k * 0.25), hc[1] + hr * (0.25 + k * 1.25), hr * (0.24 - k * 0.05) + ext / 2, hr * 0.2 + ext / 2, d * 0.4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  if (top === "hoodie") {
    part(ctx, shade(topC, 0.8), () => {
      ctx.beginPath();
      ctx.ellipse(hc[0] - d * hr * 0.35, hc[1] + hr * 0.6, hr * 0.9, hr * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // Sac à dos, dans le dos.
  if (m.backpack) {
    part(ctx, accent, (ext) => {
      const c = onTorso(0.62, -(bodyW * 0.62 + 0.012));
      const a = 0.1 + ext / 2, b = 0.055 + ext / 2;
      const P = (k, f) => [c[0] + ux * a * k + fwd[0] * b * f, c[1] + uy * a * k + fwd[1] * b * f];
      smoothClosed(ctx, [P(1, 1), P(1, -1), P(-1, -1), P(-1, 1)]);
      ctx.fill();
    });
    part(ctx, shade(accent, 0.75), (ext) => {
      const c = onTorso(0.5, -(bodyW * 0.62 + 0.06));
      ctx.beginPath();
      ctx.ellipse(c[0], c[1], 0.045 + ext / 2, 0.022 + ext / 2, Math.atan2(uy, ux), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Buste.
  part(ctx, bodyColor, (ext) => {
    torsoShape(ctx, sk, bodyW, m.belly ?? 0, d);
    ctx.fill();
    if (ext) { ctx.lineWidth = ext; ctx.stroke(); }
  });
  // Détails du haut, découpés dans la forme du buste.
  const inTorso = (fn) => {
    ctx.save();
    torsoShape(ctx, sk, bodyW, m.belly ?? 0, d);
    ctx.clip();
    fn();
    ctx.restore();
  };
  const ox = bodyW * 0.18; // milieu de la poitrine, un peu vers l'avant
  if (top === "jacket" || top === "suit" || top === "labcoat") {
    // Veste ouverte : t-shirt blanc (veste), chemise blanche (costume), tenue bleue (blouse) au milieu.
    const inner = top === "labcoat" ? "#8fb9e3" : "#f7f7f9";
    // De profil, l'ouverture se voit sur le devant du buste (le bras cache le milieu).
    const pts = top === "suit"
      ? [onTorso(1.1, bodyW * 0.2), onTorso(1.1, bodyW), onTorso(0.4, bodyW), onTorso(0.4, bodyW * 0.62)]
      : [onTorso(1.1, bodyW * 0.28), onTorso(1.1, bodyW), onTorso(-0.15, bodyW), onTorso(-0.15, bodyW * 0.42)];
    inTorso(() => {
      ctx.fillStyle = inner;
      polyPath(ctx, pts);
      ctx.fill();
      // Revers.
      seam([pts[0], pts[3]], SEP_W * 1.2);
      if (top === "suit") {
        // Cravate dans l'ouverture du costume.
        ctx.fillStyle = m.tie ? m.detail : "#a3202f";
        polyPath(ctx, [onTorso(1.0, bodyW * 0.48), onTorso(1.0, bodyW * 0.62), onTorso(0.55, bodyW * 0.68), onTorso(0.47, bodyW * 0.6), onTorso(0.55, bodyW * 0.52)]);
        ctx.fill();
        // Bas de la veste fermée : un bouton.
        ctx.fillStyle = shade(topC, 0.55);
        const b = onTorso(0.3, bodyW * 0.55);
        ctx.beginPath();
        ctx.arc(b[0], b[1], 0.008, 0, Math.PI * 2);
        ctx.fill();
      }
      if (top === "labcoat") {
        // Poche de poitrine et stylo.
        const pk = onTorso(0.62, -bodyW * 0.38);
        seam([[pk[0] - 0.03, pk[1]], [pk[0] + 0.03, pk[1]]]);
        ctx.strokeStyle = "#2f6fdc";
        ctx.lineWidth = 0.008;
        ctx.beginPath();
        ctx.moveTo(pk[0] + 0.012, pk[1] + 0.004);
        ctx.lineTo(pk[0] + 0.012, pk[1] - 0.035);
        ctx.stroke();
      }
    });
  }
  if (top === "coat") {
    inTorso(() => {
      seam([onTorso(1.05, bodyW * 0.42), onTorso(-0.2, bodyW * 0.42)], SEP_W * 1.2);
      ctx.fillStyle = shade(topC, 0.55);
      for (const k of [0.75, 0.5, 0.25]) { const b = onTorso(k, bodyW * 0.52); ctx.beginPath(); ctx.arc(b[0], b[1], 0.008, 0, Math.PI * 2); ctx.fill(); }
      // Col relevé.
      ctx.fillStyle = shade(topC, 0.82);
      polyPath(ctx, [onTorso(1.12, ox - 0.07), onTorso(1.12, ox + 0.05), onTorso(0.92, ox + 0.01)]);
      ctx.fill();
    });
  }
  if (top === "sweater") {
    inTorso(() => {
      ctx.strokeStyle = shade(topC, 0.78);
      ctx.lineWidth = 0.03;
      const n = sk.neck;
      ctx.beginPath();
      ctx.ellipse(n[0] + d * 0.012, n[1] + 0.006, bodyW * 0.32, 0.022, Math.atan2(uy, ux) + Math.PI / 2, 0, Math.PI * 2);
      ctx.stroke();
      // Bord côtelé en bas du pull.
      const a = onTorso(0.12, -bodyW), b = onTorso(0.12, bodyW);
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.strokeStyle = shade(topC, 0.6);
      ctx.lineWidth = 0.004;
      for (let i = -4; i <= 4; i++) {
        const c0 = onTorso(0.07, (i * bodyW) / 5), c1 = onTorso(0.17, (i * bodyW) / 5);
        ctx.beginPath();
        ctx.moveTo(c0[0], c0[1]);
        ctx.lineTo(c1[0], c1[1]);
        ctx.stroke();
      }
    });
  }
  if (top === "tank") {
    // Encolure dégagée et emmanchures : la peau apparaît autour du cou et des épaules.
    inTorso(() => {
      ctx.fillStyle = m.color;
      const n = sk.neck;
      ctx.beginPath();
      ctx.ellipse(n[0] + d * 0.015, n[1], bodyW * 0.42, 0.06, Math.atan2(uy, ux) + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
      const sh = onTorso(0.96, -bodyW * 0.45);
      ctx.beginPath();
      ctx.ellipse(sh[0], sh[1], bodyW * 0.35, 0.05, Math.atan2(uy, ux), 0, Math.PI * 2);
      ctx.fill();
    });
  }
  if (top === "jersey") {
    inTorso(() => {
      // Bandes sur les côtés et grand numéro sur la poitrine.
      ctx.strokeStyle = luminance(topC) > 0.6 ? shade(topC, 0.6) : "#ffffff";
      ctx.lineWidth = 0.012;
      const a = onTorso(1.0, bodyW * 0.55), b = onTorso(0.15, bodyW * 0.45);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      // Le numéro se lit dans le dos (de profil, le bras cache la poitrine).
      const c = onTorso(0.62, -bodyW * 0.4);
      ctx.save();
      ctx.translate(c[0], c[1]);
      ctx.rotate(Math.atan2(uy, ux) + Math.PI / 2);
      ctx.fillStyle = luminance(topC) > 0.6 ? "#1b1d26" : "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `900 ${(0.07 * m.build).toFixed(3)}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText(String(m.number ?? 10).slice(0, 2), 0, 0);
      ctx.restore();
    });
  }
  // Bas du corps (bassin) de la couleur du pantalon ou de la jupe.
  if (bottom !== "none" && !LONG_COATS.has(top)) {
    ctx.fillStyle = botC;
    ctx.save();
    torsoShape(ctx, sk, bodyW, m.belly ?? 0, d);
    ctx.clip();
    const k = 0.18;
    const a = lerpPt(sk.hip, sk.shoulder, k);
    ctx.beginPath();
    ctx.arc(sk.hip[0], sk.hip[1], Math.hypot(a[0] - sk.hip[0], a[1] - sk.hip[1]) + bodyW * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (top === "dress") {
    part(ctx, topC, (ext) => {
      const hp = sk.hip, t0 = lerpPt(hp, sk.neck, 0.45);
      ctx.beginPath();
      ctx.moveTo(t0[0] - 0.075, t0[1]);
      ctx.lineTo(t0[0] + 0.075, t0[1]);
      ctx.lineTo(hp[0] + 0.15, hp[1] + 0.2);
      ctx.lineTo(hp[0] - 0.15, hp[1] + 0.2);
      ctx.closePath();
      ctx.fill();
      if (ext) { ctx.lineWidth = ext; ctx.stroke(); }
    });
  }
  if (m.skirt && !skirted) {
    part(ctx, m.detail, (ext) => {
      const hp = sk.hip, t0 = lerpPt(hp, sk.neck, 0.2);
      ctx.beginPath();
      ctx.moveTo(t0[0] - 0.075, t0[1]);
      ctx.lineTo(t0[0] + 0.075, t0[1]);
      ctx.lineTo(hp[0] + 0.13, hp[1] + 0.13);
      ctx.lineTo(hp[0] - 0.13, hp[1] + 0.13);
      ctx.closePath();
      ctx.fill();
      if (ext) { ctx.lineWidth = ext; ctx.stroke(); }
    });
  }
  if (top === "shirt" || top === "suit") {
    const n = sk.neck, hp = sk.hip;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(n[0] - 0.04, n[1] + 0.012);
    ctx.lineTo(n[0] + 0.04, n[1] + 0.012);
    ctx.lineTo(n[0] + d * 0.01, n[1] + 0.055);
    ctx.closePath();
    ctx.fill();
    if (top === "shirt") {
      ctx.fillStyle = shade(topC, 0.6);
      for (const k of [0.3, 0.5, 0.7]) { const b = lerpPt(n, hp, k); ctx.beginPath(); ctx.arc(b[0] + d * 0.014, b[1], 0.006, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  if (m.tie && top !== "suit") {
    ctx.fillStyle = m.tie ? m.detail : "#a3202f";
    const n = sk.neck, hp = sk.hip;
    const tx = hp[0] - n[0], ty = hp[1] - n[1];
    ctx.beginPath();
    ctx.moveTo(n[0] + ox * d + tx * 0.1, n[1] + ty * 0.1);
    ctx.lineTo(n[0] + ox * d + tx * 0.55 + 0.018, n[1] + ty * 0.55);
    ctx.lineTo(n[0] + ox * d + tx * 0.64, n[1] + ty * 0.64);
    ctx.lineTo(n[0] + ox * d + tx * 0.55 - 0.018, n[1] + ty * 0.55);
    ctx.closePath();
    ctx.fill();
  }
  // Bretelle du sac à dos, par-dessus l'épaule.
  if (m.backpack) {
    part(ctx, shade(accent, 0.7), (ext) => {
      const a = onTorso(1.04, -bodyW * 0.3), c = onTorso(0.98, bodyW * 0.7), b = onTorso(0.5, bodyW * 0.5);
      ctx.lineWidth = 0.022 + ext;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
      ctx.stroke();
    });
  }

  // Côté avant.
  limbPart(ctx, sk.hip, sk.kneeF, sk.footF, limbW * 1.1, m.color, legEnd(sk.kneeF, sk.footF));
  trouser(sk.hip, sk.kneeF, sk.footF, false);
  shoes(sk.kneeF, sk.footF);

  // Jupes et pans de manteau : par-dessus les deux jambes.
  if (skirted && !LONG_COATS.has(top)) {
    part(ctx, botC, (ext) => {
      polyPath(ctx, legGarment(sk, bottom === "longskirt" ? "ankle" : "knee", bodyW * 0.55, limbW * (bottom === "longskirt" ? 1.0 : 0.85)));
      ctx.fill();
      if (ext) { ctx.lineWidth = ext; ctx.stroke(); }
    });
  }
  if (LONG_COATS.has(top)) {
    if (bottom === "longskirt") {
      part(ctx, botC, (ext) => {
        polyPath(ctx, legGarment(sk, "ankle", bodyW * 0.55, limbW));
        ctx.fill();
        if (ext) { ctx.lineWidth = ext; ctx.stroke(); }
      });
    }
    const pts = legGarment(sk, "knee", bodyW * 0.62, limbW * 1.0);
    part(ctx, topC, (ext) => {
      polyPath(ctx, pts);
      ctx.fill();
      if (ext) { ctx.lineWidth = ext; ctx.stroke(); }
    });
    // Fente du manteau au milieu.
    seam([lerpPt(pts[0], pts[1], 0.55), lerpPt(pts[3], pts[2], 0.55)], SEP_W * 1.2);
  }
  if (m.scarf) {
    // Écharpe : un tour autour du cou et un pan qui pend sur la poitrine.
    part(ctx, accent, (ext) => {
      const a = onTorso(1.06, -bodyW * 0.42), b = onTorso(1.06, bodyW * 0.48), e = onTorso(0.55, bodyW * 0.62);
      ctx.lineWidth = 0.05 + ext;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.lineWidth = 0.036 + ext;
      ctx.beginPath();
      ctx.moveTo(b[0], b[1]);
      ctx.lineTo(e[0], e[1]);
      ctx.stroke();
    });
  }

  // Tête (avec son liseré : se détache du buste et des bras qui passent derrière).
  if (sepOn) {
    ctx.fillStyle = SEP;
    ctx.beginPath();
    ctx.arc(sk.headC[0], sk.headC[1], sk.headR + SEP_W, 0, Math.PI * 2);
    ctx.fill();
  }
  drawHead(ctx, sk, p, m, d);

  if (p.prop === "phone") drawPhone(ctx, sk, d);
  if (p.prop === "book") drawBook(ctx, sk, d);
  limbPart(ctx, sk.shoulder, sk.elbowF, sk.handF, limbW, m.color, "hand");
  sleeve(sk.shoulder, sk.elbowF, sk.handF, false);
  if (p.prop === "dumbbell") drawDumbbell(ctx, sk.handF, m.detail);
  if (p.prop === "mask") drawMask(ctx, sk, d, p.setK ?? 0);
  drawPropsFront(ctx, p, sk, low, d, m);

  ctx.restore();
  return { sk, low, d };
}

// Toiles de travail réutilisées d'une image à l'autre.
const work = { flat: null, sil: null, glow: null };
function workCanvas(key, w, hgt) {
  let c = work[key];
  if (!c) {
    c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, hgt) : Object.assign(document.createElement("canvas"), { width: w, height: hgt });
    work[key] = c;
  }
  if (c.width !== w || c.height !== hgt) { c.width = w; c.height = hgt; }
  return c;
}

/**
 * Position à l'écran (pixels) des articulations d'un personnage dessiné par drawFigure avec les mêmes
 * paramètres : sert aux décors liés au personnage (pluie au-dessus de la tête, fils de marionnette, corde…).
 */
export function figureJoints(p, morphIn, x, groundY, H, sketch = false) {
  const m = morphFrom(morphIn);
  const h = H * m.height;
  const sk = skeleton(p, m);
  const low = lowestPoint(sk, p);
  // Style dessin : mains et pieds sont déplacés sur les côtés (vue de face), les objets doivent les suivre.
  if (sketch) sketchFrontView(sk, p, m);
  const ox = x + (p.dx ?? 0) * H, oy = groundY - (low + (p.lift ?? 0)) * h;
  const out = { h, d: p.dir ?? 1, headR: sk.headR * h, base: [x, groundY] };
  for (const k of ["hip", "neck", "shoulder", "headC", "elbowF", "handF", "elbowB", "handB", "kneeF", "footF", "kneeB", "footB"]) {
    out[k] = [ox + sk[k][0] * h, oy + sk[k][1] * h];
  }
  return out;
}

/** Style de rendu : contour sombre, halo de contre-jour et volume (ombre / lumière). */
/**
 * Style de rendu. Par défaut « épuré » (comme les vidéos de référence) : blanc net, liserés internes,
 * léger contre-jour, pas de gros contour. style « outline » : contour épais façon BD et halo marqué.
 */
export const DEFAULT_LOOK = Object.freeze({ outline: null, glow: "rgba(190,200,255,0.22)", shading: 0.5 });

/** Rectangle (unités « hauteur = 1 », origine aux hanches) qui contient tout le personnage, objets compris. */
function figureBounds(sk, p, m) {
  const pts = [sk.hip, sk.neck, sk.shoulder, sk.elbowF, sk.handF, sk.elbowB, sk.handB, sk.kneeF, sk.footF, sk.kneeB, sk.footB];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  // Tête + coiffure (afro, chignon, queue de cheval, tresses), chapeaux (bords larges, couronne), larmes.
  const hat = hatOf(m);
  const tall = hat !== "none" || m.hair === "mohawk";
  const r = sk.headR * (tall ? 2.0 : 1.6), rx = sk.headR * (hat === "cowboy" || hat === "fedora" ? 1.75 : 1.6);
  x0 = Math.min(x0, sk.headC[0] - rx); x1 = Math.max(x1, sk.headC[0] + rx);
  y0 = Math.min(y0, sk.headC[1] - r); y1 = Math.max(y1, sk.headC[1] + sk.headR * 1.6);
  // Sac à dos : dépasse dans le dos, au niveau des épaules.
  if (m.backpack) {
    const e = 0.22 * Math.max(1, m.build);
    for (const q of [sk.shoulder, sk.hip]) { x0 = Math.min(x0, q[0] - e); x1 = Math.max(x1, q[0] + e); y0 = Math.min(y0, q[1] - e); y1 = Math.max(y1, q[1] + e); }
  }
  // Épaisseur des membres, pieds, robe, objets tenus ou posés.
  let pad = 0.12 * Math.max(1, m.build) + 0.06;
  if (p.prop === "bench" || p.prop === "mat") { x0 = Math.min(x0, -0.45); x1 = Math.max(x1, 0.45); }
  if (p.prop) pad += 0.08;
  return { x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad };
}

/**
 * Dessine le personnage. (x, groundY) en pixels, H = hauteur du personnage en pixels.
 * Le personnage est d'abord dessiné à plat hors écran, puis posé avec un contour net, un halo
 * de contre-jour qui le détache du décor, et un léger modelé (lumière du projecteur en haut).
 * La toile de travail est limitée au rectangle du personnage : c'est ce qui rend l'image rapide.
 */
export function drawFigure(ctx, p, morphIn, x, groundY, H, look = DEFAULT_LOOK) {
  const m = morphFrom(morphIn);
  const h = H * m.height;
  const bx = x + (p.dx ?? 0) * H;
  const sk0 = skeleton(p, m);
  const low0 = lowestPoint(sk0, p);
  const lift = p.lift ?? 0;
  const b = figureBounds(sk0, p, m);
  const st = 1 + Math.min(0.12, Math.abs(p.stretch ?? 0)); // marge pour l'étirement
  const W = Math.ceil((b.x1 - b.x0) * h * st) + 4, Hh = Math.ceil((b.y1 - b.y0) * h * st) + 4;
  // Position des hanches dans la toile de travail, puis du sol (ce qu'attend drawFlat).
  const hipX = Math.round(-b.x0 * h * st) + 2, hipY = Math.round(-b.y0 * h * st) + 2;
  const flatGround = hipY + (low0 + lift) * h;
  const flat = workCanvas("flat", W, Hh);
  const fctx = flat.getContext("2d");
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.clearRect(0, 0, W, Hh);
  const { sk, low, d } = drawFlat(fctx, p, m, hipX, flatGround, h);

  // Modelé : plus clair en haut (projecteur), plus sombre vers les pieds.
  if (look.shading) {
    const k = look.shading === true ? 1 : look.shading;
    fctx.save();
    fctx.globalCompositeOperation = "source-atop";
    const top = flatGround - (low + lift + 1.05) * h;
    const g = fctx.createLinearGradient(0, top, 0, flatGround);
    g.addColorStop(0, `rgba(255,255,255,${0.1 * k})`);
    g.addColorStop(0.55, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(10,10,30,${0.22 * k})`);
    fctx.fillStyle = g;
    fctx.fillRect(0, 0, W, Hh);
    fctx.restore();
  }

  // Silhouette « sans liserés » : sert à effacer le liseré du bord extérieur (on ne garde que les traits
  // intérieurs, entre les parties qui se chevauchent) et à calculer le halo.
  const sil = workCanvas("sil", W, Hh);
  const sctx = sil.getContext("2d");
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, W, Hh);
  sepOn = false;
  try { drawFlat(sctx, p, m, hipX, flatGround, h); } finally { sepOn = true; }
  if (!look.outline) {
    fctx.save();
    fctx.globalCompositeOperation = "destination-in";
    fctx.drawImage(sil, 0, 0);
    fctx.restore();
  }
  sctx.globalCompositeOperation = "source-in";
  sctx.fillStyle = look.outline ?? "#000";
  sctx.fillRect(0, 0, W, Hh);
  sctx.globalCompositeOperation = "source-over";

  const left = bx - hipX, topY = groundY - (low + lift) * h - hipY;
  ctx.save();
  // Halo de contre-jour, calculé en quart de résolution (il est flou : on ne voit pas la différence).
  if (look.glow) {
    const blur = Math.max(6, h * 0.09);
    const q = 4, mg = Math.ceil(blur / q) * 2;
    const gw = Math.ceil(W / q) + mg * 2, gh = Math.ceil(Hh / q) + mg * 2;
    const glow = workCanvas("glow", gw, gh);
    const gctx = glow.getContext("2d");
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, gw, gh);
    gctx.shadowColor = look.glow;
    gctx.shadowBlur = blur / q;
    gctx.drawImage(sil, mg, mg, W / q, Hh / q);
    ctx.drawImage(glow, left - mg * q, topY - mg * q, gw * q, gh * q);
  }
  // Contour net tout autour.
  if (look.outline) {
    const o = Math.max(1.5, h * 0.011);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.drawImage(sil, left + Math.cos(a) * o, topY + Math.sin(a) * o);
    }
  }
  ctx.drawImage(flat, left, topY);
  ctx.restore();

  // Symbole au-dessus de la tête (hors contour, pour rester lisible).
  if (p.symbol) {
    ctx.save();
    ctx.translate(bx, groundY - (low + lift) * h);
    ctx.scale(h, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    drawSymbol(ctx, p.symbol, sk, d, p);
    ctx.restore();
  }
}

// ---------- Expressions du visage (communes aux deux styles) ----------

/** Expressions proposées (libellés français, allemand, anglais). */
export const EXPRESSIONS = {
  neutral: ["Neutre", "Neutral", "Neutral"],
  happy: ["Content", "Fröhlich", "Happy"],
  joy: ["Joie", "Freude", "Joy"],
  laugh: ["Rire", "Lachen", "Laughing"],
  love: ["Amoureux", "Verliebt", "In love"],
  proud: ["Fier", "Stolz", "Proud"],
  shy: ["Timide", "Schüchtern", "Shy"],
  surprised: ["Surpris", "Überrascht", "Surprised"],
  shocked: ["Choqué", "Schockiert", "Shocked"],
  suspicious: ["Intrigué", "Skeptisch", "Suspicious"],
  pensive: ["Pensif", "Nachdenklich", "Pensive"],
  worried: ["Inquiet", "Besorgt", "Worried"],
  fear: ["Peur", "Angst", "Afraid"],
  sad: ["Triste", "Traurig", "Sad"],
  cry: ["Pleure", "Weint", "Crying"],
  angry: ["En colère", "Wütend", "Angry"],
  determined: ["Déterminé", "Entschlossen", "Determined"],
  disgust: ["Dégoûté", "Angewidert", "Disgusted"],
  bored: ["Ennuyé", "Gelangweilt", "Bored"],
  pain: ["Douleur", "Schmerz", "In pain"],
  dizzy: ["Étourdi", "Schwindelig", "Dizzy"],
  closed: ["Yeux fermés", "Augen zu", "Eyes closed"],
  talk: ["Parle", "Spricht", "Talking"],
};

/**
 * Description de chaque expression : yeux (eye), sourcils (brow), bouche (mouth), extras (fx), décalage
 * vertical du visage (dy, en rayons de tête : menton levé < 0, tête baissée > 0).
 * Yeux : t = forme (open, ball, sparkle, arcUp, arcDown, heart, spiral, chevron), s = taille,
 *   top / bot = part cachée par la paupière du haut / du bas, tilt = paupière inclinée (> 0 : coin intérieur
 *   plus bas, regard dur ; < 0 : regard triste), px / py = regard (pupille), pr = taille de la pupille.
 * Sourcils : y = hauteur, t = inclinaison (> 0 : froncés, < 0 : intérieur relevé), a = arrondi, w = épaisseur.
 * Un tableau [arrière, avant] donne deux yeux ou deux sourcils différents (l'avant est du côté du regard).
 */
const FACES = {
  neutral: { eye: { t: "open" }, brow: { y: 0, a: 0.03, soft: true }, mouth: "neutral" },
  talk: { eye: { t: "open" }, brow: { y: 0, a: 0.03, soft: true }, mouth: "talk" },
  closed: { eye: { t: "arcDown" }, brow: { y: -0.01, a: 0.03, soft: true }, mouth: "neutral" },
  happy: { eye: { t: "open", bot: 0.22 }, brow: { y: 0.06, a: 0.08 }, mouth: "smile" },
  laugh: { eye: { t: "arcUp" }, brow: { y: 0.1, a: 0.1 }, mouth: "laugh" },
  joy: { eye: { t: "sparkle", s: 1.25, top: 0 }, brow: { y: 0.15, a: 0.13 }, mouth: "grin" },
  love: { eye: { t: "heart", s: 1.25 }, brow: { y: 0.1, a: 0.1 }, mouth: "smileBig", fx: ["blush"] },
  proud: { eye: { t: "open", top: 0.5, bot: 0.12 }, brow: { y: 0.1, a: 0.1, t: -0.02 }, mouth: "smirk", dy: -0.06 },
  shy: { eye: { t: "open", top: 0.42, py: 0.35 }, brow: { y: 0.06, t: -0.08 }, mouth: "tiny", fx: ["blush", "hatch"], dy: 0.05 },
  surprised: { eye: { t: "open", s: 1.25, top: 0 }, brow: { y: 0.16, a: 0.12 }, mouth: "o" },
  shocked: { eye: { t: "ball", s: 1.7, pr: 0.2 }, brow: { y: 0.24, a: 0.16 }, mouth: "O" },
  suspicious: {
    eye: [{ t: "open", top: 0.5, bot: 0.3, tilt: 0.3 }, { t: "open", s: 1.12, top: 0.05 }],
    brow: [{ y: -0.05, t: 0.1, w: 1.1 }, { y: 0.2, a: 0.16, t: -0.03, w: 1.1 }], mouth: "side",
  },
  pensive: { eye: { t: "ball", s: 1.2, px: 0.5, py: -0.55, pr: 0.5 }, brow: [{ y: 0.02, t: 0.04 }, { y: 0.15, a: 0.1 }], mouth: "pensive", dy: -0.03 },
  worried: { eye: { t: "open", top: 0.22, tilt: -0.7 }, brow: { y: 0.07, t: -0.15, a: 0.02 }, mouth: "worried" },
  fear: { eye: { t: "ball", s: 1.4, pr: 0.36, shake: true }, brow: { y: 0.16, t: -0.15, a: 0.02 }, mouth: "wobble", fx: ["sweat"], shake: true },
  sad: { eye: { t: "open", top: 0.3, tilt: -0.8 }, brow: { y: 0.03, t: -0.13, a: 0 }, mouth: "frown" },
  cry: { eye: { t: "arcUp", tilt: -1 }, brow: { y: 0.06, t: -0.16, a: 0 }, mouth: "wail", fx: ["tears"] },
  angry: { eye: { t: "open", top: 0.38, tilt: 0.9 }, brow: { y: -0.05, t: 0.17, a: 0, w: 1.15 }, mouth: "angry" },
  determined: { eye: { t: "open", top: 0.32, tilt: 0.55 }, brow: { y: -0.07, t: 0.12, a: 0.02, w: 1.2 }, mouth: "firm" },
  disgust: { eye: { t: "open", top: 0.45, bot: 0.35, tilt: 0.4 }, brow: [{ y: -0.04, t: 0.12 }, { y: -0.08, t: 0.08 }], mouth: "disgust" },
  bored: { eye: { t: "open", top: 0.55, bot: 0.08 }, brow: { y: -0.02, t: -0.03, a: 0, soft: true }, mouth: "flat" },
  pain: { eye: { t: "chevron" }, brow: { y: 0.02, t: -0.13, a: 0 }, mouth: "teeth", fx: ["sweat"] },
  dizzy: { eye: { t: "spiral", s: 1.3 }, brow: [{ y: 0.13, t: -0.06 }, { y: 0.02, t: 0.06 }], mouth: "wavy", fx: ["stars"] },
};

const PUPIL = "#15161c";
const TEAR = "#5ab4ff";

/** Yeux d'une expression, avec leurs paupières. */
function drawEye(ctx, g, e, s, p) {
  const { r, d } = g;
  const sz = e.s ?? 1;
  const w = g.w * sz, h = g.h * sz;
  const ex = g.fx + s * g.ex, ey = g.ey;
  const t = p.time ?? 0;
  ctx.fillStyle = g.ink;
  ctx.strokeStyle = g.ink;
  ctx.lineWidth = g.lw;
  let eh = h; // demi-hauteur de l'œil (pour les paupières)
  switch (e.t) {
    case "arcUp": {
      // Yeux plissés de rire (∩) ; inclinés pour les pleurs.
      const k = (e.tilt ?? 0) * -s * 0.25;
      ctx.beginPath();
      ctx.arc(ex, ey + h * 0.45, w * 1.3, Math.PI * 1.1 + k, Math.PI * 1.9 + k);
      ctx.stroke();
      return;
    }
    case "arcDown":
      ctx.beginPath();
      ctx.arc(ex, ey - h * 0.35, w * 1.3, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
      return;
    case "chevron":
      // « > < » : yeux serrés de douleur.
      ctx.lineWidth = g.lw * 0.9;
      ctx.beginPath();
      ctx.moveTo(ex + s * w * 1.1, ey - h * 0.75);
      ctx.lineTo(ex - s * w * 0.9, ey);
      ctx.lineTo(ex + s * w * 1.1, ey + h * 0.75);
      ctx.stroke();
      return;
    case "heart":
      heart(ctx, ex, ey + h * 0.25, h * 1.05 * sz, "#ff2f5b");
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(ex - w * 0.45, ey - h * 0.25, w * 0.22, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "spiral": {
      // Spirale qui tourne : personnage étourdi.
      ctx.lineWidth = g.lw * 0.5;
      ctx.beginPath();
      const R = Math.max(w, h) * 1.05, turns = 2.4, rot = t * 5 * s;
      for (let i = 0; i <= 40; i++) {
        const k = i / 40, a = rot + k * turns * Math.PI * 2;
        const x = ex + Math.cos(a) * R * k, y = ey + Math.sin(a) * R * k;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      return;
    }
    case "sparkle": {
      // Grands yeux brillants : deux reflets.
      ctx.beginPath();
      ctx.ellipse(ex, ey, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g.hi;
      ctx.beginPath();
      ctx.arc(ex - d * w * 0.25, ey - h * 0.38, w * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + d * w * 0.32, ey + h * 0.38, w * 0.2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case "ball": {
      // Blanc de l'œil et pupille : regard qui fixe, qui fuit ou qui se perd.
      const R = Math.max(w, h) * 0.92;
      eh = R;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ex, ey, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = g.lw * 0.42;
      ctx.stroke();
      const jit = e.shake ? Math.sin(t * 47) * R * 0.08 : 0;
      const pr = R * (e.pr ?? 0.5);
      const px = ex + d * (e.px ?? 0) * (R - pr) + jit, py = ey + (e.py ?? 0) * (R - pr);
      ctx.fillStyle = PUPIL;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      if (pr > R * 0.3) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(px - pr * 0.3, py - pr * 0.35, pr * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    default: {
      const eyes = g.style === "clean" ? g.m.eyes ?? "dots" : "sketch";
      const oy = (e.py ?? 0) * h;
      if (eyes === "sleepy" && sz <= 1 && !(e.top > 0.45)) {
        ctx.beginPath();
        ctx.moveTo(ex - w * 1.15, ey + oy);
        ctx.lineTo(ex + w * 1.15, ey + oy);
        ctx.stroke();
        return;
      }
      if (eyes === "big") {
        // Grands yeux : blanc, pupille, reflet.
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ex, ey, h, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = r * 0.05;
        ctx.strokeStyle = PUPIL;
        ctx.stroke();
        ctx.fillStyle = PUPIL;
        ctx.beginPath();
        ctx.arc(ex + d * h * 0.25, ey + h * 0.1 + oy * 0.6, h * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ex + d * h * 0.05, ey - h * 0.15 + oy * 0.6, h * 0.18, 0, Math.PI * 2);
        ctx.fill();
        eh = h;
      } else {
        // Yeux ovales, comme les pictogrammes de référence.
        ctx.beginPath();
        ctx.ellipse(ex, ey + oy, w, h, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const top = e.top ?? (e.t === "open" ? g.baseLid : 0), bot = e.bot ?? 0;
  eyeLids(ctx, g, ex, ey, g.style === "clean" && g.m.eyes === "big" && e.t === "open" ? eh : w, eh, s, top, bot, e.tilt ?? 0);
  if (g.style === "clean" && g.m.eyes === "lashes" && e.t === "open" && top < 0.5) {
    ctx.strokeStyle = g.ink;
    ctx.lineWidth = r * 0.045;
    const yt = ey - eh + 2 * eh * top;
    for (const k of [0.75, 1.35]) {
      ctx.beginPath();
      ctx.moveTo(ex + s * Math.sin(k) * w * 0.9, yt + (1 - Math.cos(k)) * eh * 0.4);
      ctx.lineTo(ex + s * Math.sin(k) * w * 1.6, yt - Math.cos(k) * eh * 0.45 - eh * 0.12);
      ctx.stroke();
    }
  }
  if (g.style === "sketch" && (e.t === "open" || e.t === "sparkle")) {
    // Petit reflet blanc.
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ex + r * 0.03, ey + r * 0.01 + (e.py ?? 0) * h, r * 0.025, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Paupières : bande de peau qui cache le haut (ou le bas) de l'œil, bordée d'un trait. */
function eyeLids(ctx, g, ex, ey, w, h, s, top, bot, tilt) {
  if (top <= 0 && bot <= 0) return;
  const W = w * 1.5;
  // tilt > 0 : le coin intérieur (vers le nez) descend.
  const yAt = (x, y0) => y0 + tilt * h * 0.55 * ((x - ex) / w) * -s;
  ctx.fillStyle = g.skin;
  ctx.strokeStyle = g.ink;
  if (top > 0) {
    const y0 = ey - h + 2 * h * top, lim = ey - h * 1.25;
    const a = Math.max(lim, yAt(ex - W, y0)), b = Math.max(lim, yAt(ex + W, y0));
    ctx.beginPath();
    ctx.moveTo(ex - W, a);
    ctx.lineTo(ex + W, b);
    ctx.lineTo(ex + W, lim);
    ctx.lineTo(ex - W, lim);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = g.lw * 0.6;
    ctx.beginPath();
    ctx.moveTo(ex - w * 1.2, Math.max(lim, yAt(ex - w * 1.2, y0)));
    ctx.lineTo(ex + w * 1.2, Math.max(lim, yAt(ex + w * 1.2, y0)));
    ctx.stroke();
  }
  if (bot > 0) {
    const y0 = ey + h - 2 * h * bot, lim = ey + h * 1.25;
    ctx.beginPath();
    ctx.moveTo(ex - W, y0 + h * 0.1);
    ctx.quadraticCurveTo(ex, y0 - h * 0.25, ex + W, y0 + h * 0.1);
    ctx.lineTo(ex + W, lim);
    ctx.lineTo(ex - W, lim);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = g.lw * 0.4;
    ctx.beginPath();
    ctx.moveTo(ex - w * 1.05, y0 + h * 0.06);
    ctx.quadraticCurveTo(ex, y0 - h * 0.2, ex + w * 1.05, y0 + h * 0.06);
    ctx.stroke();
  }
}

/** Sourcil : c'est lui qui rend l'émotion lisible de loin. */
function drawBrow(ctx, g, b, s, lift) {
  const { r } = g;
  const ex = g.fx + s * g.ex;
  const xi = ex - s * g.w * 1.05, xo = ex + s * g.w * 1.5;
  const base = g.browY - lift - (b.y ?? 0) * r;
  const yi = base + (b.t ?? 0) * r, yo = base - (b.t ?? 0) * r * 0.35;
  const a = (b.a ?? 0.05) * r;
  const lw = g.browW * (b.w ?? 1) * (b.soft ? 0.7 : 1);
  ctx.beginPath();
  ctx.moveTo(xo, yo);
  ctx.quadraticCurveTo((xi + xo) / 2, (yi + yo) / 2 - a, xi, yi);
  // Liseré couleur peau : le sourcil reste lisible sur les cheveux ou un chapeau.
  ctx.strokeStyle = g.skin;
  ctx.lineWidth = lw + r * 0.05;
  ctx.stroke();
  ctx.strokeStyle = g.ink;
  ctx.lineWidth = lw;
  ctx.stroke();
}

/** Bouche. kind : voir FACES ; « talk » = bouche qui parle (mouthOpen + mouthShape). */
function drawMouth(ctx, g, kind, p) {
  const { r, fx, my, d } = g;
  const R = r * g.ms;
  const open = p.mouthOpen ?? 0;
  const t = p.time ?? 0;
  const clean = g.style === "clean";
  ctx.strokeStyle = g.ink;
  ctx.fillStyle = g.ink;
  ctx.lineWidth = g.lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Remplit la bouche ouverte (chemin courant) : intérieur sombre, dents en haut, langue en bas.
  const inside = (box, teeth, tongue) => {
    ctx.fillStyle = g.mouthFill;
    ctx.fill();
    if (teeth || tongue) {
      ctx.save();
      ctx.clip();
      if (teeth) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(box[0], box[1], box[2] - box[0], (box[3] - box[1]) * 0.3);
      }
      if (tongue) {
        ctx.fillStyle = "#ff6f86";
        ctx.beginPath();
        ctx.ellipse((box[0] + box[2]) / 2, box[3], (box[2] - box[0]) * 0.32, (box[3] - box[1]) * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (g.mouthLine) {
      ctx.strokeStyle = g.ink;
      ctx.lineWidth = g.mouthLineW;
      ctx.stroke();
    }
  };
  ctx.beginPath();
  switch (kind) {
    case "none": return;
    case "neutral":
      if (clean) return;
      // Petit trait légèrement de travers : l'air pensif des vidéos de référence.
      ctx.moveTo(fx - r * 0.17, my + r * 0.02);
      ctx.quadraticCurveTo(fx, my - r * 0.03, fx + r * 0.17, my - r * 0.03);
      ctx.stroke();
      return;
    case "talk":
    case "open": {
      const shape = kind === "talk" ? p.mouthShape : null;
      if (shape === "M" || shape === "F") {
        // Lèvres fermées (m, b, p) ou lèvre sous les dents (f, v).
        const hw = clean ? r * 0.2 : r * 0.17;
        ctx.moveTo(fx - hw, my);
        ctx.lineTo(fx + hw, my);
        ctx.stroke();
        if (shape === "F" && !clean) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(fx - r * 0.1, my - r * 0.07, r * 0.2, r * 0.06);
          ctx.strokeRect(fx - r * 0.1, my - r * 0.07, r * 0.2, r * 0.06);
        }
        return;
      }
      let w, hh;
      if (clean) {
        const md = shape ? mouthDims(shape, open, r * 1.25) : null;
        w = md ? md.w : r * 0.28;
        hh = md ? md.h : r * (0.06 + 0.2 * Math.max(open, 0.15));
      } else {
        const dims = mouthDims(shape, open, r);
        w = dims.w;
        hh = dims.h;
      }
      ctx.ellipse(fx, my, w, hh, 0, 0, Math.PI * 2);
      inside([fx - w, my - hh, fx + w, my + hh], !clean && (shape === "A" || shape === "E"), false);
      return;
    }
    case "o": {
      const w = clean ? r * 0.16 : r * 0.12, hh = clean ? r * 0.22 : r * (0.05 + 0.16 * 0.8);
      ctx.ellipse(fx, my, w, hh, 0, 0, Math.PI * 2);
      inside([fx - w, my - hh, fx + w, my + hh], false, false);
      return;
    }
    case "O": {
      const w = R * 0.22, hh = R * 0.3, y = my + R * 0.05;
      ctx.ellipse(fx, y, w, hh, 0, 0, Math.PI * 2);
      inside([fx - w, y - hh, fx + w, y + hh], false, true);
      return;
    }
    case "laugh":
    case "grin": {
      // Grand sourire ouvert en « D » : dents en haut, langue en bas.
      const w = kind === "grin" ? R * 0.4 : R * 0.33;
      const hh = kind === "grin" ? R * 0.46 : R * (0.24 + 0.2 * Math.max(open, 0.3));
      const y = my - R * 0.16;
      ctx.moveTo(fx - w, y);
      ctx.quadraticCurveTo(fx, y + R * 0.06, fx + w, y);
      ctx.bezierCurveTo(fx + w * 0.95, y + hh * 1.3, fx - w * 0.95, y + hh * 1.3, fx - w, y);
      ctx.closePath();
      inside([fx - w, y, fx + w, y + hh], true, true);
      return;
    }
    case "smile":
    case "smileBig": {
      const big = kind === "smileBig";
      if (big) ctx.lineWidth = g.lw * 1.1;
      ctx.arc(fx, my - R * (big ? 0.2 : 0.18), R * (big ? 0.34 : 0.3), Math.PI * 0.18, Math.PI * 0.82);
      ctx.stroke();
      return;
    }
    case "tiny":
      ctx.arc(fx + d * R * 0.03, my - R * 0.1, R * 0.14, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      return;
    case "frown":
      ctx.arc(fx, my + R * 0.18, R * 0.24, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      return;
    case "worried":
      ctx.moveTo(fx - R * 0.18, my + R * 0.07);
      ctx.bezierCurveTo(fx - R * 0.08, my - R * 0.07, fx + R * 0.05, my, fx + R * 0.18, my + R * 0.05);
      ctx.stroke();
      return;
    case "angry":
      ctx.lineWidth = g.lw * 1.1;
      ctx.moveTo(fx - R * 0.22, my + R * 0.06);
      ctx.quadraticCurveTo(fx, my - R * 0.08, fx + R * 0.22, my + R * 0.06);
      ctx.stroke();
      return;
    case "firm":
      // Bouche serrée, coins tirés vers le bas.
      ctx.lineWidth = g.lw * 1.2;
      ctx.moveTo(fx - R * 0.22, my + R * 0.06);
      ctx.lineTo(fx - R * 0.15, my);
      ctx.lineTo(fx + R * 0.15, my);
      ctx.lineTo(fx + R * 0.22, my + R * 0.06);
      ctx.stroke();
      return;
    case "flat":
      ctx.moveTo(fx - R * 0.17, my + R * 0.02);
      ctx.lineTo(fx + R * 0.17, my + R * 0.02);
      ctx.stroke();
      return;
    case "side":
      // Bouche tirée d'un côté (sceptique), avec une fossette.
      ctx.moveTo(fx - d * R * 0.08, my + R * 0.03);
      ctx.quadraticCurveTo(fx + d * R * 0.12, my + R * 0.05, fx + d * R * 0.3, my - R * 0.06);
      ctx.stroke();
      ctx.lineWidth = g.lw * 0.6;
      ctx.beginPath();
      ctx.moveTo(fx + d * R * 0.36, my - R * 0.14);
      ctx.lineTo(fx + d * R * 0.31, my - R * 0.02);
      ctx.stroke();
      return;
    case "smirk":
      // Sourire en coin, satisfait.
      ctx.moveTo(fx - d * R * 0.2, my + R * 0.02);
      ctx.quadraticCurveTo(fx + d * R * 0.08, my + R * 0.1, fx + d * R * 0.28, my - R * 0.1);
      ctx.stroke();
      return;
    case "pensive":
      // Bouche poussée sur le côté, lèvres pincées.
      ctx.moveTo(fx - d * R * 0.24, my + R * 0.02);
      ctx.quadraticCurveTo(fx - d * R * 0.12, my - R * 0.05, fx - d * R * 0.01, my + R * 0.01);
      ctx.stroke();
      return;
    case "wavy": {
      // Bouche en vague (étourdi).
      for (let i = 0; i <= 16; i++) {
        const k = i / 16, x = fx - R * 0.26 + k * R * 0.52, y = my + Math.sin(k * Math.PI * 3 + t * 6) * R * 0.06;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.lineWidth = g.lw * 0.85;
      ctx.stroke();
      return;
    }
    case "disgust": {
      // Bouche tordue, langue tirée.
      ctx.fillStyle = "#ff6f86";
      ctx.ellipse(fx + d * R * 0.1, my + R * 0.15, R * 0.12, R * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = g.style === "clean" && !g.dark ? g.ink : PUPIL;
      ctx.lineWidth = g.lw * 0.4;
      ctx.stroke();
      ctx.strokeStyle = g.ink;
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const k = i / 16, x = fx - R * 0.26 + k * R * 0.52, y = my + Math.sin(k * Math.PI * 2.2) * R * 0.05 - (k - 0.5) * d * R * 0.12;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.lineWidth = g.lw * 0.9;
      ctx.stroke();
      return;
    }
    case "wobble": {
      // Bouche ouverte qui tremble (peur).
      const w = R * 0.3, y = my - R * 0.04;
      ctx.moveTo(fx - w, y);
      for (let i = 1; i <= 6; i++) ctx.lineTo(fx - w + (i * 2 * w) / 6, y + (i % 2 ? -1 : 1) * R * 0.045 + Math.sin(t * 40 + i) * R * 0.012);
      ctx.bezierCurveTo(fx + w, y + R * 0.42, fx - w, y + R * 0.42, fx - w, y);
      ctx.closePath();
      inside([fx - w, y - R * 0.05, fx + w, y + R * 0.3], true, false);
      return;
    }
    case "teeth": {
      // Dents serrées (douleur).
      const w = R * 0.27, y0 = my - R * 0.09, y1 = my + R * 0.11, rr = R * 0.06;
      ctx.moveTo(fx - w + rr, y0);
      ctx.arcTo(fx + w, y0, fx + w, y1, rr);
      ctx.arcTo(fx + w, y1, fx - w, y1, rr);
      ctx.arcTo(fx - w, y1, fx - w, y0, rr);
      ctx.arcTo(fx - w, y0, fx + w, y0, rr);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = g.lw * 0.55;
      ctx.stroke();
      ctx.strokeStyle = PUPIL;
      ctx.lineWidth = g.lw * 0.3;
      ctx.beginPath();
      ctx.moveTo(fx - w, (y0 + y1) / 2);
      ctx.lineTo(fx + w, (y0 + y1) / 2);
      for (const k of [-0.5, 0, 0.5]) { ctx.moveTo(fx + k * w, y0); ctx.lineTo(fx + k * w, y1); }
      ctx.stroke();
      return;
    }
    case "wail": {
      // Bouche des pleurs : grande ouverte, coins vers le bas, qui tremble.
      const w = R * (0.25 + Math.sin(t * 11) * 0.02), y = my + R * 0.14;
      ctx.moveTo(fx - w, y);
      ctx.bezierCurveTo(fx - w * 0.85, my - R * 0.2, fx + w * 0.85, my - R * 0.2, fx + w, y);
      ctx.quadraticCurveTo(fx, y - R * 0.06, fx - w, y);
      ctx.closePath();
      inside([fx - w, my - R * 0.1, fx + w, y], false, true);
      return;
    }
    default: return;
  }
}

/** Joues roses, goutte de sueur, larmes, étoiles. */
function drawFaceExtras(ctx, g, fx, p, after) {
  const { r, d } = g;
  const t = p.time ?? 0;
  for (const kind of fx) {
    if (kind === "blush" && !after) {
      ctx.fillStyle = g.blush;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(g.fx + s * (g.ex + g.w * 0.7), g.ey + r * 0.27, r * 0.15, r * 0.085, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === "hatch" && !after) {
      // Petits traits sur les joues : la gêne.
      ctx.strokeStyle = g.ink;
      ctx.lineWidth = r * 0.035;
      for (const s of [-1, 1]) {
        const bx = g.fx + s * (g.ex + g.w * 0.7), by = g.ey + r * 0.27;
        ctx.beginPath();
        for (const k of [-1, 0, 1]) { ctx.moveTo(bx + k * r * 0.07 - r * 0.03, by + r * 0.05); ctx.lineTo(bx + k * r * 0.07 + r * 0.03, by - r * 0.05); }
        ctx.stroke();
      }
    } else if (kind === "tears" && !after) {
      // Larmes qui coulent sans arrêt : un ruisseau sous chaque œil et des gouttes qui tombent.
      for (const s of [-1, 1]) {
        const ex = g.fx + s * g.ex, y0 = g.ey + g.h * 0.4;
        ctx.strokeStyle = TEAR;
        ctx.lineWidth = r * 0.09;
        ctx.beginPath();
        ctx.moveTo(ex, y0);
        ctx.quadraticCurveTo(ex + s * r * 0.02, y0 + r * 0.3, ex + s * r * 0.06, y0 + r * 0.55);
        ctx.stroke();
        ctx.fillStyle = TEAR;
        for (let i = 0; i < 3; i++) {
          const k = (t * 1.6 + i / 3 + (s > 0 ? 0.17 : 0)) % 1;
          ctx.beginPath();
          ctx.arc(ex + s * r * (0.04 + k * 0.12), y0 + r * (0.1 + k * 0.95), r * 0.075 * (1 - k * 0.3), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (kind === "sweat" && after) {
      const k = (t * 0.6) % 1;
      const x = g.fx + d * (g.ex + g.w * 2.3), y = g.browY - r * 0.05 + k * r * 0.25;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.2);
      ctx.quadraticCurveTo(x + r * 0.15, y + r * 0.02, x, y + r * 0.1);
      ctx.quadraticCurveTo(x - r * 0.15, y + r * 0.02, x, y - r * 0.2);
      ctx.fillStyle = "#8fd0ff";
      ctx.fill();
      ctx.strokeStyle = "#2d6fb0";
      ctx.lineWidth = r * 0.03;
      ctx.stroke();
    } else if (kind === "stars" && after) {
      for (let i = 0; i < 3; i++) {
        const a = t * 3 + (i * Math.PI * 2) / 3;
        star(ctx, g.cx + Math.cos(a) * r * 0.95, g.cy - r * 1.05 + Math.sin(a) * r * 0.22, r * 0.17, "#ffd84d");
      }
    }
  }
}

/**
 * Dessine yeux, sourcils, bouche et extras d'une expression (p.face), dans le style donné par g
 * (positions, couleurs, épaisseurs). p.speaking === true : les yeux et sourcils restent ceux de p.face
 * mais la bouche parle (mouthOpen + mouthShape). Expression inconnue : neutre. Renvoie la bouche dessinée.
 */
function drawExpression(ctx, p, g) {
  const id = FACES[p.face] ? p.face : "neutral";
  const f = FACES[id];
  const r = g.r;
  const dy = (f.dy ?? 0) * r + (f.shake ? Math.sin((p.time ?? 0) * 53) * r * 0.012 : 0);
  g = { ...g, ey: g.ey + dy, browY: g.browY + dy, my: g.my + dy, fx: g.fx + (f.shake ? Math.sin((p.time ?? 0) * 41) * r * 0.015 : 0) };
  const extras = f.fx ?? [];
  drawFaceExtras(ctx, g, extras, p, false);
  let lift = 0;
  for (const s of [-1, 1]) {
    const idx = s * g.d > 0 ? 1 : 0;
    const e = Array.isArray(f.eye) ? f.eye[idx] : f.eye;
    drawEye(ctx, g, e, s, p);
    const sz = e.t === "ball" ? (e.s ?? 1) * 1.15 : e.s ?? 1;
    lift = Math.max(lift, (sz - 1) * g.h);
  }
  for (const s of [-1, 1]) {
    const idx = s * g.d > 0 ? 1 : 0;
    drawBrow(ctx, g, Array.isArray(f.brow) ? f.brow[idx] : f.brow, s, lift);
  }
  let mouth = f.mouth;
  if (p.speaking === true || id === "talk") mouth = "talk";
  else if (id === "angry" && (p.mouthOpen ?? 0) > 0.5) mouth = "open";
  drawMouth(ctx, g, mouth, p);
  drawFaceExtras(ctx, g, extras, p, true);
  return { mouth, g };
}

function drawHead(ctx, sk, p, m, d) {
  const [cx, cy] = sk.headC;
  const r = sk.headR;
  ctx.fillStyle = m.color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Cheveux.
  ctx.fillStyle = m.detail;
  const capTop = () => {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.04, Math.PI * 1.05, Math.PI * 1.95);
    ctx.quadraticCurveTo(cx, cy - r * 0.45, cx - r * 1.0, cy - r * 0.15);
    ctx.fill();
  };
  if (m.hair === "short" || m.hair === "long" || m.hair === "braids") capTop();
  else if (m.hair === "bob") {
    // Carré : frange sur le front, cheveux jusqu'à la mâchoire à l'arrière (dessiné face vers +x).
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(d, 1);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.05, Math.PI * 0.62, Math.PI * 1.86);
    ctx.quadraticCurveTo(r * 0.35, -r * 0.66, -r * 0.1, -r * 0.56);
    ctx.quadraticCurveTo(-r * 0.38, 0, -r * 0.42, r * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (m.hair === "bun") {
    ctx.beginPath();
    ctx.arc(cx - d * r * 0.35, cy - r * 1.05, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  } else if (m.hair === "curly") {
    // Cheveux frisés / afro : couronne de boucles.
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.95 + (i / 8) * 1.1);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.92 - d * r * 0.08, cy + Math.sin(a) * r * 0.92, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (m.hair === "ponytail") {
    capTop();
    ctx.beginPath();
    ctx.ellipse(cx - d * r * 1.15, cy + r * 0.1 + Math.sin((p.time ?? 0) * 3) * r * 0.05, r * 0.3, r * 0.62, d * 0.35, 0, Math.PI * 2);
    ctx.fill();
  } else if (m.hair === "spiky" || m.hair === "mohawk") {
    ctx.beginPath();
    // Mèches en pointe : un bonnet de cheveux qui épouse le crâne, avec des pics ; crête : une bande haute.
    const mo = m.hair === "mohawk";
    const a0 = mo ? 1.2 : 1.08, a1 = mo ? 1.8 : 1.92, n = mo ? 8 : 10;
    ctx.arc(cx, cy, r * (mo ? 0.9 : 1.03), Math.PI * a0, Math.PI * a1);
    for (let i = n; i >= 0; i--) {
      const a = Math.PI * (a0 + (i / n) * (a1 - a0));
      const rr = i % 2 ? r * (mo ? 1.12 : 0.98) : r * (mo ? 1.55 : 1.24);
      ctx.lineTo(cx + Math.cos(a) * rr - d * r * 0.05, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  if (m.headphones) {
    // Arceau du casque audio par-dessus la tête.
    ctx.strokeStyle = "#2b2c35";
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.arc(cx - d * r * 0.2, cy - r * 0.02, r * 1.08, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }
  drawHatClean(ctx, m, cx, cy, r, d);
  if (m.headband) {
    ctx.strokeStyle = m.detail;
    ctx.lineWidth = r * 0.28;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.98, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  }
  if (m.headphones) {
    // Écouteur à la place de l'oreille, à l'arrière du visage.
    const x = cx - d * r * 0.45;
    ctx.fillStyle = "#2b2c35";
    ctx.beginPath();
    ctx.ellipse(x, cy + r * 0.05, r * 0.26, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = m.accentColor ?? "#d8423a";
    ctx.beginPath();
    ctx.ellipse(x, cy + r * 0.05, r * 0.13, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Visage : décalé vers la direction du regard.
  const fx = cx + d * r * 0.28;
  const fy = cy + (p.look ?? 0) * -r * 0.12;
  const ey = fy - r * 0.08;
  // Sur une peau foncée, les traits sont clairs pour rester visibles.
  const darkSkin = luminance(m.color) < 0.42;
  const ink = darkSkin ? "#f4efe9" : "#15161c";
  const eyeR = r * ((m.eyes ?? "dots") === "big" ? 0.2 : 0.14);
  const g = {
    style: "clean", m, d, r, cx, cy, fx, ey, ex: r * 0.3, w: eyeR * 0.82, h: eyeR * 1.18,
    browY: ey - r * 0.36, browW: r * 0.11, lw: r * 0.13, my: fy + r * 0.42, ms: 1,
    ink, skin: m.color, dark: darkSkin, hi: darkSkin ? PUPIL : "#ffffff", baseLid: 0,
    mouthFill: darkSkin ? "#2a0b0b" : ink, mouthLine: darkSkin, mouthLineW: r * 0.06,
    blush: darkSkin ? "rgba(255,120,150,0.85)" : "rgba(255,80,110,0.5)",
  };
  const face = drawExpression(ctx, p, g);

  if (m.beard) {
    ctx.fillStyle = m.detail;
    ctx.beginPath();
    ctx.arc(cx + d * r * 0.1, cy + r * 0.1, r * 0.98, Math.PI * 0.15, Math.PI * 0.85);
    ctx.quadraticCurveTo(cx, cy + r * 0.62, cx + r * 0.97, cy + r * 0.25);
    ctx.fill();
    // La bouche reste visible par-dessus la barbe.
    mouthOverBeard(ctx, m, face, p);
  }
  if (m.mustache) drawMustache(ctx, m, face.g);
  if (m.glasses) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = r * 0.09;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(fx + sx * g.ex, ey, r * 0.24, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(fx - g.ex + r * 0.24, ey);
    ctx.lineTo(fx + g.ex - r * 0.24, ey);
    ctx.stroke();
  }
  // Larme qui coule.
  if ((p.face === "sad" || p.face === "worried") && p.symbol === "tear") {
    const k = ((p.time ?? 0) * 0.7) % 1;
    ctx.fillStyle = "#7fc4ff";
    ctx.beginPath();
    ctx.arc(fx + g.ex, ey + r * 0.2 + k * r * 0.9, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  if (m.earrings) {
    ctx.strokeStyle = "#f2c230";
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.arc(cx - d * r * 0.42, cy + r * 0.5, r * 0.1, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Bouche redessinée par-dessus la barbe (sinon elle disparaît dedans). */
function mouthOverBeard(ctx, m, face, p) {
  if (face.mouth === "neutral" || face.mouth === "none") return;
  const ink = luminance(m.detail) < 0.42 ? "#f4efe9" : "#15161c";
  drawMouth(ctx, { ...face.g, ink, mouthFill: "#000", mouthLine: true, mouthLineW: face.g.r * 0.04 }, face.mouth, p);
}

function drawMustache(ctx, m, g) {
  const R = g.r * g.ms;
  ctx.fillStyle = m.detail;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(g.fx, g.my - R * 0.15);
    ctx.quadraticCurveTo(g.fx + s * R * 0.22, g.my - R * 0.3, g.fx + s * R * 0.38, g.my - R * 0.06);
    ctx.quadraticCurveTo(g.fx + s * R * 0.2, g.my - R * 0.1, g.fx, g.my - R * 0.05);
    ctx.closePath();
    ctx.fill();
  }
}

/** Couleur d'un chapeau (celle choisie, sinon la sienne). */
function hatColor(m, hat) {
  if (m.hatColor) return m.hatColor;
  return { cap: m.detail, beanie: "#d0473c", fedora: "#3b3229", crown: "#f2c230", cowboy: "#9a6334", bow: "#ff5fa2" }[hat] ?? m.detail;
}

/** Chapeaux du style pictogramme (vue de profil, visage du côté d). */
function drawHatClean(ctx, m, cx, cy, r, d) {
  const hat = hatOf(m);
  if (hat === "none") return;
  const c = hatColor(m, hat);
  const edge = () => {
    if (!sepOn) return;
    ctx.strokeStyle = SEP;
    ctx.lineWidth = SEP_W;
    ctx.stroke();
  };
  ctx.fillStyle = c;
  if (hat === "cap") {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.05, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + d * r * 0.95, cy - r * 0.06, r * 0.65, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (hat === "beanie") {
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.08, r * 1.08, Math.PI * 1.04, Math.PI * 1.96);
    ctx.closePath();
    ctx.fill();
    edge();
    // Revers et pompon.
    ctx.fillStyle = shade(c, 0.8);
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.1, cy - r * 0.18);
    ctx.lineTo(cx + r * 1.1, cy - r * 0.18);
    ctx.lineTo(cx + r * 1.06, cy - r * 0.46);
    ctx.lineTo(cx - r * 1.06, cy - r * 0.46);
    ctx.closePath();
    ctx.fill();
    edge();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx - d * r * 0.1, cy - r * 1.2, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    edge();
  } else if (hat === "fedora" || hat === "cowboy") {
    const cow = hat === "cowboy";
    const by = cy - r * 0.6;
    // Calotte (avec le creux sur le dessus).
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.78, by);
    ctx.lineTo(cx - r * 0.62, cy - r * 1.4);
    ctx.quadraticCurveTo(cx, cy - r * (cow ? 1.2 : 1.25), cx + r * 0.62, cy - r * 1.4);
    ctx.lineTo(cx + r * 0.78, by);
    ctx.closePath();
    ctx.fill();
    edge();
    // Ruban.
    ctx.fillStyle = cow ? shade(c, 0.6) : "#1a1714";
    ctx.fillRect(cx - r * 0.76, by - r * 0.26, r * 1.52, r * 0.2);
    // Bord : droit pour le chapeau, relevé aux extrémités pour le cow-boy.
    ctx.fillStyle = c;
    ctx.beginPath();
    if (cow) {
      ctx.moveTo(cx - r * 1.6, by - r * 0.32);
      ctx.quadraticCurveTo(cx - r * 1.2, by + r * 0.08, cx, by + r * 0.08);
      ctx.quadraticCurveTo(cx + r * 1.2, by + r * 0.08, cx + r * 1.6, by - r * 0.32);
      ctx.quadraticCurveTo(cx + r * 1.2, by - r * 0.06, cx, by - r * 0.1);
      ctx.quadraticCurveTo(cx - r * 1.2, by - r * 0.06, cx - r * 1.6, by - r * 0.32);
    } else ctx.ellipse(cx + d * r * 0.15, by, r * 1.42, r * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    edge();
  } else if (hat === "crown") {
    const by = cy - r * 0.62;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.7, by);
    for (let i = 0; i <= 4; i++) {
      const x = cx - r * 0.7 + (i * r * 1.4) / 4;
      ctx.lineTo(x, by - r * (i % 2 ? 0.42 : 0.72));
      if (i < 4) ctx.lineTo(x + r * 0.175, by - r * 0.3);
    }
    ctx.lineTo(cx + r * 0.7, by);
    ctx.closePath();
    ctx.fill();
    edge();
    ctx.fillStyle = "#e0344b";
    for (const k of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.arc(cx + k * r, by - r * 0.13, r * 0.08, 0, Math.PI * 2); ctx.fill(); }
  } else if (hat === "bow") {
    // Nœud dans les cheveux, sur le côté du crâne.
    const x = cx - d * r * 0.3, y = cy - r * 0.95;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - r * 0.45, y - r * 0.3);
    ctx.lineTo(x - r * 0.45, y + r * 0.3);
    ctx.closePath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + r * 0.45, y - r * 0.3);
    ctx.lineTo(x + r * 0.45, y + r * 0.3);
    ctx.closePath();
    ctx.fill();
    edge();
    ctx.fillStyle = shade(c, 0.75);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSymbol(ctx, sym, sk, d, p = {}) {
  const [cx, cy] = sk.headC;
  const r = sk.headR;
  const sx = cx + d * r * 0.9, sy = cy - r * 1.9;
  ctx.save();
  ctx.fillStyle = "#f4f4f6";
  ctx.strokeStyle = "#f4f4f6";
  ctx.lineWidth = r * 0.14;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = (str, size, x = sx, y = sy) => {
    ctx.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(str, x, y);
  };
  switch (sym) {
    case "?": text("?", r * 1.5); break;
    case "!?": text("!?", r * 1.2); break;
    case "...": text("...", r * 1.2, sx, sy + r * 0.2); break;
    case "haha": text("HA HA", r * 0.75, sx + d * r * 0.5, sy); break;
    case "zzz": text("Z", r * 0.6, sx, sy + r * 0.4); text("z", r * 0.5, sx + d * r * 0.5, sy - r * 0.1); text("z", r * 0.4, sx + d * r * 0.9, sy - r * 0.5); break;
    case "heart": heart(ctx, sx, sy, r * 0.75, "#ff4d6d"); break;
    case "sparkle":
      for (const [ox, oy, s] of [[-1.6, 0.4, 0.4], [1.5, 0.1, 0.5], [0, -0.4, 0.35]]) star(ctx, cx + ox * r, sy + oy * r, s * r, "#ffd84d");
      break;
    case "idea": {
      ctx.fillStyle = "#ffd84d";
      ctx.beginPath();
      ctx.arc(cx, sy - r * 0.2, r * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - r * 0.2, sy + r * 0.2, r * 0.4, r * 0.3);
      ctx.strokeStyle = "#ffd84d";
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.7, sy - r * 0.2 + Math.sin(a) * r * 0.7);
        ctx.lineTo(cx + Math.cos(a) * r * 1.0, sy - r * 0.2 + Math.sin(a) * r * 1.0);
        ctx.stroke();
      }
      break;
    }
    case "anger": {
      ctx.strokeStyle = "#ff4d4d";
      ctx.lineWidth = r * 0.16;
      const ax = cx + d * r * 0.9, ay = cy - r * 1.1;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(ax + a * r * 0.1, ay + b * r * 0.35);
        ctx.quadraticCurveTo(ax + a * r * 0.1, ay + b * r * 0.1, ax + a * r * 0.35, ay + b * r * 0.1);
        ctx.stroke();
      }
      break;
    }
    case "sweat": {
      ctx.fillStyle = "#8fd0ff";
      const wx = cx - d * r * 1.1, wy = cy - r * 0.5;
      ctx.beginPath();
      ctx.moveTo(wx, wy - r * 0.3);
      ctx.quadraticCurveTo(wx + r * 0.2, wy, wx, wy + r * 0.12);
      ctx.quadraticCurveTo(wx - r * 0.2, wy, wx, wy - r * 0.3);
      ctx.fill();
      break;
    }
    case "music": text("♪", r * 0.9, cx + d * r * 1.3, sy + r * 0.3); text("♫", r * 0.7, cx - d * r * 1.2, sy); break;
    case "shame": {
      // Traits verticaux de « déprime » au-dessus de la tête (style manga).
      ctx.strokeStyle = "rgba(170,140,255,0.85)";
      ctx.lineWidth = r * 0.1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * r * 0.32, cy - r * 1.75 + Math.abs(i) * r * 0.15);
        ctx.lineTo(cx + i * r * 0.32, cy - r * 1.2 + Math.abs(i) * r * 0.15);
        ctx.stroke();
      }
      break;
    }
    case "broken": {
      // Cœur qui se fend en deux.
      const k = p.setK ?? 1, gx = k * r * 0.35, s = r * 0.8;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(sx + side * gx, sy + k * r * 0.15);
        ctx.rotate(side * k * 0.25);
        ctx.beginPath();
        // Ligne de cassure en zigzag.
        ctx.moveTo(0, -s * 0.35);
        ctx.lineTo(-side * s * 0.12, -s * 0.1);
        ctx.lineTo(side * s * 0.1, s * 0.12);
        ctx.lineTo(0, s * 0.6);
        if (side < 0) ctx.bezierCurveTo(-s * 1.2, -s * 0.2, -s * 0.5, -s * 1.0, 0, -s * 0.35);
        else ctx.bezierCurveTo(s * 1.2, -s * 0.2, s * 0.5, -s * 1.0, 0, -s * 0.35);
        ctx.closePath();
        ctx.fillStyle = "#ff4d6d";
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case "dream": {
      // Bulle de rêve : petits ronds puis nuage avec une lune et une étoile.
      const bx = cx + d * r * 1.6, by = cy - r * 2.6;
      ctx.fillStyle = "rgba(244,244,246,0.92)";
      for (const [ox, oy, rr] of [[0.6, 1.5, 0.12], [0.3, 1.15, 0.18]]) { ctx.beginPath(); ctx.arc(cx + d * r * ox, cy - r * oy, r * rr, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath();
      for (const [ox, oy, rr] of [[-0.55, 0.1, 0.5], [0, -0.25, 0.6], [0.6, 0.05, 0.5], [0.05, 0.3, 0.5]]) ctx.arc(bx + ox * r, by + oy * r, rr * r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffd84d";
      ctx.beginPath();
      ctx.arc(bx - r * 0.3, by, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(244,244,246,1)";
      ctx.beginPath();
      ctx.arc(bx - r * 0.18, by - r * 0.08, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
      star(ctx, bx + r * 0.4, by - r * 0.05, r * 0.25, "#ffd84d");
      break;
    }
    default: break;
  }
  ctx.restore();
}

function heart(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.6);
  ctx.bezierCurveTo(x - s * 1.2, y - s * 0.2, x - s * 0.5, y - s * 1.0, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.5, y - s * 1.0, x + s * 1.2, y - s * 0.2, x, y + s * 0.6);
  ctx.fill();
}

function star(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? s * 0.35 : s;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Objets derrière le personnage (banc, tapis…). */
function drawPropsBehind(ctx, p, sk, low, d, m) {
  if (p.prop === "bench") drawBench(ctx, sk, low, d);
  if (p.prop === "mat") drawMat(ctx, low);
}

/** Objets devant le personnage. */
function drawPropsFront(ctx, p, sk, low, d, m) {}

function drawBench(ctx, sk, low, d) {
  const seatY = 0.035;
  ctx.fillStyle = "#6b5a4a";
  ctx.fillRect(-0.32, seatY, 0.64, 0.035);
  ctx.fillStyle = "#4e4136";
  ctx.fillRect(-0.28, seatY + 0.035, 0.035, low - seatY - 0.035);
  ctx.fillRect(0.245, seatY + 0.035, 0.035, low - seatY - 0.035);
  // Dossier.
  ctx.fillStyle = "#6b5a4a";
  ctx.fillRect(-0.32, seatY - 0.2, 0.64, 0.03);
  ctx.fillRect(-0.32, seatY - 0.12, 0.64, 0.03);
}

function drawMat(ctx, low) {
  ctx.fillStyle = "rgba(60,140,220,0.55)";
  ctx.fillRect(-0.42, low - 0.012, 0.84, 0.024);
}

function drawDumbbell(ctx, hand, color) {
  ctx.fillStyle = color;
  ctx.fillRect(hand[0] - 0.09, hand[1] - 0.008, 0.18, 0.016);
  ctx.fillRect(hand[0] - 0.11, hand[1] - 0.04, 0.035, 0.08);
  ctx.fillRect(hand[0] + 0.075, hand[1] - 0.04, 0.035, 0.08);
}

/** Masque souriant tenu à la main ; k = 1 : il couvre le visage. */
function drawMask(ctx, sk, d, k) {
  const r = sk.headR;
  const face = [sk.headC[0] + d * r * 0.25, sk.headC[1]];
  const hand = [sk.handF[0] + d * r * 0.3, sk.handF[1] - r * 0.4];
  const c = [hand[0] + (face[0] - hand[0]) * k, hand[1] + (face[1] - hand[1]) * k];
  ctx.save();
  ctx.translate(c[0], c[1]);
  ctx.rotate(d * (1 - k) * 0.5);
  part(ctx, "#fdfdfd", (ext) => {
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.82 + ext / 2, r * 1.0 + ext / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#1b1b24";
  ctx.strokeStyle = "#1b1b24";
  ctx.lineWidth = r * 0.12;
  ctx.lineCap = "round";
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * r * 0.32, -r * 0.18, r * 0.2, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, r * 0.05, r * 0.45, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,120,140,0.5)";
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * r * 0.55, r * 0.2, r * 0.14, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawPhone(ctx, sk, d) {
  const h = sk.handF;
  ctx.save();
  ctx.translate(h[0] + d * 0.01, h[1] - 0.035);
  ctx.rotate(d * -0.5);
  ctx.fillStyle = "#1c1d24";
  ctx.fillRect(-0.025, -0.045, 0.05, 0.09);
  ctx.fillStyle = "#6fc3ff";
  ctx.fillRect(-0.019, -0.037, 0.038, 0.072);
  ctx.restore();
}

function drawBook(ctx, sk, d) {
  const h = sk.handF;
  ctx.save();
  ctx.translate(h[0], h[1] - 0.02);
  ctx.rotate(d * -0.35);
  ctx.fillStyle = "#c44b3c";
  ctx.fillRect(-0.075, -0.05, 0.15, 0.1);
  ctx.fillStyle = "#f5efe2";
  ctx.fillRect(-0.068, -0.044, 0.064, 0.088);
  ctx.fillRect(0.004, -0.044, 0.064, 0.088);
  ctx.restore();
}

// ---------- Style « dessin » : contour noir, grosse tête couleur peau, t-shirt, bras et jambes fins ----------

const INK = "#161616";
const SKETCH_LIMB = "#f7f7f5";

/** Tête des personnages en style dessin : la couleur du pictogramme blanc devient une couleur de peau. */
function sketchSkin(m) {
  return luminance(m.color) > 0.9 ? "#e4aa78" : m.color;
}

/** Trait épais à contour noir passant par des points (membre fin). */
function inkLimb(ctx, pts, w, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + 0.022;
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = w;
  ctx.stroke();
}

/** Main dessinée : quatre petits doigts dans le prolongement de l'avant-bras. */
function inkHand(ctx, elbow, hand, w) {
  const ux = hand[0] - elbow[0], uy = hand[1] - elbow[1];
  const n = Math.hypot(ux, uy) || 1;
  const a = Math.atan2(uy / n, ux / n);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.009;
  ctx.lineCap = "round";
  for (const s of [-0.75, -0.25, 0.25, 0.75]) {
    const b = a + s * 0.55;
    const len = 0.045 - Math.abs(s) * 0.012;
    ctx.beginPath();
    ctx.moveTo(hand[0] + Math.cos(a) * w * 0.2, hand[1] + Math.sin(a) * w * 0.2);
    ctx.lineTo(hand[0] + Math.cos(b) * len, hand[1] + Math.sin(b) * len);
    ctx.stroke();
  }
}

/** Taille de la bouche selon la forme du son : A grande ouverte, E large, O ronde, C petite. */
function mouthDims(shape, open, r) {
  const o = Math.max(0.15, open);
  switch (shape) {
    case "A": return { w: r * 0.22, h: r * (0.08 + 0.17 * o) };
    case "E": return { w: r * 0.27, h: r * (0.05 + 0.08 * o) };
    case "O": return { w: r * 0.11, h: r * (0.08 + 0.12 * o) };
    case "C": return { w: r * 0.16, h: r * (0.04 + 0.08 * o) };
    default: return { w: r * 0.2, h: r * (0.05 + 0.16 * o) };
  }
}

function drawSketchFace(ctx, p, m, cx, cy, r, d) {
  const fx = cx + d * r * 0.12;
  const ey = cy - r * 0.02;
  ctx.lineCap = "round";
  return drawExpression(ctx, p, {
    style: "sketch", m, d, r, cx, cy, fx, ey, ex: r * 0.36, w: r * 0.09, h: r * 0.12,
    browY: ey - r * 0.3, browW: r * 0.075, lw: r * 0.065, my: cy + r * 0.38, ms: 0.8,
    ink: INK, skin: sketchSkin(m), dark: false, hi: "#ffffff", baseLid: 0.3,
    mouthFill: "#5a1a1a", mouthLine: true, mouthLineW: r * 0.06, blush: "rgba(235,60,80,0.45)",
  });
}

/** Contour noir du style dessin autour du chemin courant (après l'avoir rempli). */
function inkEdge(ctx, w = 0.01) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = w;
  ctx.stroke();
}

/** Chapeaux du style dessin (vue de face). */
function drawHatSketch(ctx, m, cx, cy, r, d) {
  const hat = hatOf(m);
  if (hat === "none") return;
  const c = hatColor(m, hat);
  ctx.fillStyle = c;
  ctx.beginPath();
  if (hat === "cap") {
    ctx.arc(cx, cy - r * 0.15, r * 1.0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    ctx.fill();
    inkEdge(ctx);
    ctx.beginPath();
    ctx.rect(cx + (d > 0 ? 0 : -r * 1.3), cy - r * 0.32, r * 1.3, r * 0.14);
    ctx.fill();
    inkEdge(ctx);
  } else if (hat === "beanie") {
    ctx.arc(cx, cy - r * 0.2, r * 1.04, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath();
    ctx.fill();
    inkEdge(ctx);
    ctx.fillStyle = shadeColor(c, 0.8);
    ctx.beginPath();
    ctx.rect(cx - r * 1.06, cy - r * 0.48, r * 2.12, r * 0.26);
    ctx.fill();
    inkEdge(ctx);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 1.3, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    inkEdge(ctx);
  } else if (hat === "fedora" || hat === "cowboy") {
    const cow = hat === "cowboy", by = cy - r * 0.62;
    ctx.moveTo(cx - r * 0.72, by);
    ctx.lineTo(cx - r * 0.6, cy - r * 1.45);
    ctx.quadraticCurveTo(cx, cy - r * 1.22, cx + r * 0.6, cy - r * 1.45);
    ctx.lineTo(cx + r * 0.72, by);
    ctx.closePath();
    ctx.fill();
    inkEdge(ctx);
    ctx.fillStyle = cow ? shadeColor(c, 0.6) : "#1a1714";
    ctx.beginPath();
    ctx.rect(cx - r * 0.7, by - r * 0.26, r * 1.4, r * 0.2);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    if (cow) {
      ctx.moveTo(cx - r * 1.6, by - r * 0.35);
      ctx.quadraticCurveTo(cx - r * 1.2, by + r * 0.1, cx, by + r * 0.1);
      ctx.quadraticCurveTo(cx + r * 1.2, by + r * 0.1, cx + r * 1.6, by - r * 0.35);
      ctx.quadraticCurveTo(cx + r * 1.2, by - r * 0.06, cx, by - r * 0.1);
      ctx.quadraticCurveTo(cx - r * 1.2, by - r * 0.06, cx - r * 1.6, by - r * 0.35);
    } else ctx.ellipse(cx, by, r * 1.4, r * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    inkEdge(ctx);
  } else if (hat === "crown") {
    const by = cy - r * 0.7;
    ctx.moveTo(cx - r * 0.72, by);
    for (let i = 0; i <= 4; i++) {
      const x = cx - r * 0.72 + (i * r * 1.44) / 4;
      ctx.lineTo(x, by - r * (i % 2 ? 0.42 : 0.72));
      if (i < 4) ctx.lineTo(x + r * 0.18, by - r * 0.3);
    }
    ctx.lineTo(cx + r * 0.72, by);
    ctx.closePath();
    ctx.fill();
    inkEdge(ctx);
    ctx.fillStyle = "#e0344b";
    for (const k of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.arc(cx + k * r, by - r * 0.13, r * 0.08, 0, Math.PI * 2); ctx.fill(); }
  } else if (hat === "bow") {
    const x = cx + d * r * 0.55, y = cy - r * 0.82;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + s * r * 0.42, y - r * 0.28);
      ctx.lineTo(x + s * r * 0.42, y + r * 0.28);
      ctx.closePath();
      ctx.fill();
      inkEdge(ctx);
    }
    ctx.fillStyle = shadeColor(c, 0.75);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    inkEdge(ctx);
  }
}

function drawSketchHead(ctx, p, m, sk, d) {
  const [cx, cy] = sk.headC;
  const r = sk.headR;
  const skin = sketchSkin(m);
  // Cheveux longs (ou carré, queue de cheval) derrière la tête.
  if (m.hair === "long" || m.hair === "ponytail" || m.hair === "bob") {
    ctx.fillStyle = m.detail;
    ctx.beginPath();
    if (m.hair === "long") ctx.ellipse(cx - d * r * 0.1, cy + r * 0.25, r * 1.08, r * 1.05, 0, 0, Math.PI * 2);
    else if (m.hair === "bob") ctx.ellipse(cx, cy + r * 0.05, r * 1.14, r * 1.02, 0, 0, Math.PI * 2);
    else ctx.ellipse(cx - d * r * 1.05, cy - r * 0.1, r * 0.3, r * 0.5, d * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (m.hair === "braids") {
    // Deux tresses de chaque côté du visage.
    ctx.fillStyle = m.detail;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(cx + s * r * (0.88 + i * 0.02), cy + r * (0.15 + i * 0.27), r * (0.17 - i * 0.012), r * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        inkEdge(ctx, 0.007);
      }
    }
  }
  ctx.fillStyle = skin;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Ombre douce sur le côté opposé à la lumière.
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "rgba(120,60,20,0.16)";
  ctx.beginPath();
  ctx.arc(cx + d * r * 0.35, cy + r * 0.1, r * 1.0, 0, Math.PI * 2);
  ctx.arc(cx - d * r * 0.25, cy - r * 0.15, r * 1.02, 0, Math.PI * 2, true);
  ctx.fill("evenodd");
  // Cheveux sur le dessus.
  if (m.hair && m.hair !== "none" && m.hair !== "mohawk") {
    ctx.fillStyle = m.detail;
    ctx.beginPath();
    if (m.hair === "curly") for (let i = 0; i < 7; i++) { const a = Math.PI * (1.05 + i * 0.15); ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.arc(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85, r * 0.3, 0, Math.PI * 2); }
    else if (m.hair === "spiky") { ctx.moveTo(cx - r, cy - r * 0.2); for (let i = 0; i <= 6; i++) ctx.lineTo(cx - r + (i * 2 * r) / 6, cy - r * (i % 2 ? 1.25 : 0.6)); ctx.lineTo(cx + r, cy - r * 0.2); }
    else if (m.hair === "bob") {
      // Frange droite et mèches qui encadrent les joues.
      ctx.rect(cx - r * 1.1, cy - r * 1.1, r * 2.2, r * 0.58);
      ctx.rect(cx - r * 1.1, cy - r * 0.6, r * 0.32, r * 1.3);
      ctx.rect(cx + r * 0.78, cy - r * 0.6, r * 0.32, r * 1.3);
    } else { ctx.ellipse(cx - d * r * 0.08, cy - r * 0.62, r * 1.05, r * 0.5, 0, 0, Math.PI * 2); }
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  if (m.hair === "bun") {
    ctx.fillStyle = m.detail;
    ctx.beginPath();
    ctx.arc(cx - d * r * 0.2, cy - r * 1.05, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (m.hair === "mohawk") {
    // Crête : une bande de pics au milieu du crâne.
    ctx.fillStyle = m.detail;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.24, cy - r * 0.95);
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const x = cx - r * 0.24 + (i * r * 0.48) / n;
      ctx.lineTo(x, cy - r * (i % 2 ? 1.5 : 1.08) - (i % 2 ? Math.abs(i - n / 2) * -0.04 * r : 0));
    }
    ctx.lineTo(cx + r * 0.24, cy - r * 0.95);
    ctx.quadraticCurveTo(cx, cy - r * 1.02, cx - r * 0.24, cy - r * 0.95);
    ctx.closePath();
    ctx.fill();
    inkEdge(ctx);
  }
  const face = drawSketchFace(ctx, p, m, cx, cy, r, d);
  if (m.glasses) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * 0.05;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + d * r * 0.12 + s * r * 0.36, cy - r * 0.02, r * 0.2, 0, Math.PI * 2); ctx.stroke(); }
  }
  if (m.beard) {
    ctx.fillStyle = m.detail;
    ctx.beginPath();
    ctx.arc(cx + d * r * 0.1, cy + r * 0.2, r * 0.82, Math.PI * 0.15, Math.PI * 0.85);
    ctx.quadraticCurveTo(cx, cy + r * 0.62, cx + r * 0.78, cy + r * 0.45);
    ctx.fill();
    mouthOverBeard(ctx, m, face, p);
  }
  if (m.mustache) drawMustache(ctx, m, face.g);
  if (m.headphones) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = r * 0.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.08, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.strokeStyle = "#3a3b45";
    ctx.lineWidth = r * 0.12;
    ctx.stroke();
  }
  if (m.headband) {
    ctx.fillStyle = m.detail;
    ctx.beginPath();
    ctx.rect(cx - r * 0.98, cy - r * 0.55, r * 1.96, r * 0.2);
    ctx.fill();
  }
  drawHatSketch(ctx, m, cx, cy, r, d);
  if (m.earrings) {
    ctx.fillStyle = "#f2c230";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + s * r * 0.93, cy + r * 0.38, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
      inkEdge(ctx, 0.006);
    }
  }
  if (m.headphones) {
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#2b2c35";
      ctx.beginPath();
      ctx.ellipse(cx + s * r * 0.98, cy + r * 0.02, r * 0.2, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      inkEdge(ctx);
      ctx.fillStyle = m.accentColor ?? "#d8423a";
      ctx.beginPath();
      ctx.ellipse(cx + s * r * 1.02, cy + r * 0.02, r * 0.09, r * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Style dessin, vue de face (comme les dessins animés de référence) : chaque bras part d'un côté du t-shirt,
 * chaque jambe d'un côté du bassin ; le bras et la jambe « arrière » sont en miroir. Modifie sk.
 */
function sketchFrontView(sk, p, m) {
  const build = m.build ?? 1, d = p.dir ?? 1;
  const off = 0.075 * build, legOff = 0.035 * build;
  const N0 = sk.neck, H0 = sk.hip;
  let ax0 = H0[0] - N0[0], ay0 = H0[1] - N0[1];
  const al = Math.hypot(ax0, ay0) || 1;
  ax0 /= al; ay0 /= al;
  const px0 = ay0 * d, py0 = -ax0 * d; // perpendiculaire au buste, vers l'avant du personnage (côté où il regarde)
  // axis = [ax, ay, px, py] : axe du buste pour les bras, verticale pour les jambes (sinon une jambe part
  // à l'horizontale dès que le personnage se penche).
  const side = (pts, base, s, mirror, [ax, ay, px, py] = [ax0, ay0, px0, py0]) => pts.map((q) => {
    const rx = q[0] - base[0], ry = q[1] - base[1];
    // Composante perpendiculaire à l'axe : en miroir pour le côté arrière.
    const along = rx * ax + ry * ay, across = rx * px + ry * py;
    const ac = mirror ? -Math.abs(across) - 0.004 : Math.abs(across) + 0.004;
    return [base[0] + px * s + ax * along + px * ac, base[1] + py * s + ay * along + py * ac];
  });
  const vertical = [0, 1, d, 0];
  const front = side([sk.shoulder, sk.elbowF, sk.handF], sk.shoulder, off, false);
  const back = side([sk.shoulder, sk.elbowB, sk.handB], sk.shoulder, -off, true);
  [sk.shoulderF, sk.elbowF, sk.handF] = front;
  [sk.shoulderB, sk.elbowB, sk.handB] = back;
  const legF = side([sk.hip, sk.kneeF, sk.footF], sk.hip, legOff, false, vertical);
  const legB = side([sk.hip, sk.kneeB, sk.footB], sk.hip, -legOff, true, vertical);
  if (!p.rot && !p.sit) {
    [sk.hipF, sk.kneeF, sk.footF] = legF;
    [sk.hipB, sk.kneeB, sk.footB] = legB;
  } else { sk.hipF = sk.hip; sk.hipB = sk.hip; }
}

/**
 * Dessine le personnage en style « dessin » (BD : contour noir, tête couleur peau, t-shirt, membres fins).
 * Mêmes paramètres et même repère que drawFigure.
 */
export function drawSketchFigure(ctx, p, morphIn, x, groundY, H) {
  const m = morphFrom(morphIn);
  const h = H * m.height;
  const sk = skeleton(p, m);
  const low = lowestPoint(sk, p);
  const d = p.dir ?? 1;
  ctx.save();
  ctx.translate(x + (p.dx ?? 0) * H, groundY - (low + (p.lift ?? 0)) * h);
  ctx.scale(h, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawPropsBehind(ctx, p, sk, low, d, m);

  const build = m.build ?? 1;
  const limbW = 0.028 * Math.sqrt(build);
  sketchFrontView(sk, p, m);
  const top = TOPS[m.top] ? m.top : "none", bottom = BOTTOMS[m.bottom] ? m.bottom : "none";
  const legFill = bottom === "pants" ? m.bottomColor : SKETCH_LIMB;
  const shade = (c) => shadeColor(c, 0.9);
  const accent = m.accentColor ?? "#d8423a";
  const tee = top === "labcoat" ? LABCOAT : top !== "none" ? m.topColor : "#fbfbfb";
  const longSleeve = LONG_SLEEVES.has(top), shortSleeve = top === "tshirt" || top === "jersey" || top === "dress";
  // Manche par-dessus le bras : courte (t-shirt, maillot) ou longue (sweat, veste, manteau…).
  const sleeve = (sh, el, hd, dark) => {
    const c = dark ? shade(tee) : tee;
    if (longSleeve) inkLimb(ctx, [sh, el, lerpPt(el, hd, 0.78)], limbW * 1.55, c);
    else if (shortSleeve && top !== "dress") inkLimb(ctx, [sh, lerpPt(sh, el, 0.55)], limbW * 1.75, c);
  };
  const shoe = (knee, foot) => {
    if (bottom === "none") return;
    ctx.fillStyle = m.shoeColor ?? "#16161d";
    ctx.beginPath();
    ctx.ellipse(foot[0] + d * 0.012, foot[1] + 0.004, 0.03, 0.015, 0, 0, Math.PI * 2);
    ctx.fill();
    inkEdge(ctx, 0.008);
  };

  // Axe du buste.
  const N = sk.neck, P = sk.hip;
  let ux = P[0] - N[0], uy = P[1] - N[1];
  const n = Math.hypot(ux, uy) || 1;
  ux /= n; uy /= n;
  const vx = -uy, vy = ux;
  const dress = top === "dress" || m.skirt;
  const coat = LONG_COATS.has(top);
  const wTop = (top === "tank" ? 0.07 : 0.08) * build, wBot = (dress ? 0.15 : coat ? 0.13 : 0.1) * build + (m.belly ?? 0) * 0.04;
  const len = dress ? 0.16 : coat ? 0.24 * (m.legs ?? 1) : 0.07;
  const t0 = [N[0], N[1]], b0 = [P[0] + ux * len, P[1] + uy * len];
  const along = (k, a) => [N[0] + ux * n * k + vx * a, N[1] + uy * n * k + vy * a];

  // Sac à dos : dépasse des deux côtés du buste.
  if (m.backpack) {
    ctx.fillStyle = accent;
    const c = along(0.45, 0);
    ctx.beginPath();
    ctx.ellipse(c[0], c[1], wTop * 1.75, n * 0.42, Math.atan2(uy, ux) - Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
    inkEdge(ctx, 0.012);
  }
  // Côté arrière.
  inkLimb(ctx, [sk.shoulderB, sk.elbowB, sk.handB], limbW, shade(SKETCH_LIMB));
  sleeve(sk.shoulderB, sk.elbowB, sk.handB, true);
  inkHand(ctx, sk.elbowB, sk.handB, limbW);
  if (p.prop === "dumbbell") drawDumbbell(ctx, sk.handB, INK);
  inkLimb(ctx, [sk.hipB, sk.kneeB, sk.footB], limbW * 1.1, shade(legFill));
  inkLimb(ctx, [sk.hipF, sk.kneeF, sk.footF], limbW * 1.1, legFill);
  shoe(sk.kneeB, sk.footB);
  shoe(sk.kneeF, sk.footF);
  if (bottom === "shorts") {
    for (const [hp, k, f] of [[sk.hipB, sk.kneeB, shade(m.bottomColor)], [sk.hipF, sk.kneeF, m.bottomColor]]) inkLimb(ctx, [hp, lerpPt(hp, k, 0.6)], limbW * 1.9, f);
  }
  // Jupe (aux genoux) ou jupe longue (aux chevilles) : trapèze qui part de la taille.
  if (bottom === "skirt" || bottom === "longskirt") {
    const g = { hip: P, neck: N, kneeF: sk.kneeF, kneeB: sk.kneeB, footF: sk.footF, footB: sk.footB };
    polyPath(ctx, legGarment(g, bottom === "longskirt" ? "ankle" : "knee", wBot * 0.9, limbW * 1.6));
    ctx.fillStyle = m.bottomColor;
    ctx.fill();
    inkEdge(ctx, 0.013);
  }

  // Haut : trapèze qui suit le buste (robe et manteaux plus longs).
  ctx.beginPath();
  ctx.moveTo(t0[0] - vx * wTop, t0[1] - vy * wTop);
  ctx.quadraticCurveTo(t0[0], t0[1] - 0.012, t0[0] + vx * wTop, t0[1] + vy * wTop);
  ctx.lineTo(b0[0] + vx * wBot, b0[1] + vy * wBot);
  ctx.quadraticCurveTo(b0[0] + ux * 0.012, b0[1] + uy * 0.012, b0[0] - vx * wBot, b0[1] - vy * wBot);
  ctx.closePath();
  const g = ctx.createLinearGradient(t0[0] - vx * wBot * d, t0[1] - vy * wBot * d, t0[0] + vx * wBot * d, t0[1] + vy * wBot * d);
  g.addColorStop(0, shadeColor(tee, 0.86));
  g.addColorStop(0.45, tee);
  g.addColorStop(1, tee);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.013;
  ctx.stroke();
  // Détails du haut, découpés dans sa forme.
  ctx.save();
  ctx.clip();
  const line = (pts, w = 0.008, color = INK) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  };
  const bottomK = 1 + len / n;
  if (top === "jacket" || top === "suit" || top === "labcoat") {
    const inner = top === "labcoat" ? "#8fb9e3" : "#f7f7f9";
    const pts = top === "suit" ? [along(0, -0.04), along(0, 0.04), along(0.6, 0)] : [along(0, -0.035), along(0, 0.035), along(bottomK, 0.012), along(bottomK, -0.012)];
    polyPath(ctx, pts);
    ctx.fillStyle = inner;
    ctx.fill();
    inkEdge(ctx, 0.008);
    if (top === "suit") {
      ctx.fillStyle = m.tie ? m.detail : "#a3202f";
      polyPath(ctx, [along(0.05, -0.01), along(0.05, 0.01), along(0.5, 0.014), along(0.58, 0), along(0.5, -0.014)]);
      ctx.fill();
      ctx.fillStyle = INK;
      const b = along(0.75, 0);
      ctx.beginPath();
      ctx.arc(b[0], b[1], 0.007, 0, Math.PI * 2);
      ctx.fill();
    }
    if (top === "labcoat") {
      line([along(0.55, -0.065), along(0.55, -0.025)]);
      line([along(0.56, -0.035), along(0.42, -0.035)], 0.007, "#2f6fdc");
    }
  }
  if (top === "coat") {
    line([along(0, 0), along(bottomK, 0)]);
    ctx.fillStyle = INK;
    for (const k of [0.3, 0.55, 0.8]) { const b = along(k, 0.018); ctx.beginPath(); ctx.arc(b[0], b[1], 0.007, 0, Math.PI * 2); ctx.fill(); }
  }
  if (top === "sweater") {
    line([along(bottomK - 0.04, -wBot), along(bottomK - 0.04, wBot)], 0.03, shadeColor(tee, 0.78));
    for (let i = -5; i <= 5; i++) line([along(bottomK - 0.1, (i * wBot) / 5), along(bottomK, (i * wBot) / 5)], 0.004, shadeColor(tee, 0.6));
  }
  if (top === "shirt") {
    ctx.fillStyle = "#ffffff";
    for (const s of [-1, 1]) { polyPath(ctx, [along(0, 0), along(0, s * 0.045), along(0.16, s * 0.012)]); ctx.fill(); inkEdge(ctx, 0.006); }
    ctx.fillStyle = shadeColor(tee, 0.55);
    for (const k of [0.35, 0.55, 0.75]) { const b = along(k, 0); ctx.beginPath(); ctx.arc(b[0], b[1], 0.006, 0, Math.PI * 2); ctx.fill(); }
  }
  if (top === "jersey") {
    const c = along(0.42, 0);
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.rotate(Math.atan2(uy, ux) - Math.PI / 2);
    ctx.fillStyle = luminance(tee) > 0.6 ? "#1b1d26" : "#ffffff";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.004;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${(0.1 * build).toFixed(3)}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(String(m.number ?? 10).slice(0, 2), 0, 0);
    ctx.strokeText(String(m.number ?? 10).slice(0, 2), 0, 0);
    ctx.restore();
  }
  ctx.restore();
  // Cols : capuche, encolure côtelée, encolure dégagée.
  if (top === "hoodie" || top === "sweater") {
    ctx.fillStyle = shadeColor(tee, top === "hoodie" ? 0.8 : 0.78);
    ctx.beginPath();
    ctx.ellipse(N[0], N[1] + 0.004, wTop * (top === "hoodie" ? 0.95 : 0.6), top === "hoodie" ? 0.03 : 0.018, Math.atan2(uy, ux) - Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
    inkEdge(ctx, 0.008);
    if (top === "hoodie") for (const s of [-1, 1]) line([along(0.05, s * 0.018), along(0.3, s * 0.02)], 0.006);
  }
  if (top === "tank") {
    ctx.fillStyle = SKETCH_LIMB;
    ctx.beginPath();
    ctx.ellipse(N[0], N[1], wTop * 0.55, 0.04, Math.atan2(uy, ux) - Math.PI / 2, 0, Math.PI);
    ctx.fill();
    inkEdge(ctx, 0.008);
  }
  if (m.tie && top !== "suit") {
    ctx.fillStyle = m.detail;
    ctx.beginPath();
    ctx.moveTo(N[0] + ux * 0.02 - vx * 0.012, N[1] + uy * 0.02 - vy * 0.012);
    ctx.lineTo(N[0] + ux * 0.02 + vx * 0.012, N[1] + uy * 0.02 + vy * 0.012);
    ctx.lineTo(N[0] + ux * 0.17, N[1] + uy * 0.17);
    ctx.closePath();
    ctx.fill();
  }
  if (m.backpack) {
    // Bretelles sur la poitrine.
    for (const s of [-1, 1]) inkLimb(ctx, [along(0, s * wTop * 0.62), along(0.55, s * wTop * 0.75)], 0.012, shadeColor(accent, 0.7));
  }
  if (m.scarf) {
    inkLimb(ctx, [along(0.02, -wTop * 0.85), along(0.02, wTop * 0.85)], 0.032, accent);
    inkLimb(ctx, [along(0.04, d * wTop * 0.35), along(0.42, d * wTop * 0.45)], 0.026, accent);
  }

  // Côté avant.
  if (p.prop === "phone") drawPhone(ctx, sk, d);
  if (p.prop === "book") drawBook(ctx, sk, d);
  inkLimb(ctx, [sk.shoulderF, sk.elbowF, sk.handF], limbW, SKETCH_LIMB);
  sleeve(sk.shoulderF, sk.elbowF, sk.handF, false);
  inkHand(ctx, sk.elbowF, sk.handF, limbW);
  if (p.prop === "dumbbell") drawDumbbell(ctx, sk.handF, INK);

  drawSketchHead(ctx, p, m, sk, d);
  if (p.prop === "mask") drawMask(ctx, sk, d, p.setK ?? 0);
  if (p.symbol) drawSymbol(ctx, p.symbol, sk, d, p);
  ctx.restore();
}

function shadeColor(hex, f) {
  return /^#[0-9a-f]{6}$/i.test(hex) ? shade(hex, f) : hex;
}
