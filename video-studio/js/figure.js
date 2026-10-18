// © la triche — Animots
// Dessin d'un personnage « pictogramme » (membres épais et arrondis, grosse tête, deux yeux),
// avec morphologie et accessoires réglables. Toutes les coordonnées sont en unités « hauteur = 1 ».

import { skeleton } from "./poses.js";

/** Morphologie par défaut et préréglages. */
export const DEFAULT_MORPH = Object.freeze({
  height: 1, build: 1, belly: 0, headSize: 1, legs: 1, arms: 1, torso: 1,
  color: "#f1f1f3", detail: "#22232b",
  hair: "none", glasses: false, beard: false, cap: false, headband: false, skirt: false, tie: false,
  // Vêtements : haut (aucun, t-shirt, sweat à capuche, chemise, robe) et bas (aucun, pantalon, short).
  top: "none", topColor: "#3b6fd8", bottom: "none", bottomColor: "#2a2d3a",
  // Yeux : points, grands, cils, endormis.
  eyes: "dots",
});

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

/** Dessin « à plat » du personnage, à l'origine (x, groundY). */
function drawFlat(ctx, p, m, x, groundY, h) {
  const sk = skeleton(p, m);
  const low = lowestPoint(sk, p);
  const d = p.dir ?? 1;
  const limbW = 0.084 * m.build;
  const bodyW = 0.2 * m.build;
  const back = shade(m.color, 0.86);
  const top = m.top ?? "none", bottom = m.bottom ?? "none";
  const topC = m.topColor ?? "#3b6fd8", botC = m.bottomColor ?? "#2a2d3a";
  const bodyColor = top !== "none" && top !== "dress" ? topC : m.color;
  const shoe = "#16161d";

  // Manches (t-shirt : courte ; sweat et chemise : longue) et jambes de pantalon, par-dessus le membre.
  const sleeve = (a, b, c, dark) => {
    if (top === "none" || top === "dress") return;
    part(ctx, dark ? shade(topC, 0.86) : topC, (ext) => {
      ctx.lineWidth = limbW * 1.14 + ext;
      partialCurve(ctx, a, b, c, top === "tshirt" ? 0.32 : 0.86);
      ctx.stroke();
    });
  };
  const trouser = (a, b, c, dark) => {
    if (bottom === "none") return;
    part(ctx, dark ? shade(botC, 0.86) : botC, (ext) => {
      ctx.lineWidth = limbW * 1.18 + ext;
      partialCurve(ctx, a, b, c, bottom === "shorts" ? 0.42 : 0.94);
      ctx.stroke();
    });
  };
  const legEnd = (knee, foot) => ({ foot: footTip(knee, foot, d) });

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
  if (bottom !== "none") part(ctx, shoe, (ext) => { ctx.lineWidth = limbW * 0.95 + ext; ctx.beginPath(); ctx.moveTo(sk.footB[0], sk.footB[1]); const f = footTip(sk.kneeB, sk.footB, d); ctx.lineTo(f[0], f[1]); ctx.stroke(); });

  // Derrière la tête : cheveux longs, capuche.
  if (m.hair === "long") {
    part(ctx, m.detail, () => {
      const c = sk.headC, r = sk.headR * 1.08;
      ctx.beginPath();
      ctx.ellipse(c[0] - d * r * 0.25, c[1] + r * 0.55, r * 0.95, r * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  if (top === "hoodie") {
    part(ctx, shade(topC, 0.8), () => {
      ctx.beginPath();
      ctx.ellipse(sk.headC[0] - d * sk.headR * 0.35, sk.headC[1] + sk.headR * 0.6, sk.headR * 0.9, sk.headR * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Buste.
  part(ctx, bodyColor, (ext) => {
    torsoShape(ctx, sk, bodyW, m.belly ?? 0, d);
    ctx.fill();
    if (ext) { ctx.lineWidth = ext; ctx.stroke(); }
  });
  // Bas du corps (bassin) de la couleur du pantalon.
  if (bottom !== "none") {
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
  if (m.skirt) {
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
  if (top === "shirt") {
    const n = sk.neck, hp = sk.hip;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(n[0] - 0.04, n[1] + 0.012);
    ctx.lineTo(n[0] + 0.04, n[1] + 0.012);
    ctx.lineTo(n[0] + d * 0.01, n[1] + 0.055);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(topC, 0.6);
    for (const k of [0.3, 0.5, 0.7]) { const b = lerpPt(n, hp, k); ctx.beginPath(); ctx.arc(b[0] + d * 0.014, b[1], 0.006, 0, Math.PI * 2); ctx.fill(); }
  }
  if (m.tie) {
    ctx.fillStyle = m.detail;
    const n = sk.neck, hp = sk.hip;
    const ux = hp[0] - n[0], uy = hp[1] - n[1];
    const ox = d * bodyW * 0.18;
    ctx.beginPath();
    ctx.moveTo(n[0] + ox + ux * 0.1, n[1] + uy * 0.1);
    ctx.lineTo(n[0] + ox + ux * 0.55 + 0.018, n[1] + uy * 0.55);
    ctx.lineTo(n[0] + ox + ux * 0.64, n[1] + uy * 0.64);
    ctx.lineTo(n[0] + ox + ux * 0.55 - 0.018, n[1] + uy * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  // Côté avant.
  limbPart(ctx, sk.hip, sk.kneeF, sk.footF, limbW * 1.1, m.color, legEnd(sk.kneeF, sk.footF));
  trouser(sk.hip, sk.kneeF, sk.footF, false);
  if (bottom !== "none") part(ctx, shoe, (ext) => { ctx.lineWidth = limbW * 0.95 + ext; ctx.beginPath(); ctx.moveTo(sk.footF[0], sk.footF[1]); const f = footTip(sk.kneeF, sk.footF, d); ctx.lineTo(f[0], f[1]); ctx.stroke(); });

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
export function figureJoints(p, morphIn, x, groundY, H) {
  const m = morphFrom(morphIn);
  const h = H * m.height;
  const sk = skeleton(p, m);
  const low = lowestPoint(sk, p);
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
  const r = sk.headR * 1.6; // tête + coiffure (afro, chignon, queue de cheval, casquette)
  x0 = Math.min(x0, sk.headC[0] - r); x1 = Math.max(x1, sk.headC[0] + r);
  y0 = Math.min(y0, sk.headC[1] - r); y1 = Math.max(y1, sk.headC[1] + r);
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

function drawHead(ctx, sk, p, m, d) {
  const [cx, cy] = sk.headC;
  const r = sk.headR;
  ctx.fillStyle = m.color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Cheveux.
  ctx.fillStyle = m.detail;
  if (m.hair === "short" || m.hair === "long") {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.04, Math.PI * 1.05, Math.PI * 1.95);
    ctx.quadraticCurveTo(cx, cy - r * 0.45, cx - r * 1.0, cy - r * 0.15);
    ctx.fill();
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
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.04, Math.PI * 1.05, Math.PI * 1.95);
    ctx.quadraticCurveTo(cx, cy - r * 0.45, cx - r * 1.0, cy - r * 0.15);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - d * r * 1.15, cy + r * 0.1 + Math.sin((p.time ?? 0) * 3) * r * 0.05, r * 0.3, r * 0.62, d * 0.35, 0, Math.PI * 2);
    ctx.fill();
  } else if (m.hair === "spiky") {
    ctx.beginPath();
    // Mèches en pointe : un bonnet de cheveux qui épouse le crâne, avec des pics.
    ctx.arc(cx, cy, r * 1.03, Math.PI * 1.08, Math.PI * 1.92);
    for (let i = 10; i >= 0; i--) {
      const a = Math.PI * (1.08 + (i / 10) * 0.84);
      const rr = i % 2 ? r * 0.98 : r * 1.24;
      ctx.lineTo(cx + Math.cos(a) * rr - d * r * 0.05, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  if (m.cap) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.05, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + d * r * 0.95, cy - r * 0.06, r * 0.65, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (m.headband) {
    ctx.strokeStyle = m.detail;
    ctx.lineWidth = r * 0.28;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.98, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  }

  // Visage : décalé vers la direction du regard.
  const fx = cx + d * r * 0.28;
  const fy = cy + (p.look ?? 0) * -r * 0.12;
  const ex = r * 0.3, ey = fy - r * 0.08;
  // Sur une peau foncée, les traits sont clairs pour rester visibles.
  const darkSkin = luminance(m.color) < 0.42;
  const ink = darkSkin ? "#f4efe9" : "#15161c";
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = r * 0.13;
  const face = p.face ?? "neutral";
  const eyes = m.eyes ?? "dots";
  const eyeR = r * (face === "surprised" ? 0.17 : eyes === "big" ? 0.2 : 0.14);
  for (const sx of [-1, 1]) {
    const exx = fx + sx * ex;
    if (face === "closed" || face === "laugh" || (eyes === "sleepy" && face !== "surprised")) {
      ctx.beginPath();
      if (face === "laugh") ctx.arc(exx, ey + r * 0.05, eyeR, Math.PI * 1.1, Math.PI * 1.9);
      else if (eyes === "sleepy" && face !== "closed") { ctx.moveTo(exx - eyeR, ey); ctx.lineTo(exx + eyeR, ey); }
      else ctx.arc(exx, ey - r * 0.02, eyeR, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    } else if (eyes === "big") {
      // Grands yeux : blanc, pupille, reflet.
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(exx, ey, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = r * 0.05;
      ctx.strokeStyle = "#15161c";
      ctx.stroke();
      ctx.fillStyle = "#15161c";
      ctx.beginPath();
      ctx.arc(exx + d * eyeR * 0.25, ey + eyeR * 0.1, eyeR * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(exx + d * eyeR * 0.05, ey - eyeR * 0.15, eyeR * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.strokeStyle = ink;
      ctx.lineWidth = r * 0.13;
    } else {
      // Yeux ovales, comme les pictogrammes de référence.
      ctx.beginPath();
      ctx.ellipse(exx, ey, eyeR * 0.82, eyeR * 1.18, 0, 0, Math.PI * 2);
      ctx.fill();
      if (eyes === "lashes") {
        ctx.lineWidth = r * 0.06;
        for (const k of [-0.6, 0, 0.6]) {
          ctx.beginPath();
          ctx.moveTo(exx + Math.sin(k) * eyeR, ey - Math.cos(k) * eyeR);
          ctx.lineTo(exx + Math.sin(k) * eyeR * 1.8, ey - Math.cos(k) * eyeR * 1.8);
          ctx.stroke();
        }
        ctx.lineWidth = r * 0.13;
      }
    }
  }
  // Sourcils.
  if (face === "angry" || face === "sad") {
    ctx.beginPath();
    for (const sx of [-1, 1]) {
      const inner = face === "angry" ? 0.12 : -0.08;
      ctx.moveTo(fx + sx * ex * 1.6, ey - r * 0.3 - (face === "sad" ? r * 0.08 : 0));
      ctx.lineTo(fx + sx * ex * 0.4, ey - r * 0.3 + r * inner);
    }
    ctx.stroke();
  }
  // Bouche.
  const my = fy + r * 0.42;
  const open = p.mouthOpen ?? 0;
  ctx.beginPath();
  const mShape = face === "talk" ? p.mouthShape : null;
  if (mShape === "M" || mShape === "F") {
    ctx.moveTo(fx - r * 0.2, my);
    ctx.lineTo(fx + r * 0.2, my);
    ctx.stroke();
  } else if (face === "laugh" || face === "talk" || face === "surprised" || (face === "angry" && open > 0.5)) {
    const md = mShape ? mouthDims(mShape, open, r * 1.25) : null;
    const w = face === "surprised" ? r * 0.16 : md ? md.w : r * 0.28;
    ctx.ellipse(fx, my, w, md ? md.h : r * (0.06 + 0.2 * Math.max(open, face === "surprised" ? 0.8 : 0.15)), 0, 0, Math.PI * 2);
    if (darkSkin) {
      ctx.fillStyle = "#2a0b0b";
      ctx.fill();
      ctx.lineWidth = r * 0.06;
      ctx.stroke();
      ctx.lineWidth = r * 0.13;
      ctx.fillStyle = ink;
    } else ctx.fill();
  } else if (face === "happy") {
    ctx.arc(fx, my - r * 0.18, r * 0.3, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  } else if (face === "sad") {
    ctx.arc(fx, my + r * 0.18, r * 0.24, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  } else if (face === "angry") {
    ctx.moveTo(fx - r * 0.22, my);
    ctx.lineTo(fx + r * 0.22, my);
    ctx.stroke();
  }

  if (m.beard) {
    ctx.fillStyle = m.detail;
    ctx.beginPath();
    ctx.arc(cx + d * r * 0.1, cy + r * 0.1, r * 0.98, Math.PI * 0.15, Math.PI * 0.85);
    ctx.quadraticCurveTo(cx, cy + r * 0.62, cx + r * 0.97, cy + r * 0.25);
    ctx.fill();
    // La bouche reste visible par-dessus la barbe.
    if (face === "laugh" || face === "talk" || face === "surprised") {
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(fx, my, r * 0.24, r * (0.06 + 0.2 * open), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (m.glasses) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = r * 0.09;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(fx + sx * ex, ey, r * 0.24, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(fx - ex + r * 0.24, ey);
    ctx.lineTo(fx + ex - r * 0.24, ey);
    ctx.stroke();
  }
  // Larme qui coule.
  if (face === "sad" && p.symbol === "tear") {
    const k = ((p.time ?? 0) * 0.7) % 1;
    ctx.fillStyle = "#7fc4ff";
    ctx.beginPath();
    ctx.arc(fx + ex, ey + r * 0.2 + k * r * 0.9, r * 0.1, 0, Math.PI * 2);
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
  const face = p.face ?? "neutral";
  const fx = cx + d * r * 0.12;
  const ey = cy - r * 0.02, sx = r * 0.36;
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineCap = "round";
  // Sourcils : leur angle porte l'émotion.
  ctx.lineWidth = r * 0.07;
  for (const s of [-1, 1]) {
    const bx = fx + s * sx, by = ey - r * 0.32;
    const tilt = face === "angry" ? 0.18 * s : face === "sad" || face === "cry" ? -0.16 * s : 0;
    ctx.beginPath();
    ctx.moveTo(bx - r * 0.16, by + tilt * r);
    ctx.quadraticCurveTo(bx, by - r * (face === "surprised" ? 0.14 : 0.08), bx + r * 0.16, by - tilt * r);
    ctx.stroke();
  }
  // Yeux.
  for (const s of [-1, 1]) {
    const ex = fx + s * sx;
    if (face === "closed" || face === "laugh") {
      ctx.lineWidth = r * 0.06;
      ctx.beginPath();
      ctx.arc(ex, ey + r * 0.02, r * 0.1, face === "laugh" ? Math.PI * 1.1 : Math.PI * 0.1, face === "laugh" ? Math.PI * 1.9 : Math.PI * 0.9);
      ctx.stroke();
      continue;
    }
    const big = face === "surprised";
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * (big ? 0.11 : 0.09), r * (big ? 0.14 : 0.12), 0, 0, Math.PI * 2);
    ctx.fill();
    // Paupière : regard posé (comme les dessins de référence), sauf surpris.
    if (!big) {
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.13, ey - r * 0.03);
      ctx.lineTo(ex + r * 0.13, ey - r * 0.03);
      ctx.stroke();
      ctx.fillStyle = sketchSkin(m);
      ctx.fillRect(ex - r * 0.12, ey - r * 0.16, r * 0.24, r * 0.11);
      ctx.fillStyle = INK;
    }
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ex + r * 0.03, ey + r * 0.01, r * 0.025, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
  }
  // Bouche.
  const my = cy + r * 0.38, open = p.mouthOpen ?? 0;
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  const shape = face === "talk" ? p.mouthShape : null;
  if (shape === "M" || shape === "F") {
    // Lèvres fermées (m, b, p) ou lèvre sous les dents (f, v).
    ctx.moveTo(fx - r * 0.17, my);
    ctx.lineTo(fx + r * 0.17, my);
    ctx.stroke();
    if (shape === "F") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(fx - r * 0.1, my - r * 0.07, r * 0.2, r * 0.06);
      ctx.strokeRect(fx - r * 0.1, my - r * 0.07, r * 0.2, r * 0.06);
    }
  } else if (face === "laugh" || face === "talk" || face === "surprised" || (face === "angry" && open > 0.5)) {
    const dims = mouthDims(shape, face === "surprised" ? 0.8 : open, r);
    const w = face === "surprised" ? r * 0.12 : dims.w;
    ctx.ellipse(fx, my, w, face === "surprised" ? r * (0.05 + 0.16 * 0.8) : dims.h, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#5a1a1a";
    ctx.fill();
    ctx.stroke();
    // Dents du haut pour les sons ouverts (a, è).
    if (shape === "A" || shape === "E") {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(fx - w, my - dims.h, w * 2, dims.h * 0.45);
      ctx.restore();
    }
  } else if (face === "happy") {
    ctx.arc(fx, my - r * 0.16, r * 0.22, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  } else if (face === "sad" || face === "cry") {
    ctx.arc(fx, my + r * 0.14, r * 0.18, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  } else {
    // Petit trait légèrement de travers : l'air pensif des vidéos de référence.
    ctx.moveTo(fx - r * 0.17, my + r * 0.02);
    ctx.quadraticCurveTo(fx, my - r * 0.03, fx + r * 0.17, my - r * 0.03);
    ctx.stroke();
  }
  if ((face === "sad" || face === "cry") && p.symbol === "tear") {
    ctx.fillStyle = "#8fd0ff";
    ctx.beginPath();
    ctx.ellipse(fx + sx, ey + r * 0.25, r * 0.05, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSketchHead(ctx, p, m, sk, d) {
  const [cx, cy] = sk.headC;
  const r = sk.headR;
  const skin = sketchSkin(m);
  // Cheveux longs derrière la tête.
  if (m.hair === "long" || m.hair === "ponytail") {
    ctx.fillStyle = m.detail;
    ctx.beginPath();
    if (m.hair === "long") ctx.ellipse(cx - d * r * 0.1, cy + r * 0.25, r * 1.08, r * 1.05, 0, 0, Math.PI * 2);
    else ctx.ellipse(cx - d * r * 1.05, cy - r * 0.1, r * 0.3, r * 0.5, d * 0.5, 0, Math.PI * 2);
    ctx.fill();
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
  if (m.hair && m.hair !== "none") {
    ctx.fillStyle = m.detail;
    ctx.beginPath();
    if (m.hair === "curly") for (let i = 0; i < 7; i++) { const a = Math.PI * (1.05 + i * 0.15); ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.arc(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85, r * 0.3, 0, Math.PI * 2); }
    else if (m.hair === "spiky") { ctx.moveTo(cx - r, cy - r * 0.2); for (let i = 0; i <= 6; i++) ctx.lineTo(cx - r + (i * 2 * r) / 6, cy - r * (i % 2 ? 1.25 : 0.6)); ctx.lineTo(cx + r, cy - r * 0.2); }
    else { ctx.ellipse(cx - d * r * 0.08, cy - r * 0.62, r * 1.05, r * 0.5, 0, 0, Math.PI * 2); }
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
  drawSketchFace(ctx, p, m, cx, cy, r, d);
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
  }
  if (m.cap || m.headband) {
    ctx.fillStyle = m.detail;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.01;
    ctx.beginPath();
    if (m.cap) {
      ctx.arc(cx, cy - r * 0.15, r * 1.0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(cx + (d > 0 ? 0 : -r * 1.3), cy - r * 0.32, r * 1.3, r * 0.14);
    } else {
      ctx.rect(cx - r * 0.98, cy - r * 0.55, r * 1.96, r * 0.2);
      ctx.fill();
    }
  }
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
  // Vue de face (comme les dessins animés de référence) : chaque bras part d'un côté du t-shirt,
  // chaque jambe d'un côté du bassin ; le bras et la jambe « arrière » sont en miroir.
  {
    const off = 0.075 * build, legOff = 0.035 * build;
    const N0 = sk.neck, H0 = sk.hip;
    let ax = H0[0] - N0[0], ay = H0[1] - N0[1];
    const al = Math.hypot(ax, ay) || 1;
    ax /= al; ay /= al;
    const px = -ay * d, py = ax * d; // perpendiculaire au buste, vers l'avant du personnage
    const side = (pts, base, s, mirror) => pts.map((q) => {
      const rx = q[0] - base[0], ry = q[1] - base[1];
      // Composante perpendiculaire au buste : en miroir pour le côté arrière.
      const along = rx * ax + ry * ay, across = rx * px + ry * py;
      const ac = mirror ? -Math.abs(across) - 0.004 : Math.abs(across) + 0.004;
      return [base[0] + px * s + ax * along + px * ac, base[1] + py * s + ay * along + py * ac];
    });
    const front = side([sk.shoulder, sk.elbowF, sk.handF], sk.shoulder, off, false);
    const back = side([sk.shoulder, sk.elbowB, sk.handB], sk.shoulder, -off, true);
    [sk.shoulderF, sk.elbowF, sk.handF] = front;
    [sk.shoulderB, sk.elbowB, sk.handB] = back;
    const legF = side([sk.hip, sk.kneeF, sk.footF], sk.hip, legOff, false);
    const legB = side([sk.hip, sk.kneeB, sk.footB], sk.hip, -legOff, true);
    if (!p.rot && !p.sit) {
      [sk.hipF, sk.kneeF, sk.footF] = legF;
      [sk.hipB, sk.kneeB, sk.footB] = legB;
    } else { sk.hipF = sk.hip; sk.hipB = sk.hip; }
  }
  const bottom = m.bottom ?? "none";
  const legFill = bottom === "pants" ? m.bottomColor : SKETCH_LIMB;
  const shade = (c) => shadeColor(c, 0.9);

  // Côté arrière.
  inkLimb(ctx, [sk.shoulderB, sk.elbowB, sk.handB], limbW, shade(SKETCH_LIMB));
  inkHand(ctx, sk.elbowB, sk.handB, limbW);
  if (p.prop === "dumbbell") drawDumbbell(ctx, sk.handB, INK);
  inkLimb(ctx, [sk.hipB, sk.kneeB, sk.footB], limbW * 1.1, shade(legFill));
  inkLimb(ctx, [sk.hipF, sk.kneeF, sk.footF], limbW * 1.1, legFill);
  if (bottom === "shorts") {
    for (const [hp, k, f] of [[sk.hipB, sk.kneeB, shade(m.bottomColor)], [sk.hipF, sk.kneeF, m.bottomColor]]) inkLimb(ctx, [hp, lerpPt(hp, k, 0.6)], limbW * 1.9, f);
  }

  // T-shirt (ou robe) : trapèze qui suit le buste.
  const N = sk.neck, P = sk.hip;
  let ux = P[0] - N[0], uy = P[1] - N[1];
  const n = Math.hypot(ux, uy) || 1;
  ux /= n; uy /= n;
  const vx = -uy, vy = ux;
  const dress = m.top === "dress" || m.skirt;
  const wTop = 0.08 * build, wBot = (dress ? 0.15 : 0.1) * build + (m.belly ?? 0) * 0.04;
  const t0 = [N[0] + ux * 0.0, N[1] + uy * 0.0], b0 = [P[0] + ux * (dress ? 0.16 : 0.07), P[1] + uy * (dress ? 0.16 : 0.07)];
  const tee = m.top && m.top !== "none" ? m.topColor : "#fbfbfb";
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
  if (m.tie) {
    ctx.fillStyle = m.detail;
    ctx.beginPath();
    ctx.moveTo(N[0] + ux * 0.02 - vx * 0.012, N[1] + uy * 0.02 - vy * 0.012);
    ctx.lineTo(N[0] + ux * 0.02 + vx * 0.012, N[1] + uy * 0.02 + vy * 0.012);
    ctx.lineTo(N[0] + ux * 0.17, N[1] + uy * 0.17);
    ctx.closePath();
    ctx.fill();
  }

  // Côté avant.
  if (p.prop === "phone") drawPhone(ctx, sk, d);
  if (p.prop === "book") drawBook(ctx, sk, d);
  inkLimb(ctx, [sk.shoulderF, sk.elbowF, sk.handF], limbW, SKETCH_LIMB);
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
