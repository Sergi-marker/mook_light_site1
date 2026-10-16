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
