// © la triche — Animots
// Décors liés à une action (pluie, mur, porte, escalier, lit, lampadaire, foule, ciel étoilé…).
// Ils sont dessinés dans le repère de la caméra, autour du personnage : J = figureJoints(…) donne
// la position à l'écran de ses articulations, J.h sa taille en pixels et J.d le côté où il regarde.

const { sin, cos, PI, min, abs } = Math;

/** Petit hasard stable (même valeur à chaque image) pour placer gouttes, étoiles, silhouettes. */
const hash = (i) => {
  const x = sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Décor dessiné derrière le personnage. t : temps (s). */
export function drawSetBehind(ctx, p, J, t) {
  const fn = BEHIND[p.set];
  if (!fn) return;
  ctx.save();
  fn(ctx, p, J, t);
  ctx.restore();
}

/** Décor (ou effet) dessiné devant le personnage. */
export function drawSetFront(ctx, p, J, t) {
  const fn = FRONT[p.set];
  if (!fn) return;
  ctx.save();
  fn(ctx, p, J, t);
  ctx.restore();
}

// ——— Petits outils de dessin pour les accessoires (formes plates, contour sombre lisible sur tous les fonds) ———
const INK = "#15151f";
const ink = (ctx, J, w = 0.007) => {
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, J.h * w);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
};
const paint = (ctx, fill) => {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
};
const dot = (ctx, x, y, r) => {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, PI * 2);
};
const unit = (a, b) => {
  const x = b[0] - a[0], y = b[1] - a[1], n = Math.hypot(x, y) || 1;
  return [x / n, y / n];
};
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
function line(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
/** Rectangle arrondi centré en (cx, cy), tourné de a radians. */
function box(ctx, cx, cy, w, h, a, fill, r = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  paint(ctx, fill);
  ctx.restore();
}
function heartShape(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.4);
  ctx.bezierCurveTo(x - s * 1.1, y - s * 0.3, x - s * 0.5, y - s * 1.05, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.5, y - s * 1.05, x + s * 1.1, y - s * 0.3, x, y + s * 0.4);
  ctx.closePath();
}
function starShape(ctx, x, y, r, n = 5, inner = 0.45, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot - PI / 2 + (i * PI) / n, rr = i % 2 ? r * inner : r;
    ctx.lineTo(x + cos(a) * rr, y + sin(a) * rr);
  }
  ctx.closePath();
}
/** Bulle de BD avec un texte. */
function bubble(ctx, J, x, y, text, fill = "#ffffff", color = INK, alpha = 1) {
  if (alpha <= 0) return;
  const { h } = J;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `800 ${h * 0.055}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + h * 0.06, bh = h * 0.09;
  ink(ctx, J, 0.006);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - bh / 2, w, bh, bh / 2);
  paint(ctx, fill);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + h * 0.003);
  ctx.restore();
}
/** Chaise et bureau (assis) : le plateau arrive sous les mains. */
function deskAndChair(ctx, J) {
  const { h, d } = J;
  const [hx, hy] = J.hip;
  const gy = J.base[1];
  ink(ctx, J);
  // Chaise.
  const c0 = hx - d * h * 0.14, c1 = hx + d * h * 0.1, seat = hy + h * 0.035;
  ctx.fillStyle = "#4c5370";
  ctx.beginPath();
  ctx.roundRect(Math.min(c0, c1), seat, Math.abs(c1 - c0), h * 0.035, h * 0.01);
  paint(ctx, "#4c5370");
  rod(ctx, J, c0 + d * h * 0.02, seat, c0 + d * h * 0.02, gy, 0.018, "#4c5370");
  rod(ctx, J, c1 - d * h * 0.02, seat, c1 - d * h * 0.02, gy, 0.018, "#4c5370");
  box(ctx, c0 - d * h * 0.005, hy - h * 0.13, h * 0.03, h * 0.32, -d * 0.12, "#4c5370", h * 0.012);
  // Bureau.
  const top = hy - h * 0.125, x0 = hx + d * h * 0.12, x1 = hx + d * h * 0.78;
  rod(ctx, J, x0 + d * h * 0.04, top, x0 + d * h * 0.04, gy, 0.022, "#8a5c36");
  rod(ctx, J, x1 - d * h * 0.04, top, x1 - d * h * 0.04, gy, 0.022, "#8a5c36");
  ctx.beginPath();
  ctx.roundRect(Math.min(x0, x1), top, Math.abs(x1 - x0), h * 0.035, h * 0.008);
  paint(ctx, "#a87447");
  return { top, x0, x1 };
}
/** Barre épaisse colorée avec contour (pied de chaise, manche, mât…). w : épaisseur en hauteurs de personnage. */
function rod(ctx, J, x0, y0, x1, y1, w, color) {
  const { h } = J;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = h * (w + 0.012);
  line(ctx, x0, y0, x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = h * w;
  line(ctx, x0, y0, x1, y1);
  ctx.restore();
}
/** Sac de courses pendu à une main. */
function shoppingBag(ctx, J, hand, color, t) {
  const { h } = J;
  const [x, y] = hand;
  const a = sin(t * 2 * PI * 0.9) * 0.12;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ink(ctx, J, 0.006);
  ctx.lineWidth = h * 0.008;
  ctx.beginPath();
  ctx.arc(0, h * 0.045, h * 0.03, PI, 0);
  ctx.stroke();
  ink(ctx, J, 0.006);
  ctx.beginPath();
  ctx.roundRect(-h * 0.06, h * 0.045, h * 0.12, h * 0.14, h * 0.01);
  paint(ctx, color);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  heartShape(ctx, 0, h * 0.115, h * 0.02);
  ctx.fill();
  ctx.restore();
}
/** Billet de banque. */
function bill(ctx, J, x, y, a) {
  const { h } = J;
  ink(ctx, J, 0.004);
  box(ctx, x, y, h * 0.09, h * 0.045, a, "#5dbb63", h * 0.004);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.strokeStyle = "#2f7f3a";
  ctx.lineWidth = Math.max(1, h * 0.004);
  dot(ctx, 0, 0, h * 0.012);
  ctx.stroke();
  ctx.restore();
}
/** Pastille ronde au-dessus de la tête avec un signe (oui ✓ / non ✗). */
function badge(ctx, p, J, color, sign) {
  const k = p.setK ?? 0;
  if (k <= 0) return;
  const { h, d } = J;
  const x = J.headC[0] + d * h * 0.2, y = J.headC[1] - J.headR - h * 0.12, r = h * 0.065 * (0.6 + 0.4 * k);
  ink(ctx, J, 0.006);
  dot(ctx, x, y, r);
  paint(ctx, color);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = h * 0.016;
  ctx.beginPath();
  sign(x, y, r);
  ctx.stroke();
}

const BEHIND = {
  boulder(ctx, p, J) {
    const { h, d } = J;
    const [sx, sy] = J.shoulder;
    const cx = sx - d * h * 0.14, cy = sy - h * 0.13, r = h * 0.2;
    // Sangles.
    ctx.strokeStyle = "#4a3f36";
    ctx.lineWidth = h * 0.018;
    ctx.beginPath();
    ctx.moveTo(cx + d * r * 0.5, cy + r * 0.6);
    ctx.lineTo(sx + d * h * 0.02, sy + h * 0.03);
    ctx.stroke();
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, "#9a9aa6");
    g.addColorStop(1, "#4a4a55");
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2, rr = r * (0.88 + hash(i) * 0.18);
      ctx.lineTo(cx + cos(a) * rr * 1.08, cy + sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(20,20,28,0.6)";
    ctx.lineWidth = h * 0.008;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.3, cy - r * 0.5);
    ctx.lineTo(cx - r * 0.05, cy - r * 0.1);
    ctx.lineTo(cx - r * 0.25, cy + r * 0.3);
    ctx.stroke();
  },

  wall(ctx, p, J) {
    const { h, d } = J;
    const [bx, gy] = J.base;
    const x0 = bx + d * h * 0.37, w = h * 0.24, top = gy - h * 1.5;
    const left = d > 0 ? x0 : x0 - w;
    ctx.fillStyle = "#5b4d48";
    ctx.fillRect(left, top, w, gy - top);
    // Briques.
    ctx.strokeStyle = "rgba(20,14,12,0.55)";
    ctx.lineWidth = Math.max(1, h * 0.008);
    const bh = h * 0.08;
    for (let y = gy, row = 0; y > top; y -= bh, row++) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + w, y);
      const off = row % 2 ? w * 0.5 : 0;
      ctx.moveTo(left + off, y);
      ctx.lineTo(left + off, y - bh);
      ctx.stroke();
    }
    // Arête éclairée côté personnage.
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(d > 0 ? left : left + w - h * 0.02, top, h * 0.02, gy - top);
  },

  breath(ctx, p, J) {
    const k = p.setK ?? 0;
    const c = [(J.hip[0] + J.neck[0]) / 2, (J.hip[1] + J.neck[1]) / 2];
    const r = J.h * (0.38 + 0.22 * k);
    const g = ctx.createRadialGradient(c[0], c[1], r * 0.3, c[0], c[1], r);
    g.addColorStop(0, "rgba(120,200,255,0)");
    g.addColorStop(0.8, `rgba(120,200,255,${0.08 + 0.1 * k})`);
    g.addColorStop(1, "rgba(120,200,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c[0], c[1], r, 0, PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(160,220,255,${0.25 + 0.35 * k})`;
    ctx.lineWidth = J.h * 0.012;
    ctx.beginPath();
    ctx.arc(c[0], c[1], r * 0.92, 0, PI * 2);
    ctx.stroke();
  },

  crowd(ctx, p, J, t) {
    const { h } = J;
    const gy = J.base[1];
    const cx = J.hip[0];
    const spots = [[-1.5, 0.8], [1.5, 0.8], [-1.12, 0.9], [1.12, 0.9], [-0.75, 1.0], [0.75, 1.0]];
    spots.forEach(([ox, s], i) => {
      const x = cx + ox * h, sh = h * s * 0.95, sway = sin(t * 1.3 + i) * h * 0.01;
      const face = ox < 0 ? 1 : -1; // regardent tous le personnage
      ctx.fillStyle = "#262836";
      ctx.strokeStyle = "#454a63";
      ctx.lineWidth = Math.max(1, h * 0.006);
      // Corps et tête.
      ctx.beginPath();
      ctx.moveTo(x - sh * 0.13 + sway, gy - sh * 0.62);
      ctx.quadraticCurveTo(x + sway, gy - sh * 0.72, x + sh * 0.13 + sway, gy - sh * 0.62);
      ctx.lineTo(x + sh * 0.1, gy);
      ctx.lineTo(x - sh * 0.1, gy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + sway, gy - sh * 0.8, sh * 0.1, 0, PI * 2);
      ctx.fill();
      ctx.stroke();
      // Yeux qui fixent.
      ctx.fillStyle = "#f4f4f6";
      for (const e of [0.025, 0.06]) {
        ctx.beginPath();
        ctx.arc(x + sway + face * sh * e, gy - sh * 0.81, sh * 0.012, 0, PI * 2);
        ctx.fill();
      }
      // Un sur deux pointe du doigt.
      if (i % 2 === 0) {
        ctx.strokeStyle = "#262836";
        ctx.lineWidth = sh * 0.05;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x + sway, gy - sh * 0.6);
        ctx.lineTo(x + sway + face * sh * 0.3, gy - sh * (0.66 + 0.02 * sin(t * 3 + i)));
        ctx.stroke();
      }
    });
  },

  bag(ctx, p, J) {
    const { h, d } = J;
    const [bx, gy] = J.base;
    const ax = bx + d * h * 0.45, ay = gy - h * 1.45;
    ctx.translate(ax, ay);
    ctx.rotate(d * (p.setK ?? 0));
    ctx.strokeStyle = "#8a8a96";
    ctx.lineWidth = Math.max(1, h * 0.01);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, h * 0.45);
    ctx.stroke();
    const w = h * 0.22, top = h * 0.45, len = h * 0.7;
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, "#7a1f22");
    g.addColorStop(0.5, "#c0353a");
    g.addColorStop(1, "#6a1a1d");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-w / 2, top, w, len, w * 0.3);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(-w / 2, top + len * 0.2, w, h * 0.02);
    ctx.fillRect(-w / 2, top + len * 0.78, w, h * 0.02);
  },

  finish(ctx, p, J, t) {
    const { h, d } = J;
    const [bx, gy] = J.base;
    const fx = bx + d * h * 0.22;
    // Ligne d'arrivée au sol (damier) et poteau avec drapeau.
    const sq = h * 0.035;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? "#111" : "#f4f4f6";
        ctx.fillRect(fx - sq + j * sq, gy - sq * 0.5 + i * sq * 0.35, sq, sq * 0.35);
      }
    }
    ctx.fillStyle = "#cfd2dc";
    ctx.fillRect(fx - h * 0.008, gy - h * 1.35, h * 0.016, h * 1.35);
    const wave = sin(t * 5) * h * 0.02;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 ? "#111" : "#f4f4f6";
        const x = fx + d * (h * 0.01 + i * h * 0.06);
        ctx.fillRect(d > 0 ? x : x - h * 0.06, gy - h * 1.35 + j * h * 0.06 + (i / 4) * wave, h * 0.06, h * 0.06);
      }
    }
  },

  podium(ctx, p, J) {
    const { h } = J;
    const [bx, gy] = J.base;
    const steps = [[0, 0.17, "1", "#e6b422"], [-0.52, 0.11, "2", "#b8bcc8"], [0.52, 0.07, "3", "#c27c3c"]];
    for (const [ox, sh, label, col] of steps) {
      const x = bx + ox * h - h * 0.25;
      ctx.fillStyle = "#2c2f3d";
      ctx.fillRect(x, gy - sh * h, h * 0.5, sh * h);
      ctx.fillStyle = col;
      ctx.fillRect(x, gy - sh * h, h * 0.5, h * 0.025);
      ctx.font = `900 ${h * 0.09}px "Arial Black", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + h * 0.25, gy - sh * h * 0.45);
    }
  },

  bed(ctx, p, J) {
    const { h, d } = J;
    const gy = J.base[1];
    const cx = J.hip[0] + d * h * 0.02, top = gy - h * 0.17;
    const x0 = cx - h * 0.62, x1 = cx + h * 0.62;
    // Tête de lit côté tête.
    const hx = d > 0 ? x1 : x0 - h * 0.05;
    ctx.fillStyle = "#5a4636";
    ctx.beginPath();
    ctx.roundRect(hx, gy - h * 0.5, h * 0.05, h * 0.5, h * 0.02);
    ctx.fill();
    ctx.fillRect(d > 0 ? x0 - h * 0.04 : x1, gy - h * 0.26, h * 0.04, h * 0.26);
    // Matelas et sommier.
    ctx.fillStyle = "#3d3a4f";
    ctx.fillRect(x0, top + h * 0.06, x1 - x0, h * 0.06);
    ctx.fillStyle = "#e9e6f2";
    ctx.beginPath();
    ctx.roundRect(x0, top, x1 - x0, h * 0.07, h * 0.03);
    ctx.fill();
    ctx.fillStyle = "#4e4136";
    ctx.fillRect(x0 + h * 0.02, top + h * 0.12, h * 0.04, gy - top - h * 0.12);
    ctx.fillRect(x1 - h * 0.06, top + h * 0.12, h * 0.04, gy - top - h * 0.12);
    // Oreiller sous la tête.
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(J.headC[0] + d * h * 0.02, top - h * 0.015, h * 0.11, h * 0.035, 0, 0, PI * 2);
    ctx.fill();
  },

  door(ctx, p, J, t) {
    const { h, d } = J;
    const [bx, gy] = J.base;
    const k = p.setK ?? 0;
    const cx = bx + d * h * 0.3, w = h * 0.44, hh = h * 1.12;
    const x0 = cx - w / 2, y0 = gy - hh;
    // Lumière derrière la porte.
    const g = ctx.createLinearGradient(0, y0, 0, gy);
    g.addColorStop(0, `rgba(255,248,220,${0.15 + 0.85 * k})`);
    g.addColorStop(1, `rgba(255,214,120,${0.1 + 0.8 * k})`);
    ctx.fillStyle = "#0f0f16";
    ctx.fillRect(x0, y0, w, hh);
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, hh);
    if (k > 0) {
      // Rayons qui débordent du cadre.
      ctx.globalCompositeOperation = "lighter";
      const rg = ctx.createRadialGradient(cx, gy - hh * 0.5, h * 0.05, cx, gy - hh * 0.5, h * 1.1);
      rg.addColorStop(0, `rgba(255,220,140,${0.35 * k})`);
      rg.addColorStop(1, "rgba(255,220,140,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(cx - h * 1.2, gy - h * 1.7, h * 2.4, h * 1.7);
      ctx.globalCompositeOperation = "source-over";
    }
    // Battant (se rabat vers le côté des gonds en s'ouvrant).
    const leaf = w * (1 - 0.88 * k);
    const hingeLeft = d < 0;
    const lx = hingeLeft ? x0 : x0 + w - leaf;
    ctx.fillStyle = "#6b4a32";
    ctx.fillRect(lx, y0, leaf, hh);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    if (leaf > w * 0.3) {
      ctx.fillRect(lx + leaf * 0.12, y0 + hh * 0.08, leaf * 0.76, hh * 0.36);
      ctx.fillRect(lx + leaf * 0.12, y0 + hh * 0.52, leaf * 0.76, hh * 0.4);
      ctx.fillStyle = "#e6b422";
      ctx.beginPath();
      ctx.arc(hingeLeft ? lx + leaf * 0.85 : lx + leaf * 0.15, gy - hh * 0.48, h * 0.016, 0, PI * 2);
      ctx.fill();
    }
    // Cadre.
    ctx.strokeStyle = "#3c2a1e";
    ctx.lineWidth = h * 0.03;
    ctx.strokeRect(x0, y0, w, hh);
  },

  stairs(ctx, p, J) {
    const { h, d } = J;
    const [bx, gy] = J.base;
    for (let i = 1; i <= 6; i++) {
      const a = bx + d * (-0.38 + 0.16 * i) * h;
      const b = bx + d * (i === 6 ? 0.9 : 0.62) * h;
      const top = gy - 0.07 * i * h;
      const left = min(a, b), w = abs(b - a);
      ctx.fillStyle = i % 2 ? "#3a3d4f" : "#34374a";
      ctx.fillRect(left, top, w, 0.07 * h + 1);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(left, top, w, h * 0.012);
    }
  },

  lamp(ctx, p, J) {
    const { h, d } = J;
    const [bx, gy] = J.base;
    // Nuit autour : on assombrit le décor.
    ctx.fillStyle = "rgba(2,4,14,0.45)";
    ctx.fillRect(bx - h * 6, gy - h * 6, h * 12, h * 8);
    const px = bx - d * h * 0.34, lx = bx - d * h * 0.02, ly = gy - h * 1.3;
    // Cône de lumière.
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, ly, 0, gy);
    g.addColorStop(0, "rgba(255,210,120,0.4)");
    g.addColorStop(1, "rgba(255,210,120,0.08)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(lx - h * 0.06, ly);
    ctx.lineTo(lx + h * 0.06, ly);
    ctx.lineTo(lx + h * 0.48, gy);
    ctx.lineTo(lx - h * 0.48, gy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,210,120,0.22)";
    ctx.beginPath();
    ctx.ellipse(lx, gy, h * 0.5, h * 0.06, 0, 0, PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    // Poteau, bras et lanterne.
    ctx.strokeStyle = "#1e2130";
    ctx.lineWidth = h * 0.035;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px, gy);
    ctx.lineTo(px, ly - h * 0.12);
    ctx.quadraticCurveTo(px, ly - h * 0.2, lx, ly - h * 0.12);
    ctx.stroke();
    ctx.fillStyle = "#1e2130";
    ctx.beginPath();
    ctx.moveTo(lx - h * 0.09, ly);
    ctx.lineTo(lx + h * 0.09, ly);
    ctx.lineTo(lx + h * 0.04, ly - h * 0.1);
    ctx.lineTo(lx - h * 0.04, ly - h * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffe8a8";
    ctx.beginPath();
    ctx.ellipse(lx, ly, h * 0.07, h * 0.018, 0, 0, PI * 2);
    ctx.fill();
  },

  orb(ctx, p, J, t) {
    // Lignes de vitesse au sol : le décor défile.
    const { h, d } = J;
    const [bx, gy] = J.base;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1, h * 0.008);
    for (let i = 0; i < 7; i++) {
      const u = ((hash(i) - t * 0.9 * d) % 1 + 1) % 1;
      const x = bx + (u * 2.4 - 1.2) * h, y = gy - h * (0.05 + hash(i + 9) * 0.9);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - d * h * 0.18, y);
      ctx.stroke();
    }
  },

  sky(ctx, p, J, t) {
    const { h } = J;
    const [bx, gy] = J.base;
    for (let i = 0; i < 46; i++) {
      const x = bx + (hash(i) * 3 - 1.5) * h, y = gy - h * (0.95 + hash(i + 50) * 1.1);
      const tw = 0.5 + 0.5 * sin(t * (1 + hash(i + 7) * 2) + i);
      ctx.fillStyle = `rgba(255,255,240,${0.35 + 0.6 * tw})`;
      const s = h * (0.004 + hash(i + 3) * 0.008);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    // Lune.
    const mx = bx + h * 0.9, my = gy - h * 1.7;
    ctx.fillStyle = "#fff5d6";
    ctx.shadowColor = "rgba(255,240,200,0.8)";
    ctx.shadowBlur = h * 0.08;
    ctx.beginPath();
    ctx.arc(mx, my, h * 0.11, 0, PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Étoile filante toutes les 4 s.
    const u = (t % 4) / 1.1;
    if (u < 1) {
      const sx = bx - h * 1.2 + u * h * 1.6, sy = gy - h * 2.0 + u * h * 0.5;
      const g = ctx.createLinearGradient(sx - h * 0.35, sy - h * 0.11, sx, sy);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(1, `rgba(255,255,255,${1 - u})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = h * 0.01;
      ctx.beginPath();
      ctx.moveTo(sx - h * 0.35, sy - h * 0.11);
      ctx.lineTo(sx, sy);
      ctx.stroke();
    }
  },

  // ——— Relations ———

  knife(ctx, p, J) {
    // Couteau tenu dans la main avant, dans le prolongement de l'avant-bras (dessiné derrière les personnages :
    // la lame disparaît derrière le dos de la victime).
    const { h } = J;
    const [hx, hy] = J.handF;
    const [ux, uy] = unit(J.elbowF, J.handF);
    ink(ctx, J, 0.005);
    const tip = [hx + ux * h * 0.15, hy + uy * h * 0.15], b = [hx + ux * h * 0.045, hy + uy * h * 0.045];
    poly(ctx, [[b[0] - uy * h * 0.016, b[1] + ux * h * 0.016], tip, [b[0] + uy * h * 0.012, b[1] - ux * h * 0.012]]);
    paint(ctx, "#d9dde6");
    rod(ctx, J, hx - ux * h * 0.03, hy - uy * h * 0.03, b[0], b[1], 0.018, "#6b4a32");
    rod(ctx, J, b[0] - uy * h * 0.02, b[1] + ux * h * 0.02, b[0] + uy * h * 0.02, b[1] - ux * h * 0.02, 0.008, "#9a9eaa");
  },

  gossip(ctx, p, J, t) {
    // L'oreille complice : une silhouette au second plan, entre les deux, la main derrière l'oreille ; elle rit.
    const { h, d } = J;
    const s = h * 0.72, gy = J.base[1] - h * 0.07;
    const x = J.hip[0] + d * h * 0.36, f = -d;
    const laugh = t % 3.2 > 2.2, bob = laugh ? Math.abs(sin(t * 10)) * h * 0.01 : 0;
    ink(ctx, J);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.12, gy - s * 0.6 - bob);
    ctx.quadraticCurveTo(x, gy - s * 0.7 - bob, x + s * 0.12, gy - s * 0.6 - bob);
    ctx.lineTo(x + s * 0.09, gy);
    ctx.lineTo(x - s * 0.09, gy);
    ctx.closePath();
    paint(ctx, "#5a6178");
    dot(ctx, x, gy - s * 0.79 - bob, s * 0.1);
    paint(ctx, "#5a6178");
    rod(ctx, J, x - f * s * 0.05, gy - s * 0.62 - bob, x - f * s * 0.07, gy - s * 0.8 - bob, 0.025, "#5a6178"); // main derrière l'oreille
    ctx.fillStyle = "#f4f4f6";
    dot(ctx, x + f * s * 0.05, gy - s * 0.81 - bob, s * 0.012);
    ctx.fill();
    ctx.strokeStyle = "#f4f4f6";
    ctx.lineWidth = Math.max(1, h * 0.006);
    ctx.beginPath();
    ctx.arc(x + f * s * 0.05, gy - s * 0.765 - bob, s * (laugh ? 0.025 : 0.015), 0.1 * PI, 0.9 * PI);
    ctx.stroke();
    // Bulle de ragots qui file vers la silhouette.
    bubble(ctx, J, x - f * h * 0.02, gy - s * 1.08, laugh ? "HA HA" : "bla bla", "#ffffff", INK, 0.9);
  },

  shadow(ctx, p, J, t) {
    // Ombre menaçante qui grandit devant le personnage, deux yeux qui brillent.
    const { h, d } = J;
    const [bx, gy] = J.base;
    const k = 0.55 + 0.45 * (p.setK ?? 0), x = bx + d * h * 0.78, H = h * 1.45 * k, sway = sin(t * 1.4) * h * 0.02;
    ctx.strokeStyle = "#6b5a92";
    ctx.lineWidth = Math.max(1, h * 0.008);
    ctx.beginPath();
    ctx.moveTo(x - h * 0.4 * k, gy);
    ctx.bezierCurveTo(x - h * 0.45 * k, gy - H * 0.6, x - h * 0.3 * k + sway, gy - H, x + sway, gy - H);
    ctx.bezierCurveTo(x + h * 0.3 * k + sway, gy - H, x + h * 0.45 * k, gy - H * 0.6, x + h * 0.4 * k, gy);
    // Griffes au sol.
    for (let i = 0; i < 4; i++) ctx.lineTo(x + h * (0.3 - i * 0.2) * k, gy - (i % 2 ? h * 0.06 : 0));
    ctx.closePath();
    paint(ctx, "rgba(12,8,24,0.9)");
    const blinkk = (t % 3.1) < 0.12 ? 0.15 : 1;
    ctx.fillStyle = "#ffe14d";
    for (const e of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + sway + e * h * 0.09 * k, gy - H * 0.78, h * 0.04 * k, h * 0.025 * k * blinkk, e * 0.3, 0, PI * 2);
      ctx.fill();
    }
  },

  light(ctx, p, J, t) {
    // Rayon de lumière qui descend du ciel sur le personnage.
    const k = p.setK ?? 0;
    if (k <= 0) return;
    const { h } = J;
    const gy = J.base[1], x = J.headC[0];
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, gy - h * 2.4, 0, gy);
    g.addColorStop(0, `rgba(255,240,190,${0.5 * k})`);
    g.addColorStop(1, `rgba(255,220,140,${0.08 * k})`);
    ctx.fillStyle = g;
    poly(ctx, [[x - h * 0.14, gy - h * 2.4], [x + h * 0.14, gy - h * 2.4], [x + h * 0.5, gy], [x - h * 0.5, gy]]);
    ctx.fill();
    for (let i = 0; i < 10; i++) {
      const u = (t * 0.25 + hash(i)) % 1;
      ctx.fillStyle = `rgba(255,250,220,${0.7 * k * (1 - u)})`;
      dot(ctx, x + (hash(i + 4) - 0.5) * h * 0.6, gy - h * (0.2 + u * 1.6), h * 0.008);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  },

  burst(ctx, p, J) {
    // Éclair de surprise derrière la tête.
    const k = p.setK ?? 0;
    if (k <= 0) return;
    const { h } = J;
    const [x, y] = J.headC;
    ctx.globalAlpha = k;
    ink(ctx, J, 0.006);
    starShape(ctx, x, y, h * (0.32 + 0.08 * (1 - k)), 12, 0.62, 0.1);
    paint(ctx, "#ffd84d");
    starShape(ctx, x, y, h * 0.22, 12, 0.65, 0.35);
    ctx.fillStyle = "#fff3b0";
    ctx.fill();
  },

  glow(ctx, p, J, t) {
    const k = p.setK ?? 0;
    if (k <= 0) return;
    const { h } = J;
    const c = [(J.hip[0] + J.headC[0]) / 2, (J.hip[1] + J.headC[1]) / 2];
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(c[0], c[1], h * 0.05, c[0], c[1], h * 0.75);
    g.addColorStop(0, `rgba(255,210,90,${0.3 * k})`);
    g.addColorStop(1, "rgba(255,210,90,0)");
    ctx.fillStyle = g;
    dot(ctx, c[0], c[1], h * 0.75);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,225,130,${0.35 * k})`;
    ctx.lineWidth = h * 0.012;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2 + t * 0.3;
      line(ctx, c[0] + cos(a) * h * 0.5, c[1] + sin(a) * h * 0.5, c[0] + cos(a) * h * 0.68, c[1] + sin(a) * h * 0.68);
    }
    ctx.globalCompositeOperation = "source-over";
  },

  envy(ctx, p, J, t) {
    // Aura verte de jalousie : flammèches qui ondulent autour du corps.
    const { h } = J;
    const c = [J.hip[0], J.hip[1] - h * 0.15];
    for (let ring = 0; ring < 3; ring++) {
      ctx.strokeStyle = `rgba(60,200,90,${0.6 - ring * 0.15})`;
      ctx.lineWidth = h * (0.014 - ring * 0.003);
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * PI * 2, r = h * (0.42 + ring * 0.07 + 0.03 * sin(a * 6 + t * 4 + ring));
        ctx.lineTo(c[0] + cos(a) * r * 0.8, c[1] + sin(a) * r);
      }
      ctx.stroke();
    }
  },

  evil(ctx, p, J, t) {
    // Lueur violette par en dessous, fumée sombre qui monte.
    const { h } = J;
    const [x] = J.hip, gy = J.base[1];
    const g = ctx.createRadialGradient(x, gy, h * 0.05, x, gy, h * 0.95);
    g.addColorStop(0, "rgba(170,60,255,0.55)");
    g.addColorStop(1, "rgba(170,60,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - h, gy - h * 1.3, h * 2, h * 1.35);
    for (let i = 0; i < 9; i++) {
      const u = (t * 0.35 + hash(i)) % 1;
      ctx.fillStyle = `rgba(60,20,90,${0.5 * (1 - u)})`;
      dot(ctx, x + (hash(i + 3) - 0.5) * h * 0.8 + sin(t * 2 + i) * h * 0.03, gy - u * h * 0.9, h * (0.05 + u * 0.05));
      ctx.fill();
    }
  },

  sunrise(ctx, p, J, t) {
    // Le soleil se lève derrière le personnage.
    const k = p.setK ?? 0;
    const { h, d } = J;
    const [bx, gy] = J.base;
    const sx = bx - d * h * 0.55, sy = gy - h * (0.1 + 1.1 * k), r = h * 0.2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx - h * 2, gy - h * 3, h * 4, h * 3);
    ctx.clip();
    const g = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, h * 1.4);
    g.addColorStop(0, `rgba(255,190,90,${0.5 * k + 0.1})`);
    g.addColorStop(1, "rgba(255,150,80,0)");
    ctx.fillStyle = g;
    dot(ctx, sx, sy, h * 1.4);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,210,110,0.7)";
    ctx.lineWidth = h * 0.012;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2 + t * 0.2;
      line(ctx, sx + cos(a) * r * 1.3, sy + sin(a) * r * 1.3, sx + cos(a) * r * 1.75, sy + sin(a) * r * 1.75);
    }
    ink(ctx, J);
    dot(ctx, sx, sy, r);
    paint(ctx, "#ffc93c");
    ctx.restore();
  },

  listenwall(ctx, p, J, t) {
    // Le mur contre lequel on écoute ; de l'autre côté, la conversation.
    const { h, d } = J;
    const [bx, gy] = J.base;
    const x0 = bx + d * h * 0.3, x1 = bx + d * h * 0.42, top = gy - h * 1.45;
    ink(ctx, J);
    ctx.beginPath();
    ctx.rect(Math.min(x0, x1), top, Math.abs(x1 - x0), gy - top);
    paint(ctx, "#7a675e");
    ctx.strokeStyle = "rgba(20,14,12,0.45)";
    ctx.lineWidth = Math.max(1, h * 0.005);
    for (let y = gy - h * 0.08, i = 0; y > top; y -= h * 0.08, i++) line(ctx, x0, y, x1, y);
    const c = t % 4.2;
    bubble(ctx, J, bx + d * h * 0.62, gy - h * 1.3, "bla bla", "#ffffff", INK, c < 2.6 ? ease(c / 0.3) : 0);
    bubble(ctx, J, bx + d * h * 0.6, gy - h * 1.12, "...", "#ffd84d", INK, c > 0.9 && c < 2.8 ? 1 : 0);
    bubble(ctx, J, bx + d * h * 0.58, gy - h * 1.3, "!!!", "#ff4d6d", "#ffffff", c > 2.8 && c < 3.9 ? 1 : 0);
  },

  // ——— Vie quotidienne ———

  desk(ctx, p, J, t) {
    const { h, d } = J;
    const { top } = deskAndChair(ctx, J);
    const x = J.hip[0];
    ink(ctx, J, 0.006);
    // Ordinateur portable : base sous les mains, écran incliné vers le personnage.
    const a = x + d * h * 0.15, b = x + d * h * 0.42;
    ctx.beginPath();
    ctx.roundRect(Math.min(a, b), top - h * 0.016, Math.abs(b - a), h * 0.016, h * 0.004);
    paint(ctx, "#b9bfcc");
    const hinge = [b, top - h * 0.012], scr = [b - d * h * 0.06, top - h * 0.23];
    rod(ctx, J, hinge[0], hinge[1], scr[0], scr[1], 0.02, "#8d94a6");
    ctx.strokeStyle = `rgba(120,200,255,${0.75 + 0.2 * sin(t * 3)})`;
    ctx.lineWidth = h * 0.007;
    line(ctx, hinge[0] - d * h * 0.012, hinge[1] - h * 0.01, scr[0] - d * h * 0.012, scr[1] + h * 0.01);
  },

  study(ctx, p, J, t) {
    const { h, d } = J;
    const { top, x1 } = deskAndChair(ctx, J);
    const x = J.hip[0];
    ink(ctx, J, 0.006);
    // Cahier ouvert sous les mains.
    ctx.beginPath();
    ctx.roundRect(Math.min(x + d * h * 0.14, x + d * h * 0.38), top - h * 0.01, h * 0.24, h * 0.01, h * 0.003);
    paint(ctx, "#f4f1e6");
    // Pile de livres et lampe au bout du bureau.
    const lx = x1 - d * h * 0.14;
    ["#d9534f", "#3f7fd9", "#e6b422"].forEach((c, i) => box(ctx, lx - d * h * 0.1, top - h * (0.02 + i * 0.03), h * 0.14 - i * h * 0.015, h * 0.03, 0, c, h * 0.004));
    rod(ctx, J, lx + d * h * 0.06, top, lx + d * h * 0.02, top - h * 0.22, 0.01, "#3b3f4a");
    rod(ctx, J, lx + d * h * 0.02, top - h * 0.22, lx - d * h * 0.06, top - h * 0.27, 0.01, "#3b3f4a");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255,220,140,0.18)";
    poly(ctx, [[lx - d * h * 0.06, top - h * 0.27], [lx - d * h * 0.3, top], [lx - d * h * 0.02, top]]);
    ctx.fill();
    ctx.restore();
    ink(ctx, J, 0.006);
    poly(ctx, [[lx - d * h * 0.02, top - h * 0.3], [lx - d * h * 0.12, top - h * 0.25], [lx - d * h * 0.02, top - h * 0.22]]);
    paint(ctx, "#e6b422");
  },

  board(ctx, p, J, t) {
    // Tableau blanc, schéma et formule.
    const { h, d } = J;
    const [bx, gy] = J.base;
    const x0 = bx + d * h * 0.34, x1 = bx + d * h * 1.14, top = gy - h * 1.32, bot = gy - h * 0.62;
    const left = Math.min(x0, x1), w = Math.abs(x1 - x0);
    rod(ctx, J, left + w * 0.15, bot, left + w * 0.1, gy, 0.016, "#8d94a6");
    rod(ctx, J, left + w * 0.85, bot, left + w * 0.9, gy, 0.016, "#8d94a6");
    ink(ctx, J);
    ctx.beginPath();
    ctx.roundRect(left, top, w, bot - top, h * 0.015);
    paint(ctx, "#f5f6f2");
    ctx.lineWidth = h * 0.008;
    ctx.strokeStyle = "#2f6fe0";
    ctx.beginPath();
    ctx.moveTo(left + w * 0.1, top + (bot - top) * 0.85);
    ctx.lineTo(left + w * 0.3, top + (bot - top) * 0.6);
    ctx.lineTo(left + w * 0.45, top + (bot - top) * 0.7);
    ctx.lineTo(left + w * 0.62, top + (bot - top) * 0.3);
    ctx.stroke();
    ctx.fillStyle = "#d9443f";
    ctx.font = `800 ${h * 0.08}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("A+B", left + w * 0.8, top + (bot - top) * 0.32);
    ctx.fillStyle = "#2b2f3d";
    ctx.fillText("= ?", left + w * 0.8, top + (bot - top) * 0.68);
  },

  stove(ctx, p, J, t) {
    // Cuisinière, poêle tenue par le manche, crêpe qui saute.
    const { h, d } = J;
    const [bx, gy] = J.base;
    const x0 = bx + d * h * 0.21, x1 = bx + d * h * 0.66, top = gy - h * 0.46;
    const left = Math.min(x0, x1), w = Math.abs(x1 - x0);
    ink(ctx, J);
    ctx.beginPath();
    ctx.roundRect(left, top, w, gy - top, h * 0.012);
    paint(ctx, "#d7dbe3");
    ctx.beginPath();
    ctx.roundRect(left + w * 0.15, top + h * 0.12, w * 0.7, h * 0.22, h * 0.01);
    paint(ctx, "#3b3f4a");
    // Flammes sous la poêle.
    const [hx, hy] = J.handF;
    const px = hx + d * h * 0.19;
    for (let i = -1; i <= 1; i++) {
      const f = h * (0.025 + 0.01 * sin(t * 12 + i * 2));
      poly(ctx, [[px + i * h * 0.04 - h * 0.012, top], [px + i * h * 0.04, top - f], [px + i * h * 0.04 + h * 0.012, top]]);
      paint(ctx, "#4da3ff");
    }
    // Poêle (le manche est dans la main).
    rod(ctx, J, hx - d * h * 0.01, hy, px - d * h * 0.08, hy + h * 0.005, 0.014, "#2b2b33");
    ctx.beginPath();
    ctx.roundRect(px - h * 0.09, hy - h * 0.01, h * 0.18, h * 0.03, [0, 0, h * 0.02, h * 0.02]);
    paint(ctx, "#2b2b33");
    // Crêpe : saute et se retourne.
    const c = p.setK ?? 0, fly = c > 1.4 && c < 2.0 ? (c - 1.4) / 0.6 : 0;
    const y = hy - h * 0.018 - h * 0.28 * fly * (1 - fly) * 4 * 0.5;
    ctx.save();
    ctx.translate(px, y);
    ctx.rotate(fly * PI * 2 * d);
    ctx.beginPath();
    ctx.ellipse(0, 0, h * 0.065, h * 0.014, 0, 0, PI * 2);
    paint(ctx, "#f2c14e");
    ctx.restore();
  },

  car(ctx, p, J, t) {
    // Route qui défile sous la voiture.
    const { h, d } = J;
    const [bx, gy] = J.base;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = h * 0.012;
    for (let i = 0; i < 8; i++) {
      const u = ((i / 8 - t * 0.9 * d) % 1 + 1) % 1;
      const x = bx + (u * 3.2 - 1.6) * h;
      line(ctx, x, gy + h * 0.035, x + h * 0.16, gy + h * 0.035);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = h * 0.008;
    for (let i = 0; i < 5; i++) {
      const u = ((hash(i) - t * 1.3 * d) % 1 + 1) % 1, x = bx + (u * 3 - 1.5) * h, y = gy - h * (0.3 + hash(i + 7) * 0.9);
      line(ctx, x, y, x - d * h * 0.25, y);
    }
  },

  suitcase(ctx, p, J, t) {
    // Valise à roulettes tirée par la main arrière.
    const { h, d } = J;
    const gy = J.base[1];
    const [hx, hy] = J.handB;
    const W = [hx - d * h * 0.26, gy - h * 0.03];
    const [ux, uy] = unit(W, [hx, hy]);
    const len = h * 0.3, cx = W[0] + ux * len * 0.5, cy = W[1] + uy * len * 0.5;
    const topP = [W[0] + ux * len, W[1] + uy * len];
    rod(ctx, J, topP[0], topP[1], hx, hy, 0.01, "#8d94a6");
    box(ctx, cx, cy, h * 0.19, len, Math.atan2(uy, ux) + PI / 2, "#2fa3a0", h * 0.03);
    ink(ctx, J, 0.005);
    ctx.fillStyle = "#ffd84d";
    dot(ctx, cx + uy * h * 0.04, cy - ux * h * 0.04, h * 0.025);
    paint(ctx, "#ffd84d");
    dot(ctx, W[0], W[1], h * 0.025);
    paint(ctx, "#2b2b33");
    // Un avion passe dans le ciel.
    const u = (t * 0.12) % 1, px = J.base[0] + d * (u * 3.4 - 1.7) * h, py = gy - h * (1.95 + 0.1 * u);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = h * 0.008;
    line(ctx, px - d * h * 0.6, py + h * 0.01, px - d * h * 0.08, py);
    ink(ctx, J, 0.005);
    poly(ctx, [[px + d * h * 0.1, py], [px - d * h * 0.08, py - h * 0.015], [px - d * h * 0.08, py + h * 0.015]]);
    paint(ctx, "#f4f4f6");
    poly(ctx, [[px, py], [px - d * h * 0.04, py + h * 0.06], [px - d * h * 0.06, py]]);
    paint(ctx, "#cfd4e0");
  },

  bike(ctx, p, J, t) {
    // Vélo : pédalier sous les hanches, roues qui tournent, guidon sous les mains.
    const { h, d } = J;
    const gy = J.base[1];
    const [hx, hy] = J.hip;
    const C = [hx + d * h * 0.07, hy + h * 0.33], R = h * 0.15;
    const rw = [C[0] - d * h * 0.31, gy - R], fw = [C[0] + d * h * 0.34, gy - R];
    const hb = [(J.handF[0] + J.handB[0]) / 2, (J.handF[1] + J.handB[1]) / 2];
    const headTop = [hb[0] - d * h * 0.03, hb[1] + h * 0.05], seat = [hx - d * h * 0.01, hy + h * 0.04];
    const th = p.setK ?? 0;
    // Lignes de vitesse.
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = h * 0.008;
    for (let i = 0; i < 6; i++) {
      const u = ((hash(i) - t * 1.2 * d) % 1 + 1) % 1, x = hx + (u * 3 - 1.5) * h, y = gy - h * (0.1 + hash(i + 5) * 0.8);
      line(ctx, x, y, x - d * h * 0.22, y);
    }
    for (const w of [rw, fw]) {
      ink(ctx, J, 0.014);
      dot(ctx, w[0], w[1], R);
      ctx.stroke();
      ctx.strokeStyle = "#cfd4e0";
      ctx.lineWidth = h * 0.004;
      for (let i = 0; i < 6; i++) {
        const a = th * 0.8 + (i * PI) / 3;
        line(ctx, w[0], w[1], w[0] + cos(a) * R * 0.92, w[1] + sin(a) * R * 0.92);
      }
    }
    const frame = (a, b) => rod(ctx, J, a[0], a[1], b[0], b[1], 0.016, "#e2453c");
    frame(rw, C);
    frame(C, seat);
    frame(seat, rw);
    frame(seat, headTop);
    frame(C, headTop);
    frame(headTop, fw);
    rod(ctx, J, headTop[0], headTop[1], hb[0], hb[1], 0.012, "#3b3f4a");
    rod(ctx, J, seat[0] - d * h * 0.05, seat[1] - h * 0.01, seat[0] + d * h * 0.05, seat[1] - h * 0.01, 0.022, "#2b2b33");
    // Manivelles jusqu'aux pieds.
    rod(ctx, J, C[0], C[1], J.footB[0], J.footB[1], 0.01, "#8d94a6");
    ink(ctx, J);
    dot(ctx, C[0], C[1], h * 0.03);
    paint(ctx, "#8d94a6");
  },

  bags(ctx, p, J, t) {
    shoppingBag(ctx, J, J.handB, "#3f7fd9", t + 1);
  },

  broom(ctx, p, J, t) {
    // Balai tenu à deux mains, la brosse frotte le sol.
    const { h } = J;
    const gy = J.base[1];
    const a = J.handB, b = J.handF;
    const dy = b[1] - a[1] || 1e-3, s = (gy - h * 0.06 - a[1]) / dy;
    const end = [a[0] + (b[0] - a[0]) * s, gy - h * 0.06], top = [a[0] - (b[0] - a[0]) * 0.25, a[1] - (b[1] - a[1]) * 0.25];
    rod(ctx, J, top[0], top[1], end[0], end[1], 0.014, "#b07a45");
    ink(ctx, J);
    poly(ctx, [[end[0] - h * 0.05, end[1]], [end[0] + h * 0.05, end[1]], [end[0] + h * 0.08, gy], [end[0] - h * 0.08, gy]]);
    paint(ctx, "#e6b422");
  },

  clock(ctx, p, J, t) {
    // Grande horloge dont les aiguilles s'affolent ; lignes de vitesse quand il court.
    const k = p.setK ?? 0;
    const { h, d } = J;
    const [bx, gy] = J.base;
    const x = bx - d * h * 0.5, y = gy - h * 1.3, R = h * 0.22;
    ink(ctx, J, 0.012);
    dot(ctx, x, y, R);
    paint(ctx, "#f5f6f2");
    ctx.lineWidth = h * 0.008;
    for (let i = 0; i < 12; i++) {
      const a = (i * PI) / 6;
      line(ctx, x + cos(a) * R * 0.8, y + sin(a) * R * 0.8, x + cos(a) * R * 0.92, y + sin(a) * R * 0.92);
    }
    const am = t * (0.6 + 9 * k), ah = am / 12 + 1;
    ctx.lineWidth = h * 0.014;
    line(ctx, x, y, x + sin(ah) * R * 0.5, y - cos(ah) * R * 0.5);
    ctx.strokeStyle = "#d9443f";
    ctx.lineWidth = h * 0.009;
    line(ctx, x, y, x + sin(am) * R * 0.78, y - cos(am) * R * 0.78);
    if (k > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.22 * k})`;
      ctx.lineWidth = h * 0.008;
      for (let i = 0; i < 7; i++) {
        const u = ((hash(i) - t * 1.4 * d) % 1 + 1) % 1, lx = J.hip[0] + (u * 2.6 - 1.3) * h, ly = gy - h * (0.05 + hash(i + 9) * 0.9);
        line(ctx, lx, ly, lx - d * h * 0.22, ly);
      }
    }
  },

  easel(ctx, p, J) {
    // Chevalet et toile qui se remplit (ciel, soleil, colline, arbre).
    const k = p.setK ?? 0;
    const { h, d } = J;
    const [bx, gy] = J.base;
    const x0 = bx + d * h * 0.27, x1 = bx + d * h * 0.7, top = gy - h * 0.98, bot = gy - h * 0.6;
    const left = Math.min(x0, x1), w = Math.abs(x1 - x0), cx = left + w / 2;
    rod(ctx, J, cx, top, cx - h * 0.18, gy, 0.014, "#a87447");
    rod(ctx, J, cx, top, cx + h * 0.18, gy, 0.014, "#a87447");
    rod(ctx, J, cx - d * h * 0.02, top, cx + d * h * 0.06, gy, 0.012, "#8a5c36");
    ink(ctx, J);
    ctx.beginPath();
    ctx.rect(left, top, w, bot - top);
    paint(ctx, "#fbfaf4");
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, w, bot - top);
    ctx.clip();
    const H = bot - top;
    if (k > 0.05) { ctx.fillStyle = "#8fd0ff"; ctx.fillRect(left, top, w, H * 0.65 * Math.min(1, k / 0.3)); }
    if (k > 0.3) { ctx.fillStyle = "#ffc93c"; dot(ctx, left + w * 0.75, top + H * 0.28, H * 0.12 * Math.min(1, (k - 0.3) / 0.2)); ctx.fill(); }
    if (k > 0.5) {
      ctx.fillStyle = "#5bbf5f";
      ctx.beginPath();
      ctx.ellipse(left + w * 0.4, bot, w * 0.75, H * 0.5 * Math.min(1, (k - 0.5) / 0.2), 0, PI, PI * 2);
      ctx.fill();
    }
    if (k > 0.75) {
      const g = Math.min(1, (k - 0.75) / 0.2);
      ctx.fillStyle = "#7a5230";
      ctx.fillRect(left + w * 0.24, bot - H * 0.55 * g, w * 0.04, H * 0.55 * g);
      ctx.fillStyle = "#2f8f3f";
      dot(ctx, left + w * 0.26, bot - H * 0.55 * g, H * 0.14 * g);
      ctx.fill();
    }
    ctx.restore();
  },

  plant(ctx, p, J, t) {
    // Pot de fleur : la tige pousse, les feuilles s'ouvrent, la fleur éclot.
    const k = p.setK ?? 0;
    const { h, d } = J;
    const [bx, gy] = J.base;
    const x = bx + d * h * 0.44;
    ink(ctx, J);
    const stem = h * (0.04 + 0.3 * k), top = gy - h * 0.13 - stem, sway = sin(t * 1.5) * h * 0.01 * k;
    rod(ctx, J, x, gy - h * 0.13, x + sway, top, 0.012, "#3f9b4b");
    for (const [u, s] of [[0.35, 1], [0.6, -1]]) {
      if (k < u) continue;
      const g = Math.min(1, (k - u) / 0.2), ly = gy - h * 0.13 - stem * u;
      ctx.save();
      ctx.translate(x + sway * u, ly);
      ctx.rotate(s * -0.6);
      ctx.beginPath();
      ctx.ellipse(s * h * 0.045 * g, 0, h * 0.045 * g + 0.1, h * 0.018 * g + 0.1, 0, 0, PI * 2);
      paint(ctx, "#5bbf5f");
      ctx.restore();
    }
    if (k > 0.8) {
      const g = Math.min(1, (k - 0.8) / 0.2);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * PI * 2 + t * 0.3;
        dot(ctx, x + sway + cos(a) * h * 0.035 * g, top + sin(a) * h * 0.035 * g, h * 0.025 * g);
        paint(ctx, "#ff6f91");
      }
      dot(ctx, x + sway, top, h * 0.02 * g);
      paint(ctx, "#ffd84d");
    }
    poly(ctx, [[x - h * 0.08, gy - h * 0.14], [x + h * 0.08, gy - h * 0.14], [x + h * 0.06, gy], [x - h * 0.06, gy]]);
    paint(ctx, "#c8693b");
  },

  peak(ctx, p, J) {
    // Montagne sous les pieds du personnage, sommet enneigé.
    const { h } = J;
    const gy = J.base[1];
    const ax = J.hip[0], ay = Math.max(J.footF[1], J.footB[1]);
    ink(ctx, J, 0.008);
    poly(ctx, [[ax - h * 1.7, gy], [ax - h * 0.16, ay + h * 0.01], [ax + h * 0.16, ay + h * 0.01], [ax + h * 1.8, gy]]);
    paint(ctx, "#5d6a86");
    poly(ctx, [[ax - h * 0.16, ay + h * 0.01], [ax + h * 0.16, ay + h * 0.01], [ax + h * 0.36, ay + h * 0.09], [ax + h * 0.2, ay + h * 0.07], [ax + h * 0.05, ay + h * 0.12], [ax - h * 0.12, ay + h * 0.07], [ax - h * 0.34, ay + h * 0.1]]);
    paint(ctx, "#f4f6fb");
  },

  fishing(ctx, p, J, t) {
    // Étang devant le pêcheur.
    const { h, d } = J;
    const [bx, gy] = J.base;
    const x0 = bx + d * h * 0.38, x1 = bx + d * h * 2.0;
    ink(ctx, J);
    ctx.beginPath();
    ctx.ellipse((x0 + x1) / 2, gy + h * 0.015, Math.abs(x1 - x0) / 2, h * 0.06, 0, 0, PI * 2);
    paint(ctx, "#2f7fc4");
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = h * 0.006;
    for (let i = 0; i < 3; i++) {
      const x = x0 + d * h * (0.3 + i * 0.45 + 0.05 * sin(t + i));
      line(ctx, x, gy + h * 0.02, x + d * h * 0.12, gy + h * 0.02);
    }
  },

  cake(ctx, p, J, t) {
    // Table et gâteau d'anniversaire ; les bougies s'éteignent quand il souffle.
    const k = p.setK ?? 0;
    const { h, d } = J;
    const [bx, gy] = J.base;
    const cx = bx + d * h * 0.42, top = gy - h * 0.36;
    rod(ctx, J, cx - h * 0.14, top, cx - h * 0.14, gy, 0.02, "#8a5c36");
    rod(ctx, J, cx + h * 0.14, top, cx + h * 0.14, gy, 0.02, "#8a5c36");
    ink(ctx, J);
    ctx.beginPath();
    ctx.roundRect(cx - h * 0.21, top, h * 0.42, h * 0.03, h * 0.008);
    paint(ctx, "#a87447");
    ctx.beginPath();
    ctx.roundRect(cx - h * 0.13, top - h * 0.1, h * 0.26, h * 0.1, h * 0.02);
    paint(ctx, "#ff9ec4");
    ctx.beginPath();
    ctx.roundRect(cx - h * 0.09, top - h * 0.17, h * 0.18, h * 0.075, h * 0.02);
    paint(ctx, "#fff2e0");
    for (let i = -1; i <= 1; i++) {
      const x = cx + i * h * 0.05, y = top - h * 0.17;
      box(ctx, x, y - h * 0.03, h * 0.014, h * 0.06, 0, i ? "#4dd2ff" : "#ffd84d");
      if (k < 1) {
        ctx.globalAlpha = 1 - k;
        const f = h * (0.025 + 0.006 * sin(t * 14 + i));
        ctx.beginPath();
        ctx.ellipse(x, y - h * 0.07 - f * 0.4, h * 0.012, f * 0.6, 0, 0, PI * 2);
        ctx.fillStyle = "#ffb02e";
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        const u = (t * 0.8 + i * 0.3) % 1;
        ctx.strokeStyle = `rgba(200,200,210,${0.6 * (1 - u)})`;
        ctx.lineWidth = h * 0.006;
        ctx.beginPath();
        ctx.moveTo(x, y - h * 0.065);
        ctx.quadraticCurveTo(x + h * 0.03 * sin(t * 3 + i), y - h * 0.065 - u * h * 0.1, x, y - h * 0.065 - u * h * 0.2);
        ctx.stroke();
        ink(ctx, J);
      }
    }
  },

  grave(ctx, p, J) {
    // Pierre tombale avec une croix gravée, herbe au pied.
    const { h, d } = J;
    const [bx, gy] = J.base;
    const x = bx + d * h * 0.48, w = h * 0.26, H = h * 0.42;
    ink(ctx, J);
    ctx.beginPath();
    ctx.moveTo(x - w / 2, gy);
    ctx.lineTo(x - w / 2, gy - H + w / 2);
    ctx.arc(x, gy - H + w / 2, w / 2, PI, 0);
    ctx.lineTo(x + w / 2, gy);
    ctx.closePath();
    paint(ctx, "#8a8f9c");
    ctx.strokeStyle = "rgba(20,20,30,0.55)";
    ctx.lineWidth = h * 0.014;
    line(ctx, x, gy - H * 0.8, x, gy - H * 0.4);
    line(ctx, x - w * 0.18, gy - H * 0.68, x + w * 0.18, gy - H * 0.68);
    ctx.strokeStyle = "#3f9b4b";
    ctx.lineWidth = h * 0.008;
    for (let i = 0; i < 9; i++) {
      const gx = x - w * 0.7 + i * w * 0.18;
      line(ctx, gx, gy, gx + h * 0.01, gy - h * (0.025 + hash(i) * 0.02));
    }
  },

  cage(ctx, p, J) {
    // Fond de la cage (barreaux du fond, plus clairs) et plancher.
    const { h } = J;
    const [bx, gy] = J.base;
    const w = h * 0.3, top = gy - h * 1.12;
    ctx.strokeStyle = "rgba(140,146,160,0.55)";
    ctx.lineWidth = h * 0.01;
    for (let i = 0; i <= 5; i++) line(ctx, bx - w + i * (2 * w) / 5 + h * 0.03, top + h * 0.03, bx - w + i * (2 * w) / 5 + h * 0.03, gy - h * 0.02);
    ink(ctx, J);
    ctx.beginPath();
    ctx.roundRect(bx - w - h * 0.04, gy - h * 0.03, 2 * w + h * 0.08, h * 0.04, h * 0.01);
    paint(ctx, "#3b3f4a");
  },

  gift(ctx, p, J) {
    // Paquet cadeau tenu à deux mains (derrière les mains : on voit les doigts dessus).
    const { h, d } = J;
    const cx = (J.handF[0] + J.handB[0]) / 2 + d * h * 0.05, cy = (J.handF[1] + J.handB[1]) / 2 - h * 0.02, s = h * 0.15;
    ink(ctx, J);
    box(ctx, cx, cy, s, s * 0.9, 0, "#e04a5f", h * 0.01);
    ctx.fillStyle = "#ffd84d";
    ctx.fillRect(cx - s * 0.09, cy - s * 0.45, s * 0.18, s * 0.9);
    ctx.fillRect(cx - s * 0.5, cy - s * 0.07, s, s * 0.14);
    for (const e of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + e * s * 0.16, cy - s * 0.52, s * 0.17, s * 0.09, e * 0.5, 0, PI * 2);
      paint(ctx, "#ffd84d");
    }
  },

  knock(ctx, p, J, t) {
    BEHIND.door(ctx, p, J, t);
  },
};

const FRONT = {
  rain(ctx, p, J, t) {
    const { h } = J;
    const [hx, hy] = J.headC;
    const gy = J.base[1];
    const cx = hx, cy = hy - h * 0.48, w = h * 0.5;
    // Pluie.
    ctx.strokeStyle = "rgba(150,190,255,0.75)";
    ctx.lineWidth = Math.max(1, h * 0.006);
    ctx.lineCap = "round";
    for (let i = 0; i < 22; i++) {
      const x = cx + (hash(i) - 0.5) * w * 0.95;
      const len = gy - cy;
      const y = cy + ((hash(i + 40) + t * 1.4) % 1) * len;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - h * 0.008, y + h * 0.05);
      ctx.stroke();
    }
    // Éclaboussures au sol.
    ctx.strokeStyle = "rgba(150,190,255,0.5)";
    for (let i = 0; i < 4; i++) {
      const u = (t * 1.7 + hash(i + 70)) % 1;
      ctx.beginPath();
      ctx.ellipse(cx + (hash(i + 90) - 0.5) * w, gy, h * 0.05 * u, h * 0.01 * u, 0, 0, PI * 2);
      ctx.stroke();
    }
    // Nuage sombre.
    ctx.fillStyle = "#6a6f88";
    ctx.beginPath();
    for (const [ox, oy, r] of [[-0.18, 0.02, 0.1], [-0.05, -0.04, 0.13], [0.1, -0.02, 0.12], [0.2, 0.03, 0.08], [0, 0.04, 0.1]]) {
      ctx.moveTo(cx + ox * h + r * h, cy + oy * h);
      ctx.arc(cx + ox * h, cy + oy * h, r * h, 0, PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(cx - 0.05 * h, cy - 0.08 * h, 0.07 * h, 0, PI * 2);
    ctx.fill();
  },

  steam(ctx, p, J, t) {
    const k = p.setK ?? 0;
    if (k <= 0) return;
    const { h } = J;
    const [hx, hy] = J.headC;
    for (let i = 0; i < 6; i++) {
      const u = (t * 0.9 + i / 6) % 1;
      const side = i % 2 ? 1 : -1;
      const x = hx + side * h * (0.06 + u * 0.12), y = hy - J.headR - u * h * 0.4;
      ctx.fillStyle = `rgba(230,230,240,${0.55 * (1 - u) * k})`;
      ctx.beginPath();
      ctx.arc(x, y, h * (0.03 + u * 0.06), 0, PI * 2);
      ctx.fill();
    }
  },

  clap(ctx, p, J) {
    const k = p.setK ?? 0;
    if (k <= 0) return;
    const [x, y] = J.handF;
    const { h, d } = J;
    const cx = x + d * h * 0.05, cy = y - h * 0.03;
    ctx.strokeStyle = `rgba(255,216,77,${k})`;
    ctx.lineWidth = h * 0.014;
    ctx.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const a = (i * PI) / 4;
      const r0 = h * (0.06 + (1 - k) * 0.04), r1 = r0 + h * 0.07 * k;
      ctx.beginPath();
      ctx.moveTo(cx + cos(a) * r0, cy + sin(a) * r0);
      ctx.lineTo(cx + cos(a) * r1, cy + sin(a) * r1);
      ctx.stroke();
    }
  },

  rope(ctx, p, J) {
    const th = (p.setK ?? 0) * PI * 2;
    const { h, d } = J;
    const a = J.handB, b = J.handF;
    const c = [J.hip[0], J.hip[1] - h * 0.02];
    const rx = h * 0.26, ry = h * 0.56;
    // La corde fait une boucle autour du corps : son point le plus éloigné tourne sur une ellipse
    // (0 = au-dessus de la tête, π = sous les pieds).
    const pt = [c[0] + d * sin(th) * rx, c[1] - cos(th) * ry];
    const tg = [d * cos(th) * rx, sin(th) * ry];
    const n = Math.hypot(tg[0], tg[1]) || 1, k = h * 0.32 / n;
    ctx.strokeStyle = "#ff8a3d";
    ctx.lineWidth = Math.max(1.5, h * 0.008);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(pt[0] - tg[0] * k, pt[1] - tg[1] * k, pt[0], pt[1]);
    ctx.quadraticCurveTo(pt[0] + tg[0] * k, pt[1] + tg[1] * k, b[0], b[1]);
    ctx.stroke();
  },

  timer(ctx, p, J) {
    const { h } = J;
    const s = Math.floor(p.setK ?? 0);
    const label = `00:${String(min(59, s)).padStart(2, "0")}`;
    const x = J.hip[0], y = J.base[1] - h * 0.72;
    ctx.font = `900 ${h * 0.1}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(label).width + h * 0.08;
    ctx.fillStyle = "rgba(10,10,18,0.75)";
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h * 0.075, w, h * 0.15, h * 0.04);
    ctx.fill();
    ctx.fillStyle = "#ffd84d";
    ctx.fillText(label, x, y + h * 0.005);
    // Anneau de progression des secondes.
    const frac = (p.setK ?? 0) % 1;
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = h * 0.012;
    ctx.beginPath();
    ctx.arc(x - w / 2 - h * 0.08, y, h * 0.045, -PI / 2, -PI / 2 + frac * PI * 2);
    ctx.stroke();
  },

  finish(ctx, p, J, t) {
    const { h, d } = J;
    const [bx, gy] = J.base;
    const fx = bx + d * h * 0.22, ty = gy - h * 0.55;
    ctx.strokeStyle = "#ff3b4a";
    ctx.lineWidth = h * 0.014;
    ctx.lineCap = "round";
    if (!(p.setK > 0)) {
      // Ruban tendu (vu de profil).
      ctx.beginPath();
      ctx.moveTo(fx, ty - h * 0.03);
      ctx.lineTo(fx, ty + h * 0.03);
      ctx.stroke();
      return;
    }
    // Ruban cassé qui flotte, confettis.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(fx, ty);
      ctx.quadraticCurveTo(fx + side * h * 0.08, ty + h * 0.1 + sin(t * 6 + side) * h * 0.02, fx + side * h * 0.05, ty + h * 0.22);
      ctx.stroke();
    }
    const cols = ["#ffd84d", "#ff4d6d", "#4dd2ff", "#7dff8a"];
    for (let i = 0; i < 26; i++) {
      const u = (t * (0.35 + hash(i) * 0.3) + hash(i + 20)) % 1;
      const x = bx + (hash(i + 5) - 0.5) * h * 1.6 + sin(t * 3 + i) * h * 0.03;
      const y = gy - h * 1.6 + u * h * 1.6;
      ctx.fillStyle = cols[i % 4];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 4 + i);
      ctx.fillRect(-h * 0.012, -h * 0.006, h * 0.024, h * 0.012);
      ctx.restore();
    }
  },

  podium(ctx, p, J) {
    // Médaille au cou.
    const { h, d } = J;
    const n = J.neck, c = [J.neck[0] * 0.75 + J.hip[0] * 0.25 + d * h * 0.03, J.neck[1] * 0.75 + J.hip[1] * 0.25];
    ctx.strokeStyle = "#2f6fe0";
    ctx.lineWidth = h * 0.014;
    ctx.beginPath();
    ctx.moveTo(n[0] - h * 0.035, n[1]);
    ctx.lineTo(c[0], c[1] - h * 0.03);
    ctx.lineTo(n[0] + h * 0.035, n[1]);
    ctx.stroke();
    ctx.fillStyle = "#f2c230";
    ctx.beginPath();
    ctx.arc(c[0], c[1], h * 0.035, 0, PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c99812";
    ctx.beginPath();
    ctx.arc(c[0], c[1], h * 0.018, 0, PI * 2);
    ctx.fill();
  },

  bed(ctx, p, J) {
    // Couverture sur le corps (seuls la tête et un bras dépassent).
    const { h, d } = J;
    const gy = J.base[1];
    const top = gy - h * 0.17;
    const feet = J.hip[0] - d * h * 0.62, neck = J.shoulder[0] - d * h * 0.02;
    const left = min(feet, neck), w = abs(neck - feet);
    const y0 = J.hip[1] - h * 0.13;
    ctx.fillStyle = "#3f63c8";
    ctx.beginPath();
    ctx.roundRect(left, y0, w, top - y0 + h * 0.03, h * 0.05);
    ctx.fill();
    ctx.fillStyle = "#5a7de0";
    ctx.beginPath();
    ctx.roundRect(d > 0 ? left + w - h * 0.12 : left, y0, h * 0.12, top - y0 + h * 0.03, h * 0.04);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = h * 0.008;
    for (const u of [0.3, 0.55]) {
      ctx.beginPath();
      ctx.moveTo(left + w * u, y0 + h * 0.03);
      ctx.lineTo(left + w * u + h * 0.04, top);
      ctx.stroke();
    }
  },

  door(ctx, p, J) {
    // Flaque de lumière au sol, devant la porte.
    const k = p.setK ?? 0;
    if (k <= 0) return;
    const { h, d } = J;
    const [bx, gy] = J.base;
    const cx = bx + d * h * 0.3;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255,220,140,${0.28 * k})`;
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.22, gy);
    ctx.lineTo(cx + h * 0.22, gy);
    ctx.lineTo(cx + h * 0.55, gy + h * 0.12);
    ctx.lineTo(cx - h * 0.55, gy + h * 0.12);
    ctx.closePath();
    ctx.fill();
  },

  orb(ctx, p, J, t) {
    // Le rêve qui file devant, toujours hors d'atteinte.
    const { h, d } = J;
    const [bx, gy] = J.base;
    const x = bx + d * h * (0.62 + 0.06 * sin(t * 1.3)), y = gy - h * (0.95 + 0.08 * sin(t * 2.2));
    for (let i = 1; i <= 5; i++) {
      ctx.fillStyle = `rgba(255,216,77,${0.5 - i * 0.08})`;
      ctx.beginPath();
      ctx.arc(x - d * i * h * 0.05, y + sin(t * 4 + i) * h * 0.02, h * (0.018 - i * 0.002), 0, PI * 2);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(x, y, 0, x, y, h * 0.12);
    g.addColorStop(0, "rgba(255,250,220,1)");
    g.addColorStop(0.3, "rgba(255,216,77,0.9)");
    g.addColorStop(1, "rgba(255,216,77,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, h * 0.12, 0, PI * 2);
    ctx.fill();
  },

  // ——— Relations ———

  twinkle(ctx, p, J, t) {
    // Petites étincelles autour des mains jointes (promesse).
    const k = p.setK ?? 0;
    if (k < 0.8) return;
    const { h, d } = J;
    const [x, y] = J.handF;
    for (let i = 0; i < 4; i++) {
      const a = t * 2 + (i * PI) / 2, r = h * (0.07 + 0.02 * sin(t * 3 + i));
      ctx.fillStyle = i % 2 ? "#ffd84d" : "#ffffff";
      starShape(ctx, x + d * h * 0.02 + cos(a) * r, y + sin(a) * r * 0.7, h * 0.018, 4, 0.35, t);
      ctx.fill();
    }
  },

  ring(ctx, p, J, t) {
    // Écrin qui s'ouvre, bague qui brille.
    const k = p.setK ?? 0;
    const { h, d } = J;
    const [hx, hy] = J.handF;
    const x = hx + d * h * 0.015, y = hy - h * 0.025, s = h * 0.06;
    ink(ctx, J, 0.005);
    box(ctx, x, y + s * 0.25, s, s * 0.5, 0, "#8e1f3a", s * 0.1);
    ctx.save();
    ctx.translate(x - d * s / 2, y);
    ctx.rotate(-d * k * 1.9);
    ctx.beginPath();
    ctx.roundRect(d > 0 ? 0 : -s, -s * 0.4, s, s * 0.4, s * 0.1);
    paint(ctx, "#a8274a");
    ctx.restore();
    if (k > 0.3) {
      ctx.strokeStyle = "#ffd84d";
      ctx.lineWidth = h * 0.007;
      dot(ctx, x, y - s * 0.05, s * 0.22);
      ctx.stroke();
      ink(ctx, J, 0.004);
      poly(ctx, [[x, y - s * 0.55], [x + s * 0.15, y - s * 0.35], [x, y - s * 0.22], [x - s * 0.15, y - s * 0.35]]);
      paint(ctx, "#bff3ff");
      ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * sin(t * 6)})`;
      starShape(ctx, x + s * 0.3, y - s * 0.7, s * 0.25, 4, 0.3, t);
      ctx.fill();
    }
  },

  hearts(ctx, p, J, t) {
    // Petits cœurs qui s'envolent entre les deux visages.
    const k = p.setK ?? 0;
    if (k <= 0) return;
    const { h, d } = J;
    const x = J.headC[0] + d * h * 0.13, y = J.headC[1] - h * 0.05;
    for (let i = 0; i < 5; i++) {
      const u = (t * 0.45 + i / 5) % 1;
      ctx.globalAlpha = k * (1 - u);
      ink(ctx, J, 0.004);
      heartShape(ctx, x + sin(t * 2 + i * 1.7) * h * 0.06, y - u * h * 0.55, h * (0.025 + 0.02 * u));
      paint(ctx, i % 2 ? "#ff4d6d" : "#ff8fab");
    }
    ctx.globalAlpha = 1;
  },

  brawl(ctx, p, J, t) {
    // Nuage de bagarre de dessin animé : poings, pieds, étoiles et jurons.
    const { h, d } = J;
    const s = ease((t - 0.6) / 0.25);
    if (s <= 0) return;
    const cx = J.base[0] + d * (p.setK ?? 0.4) * h, cy = J.base[1] - h * 0.55;
    const R = h * 0.5 * s;
    ink(ctx, J, 0.008);
    // Membres qui dépassent.
    for (let i = 0; i < 5; i++) {
      const a = t * (2.2 + hash(i)) + i * 1.3, ex = cx + cos(a) * R * 1.15, ey = cy + sin(a) * R * 0.95;
      rod(ctx, J, cx + cos(a) * R * 0.6, cy + sin(a) * R * 0.5, ex, ey, 0.03, "#f4f4f6");
      ink(ctx, J, 0.008);
      dot(ctx, ex, ey, h * 0.03);
      paint(ctx, "#f4f4f6");
    }
    ctx.beginPath();
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * PI * 2 + t * 0.6, rr = R * (0.32 + 0.08 * sin(t * 7 + i * 2));
      const x = cx + cos(a) * R * 0.78, y = cy + sin(a) * R * 0.62;
      ctx.moveTo(x + rr, y);
      ctx.arc(x, y, Math.max(0.1, rr), 0, PI * 2);
    }
    ctx.fillStyle = "#e9e5dc";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 0.85, R * 0.65, 0, 0, PI * 2);
    ctx.fill();
    // Étoiles et symboles.
    const signs = ["#", "@", "!", "$", "%"];
    ctx.font = `900 ${h * 0.09}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 5; i++) {
      const on = (t * 3 + hash(i) * 5) % 2 < 1.2;
      if (!on) continue;
      const x = cx + (hash(i + 3) - 0.5) * R * 1.2, y = cy + (hash(i + 8) - 0.5) * R * 0.9;
      ctx.fillStyle = i % 2 ? "#ff3b4a" : "#2b2f3d";
      ctx.fillText(signs[i], x, y);
    }
    for (let i = 0; i < 3; i++) {
      const a = t * 3 + i * 2.1;
      ink(ctx, J, 0.005);
      starShape(ctx, cx + cos(a) * R * 0.95, cy - R * 0.75 + sin(a) * R * 0.15, h * 0.035, 5, 0.45, a);
      paint(ctx, "#ffd84d");
    }
  },

  proof(ctx, p, J, t) {
    // La preuve : téléphone brandi, écran vers l'autre (messages).
    const k = p.setK ?? 0;
    if (k <= 0) return;
    const { h, d } = J;
    const [hx, hy] = J.handF;
    ctx.translate(hx + d * h * 0.01, hy - h * 0.05);
    ctx.rotate(d * 0.15);
    ctx.scale(k, k);
    ink(ctx, J, 0.006);
    ctx.beginPath();
    ctx.roundRect(-h * 0.05, -h * 0.085, h * 0.1, h * 0.17, h * 0.014);
    paint(ctx, "#1c1d24");
    ctx.fillStyle = "#e9f4ff";
    ctx.fillRect(-h * 0.04, -h * 0.07, h * 0.08, h * 0.14);
    ctx.fillStyle = "#c9ced8";
    ctx.fillRect(-h * 0.034, -h * 0.06, h * 0.045, h * 0.02);
    ctx.fillStyle = "#4dd27a";
    ctx.fillRect(-h * 0.005, -h * 0.03, h * 0.04, h * 0.02);
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-h * 0.034, h * 0.0, h * 0.05, h * 0.02);
    ctx.fillStyle = `rgba(255,59,74,${0.6 + 0.4 * sin(t * 8)})`;
    ctx.font = `900 ${h * 0.05}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("!", 0, h * 0.06);
  },

  // ——— Émotions ———

  doubt(ctx, p, J, t) {
    // Petit nuage gris au-dessus de la tête, un gribouillis qui tourne dedans.
    const { h } = J;
    const x = J.headC[0], y = J.headC[1] - J.headR - h * 0.17 + sin(t * 1.5) * h * 0.01;
    ink(ctx, J, 0.006);
    ctx.beginPath();
    for (const [ox, oy, r] of [[-0.07, 0.01, 0.05], [0, -0.02, 0.065], [0.07, 0.01, 0.05], [0, 0.03, 0.05]]) {
      ctx.moveTo(x + ox * h + r * h, y + oy * h);
      ctx.arc(x + ox * h, y + oy * h, r * h, 0, PI * 2);
    }
    ctx.fillStyle = "#7c8194";
    ctx.fill();
    ctx.strokeStyle = "#e9ebf2";
    ctx.lineWidth = h * 0.006;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * PI * 4 + t * 3, r = h * 0.008 * (1 + i * 0.12);
      ctx.lineTo(x + cos(a) * r * 1.6, y + sin(a) * r);
    }
    ctx.stroke();
  },

  bush(ctx, p, J, t) {
    // Buisson derrière lequel il se cache (il remue quand le personnage bouge).
    const { h, d } = J;
    const [bx, gy] = J.base;
    const k = p.setK ?? 0, rustle = sin(k * PI) * sin(t * 30) * h * 0.008;
    const x = bx + d * h * 0.1;
    ink(ctx, J, 0.008);
    ctx.beginPath();
    for (const [ox, oy, r] of [[-0.3, 0.13, 0.15], [-0.14, 0.27, 0.2], [0.08, 0.31, 0.22], [0.28, 0.2, 0.17], [0.38, 0.1, 0.12], [-0.38, 0.06, 0.1], [0, 0.12, 0.2]]) {
      const cx = x + ox * h + rustle, cy = gy - oy * h;
      ctx.moveTo(cx + r * h, cy);
      ctx.arc(cx, cy, r * h, 0, PI * 2);
    }
    ctx.fillStyle = "#3f9b4b";
    ctx.fill();
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = "#57b862";
    for (let i = 0; i < 6; i++) {
      dot(ctx, x + (hash(i) - 0.5) * h * 0.6 + rustle, gy - h * (0.12 + hash(i + 3) * 0.3), h * 0.025);
      ctx.fill();
    }
  },

  yes(ctx, p, J) {
    badge(ctx, p, J, "#3fbf5f", (x, y, r) => {
      ctx.moveTo(x - r * 0.45, y);
      ctx.lineTo(x - r * 0.1, y + r * 0.35);
      ctx.lineTo(x + r * 0.5, y - r * 0.35);
    });
  },

  nope(ctx, p, J) {
    badge(ctx, p, J, "#e5484d", (x, y, r) => {
      ctx.moveTo(x - r * 0.38, y - r * 0.38);
      ctx.lineTo(x + r * 0.38, y + r * 0.38);
      ctx.moveTo(x + r * 0.38, y - r * 0.38);
      ctx.lineTo(x - r * 0.38, y + r * 0.38);
    });
  },

  stars(ctx, p, J, t) {
    // Étoiles qui tournent autour de la tête (étourdi).
    const { h } = J;
    const x = J.headC[0], y = J.headC[1] - J.headR * 1.15;
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i * 2 * PI) / 3;
      ink(ctx, J, 0.004);
      starShape(ctx, x + cos(a) * h * 0.16, y + sin(a) * h * 0.04, h * (0.026 + 0.008 * sin(a)), 5, 0.45, a);
      paint(ctx, "#ffd84d");
    }
  },

  sick(ctx, p, J, t) {
    const k = p.setK ?? 0;
    const { h, d, headR } = J;
    const [x, y] = J.headC;
    const mx = x + d * headR * 0.75, my = y + headR * 0.4;
    if (k === 0) {
      // Thermomètre dans la bouche.
      rod(ctx, J, mx, my, mx + d * h * 0.09, my + h * 0.035, 0.012, "#f4f6fb");
      ink(ctx, J, 0.004);
      dot(ctx, mx + d * h * 0.09, my + h * 0.035, h * 0.012);
      paint(ctx, "#ff3b4a");
      return;
    }
    if (k < 0.05) return;
    // Atchoum : gouttelettes en éventail.
    for (let i = 0; i < 14; i++) {
      const a = (hash(i) - 0.5) * 0.9, dist = h * (0.05 + 0.3 * k * (0.6 + hash(i + 5) * 0.6));
      ctx.fillStyle = `rgba(200,235,255,${0.9 * k})`;
      dot(ctx, mx + d * cos(a) * dist, my + sin(a) * dist, h * 0.008);
      ctx.fill();
    }
  },

  // ——— Vie quotidienne ———

  study(ctx, p, J) {
    // Stylo dans la main avant.
    const { h, d } = J;
    const [x, y] = J.handF;
    rod(ctx, J, x - d * h * 0.01, y - h * 0.05, x + d * h * 0.012, y + h * 0.012, 0.009, "#2f6fe0");
  },

  board(ctx, p, J) {
    // Baguette dans le prolongement de l'avant-bras.
    const { h } = J;
    const [x, y] = J.handF;
    const [ux, uy] = unit(J.elbowF, J.handF);
    rod(ctx, J, x - ux * h * 0.02, y - uy * h * 0.02, x + ux * h * 0.3, y + uy * h * 0.3, 0.009, "#b07a45");
  },

  stove(ctx, p, J, t) {
    // Vapeur au-dessus de la poêle.
    const { h, d } = J;
    const [hx, hy] = J.handF;
    const px = hx + d * h * 0.19;
    for (let i = 0; i < 4; i++) {
      const u = (t * 0.6 + i / 4) % 1;
      ctx.strokeStyle = `rgba(235,235,245,${0.5 * (1 - u)})`;
      ctx.lineWidth = h * 0.01;
      ctx.beginPath();
      const x = px + (i - 1.5) * h * 0.035;
      ctx.moveTo(x, hy - h * 0.05 - u * h * 0.05);
      ctx.quadraticCurveTo(x + h * 0.03 * sin(t * 3 + i), hy - h * 0.1 - u * h * 0.1, x, hy - h * 0.15 - u * h * 0.15);
      ctx.stroke();
    }
  },

  burger(ctx, p, J) {
    // Burger dans la main ; il rapetisse à chaque bouchée.
    const { h, d } = J;
    const bites = (p.setK ?? 0) % 5, s = h * 0.1 * (1 - 0.13 * bites);
    const [hx, hy] = J.handF;
    const x = hx + d * s * 0.25, y = hy - s * 0.3;
    ink(ctx, J, 0.005);
    ctx.beginPath();
    ctx.roundRect(x - s * 0.5, y + s * 0.12, s, s * 0.22, s * 0.1);
    paint(ctx, "#e0a54a");
    ctx.beginPath();
    ctx.roundRect(x - s * 0.55, y - s * 0.02, s * 1.1, s * 0.16, s * 0.06);
    paint(ctx, "#6b3b22");
    ctx.fillStyle = "#5bbf5f";
    ctx.fillRect(x - s * 0.55, y - s * 0.06, s * 1.1, s * 0.05);
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.07, s * 0.52, s * 0.3, 0, PI, PI * 2);
    ctx.closePath();
    paint(ctx, "#f0b45a");
    ctx.fillStyle = "#fff6dc";
    for (let i = 0; i < 4; i++) {
      dot(ctx, x + (i - 1.5) * s * 0.2, y - s * (0.2 + (i % 2) * 0.06), s * 0.03);
      ctx.fill();
    }
  },

  cup(ctx, p, J, t) {
    // Tasse de café fumante.
    const { h, d } = J;
    const [hx, hy] = J.handF;
    const x = hx + d * h * 0.035, y = hy - h * 0.02, w = h * 0.06;
    ink(ctx, J, 0.005);
    ctx.lineWidth = h * 0.01;
    ctx.beginPath();
    ctx.arc(x + d * w * 0.55, y, w * 0.25, -PI / 2, PI / 2, d < 0);
    ctx.stroke();
    ink(ctx, J, 0.005);
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - w * 0.55, w, w * 1.05, [0, 0, w * 0.25, w * 0.25]);
    paint(ctx, "#f4f4f6");
    ctx.fillStyle = "#d9443f";
    ctx.fillRect(x - w / 2 + 1, y - w * 0.1, w - 2, w * 0.18);
    if ((p.setK ?? 0) < 0.5) {
      for (let i = 0; i < 2; i++) {
        const u = (t * 0.5 + i / 2) % 1;
        ctx.strokeStyle = `rgba(235,235,245,${0.6 * (1 - u)})`;
        ctx.lineWidth = h * 0.008;
        ctx.beginPath();
        ctx.moveTo(x + (i - 0.5) * w * 0.4, y - w * 0.65);
        ctx.quadraticCurveTo(x + (i - 0.5) * w * 0.4 + sin(t * 3 + i) * w * 0.4, y - w * 0.9 - u * h * 0.05, x + (i - 0.5) * w * 0.4, y - w * 1.1 - u * h * 0.1);
        ctx.stroke();
      }
    }
  },

  car(ctx, p, J, t) {
    // Carrosserie (cache les jambes), vitres, roues qui tournent, volant.
    const { h, d } = J;
    const gy = J.base[1];
    const [hx, hy] = J.hip;
    const cx = hx + d * h * 0.1, L = h * 0.66, belt = hy - h * 0.1, bot = gy - h * 0.025, roof = J.headC[1] - J.headR - h * 0.06;
    const X = (u) => cx + d * u * L; // u de -1 (arrière) à 1 (avant)
    ink(ctx, J, 0.008);
    // Toit et montants (vitres transparentes).
    ctx.beginPath();
    ctx.moveTo(X(-0.62), belt);
    ctx.lineTo(X(-0.5), roof);
    ctx.lineTo(X(0.2), roof);
    ctx.lineTo(X(0.48), belt);
    ctx.fillStyle = "rgba(170,215,255,0.22)";
    ctx.fill();
    ctx.lineWidth = h * 0.018;
    ctx.stroke();
    ctx.strokeStyle = "#d9443f";
    ctx.lineWidth = h * 0.008;
    ctx.stroke();
    // Volant.
    ink(ctx, J, 0.008);
    const [wx, wy] = [(J.handF[0] + J.handB[0]) / 2, (J.handF[1] + J.handB[1]) / 2];
    rod(ctx, J, wx, wy, X(0.42), belt, 0.01, "#2b2b33");
    ctx.lineWidth = h * 0.014;
    ctx.beginPath();
    ctx.ellipse(wx, wy, h * 0.015, h * 0.06, d * 0.35, 0, PI * 2);
    ctx.stroke();
    // Caisse.
    ink(ctx, J, 0.008);
    ctx.beginPath();
    ctx.moveTo(X(-1), bot);
    ctx.lineTo(X(-1), belt + h * 0.02);
    ctx.quadraticCurveTo(X(-1), belt, X(-0.9), belt);
    ctx.lineTo(X(0.5), belt);
    ctx.lineTo(X(0.95), belt + h * 0.07);
    ctx.quadraticCurveTo(X(1.04), belt + h * 0.08, X(1.03), bot - h * 0.03);
    ctx.lineTo(X(1.0), bot);
    ctx.closePath();
    paint(ctx, "#d9443f");
    ctx.fillStyle = "#ffe8a8";
    dot(ctx, X(0.98), belt + h * 0.1, h * 0.02);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = h * 0.006;
    line(ctx, X(-0.05), belt + h * 0.02, X(-0.05), bot - h * 0.01);
    for (const u of [-0.62, 0.62]) {
      ink(ctx, J, 0.008);
      dot(ctx, X(u), gy - h * 0.1, h * 0.1);
      paint(ctx, "#22232b");
      dot(ctx, X(u), gy - h * 0.1, h * 0.045);
      paint(ctx, "#b9bfcc");
      const a = t * 9 * d;
      line(ctx, X(u) - cos(a) * h * 0.04, gy - h * 0.1 - sin(a) * h * 0.04, X(u) + cos(a) * h * 0.04, gy - h * 0.1 + sin(a) * h * 0.04);
    }
  },

  bike(ctx, p, J) {
    // Manivelle du côté visible (devant la jambe arrière, derrière… on la redessine devant).
    const { h, d } = J;
    const [hx, hy] = J.hip;
    const C = [hx + d * h * 0.07, hy + h * 0.33];
    rod(ctx, J, C[0], C[1], J.footF[0], J.footF[1], 0.01, "#8d94a6");
  },

  bags(ctx, p, J, t) {
    shoppingBag(ctx, J, J.handF, "#ff6f91", t);
  },

  broom(ctx, p, J, t) {
    // Petits nuages de poussière autour de la brosse.
    const { h } = J;
    const gy = J.base[1];
    const s = p.setK ?? 0;
    const a = J.handB, b = J.handF, dy = b[1] - a[1] || 1e-3, u = (gy - h * 0.06 - a[1]) / dy;
    const ex = a[0] + (b[0] - a[0]) * u;
    for (let i = 0; i < 5; i++) {
      const k = (t * 0.9 + i / 5) % 1;
      ctx.fillStyle = `rgba(210,200,180,${0.5 * (1 - k)})`;
      dot(ctx, ex + (hash(i) - 0.5) * h * 0.2 + s * h * 0.05, gy - k * h * 0.12, h * (0.02 + k * 0.03));
      ctx.fill();
    }
  },

  cash(ctx, p, J, t) {
    // Liasse dans la main arrière, billets qui pleuvent.
    const { h } = J;
    const [bx, by] = J.handB;
    for (let i = 0; i < 4; i++) bill(ctx, J, bx, by - h * 0.01 - i * h * 0.008, 0.1 * (i - 1.5));
    bill(ctx, J, J.handF[0], J.handF[1] - h * 0.02, -0.5 + sin(t * PI * 2.2) * 0.4);
    const gy = J.base[1];
    for (let i = 0; i < 14; i++) {
      const u = (t * (0.18 + hash(i) * 0.12) + hash(i + 30)) % 1;
      const x = J.hip[0] + (hash(i + 2) - 0.5) * h * 2 + sin(t * 2 + i) * h * 0.06, y = gy - h * 2 + u * h * 2;
      bill(ctx, J, x, y, t * (1 + hash(i)) + i);
    }
  },

  knock(ctx, p, J, t) {
    FRONT.door(ctx, p, J, t);
    // Petits arcs « toc » quand le poing touche la porte.
    const c = t % 1.5, tap = t < 2.8 && c < 0.75 ? Math.abs(sin(c * PI * 4)) : 1;
    if (tap > 0.3) return;
    const { h, d } = J;
    const [x, y] = J.handF;
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = h * 0.01;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(x + d * h * 0.02, y, h * 0.035 * i, d > 0 ? -0.8 : PI - 0.8, d > 0 ? 0.8 : PI + 0.8);
      ctx.stroke();
    }
  },

  selfie(ctx, p, J) {
    // Téléphone tenu à bout de bras (on voit le dos et l'objectif), flash.
    const { h, d } = J;
    const [x, y] = J.handF;
    ink(ctx, J, 0.005);
    box(ctx, x + d * h * 0.005, y - h * 0.04, h * 0.05, h * 0.095, -d * 0.25, "#2b2f3d", h * 0.01);
    ctx.fillStyle = "#9aa0b0";
    dot(ctx, x + d * h * 0.0, y - h * 0.07, h * 0.008);
    ctx.fill();
    const k = p.setK ?? 0;
    if (k > 0) {
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(x, y - h * 0.06, 0, x, y - h * 0.06, h * 0.25);
      g.addColorStop(0, `rgba(255,255,255,${k})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      dot(ctx, x, y - h * 0.06, h * 0.25);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
  },

  mic(ctx, p, J, t) {
    // Micro tenu devant la bouche.
    const { h } = J;
    const [x, y] = J.handF;
    const [ux, uy] = unit(J.handF, J.headC);
    const top = [x + ux * h * 0.055, y + uy * h * 0.055];
    rod(ctx, J, x - ux * h * 0.03, y - uy * h * 0.03, top[0], top[1], 0.016, "#2b2b33");
    ink(ctx, J, 0.005);
    dot(ctx, top[0] + ux * h * 0.015, top[1] + uy * h * 0.015, h * 0.024);
    paint(ctx, "#b9bfcc");
  },

  guitar(ctx, p, J, t) {
    // Guitare : caisse devant le ventre, manche vers la main avant.
    const { h, d } = J;
    const B = [J.hip[0] + d * h * 0.06, J.hip[1] - h * 0.04];
    const [ux, uy] = unit(B, J.handF);
    const end = [J.handF[0] + ux * h * 0.06, J.handF[1] + uy * h * 0.06];
    rod(ctx, J, B[0], B[1], end[0], end[1], 0.022, "#6b4a32");
    box(ctx, end[0], end[1], h * 0.05, h * 0.03, Math.atan2(uy, ux), "#4a3222", h * 0.006);
    ink(ctx, J, 0.007);
    ctx.save();
    ctx.translate(B[0], B[1]);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.beginPath();
    ctx.ellipse(-h * 0.06, 0, h * 0.085, h * 0.075, 0, 0, PI * 2);
    ctx.moveTo(h * 0.07, 0);
    ctx.ellipse(h * 0.02, 0, h * 0.06, h * 0.055, 0, 0, PI * 2);
    ctx.fillStyle = "#d9893a";
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = "#2b1d14";
    dot(ctx, h * 0.0, 0, h * 0.022);
    ctx.fill();
    ctx.fillStyle = "#4a3222";
    ctx.fillRect(-h * 0.1, -h * 0.02, h * 0.02, h * 0.04);
    ctx.restore();
  },

  easel(ctx, p, J, t) {
    // Pinceau dans la main avant, palette dans la main arrière.
    const { h, d } = J;
    const [x, y] = J.handF;
    const [ux, uy] = unit(J.elbowF, J.handF);
    rod(ctx, J, x - ux * h * 0.02, y - uy * h * 0.02, x + ux * h * 0.07, y + uy * h * 0.07, 0.008, "#b07a45");
    ink(ctx, J, 0.004);
    dot(ctx, x + ux * h * 0.08, y + uy * h * 0.08, h * 0.012);
    paint(ctx, ["#d9443f", "#2f6fe0", "#3f9b4b"][Math.floor(t / 1.5) % 3]);
    const [px, py] = J.handB;
    ink(ctx, J, 0.005);
    ctx.beginPath();
    ctx.ellipse(px + d * h * 0.02, py - h * 0.01, h * 0.07, h * 0.035, -d * 0.2, 0, PI * 2);
    paint(ctx, "#e8c99a");
    ["#d9443f", "#2f6fe0", "#ffd84d", "#3f9b4b"].forEach((c, i) => {
      ctx.fillStyle = c;
      dot(ctx, px + d * h * (0.0 + i * 0.025), py - h * (0.02 - (i % 2) * 0.012), h * 0.01);
      ctx.fill();
    });
  },

  plant(ctx, p, J, t) {
    // Arrosoir dans la main, l'eau tombe sur la plante.
    const { h, d } = J;
    const [x, y] = J.handF;
    const body = [x + d * h * 0.06, y + h * 0.04];
    const spout = [body[0] + d * h * 0.13, body[1] - h * 0.015];
    rod(ctx, J, body[0], body[1] + h * 0.01, spout[0], spout[1], 0.012, "#3f7fd9");
    ink(ctx, J, 0.006);
    ctx.beginPath();
    ctx.roundRect(body[0] - h * 0.05, body[1] - h * 0.035, h * 0.1, h * 0.08, h * 0.015);
    paint(ctx, "#4d8fe6");
    ctx.lineWidth = h * 0.009;
    ctx.beginPath();
    ctx.arc(body[0] - d * h * 0.01, body[1] - h * 0.035, h * 0.035, PI, 0);
    ctx.stroke();
    const px = J.base[0] + d * h * 0.44, top = J.base[1] - h * (0.17 + 0.3 * (p.setK ?? 0));
    for (let i = 0; i < 6; i++) {
      const u = (t * 1.4 + i / 6) % 1;
      ctx.fillStyle = "rgba(120,200,255,0.85)";
      dot(ctx, spout[0] + (px - spout[0]) * u + sin(i) * h * 0.01, spout[1] + (top - spout[1]) * u * u, h * 0.008);
      ctx.fill();
    }
  },

  peak(ctx, p, J, t) {
    // Drapeau : tenu à deux mains, puis planté au sommet.
    const { h, d } = J;
    let bot, top;
    if (!(p.setK > 0)) {
      const [x, y] = J.handF;
      bot = [x, y + h * 0.2];
      top = [x, y - h * 0.48];
    } else {
      const ay = Math.max(J.footF[1], J.footB[1]);
      bot = [J.hip[0] + d * h * 0.17, ay + h * 0.02];
      top = [bot[0], bot[1] - h * 0.72];
    }
    rod(ctx, J, bot[0], bot[1], top[0], top[1], 0.012, "#cfd2dc");
    ink(ctx, J, 0.006);
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    for (let i = 1; i <= 6; i++) ctx.lineTo(top[0] + d * h * 0.045 * i, top[1] + sin(t * 6 - i) * h * 0.012 * i * 0.4);
    for (let i = 6; i >= 0; i--) ctx.lineTo(top[0] + d * h * 0.045 * i, top[1] + h * 0.15 + sin(t * 6 - i) * h * 0.012 * i * 0.4);
    ctx.closePath();
    paint(ctx, "#ff3b4a");
    ctx.fillStyle = "#ffffff";
    starShape(ctx, top[0] + d * h * 0.13, top[1] + h * 0.075 + sin(t * 6 - 3) * h * 0.014, h * 0.03, 5, 0.45, 0);
    ctx.fill();
  },

  water(ctx, p, J, t) {
    // Eau jusqu'à la taille du nageur, vagues qui défilent, éclaboussures autour des mains.
    const { h, d } = J;
    const gy = J.base[1], sy = J.hip[1] - h * 0.01, x = J.hip[0];
    ctx.beginPath();
    ctx.moveTo(x - h * 3, gy + h * 0.06);
    for (let i = 0; i <= 60; i++) {
      const xx = x - h * 3 + (i / 60) * h * 6;
      ctx.lineTo(xx, sy + sin(xx / (h * 0.12) + t * 4 * d) * h * 0.012);
    }
    ctx.lineTo(x + h * 3, gy + h * 0.06);
    ctx.closePath();
    ctx.fillStyle = "rgba(38,128,205,0.82)";
    ctx.fill();
    ctx.strokeStyle = "rgba(220,240,255,0.85)";
    ctx.lineWidth = h * 0.008;
    ctx.stroke();
    ctx.strokeStyle = "rgba(220,240,255,0.4)";
    for (let i = 0; i < 6; i++) {
      const u = ((hash(i) - t * 0.5 * d) % 1 + 1) % 1, lx = x + (u * 4 - 2) * h, ly = sy + h * (0.04 + hash(i + 4) * 0.15);
      line(ctx, lx, ly, lx + h * 0.12, ly);
    }
    for (const hand of [J.handF, J.handB]) {
      if (Math.abs(hand[1] - sy) > h * 0.05) continue;
      ctx.fillStyle = "rgba(235,248,255,0.9)";
      for (let i = 0; i < 4; i++) {
        dot(ctx, hand[0] + (hash(i + t) - 0.5) * h * 0.08, sy - h * (0.01 + hash(i + 2) * 0.04), h * 0.01);
        ctx.fill();
      }
    }
  },

  fishing(ctx, p, J, t) {
    // Canne, fil, bouchon… et le poisson qui sort de l'eau.
    const { h, d } = J;
    const gy = J.base[1];
    const c = p.setK ?? 0;
    const [ux, uy] = unit(J.handB, J.handF);
    const tip = [J.handB[0] + ux * h * 0.85, J.handB[1] + uy * h * 0.85];
    rod(ctx, J, J.handB[0] - ux * h * 0.06, J.handB[1] - uy * h * 0.06, tip[0], tip[1], 0.009, "#3b3f4a");
    const pulled = c > 3.7 && c < 5.8;
    ctx.strokeStyle = "rgba(235,235,245,0.85)";
    ctx.lineWidth = Math.max(1, h * 0.003);
    if (!pulled) {
      const dip = c > 3.2 ? h * 0.025 * Math.abs(sin(c * 18)) : sin(t * 2) * h * 0.005;
      const bob = [tip[0] + d * h * 0.06, gy + h * 0.005 + dip];
      line(ctx, tip[0], tip[1], bob[0], bob[1]);
      ink(ctx, J, 0.004);
      dot(ctx, bob[0], bob[1], h * 0.014);
      paint(ctx, "#ff3b4a");
      return;
    }
    const end = [tip[0] + sin(t * 9) * h * 0.02, tip[1] + h * 0.22];
    line(ctx, tip[0], tip[1], end[0], end[1]);
    ctx.save();
    ctx.translate(end[0], end[1] + h * 0.06);
    ctx.rotate(PI / 2 + sin(t * 12) * 0.35);
    ink(ctx, J, 0.005);
    ctx.beginPath();
    ctx.ellipse(0, 0, h * 0.06, h * 0.028, 0, 0, PI * 2);
    paint(ctx, "#ffb02e");
    poly(ctx, [[h * 0.05, 0], [h * 0.09, -h * 0.03], [h * 0.09, h * 0.03]]);
    paint(ctx, "#ff8a3d");
    ctx.fillStyle = INK;
    dot(ctx, -h * 0.035, -h * 0.006, h * 0.006);
    ctx.fill();
    ctx.restore();
  },

  gradcap(ctx, p, J) {
    // Toque de diplômé : sur la tête, lancée en l'air, puis retombe ; diplôme dans l'autre main.
    const { h, d, headR } = J;
    const c = p.setK ?? 0;
    const [hx, hy] = J.headC;
    let x = hx, y = hy - headR * 0.95, a = 0;
    if (c > 1.3 && c < 3.4) {
      const s = c - 1.3;
      y -= h * (1.722 * s - 0.82 * s * s);
      x += d * h * 0.05 * sin(s * 3);
      a = s * 7;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ink(ctx, J, 0.005);
    ctx.beginPath();
    ctx.roundRect(-headR * 0.7, -headR * 0.05, headR * 1.4, headR * 0.45, headR * 0.1);
    paint(ctx, "#1d1f2a");
    poly(ctx, [[-headR * 1.25, -headR * 0.1], [0, -headR * 0.42], [headR * 1.25, -headR * 0.1], [0, headR * 0.22]]);
    paint(ctx, "#2b2f3d");
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = h * 0.006;
    line(ctx, 0, -headR * 0.1, headR * 0.9, headR * 0.15);
    line(ctx, headR * 0.9, headR * 0.15, headR * 0.9, headR * 0.55);
    ctx.restore();
    const [bx, by] = J.handB;
    ink(ctx, J, 0.005);
    box(ctx, bx, by - h * 0.01, h * 0.035, h * 0.13, -d * 0.6, "#fbfaf4", h * 0.015);
    ctx.fillStyle = "#d9443f";
    dot(ctx, bx, by - h * 0.01, h * 0.012);
    ctx.fill();
  },

  cake(ctx, p, J, t) {
    // Chapeau pointu sur la tête, souffle vers les bougies, confettis.
    const { h, d, headR } = J;
    const [ux, uy] = unit(J.neck, J.headC);
    const base = [J.headC[0] + ux * headR * 0.8, J.headC[1] + uy * headR * 0.8];
    const tipP = [base[0] + ux * h * 0.15, base[1] + uy * h * 0.15];
    ink(ctx, J, 0.005);
    poly(ctx, [[base[0] - uy * headR * 0.6, base[1] + ux * headR * 0.6], tipP, [base[0] + uy * headR * 0.6, base[1] - ux * headR * 0.6]]);
    paint(ctx, "#7d5cff");
    dot(ctx, tipP[0], tipP[1], h * 0.016);
    paint(ctx, "#ffd84d");
    const k = p.setK ?? 0;
    if (k > 0 && k < 1) {
      ctx.strokeStyle = "rgba(220,240,255,0.7)";
      ctx.lineWidth = h * 0.006;
      const mx = J.headC[0] + d * headR, my = J.headC[1] + headR * 0.4;
      for (let i = 0; i < 3; i++) line(ctx, mx + d * h * 0.03, my + i * h * 0.02, mx + d * h * 0.16, my + h * 0.08 + i * h * 0.03);
    }
    if (t > 2.7) {
      const cols = ["#ffd84d", "#ff4d6d", "#4dd2ff", "#7dff8a"];
      for (let i = 0; i < 22; i++) {
        const u = ((t - 2.7) * (0.35 + hash(i) * 0.3) + hash(i + 20)) % 1;
        const x = J.hip[0] + (hash(i + 5) - 0.5) * h * 1.6 + sin(t * 3 + i) * h * 0.03, y = J.base[1] - h * 1.6 + u * h * 1.6;
        ctx.fillStyle = cols[i % 4];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 4 + i);
        ctx.fillRect(-h * 0.012, -h * 0.006, h * 0.024, h * 0.012);
        ctx.restore();
      }
    }
  },

  grave(ctx, p, J, t) {
    // Bouquet : dans la main, puis déposé au pied de la tombe.
    const { h, d } = J;
    const gy = J.base[1];
    const placed = (p.setK ?? 0) > 0;
    const x = placed ? J.base[0] + d * h * 0.36 : J.handF[0], y = placed ? gy - h * 0.02 : J.handF[1] - h * 0.02;
    const a = placed ? d * 1.35 : -d * 0.2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.strokeStyle = "#3f9b4b";
    ctx.lineWidth = h * 0.006;
    for (let i = -1; i <= 1; i++) line(ctx, 0, h * 0.04, i * h * 0.025, -h * 0.07);
    ink(ctx, J, 0.004);
    for (let i = -1; i <= 1; i++) {
      dot(ctx, i * h * 0.025, -h * 0.08 - Math.abs(i) * h * 0.0, h * 0.022);
      paint(ctx, ["#ff6f91", "#ffffff", "#ffd84d"][i + 1]);
    }
    ctx.restore();
  },

  chains(ctx, p, J, t) {
    // Menottes et chaîne reliée à un boulet ; au moment où il tire fort, tout éclate.
    const { h, d } = J;
    const gy = J.base[1];
    const k = p.setK ?? 0;
    const ball = [J.base[0] + d * h * 0.3, gy - h * 0.06];
    const cuff = (pt) => {
      ink(ctx, J, 0.006);
      ctx.lineWidth = h * 0.014;
      ctx.strokeStyle = "#8d94a6";
      dot(ctx, pt[0], pt[1], h * 0.022);
      ctx.stroke();
    };
    const links = (a, b, n, jit = 0) => {
      for (let i = 0; i <= n; i++) {
        const u = i / n, x = a[0] + (b[0] - a[0]) * u + jit * sin(t * 40 + i), y = a[1] + (b[1] - a[1]) * u + h * 0.03 * sin(u * PI) * (jit ? 0 : 1);
        ink(ctx, J, 0.004);
        ctx.lineWidth = h * 0.008;
        ctx.strokeStyle = "#b9bfcc";
        ctx.beginPath();
        ctx.ellipse(x, y, h * 0.014, h * 0.009, i % 2 ? 0 : PI / 2, 0, PI * 2);
        ctx.stroke();
      }
    };
    ink(ctx, J);
    dot(ctx, ball[0], ball[1], h * 0.06);
    paint(ctx, "#3b3f4a");
    if (k < 1) {
      const mid = [(J.handF[0] + J.handB[0]) / 2, (J.handF[1] + J.handB[1]) / 2];
      links(mid, [ball[0], ball[1] - h * 0.05], 9, h * 0.003 * k);
      cuff(J.handF);
      cuff(J.handB);
      links(J.handF, J.handB, 3);
      return;
    }
    const s = k - 1;
    links([ball[0], ball[1] - h * 0.05], [ball[0] - d * h * 0.1, gy - h * 0.01], 3);
    cuff(J.handF);
    cuff(J.handB);
    if (s > 1.6) return;
    const o = [J.hip[0] + d * h * 0.16, J.hip[1] - h * 0.08];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2 + hash(i), v = h * (0.6 + hash(i + 3) * 0.6);
      const x = o[0] + cos(a) * v * s, y = o[1] + sin(a) * v * s * 0.7 + h * 0.9 * s * s;
      ctx.globalAlpha = 1 - s / 1.6;
      ctx.strokeStyle = "#b9bfcc";
      ctx.lineWidth = h * 0.008;
      ctx.beginPath();
      ctx.ellipse(x, y, h * 0.016, h * 0.01, a + s * 8, 0, PI * 2);
      ctx.stroke();
      if (i % 3 === 0) {
        ctx.fillStyle = "#ffd84d";
        starShape(ctx, x, y, h * 0.02, 4, 0.35, s * 5);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },

  cage(ctx, p, J) {
    // Barreaux de devant, cadre et anneau du haut.
    const { h } = J;
    const [bx, gy] = J.base;
    const w = h * 0.3, top = gy - h * 1.12;
    for (let i = 0; i <= 5; i++) {
      const x = bx - w + (i * 2 * w) / 5;
      rod(ctx, J, x, top, x, gy - h * 0.02, 0.012, "#4a4f5c");
    }
    ink(ctx, J);
    ctx.beginPath();
    ctx.roundRect(bx - w - h * 0.02, top - h * 0.02, 2 * w + h * 0.04, h * 0.035, h * 0.01);
    paint(ctx, "#4a4f5c");
    ctx.beginPath();
    ctx.moveTo(bx - w, top);
    ctx.quadraticCurveTo(bx, top - h * 0.3, bx + w, top);
    ctx.lineWidth = h * 0.02;
    ctx.stroke();
    ctx.strokeStyle = "#4a4f5c";
    ctx.lineWidth = h * 0.01;
    ctx.stroke();
    ink(ctx, J, 0.012);
    dot(ctx, bx, top - h * 0.19, h * 0.03);
    ctx.stroke();
  },

  megaphone(ctx, p, J, t) {
    // Mégaphone devant la bouche, ondes sonores qui partent devant.
    const { h, d } = J;
    const [x, y] = J.handF;
    const m = [x - d * h * 0.005, y - h * 0.03], e = [m[0] + d * h * 0.2, m[1] - h * 0.02];
    ink(ctx, J, 0.006);
    poly(ctx, [[m[0], m[1] - h * 0.02], [e[0], e[1] - h * 0.065], [e[0], e[1] + h * 0.065], [m[0], m[1] + h * 0.02]]);
    paint(ctx, "#f4f4f6");
    ctx.beginPath();
    ctx.ellipse(e[0], e[1], h * 0.02, h * 0.065, 0, 0, PI * 2);
    paint(ctx, "#ff3b4a");
    ctx.strokeStyle = "#ff8a3d";
    ctx.lineWidth = h * 0.012;
    for (let i = 0; i < 3; i++) {
      const u = (t * 1.2 + i / 3) % 1, r = h * (0.08 + u * 0.3);
      ctx.globalAlpha = 1 - u;
      ctx.beginPath();
      ctx.arc(e[0], e[1], r, d > 0 ? -0.6 : PI - 0.6, d > 0 ? 0.6 : PI + 0.6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
};

/** Fils de marionnette : des mains du manipulateur (A) vers la tête et les mains de l'autre (B). */
export function drawStrings(ctx, A, B, t) {
  const { h } = A;
  ctx.save();
  ctx.strokeStyle = "rgba(235,235,245,0.75)";
  ctx.lineWidth = Math.max(1, h * 0.004);
  // Croix de bois tenue par le manipulateur.
  const c = [(A.handF[0] + A.handB[0]) / 2, min(A.handF[1], A.handB[1]) - h * 0.02];
  ctx.fillStyle = "#8a6a48";
  ctx.fillRect(c[0] - h * 0.11, c[1] - h * 0.01, h * 0.22, h * 0.02);
  ctx.fillRect(c[0] - h * 0.01, c[1] - h * 0.06, h * 0.02, h * 0.12);
  const ends = [[c[0] - h * 0.1, c[1], B.handB], [c[0] + h * 0.1, c[1], B.handF], [c[0], c[1] - h * 0.05, [B.headC[0], B.headC[1] - B.headR]], [c[0], c[1] + h * 0.05, B.kneeF]];
  for (const [x, y, to] of ends) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + to[0]) / 2, (y + to[1]) / 2 + sin(t * 2) * h * 0.01, to[0], to[1]);
    ctx.stroke();
  }
  ctx.restore();
}
