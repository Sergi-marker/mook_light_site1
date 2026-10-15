// Rendu d'une image de la vidéo à l'instant t sur un canvas 2D.

import { poseAt, lerpPose, DUO_ACTIONS } from "./poses.js";
import { drawFigure } from "./figure.js";
import { sceneAt, rng } from "./script.js";

export const FORMATS = {
  "9:16": { w: 1080, h: 1920, label: "9:16 (TikTok, Reels, Shorts)" },
  "16:9": { w: 1920, h: 1080, label: "16:9 (YouTube)" },
  "1:1": { w: 1080, h: 1080, label: "1:1 (Instagram)" },
};

export const THEMES = {
  nuit: { label: ["Bleu nuit", "Nachtblau", "Midnight blue"], top: "#141533", mid: "#0c0d22", edge: "#030308", floor: "rgba(205,210,255,", tint: [40, 44, 110] },
  noir: { label: ["Noir", "Schwarz", "Black"], top: "#2a2a2c", mid: "#151516", edge: "#030303", floor: "rgba(235,235,240,", tint: [70, 70, 72] },
  sepia: { label: ["Sépia", "Sepia", "Sepia"], top: "#3a2c1f", mid: "#20170f", edge: "#070402", floor: "rgba(255,225,180,", tint: [110, 80, 50] },
  foret: { label: ["Forêt", "Wald", "Forest"], top: "#13291f", mid: "#0a1812", edge: "#020604", floor: "rgba(190,255,215,", tint: [30, 90, 60] },
  bordeaux: { label: ["Bordeaux", "Bordeaux", "Burgundy"], top: "#33121b", mid: "#1d0a10", edge: "#060203", floor: "rgba(255,200,210,", tint: [110, 30, 50] },
  aube: { label: ["Aube (clair)", "Morgen (hell)", "Dawn (light)"], top: "#4a4f7a", mid: "#2b2e52", edge: "#0b0c1c", floor: "rgba(255,240,220,", tint: [120, 120, 180] },
};

/** Géométrie de la mise en page selon le format. */
export function layout(W, H) {
  const portrait = H > W * 1.2, landscape = W > H * 1.2;
  return {
    groundY: H * (portrait ? 0.665 : landscape ? 0.86 : 0.8),
    figH: H * (portrait ? 0.25 : landscape ? 0.46 : 0.36),
    captionY: H * (portrait ? 0.29 : landscape ? 0.16 : 0.18),
    captionSize: Math.round(Math.min(W, H) * (portrait ? 0.068 : landscape ? 0.062 : 0.06)),
    captionWidth: W * (portrait ? 0.84 : 0.8),
  };
}

let noiseCache = null;
function noise(W, H) {
  if (noiseCache && noiseCache.width === W && noiseCache.height === H) return noiseCache;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const img = g.createImageData(W, H);
  const r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 14;
  }
  g.putImageData(img, 0, 0);
  noiseCache = c;
  return c;
}

function drawBackground(ctx, W, H, L, theme, t) {
  const th = THEMES[theme] ?? THEMES.nuit;
  const g = ctx.createRadialGradient(W / 2, H * 0.38, Math.min(W, H) * 0.05, W / 2, H * 0.45, Math.max(W, H) * 0.75);
  g.addColorStop(0, th.top);
  g.addColorStop(0.55, th.mid);
  g.addColorStop(1, th.edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Texture « papier / mur » légère qui bouge à peine.
  ctx.globalAlpha = 1;
  const n = noise(W, H);
  ctx.drawImage(n, 0, 0);
  // Faisceau du projecteur.
  const [tr, tg, tb] = th.tint;
  const cone = ctx.createLinearGradient(0, 0, 0, L.groundY);
  cone.addColorStop(0, `rgba(${tr},${tg},${tb},0)`);
  cone.addColorStop(1, `rgba(${tr},${tg},${tb},${0.16 + 0.02 * Math.sin(t * 0.7)})`);
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(W * 0.42, 0);
  ctx.lineTo(W * 0.58, 0);
  ctx.lineTo(W * 0.9, L.groundY);
  ctx.lineTo(W * 0.1, L.groundY);
  ctx.closePath();
  ctx.fill();
  // Sol lumineux (comme sur les vidéos d'exemple).
  const floor = ctx.createLinearGradient(0, L.groundY - H * 0.01, 0, L.groundY + H * 0.07);
  floor.addColorStop(0, `${th.floor}0)`);
  floor.addColorStop(0.15, `${th.floor}0.75)`);
  floor.addColorStop(0.35, `${th.floor}0.32)`);
  floor.addColorStop(1, `${th.floor}0)`);
  ctx.fillStyle = floor;
  ctx.fillRect(0, L.groundY - H * 0.01, W, H * 0.08);
  const glow = ctx.createRadialGradient(W / 2, L.groundY, 0, W / 2, L.groundY, W * 0.55);
  glow.addColorStop(0, `${th.floor}0.22)`);
  glow.addColorStop(1, `${th.floor}0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function wrapWords(ctx, words, maxW) {
  const lines = [];
  let cur = [];
  for (const w of words) {
    const test = [...cur, w].join(" ");
    if (cur.length && ctx.measureText(test).width > maxW) { lines.push(cur); cur = [w]; } else cur.push(w);
  }
  if (cur.length) lines.push(cur);
  return lines;
}

const FONT = '"Montserrat", "Arial Black", "Helvetica Neue", Arial, sans-serif';

/** Sous-titres animés. style : words (mot par mot), karaoke (mot surligné), full (phrase entière). */
function drawCaption(ctx, text, local, duration, W, H, L, settings, alpha) {
  const upper = settings.uppercase !== false;
  const words = (upper ? text.toUpperCase() : text).split(/\s+/).filter(Boolean);
  if (!words.length) return;
  const size = L.captionSize * (settings.captionScale ?? 1);
  ctx.save();
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const lines = wrapWords(ctx, words, L.captionWidth);
  const lineH = size * 1.18;
  const total = lines.length * lineH;
  const style = settings.captionStyle ?? "words";
  const wps = settings.wps ?? 2.4;
  const revealEnd = Math.min(duration * 0.75, words.length / (wps * 1.25));
  let wi = 0;
  lines.forEach((line, li) => {
    const lineText = line.join(" ");
    const lw = ctx.measureText(lineText).width;
    let x = W / 2 - lw / 2;
    const y = L.captionY - total / 2 + li * lineH + lineH / 2;
    for (const w of line) {
      const appear = (wi / Math.max(1, words.length)) * revealEnd;
      let a = alpha, scale = 1, color = "#ffffff";
      if (style === "words") {
        const k = Math.min(1, Math.max(0, (local - appear) / 0.18));
        a *= k;
        scale = 0.7 + 0.3 * (1 - Math.pow(1 - k, 3)) + (k < 1 ? 0.08 * Math.sin(k * Math.PI) : 0);
      } else if (style === "karaoke") {
        const next = ((wi + 1) / Math.max(1, words.length)) * revealEnd;
        if (local >= appear && local < next) color = settings.accent ?? "#ffd84d";
      }
      const ww = ctx.measureText(w).width;
      if (a > 0.001) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(x + ww / 2, y);
        ctx.scale(scale, scale);
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = size * 0.18;
        ctx.shadowOffsetY = size * 0.05;
        ctx.lineWidth = size * 0.12;
        ctx.strokeStyle = "#000";
        ctx.lineJoin = "round";
        ctx.strokeText(w, -ww / 2, 0);
        ctx.shadowColor = "transparent";
        ctx.fillStyle = color;
        ctx.fillText(w, -ww / 2, 0);
        ctx.restore();
      }
      x += ww + ctx.measureText(" ").width;
      wi++;
    }
  });
  ctx.restore();
}

function drawTitle(ctx, text, local, W, H, L, settings, alpha) {
  const k = Math.min(1, local / 0.6) * alpha;
  const size = L.captionSize * 1.35 * (settings.captionScale ?? 1);
  ctx.save();
  ctx.globalAlpha = k;
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = (settings.uppercase !== false ? text.toUpperCase() : text).split(/\s+/);
  const lines = wrapWords(ctx, words, L.captionWidth);
  const lineH = size * 1.15;
  const y0 = L.captionY - (lines.length * lineH) / 2 + lineH / 2;
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = size * 0.2;
  ctx.fillStyle = "#fff";
  lines.forEach((l, i) => ctx.fillText(l.join(" "), W / 2, y0 + i * lineH + (1 - k) * 20));
  ctx.shadowBlur = 0;
  ctx.fillStyle = settings.accent ?? "#ffd84d";
  const lw = W * 0.18 * Math.min(1, local / 0.9);
  ctx.fillRect(W / 2 - lw / 2, y0 + lines.length * lineH - lineH * 0.25, lw, size * 0.09);
  ctx.restore();
}

/** Poses des deux personnages pour un élément de la timeline à son temps local. */
function scenePoses(item, local) {
  const s = item.scene;
  const r = rng(s.seed)();
  const flip = !DUO_ACTIONS.has(s.action) && s.kind !== "title" && rng(s.seed + 11)() < 0.35 && s.action !== "walk" && s.action !== "run" && s.action !== "alone";
  const action = s.kind === "title" ? (s.action === "idle" ? "wave" : s.action) : s.action;
  const p0 = poseAt(action, local, r, 0);
  const duo = s.figures ? s.figures === 2 : DUO_ACTIONS.has(s.action);
  const p1 = duo ? poseAt(action, local + 0.37, (r * 7.3) % 1, 1) : null;
  return { p0, p1, duo, flip };
}

function orient(p, facing) {
  return { ...p, dir: (p.dir ?? 1) * facing, dx: (p.dx ?? 0) * facing };
}

/**
 * Dessine l'image à l'instant t.
 * project = { scenes, settings }, tl = timeline(project.scenes, wps).
 */
export function renderFrame(ctx, project, tl, t) {
  const { settings } = project;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const L = layout(W, H);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawBackground(ctx, W, H, L, settings.theme, t);
  const at = sceneAt(tl, Math.min(t, Math.max(0, tl.total - 1e-3)));
  if (!at) { ctx.restore(); return; }
  const { item, index, local } = at;
  const cur = scenePoses(item, local);
  // Transition douce depuis la fin de la scène précédente.
  const BLEND = 0.45;
  let k = 1, prev = null;
  if (index > 0 && local < BLEND) {
    const pi = tl.items[index - 1];
    prev = scenePoses(pi, pi.duration);
    k = local / BLEND;
    k = k * k * (3 - 2 * k);
  }

  // Caméra : léger zoom lent et dérive, différents à chaque scène.
  const rr = rng(item.scene.seed + 3);
  const zoomFrom = 1 + rr() * 0.04, zoomTo = zoomFrom + 0.03 + rr() * 0.04;
  const u = Math.min(1, local / item.duration);
  const zoom = zoomFrom + (zoomTo - zoomFrom) * u;
  const panX = (rr() - 0.5) * W * 0.03 * u;
  const cx = W / 2, cy = L.groundY - L.figH * 0.5;
  ctx.translate(cx + panX, cy);
  ctx.scale(zoom, zoom);
  ctx.translate(-cx, -cy);

  const chars = settings.characters ?? [{}, {}];
  const duoGap = Math.min(W * 0.17, L.figH * 0.62);
  // Ombres au sol.
  const shadow = (x, w) => {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, L.groundY + 2, w, w * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const duoNow = cur.duo, duoPrev = prev?.duo ?? duoNow;
  const duoAmt = prev ? (duoPrev ? 1 : 0) + ((duoNow ? 1 : 0) - (duoPrev ? 1 : 0)) * k : duoNow ? 1 : 0;
  const x0 = W / 2 - duoGap * duoAmt;
  const x1 = W / 2 + duoGap;

  // Personnage principal.
  const f0 = cur.flip ? -1 : 1, fPrev = prev?.flip ? -1 : 1;
  const a0 = orient(cur.p0, f0);
  let p0 = prev ? lerpPose(orient(prev.p0, fPrev), a0, k) : a0;
  p0 = { ...p0, time: t };
  shadow(x0 + (p0.dx ?? 0) * L.figH, L.figH * 0.16);
  // Second personnage (apparaît / disparaît en fondu).
  if (duoAmt > 0.01) {
    const src1 = cur.p1 ?? prev?.p1;
    const prev1 = prev?.p1 ?? src1;
    let p1 = prev && cur.p1 && prev.p1 ? lerpPose(orient(prev1, -1), orient(cur.p1, -1), k) : orient(src1, -1);
    p1 = { ...p1, time: t };
    ctx.save();
    ctx.globalAlpha = duoAmt;
    shadow(x1 + (p1.dx ?? 0) * L.figH, L.figH * 0.16);
    drawFigure(ctx, p1, chars[1], x1, L.groundY, L.figH);
    ctx.restore();
  }
  drawFigure(ctx, p0, chars[0], x0, L.groundY, L.figH);

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Filigrane.
  if (settings.handle) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = "#fff";
    ctx.font = `500 ${Math.round(L.captionSize * 0.5)}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const h = settings.handle.startsWith("@") ? settings.handle : `@${settings.handle}`;
    ctx.fillText(h, W * 0.04, L.groundY + H * 0.045);
    ctx.restore();
  }

  // Texte : fondu entrée / sortie.
  const fadeIn = Math.min(1, local / 0.2);
  const fadeOut = Math.min(1, (item.duration - local) / 0.25);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
  if (item.scene.kind === "title") drawTitle(ctx, item.scene.text, local, W, H, L, settings, alpha);
  else drawCaption(ctx, item.scene.text, local, item.duration, W, H, L, settings, alpha);

  if (settings.progressBar) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(0, H - H * 0.006, W, H * 0.006);
    ctx.fillStyle = settings.accent ?? "#ffd84d";
    ctx.fillRect(0, H - H * 0.006, W * Math.min(1, t / tl.total), H * 0.006);
  }
  ctx.restore();
}
