// Dessin d'un personnage « pictogramme » (membres épais et arrondis, grosse tête, deux yeux),
// avec morphologie et accessoires réglables. Toutes les coordonnées sont en unités « hauteur = 1 ».

import { skeleton } from "./poses.js";

/** Morphologie par défaut et préréglages. */
export const DEFAULT_MORPH = Object.freeze({
  height: 1, build: 1, belly: 0, headSize: 1, legs: 1, arms: 1, torso: 1,
  color: "#f1f1f3", detail: "#22232b",
  hair: "none", glasses: false, beard: false, cap: false, headband: false, skirt: false, tie: false,
});

export const PRESETS = {
  penseur: { label: ["Penseur", "Denker", "Thinker"], morph: {} },
  gris: { label: ["Gris (duo)", "Grau (Duo)", "Grey (duo)"], morph: { color: "#b9babf", glasses: true } },
  sportif: { label: ["Sportif", "Sportler", "Athlete"], morph: { build: 1.15, legs: 1.05, arms: 1.05, headSize: 0.92, headband: true, color: "#f1f1f3", detail: "#e0344b" } },
  femme: { label: ["Femme", "Frau", "Woman"], morph: { build: 0.88, hair: "long", skirt: true, headSize: 1.02 } },
  ado: { label: ["Ado", "Teenager", "Teen"], morph: { height: 0.9, build: 0.85, headSize: 1.08, hair: "short", cap: true, detail: "#2f6fdc" } },
  enfant: { label: ["Enfant", "Kind", "Child"], morph: { height: 0.68, build: 0.95, headSize: 1.35, legs: 0.85, hair: "bun" } },
  costaud: { label: ["Costaud", "Kräftig", "Stocky"], morph: { build: 1.5, belly: 0.8, headSize: 0.95, beard: true } },
  ancien: { label: ["Grand-père", "Opa", "Grandpa"], morph: { height: 0.95, build: 0.9, glasses: true, beard: true, hair: "short", detail: "#9a9aa3" } },
  pro: { label: ["Bureau", "Büro", "Office"], morph: { build: 1, tie: true, hair: "short", detail: "#c43a3a" } },
};

export function morphFrom(m) {
  return { ...DEFAULT_MORPH, ...(m ?? {}) };
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function seg(ctx, a, b, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function limb(ctx, a, b, c, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.lineTo(c[0], c[1]);
  ctx.stroke();
}

/** Point le plus bas du personnage (pour le poser au sol), en unités de hauteur. */
export function lowestPoint(sk, p) {
  let low = Math.max(sk.footF[1], sk.footB[1], sk.kneeF[1], sk.kneeB[1]);
  if (p.lie > 0) low = Math.max(low, 0.035);
  return low;
}

/**
 * Dessine le personnage. (x, groundY) en pixels, H = hauteur du personnage en pixels.
 * Le personnage est posé au sol puis élevé de p.lift.
 */
export function drawFigure(ctx, p, morphIn, x, groundY, H) {
  const m = morphFrom(morphIn);
  const h = H * m.height;
  const sk = skeleton(p, m);
  const low = lowestPoint(sk, p);
  const d = p.dir ?? 1;
  const limbW = 0.082 * m.build;
  const bodyW = 0.15 * m.build;
  const back = shade(m.color, 0.78);

  ctx.save();
  ctx.translate(x + (p.dx ?? 0) * H, groundY - (low + (p.lift ?? 0)) * h);
  ctx.scale(h, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Accessoires derrière le personnage.
  if (p.prop === "bench") drawBench(ctx, sk, low, d);
  if (p.prop === "mat") drawMat(ctx, low);

  // Membres arrière (plus sombres pour la profondeur).
  limb(ctx, sk.shoulder, sk.elbowB, sk.handB, limbW, back);
  limb(ctx, sk.hip, sk.kneeB, sk.footB, limbW * 1.08, back);
  if (p.prop === "dumbbell") drawDumbbell(ctx, sk.handB, back);

  // Cheveux longs derrière la tête.
  if (m.hair === "long") {
    ctx.fillStyle = m.detail;
    const c = sk.headC, r = sk.headR * 1.08;
    ctx.beginPath();
    ctx.ellipse(c[0] - d * r * 0.25, c[1] + r * 0.55, r * 0.95, r * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Buste.
  seg(ctx, sk.hip, sk.neck, bodyW, m.color);
  if (m.belly > 0) {
    ctx.fillStyle = m.color;
    const mid = [(sk.hip[0] + sk.neck[0]) / 2, (sk.hip[1] + sk.neck[1]) / 2 + 0.02];
    ctx.beginPath();
    ctx.ellipse(mid[0] + d * 0.02 * m.belly, mid[1], bodyW * (0.5 + 0.35 * m.belly), sk.torso * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (m.skirt) {
    ctx.fillStyle = m.detail;
    const hp = sk.hip, top = [hp[0] + (sk.neck[0] - hp[0]) * 0.2, hp[1] + (sk.neck[1] - hp[1]) * 0.2];
    ctx.beginPath();
    ctx.moveTo(top[0] - 0.06, top[1]);
    ctx.lineTo(top[0] + 0.06, top[1]);
    ctx.lineTo(hp[0] + 0.11, hp[1] + 0.13);
    ctx.lineTo(hp[0] - 0.11, hp[1] + 0.13);
    ctx.closePath();
    ctx.fill();
  }
  if (m.tie) {
    ctx.fillStyle = m.detail;
    const n = sk.neck, hp = sk.hip;
    const ux = (hp[0] - n[0]), uy = (hp[1] - n[1]);
    const ox = d * bodyW * 0.32;
    ctx.beginPath();
    ctx.moveTo(n[0] + ox + ux * 0.08, n[1] + uy * 0.08);
    ctx.lineTo(n[0] + ox + ux * 0.55 + 0.016, n[1] + uy * 0.55);
    ctx.lineTo(n[0] + ox + ux * 0.62, n[1] + uy * 0.62);
    ctx.lineTo(n[0] + ox + ux * 0.55 - 0.016, n[1] + uy * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  // Jambe avant.
  limb(ctx, sk.hip, sk.kneeF, sk.footF, limbW * 1.08, m.color);

  // Tête.
  drawHead(ctx, sk, p, m, d);

  // Bras avant et objets tenus.
  if (p.prop === "phone") drawPhone(ctx, sk, d);
  if (p.prop === "book") drawBook(ctx, sk, d);
  limb(ctx, sk.shoulder, sk.elbowF, sk.handF, limbW, m.color);
  if (p.prop === "dumbbell") drawDumbbell(ctx, sk.handF, m.detail);

  // Symbole au-dessus de la tête.
  if (p.symbol) drawSymbol(ctx, p.symbol, sk, d);

  ctx.restore();
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
  const ink = "#15161c";
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = r * 0.13;
  const face = p.face ?? "neutral";
  const eyeR = r * (face === "surprised" ? 0.17 : 0.14);
  for (const sx of [-1, 1]) {
    const exx = fx + sx * ex;
    if (face === "closed" || face === "laugh") {
      ctx.beginPath();
      if (face === "laugh") ctx.arc(exx, ey + r * 0.05, eyeR, Math.PI * 1.1, Math.PI * 1.9);
      else ctx.arc(exx, ey - r * 0.02, eyeR, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(exx, ey, eyeR, 0, Math.PI * 2);
      ctx.fill();
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
  if (face === "laugh" || face === "talk" || face === "surprised") {
    const w = face === "surprised" ? r * 0.16 : r * 0.28;
    ctx.ellipse(fx, my, w, r * (0.06 + 0.2 * Math.max(open, face === "surprised" ? 0.8 : 0.15)), 0, 0, Math.PI * 2);
    ctx.fill();
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

function drawSymbol(ctx, sym, sk, d) {
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
