// Rendu d'une image de la vidéo à l'instant t sur un canvas 2D.

import { poseAt, lerpPose, DUO_ACTIONS } from "./poses.js";
import { drawFigure, figureJoints } from "./figure.js";
import { sceneAt, rng, VOICE_LEAD, detectFx, detectTransition } from "./script.js";
import { drawSetBehind, drawSetFront, drawStrings } from "./scenery.js";

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
  energie: { label: ["Énergie (orange)", "Energie (orange)", "Energy (orange)"], top: "#4a2310", mid: "#24100a", edge: "#080302", floor: "rgba(255,190,140,", tint: [150, 70, 20] },
};

/** Décors dessinés derrière les personnages (silhouettes discrètes, dans la teinte du thème). */
export const BACKDROPS = {
  none: ["Aucun (projecteur)", "Keiner (Scheinwerfer)", "None (spotlight)"],
  room: ["Chambre", "Zimmer", "Room"],
  street: ["Rue de nuit", "Straße bei Nacht", "Night street"],
  park: ["Parc", "Park", "Park"],
  gym: ["Salle de sport", "Fitnessstudio", "Gym"],
  sky: ["Ciel étoilé", "Sternenhimmel", "Starry sky"],
  image: ["Mon image", "Mein Bild", "My image"],
};

export const CAMERAS = {
  auto: ["Auto (varié)", "Auto (abwechselnd)", "Auto (varied)"],
  wide: ["Plan large", "Totale", "Wide shot"],
  close: ["Gros plan", "Nahaufnahme", "Close-up"],
  zoomIn: ["Zoom avant", "Zoom hinein", "Zoom in"],
  zoomOut: ["Zoom arrière", "Zoom heraus", "Zoom out"],
};

/** Effets de mise en scène d'une scène. */
export const EFFECTS = {
  auto: ["Effet auto (selon le texte)", "Effekt automatisch", "Auto effect (from text)"],
  none: ["Aucun effet", "Kein Effekt", "No effect"],
  slow: ["Ralenti dramatique", "Dramatische Zeitlupe", "Dramatic slow motion"],
  flash: ["Flash + choc", "Blitz + Schock", "Flash + impact"],
  shake: ["Tremblement d'écran", "Bildschirm wackelt", "Screen shake"],
  spot: ["Projecteur qui suit", "Folgender Scheinwerfer", "Follow spotlight"],
  dark: ["La lumière s'éteint", "Das Licht geht aus", "Lights go out"],
};

/** Transitions à l'entrée d'une scène. */
export const TRANSITIONS = {
  auto: ["Transition auto", "Übergang automatisch", "Auto transition"],
  cut: ["Enchaînement direct", "Direkter Übergang", "Direct"],
  fade: ["Fondu enchaîné", "Überblendung", "Crossfade"],
  black: ["Fondu au noir", "Abblende ins Schwarze", "Fade to black"],
  slide: ["Glissement", "Wischen", "Slide"],
  zoom: ["Zoom", "Zoom", "Zoom"],
  flash: ["Flash blanc", "Weißer Blitz", "White flash"],
};

export const POSITIONS = {
  auto: ["Auto", "Auto", "Auto"],
  left: ["À gauche", "Links", "Left"],
  center: ["Au centre", "Mitte", "Center"],
  right: ["À droite", "Rechts", "Right"],
};

/** Polices des sous-titres (chargées depuis Google Fonts dans index.html). */
export const FONTS = {
  montserrat: { label: "Montserrat", css: '900 {size}px "Montserrat", "Arial Black", sans-serif' },
  anton: { label: "Anton", css: '400 {size}px "Anton", "Impact", sans-serif' },
  bebas: { label: "Bebas Neue", css: '400 {size}px "Bebas Neue", "Impact", sans-serif', scale: 1.15 },
  bangers: { label: "Bangers (BD)", css: '400 {size}px "Bangers", "Comic Sans MS", cursive' },
  marker: { label: "Permanent Marker", css: '400 {size}px "Permanent Marker", "Comic Sans MS", cursive', scale: 0.9 },
  poppins: { label: "Poppins", css: '800 {size}px "Poppins", "Arial", sans-serif' },
  serif: { label: "Playfair (élégant)", css: '800 {size}px "Playfair Display", Georgia, serif', scale: 0.95 },
};

export function fontCss(id, size) {
  const f = FONTS[id] ?? FONTS.montserrat;
  return f.css.replace("{size}", String(Math.round(size * (f.scale ?? 1))));
}

/** Couleur d'étiquette de chaque personnage (nom au-dessus de sa réplique). */
const SPEAKER_COLORS = ["#8fd0ff", "#ffb3c7"];

/** Géométrie de la mise en page selon le format et la position des sous-titres. */
export function layout(W, H, captionPos = "top") {
  const portrait = H > W * 1.2, landscape = W > H * 1.2;
  const groundY = H * (portrait ? 0.665 : landscape ? 0.86 : 0.8);
  const topY = H * (portrait ? 0.29 : landscape ? 0.16 : 0.18);
  const captionY = captionPos === "bottom" ? (portrait ? groundY + H * 0.13 : H * 0.93) : captionPos === "middle" ? H * (portrait ? 0.36 : 0.3) : topY;
  return {
    groundY,
    figH: H * (portrait ? 0.25 : landscape ? 0.46 : 0.36),
    captionY,
    captionSize: Math.round(Math.min(W, H) * (portrait ? 0.068 : landscape ? 0.062 : 0.06)),
    captionWidth: W * (portrait ? 0.84 : 0.8),
    portrait,
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

// Images de l'utilisateur (décor, logo), décodées une fois.
const images = new Map();
function image(src) {
  if (!src) return null;
  let e = images.get(src);
  if (!e) {
    const img = new Image();
    e = { img, ok: false };
    img.onload = () => { e.ok = true; };
    img.src = src;
    images.set(src, e);
  }
  return e.ok ? e.img : null;
}

/** Précharge une image (avant un export) ; résout quand elle est prête. */
export function preloadImage(src) {
  if (!src) return Promise.resolve();
  image(src);
  const e = images.get(src);
  return e.ok ? Promise.resolve() : new Promise((r) => { e.img.addEventListener("load", r, { once: true }); e.img.addEventListener("error", r, { once: true }); });
}

// Le décor ne bouge pas : il est dessiné une fois puis réutilisé (gros gain de vitesse à l'export).
const bgCache = new Map();
function drawBackground(ctx, W, H, L, theme, t, backdrop, bgImage) {
  const imgReady = backdrop === "image" && !!image(bgImage);
  const key = `${W}x${H}|${L.groundY}|${theme}|${backdrop}|${imgReady ? bgImage.length + bgImage.slice(-32) : ""}`;
  let c = bgCache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    paintBackground(c.getContext("2d"), W, H, L, theme, backdrop, bgImage);
    if (bgCache.size > 6) bgCache.delete(bgCache.keys().next().value);
    bgCache.set(key, c);
  }
  ctx.drawImage(c, 0, 0);
}

function paintBackground(ctx, W, H, L, theme, backdrop, bgImage) {
  const t = 0;
  const th = THEMES[theme] ?? THEMES.nuit;
  const g = ctx.createRadialGradient(W / 2, H * 0.38, Math.min(W, H) * 0.05, W / 2, H * 0.45, Math.max(W, H) * 0.75);
  g.addColorStop(0, th.top);
  g.addColorStop(0.55, th.mid);
  g.addColorStop(1, th.edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const img = backdrop === "image" ? image(bgImage) : null;
  if (img) {
    // Image en plein cadre, assombrie pour que le personnage et le texte restent lisibles.
    const s = Math.max(W / img.width, H / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.fillStyle = "rgba(4,4,12,0.5)";
    ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H * 0.45, Math.max(W, H) * 0.7);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.drawImage(noise(W, H), 0, 0);
    if (backdrop && backdrop !== "none" && backdrop !== "image") drawBackdrop(ctx, W, H, L, th, backdrop, t);
  }

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
  // Sol lumineux.
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

/** Décors en silhouettes : présents mais discrets, pour ne pas voler la vedette au personnage. */
function drawBackdrop(ctx, W, H, L, th, kind, t) {
  const gy = L.groundY;
  const ink = `${th.floor}0.10)`, ink2 = `${th.floor}0.18)`, light = `${th.floor}0.35)`;
  const S = Math.min(W, H);
  ctx.save();
  if (kind === "room") {
    // Fenêtre avec clair de lune, cadre, lampe sur pied.
    const ww = S * 0.42, wh = S * 0.5, wx = W * 0.5 - ww * 1.05, wy = gy - wh - H * 0.12;
    ctx.fillStyle = ink2;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.strokeStyle = `${th.floor}0.28)`;
    ctx.lineWidth = S * 0.012;
    ctx.strokeRect(wx, wy, ww, wh);
    ctx.beginPath();
    ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
    ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2);
    ctx.stroke();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(wx + ww * 0.72, wy + wh * 0.25, S * 0.04, 0, Math.PI * 2);
    ctx.fill();
    // Cadre au mur.
    ctx.strokeStyle = `${th.floor}0.2)`;
    ctx.strokeRect(W * 0.66, gy - S * 0.62, S * 0.16, S * 0.2);
    // Lampe.
    ctx.fillStyle = ink2;
    ctx.fillRect(W * 0.86, gy - S * 0.45, S * 0.012, S * 0.45);
    ctx.beginPath();
    ctx.moveTo(W * 0.86 - S * 0.06, gy - S * 0.45);
    ctx.lineTo(W * 0.86 + S * 0.07, gy - S * 0.45);
    ctx.lineTo(W * 0.86 + S * 0.04, gy - S * 0.55);
    ctx.lineTo(W * 0.86 - S * 0.03, gy - S * 0.55);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "street") {
    // Immeubles avec fenêtres allumées, réverbère.
    const r = rng(42);
    let x = -S * 0.05;
    while (x < W) {
      const bw = S * (0.16 + r() * 0.14), bh = S * (0.35 + r() * 0.5);
      ctx.fillStyle = ink;
      ctx.fillRect(x, gy - bh, bw, bh);
      for (let wy = gy - bh + S * 0.04; wy < gy - S * 0.08; wy += S * 0.07) {
        for (let wx = x + S * 0.025; wx < x + bw - S * 0.04; wx += S * 0.05) {
          if (r() < 0.3) { ctx.fillStyle = `${th.floor}${0.12 + 0.1 * r()})`; ctx.fillRect(wx, wy, S * 0.025, S * 0.035); }
        }
      }
      x += bw + S * 0.02;
    }
    ctx.fillStyle = ink2;
    ctx.fillRect(W * 0.12, gy - S * 0.62, S * 0.014, S * 0.62);
    ctx.fillRect(W * 0.12, gy - S * 0.62, S * 0.08, S * 0.012);
    const lamp = ctx.createRadialGradient(W * 0.12 + S * 0.075, gy - S * 0.6, 0, W * 0.12 + S * 0.075, gy - S * 0.6, S * 0.25);
    lamp.addColorStop(0, `${th.floor}0.35)`);
    lamp.addColorStop(1, `${th.floor}0)`);
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, W, gy);
  } else if (kind === "park") {
    const tree = (x, s) => {
      ctx.fillStyle = ink2;
      ctx.fillRect(x - S * 0.012 * s, gy - S * 0.3 * s, S * 0.024 * s, S * 0.3 * s);
      ctx.fillStyle = ink;
      for (const [ox, oy, rr] of [[0, -0.42, 0.14], [-0.09, -0.34, 0.1], [0.09, -0.34, 0.1], [0, -0.3, 0.11]]) {
        ctx.beginPath();
        ctx.arc(x + ox * S * s, gy + oy * S * s, rr * S * s, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    tree(W * 0.12, 1.1); tree(W * 0.88, 0.95); tree(W * 0.72, 0.6); tree(W * 0.3, 0.55);
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(W * 0.78, gy - S * 0.85, S * 0.05, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "gym") {
    ctx.strokeStyle = ink2;
    ctx.lineWidth = S * 0.01;
    // Espalier.
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(W * 0.04, gy - i * S * 0.07);
      ctx.lineTo(W * 0.04 + S * 0.22, gy - i * S * 0.07);
      ctx.stroke();
    }
    ctx.fillStyle = ink2;
    // Râtelier d'haltères.
    const rx = W - S * 0.32;
    ctx.fillRect(rx, gy - S * 0.22, S * 0.28, S * 0.015);
    ctx.fillRect(rx, gy - S * 0.12, S * 0.28, S * 0.015);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(rx + S * 0.035 + i * S * 0.07, gy - S * 0.24, S * 0.025, 0, Math.PI * 2);
      ctx.arc(rx + S * 0.035 + i * S * 0.07, gy - S * 0.14, S * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
    // Miroir.
    ctx.strokeRect(W * 0.38, gy - S * 0.7, S * 0.3, S * 0.4);
  } else if (kind === "sky") {
    const r = rng(9);
    for (let i = 0; i < 90; i++) {
      const x = r() * W, y = r() * gy * 0.85, tw = 0.5 + 0.5 * Math.sin(t * (1 + r() * 2) + i);
      ctx.fillStyle = `${th.floor}${0.15 + 0.35 * tw * r()})`;
      ctx.beginPath();
      ctx.arc(x, y, S * (0.002 + r() * 0.004), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(W * 0.75, gy - S * 0.95, S * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = THEMES.nuit.mid;
    ctx.beginPath();
    ctx.arc(W * 0.75 + S * 0.025, gy - S * 0.95 - S * 0.015, S * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function wrapWords(ctx, words, maxW) {
  const lines = [];
  let cur = [];
  for (const w of words) {
    const test = [...cur.map((c) => c.text), w.text].join(" ");
    if (cur.length && ctx.measureText(test).width > maxW) { lines.push(cur); cur = [w]; } else cur.push(w);
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/** Mots du sous-titre ; les passages entre *étoiles* sont mis en couleur. */
export function captionWords(text, upper = true) {
  const out = [];
  let hot = false;
  for (const raw of String(text).split(/\s+/).filter(Boolean)) {
    let w = raw;
    let open = false, close = false;
    if (w.startsWith("*")) { open = true; w = w.slice(1); }
    if (/\*[.,!?…;:»"”)]*$/.test(w)) { close = true; w = w.replace(/\*([.,!?…;:»"”)]*)$/, "$1"); }
    if (open) hot = true;
    w = w.replace(/\*/g, "");
    if (w) out.push({ text: upper ? w.toUpperCase() : w, hot });
    if (close) hot = false;
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Sous-titres animés.
 * style : words (mot par mot), karaoke (mot prononcé en couleur), full (phrase entière).
 * box : none, box (bandeau sombre derrière le texte), word (pastille de couleur sous le mot prononcé).
 */
function drawCaption(ctx, scene, local, duration, W, H, L, settings, alpha, voiceDur = null) {
  const words = captionWords(scene.text, settings.uppercase !== false);
  if (!words.length) return;
  const size = L.captionSize * (settings.captionScale ?? 1);
  const accent = settings.accent ?? "#ffd84d";
  const textColor = settings.captionColor ?? "#ffffff";
  ctx.save();
  ctx.font = fontCss(settings.captionFont, size);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const lines = wrapWords(ctx, words, L.captionWidth);
  const lineH = size * 1.2;
  const total = lines.length * lineH;
  const style = settings.captionStyle ?? "words";
  const box = settings.captionBox ?? "none";
  const wps = settings.wps ?? 2.4;
  // Moment d'apparition de chaque mot : proportionnel au nombre de lettres déjà prononcées,
  // calé sur la voix off quand elle existe, sinon sur la vitesse de lecture.
  const lead = voiceDur != null ? VOICE_LEAD : 0;
  const span = voiceDur != null ? voiceDur * 0.94 : Math.min(duration * 0.75, words.length / (wps * 1.25));
  const weights = words.map((w) => w.text.length + 2);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const starts = [];
  weights.reduce((acc, w) => { starts.push(lead + (acc / totalW) * span); return acc + w; }, 0);
  starts.push(lead + span);
  const space = ctx.measureText(" ").width;
  const top = L.captionY - total / 2;

  // Nom de celui qui parle (dialogues).
  if (scene.speakerName && settings.speakerLabels !== false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = fontCss("montserrat", size * 0.5);
    ctx.textAlign = "center";
    ctx.fillStyle = SPEAKER_COLORS[scene.speaker] ?? accent;
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = size * 0.15;
    ctx.fillText(scene.speakerName.toUpperCase(), W / 2, top - size * 0.55);
    ctx.restore();
  }

  if (box === "box") {
    const maxW = Math.max(...lines.map((l) => ctx.measureText(l.map((w) => w.text).join(" ")).width));
    ctx.save();
    ctx.globalAlpha = alpha * 0.62;
    ctx.fillStyle = "#05050c";
    roundRect(ctx, W / 2 - maxW / 2 - size * 0.4, top - size * 0.25, maxW + size * 0.8, total + size * 0.5, size * 0.3);
    ctx.fill();
    ctx.restore();
  }

  let wi = 0;
  lines.forEach((line, li) => {
    const lw = ctx.measureText(line.map((w) => w.text).join(" ")).width;
    let x = W / 2 - lw / 2;
    const y = top + li * lineH + lineH / 2;
    for (const w of line) {
      const appear = starts[wi], next = starts[wi + 1];
      const speaking = local >= appear && local < next;
      let a = alpha, scale = 1, color = w.hot ? accent : textColor;
      if (style === "words") {
        const k = Math.min(1, Math.max(0, (local - appear) / 0.18));
        a *= k;
        scale = 0.7 + 0.3 * (1 - Math.pow(1 - k, 3)) + (k < 1 ? 0.08 * Math.sin(k * Math.PI) : 0);
      } else if (style === "karaoke" && speaking) {
        color = accent;
      }
      const ww = ctx.measureText(w.text).width;
      if (a > 0.001) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(x + ww / 2, y);
        ctx.scale(scale, scale);
        if (box === "word" && speaking) {
          ctx.fillStyle = accent;
          roundRect(ctx, -ww / 2 - size * 0.14, -size * 0.6, ww + size * 0.28, size * 1.16, size * 0.18);
          ctx.fill();
          color = "#14120a";
        }
        if (box !== "word" || !speaking) {
          ctx.shadowColor = "rgba(0,0,0,0.85)";
          ctx.shadowBlur = size * 0.18;
          ctx.shadowOffsetY = size * 0.05;
          ctx.lineWidth = size * 0.12;
          ctx.strokeStyle = "#000";
          ctx.lineJoin = "round";
          ctx.strokeText(w.text, -ww / 2, 0);
          ctx.shadowColor = "transparent";
        }
        ctx.fillStyle = color;
        ctx.fillText(w.text, -ww / 2, 0);
        ctx.restore();
      }
      x += ww + space;
      wi++;
    }
  });
  ctx.restore();
}

function drawTitle(ctx, scene, local, W, H, L, settings, alpha) {
  const k = Math.min(1, local / 0.6) * alpha;
  const size = L.captionSize * 1.35 * (settings.captionScale ?? 1);
  ctx.save();
  ctx.globalAlpha = k;
  ctx.font = fontCss(settings.captionFont, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = captionWords(scene.text, settings.uppercase !== false);
  const lines = wrapWords(ctx, words, L.captionWidth);
  const lineH = size * 1.15;
  const y0 = L.captionY - (lines.length * lineH) / 2 + lineH / 2;
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = size * 0.2;
  lines.forEach((l, i) => {
    // Ligne mot par mot pour garder les *mots* en couleur.
    const full = l.map((w) => w.text).join(" ");
    let x = W / 2 - ctx.measureText(full).width / 2;
    ctx.textAlign = "left";
    for (const w of l) {
      ctx.fillStyle = w.hot ? settings.accent ?? "#ffd84d" : settings.captionColor ?? "#fff";
      ctx.fillText(w.text, x, y0 + i * lineH + (1 - k) * 20);
      x += ctx.measureText(`${w.text} `).width;
    }
  });
  ctx.shadowBlur = 0;
  ctx.fillStyle = settings.accent ?? "#ffd84d";
  const lw = W * 0.18 * Math.min(1, local / 0.9);
  ctx.fillRect(W / 2 - lw / 2, y0 + lines.length * lineH - lineH * 0.25, lw, size * 0.09);
  ctx.restore();
}

/** Accroche d'ouverture : gros texte qui « frappe » (zoom + léger tremblement) pour retenir dès la 1re seconde. */
function drawHook(ctx, scene, local, W, H, L, settings, alpha) {
  const size = L.captionSize * 1.55 * (settings.captionScale ?? 1);
  const punch = local < 0.35 ? 1.35 - 0.35 * (local / 0.35) : 1 + 0.015 * Math.sin(local * 9);
  const shake = local < 0.5 ? (1 - local / 0.5) * size * 0.04 * Math.sin(local * 80) : 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2 + shake, L.captionY);
  ctx.scale(punch, punch);
  ctx.font = fontCss(settings.captionFont, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = captionWords(scene.text, true);
  const lines = wrapWords(ctx, words, L.captionWidth * 0.95);
  const lineH = size * 1.12;
  lines.forEach((l, i) => {
    const y = (i - (lines.length - 1) / 2) * lineH;
    const full = l.map((w) => w.text).join(" ");
    let x = -ctx.measureText(full).width / 2;
    ctx.textAlign = "left";
    for (const w of l) {
      ctx.lineWidth = size * 0.14;
      ctx.strokeStyle = "#000";
      ctx.lineJoin = "round";
      ctx.strokeText(w.text, x, y);
      ctx.fillStyle = w.hot || l === lines[0] ? settings.accent ?? "#ffd84d" : "#fff";
      ctx.fillText(w.text, x, y);
      x += ctx.measureText(`${w.text} `).width;
    }
  });
  ctx.restore();
}

/** Écran de fin : appel à s'abonner avec la signature de la chaîne. */
function drawOutro(ctx, scene, local, W, H, L, settings, alpha) {
  const size = L.captionSize * 1.2 * (settings.captionScale ?? 1);
  const k = Math.min(1, local / 0.5);
  ctx.save();
  ctx.globalAlpha = alpha * k;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = fontCss(settings.captionFont, size);
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = size * 0.2;
  ctx.fillStyle = "#fff";
  const words = captionWords(scene.text, settings.uppercase !== false);
  const lines = wrapWords(ctx, words, L.captionWidth);
  lines.forEach((l, i) => ctx.fillText(l.map((w) => w.text).join(" "), W / 2, L.captionY + (i - (lines.length - 1) / 2) * size * 1.15));
  const handle = settings.handle ? (settings.handle.startsWith("@") ? settings.handle : `@${settings.handle}`) : "";
  // Bouton « s'abonner » qui pulse.
  const by = L.captionY + (lines.length / 2) * size * 1.15 + size * 0.9;
  const pulse = 1 + 0.05 * Math.sin(local * 6);
  ctx.save();
  ctx.translate(W / 2, by);
  ctx.scale(pulse, pulse);
  ctx.font = fontCss("montserrat", size * 0.55);
  const label = handle || "♥";
  const bw = ctx.measureText(label).width + size * 1.2;
  ctx.shadowBlur = 0;
  ctx.fillStyle = settings.accent ?? "#ffd84d";
  roundRect(ctx, -bw / 2, -size * 0.45, bw, size * 0.9, size * 0.45);
  ctx.fill();
  ctx.fillStyle = "#14120a";
  ctx.fillText(label, 0, size * 0.03);
  ctx.restore();
  ctx.restore();
}

function drawLogo(ctx, W, H, settings) {
  const img = image(settings.logo);
  if (!img) return;
  const S = Math.min(W, H) * (settings.logoSize ?? 0.14);
  const s = S / Math.max(img.width, img.height);
  const w = img.width * s, h = img.height * s, m = Math.min(W, H) * 0.04;
  const pos = settings.logoPos ?? "tr";
  const x = pos.includes("l") ? m : W - w - m;
  const y = pos.includes("t") ? m + (H > W ? H * 0.04 : 0) : H - h - m - (H > W ? H * 0.12 : 0);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

const TALKING_FACES = new Set(["neutral", "happy", "talk", "angry", "closed"]);

/** Bouche qui bouge pendant que le personnage parle (dialogue). */
function talking(p, local, voiceStart, voiceEnd) {
  if (local < voiceStart || local > voiceEnd || !TALKING_FACES.has(p.face)) return p;
  const m = Math.abs(Math.sin(local * 11)) * 0.7 + Math.abs(Math.sin(local * 4.3)) * 0.3;
  return { ...p, face: p.face === "angry" ? "angry" : "talk", mouthOpen: m };
}

/** Poses des deux personnages pour un élément de la timeline à son temps local. */
function scenePoses(item, localIn) {
  const s = item.scene;
  // Ralenti : les gestes vont deux fois moins vite.
  const local = sceneFx(s) === "slow" ? localIn * 0.45 : localIn;
  const r = rng(s.seed)();
  const action = s.kind === "title" || s.kind === "outro" ? (s.action === "idle" ? "wave" : s.action) : s.kind === "pause" ? "idle" : s.action;
  const duo = s.figures ? s.figures === 2 : DUO_ACTIONS.has(action);
  const pos = s.pos && s.pos !== "auto" ? s.pos : null;
  const flip = !duo && !pos && s.kind !== "title" && rng(s.seed + 11)() < 0.35 && !["walk", "run", "alone"].includes(action);
  // L'acteur joue l'action ; l'autre personnage réagit (rôle 2 des actions à deux) ou écoute.
  const actor = livelyPose(action, local, r, 0);
  const other = duo ? livelyPose(DUO_ACTIONS.has(action) || action === "speak" ? action : "listen", local + 0.37, (r * 7.3) % 1, 1) : null;
  let p0 = actor, p1 = other;
  if (duo && s.speaker === 1) { p0 = other; p1 = actor; }
  // Celui qui parle remue la bouche pendant sa réplique.
  if (s.speaker === 0 || s.speaker === 1) {
    const vs = VOICE_LEAD, ve = item.voiceDur != null ? VOICE_LEAD + item.voiceDur : item.duration * 0.8;
    if (s.speaker === 0) p0 = talking(p0, localIn, vs, ve);
    else if (p1) p1 = talking(p1, localIn, vs, ve);
  }
  return { p0, p1, duo, flip, pos };
}

/**
 * Pose avec mouvement secondaire : la tête et les bras suivent le buste avec un petit retard
 * (inertie), et le corps s'étire en montant / s'écrase en retombant.
 */
function livelyPose(action, local, r, role) {
  const p = poseAt(action, local, r, role);
  const DT = 0.1;
  const q = poseAt(action, local - DT, r, role);
  const dLean = p.lean - q.lean;
  const vLift = (p.lift - q.lift) / DT;
  return {
    ...p,
    head: p.head - dLean * 1.6,
    shF: p.shF - dLean * 1.2,
    shB: p.shB - dLean * 1.2,
    stretch: vLift * 0.5,
  };
}

/** Courbe avec léger dépassement (le geste va un peu trop loin puis se pose). */
function easeOutBack(x, c = 1.25) {
  const y = x - 1;
  return 1 + (c + 1) * y * y * y + c * y * y;
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function orient(p, facing) {
  return { ...p, dir: (p.dir ?? 1) * facing, dx: (p.dx ?? 0) * facing };
}

/** Position horizontale du personnage seul. */
function soloX(W, pos) {
  return pos === "left" ? W * 0.3 : pos === "right" ? W * 0.7 : W / 2;
}

/** Caméra de la scène : zoom et point visé. */
function camera(item, local, W, H, L, focusX) {
  const s = item.scene;
  const u = smooth(Math.min(1, local / item.duration));
  const headY = L.groundY - L.figH * 0.82;
  const midY = L.groundY - L.figH * 0.5;
  switch (s.camera) {
    case "wide": return { zoom: 0.86 + 0.02 * u, x: W / 2, y: midY };
    case "close": return { zoom: 1.75 + 0.06 * u, x: focusX, y: headY };
    case "zoomIn": return { zoom: 1 + 0.6 * u, x: W / 2 + (focusX - W / 2) * u, y: midY + (headY - midY) * u };
    case "zoomOut": return { zoom: 1.6 - 0.6 * u, x: focusX + (W / 2 - focusX) * u, y: headY + (midY - headY) * u };
    default: {
      // Auto : léger zoom lent et dérive, différents à chaque scène.
      const rr = rng(s.seed + 3);
      const zoomFrom = 1 + rr() * 0.04, zoomTo = zoomFrom + 0.03 + rr() * 0.04;
      return { zoom: zoomFrom + (zoomTo - zoomFrom) * u, x: W / 2 + (rr() - 0.5) * W * 0.03 * u, y: midY };
    }
  }
}

// Effet et transition déduits du texte (gardés en mémoire : le texte ne change pas d'une image à l'autre).
const fxCache = new Map();
function autoOf(text) {
  let v = fxCache.get(text);
  if (!v) {
    if (fxCache.size > 500) fxCache.clear();
    v = { fx: detectFx(text), tr: detectTransition(text) };
    fxCache.set(text, v);
  }
  return v;
}

/** Effet de la scène : choisi dans l'éditeur, sinon déduit du texte ou de l'action. */
export function sceneFx(s) {
  if (s.fx && s.fx !== "auto") return EFFECTS[s.fx] ? s.fx : "none";
  if (s.kind !== "scene") return "none";
  const fx = autoOf(s.text ?? "").fx;
  if (fx) return fx;
  if (s.action === "explode") return "shake";
  if (s.action === "lamppost" || s.action === "stargaze") return "spot";
  return "none";
}

/** Transition à l'entrée de la scène (réglage de la scène, sinon réglage général, sinon déduite). */
export function sceneTransition(item, prevItem, settings = {}) {
  if (!prevItem) return "cut";
  const s = item.scene;
  if (s.transition && s.transition !== "auto") return TRANSITIONS[s.transition] ? s.transition : "cut";
  const g = settings.transition;
  if (g && g !== "auto") return TRANSITIONS[g] ? g : "cut";
  // Auto : fondu au noir pour un saut dans le temps, fondu sur les titres et pauses, sinon enchaînement.
  const tr = s.kind === "scene" || s.kind === "hook" ? autoOf(s.text ?? "").tr : null;
  if (tr) return tr;
  if (s.kind === "title" || prevItem.scene.kind === "title" || s.kind === "outro") return "fade";
  if (s.kind === "pause" || prevItem.scene.kind === "pause") return "black";
  return "cut";
}

const TRANSITION_TIME = { fade: 0.6, black: 0.45, slide: 0.55, zoom: 0.5, flash: 0.4 };

// Toiles hors écran pour les transitions qui mélangent deux images.
const buffers = {};
function buffer(key, w, h) {
  let c = buffers[key];
  if (!c) {
    if (typeof OffscreenCanvas !== "undefined") c = new OffscreenCanvas(w, h);
    else if (typeof document !== "undefined") c = document.createElement("canvas");
    else return null;
    buffers[key] = c;
  }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}

/**
 * Dessine l'image à l'instant t, avec la transition d'entrée de la scène.
 * project = { scenes, settings }, tl = timeline(scènes, wps).
 */
export function renderFrame(ctx, project, tl, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const tt = Math.min(t, Math.max(0, tl.total - 1e-3));
  const at = sceneAt(tl, tt);
  if (at && at.index > 0) {
    const prevItem = tl.items[at.index - 1];
    const tr = sceneTransition(at.item, prevItem, project.settings);
    const D = TRANSITION_TIME[tr] ?? 0;
    if (D && at.local < D) {
      const u = at.local / D;
      if (tr === "black") {
        drawScene(ctx, project, tl, t);
        return overlay(ctx, "#000", 1 - smooth(u));
      }
      if (tr === "flash") {
        drawScene(ctx, project, tl, t);
        return overlay(ctx, "#fff", (1 - u) ** 2 * 0.95);
      }
      const a = buffer("a", W, H), b = buffer("b", W, H);
      if (a && b) {
        drawScene(a.getContext("2d"), project, tl, prevItem.start + prevItem.duration - 1e-3);
        drawScene(b.getContext("2d"), project, tl, t);
        const k = smooth(u);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (tr === "fade") {
          ctx.drawImage(a, 0, 0);
          ctx.globalAlpha = k;
          ctx.drawImage(b, 0, 0);
        } else if (tr === "slide") {
          // L'image suivante pousse la précédente (comme une caméra qui suit le personnage).
          ctx.drawImage(a, -W * k, 0);
          ctx.drawImage(b, W * (1 - k), 0);
        } else if (tr === "zoom") {
          const z = 1 + 0.5 * k;
          ctx.drawImage(a, W / 2 - (W * z) / 2, H / 2 - (H * z) / 2, W * z, H * z);
          ctx.globalAlpha = k;
          const z2 = 1.25 - 0.25 * k;
          ctx.drawImage(b, W / 2 - (W * z2) / 2, H / 2 - (H * z2) / 2, W * z2, H * z2);
        }
        ctx.restore();
        return;
      }
    }
  }
  drawScene(ctx, project, tl, t);
  // Fondu au noir : la fin de la scène s'assombrit avant la suivante.
  if (at && at.index < tl.items.length - 1) {
    const next = tl.items[at.index + 1];
    const left = at.item.duration - at.local;
    if (left < 0.35 && sceneTransition(next, at.item, project.settings) === "black") overlay(ctx, "#000", 1 - left / 0.35);
  }
}

function overlay(ctx, color, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** Miroir à côté du personnage : son reflet (qui, lui, ne sourit pas). */
function drawMirror(ctx, p, morph, x, L, look, J) {
  const { h, d } = J;
  const gy = L.groundY;
  const edge = x + d * h * 0.3, w = h * 0.85;
  const left = d > 0 ? edge : edge - w, top = gy - h * 1.2;
  const fx = x + (p.dx ?? 0) * L.figH;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, top, w, h * 1.17, h * 0.08);
  const g = ctx.createLinearGradient(left, top, left + w, top + h);
  g.addColorStop(0, "rgba(120,140,190,0.35)");
  g.addColorStop(1, "rgba(60,70,110,0.35)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  ctx.globalAlpha = 0.6;
  const mirrored = { ...p, dir: -(p.dir ?? 1), dx: 0, set: null, symbol: null, face: "sad", look: -0.6, head: (p.head ?? 0) + 0.25, shF: 0.1, elF: 0 };
  drawFigure(ctx, mirrored, morph, 2 * edge - fx, gy, L.figH, { ...look, glow: null });
  ctx.globalAlpha = 1;
  // Reflet lumineux en diagonale.
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(left + w * 0.15, top);
  ctx.lineTo(left + w * 0.4, top);
  ctx.lineTo(left + w * 0.05, top + h * 0.6);
  ctx.lineTo(left - w * 0.2, top + h * 0.6);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#c9b27a";
  ctx.lineWidth = h * 0.025;
  ctx.beginPath();
  ctx.roundRect(left, top, w, h * 1.17, h * 0.08);
  ctx.stroke();
}

/** Tremblement de caméra (pixels) : choc au début de la scène, ou au moment de l'explosion. */
function shakeOffset(fx, action, local, W) {
  let s = 0;
  if (fx === "flash") s = Math.max(0, 1 - local / 0.6);
  else if (fx === "shake") {
    const t0 = action === "explode" ? 1.1 : 0;
    s = local < t0 ? 0 : Math.max(0, 1 - (local - t0) / 0.9);
  }
  if (!s) return [0, 0];
  const a = W * 0.012 * s * s;
  return [Math.sin(local * 71) * a, Math.cos(local * 53) * a];
}

/**
 * Dessine une scène à l'instant t (sans transition d'entrée).
 * project = { scenes, settings }, tl = timeline(scènes, wps).
 */
function drawScene(ctx, project, tl, t) {
  const { settings } = project;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const L = layout(W, H, settings.captionPos);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const at = sceneAt(tl, Math.min(t, Math.max(0, tl.total - 1e-3)));
  const scene = at?.item.scene;
  const sceneBg = scene?.bg && scene.bg !== "auto" ? scene.bg : null;
  const theme = sceneBg && THEMES[sceneBg] ? sceneBg : settings.theme;
  const backdrop = sceneBg && BACKDROPS[sceneBg] ? sceneBg : settings.backdrop ?? "none";
  drawBackground(ctx, W, H, L, theme, t, backdrop, settings.bgImage);
  if (!at) { drawLogo(ctx, W, H, settings); ctx.restore(); return; }
  const { item, index, local } = at;
  const cur = scenePoses(item, local);
  // Transition douce depuis la fin de la scène précédente.
  const BLEND = 0.55;
  let k = 1, prev = null;
  if (index > 0 && local < BLEND) {
    const pi = tl.items[index - 1];
    prev = scenePoses(pi, pi.duration);
    k = easeOutBack(local / BLEND);
  }

  const chars = settings.characters ?? [{}, {}];
  const duoGap = Math.min(W * 0.17, L.figH * 0.62);
  const duoNow = cur.duo, duoPrev = prev?.duo ?? duoNow;
  const duoAmt = Math.min(1, Math.max(0, prev ? (duoPrev ? 1 : 0) + ((duoNow ? 1 : 0) - (duoPrev ? 1 : 0)) * k : duoNow ? 1 : 0));
  const kk = Math.min(1, Math.max(0, k));
  const solo = soloX(W, cur.pos), soloPrev = prev ? soloX(W, prev.pos) : solo;
  const soloNow = soloPrev + (solo - soloPrev) * kk;
  const x0 = soloNow + (W / 2 - duoGap - soloNow) * duoAmt;
  const x1 = W / 2 + duoGap;

  // Caméra (vise celui qui parle en gros plan).
  const focusX = item.scene.speaker === 1 ? x1 : x0;
  const cam = camera(item, local, W, H, L, focusX);
  const fx = sceneFx(item.scene);
  if (fx === "slow") cam.zoom *= 1 + 0.08 * smooth(local / item.duration);
  const [shx, shy] = shakeOffset(fx, item.scene.action, local, W);
  const cy = L.groundY - L.figH * 0.5;
  ctx.translate(W / 2 + shx, cy + shy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const th = THEMES[theme] ?? THEMES.nuit;
  // Style du personnage : épuré (par défaut, comme les vidéos de référence) ou contour BD.
  const look = settings.figureStyle === "outline"
    ? { outline: "#06060c", glow: `${th.floor}${settings.glow === false ? 0 : 0.5})`, shading: 1 }
    : { outline: null, glow: settings.glow === false ? null : `${th.floor}0.22)`, shading: 0.5 };
  const shadow = (x, w) => {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, L.groundY + 2, w, w * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const f0 = cur.flip ? -1 : 1, fPrev = prev?.flip ? -1 : 1;
  const a0 = orient(cur.p0, f0);
  let p0 = prev ? lerpPose(orient(prev.p0, fPrev), a0, k) : a0;
  p0 = { ...p0, time: t };
  let p1 = null;
  if (duoAmt > 0.01) {
    const src1 = cur.p1 ?? prev?.p1;
    const prev1 = prev?.p1 ?? src1;
    p1 = prev && cur.p1 && prev.p1 ? lerpPose(orient(prev1, -1), orient(cur.p1, -1), k) : orient(src1, -1);
    p1 = { ...p1, time: t };
  }
  // Décors de l'action (mur, porte, escalier, lit…), dans le temps de la scène.
  const J0 = figureJoints(p0, chars[0], x0, L.groundY, L.figH);
  const J1 = p1 ? figureJoints(p1, chars[1], x1, L.groundY, L.figH) : null;
  const setT = fx === "slow" ? local * 0.45 : local;
  if (p0.set) drawSetBehind(ctx, p0, J0, setT);
  if (p1?.set) drawSetBehind(ctx, p1, J1, setT);
  if (p0.set === "mirror") drawMirror(ctx, p0, chars[0], x0, L, look, J0);
  shadow(x0 + (p0.dx ?? 0) * L.figH, L.figH * 0.16);
  // Second personnage (apparaît / disparaît en fondu).
  if (p1) {
    ctx.save();
    ctx.globalAlpha = duoAmt;
    shadow(x1 + (p1.dx ?? 0) * L.figH, L.figH * 0.16);
    drawFigure(ctx, p1, chars[1], x1, L.groundY, L.figH, look);
    ctx.restore();
  }
  drawFigure(ctx, p0, chars[0], x0, L.groundY, L.figH, look);
  if (p0.set) drawSetFront(ctx, p0, J0, setT);
  if (p1?.set) drawSetFront(ctx, p1, J1, setT);
  if (p1 && duoAmt > 0.5) {
    if (p0.set === "strings") drawStrings(ctx, J0, J1, setT);
    else if (p1.set === "strings") drawStrings(ctx, J1, J0, setT);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Lumière : projecteur qui suit le personnage, ou qui s'éteint peu à peu.
  if (fx === "spot" || fx === "dark") {
    const sx = (J0.hip[0] - cam.x) * cam.zoom + W / 2 + shx, sy = (J0.hip[1] - L.figH * 0.15 - cam.y) * cam.zoom + cy + shy;
    const u = local / item.duration;
    const close = fx === "dark" ? smooth((u - 0.35) / 0.6) : 0;
    const r = L.figH * cam.zoom * (0.75 - 0.7 * close);
    const g = ctx.createRadialGradient(sx, sy, r * 0.35, sx, sy, Math.max(r, 1));
    const a = fx === "dark" ? 0.55 + 0.4 * close : 0.72;
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    if (close > 0.98) ctx.fillRect(0, 0, W, H);
  }
  if (fx === "flash" && local < 0.3) overlay(ctx, "#fff", (1 - local / 0.3) * 0.85);
  if (fx === "slow") {
    // Bandes noires de cinéma.
    const bh = H * 0.05 * smooth(local / 0.5);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, bh);
    ctx.fillRect(0, H - bh, W, bh);
  }

  // Signature.
  if (settings.handle && item.scene.kind !== "outro") {
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = "#fff";
    ctx.font = `500 ${Math.round(L.captionSize * 0.5)}px "Montserrat", sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const h = settings.handle.startsWith("@") ? settings.handle : `@${settings.handle}`;
    ctx.fillText(h, W * 0.04, L.groundY + H * 0.045);
    ctx.restore();
  }
  drawLogo(ctx, W, H, settings);

  // Texte : fondu entrée / sortie.
  const fadeIn = Math.min(1, local / 0.2);
  const fadeOut = Math.min(1, (item.duration - local) / 0.25);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
  const kind = item.scene.kind;
  if (kind === "title") drawTitle(ctx, item.scene, local, W, H, L, settings, alpha);
  else if (kind === "hook") drawHook(ctx, item.scene, local, W, H, L, settings, alpha);
  else if (kind === "outro") drawOutro(ctx, item.scene, local, W, H, L, settings, alpha);
  else if (kind !== "pause") drawCaption(ctx, item.scene, local, item.duration, W, H, L, settings, alpha, item.voiceDur);

  if (settings.progressBar) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(0, H - H * 0.006, W, H * 0.006);
    ctx.fillStyle = settings.accent ?? "#ffd84d";
    ctx.fillRect(0, H - H * 0.006, W * Math.min(1, t / tl.total), H * 0.006);
  }
  ctx.restore();
}
