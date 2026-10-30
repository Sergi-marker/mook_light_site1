// © la triche — Animots
// Rendu d'une image de la vidéo à l'instant t sur un canvas 2D.

import { poseAt, lerpPose, DUO_ACTIONS } from "./poses.js";
import { drawFigure, drawSketchFigure, figureJoints } from "./figure.js";
import { sceneAt, rng, VOICE_LEAD, detectFx, detectTransition } from "./script.js";
import { detectPlace, detectWeather, detectTimeOfDay, detectExpression, reactionTo } from "./places.js";
import { shapeAt } from "./dub.js";
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

/**
 * Décors dessinés derrière les personnages. Les lieux illustrés (bureau, plage, forêt…) sont peints en aplats
 * de couleur (style « dessin ») ; avec les personnages blancs (styles épuré / contour) ils sont assombris
 * dans la teinte du thème pour que le personnage ressorte. room, street, park, gym, sky : silhouettes discrètes.
 * Les expressions du visage (scene.expr / scene.expr2) sont listées dans EXPRESSIONS de figure.js.
 */
export const BACKDROPS = {
  none: ["Aucun (projecteur)", "Keiner (Scheinwerfer)", "None (spotlight)"],
  room: ["Chambre", "Zimmer", "Room"],
  street: ["Rue de nuit", "Straße bei Nacht", "Night street"],
  park: ["Parc", "Park", "Park"],
  gym: ["Salle de sport", "Fitnessstudio", "Gym"],
  sky: ["Ciel étoilé", "Sternenhimmel", "Starry sky"],
  cartoon: ["Pièce dessinée (aplats)", "Gezeichnetes Zimmer", "Cartoon room"],
  cartoonBlue: ["Salon dessiné (bleu)", "Gezeichnetes Wohnzimmer", "Cartoon living room"],
  office: ["Bureau", "Büro", "Office"],
  classroom: ["Salle de classe", "Klassenzimmer", "Classroom"],
  kitchen: ["Cuisine", "Küche", "Kitchen"],
  livingroom: ["Salon", "Wohnzimmer", "Living room"],
  bedroom: ["Chambre (couleurs)", "Schlafzimmer (bunt)", "Bedroom (colour)"],
  cafe: ["Café", "Café", "Café"],
  library: ["Bibliothèque", "Bibliothek", "Library"],
  hospital: ["Hôpital", "Krankenhaus", "Hospital"],
  stage: ["Scène de spectacle", "Bühne", "Stage"],
  city: ["Rue en ville", "Stadtstraße", "City street"],
  station: ["Arrêt de bus", "Bushaltestelle", "Bus stop"],
  beach: ["Plage", "Strand", "Beach"],
  forest: ["Forêt", "Wald", "Forest"],
  mountain: ["Montagne", "Berge", "Mountains"],
  countryside: ["Campagne", "Land", "Countryside"],
  desert: ["Désert", "Wüste", "Desert"],
  cemetery: ["Cimetière", "Friedhof", "Cemetery"],
  space: ["Espace", "Weltall", "Outer space"],
  image: ["Mon image", "Mein Bild", "My image"],
};

/** Moment de la journée (teinte du ciel, fenêtres et lampes allumées la nuit). */
export const TIMES_OF_DAY = {
  auto: ["Auto (selon le texte)", "Automatisch (nach Text)", "Auto (from text)"],
  day: ["Jour", "Tag", "Day"],
  sunset: ["Coucher de soleil", "Sonnenuntergang", "Sunset"],
  night: ["Nuit", "Nacht", "Night"],
};

/** Météo animée (particules dessinées à chaque image). « auto » : déduite du texte. */
export const WEATHERS = {
  auto: ["Météo auto (selon le texte)", "Wetter automatisch", "Auto weather (from text)"],
  none: ["Aucune", "Keins", "None"],
  rain: ["Pluie", "Regen", "Rain"],
  storm: ["Orage", "Gewitter", "Storm"],
  snow: ["Neige", "Schnee", "Snow"],
  leaves: ["Vent et feuilles", "Wind und Blätter", "Wind and leaves"],
  fog: ["Brouillard", "Nebel", "Fog"],
  petals: ["Pétales de fleurs", "Blütenblätter", "Flower petals"],
  confetti: ["Confettis", "Konfetti", "Confetti"],
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
const SPEAKER_COLORS = ["#8fd0ff", "#ffb3c7", "#9be7a4", "#ffd27a", "#c9a7ff", "#ff9f7a"];

/** Géométrie de la mise en page selon le format et la position des sous-titres. */
/** big : style « dessin », personnages plus grands et plus bas (comme les dessins animés de référence). */
export function layout(W, H, captionPos = "top", big = false) {
  const portrait = H > W * 1.2, landscape = W > H * 1.2;
  const groundY = H * (big ? (portrait ? 0.79 : landscape ? 0.9 : 0.86) : portrait ? 0.665 : landscape ? 0.86 : 0.8);
  const topY = H * (portrait ? 0.29 : landscape ? 0.16 : 0.18);
  const captionY = captionPos === "bottom" ? (portrait ? groundY + H * 0.13 : H * 0.93) : captionPos === "middle" ? H * (portrait ? 0.36 : 0.3) : topY;
  return {
    groundY,
    figH: H * (portrait ? 0.25 : landscape ? 0.46 : 0.36) * (big ? 1.45 : 1),
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
function backgroundCanvas(W, H, L, theme, backdrop, bgImage, mode, tod) {
  const imgReady = backdrop === "image" && !!image(bgImage);
  const key = `${W}x${H}|${L.groundY}|${L.figH}|${theme}|${backdrop}|${mode}|${tod}|${imgReady ? bgImage.length + bgImage.slice(-32) : ""}`;
  let c = bgCache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    paintBackground(c.getContext("2d"), W, H, L, theme, backdrop, bgImage, mode, tod);
    if (bgCache.size > 8) bgCache.delete(bgCache.keys().next().value);
    bgCache.set(key, c);
  }
  return c;
}

/**
 * Pose le décor. view (optionnel) : la caméra ; quand elle zoome, le décor zoome avec elle
 * (les pieds restent sur le sol), sans jamais laisser de bord vide.
 */
function drawBackground(ctx, W, H, L, theme, backdrop, bgImage, mode = "dark", tod = "night", view = null) {
  const c = backgroundCanvas(W, H, L, theme, backdrop, bgImage, mode, tod);
  if (!view || view.zoom <= 1.001) { ctx.drawImage(c, 0, 0); return; }
  const z = view.zoom;
  const dx = Math.min(0, Math.max(W - W * z, view.x)), dy = Math.min(0, Math.max(H - H * z, view.y));
  ctx.drawImage(c, dx, dy, W * z, H * z);
}

function paintBackground(ctx, W, H, L, theme, backdrop, bgImage, mode = "dark", tod = "night") {
  const t = 0;
  const th = THEMES[theme] ?? THEMES.nuit;
  const illus = illustrationOf(backdrop, mode);
  if (illus) return paintIllustrated(ctx, W, H, L, illus, tod, mode !== "color", th);
  if (backdrop === "cartoon" || backdrop === "cartoonBlue") return paintCartoonRoom(ctx, W, H, L, backdrop);
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
  spotlight(ctx, W, H, L, th, t);
}

/** Décor de dessin animé en aplats de couleur (mur, plinthe, sol), sans projecteur. */
function paintCartoonRoom(ctx, W, H, L, kind) {
  const c = kind === "cartoonBlue"
    ? { top: "#c4d3e6", wall: "#9fb8d6", line: "#56657a", floor: "#c9a98a", base: "#efe9e1" }
    : { top: "#c3c6d3", wall: "#e3b5a0", line: "#6d6f78", floor: "#d6a18a", base: "#f2ebe4" };
  const gy = L.groundY, band = gy - L.figH * 1.9;
  ctx.fillStyle = c.top;
  ctx.fillRect(0, 0, W, band);
  ctx.fillStyle = c.line;
  ctx.fillRect(0, band, W, Math.max(2, H * 0.004));
  ctx.fillStyle = c.wall;
  ctx.fillRect(0, band + Math.max(2, H * 0.004), W, gy - band);
  // Plinthe et sol.
  ctx.fillStyle = c.base;
  ctx.fillRect(0, gy - H * 0.012, W, H * 0.012);
  ctx.fillStyle = c.floor;
  ctx.fillRect(0, gy, W, H - gy);
  // Coups de pinceau légers : l'aspect « dessiné à la main ».
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 9; i++) {
    const x = ((i * 0.37) % 1) * W, y = band + ((i * 0.53) % 1) * (gy - band);
    ctx.fillRect(x, y, W * 0.18, H * 0.006);
  }
  ctx.globalAlpha = 1;
  // Cadre au mur et fenêtre simple.
  ctx.strokeStyle = "#161616";
  ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.006);
  const fw = Math.min(W, H) * 0.22, fx = W * 0.12, fy = band + (gy - band) * 0.18;
  ctx.fillStyle = "#f7f1e6";
  ctx.fillRect(fx, fy, fw, fw * 0.75);
  ctx.strokeRect(fx, fy, fw, fw * 0.75);
  ctx.fillStyle = kind === "cartoonBlue" ? "#e6b35a" : "#8fb4d9";
  ctx.fillRect(fx + fw * 0.12, fy + fw * 0.1, fw * 0.76, fw * 0.55);
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

// ——— Lieux illustrés : dessin animé en aplats (encre sombre, léger tremblé « fait main ») ———

const TAU = Math.PI * 2;

/** Lieux peints en couleur (les autres décors sont des silhouettes dans la teinte du thème). */
const ILLUSTRATED = new Set(["office", "classroom", "kitchen", "livingroom", "bedroom", "cafe", "library", "hospital", "stage", "city", "station", "beach", "forest", "mountain", "countryside", "desert", "cemetery", "space"]);
/** Style « dessin » : les anciens décors en silhouettes ont aussi leur version en couleur. */
const COLOR_ALIAS = { room: "bedroom", street: "city", park: "park", gym: "gym", sky: "countryside" };
/** Lieux d'intérieur : la nuit, les lampes s'allument et la pièce reste chaude. */
const INDOOR = new Set(["office", "classroom", "kitchen", "livingroom", "bedroom", "cafe", "library", "hospital", "gym"]);

/** Couleurs du ciel selon le moment de la journée. */
const SKIES = {
  day: { top: "#5eaee6", bottom: "#cdeaf6", sun: "#ffe27a", cloud: "#ffffff" },
  sunset: { top: "#4a3f86", mid: "#e2788f", bottom: "#ffc078", sun: "#ff8a3d", cloud: "#ffc7b8" },
  night: { top: "#0a1230", bottom: "#2a3c70", sun: "#f4f0d6", cloud: "#33416d" },
};

/** Décor illustré à peindre pour ce décor et ce style, ou null (silhouettes / pièce dessinée). */
function illustrationOf(backdrop, mode) {
  if (ILLUSTRATED.has(backdrop)) return backdrop;
  if (mode === "color" && COLOR_ALIAS[backdrop]) return COLOR_ALIAS[backdrop];
  return null;
}

function hashId(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Peint un lieu illustré ; dark : assombri dans la teinte du thème pour le personnage blanc lumineux. */
function paintIllustrated(ctx, W, H, L, id, tod, dark, th) {
  const u = L.figH, gy = L.groundY;
  const P = {
    W, H, u, gy, S: Math.min(W, H), bY: gy - u * 0.1, xl: W * 0.23, xr: W * 0.77,
    lw: Math.max(2, u * 0.011), ink: "#2b2333", r: rng(hashId(id)), tod, night: tod === "night",
    sky: SKIES[tod] ?? SKIES.day, lit: [], noTint: false,
  };
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  (PAINTERS[id] ?? PAINTERS.bedroom)(ctx, P);
  ctx.restore();
  // Lumière du moment : nuit bleutée (plus chaude dedans), coucher de soleil orangé.
  if (!P.noTint && tod !== "day" && !dark) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = tod === "night" ? (INDOOR.has(id) ? "rgb(150,150,200)" : "rgb(105,120,185)") : "rgb(255,214,185)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (dark) darkenForGlow(ctx, W, H, L, th, tod);
  // Fenêtres allumées, lampes, guirlandes : par-dessus l'assombrissement.
  if (P.lit.length && (tod !== "day" || P.alwaysLit)) {
    for (const f of P.lit) {
      ctx.save();
      ctx.globalAlpha = (tod === "day" ? 0.8 : tod === "sunset" ? 0.6 : 1) * (dark ? 0.8 : 1);
      f(ctx);
      ctx.restore();
    }
  }
  if (dark) {
    spotlight(ctx, W, H, L, th, 0);
    ctx.drawImage(noise(W, H), 0, 0);
  }
}

/** Version sombre d'un décor : couleurs adoucies, teinte du thème, bords assombris. */
function darkenForGlow(g, W, H, L, th, tod) {
  g.save();
  g.globalCompositeOperation = "saturation";
  // Le jour garde plus de couleurs ; la nuit prend presque toute la teinte du thème.
  const [desat, mix, bright] = tod === "day" ? [0.3, 0.3, 0.68] : tod === "sunset" ? [0.35, 0.4, 0.68] : [0.5, 0.55, 0.6];
  g.globalAlpha = desat;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "multiply";
  const m = Math.max(...th.tint, 1);
  const ch = (v) => Math.round((215 * (1 - mix) + (v / m) * 255 * mix) * bright);
  g.fillStyle = `rgb(${ch(th.tint[0])},${ch(th.tint[1])},${ch(th.tint[2])})`;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "source-over";
  const v = g.createRadialGradient(W / 2, L.groundY - L.figH * 0.5, Math.min(W, H) * 0.25, W / 2, L.groundY - L.figH * 0.5, Math.max(W, H) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  g.restore();
}

/** Faisceau du projecteur et sol lumineux (personnages blancs). */
function spotlight(ctx, W, H, L, th, t = 0) {
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

// Petites briques de dessin. Les contours tremblent un peu, comme tracés à la main.
const wob = (P, v) => v + (P.r() - 0.5) * P.u * 0.006;

function poly(g, P, pts, fill, stroke = true) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(wob(P, x), wob(P, y)) : g.moveTo(wob(P, x), wob(P, y))));
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = P.ink; g.lineWidth = stroke === true ? P.lw : stroke; g.stroke(); }
}

function box(g, P, x, y, w, h, fill, stroke = true) {
  poly(g, P, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, stroke);
}

function circle(g, P, x, y, r, fill, stroke = true) {
  g.beginPath();
  g.arc(x, y, Math.max(0.5, r), 0, TAU);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = P.ink; g.lineWidth = stroke === true ? P.lw : stroke; g.stroke(); }
}

function line(g, P, pts, color = P.ink, w = P.lw) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.strokeStyle = color;
  g.lineWidth = w;
  g.stroke();
}

/** Lumière qui s'allume la nuit (halo radial). */
function glowAt(P, x, y, r, rgb = "255,214,140", a = 0.55) {
  P.lit.push((g) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  });
}

/** Coups de pinceau clairs : texture « dessinée à la main » sur les grands aplats. */
function brush(g, P, x, y, w, h, n = 8, a = 0.07) {
  g.save();
  g.globalAlpha = a;
  g.fillStyle = "#ffffff";
  for (let i = 0; i < n; i++) g.fillRect(x + P.r() * w * 0.85, y + P.r() * h, w * (0.08 + P.r() * 0.15), P.u * 0.012);
  g.restore();
}

/** Ciel dégradé avec soleil, lune, étoiles ou nuages selon le moment. */
function paintSky(g, P, yH) {
  const { W, u } = P, s = P.sky;
  const gr = g.createLinearGradient(0, 0, 0, yH);
  gr.addColorStop(0, s.top);
  if (s.mid) gr.addColorStop(0.62, s.mid);
  gr.addColorStop(1, s.bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, yH + 2);
  if (P.tod === "night") {
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,250,230,${0.4 + P.r() * 0.6})`;
      g.beginPath();
      g.arc(P.r() * W, P.r() * yH * 0.85, u * (0.003 + P.r() * 0.005), 0, TAU);
      g.fill();
    }
    const mx = W * 0.8, my = Math.max(u * 0.25, yH * 0.22), mr = u * 0.09;
    const halo = g.createRadialGradient(mx, my, mr, mx, my, mr * 4);
    halo.addColorStop(0, "rgba(240,240,210,0.25)");
    halo.addColorStop(1, "rgba(240,240,210,0)");
    g.fillStyle = halo;
    g.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    circle(g, P, mx, my, mr, s.sun, false);
    circle(g, P, mx - mr * 0.3, my - mr * 0.2, mr * 0.2, "rgba(0,0,0,0.08)", false);
    circle(g, P, mx + mr * 0.35, my + mr * 0.3, mr * 0.14, "rgba(0,0,0,0.08)", false);
  } else {
    const sunset = P.tod === "sunset";
    const sx = sunset ? W * 0.7 : W * 0.82, sy = sunset ? yH - u * 0.12 : Math.max(u * 0.3, yH * 0.25), sr = u * (sunset ? 0.2 : 0.12);
    const halo = g.createRadialGradient(sx, sy, sr, sx, sy, sr * 4);
    halo.addColorStop(0, sunset ? "rgba(255,170,90,0.5)" : "rgba(255,245,200,0.5)");
    halo.addColorStop(1, "rgba(255,245,200,0)");
    g.fillStyle = halo;
    g.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);
    circle(g, P, sx, sy, sr, s.sun, false);
    for (let i = 0; i < 3; i++) cloud(g, P, W * (0.12 + i * 0.36 + P.r() * 0.1), yH * (0.15 + P.r() * 0.3), u * (0.16 + P.r() * 0.08), s.cloud);
  }
}

function cloud(g, P, x, y, s, color) {
  g.fillStyle = color;
  g.beginPath();
  for (const [dx, dy, r] of [[-0.9, 0.1, 0.45], [-0.35, -0.25, 0.6], [0.35, -0.15, 0.55], [0.95, 0.12, 0.42], [0, 0.18, 0.5]]) {
    g.moveTo(x + dx * s + r * s, y + dy * s);
    g.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
  }
  g.fill();
}

/** Pièce : mur, moulure en haut, plinthe et sol (parquet, carrelage ou moquette). */
function paintRoom(g, P, c) {
  const { W, H, u, bY } = P;
  g.fillStyle = c.wall;
  g.fillRect(0, 0, W, bY);
  if (c.stripes) {
    g.fillStyle = c.stripes;
    for (let x = -P.r() * u * 0.2; x < W; x += u * 0.24) g.fillRect(x, 0, u * 0.1, bY);
  }
  if (c.lower) {
    g.fillStyle = c.lower;
    g.fillRect(0, bY - u * 0.42, W, u * 0.42);
    line(g, P, [[0, bY - u * 0.42], [W, bY - u * 0.42]], c.trimInk ?? P.ink, P.lw * 0.8);
  }
  brush(g, P, 0, 0, W, bY, 10);
  const ceil = bY - u * 2.15;
  if (ceil > 0) {
    g.fillStyle = c.ceiling ?? "rgba(0,0,0,0.08)";
    g.fillRect(0, 0, W, ceil);
    line(g, P, [[0, ceil], [W, ceil]], P.ink, P.lw);
  }
  // Sol.
  g.fillStyle = c.floor;
  g.fillRect(0, bY, W, H - bY);
  if (c.floorKind === "planks") {
    g.strokeStyle = c.floorLine;
    g.lineWidth = P.lw * 0.6;
    let y = bY, step = u * 0.05, row = 0;
    while (y < H) {
      g.beginPath();
      g.moveTo(0, y); g.lineTo(W, y);
      const off = (row % 2) * step * 3;
      for (let x = off; x < W; x += step * 9) { g.moveTo(x, y); g.lineTo(x, y + step); }
      g.stroke();
      y += step; step *= 1.22; row++;
    }
  } else if (c.floorKind === "tiles") {
    g.strokeStyle = c.floorLine;
    g.lineWidth = P.lw * 0.5;
    g.beginPath();
    let y = bY, step = u * 0.07;
    while (y < H) { g.moveTo(0, y); g.lineTo(W, y); y += step; step *= 1.25; }
    for (let i = -12; i <= 12; i++) { g.moveTo(W / 2 + i * u * 0.18, bY); g.lineTo(W / 2 + i * u * 0.5, H); }
    g.stroke();
  } else if (c.floorKind === "checker") {
    let y = bY, step = u * 0.07, row = 0;
    const cw = u * 0.16;
    while (y < H) {
      g.fillStyle = c.floorLine;
      for (let x = (row % 2) * cw - cw; x < W; x += cw * 2) g.fillRect(x, y, cw, step);
      y += step; step *= 1.25; row++;
    }
  }
  // Plinthe.
  box(g, P, -10, bY - u * 0.045, W + 20, u * 0.045, c.trim ?? "#f4efe6");
  // Ombre douce au pied du mur.
  const sh = g.createLinearGradient(0, bY, 0, bY + u * 0.12);
  sh.addColorStop(0, "rgba(0,0,0,0.18)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sh;
  g.fillRect(0, bY, W, u * 0.12);
}

/** Fenêtre avec vue (ciel du moment, immeubles ou collines), rideaux en option. */
function windowView(g, P, x, y, w, h, opt = {}) {
  const { u } = P;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const s = P.sky;
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, s.top);
  if (s.mid) gr.addColorStop(0.6, s.mid);
  gr.addColorStop(1, s.bottom);
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  if (P.night) {
    circle(g, P, x + w * 0.75, y + h * 0.28, h * 0.1, s.sun, false);
    for (let i = 0; i < 10; i++) { g.fillStyle = "rgba(255,255,230,0.8)"; g.fillRect(x + P.r() * w, y + P.r() * h * 0.5, 2, 2); }
  } else {
    cloud(g, P, x + w * 0.3, y + h * 0.3, h * 0.12, s.cloud);
  }
  if (opt.view === "city") {
    let bx = x - w * 0.05;
    while (bx < x + w) {
      const bw = w * (0.14 + P.r() * 0.12), bh = h * (0.3 + P.r() * 0.4);
      g.fillStyle = P.night ? "#1d2747" : "#8fa6c4";
      g.fillRect(bx, y + h - bh, bw, bh);
      for (let wy = y + h - bh + h * 0.06; wy < y + h - h * 0.04; wy += h * 0.1)
        for (let wx = bx + bw * 0.15; wx < bx + bw - bw * 0.2; wx += bw * 0.3)
          if (P.r() < 0.5) {
            const X = wx, Y = wy, ww = bw * 0.15, hh = h * 0.05;
            g.fillStyle = "#c8d9ea";
            g.fillRect(X, Y, ww, hh);
            P.lit.push((c) => { c.fillStyle = "#ffd77a"; c.fillRect(X, Y, ww, hh); });
          }
      bx += bw + w * 0.02;
    }
  } else {
    g.fillStyle = P.night ? "#24452f" : "#7fbf6a";
    g.beginPath();
    g.moveTo(x, y + h);
    g.quadraticCurveTo(x + w * 0.3, y + h * 0.6, x + w * 0.6, y + h * 0.82);
    g.quadraticCurveTo(x + w * 0.85, y + h * 0.65, x + w, y + h * 0.75);
    g.lineTo(x + w, y + h);
    g.fill();
  }
  g.restore();
  // Cadre, croisillons, appui.
  g.strokeStyle = P.ink;
  g.lineWidth = P.lw;
  const fc = opt.frame ?? "#f7f2ea";
  box(g, P, x - u * 0.025, y - u * 0.025, w + u * 0.05, u * 0.03, fc);
  box(g, P, x - u * 0.025, y + h - u * 0.005, w + u * 0.05, u * 0.03, fc);
  box(g, P, x - u * 0.025, y, u * 0.03, h, fc);
  box(g, P, x + w - u * 0.005, y, u * 0.03, h, fc);
  box(g, P, x + w / 2 - u * 0.012, y, u * 0.024, h, fc);
  if (h > w * 0.6) box(g, P, x, y + h * 0.48, w, u * 0.022, fc);
  box(g, P, x - u * 0.06, y + h + u * 0.02, w + u * 0.12, u * 0.035, fc);
  // Reflet.
  g.save();
  g.globalAlpha = 0.18;
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(x + w * 0.1, y + h * 0.9); g.lineTo(x + w * 0.3, y + h * 0.1); g.lineTo(x + w * 0.38, y + h * 0.1); g.lineTo(x + w * 0.18, y + h * 0.9);
  g.fill();
  g.restore();
  if (opt.curtain) {
    for (const side of [-1, 1]) {
      const cx = side < 0 ? x - u * 0.1 : x + w + u * 0.1;
      poly(g, P, [[cx - side * u * 0.02, y - u * 0.08], [cx + side * u * 0.2, y - u * 0.08], [cx + side * u * 0.1, y + h * 0.55], [cx + side * u * 0.18, y + h + u * 0.12], [cx - side * u * 0.02, y + h + u * 0.12]], opt.curtain);
    }
    box(g, P, x - u * 0.2, y - u * 0.11, w + u * 0.4, u * 0.03, "#7a5236");
  }
  if (P.night) {
    const lx = x + w / 2, ly = y + h / 2;
    glowAt(P, lx, ly, Math.max(w, h) * 0.7, "120,150,255", 0.12);
  }
}

function frame(g, P, x, y, w, h, colors) {
  box(g, P, x, y, w, h, "#c9a15d");
  box(g, P, x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8, colors[0], P.lw * 0.6);
  g.fillStyle = colors[1];
  g.beginPath();
  g.moveTo(x + w * 0.1, y + h * 0.9);
  g.lineTo(x + w * 0.4, y + h * 0.45);
  g.lineTo(x + w * 0.6, y + h * 0.7);
  g.lineTo(x + w * 0.75, y + h * 0.55);
  g.lineTo(x + w * 0.9, y + h * 0.9);
  g.fill();
  circle(g, P, x + w * 0.7, y + h * 0.3, w * 0.08, colors[2] ?? "#ffd66b", false);
}

function plant(g, P, x, base, s = 1) {
  const u = P.u * s;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.35;
    g.fillStyle = i % 2 ? "#3f9a55" : "#58b56a";
    g.beginPath();
    g.ellipse(x + Math.cos(a) * u * 0.12, base - u * 0.2 + Math.sin(a) * u * 0.14, u * 0.05, u * 0.13, a + Math.PI / 2, 0, TAU);
    g.fill();
    g.strokeStyle = P.ink;
    g.lineWidth = P.lw * 0.6;
    g.stroke();
  }
  poly(g, P, [[x - u * 0.09, base - u * 0.18], [x + u * 0.09, base - u * 0.18], [x + u * 0.07, base], [x - u * 0.07, base]], "#d9774a");
}

function clock(g, P, x, y, r) {
  circle(g, P, x, y, r, "#fffaf0");
  line(g, P, [[x, y], [x, y - r * 0.65]], P.ink, P.lw * 0.8);
  line(g, P, [[x, y], [x + r * 0.45, y + r * 0.1]], P.ink, P.lw * 0.8);
  circle(g, P, x, y, r * 0.08, P.ink, false);
}

/** Lampe sur pied ou de table ; allumée la nuit. */
function lamp(g, P, x, base, h, shade = "#f3d27a") {
  const u = P.u;
  line(g, P, [[x, base], [x, base - h]], P.ink, P.lw * 1.2);
  box(g, P, x - u * 0.08, base - u * 0.02, u * 0.16, u * 0.02, "#555");
  poly(g, P, [[x - u * 0.1, base - h], [x + u * 0.1, base - h], [x + u * 0.06, base - h - u * 0.14], [x - u * 0.06, base - h - u * 0.14]], shade);
  glowAt(P, x, base - h - u * 0.05, u * 0.5, "255,214,140", 0.45);
  P.lit.push((c) => poly(c, P, [[x - u * 0.1, base - h], [x + u * 0.1, base - h], [x + u * 0.06, base - h - u * 0.14], [x - u * 0.06, base - h - u * 0.14]], "#ffe9a8"));
}

function tree(g, P, x, base, s, leaf = "#4f9a4a", kind = "round") {
  const u = P.u * s;
  poly(g, P, [[x - u * 0.06, base], [x - u * 0.035, base - u * 0.55], [x + u * 0.035, base - u * 0.55], [x + u * 0.06, base]], "#7a5233");
  if (kind === "pine") {
    for (let i = 0; i < 3; i++) {
      const y = base - u * (0.35 + i * 0.28), w = u * (0.38 - i * 0.09);
      poly(g, P, [[x - w, y], [x + w, y], [x, y - u * 0.42]], leaf);
    }
    return;
  }
  g.beginPath();
  for (const [ox, oy, r] of [[0, -0.85, 0.3], [-0.24, -0.66, 0.22], [0.25, -0.65, 0.23], [0.02, -0.55, 0.24]]) {
    g.moveTo(x + ox * u + r * u, base + oy * u);
    g.arc(x + ox * u, base + oy * u, r * u, 0, TAU);
  }
  g.fillStyle = leaf;
  g.fill();
  g.strokeStyle = P.ink;
  g.lineWidth = P.lw;
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.14)";
  g.beginPath();
  g.arc(x - u * 0.1, base - u * 0.95, u * 0.1, 0, TAU);
  g.fill();
}

function bush(g, P, x, base, s, color = "#4c9a4f") {
  const u = P.u * s;
  g.beginPath();
  for (const [ox, r] of [[-0.18, 0.13], [0, 0.18], [0.18, 0.13]]) { g.moveTo(x + ox * u + r * u, base); g.arc(x + ox * u, base, r * u, Math.PI, 0); }
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.strokeStyle = P.ink;
  g.lineWidth = P.lw;
  g.stroke();
}

/** Étagère remplie de livres de couleur. */
function shelf(g, P, x, y, w, h, rows = 4) {
  const { u } = P;
  box(g, P, x, y, w, h, "#8a5a3b");
  const COLORS = ["#c94f4f", "#3f7cc4", "#e2b84a", "#4f9a6a", "#8d5ab8", "#e07b39", "#2f4d6d"];
  for (let i = 0; i < rows; i++) {
    const sy = y + (h / rows) * (i + 1) - u * 0.02;
    let bx = x + u * 0.03;
    while (bx < x + w - u * 0.06) {
      const bw = u * (0.03 + P.r() * 0.025), bh = (h / rows) * (0.55 + P.r() * 0.3);
      if (bx + bw > x + w - u * 0.03) break;
      box(g, P, bx, sy - bh, bw, bh, COLORS[Math.floor(P.r() * COLORS.length)], P.lw * 0.5);
      bx += bw + u * 0.004;
    }
    box(g, P, x, sy, w, u * 0.025, "#6b4329", P.lw * 0.7);
  }
}

function table(g, P, x, base, w, h, color = "#a8714a") {
  const { u } = P;
  box(g, P, x, base - h, w, u * 0.04, color);
  box(g, P, x + u * 0.02, base - h + u * 0.04, u * 0.035, h - u * 0.04, color);
  box(g, P, x + w - u * 0.055, base - h + u * 0.04, u * 0.035, h - u * 0.04, color);
}

function chair(g, P, x, base, dir = 1, color = "#c0603f") {
  const { u } = P;
  box(g, P, x - u * 0.1, base - u * 0.24, u * 0.2, u * 0.035, color);
  box(g, P, x - dir * u * 0.1 - (dir > 0 ? 0 : u * 0.03), base - u * 0.5, u * 0.03, u * 0.5, color);
  box(g, P, x + dir * u * 0.08 - (dir > 0 ? 0 : u * 0.03), base - u * 0.21, u * 0.025, u * 0.21, color);
}

function building(g, P, x, base, w, h, color, roof) {
  const { u } = P;
  box(g, P, x, base - h, w, h, color);
  if (roof) box(g, P, x - u * 0.02, base - h - u * 0.04, w + u * 0.04, u * 0.05, roof);
  const ww = u * 0.07, wh = u * 0.1;
  for (let wy = base - h + u * 0.08; wy < base - u * 0.3; wy += u * 0.2)
    for (let wx = x + u * 0.06; wx < x + w - ww - u * 0.03; wx += u * 0.15) {
      box(g, P, wx, wy, ww, wh, P.night ? "#2a3350" : "#bfe0f2", P.lw * 0.6);
      if (P.r() < 0.45) P.lit.push((c) => { c.fillStyle = "#ffd77a"; c.fillRect(wx + 2, wy + 2, ww - 4, wh - 4); });
    }
}

function streetLamp(g, P, x, base, h) {
  const { u } = P;
  box(g, P, x - u * 0.018, base - h, u * 0.036, h, "#3b4250");
  box(g, P, x - u * 0.05, base - u * 0.04, u * 0.1, u * 0.04, "#3b4250");
  poly(g, P, [[x - u * 0.07, base - h], [x + u * 0.07, base - h], [x + u * 0.04, base - h - u * 0.12], [x - u * 0.04, base - h - u * 0.12]], "#f2e3a0");
  glowAt(P, x, base - h - u * 0.04, u * 0.6, "255,220,150", 0.5);
  P.lit.push((c) => {
    const gr = c.createLinearGradient(0, base - h, 0, base);
    gr.addColorStop(0, "rgba(255,225,160,0.28)");
    gr.addColorStop(1, "rgba(255,225,160,0)");
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(x - u * 0.06, base - h); c.lineTo(x + u * 0.06, base - h); c.lineTo(x + u * 0.35, base); c.lineTo(x - u * 0.35, base);
    c.fill();
  });
}

/** Rue : trottoir où se tiennent les personnages, bordure, chaussée devant. */
function pavement(g, P, color = "#c9c3b8") {
  const { W, H, u, gy, bY } = P;
  g.fillStyle = color;
  g.fillRect(0, bY, W, gy + u * 0.16 - bY);
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = P.lw * 0.5;
  g.beginPath();
  for (let x = 0; x < W; x += u * 0.3) { g.moveTo(x, bY); g.lineTo(x - u * 0.05, gy + u * 0.16); }
  g.stroke();
  box(g, P, -10, gy + u * 0.16, W + 20, u * 0.04, "#9a958c");
  g.fillStyle = "#565a63";
  g.fillRect(0, gy + u * 0.2, W, H);
  g.fillStyle = "#f1eee4";
  for (let x = -u * 0.2; x < W; x += u * 0.7) g.fillRect(x, gy + u * 0.38, u * 0.35, u * 0.03);
}

function grass(g, P, y, color, color2) {
  const { W, H, u } = P;
  g.fillStyle = color;
  g.fillRect(0, y, W, H - y);
  g.strokeStyle = color2;
  g.lineWidth = P.lw * 0.6;
  g.beginPath();
  for (let i = 0; i < 70; i++) {
    const x = P.r() * W, yy = y + u * 0.05 + P.r() * (H - y);
    g.moveTo(x, yy); g.lineTo(x - u * 0.01, yy - u * 0.035); g.moveTo(x, yy); g.lineTo(x + u * 0.012, yy - u * 0.03);
  }
  g.stroke();
}

function hills(g, P, y, amp, color, seed = 0, stroke = true) {
  const { W, H } = P;
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(0, y);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const x0 = (W * i) / n, x1 = (W * (i + 1)) / n;
    g.quadraticCurveTo((x0 + x1) / 2, y - amp * (0.4 + 0.6 * Math.abs(Math.sin(seed + i * 1.7))), x1, y + amp * 0.1 * Math.sin(seed + i));
  }
  g.lineTo(W, H);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  if (stroke) { g.strokeStyle = P.ink; g.lineWidth = P.lw * 0.8; g.stroke(); }
}

function text(g, P, str, x, y, size, color = "#fff", font = "900") {
  g.save();
  g.font = `${font} ${Math.round(size)}px "Arial Black", Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(str, x, y);
  g.restore();
}

const PAINTERS = {
  office(g, P) {
    const { W, u, bY, xl, xr } = P;
    paintRoom(g, P, { wall: "#cfd9e4", lower: "#b7c4d3", floor: "#7f8ca3", floorKind: "tiles", floorLine: "rgba(0,0,0,0.08)", trim: "#eef2f6" });
    windowView(g, P, W / 2 - u * 0.62, bY - u * 1.85, u * 1.24, u * 0.62, { view: "city" });
    // Néons au plafond.
    for (const x of [W * 0.25, W * 0.75]) {
      box(g, P, x - u * 0.3, bY - u * 2.15 - u * 0.04, u * 0.6, u * 0.05, "#f4f7fb");
      glowAt(P, x, bY - u * 2.1, u * 0.7, "235,245,255", 0.25);
    }
    clock(g, P, xr + u * 0.25, bY - u * 1.4, u * 0.1);
    // Bureau avec ordinateur, fauteuil.
    const dx = xl - u * 0.85;
    table(g, P, dx, bY, u * 0.8, u * 0.4, "#c69a6b");
    box(g, P, dx + u * 0.05, bY - u * 0.36, u * 0.25, u * 0.33, "#b0875c");
    box(g, P, dx + u * 0.42, bY - u * 0.72, u * 0.36, u * 0.25, "#2c3442");
    box(g, P, dx + u * 0.45, bY - u * 0.69, u * 0.3, u * 0.19, P.night ? "#7fb6ff" : "#9ed0f0", P.lw * 0.5);
    box(g, P, dx + u * 0.57, bY - u * 0.47, u * 0.06, u * 0.07, "#2c3442");
    P.lit.push((c) => { c.fillStyle = "#bfe0ff"; c.fillRect(dx + u * 0.45, bY - u * 0.69, u * 0.3, u * 0.19); });
    glowAt(P, dx + u * 0.6, bY - u * 0.6, u * 0.4, "160,200,255", 0.35);
    box(g, P, dx + u * 0.12, bY - u * 0.5, u * 0.12, u * 0.08, "#f2f2f2", P.lw * 0.6);
    // Fauteuil de bureau.
    const cx = xl - u * 0.05;
    box(g, P, cx - u * 0.12, bY - u * 0.55 + u * 0.08, u * 0.24, u * 0.3, "#3a4659");
    box(g, P, cx - u * 0.14, bY - u * 0.22 + u * 0.08, u * 0.28, u * 0.06, "#3a4659");
    line(g, P, [[cx, bY - u * 0.08], [cx, bY + u * 0.05]], P.ink, P.lw * 1.5);
    line(g, P, [[cx - u * 0.12, bY + u * 0.07], [cx + u * 0.12, bY + u * 0.07]], P.ink, P.lw * 1.5);
    // Armoire à dossiers et plante, fontaine à eau.
    box(g, P, xr + u * 0.05, bY - u * 0.62, u * 0.34, u * 0.62, "#8f9bab");
    for (let i = 0; i < 3; i++) { box(g, P, xr + u * 0.08, bY - u * 0.6 + i * u * 0.2, u * 0.28, u * 0.17, "#a3afbf", P.lw * 0.6); box(g, P, xr + u * 0.18, bY - u * 0.53 + i * u * 0.2, u * 0.08, u * 0.025, "#555", P.lw * 0.4); }
    plant(g, P, xr + u * 0.22, bY - u * 0.62, 0.8);
    box(g, P, xr + u * 0.5, bY - u * 0.5, u * 0.2, u * 0.5, "#e8edf2");
    poly(g, P, [[xr + u * 0.52, bY - u * 0.5], [xr + u * 0.68, bY - u * 0.5], [xr + u * 0.66, bY - u * 0.8], [xr + u * 0.54, bY - u * 0.8]], "rgba(140,200,240,0.85)");
    // Tableau de post-it.
    box(g, P, xl - u * 0.6, bY - u * 1.35, u * 0.5, u * 0.34, "#d8b77f");
    for (let i = 0; i < 5; i++) box(g, P, xl - u * 0.56 + (i % 3) * u * 0.15, bY - u * 1.3 + Math.floor(i / 3) * u * 0.15, u * 0.11, u * 0.11, ["#ffe066", "#ff9fb2", "#9fe0ff"][i % 3], P.lw * 0.5);
  },

  classroom(g, P) {
    const { W, u, bY, xl, xr } = P;
    paintRoom(g, P, { wall: "#f2e2b2", lower: "#c98e5c", floor: "#b77b4d", floorKind: "planks", floorLine: "rgba(80,40,20,0.35)", trim: "#8a5a37" });
    // Tableau noir (vert) au-dessus des têtes, avec des dessins à la craie.
    const bw = Math.min(W * 0.84, u * 2.4), bx = W / 2 - bw / 2, by = bY - u * 1.92, bh = u * 0.68;
    box(g, P, bx - u * 0.04, by - u * 0.04, bw + u * 0.08, bh + u * 0.08, "#8a5a37");
    box(g, P, bx, by, bw, bh, "#2f5d4a");
    brush(g, P, bx, by, bw, bh, 6, 0.06);
    text(g, P, "A B C", bx + bw * 0.2, by + bh * 0.3, bh * 0.2, "rgba(255,255,255,0.85)");
    text(g, P, "2+2=4", bx + bw * 0.22, by + bh * 0.68, bh * 0.18, "rgba(255,255,255,0.75)");
    g.strokeStyle = "rgba(255,255,255,0.8)";
    g.lineWidth = P.lw * 0.7;
    g.beginPath();
    g.arc(bx + bw * 0.78, by + bh * 0.4, bh * 0.14, 0, TAU);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.moveTo(bx + bw * 0.78 + Math.cos(a) * bh * 0.2, by + bh * 0.4 + Math.sin(a) * bh * 0.2); g.lineTo(bx + bw * 0.78 + Math.cos(a) * bh * 0.27, by + bh * 0.4 + Math.sin(a) * bh * 0.27); }
    g.moveTo(bx + bw * 0.45, by + bh * 0.75); g.quadraticCurveTo(bx + bw * 0.52, by + bh * 0.3, bx + bw * 0.6, by + bh * 0.75);
    g.stroke();
    box(g, P, bx, by + bh, bw, u * 0.03, "#8a5a37");
    // Fanions de l'alphabet.
    const fy = by - u * 0.14;
    if (fy > u * 0.05) {
      line(g, P, [[0, fy], [W, fy]], P.ink, P.lw * 0.5);
      const cols = ["#e85d5d", "#f2b84b", "#5bb0e0", "#6cc070", "#a77ad8"];
      for (let i = 0, x = u * 0.05; x < W; x += u * 0.16, i++) poly(g, P, [[x, fy], [x + u * 0.12, fy], [x + u * 0.06, fy + u * 0.12]], cols[i % cols.length], P.lw * 0.5);
    }
    clock(g, P, xr + u * 0.3, bY - u * 1.25, u * 0.09);
    // Bureau du professeur : pomme, pile de livres.
    const dx = xl - u * 0.85;
    box(g, P, dx, bY - u * 0.42, u * 0.8, u * 0.42, "#9a6640");
    box(g, P, dx - u * 0.03, bY - u * 0.45, u * 0.86, u * 0.04, "#7d4f30");
    for (let i = 0; i < 3; i++) box(g, P, dx + u * 0.1 + i * u * 0.01, bY - u * 0.5 - i * u * 0.05, u * 0.3, u * 0.05, ["#c94f4f", "#3f7cc4", "#e2b84a"][i], P.lw * 0.6);
    circle(g, P, dx + u * 0.6, bY - u * 0.5, u * 0.05, "#d63c3c");
    line(g, P, [[dx + u * 0.6, bY - u * 0.55], [dx + u * 0.62, bY - u * 0.6]], P.ink, P.lw * 0.6);
    // Pupitre d'élève et globe.
    box(g, P, xr + u * 0.1, bY - u * 0.34, u * 0.5, u * 0.04, "#d7a46b");
    box(g, P, xr + u * 0.13, bY - u * 0.3, u * 0.03, u * 0.3, "#555");
    box(g, P, xr + u * 0.54, bY - u * 0.3, u * 0.03, u * 0.3, "#555");
    circle(g, P, xr + u * 0.35, bY - u * 0.5, u * 0.1, "#5ba7e0");
    g.fillStyle = "#6cc070";
    g.beginPath(); g.ellipse(xr + u * 0.32, bY - u * 0.53, u * 0.04, u * 0.06, 0.4, 0, TAU); g.fill();
    line(g, P, [[xr + u * 0.35, bY - u * 0.4], [xr + u * 0.35, bY - u * 0.34]], P.ink, P.lw);
    chair(g, P, xr + u * 0.75, bY, -1, "#3f7cc4");
    // Carte du monde.
    box(g, P, xl - u * 0.75, bY - u * 1.3, u * 0.55, u * 0.36, "#9fd3f0");
    g.fillStyle = "#7cc173";
    for (const [ox, oy, rx, ry] of [[0.2, 0.4, 0.08, 0.12], [0.45, 0.35, 0.06, 0.15], [0.7, 0.45, 0.12, 0.1]]) { g.beginPath(); g.ellipse(xl - u * 0.75 + ox * u * 0.55, bY - u * 1.3 + oy * u * 0.36 + u * 0.04, rx * u, ry * u * 0.6, 0, 0, TAU); g.fill(); }
  },

  kitchen(g, P) {
    const { W, u, bY, xl, xr } = P;
    paintRoom(g, P, { wall: "#f6eedc", floor: "#e9d6b8", floorKind: "checker", floorLine: "#d0b48c", trim: "#f6eedc" });
    // Faïence derrière les plans de travail.
    g.fillStyle = "#cfe6dc";
    g.fillRect(0, bY - u * 0.95, W, u * 0.5);
    g.strokeStyle = "rgba(255,255,255,0.8)";
    g.lineWidth = P.lw * 0.5;
    g.beginPath();
    for (let y = bY - u * 0.95; y < bY - u * 0.45; y += u * 0.1) { g.moveTo(0, y); g.lineTo(W, y); }
    for (let x = 0; x < W; x += u * 0.1) { g.moveTo(x, bY - u * 0.95); g.lineTo(x, bY - u * 0.45); }
    g.stroke();
    windowView(g, P, W / 2 - u * 0.45, bY - u * 1.9, u * 0.9, u * 0.6, { curtain: "#e86f6f" });
    // Réfrigérateur.
    const fx = xl - u * 0.55;
    box(g, P, fx, bY - u * 1.2, u * 0.52, u * 1.2, "#d6e8f2");
    line(g, P, [[fx, bY - u * 0.8], [fx + u * 0.52, bY - u * 0.8]]);
    box(g, P, fx + u * 0.42, bY - u * 1.1, u * 0.03, u * 0.2, "#8a96a3", P.lw * 0.5);
    box(g, P, fx + u * 0.42, bY - u * 0.7, u * 0.03, u * 0.3, "#8a96a3", P.lw * 0.5);
    circle(g, P, fx + u * 0.12, bY - u * 0.65, u * 0.03, "#e85d5d", P.lw * 0.5);
    box(g, P, fx + u * 0.18, bY - u * 0.6, u * 0.1, u * 0.12, "#fff", P.lw * 0.5);
    // Plan de travail, cuisinière, hotte, placards.
    const cx = xr + u * 0.02;
    box(g, P, cx, bY - u * 0.45, W - cx + 10, u * 0.45, "#f2c879");
    box(g, P, cx - u * 0.02, bY - u * 0.48, W - cx + 20, u * 0.04, "#8a6a4a");
    for (let x = cx + u * 0.03; x < W; x += u * 0.3) { box(g, P, x, bY - u * 0.4, u * 0.26, u * 0.36, "#f5d394", P.lw * 0.6); circle(g, P, x + u * 0.13, bY - u * 0.34, u * 0.015, P.ink, false); }
    box(g, P, cx + u * 0.08, bY - u * 0.52, u * 0.4, u * 0.04, "#444");
    poly(g, P, [[cx + u * 0.12, bY - u * 0.52], [cx + u * 0.38, bY - u * 0.52], [cx + u * 0.36, bY - u * 0.66], [cx + u * 0.14, bY - u * 0.66]], "#c94f4f");
    line(g, P, [[cx + u * 0.36, bY - u * 0.62], [cx + u * 0.48, bY - u * 0.64]], P.ink, P.lw * 1.2);
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.lineWidth = P.lw * 0.8;
    g.beginPath();
    for (let i = 0; i < 3; i++) { const sx = cx + u * (0.18 + i * 0.08); g.moveTo(sx, bY - u * 0.7); g.bezierCurveTo(sx + u * 0.04, bY - u * 0.78, sx - u * 0.04, bY - u * 0.84, sx, bY - u * 0.92); }
    g.stroke();
    poly(g, P, [[cx + u * 0.05, bY - u * 1.05], [cx + u * 0.45, bY - u * 1.05], [cx + u * 0.38, bY - u * 1.25], [cx + u * 0.12, bY - u * 1.25]], "#b9c2cc");
    box(g, P, cx + u * 0.55, bY - u * 1.45, W - cx, u * 0.4, "#f2c879");
    // Étagère à bocaux à gauche, au-dessus du frigo.
    box(g, P, xl - u * 0.62, bY - u * 1.5, u * 0.62, u * 0.03, "#8a6a4a");
    for (let i = 0; i < 3; i++) box(g, P, xl - u * 0.56 + i * u * 0.18, bY - u * 1.62, u * 0.12, u * 0.12, ["#f2b84b", "#e85d5d", "#7cc173"][i], P.lw * 0.6);
    // Casseroles suspendues.
    for (let i = 0; i < 2; i++) { const px = cx + u * (0.6 + i * 0.2); line(g, P, [[px, bY - u * 1.0], [px, bY - u * 0.86]], P.ink, P.lw * 0.6); circle(g, P, px, bY - u * 0.8, u * 0.06, "#c9772f"); }
  },

  livingroom(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    paintRoom(g, P, { wall: "#e9c8a0", stripes: "rgba(255,255,255,0.12)", floor: "#a8714a", floorKind: "planks", floorLine: "rgba(70,35,15,0.35)", trim: "#f4ece0" });
    windowView(g, P, W / 2 - u * 0.42, bY - u * 1.95, u * 0.84, u * 0.66, { curtain: "#5a8fc4" });
    // Tapis.
    g.fillStyle = "#c95f5f";
    g.beginPath(); g.ellipse(W / 2, gy + u * 0.02, u * 0.95, u * 0.12, 0, 0, TAU); g.fill();
    g.strokeStyle = "#f0d9a8"; g.lineWidth = P.lw; g.beginPath(); g.ellipse(W / 2, gy + u * 0.02, u * 0.8, u * 0.08, 0, 0, TAU); g.stroke();
    // Canapé.
    const sx = xl - u * 1.05, sw = u * 1.0;
    box(g, P, sx, bY - u * 0.55, sw, u * 0.32, "#3f8f8c");
    box(g, P, sx - u * 0.08, bY - u * 0.36, sw + u * 0.16, u * 0.26, "#357c79");
    box(g, P, sx - u * 0.1, bY - u * 0.42, u * 0.12, u * 0.32, "#2f6e6b");
    box(g, P, sx + sw - u * 0.02, bY - u * 0.42, u * 0.12, u * 0.32, "#2f6e6b");
    box(g, P, sx + sw * 0.55, bY - u * 0.5, u * 0.18, u * 0.16, "#f2b84b");
    box(g, P, sx - u * 0.04, bY - u * 0.1, u * 0.04, u * 0.1, "#3a2a1d");
    box(g, P, sx + sw, bY - u * 0.1, u * 0.04, u * 0.1, "#3a2a1d");
    frame(g, P, sx + sw * 0.2, bY - u * 1.15, u * 0.42, u * 0.32, ["#bfe3f2", "#6aa86a"]);
    // Meuble télé + télé, lampe.
    const tx = xr + u * 0.12;
    box(g, P, tx, bY - u * 0.3, u * 0.8, u * 0.3, "#7d5236");
    box(g, P, tx + u * 0.04, bY - u * 0.26, u * 0.34, u * 0.2, "#8e6142", P.lw * 0.6);
    box(g, P, tx + u * 0.42, bY - u * 0.26, u * 0.34, u * 0.2, "#8e6142", P.lw * 0.6);
    box(g, P, tx + u * 0.08, bY - u * 0.72, u * 0.62, u * 0.38, "#23262e");
    box(g, P, tx + u * 0.11, bY - u * 0.69, u * 0.56, u * 0.32, P.night ? "#3b5f9a" : "#4c5a6e", P.lw * 0.4);
    P.lit.push((c) => { c.fillStyle = "rgba(140,190,255,0.85)"; c.fillRect(tx + u * 0.11, bY - u * 0.69, u * 0.56, u * 0.32); });
    lamp(g, P, xr - u * 0.02, bY, u * 0.85, "#f3d27a");
    plant(g, P, tx + u * 0.95, bY, 1.1);
  },

  bedroom(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    paintRoom(g, P, { wall: "#c7d3ef", floor: "#c08a5c", floorKind: "planks", floorLine: "rgba(80,40,20,0.3)", trim: "#f2eee8" });
    g.fillStyle = "rgba(255,255,255,0.35)";
    for (let y = u * 0.15; y < bY - u * 0.1; y += u * 0.22) for (let x = ((y / u) % 0.44) * u; x < W; x += u * 0.3) { g.beginPath(); g.arc(x, y, u * 0.018, 0, TAU); g.fill(); }
    windowView(g, P, W / 2 - u * 0.4, bY - u * 1.95, u * 0.8, u * 0.66, { curtain: "#f2a6b8" });
    g.fillStyle = "#8fbf8f";
    g.beginPath(); g.ellipse(W / 2, gy + u * 0.02, u * 0.8, u * 0.1, 0, 0, TAU); g.fill();
    // Lit avec couette et oreiller.
    const bx = xl - u * 1.15, bw = u * 1.1;
    box(g, P, bx - u * 0.05, bY - u * 0.65, u * 0.08, u * 0.65, "#8a5a3b");
    box(g, P, bx, bY - u * 0.3, bw, u * 0.18, "#f7f3ec");
    box(g, P, bx + bw * 0.25, bY - u * 0.36, bw * 0.75, u * 0.26, "#e86f8a");
    box(g, P, bx + u * 0.05, bY - u * 0.42, u * 0.25, u * 0.12, "#ffffff");
    box(g, P, bx, bY - u * 0.12, bw, u * 0.12, "#8a5a3b");
    // Table de nuit et lampe.
    box(g, P, xl - u * 0.02, bY - u * 0.3, u * 0.24, u * 0.3, "#a8714a");
    lamp(g, P, xl + u * 0.1, bY - u * 0.3, u * 0.12, "#ffd27a");
    // Armoire et poster.
    box(g, P, xr + u * 0.15, bY - u * 1.2, u * 0.7, u * 1.2, "#b07a4f");
    line(g, P, [[xr + u * 0.5, bY - u * 1.15], [xr + u * 0.5, bY - u * 0.05]]);
    circle(g, P, xr + u * 0.45, bY - u * 0.6, u * 0.02, P.ink, false);
    circle(g, P, xr + u * 0.55, bY - u * 0.6, u * 0.02, P.ink, false);
    box(g, P, xr - u * 0.18, bY - u * 1.45, u * 0.3, u * 0.42, "#ffd166");
    circle(g, P, xr - u * 0.03, bY - u * 1.3, u * 0.08, "#ef476f", P.lw * 0.6);
    frame(g, P, xl - u * 0.75, bY - u * 1.25, u * 0.4, u * 0.3, ["#bfe3f2", "#6aa86a"]);
  },

  cafe(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    paintRoom(g, P, { wall: "#f3e2c4", lower: "#a8553e", floor: "#5e4336", floorKind: "checker", floorLine: "#4a332a", trim: "#3b2a24", trimInk: "#3b2a24" });
    // Briques.
    g.strokeStyle = "rgba(255,230,210,0.35)";
    g.lineWidth = P.lw * 0.5;
    g.beginPath();
    for (let y = bY - u * 0.42, r = 0; y < bY - u * 0.04; y += u * 0.07, r++) { g.moveTo(0, y); g.lineTo(W, y); for (let x = (r % 2) * u * 0.08; x < W; x += u * 0.16) { g.moveTo(x, y); g.lineTo(x, y + u * 0.07); } }
    g.stroke();
    // Grande vitrine et guirlande lumineuse.
    windowView(g, P, xl - u * 0.85, bY - u * 1.55, u * 0.72, u * 0.75, { view: "city", frame: "#2f5d4a" });
    const gyl = bY - u * 1.95;
    g.strokeStyle = P.ink; g.lineWidth = P.lw * 0.5; g.beginPath(); g.moveTo(0, gyl); for (let x = 0; x <= W; x += u * 0.4) g.quadraticCurveTo(x + u * 0.2, gyl + u * 0.12, x + u * 0.4, gyl); g.stroke();
    for (let x = u * 0.2, i = 0; x < W; x += u * 0.2, i++) {
      const y = gyl + (i % 2 ? u * 0.06 : u * 0.015);
      circle(g, P, x, y, u * 0.022, ["#ffd166", "#ef476f", "#7bdff2"][i % 3], P.lw * 0.4);
      glowAt(P, x, y, u * 0.12, "255,220,150", 0.5);
    }
    P.alwaysLit = true;
    // Ardoise du menu.
    box(g, P, xr + u * 0.1, bY - u * 1.5, u * 0.62, u * 0.5, "#2b2b2b");
    text(g, P, "MENU", xr + u * 0.41, bY - u * 1.4, u * 0.07, "#ffd166");
    for (let i = 0; i < 3; i++) line(g, P, [[xr + u * 0.18, bY - u * (1.3 - i * 0.09)], [xr + u * 0.62, bY - u * (1.3 - i * 0.09)]], "rgba(255,255,255,0.7)", P.lw * 0.5);
    // Comptoir et machine à café.
    const cx = xr + u * 0.05;
    box(g, P, cx, bY - u * 0.5, W - cx + 10, u * 0.5, "#7d4f30");
    box(g, P, cx - u * 0.03, bY - u * 0.54, W - cx + 20, u * 0.05, "#d9b38c");
    box(g, P, cx + u * 0.15, bY - u * 0.84, u * 0.3, u * 0.3, "#c0c7cf");
    box(g, P, cx + u * 0.2, bY - u * 0.7, u * 0.2, u * 0.06, "#555", P.lw * 0.6);
    box(g, P, cx + u * 0.27, bY - u * 0.62, u * 0.07, u * 0.07, "#fff", P.lw * 0.5);
    for (let i = 0; i < 3; i++) box(g, P, cx + u * (0.55 + i * 0.1), bY - u * 0.62, u * 0.07, u * 0.08, "#fff", P.lw * 0.5);
    // Table ronde et chaises.
    const tx = xl - u * 0.45;
    box(g, P, tx - u * 0.2, gy - u * 0.4, u * 0.4, u * 0.04, "#d9b38c");
    box(g, P, tx - u * 0.02, gy - u * 0.36, u * 0.04, u * 0.34, "#333");
    box(g, P, tx - u * 0.12, gy - u * 0.03, u * 0.24, u * 0.03, "#333");
    box(g, P, tx - u * 0.05, gy - u * 0.47, u * 0.07, u * 0.07, "#fff", P.lw * 0.5);
    chair(g, P, tx - u * 0.35, gy, 1, "#2f5d4a");
    // Suspensions.
    for (const x of [W * 0.35, W * 0.65]) {
      line(g, P, [[x, 0], [x, bY - u * 1.62]], P.ink, P.lw * 0.5);
      poly(g, P, [[x - u * 0.1, bY - u * 1.5], [x + u * 0.1, bY - u * 1.5], [x + u * 0.04, bY - u * 1.62], [x - u * 0.04, bY - u * 1.62]], "#2f5d4a");
      glowAt(P, x, bY - u * 1.45, u * 0.55, "255,214,140", 0.45);
    }
  },

  library(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    paintRoom(g, P, { wall: "#5d7a63", lower: "#7a4f33", floor: "#9a6640", floorKind: "planks", floorLine: "rgba(60,30,10,0.35)", trim: "#5a3a24", ceiling: "#4a3a2c" });
    // Fenêtre en arc au centre.
    const wx = W / 2 - u * 0.38, wy = bY - u * 1.95, ww = u * 0.76, wh = u * 0.75;
    g.save();
    g.beginPath(); g.moveTo(wx, wy + wh); g.lineTo(wx, wy + ww / 2); g.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0); g.lineTo(wx + ww, wy + wh); g.closePath(); g.clip();
    windowView(g, P, wx, wy, ww, wh, { frame: "#5a3a24" });
    g.restore();
    g.strokeStyle = P.ink; g.lineWidth = P.lw * 1.4;
    g.beginPath(); g.moveTo(wx, wy + wh); g.lineTo(wx, wy + ww / 2); g.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0); g.lineTo(wx + ww, wy + wh); g.closePath(); g.stroke();
    // Grandes bibliothèques des deux côtés.
    shelf(g, P, xl - u * 1.25, bY - u * 1.9, u * 1.2, u * 1.9, 6);
    shelf(g, P, xr + u * 0.05, bY - u * 1.9, u * 1.2, u * 1.9, 6);
    // Échelle.
    line(g, P, [[xr + u * 0.2, bY + u * 0.02], [xr + u * 0.45, bY - u * 1.6]], "#3b2a1d", P.lw * 1.5);
    line(g, P, [[xr + u * 0.42, bY + u * 0.02], [xr + u * 0.67, bY - u * 1.6]], "#3b2a1d", P.lw * 1.5);
    for (let i = 1; i < 8; i++) { const k = i / 8; line(g, P, [[xr + u * (0.2 + 0.25 * k), bY - u * 1.62 * k], [xr + u * (0.42 + 0.25 * k), bY - u * 1.62 * k]], "#3b2a1d", P.lw); }
    // Tapis rouge et lampes de lecture murales.
    g.fillStyle = "#9b2c2c";
    g.fillRect(W / 2 - u * 0.9, gy - u * 0.04, u * 1.8, u * 0.12);
    for (const x of [W / 2 - u * 0.62, W / 2 + u * 0.62]) {
      box(g, P, x - u * 0.02, bY - u * 1.25, u * 0.04, u * 0.1, "#c9a15d");
      poly(g, P, [[x - u * 0.07, bY - u * 1.25], [x + u * 0.07, bY - u * 1.25], [x + u * 0.04, bY - u * 1.35], [x - u * 0.04, bY - u * 1.35]], "#3f7a4f");
      glowAt(P, x, bY - u * 1.2, u * 0.45, "255,214,140", 0.5);
    }
    P.alwaysLit = true;
  },

  hospital(g, P) {
    const { W, u, bY, xl, xr } = P;
    paintRoom(g, P, { wall: "#e3f2ef", lower: "#a8d8cc", floor: "#dfe6ea", floorKind: "tiles", floorLine: "rgba(0,60,80,0.12)", trim: "#7fbfb0" });
    // Croix rouge et horloge.
    const cy = bY - u * 1.7;
    circle(g, P, W / 2, cy, u * 0.2, "#ffffff");
    box(g, P, W / 2 - u * 0.04, cy - u * 0.13, u * 0.08, u * 0.26, "#e04848", P.lw * 0.6);
    box(g, P, W / 2 - u * 0.13, cy - u * 0.04, u * 0.26, u * 0.08, "#e04848", P.lw * 0.6);
    g.fillStyle = "#e04848"; g.fillRect(W / 2 - u * 0.04, cy - u * 0.04, u * 0.08, u * 0.08);
    windowView(g, P, xr + u * 0.1, bY - u * 1.55, u * 0.55, u * 0.5, { view: "city" });
    // Lit d'hôpital, perfusion.
    const bx = xl - u * 1.05, bw = u * 0.95;
    box(g, P, bx, bY - u * 0.48, u * 0.05, u * 0.48, "#b9c2cc");
    box(g, P, bx + bw, bY - u * 0.38, u * 0.05, u * 0.38, "#b9c2cc");
    box(g, P, bx, bY - u * 0.3, bw + u * 0.05, u * 0.08, "#b9c2cc");
    box(g, P, bx + u * 0.03, bY - u * 0.4, bw, u * 0.1, "#ffffff");
    box(g, P, bx + bw * 0.35, bY - u * 0.42, bw * 0.65, u * 0.12, "#7fb6e0");
    box(g, P, bx + u * 0.06, bY - u * 0.48, u * 0.22, u * 0.08, "#ffffff");
    for (const x of [bx + u * 0.08, bx + bw - u * 0.05]) circle(g, P, x, bY - u * 0.03, u * 0.03, "#444");
    line(g, P, [[xl - u * 0.02, bY], [xl - u * 0.02, bY - u * 1.0]], "#8a96a3", P.lw * 1.2);
    line(g, P, [[xl - u * 0.1, bY], [xl + u * 0.06, bY]], "#8a96a3", P.lw * 1.2);
    poly(g, P, [[xl - u * 0.08, bY - u * 0.98], [xl + u * 0.04, bY - u * 0.98], [xl + u * 0.03, bY - u * 0.8], [xl - u * 0.07, bY - u * 0.8]], "rgba(200,230,255,0.9)");
    // Moniteur cardiaque.
    const mx = xr + u * 0.05;
    line(g, P, [[mx + u * 0.15, bY], [mx + u * 0.15, bY - u * 0.65]], "#8a96a3", P.lw * 1.2);
    box(g, P, mx, bY - u * 0.92, u * 0.32, u * 0.26, "#2c3442");
    box(g, P, mx + u * 0.03, bY - u * 0.89, u * 0.26, u * 0.2, "#0f2a1f", P.lw * 0.4);
    const ecg = [[0, 0.5], [0.3, 0.5], [0.38, 0.2], [0.46, 0.85], [0.54, 0.5], [1, 0.5]].map(([a, b]) => [mx + u * 0.03 + a * u * 0.26, bY - u * 0.89 + b * u * 0.2]);
    line(g, P, ecg, "#4dff9a", P.lw * 0.6);
    // Rideau de séparation.
    line(g, P, [[xr + u * 0.5, bY - u * 2.0], [W, bY - u * 2.0]], "#8a96a3", P.lw);
    const rx = Math.max(xr + u * 0.55, W - u * 0.35);
    poly(g, P, [[rx, bY - u * 2.0], [W + 10, bY - u * 2.0], [W + 10, bY - u * 0.15], [rx + u * 0.05, bY - u * 0.15]], "#7fc4c9");
    for (let x = rx + u * 0.08; x < W; x += u * 0.08) line(g, P, [[x, bY - u * 1.95], [x + u * 0.01, bY - u * 0.2]], "rgba(0,0,0,0.15)", P.lw * 0.5);
  },

  stage(g, P) {
    const { W, H, u, bY, gy } = P;
    P.noTint = true;
    P.alwaysLit = true;
    // Rideau de fond.
    const back = g.createLinearGradient(0, 0, 0, bY);
    back.addColorStop(0, "#3a0d18");
    back.addColorStop(1, "#6e1628");
    g.fillStyle = back;
    g.fillRect(0, 0, W, bY);
    for (let x = 0; x < W; x += u * 0.16) { g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x, 0, u * 0.06, bY); }
    // Plancher de la scène.
    g.fillStyle = "#8a5530";
    g.fillRect(0, bY, W, gy + u * 0.22 - bY);
    g.strokeStyle = "rgba(50,20,5,0.4)"; g.lineWidth = P.lw * 0.5; g.beginPath();
    for (let y = bY + u * 0.05; y < gy + u * 0.22; y += u * 0.06) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
    box(g, P, -10, gy + u * 0.22, W + 20, u * 0.08, "#5a3418");
    g.fillStyle = "#120a10";
    g.fillRect(0, gy + u * 0.3, W, H);
    // Rideaux latéraux avec plis.
    for (const side of [0, 1]) {
      const x0 = side ? W - Math.max(W * 0.17, u * 0.3) : 0, w = Math.max(W * 0.17, u * 0.3);
      g.fillStyle = "#b3243a";
      g.beginPath();
      if (!side) { g.moveTo(0, 0); g.lineTo(w, 0); g.quadraticCurveTo(w * 0.7, bY * 0.6, w * 0.9, gy + u * 0.22); g.lineTo(0, gy + u * 0.22); }
      else { g.moveTo(W, 0); g.lineTo(x0, 0); g.quadraticCurveTo(x0 + w * 0.3, bY * 0.6, x0 + w * 0.1, gy + u * 0.22); g.lineTo(W, gy + u * 0.22); }
      g.closePath();
      g.fill();
      g.strokeStyle = P.ink; g.lineWidth = P.lw; g.stroke();
      g.strokeStyle = "rgba(60,0,15,0.45)"; g.lineWidth = P.lw * 1.4;
      g.beginPath();
      for (let k = 1; k < 4; k++) { const x = side ? x0 + (w * k) / 4 + w * 0.1 : (w * k) / 4 - w * 0.1; g.moveTo(x, 0); g.lineTo(x + (side ? -1 : 1) * w * 0.05, gy + u * 0.2); }
      g.stroke();
      box(g, P, side ? x0 + w * 0.05 : w * 0.55, bY - u * 0.85, w * 0.35, u * 0.05, "#e8b64a");
    }
    // Lambrequin festonné en haut.
    const vh = Math.max(u * 0.22, (bY - u * 2.0));
    g.fillStyle = "#c22b44";
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, vh);
    for (let x = W; x > 0; x -= u * 0.3) g.quadraticCurveTo(x - u * 0.15, vh + u * 0.12, x - u * 0.3, vh);
    g.closePath(); g.fill(); g.strokeStyle = P.ink; g.lineWidth = P.lw; g.stroke();
    g.strokeStyle = "#e8b64a"; g.lineWidth = P.lw * 1.2; g.beginPath(); g.moveTo(0, vh - u * 0.03); g.lineTo(W, vh - u * 0.03); g.stroke();
    // Rampe de lumières au bord de la scène.
    for (let x = u * 0.15; x < W; x += u * 0.3) {
      box(g, P, x - u * 0.05, gy + u * 0.17, u * 0.1, u * 0.05, "#2b2b2b", P.lw * 0.5);
      P.lit.push((c) => { const gr = c.createRadialGradient(x, gy + u * 0.17, 0, x, gy + u * 0.17, u * 0.35); gr.addColorStop(0, "rgba(255,230,160,0.55)"); gr.addColorStop(1, "rgba(255,230,160,0)"); c.fillStyle = gr; c.fillRect(x - u * 0.35, gy - u * 0.2, u * 0.7, u * 0.4); });
    }
    // Poursuites qui éclairent le centre.
    P.lit.push((c) => {
      for (const sx of [W * 0.2, W * 0.8]) {
        const gr = c.createLinearGradient(sx, 0, W / 2, gy);
        gr.addColorStop(0, "rgba(255,240,200,0.0)");
        gr.addColorStop(1, "rgba(255,240,200,0.16)");
        c.fillStyle = gr;
        c.beginPath(); c.moveTo(sx - u * 0.05, 0); c.lineTo(sx + u * 0.05, 0); c.lineTo(W / 2 + u * 0.55, gy); c.lineTo(W / 2 - u * 0.55, gy); c.fill();
      }
      c.fillStyle = "rgba(255,240,200,0.18)";
      c.beginPath(); c.ellipse(W / 2, gy, u * 0.65, u * 0.08, 0, 0, TAU); c.fill();
    });
  },

  city(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    paintSky(g, P, bY);
    // Immeubles du fond (plus clairs), puis rangée de façades.
    let x = -u * 0.1;
    const backs = ["#b9c4d6", "#c9bfd9", "#aebfcf"];
    let i = 0;
    while (x < W) { const w = u * (0.45 + P.r() * 0.3), h = u * (1.6 + P.r() * 1.0); building(g, P, x, bY - u * 0.3, w, h, backs[i++ % 3]); x += w + u * 0.05; }
    const fronts = ["#e8a87c", "#f2d0a4", "#c38d9e", "#9fc5c0", "#e9c46a"];
    x = -u * 0.2; i = 0;
    while (x < W) {
      const w = u * (0.7 + P.r() * 0.3), h = u * (1.2 + P.r() * 0.5);
      building(g, P, x, bY, w, h, fronts[i++ % fronts.length], "#6d4c41");
      x += w;
    }
    // Vitrines avec stores, au niveau de la rue (sur les côtés).
    for (const [sx, col] of [[xl - u * 0.75, "#e05d5d"], [xr + u * 0.1, "#3f8fc4"]]) {
      box(g, P, sx, bY - u * 0.62, u * 0.62, u * 0.55, "#cfe8f5");
      P.lit.push((c) => { c.fillStyle = "rgba(255,220,140,0.9)"; c.fillRect(sx + 3, bY - u * 0.62 + 3, u * 0.62 - 6, u * 0.55 - 6); });
      for (let k = 0; k < 5; k++) poly(g, P, [[sx + k * u * 0.13 - u * 0.02, bY - u * 0.85], [sx + (k + 1) * u * 0.13 - u * 0.02, bY - u * 0.85], [sx + (k + 1) * u * 0.13 + u * 0.01, bY - u * 0.7], [sx + k * u * 0.13 + u * 0.01, bY - u * 0.7]], k % 2 ? "#ffffff" : col, P.lw * 0.6);
    }
    pavement(g, P);
    streetLamp(g, P, xr + u * 0.05, gy + u * 0.08, u * 1.3);
    tree(g, P, xl - u * 0.2, gy + u * 0.06, 0.95, "#5aa55a");
    box(g, P, xl - u * 0.3, gy - u * 0.02, u * 0.2, u * 0.1, "#9a958c");
  },

  station(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    paintSky(g, P, bY);
    let x = -u * 0.1, i = 0;
    while (x < W) { const w = u * (0.5 + P.r() * 0.4), h = u * (0.6 + P.r() * 0.9); building(g, P, x, bY, w, h, ["#d7c4a8", "#b8c9d9", "#c9b3c9"][i++ % 3], "#6d4c41"); x += w + u * 0.08; }
    hills(g, P, bY - u * 0.02, 0, "#9cc58a", 0, false);
    pavement(g, P, "#d6d0c4");
    // Abribus.
    const sx = xr + u * 0.05, sw = u * 1.0, top = gy - u * 1.2;
    box(g, P, sx, top, sw, u * 0.08, "#2f6f8f");
    box(g, P, sx + u * 0.02, top + u * 0.08, u * 0.04, gy - top - u * 0.08, "#3b4250");
    box(g, P, sx + sw - u * 0.06, top + u * 0.08, u * 0.04, gy - top - u * 0.08, "#3b4250");
    poly(g, P, [[sx + u * 0.06, top + u * 0.1], [sx + sw - u * 0.06, top + u * 0.1], [sx + sw - u * 0.06, gy - u * 0.25], [sx + u * 0.06, gy - u * 0.25]], "rgba(190,225,245,0.55)", P.lw * 0.6);
    box(g, P, sx + sw * 0.55, top + u * 0.18, sw * 0.3, u * 0.5, "#ffb84d");
    circle(g, P, sx + sw * 0.7, top + u * 0.35, u * 0.08, "#ef476f", P.lw * 0.5);
    box(g, P, sx + u * 0.12, gy - u * 0.32, sw * 0.45, u * 0.05, "#8a5a3b");
    box(g, P, sx + u * 0.15, gy - u * 0.27, u * 0.03, u * 0.27, "#3b4250");
    P.lit.push((c) => { c.fillStyle = "rgba(255,240,200,0.35)"; c.fillRect(sx + u * 0.06, top + u * 0.1, sw - u * 0.12, gy - top - u * 0.35); });
    // Poteau d'arrêt de bus.
    const px = xl - u * 0.15;
    box(g, P, px - u * 0.02, gy - u * 1.2, u * 0.04, u * 1.2, "#3b4250");
    circle(g, P, px, gy - u * 1.22, u * 0.13, "#2f6f8f");
    text(g, P, "BUS", px, gy - u * 1.22, u * 0.08, "#ffffff");
    box(g, P, px + u * 0.03, gy - u * 0.95, u * 0.16, u * 0.22, "#f5f0e6", P.lw * 0.6);
    for (let k = 0; k < 4; k++) line(g, P, [[px + u * 0.06, gy - u * (0.9 - k * 0.04)], [px + u * 0.16, gy - u * (0.9 - k * 0.04)]], "rgba(0,0,0,0.5)", P.lw * 0.4);
    box(g, P, xl - u * 0.6, gy - u * 0.3, u * 0.2, u * 0.3, "#4f9a6a");
    streetLamp(g, P, xl - u * 0.85, gy + u * 0.08, u * 1.3);
  },

  beach(g, P) {
    const { W, H, u, gy, xl, xr } = P;
    const hz = gy - u * 0.75;
    paintSky(g, P, hz);
    // Mer avec reflets, voilier au loin.
    const sea = g.createLinearGradient(0, hz, 0, gy - u * 0.12);
    sea.addColorStop(0, P.night ? "#1b3a6b" : P.tod === "sunset" ? "#5a6fb0" : "#2f8fc4");
    sea.addColorStop(1, P.night ? "#2c5a8a" : "#56c4d8");
    g.fillStyle = sea;
    g.fillRect(0, hz, W, gy - hz);
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.lineWidth = P.lw * 0.6;
    g.beginPath();
    for (let k = 0; k < 14; k++) { const x = P.r() * W, y = hz + u * 0.05 + P.r() * (gy - hz - u * 0.2); g.moveTo(x, y); g.lineTo(x + u * (0.06 + P.r() * 0.1), y); }
    g.stroke();
    line(g, P, [[0, hz], [W, hz]], P.ink, P.lw * 0.6);
    const bx = W * 0.62;
    poly(g, P, [[bx - u * 0.08, hz - u * 0.01], [bx + u * 0.08, hz - u * 0.01], [bx + u * 0.05, hz + u * 0.025], [bx - u * 0.05, hz + u * 0.025]], "#f2f2f2", P.lw * 0.5);
    poly(g, P, [[bx, hz - u * 0.02], [bx, hz - u * 0.2], [bx + u * 0.08, hz - u * 0.03]], "#ffffff", P.lw * 0.5);
    // Sable et écume.
    g.fillStyle = "#f0d59a";
    g.beginPath();
    g.moveTo(0, gy - u * 0.12);
    for (let x = 0; x <= W; x += u * 0.25) g.quadraticCurveTo(x + u * 0.125, gy - u * 0.16, x + u * 0.25, gy - u * 0.12);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = P.lw; g.stroke();
    g.fillStyle = "rgba(160,110,50,0.25)";
    for (let k = 0; k < 60; k++) g.fillRect(P.r() * W, gy - u * 0.05 + P.r() * (H - gy), u * 0.008, u * 0.008);
    // Palmier.
    const px = xl - u * 0.35, pb = gy + u * 0.06;
    g.strokeStyle = P.ink; g.lineWidth = P.lw;
    g.fillStyle = "#a8743f";
    g.beginPath(); g.moveTo(px - u * 0.06, pb); g.quadraticCurveTo(px + u * 0.05, pb - u * 0.8, px + u * 0.22, pb - u * 1.5); g.lineTo(px + u * 0.28, pb - u * 1.48); g.quadraticCurveTo(px + u * 0.12, pb - u * 0.8, px + u * 0.06, pb); g.closePath(); g.fill(); g.stroke();
    const top = [px + u * 0.25, pb - u * 1.5];
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI + (k / 5) * Math.PI + (k > 2 ? 0.2 : -0.2);
      g.fillStyle = k % 2 ? "#3f9a55" : "#4fb064";
      g.beginPath();
      g.moveTo(top[0], top[1]);
      g.quadraticCurveTo(top[0] + Math.cos(a) * u * 0.3, top[1] + Math.sin(a) * u * 0.3 - u * 0.12, top[0] + Math.cos(a) * u * 0.5, top[1] + Math.sin(a) * u * 0.5 + u * 0.18);
      g.quadraticCurveTo(top[0] + Math.cos(a) * u * 0.25, top[1] + Math.sin(a) * u * 0.2, top[0], top[1]);
      g.fill(); g.stroke();
    }
    circle(g, P, top[0] - u * 0.03, top[1] + u * 0.05, u * 0.04, "#7a5233");
    circle(g, P, top[0] + u * 0.04, top[1] + u * 0.06, u * 0.04, "#7a5233");
    // Parasol, serviette, seau.
    const ux = xr + u * 0.35;
    line(g, P, [[ux, gy + u * 0.05], [ux - u * 0.1, gy - u * 0.95]], "#f2f2f2", P.lw * 1.4);
    g.save(); g.translate(ux - u * 0.1, gy - u * 0.95); g.rotate(-0.12);
    for (let k = 0; k < 6; k++) {
      g.beginPath(); g.moveTo(0, -u * 0.05); g.arc(0, u * 0.12, u * 0.5, Math.PI + (k * Math.PI) / 6, Math.PI + ((k + 1) * Math.PI) / 6); g.closePath();
      g.fillStyle = k % 2 ? "#ffffff" : "#e63946"; g.fill(); g.strokeStyle = P.ink; g.lineWidth = P.lw; g.stroke();
    }
    g.restore();
    poly(g, P, [[xr - u * 0.05, gy + u * 0.08], [xr + u * 0.5, gy + u * 0.08], [xr + u * 0.55, gy + u * 0.2], [xr - u * 0.08, gy + u * 0.2]], "#2a9d8f", P.lw * 0.7);
    poly(g, P, [[xl - u * 0.75, gy - u * 0.05], [xl - u * 0.6, gy - u * 0.05], [xl - u * 0.62, gy + u * 0.08], [xl - u * 0.73, gy + u * 0.08]], "#ffb703", P.lw * 0.7);
    // Mouettes.
    g.strokeStyle = P.ink; g.lineWidth = P.lw * 0.7; g.beginPath();
    for (const [mx, my] of [[W * 0.3, hz - u * 0.6], [W * 0.38, hz - u * 0.5]]) { g.moveTo(mx - u * 0.05, my); g.quadraticCurveTo(mx - u * 0.025, my - u * 0.03, mx, my); g.quadraticCurveTo(mx + u * 0.025, my - u * 0.03, mx + u * 0.05, my); }
    g.stroke();
  },

  forest(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    paintSky(g, P, bY);
    // Arbres lointains (silhouettes douces), puis rangée moyenne.
    hills(g, P, bY - u * 0.55, u * 0.4, P.night ? "#1f3a2c" : "#7fae7a", 1, false);
    for (let x = -u * 0.1, k = 0; x < W + u * 0.3; x += u * 0.32, k++) tree(g, P, x + P.r() * u * 0.1, bY - u * 0.05, 0.75 + P.r() * 0.3, k % 2 ? "#3e7d4a" : "#4a8f52", "pine");
    grass(g, P, bY, "#5f9a45", "rgba(30,70,20,0.5)");
    // Sentier vers le fond.
    g.fillStyle = "#c9a46e";
    g.beginPath(); g.moveTo(W / 2 - u * 0.12, bY); g.lineTo(W / 2 + u * 0.12, bY); g.lineTo(W / 2 + u * 0.9, P.H); g.lineTo(W / 2 - u * 0.9, P.H); g.closePath(); g.fill();
    // Grands troncs au premier plan sur les côtés.
    for (const [x, s] of [[xl - u * 0.45, 1.6], [xr + u * 0.5, 1.75]]) tree(g, P, x, gy + u * 0.1, s, "#2f6e3c");
    bush(g, P, xl - u * 0.05, gy + u * 0.05, 0.9, "#3f8a45");
    bush(g, P, xr + u * 0.05, gy + u * 0.08, 0.8, "#4c9a4f");
    // Champignons.
    for (const [x, s] of [[xl + u * 0.02, 1], [xr - u * 0.05, 0.8]]) {
      box(g, P, x - u * 0.015 * s, gy - u * 0.06 * s + u * 0.05, u * 0.03 * s, u * 0.06 * s, "#f5efe0", P.lw * 0.5);
      g.beginPath(); g.arc(x, gy - u * 0.06 * s + u * 0.05, u * 0.05 * s, Math.PI, 0); g.closePath(); g.fillStyle = "#d84a3a"; g.fill(); g.strokeStyle = P.ink; g.lineWidth = P.lw * 0.6; g.stroke();
    }
    // Rayons de soleil entre les arbres (jour).
    if (P.tod === "day") {
      g.save(); g.globalAlpha = 0.12; g.fillStyle = "#fff6c8";
      for (const x of [W * 0.3, W * 0.55, W * 0.75]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + u * 0.12, 0); g.lineTo(x - u * 0.2, gy); g.lineTo(x - u * 0.45, gy); g.fill(); }
      g.restore();
    } else if (P.night) {
      for (let k = 0; k < 9; k++) glowAt(P, P.r() * W, bY - u * 0.3 + P.r() * u * 0.6, u * 0.06, "220,255,140", 0.8);
    }
  },

  mountain(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    paintSky(g, P, bY);
    // Chaîne de montagnes enneigées.
    const peaks = [];
    for (let x = -u * 0.4; x < W + u * 0.8; x += u * (0.8 + P.r() * 0.5)) peaks.push([x, bY - u * (1.0 + P.r() * 0.9)]);
    g.fillStyle = P.night ? "#3b4a78" : "#7d8fc0";
    g.beginPath(); g.moveTo(-10, bY);
    for (let k = 0; k < peaks.length; k++) { const [x, y] = peaks[k]; g.lineTo(x, y); if (peaks[k + 1]) g.lineTo((x + peaks[k + 1][0]) / 2, bY - u * 0.35); }
    g.lineTo(W + 10, bY); g.closePath(); g.fill();
    g.strokeStyle = P.ink; g.lineWidth = P.lw; g.stroke();
    for (const [x, y] of peaks) {
      const d = u * 0.28, s = (bY - y) * 0.28;
      poly(g, P, [[x, y], [x + d * 0.6, y + s], [x + d * 0.25, y + s * 0.85], [x, y + s * 1.05], [x - d * 0.25, y + s * 0.85], [x - d * 0.6, y + s]], "#f4f6fb", P.lw * 0.7);
    }
    hills(g, P, bY - u * 0.25, u * 0.25, "#6fa15f", 2);
    grass(g, P, bY, "#8cbf5a", "rgba(40,90,20,0.45)");
    // Sentier, rochers, sapins.
    g.fillStyle = "#d8bf8f";
    g.beginPath(); g.moveTo(W / 2 + u * 0.05, bY); g.quadraticCurveTo(W / 2 - u * 0.3, gy - u * 0.05, W / 2 - u * 0.75, P.H); g.lineTo(W / 2 + u * 0.4, P.H); g.quadraticCurveTo(W / 2 + u * 0.05, gy, W / 2 + u * 0.15, bY); g.closePath(); g.fill();
    for (const [x, s] of [[xl - u * 0.5, 1.15], [xl - u * 0.1, 0.8], [xr + u * 0.35, 1.25], [xr + u * 0.75, 0.9]]) tree(g, P, x, gy + u * 0.05, s, "#2f6e4c", "pine");
    poly(g, P, [[xr - u * 0.05, gy + u * 0.08], [xr + u * 0.05, gy - u * 0.12], [xr + u * 0.2, gy - u * 0.15], [xr + u * 0.28, gy + u * 0.08]], "#9aa0a8");
    // Aigle.
    g.strokeStyle = P.ink; g.lineWidth = P.lw * 0.8; g.beginPath();
    const ex = W * 0.3, ey = bY - u * 1.5;
    g.moveTo(ex - u * 0.08, ey); g.quadraticCurveTo(ex - u * 0.04, ey - u * 0.04, ex, ey); g.quadraticCurveTo(ex + u * 0.04, ey - u * 0.04, ex + u * 0.08, ey); g.stroke();
  },

  countryside(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    paintSky(g, P, bY);
    hills(g, P, bY - u * 0.3, u * 0.35, P.night ? "#2c4a2c" : "#a8d17a", 0.5);
    // Champs en bandes.
    const cols = ["#c9d86a", "#e6c96a", "#9cc861"];
    for (let k = 0; k < 3; k++) {
      g.fillStyle = cols[k];
      g.beginPath(); g.moveTo(W * k / 3 - u * 0.2, bY - u * 0.18 + k * u * 0.02); g.lineTo(W * (k + 1) / 3 + u * 0.2, bY - u * 0.2); g.lineTo(W * (k + 1) / 3 + u * 0.3, bY); g.lineTo(W * k / 3 - u * 0.3, bY); g.closePath(); g.fill();
    }
    // Moulin et grange.
    const bx = xr + u * 0.05, bw = u * 0.75;
    box(g, P, bx, bY - u * 0.65, bw, u * 0.6, "#c0392b");
    poly(g, P, [[bx - u * 0.05, bY - u * 0.65], [bx + bw / 2, bY - u * 1.0], [bx + bw + u * 0.05, bY - u * 0.65]], "#7a2a20");
    box(g, P, bx + bw * 0.3, bY - u * 0.4, bw * 0.4, u * 0.35, "#f4ead5");
    line(g, P, [[bx + bw * 0.3, bY - u * 0.4], [bx + bw * 0.7, bY - u * 0.05]]);
    line(g, P, [[bx + bw * 0.7, bY - u * 0.4], [bx + bw * 0.3, bY - u * 0.05]]);
    const mx = W * 0.32, my = bY - u * 0.95;
    poly(g, P, [[mx - u * 0.1, bY - u * 0.2], [mx + u * 0.1, bY - u * 0.2], [mx + u * 0.05, my], [mx - u * 0.05, my]], "#f2e6d0");
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; poly(g, P, [[mx, my], [mx + Math.cos(a) * u * 0.32, my + Math.sin(a) * u * 0.32], [mx + Math.cos(a + 0.3) * u * 0.3, my + Math.sin(a + 0.3) * u * 0.3]], "#f9f4ea", P.lw * 0.6); }
    grass(g, P, bY, "#7cb342", "rgba(40,90,20,0.45)");
    // Clôture en bois.
    for (const [x0, x1] of [[-u * 0.1, xl + u * 0.05], [xr - u * 0.05, W + u * 0.1]]) {
      box(g, P, x0, gy - u * 0.32, x1 - x0, u * 0.04, "#b58a5a", P.lw * 0.6);
      box(g, P, x0, gy - u * 0.18, x1 - x0, u * 0.04, "#b58a5a", P.lw * 0.6);
      for (let x = x0 + u * 0.05; x < x1; x += u * 0.28) box(g, P, x, gy - u * 0.4, u * 0.05, u * 0.42, "#c89a64", P.lw * 0.6);
    }
    // Botte de foin, moutons.
    circle(g, P, xl - u * 0.55, gy - u * 0.12, u * 0.16, "#e8c25a");
    g.strokeStyle = "rgba(140,90,20,0.6)"; g.lineWidth = P.lw * 0.6; g.beginPath(); g.arc(xl - u * 0.55, gy - u * 0.12, u * 0.09, 0, TAU); g.stroke();
    for (const [x, y] of [[W * 0.42, bY - u * 0.12], [W * 0.5, bY - u * 0.1]]) { cloud(g, P, x, y, u * 0.05, "#ffffff"); circle(g, P, x + u * 0.06, y, u * 0.025, "#333", false); }
  },

  desert(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    P.sky = P.tod === "day" ? { ...SKIES.day, top: "#7cc3f0", bottom: "#fbe6c2" } : P.sky;
    paintSky(g, P, bY);
    // Plateaux rocheux au loin.
    poly(g, P, [[W * 0.05, bY], [W * 0.1, bY - u * 0.55], [W * 0.3, bY - u * 0.55], [W * 0.34, bY]], "#d9875a");
    poly(g, P, [[W * 0.62, bY], [W * 0.67, bY - u * 0.8], [W * 0.82, bY - u * 0.8], [W * 0.9, bY]], "#c9744a");
    hills(g, P, bY - u * 0.05, u * 0.25, "#f0c27b", 3);
    hills(g, P, gy - u * 0.15, u * 0.15, "#e9b468", 5);
    g.fillStyle = "rgba(160,100,40,0.2)";
    for (let k = 0; k < 40; k++) g.fillRect(P.r() * W, gy + P.r() * (P.H - gy), u * 0.01, u * 0.006);
    // Cactus.
    const cactus = (x, base, s) => {
      const c = "#4f9a4a";
      box(g, P, x - u * 0.06 * s, base - u * 0.9 * s, u * 0.12 * s, u * 0.9 * s, c);
      box(g, P, x - u * 0.24 * s, base - u * 0.6 * s, u * 0.08 * s, u * 0.3 * s, c);
      box(g, P, x - u * 0.24 * s, base - u * 0.34 * s, u * 0.2 * s, u * 0.07 * s, c);
      box(g, P, x + u * 0.16 * s, base - u * 0.72 * s, u * 0.08 * s, u * 0.32 * s, c);
      box(g, P, x + u * 0.04 * s, base - u * 0.44 * s, u * 0.2 * s, u * 0.07 * s, c);
    };
    cactus(xl - u * 0.35, gy + u * 0.05, 1.2);
    cactus(xr + u * 0.4, gy + u * 0.02, 0.95);
    poly(g, P, [[xr - u * 0.1, gy + u * 0.06], [xr - u * 0.04, gy - u * 0.06], [xr + u * 0.1, gy - u * 0.08], [xr + u * 0.14, gy + u * 0.06]], "#b98a64");
  },

  cemetery(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    if (P.tod === "day") P.sky = { ...SKIES.day, top: "#8fa3b8", bottom: "#d9dee4", cloud: "#eef1f4" };
    paintSky(g, P, bY);
    hills(g, P, bY - u * 0.15, u * 0.2, P.night ? "#24352a" : "#6f8a64", 4, false);
    grass(g, P, bY, "#5f7d4e", "rgba(20,40,10,0.45)");
    // Grille en fer forgé.
    g.strokeStyle = "#2b2b33"; g.lineWidth = P.lw * 0.7; g.beginPath();
    const fy = bY - u * 0.35;
    g.moveTo(0, fy); g.lineTo(W, fy); g.moveTo(0, bY - u * 0.08); g.lineTo(W, bY - u * 0.08);
    for (let x = 0; x < W; x += u * 0.09) { g.moveTo(x, bY); g.lineTo(x, fy - u * 0.06); }
    g.stroke();
    g.fillStyle = "#2b2b33";
    for (let x = 0; x < W; x += u * 0.09) { g.beginPath(); g.moveTo(x - u * 0.02, fy - u * 0.05); g.lineTo(x, fy - u * 0.1); g.lineTo(x + u * 0.02, fy - u * 0.05); g.fill(); }
    // Pierres tombales.
    const stone = (x, base, s, cross) => {
      const w = u * 0.3 * s, h = u * 0.42 * s;
      if (cross) {
        box(g, P, x - w * 0.12, base - h * 1.1, w * 0.24, h * 1.1, "#a7adb5");
        box(g, P, x - w * 0.4, base - h * 0.85, w * 0.8, w * 0.22, "#a7adb5");
      } else {
        g.beginPath(); g.moveTo(x - w / 2, base); g.lineTo(x - w / 2, base - h + w / 2); g.arc(x, base - h + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w / 2, base); g.closePath();
        g.fillStyle = "#b3b8bf"; g.fill(); g.strokeStyle = P.ink; g.lineWidth = P.lw; g.stroke();
        line(g, P, [[x - w * 0.25, base - h * 0.55], [x + w * 0.25, base - h * 0.55]], "rgba(0,0,0,0.35)", P.lw * 0.6);
        line(g, P, [[x - w * 0.2, base - h * 0.4], [x + w * 0.2, base - h * 0.4]], "rgba(0,0,0,0.35)", P.lw * 0.6);
      }
      g.fillStyle = "rgba(0,0,0,0.2)"; g.beginPath(); g.ellipse(x, base, w * 0.6, u * 0.02, 0, 0, TAU); g.fill();
    };
    stone(W * 0.36, bY + u * 0.02, 0.55, false);
    stone(W * 0.6, bY + u * 0.02, 0.5, true);
    stone(xl - u * 0.15, gy + u * 0.02, 1.05, false);
    stone(xl - u * 0.65, gy - u * 0.02, 0.9, true);
    stone(xr + u * 0.2, gy + u * 0.03, 1.0, true);
    stone(xr + u * 0.7, gy - u * 0.01, 0.9, false);
    // Arbre mort.
    const tx = xl - u * 0.95;
    g.strokeStyle = "#3a2e2a"; g.lineCap = "round";
    const branch = (x, y, a, len, w, d) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      if (d > 0) { branch(x2, y2, a - 0.45, len * 0.7, w * 0.65, d - 1); branch(x2, y2, a + 0.4, len * 0.65, w * 0.65, d - 1); }
    };
    branch(tx, gy + u * 0.05, -Math.PI / 2 + 0.08, u * 0.75, u * 0.09, 4);
    // Corbeau.
    const cx = tx + u * 0.3, cy = gy - u * 1.3;
    g.fillStyle = "#1f1f25"; g.beginPath(); g.ellipse(cx, cy, u * 0.06, u * 0.04, 0, 0, TAU); g.arc(cx + u * 0.05, cy - u * 0.03, u * 0.025, 0, TAU); g.fill();
    // Lanterne.
    box(g, P, xr + u * 0.5, gy - u * 0.62, u * 0.08, u * 0.12, "#3b3b3b", P.lw * 0.6);
    glowAt(P, xr + u * 0.54, gy - u * 0.56, u * 0.35, "255,200,120", 0.6);
  },

  space(g, P) {
    const { W, H, u, bY, gy, xl, xr } = P;
    P.noTint = true;
    const bg = g.createLinearGradient(0, 0, 0, bY);
    bg.addColorStop(0, "#07061a");
    bg.addColorStop(1, "#1c1250");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // Nébuleuses.
    for (const [x, y, r, c] of [[W * 0.2, bY * 0.3, u * 0.9, "170,80,200"], [W * 0.75, bY * 0.55, u * 0.8, "60,140,220"], [W * 0.5, bY * 0.15, u * 0.6, "220,90,140"]]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${c},0.35)`);
      gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(255,255,255,${0.3 + P.r() * 0.7})`; g.beginPath(); g.arc(P.r() * W, P.r() * bY, u * (0.002 + P.r() * 0.006), 0, TAU); g.fill(); }
    for (let k = 0; k < 6; k++) { const x = P.r() * W, y = P.r() * bY * 0.8, s = u * 0.03; g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = P.lw * 0.4; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke(); }
    // Planète à anneaux et Terre.
    const px = W * 0.78, py = Math.max(u * 0.35, bY * 0.22), pr = u * 0.22;
    g.strokeStyle = "#e8c98a"; g.lineWidth = u * 0.025; g.beginPath(); g.ellipse(px, py, pr * 1.7, pr * 0.4, -0.3, Math.PI, TAU); g.stroke();
    circle(g, P, px, py, pr, "#e0925a");
    g.save(); g.beginPath(); g.arc(px, py, pr, 0, TAU); g.clip(); g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(px - pr, py - pr * 0.3, pr * 2, pr * 0.2); g.fillRect(px - pr, py + pr * 0.25, pr * 2, pr * 0.15); g.restore();
    g.strokeStyle = "#e8c98a"; g.lineWidth = u * 0.025; g.beginPath(); g.ellipse(px, py, pr * 1.7, pr * 0.4, -0.3, 0, Math.PI); g.stroke();
    const ex = W * 0.2, ey = bY - u * 1.45, er = u * 0.14;
    circle(g, P, ex, ey, er, "#3d8bd9");
    g.fillStyle = "#5cbf6a"; g.beginPath(); g.ellipse(ex - er * 0.3, ey - er * 0.2, er * 0.35, er * 0.5, 0.4, 0, TAU); g.ellipse(ex + er * 0.4, ey + er * 0.3, er * 0.3, er * 0.25, 0, 0, TAU); g.fill();
    // Sol lunaire avec cratères.
    g.fillStyle = "#9aa0ad";
    g.beginPath(); g.moveTo(0, bY + u * 0.05); g.quadraticCurveTo(W / 2, bY - u * 0.12, W, bY + u * 0.05); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    g.strokeStyle = P.ink; g.lineWidth = P.lw; g.stroke();
    const crater = (x, y, r) => { g.fillStyle = "#7d8391"; g.beginPath(); g.ellipse(x, y, r, r * 0.3, 0, 0, TAU); g.fill(); g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = P.lw * 0.6; g.beginPath(); g.ellipse(x, y + r * 0.05, r, r * 0.3, 0, 0.1, Math.PI - 0.1); g.stroke(); };
    crater(xl - u * 0.4, gy + u * 0.05, u * 0.22);
    crater(xr + u * 0.45, gy - u * 0.02, u * 0.18);
    crater(W * 0.3, bY + u * 0.08, u * 0.08);
    crater(W * 0.7, bY + u * 0.12, u * 0.1);
    crater(W / 2 + u * 0.4, gy + u * 0.35, u * 0.25);
    poly(g, P, [[xr + u * 0.05, gy + u * 0.06], [xr + u * 0.12, gy - u * 0.08], [xr + u * 0.25, gy - u * 0.06], [xr + u * 0.3, gy + u * 0.06]], "#80868f");
    // Drapeau planté.
    line(g, P, [[xl - u * 0.1, gy + u * 0.02], [xl - u * 0.1, gy - u * 0.85]], "#d0d0d0", P.lw);
    poly(g, P, [[xl - u * 0.1, gy - u * 0.85], [xl + u * 0.18, gy - u * 0.8], [xl - u * 0.1, gy - u * 0.65]], "#ffd166", P.lw * 0.7);
  },

  park(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    paintSky(g, P, bY);
    for (let x = -u * 0.2; x < W + u * 0.3; x += u * 0.45) tree(g, P, x + P.r() * u * 0.15, bY + u * 0.02, 0.6 + P.r() * 0.2, "#79b46a");
    grass(g, P, bY, "#7cbf55", "rgba(40,90,20,0.45)");
    g.fillStyle = "#e3cf9f";
    g.beginPath(); g.moveTo(0, gy - u * 0.12); g.quadraticCurveTo(W / 2, gy - u * 0.2, W, gy - u * 0.1); g.lineTo(W, gy + u * 0.18); g.quadraticCurveTo(W / 2, gy + u * 0.1, 0, gy + u * 0.2); g.closePath(); g.fill();
    tree(g, P, xl - u * 0.5, gy - u * 0.1, 1.5, "#4f9a4a");
    // Banc.
    const bx = xr + u * 0.1;
    box(g, P, bx, gy - u * 0.42, u * 0.8, u * 0.05, "#a8714a");
    box(g, P, bx, gy - u * 0.32, u * 0.8, u * 0.05, "#a8714a");
    box(g, P, bx, gy - u * 0.22, u * 0.8, u * 0.05, "#a8714a");
    box(g, P, bx + u * 0.08, gy - u * 0.17, u * 0.04, u * 0.17, "#3b4250");
    box(g, P, bx + u * 0.68, gy - u * 0.17, u * 0.04, u * 0.17, "#3b4250");
    streetLamp(g, P, xr - u * 0.05, gy - u * 0.05, u * 1.2);
    bush(g, P, xl + u * 0.02, gy - u * 0.05, 0.6, "#4c9a4f");
    for (let k = 0; k < 12; k++) { const x = P.r() * W, y = bY + u * 0.05 + P.r() * u * 0.2; circle(g, P, x, y, u * 0.015, ["#ff6b8b", "#ffd166", "#ffffff"][k % 3], false); }
  },

  gym(g, P) {
    const { W, u, bY, gy, xl, xr } = P;
    paintRoom(g, P, { wall: "#e9eef2", lower: "#f28c38", floor: "#4a4f57", floorKind: "tiles", floorLine: "rgba(255,255,255,0.08)", trim: "#2b2f36" });
    box(g, P, W / 2 - u * 0.45, bY - u * 1.85, u * 0.9, u * 0.35, "#2b2f36");
    text(g, P, "GYM", W / 2, bY - u * 1.675, u * 0.2, "#f28c38");
    // Espalier.
    const ex = xl - u * 0.6;
    box(g, P, ex, bY - u * 1.5, u * 0.05, u * 1.5, "#c9a15d");
    box(g, P, ex + u * 0.45, bY - u * 1.5, u * 0.05, u * 1.5, "#c9a15d");
    for (let y = bY - u * 1.4; y < bY; y += u * 0.15) box(g, P, ex, y, u * 0.5, u * 0.03, "#d9b06d", P.lw * 0.5);
    // Râtelier d'haltères.
    const rx = xr + u * 0.1;
    box(g, P, rx, bY - u * 0.55, u * 0.8, u * 0.04, "#555");
    box(g, P, rx, bY - u * 0.3, u * 0.8, u * 0.04, "#555");
    box(g, P, rx + u * 0.02, bY - u * 0.55, u * 0.04, u * 0.55, "#555");
    box(g, P, rx + u * 0.74, bY - u * 0.55, u * 0.04, u * 0.55, "#555");
    for (let k = 0; k < 4; k++) for (const y of [bY - u * 0.6, bY - u * 0.35]) { const x = rx + u * (0.13 + k * 0.18); box(g, P, x - u * 0.06, y - u * 0.01, u * 0.12, u * 0.02, "#888", P.lw * 0.4); circle(g, P, x - u * 0.06, y, u * 0.035, "#2b2f36", P.lw * 0.5); circle(g, P, x + u * 0.06, y, u * 0.035, "#2b2f36", P.lw * 0.5); }
    // Kettlebells et ballon.
    for (const [x, c] of [[xl - u * 0.02, "#e63946"], [xl + u * 0.1, "#2a9d8f"]]) { circle(g, P, x, gy - u * 0.05, u * 0.05, c, P.lw * 0.6); g.strokeStyle = P.ink; g.lineWidth = P.lw; g.beginPath(); g.arc(x, gy - u * 0.1, u * 0.03, Math.PI, 0); g.stroke(); }
    circle(g, P, xr + u * 0.05, gy - u * 0.12, u * 0.12, "#4f86c6");
    clock(g, P, xr + u * 0.5, bY - u * 1.3, u * 0.09);
  },
};

// ——— Météo : particules dessinées à chaque image, ne dépendant que de t (export reproductible) ———

/** Nombre pseudo-aléatoire stable dans [0, 1[ pour la particule i. */
function hash01(i, k) {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

let fogSmall = null, fogCache = null;
const canvasOf = (w, h) => {
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};
/** Nappe de brouillard, préparée une fois à la taille de l'image (ensuite simple copie à chaque image). */
function fogTexture(W, h) {
  if (fogCache && fogCache.width === W && fogCache.height === h) return fogCache;
  if (!fogSmall) fogSmall = fogBlobs();
  fogCache = canvasOf(W, h);
  fogCache.getContext("2d").drawImage(fogSmall, 0, 0, W, h);
  return fogCache;
}

function fogBlobs() {
  const c = canvasOf(256, 128);
  const g = c.getContext("2d");
  for (let i = 0; i < 26; i++) {
    const x = hash01(i, 1) * 256, y = 44 + hash01(i, 2) * 40, r = 18 + hash01(i, 3) * 24;
    for (const dx of [-256, 0, 256]) {
      const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.32)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  }
  return c;
}

/** Instant (0..1) de l'éclair d'orage à t, ou 0. */
function lightningAt(t) {
  const P = 3.4, n = Math.floor(t / P);
  if (hash01(n, 9) > 0.7) return 0;
  const t0 = n * P + 0.4 + hash01(n, 10) * 2.2, d = t - t0;
  if (d < 0 || d > 0.5) return 0;
  // Deux éclats rapprochés.
  return Math.max(0, 1 - d / 0.12) + (d > 0.18 ? Math.max(0, 0.7 - (d - 0.18) / 0.3) : 0);
}

/**
 * Dessine la météo. layer 0 : derrière les personnages (particules lointaines), 1 : devant (proches).
 * color : décor en couleur (style dessin), sinon décor sombre (personnage blanc).
 */
function drawWeather(ctx, W, H, kind, t, layer, color) {
  if (!kind || kind === "none") return;
  // Les tailles suivent le cadre : le nombre de particules ne dépend que de sa forme (pas de sa résolution).
  const S = Math.min(W, H), area = (W * H) / (S * S) / 1.78;
  const near = layer === 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (kind === "rain" || kind === "storm") {
    if (!near) {
      // Ciel couvert.
      ctx.fillStyle = kind === "storm" ? "rgba(15,20,40,0.3)" : color ? "rgba(60,70,95,0.24)" : "rgba(40,50,75,0.16)";
      ctx.fillRect(0, 0, W, H);
    }
    const n = Math.round((near ? 60 : 160) * area * (kind === "storm" ? 1.5 : 1));
    const len = H * (near ? 0.05 : 0.03), slant = kind === "storm" ? 0.35 : 0.18;
    ctx.strokeStyle = color ? (near ? "rgba(70,100,160,0.45)" : "rgba(80,110,170,0.35)") : near ? "rgba(210,225,255,0.4)" : "rgba(190,205,255,0.28)";
    ctx.lineWidth = Math.max(1, S * (near ? 0.004 : 0.0025));
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = H * (near ? 2.2 : 1.5) * (0.85 + hash01(i, 2 + layer) * 0.3);
      const y = ((hash01(i, 3 + layer) * H * 1.2 + sp * t) % (H * 1.2)) - H * 0.1;
      const x = ((hash01(i, 1 + layer) * W * 1.3 + slant * sp * t) % (W * 1.3)) - W * 0.15;
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * slant, y - len);
    }
    ctx.stroke();
    if (kind === "storm") {
      const f = lightningAt(t);
      if (f > 0) {
        if (!near) {
          // Éclair zébré dans le ciel.
          const n0 = Math.floor(t / 3.4);
          let x = W * (0.2 + hash01(n0, 11) * 0.6), y = 0;
          ctx.strokeStyle = `rgba(255,255,240,${Math.min(1, f)})`;
          ctx.lineWidth = S * 0.006;
          ctx.shadowColor = "rgba(200,220,255,0.9)";
          ctx.shadowBlur = S * 0.03;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let k = 0; k < 7; k++) { x += (hash01(n0 * 7 + k, 12) - 0.5) * S * 0.12; y += H * 0.06; ctx.lineTo(x, y); }
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = `rgba(230,235,255,${Math.min(0.5, f * 0.4)})`;
          ctx.fillRect(0, 0, W, H);
        }
      }
    }
  } else if (kind === "snow") {
    const n = Math.round((near ? 50 : 140) * area);
    ctx.fillStyle = near ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.7)";
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = H * (near ? 0.12 : 0.07) * (0.7 + hash01(i, 4 + layer) * 0.6);
      const y = ((hash01(i, 5 + layer) * H * 1.1 + sp * t) % (H * 1.1)) - H * 0.05;
      const x = ((hash01(i, 6 + layer) * W + Math.sin(t * 0.9 + i) * S * 0.025) % W + W) % W;
      const r = S * (near ? 0.011 : 0.006) * (0.6 + hash01(i, 7) * 0.8);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fill();
  } else if (kind === "leaves" || kind === "petals") {
    const petals = kind === "petals";
    const cols = petals ? ["#ffc4d6", "#ff9fbf", "#fff0f5"] : ["#e07b39", "#c94f2f", "#e8b64a"];
    const n = Math.round((near ? (petals ? 18 : 12) : petals ? 36 : 22) * area);
    const size = S * (petals ? 0.013 : 0.022) * (near ? 1.5 : 1);
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = cols[c];
      ctx.beginPath();
      for (let i = c; i < n; i += 3) {
        const sp = H * (near ? 0.16 : 0.1) * (0.7 + hash01(i, 8 + layer) * 0.6);
        const wind = W * (petals ? 0.05 : 0.12);
        const y = ((hash01(i, 9 + layer) * H * 1.2 + sp * t) % (H * 1.2)) - H * 0.1;
        const x = (((hash01(i, 10 + layer) * W * 1.4 + wind * t + Math.sin(t * 1.3 + i * 2) * S * 0.04) % (W * 1.4)) + W * 1.4) % (W * 1.4) - W * 0.2;
        const rot = t * (1.5 + hash01(i, 11) * 2) + i;
        const sq = 0.35 + 0.65 * Math.abs(Math.cos(t * 2.1 + i));
        ctx.moveTo(x + size, y);
        ctx.ellipse(x, y, size, size * 0.5 * sq, rot, 0, TAU);
      }
      ctx.fill();
    }
  } else if (kind === "confetti") {
    const cols = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"];
    const n = Math.round((near ? 40 : 70) * area);
    const s = S * (near ? 0.018 : 0.012);
    for (let c = 0; c < cols.length; c++) {
      ctx.fillStyle = cols[c];
      ctx.beginPath();
      for (let i = c; i < n; i += cols.length) {
        const sp = H * (near ? 0.22 : 0.14) * (0.7 + hash01(i, 12 + layer) * 0.6);
        const y = ((hash01(i, 13 + layer) * H * 1.2 + sp * t) % (H * 1.2)) - H * 0.1;
        const x = hash01(i, 14 + layer) * W + Math.sin(t * 2 + i) * S * 0.03;
        const a = t * (3 + hash01(i, 15) * 4) + i, flip = Math.cos(t * 5 + i * 1.7);
        const ca = Math.cos(a), sa = Math.sin(a), w = s, h = s * 0.55 * flip;
        ctx.moveTo(x + ca * w - sa * h, y + sa * w + ca * h);
        ctx.lineTo(x - ca * w - sa * h, y - sa * w + ca * h);
        ctx.lineTo(x - ca * w + sa * h, y - sa * w - ca * h);
        ctx.lineTo(x + ca * w + sa * h, y + sa * w - ca * h);
        ctx.closePath();
      }
      ctx.fill();
    }
  } else if (kind === "fog") {
    const tex = fogTexture(W, Math.round(H * 0.55));
    const off = Math.round((t * W * 0.03 * (near ? 1.6 : 1)) % W);
    ctx.globalAlpha = near ? (color ? 0.35 : 0.22) : color ? 0.8 : 0.55;
    const y = Math.round(near ? H * 0.55 : H * 0.32);
    ctx.drawImage(tex, -off, y);
    ctx.drawImage(tex, W - off, y);
    if (!near) {
      ctx.globalAlpha = 1;
      const gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, color ? "rgba(225,230,238,0.25)" : "rgba(160,170,200,0.08)");
      gr.addColorStop(1, color ? "rgba(225,230,238,0.45)" : "rgba(160,170,200,0.16)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
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
  let starts = [];
  weights.reduce((acc, w) => { starts.push(lead + (acc / totalW) * span); return acc + w; }, 0);
  starts.push(lead + span);
  // Son importé retranscrit : chaque mot apparaît à l'instant exact où il est prononcé.
  const timed = scene.words;
  if (Array.isArray(timed) && timed.length) {
    const n = words.length, m = timed.length;
    starts = words.map((_, i) => timed[Math.min(m - 1, Math.round((i * (m - 1)) / Math.max(1, n - 1)))].t);
    for (let i = 1; i < n; i++) starts[i] = Math.max(starts[i], starts[i - 1]);
    starts.push(Math.max(starts[n - 1] + 0.05, timed[m - 1].e));
  }
  const space = ctx.measureText(" ").width;
  // Le bloc reste entier dans l'image, même long et placé en bas (aucune ligne coupée).
  const top = Math.max(H * 0.02, Math.min(L.captionY - total / 2, H * 0.975 - total));

  // Nom de celui qui parle (dialogues).
  if (scene.speakerName && settings.speakerLabels !== false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = fontCss("montserrat", size * 0.5);
    ctx.textAlign = "center";
    ctx.fillStyle = SPEAKER_COLORS[scene.person ?? scene.speaker] ?? accent;
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

// Son importé (mode audio / vidéo → dessin animé) : volume de la voix pour animer la bouche.
let lip = null;
/** data = { env: Float32Array (0..1), rate: valeurs par seconde } ou null. */
export function setLipSync(data) { lip = data; }

/** Forme de la bouche (A, E, O, M, F, C) d'après les mots retranscrits, ou null. */
export function lipShape(t) {
  return lip?.visemes?.length ? shapeAt(lip.visemes, t) : null;
}

/** Ouverture de la bouche selon la forme du son (la voix forte ouvre plus, M ferme toujours). */
const SHAPE_OPEN = { A: 1, E: 0.55, O: 0.75, M: 0.04, F: 0.18, C: 0.42 };

/** Ouverture de la bouche (0..1) d'après le volume réel de la voix à l'instant t (s). */
export function lipLevel(t) {
  if (!lip) return 0;
  const i = t * lip.rate;
  const a = Math.floor(i);
  let v = 0, n = 0;
  for (let k = a - 1; k <= a + 1; k++) if (k >= 0 && k < lip.env.length) { v += lip.env[k]; n++; }
  v = n ? v / n : 0;
  return v < 0.08 ? 0 : Math.min(1, Math.pow(v, 0.7) * 1.15);
}

/**
 * Bouche qui bouge pendant que le personnage parle (dialogue). level : volume réel (son importé).
 * L'expression reste (yeux, sourcils) : speaking: true et mouthOpen animent seulement la bouche.
 */
function talking(p, local, voiceStart, voiceEnd, level = null, shape = null) {
  const plain = p.face === "neutral" || p.face === "talk" || p.face === "closed";
  if (level != null) {
    if (level <= 0) return { ...p, speaking: false, mouthOpen: 0, mouthShape: null, face: p.face === "talk" ? "neutral" : p.face };
    const open = shape ? Math.min(1, SHAPE_OPEN[shape] * (0.55 + 0.6 * level)) : level;
    return { ...p, face: plain ? "talk" : p.face, speaking: true, mouthOpen: open, mouthShape: shape };
  }
  if (local < voiceStart || local > voiceEnd) return p;
  const m = Math.abs(Math.sin(local * 11)) * 0.7 + Math.abs(Math.sin(local * 4.3)) * 0.3;
  return { ...p, face: plain ? "talk" : p.face, speaking: true, mouthOpen: m };
}

/** Actions où les yeux sont fermés exprès (dormir, méditer…) : l'expression auto ne s'y applique pas. */
const CLOSED_ACTIONS = new Set(["sleep", "tired", "meditate", "calm"]);

/**
 * Expressions des deux personnages à l'écran. scene.expr : personnage 1, scene.expr2 : personnage 2
 * (« auto » ou absent : déduite du texte). L'émotion détectée va à celui qui parle (sinon à l'acteur) ;
 * dans un dialogue, l'autre réagit (surpris → choqué, triste → inquiet…).
 */
export function sceneFaces(s, detected, action, duo) {
  const m0 = s.expr && s.expr !== "auto" ? s.expr : null;
  const m1 = s.expr2 && s.expr2 !== "auto" ? s.expr2 : null;
  const auto = [null, null];
  if (detected && s.kind !== "pause" && !CLOSED_ACTIONS.has(action)) {
    const k = duo && s.speaker === 1 ? 1 : 0;
    auto[k] = detected;
    if (duo && (s.speaker === 0 || s.speaker === 1)) auto[1 - k] = reactionTo(detected, s.seed ?? 0);
  }
  return { faces: [m0 ?? auto[0], m1 ?? auto[1]], manual: [!!m0, !!m1] };
}

/** Applique une expression à une pose (le clignement des yeux et les yeux fermés voulus sont gardés). */
function withFace(p, expr, manual, action) {
  if (!p || !expr) return p;
  if (p.face === "closed" && !(manual && CLOSED_ACTIONS.has(action))) return p;
  return { ...p, face: expr, expr };
}

/** Nombre de personnages d'une scène de groupe (3 à 6), ou 0 pour une scène à un ou deux personnages. */
export function groupSize(s, count) {
  if (!s || s.kind !== "scene") return 0;
  if (s.figures >= 3) return Math.min(6, s.figures);
  if (s.figures == null && s.group && s.speaker == null && count >= 3) return Math.min(4, count);
  return 0;
}

/**
 * Scène de groupe : tout le monde joue l'action, avec un léger décalage ; pour une action à deux, les deux
 * personnages du milieu la jouent et les autres écoutent. Renvoie les poses dans l'ordre de gauche à droite.
 */
function groupPoses(item, localIn, n, detected, gap) {
  const s = item.scene;
  const local = sceneFx(s) === "slow" ? localIn * 0.45 : localIn;
  const r = rng(s.seed)();
  const action = s.action;
  const pair = DUO_ACTIONS.has(action) || action === "speak";
  const fc = sceneFaces(s, detected, action, false);
  const mid = (n - 1) / 2, a = Math.floor(mid), b = a + 1;
  return Array.from({ length: n }, (_, i) => {
    const ri = (r + i * 0.37) % 1;
    let p;
    if (pair && (i === a || i === b)) {
      p = livelyPose(action, local + (i === b ? 0.37 : 0), ri, i === b ? 1 : 0, gap);
      p = { ...p, dx: Math.min(p.dx ?? 0, gap * 0.4) }; // les deux du milieu se rapprochent sans se chevaucher
    }
    else {
      p = livelyPose(pair ? "listen" : action, local + i * 0.23, ri, 0);
      p = { ...p, dx: (p.dx ?? 0) * 0.25 }; // en groupe, on bouge sur place pour ne pas se marcher dessus
    }
    p = withFace(p, fc.faces[0], fc.manual[0], action);
    // Chacun regarde vers le milieu du groupe (les deux du milieu se font face).
    const facing = pair ? (i <= a ? 1 : -1) : i < mid ? 1 : i > mid ? -1 : (s.seed & 1 ? 1 : -1);
    return orient(p, facing);
  });
}

/** Poses des deux personnages pour un élément de la timeline à son temps local. */
function scenePoses(item, localIn, detected = null, gap = undefined) {
  const s = item.scene;
  // Ralenti : les gestes vont deux fois moins vite.
  const local = sceneFx(s) === "slow" ? localIn * 0.45 : localIn;
  const r = rng(s.seed)();
  const action = s.kind === "title" || s.kind === "outro" ? (s.action === "idle" ? "wave" : s.action) : s.kind === "pause" ? "idle" : s.action;
  const duo = s.figures ? s.figures === 2 : DUO_ACTIONS.has(action);
  const pos = s.pos && s.pos !== "auto" ? s.pos : null;
  const flip = !duo && !pos && s.kind !== "title" && rng(s.seed + 11)() < 0.35 && !["walk", "run", "alone"].includes(action);
  // L'acteur joue l'action ; l'autre personnage réagit (rôle 2 des actions à deux) ou écoute.
  const actor = livelyPose(action, local, r, 0, gap);
  const other = duo ? livelyPose(DUO_ACTIONS.has(action) || action === "speak" ? action : "listen", local + 0.37, (r * 7.3) % 1, 1, gap) : null;
  let p0 = actor, p1 = other;
  if (duo && s.speaker === 1) { p0 = other; p1 = actor; }
  // Expressions du visage (choisies dans l'éditeur ou déduites du texte).
  const fc = sceneFaces(s, detected, action, duo);
  p0 = withFace(p0, fc.faces[0], fc.manual[0], action);
  if (p1) p1 = withFace(p1, fc.faces[1], fc.manual[1], action);
  // Celui qui parle remue la bouche pendant sa réplique.
  if (s.speaker === 0 || s.speaker === 1) {
    const vs = VOICE_LEAD, ve = item.voiceDur != null ? VOICE_LEAD + item.voiceDur : item.duration * 0.8;
    const g = item.start + localIn;
    const level = s.dub && lip ? lipLevel(g) : null;
    const shape = s.dub && lip ? lipShape(g) : null;
    if (s.speaker === 0) p0 = talking(p0, localIn, vs, ve, level, shape);
    else if (p1) p1 = talking(p1, localIn, vs, ve, level, shape);
  }
  return { p0, p1, duo, flip, pos };
}

/**
 * Pose avec mouvement secondaire : la tête et les bras suivent le buste avec un petit retard
 * (inertie), et le corps s'étire en montant / s'écrase en retombant.
 */
function livelyPose(action, local, r, role, gap) {
  const p = poseAt(action, local, r, role, gap);
  const DT = 0.1;
  const q = poseAt(action, local - DT, r, role, gap);
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

/** Proportions du style « dessin ». */
export function sketchMorph(c = {}) {
  return { ...c, headSize: (c.headSize ?? 1) * 1.65, torso: (c.torso ?? 1) * 0.85 };
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
function camera(item, local, W, H, L, focusX, push = null) {
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
      const base = { zoom: zoomFrom + (zoomTo - zoomFrom) * u, x: W / 2 + (rr() - 0.5) * W * 0.03 * u, y: midY };
      if (!push) return base;
      // Émotion : on s'approche doucement du visage pour que l'expression se voie bien.
      const e = smooth((local - 0.25) / 1.1);
      const Z = 1.5 + 0.04 * smooth((local - 1.35) / Math.max(0.5, item.duration - 1.35));
      return { zoom: base.zoom + (Z - base.zoom) * e, x: base.x + (push.x - base.x) * e, y: base.y + (push.y - base.y) * e };
    }
  }
}

// Effet et transition déduits du texte (gardés en mémoire : le texte ne change pas d'une image à l'autre).
const fxCache = new Map();
function autoOf(text) {
  let v = fxCache.get(text);
  if (!v) {
    if (fxCache.size > 500) fxCache.clear();
    v = { fx: detectFx(text), tr: detectTransition(text), place: detectPlace(text), weather: detectWeather(text), time: detectTimeOfDay(text), expr: detectExpression(text) };
    fxCache.set(text, v);
  }
  return v;
}

/**
 * Ce que le texte décide pour chaque scène de la timeline (gardé en mémoire par timeline) :
 *  - place / time : lieu et moment détectés, qui restent pour les scènes suivantes jusqu'au prochain indice ;
 *  - weather : météo détectée, gardée 3 scènes (ou jusqu'au changement de lieu) ;
 *  - expr : émotion détectée dans la phrase ;
 *  - push : gros plan sur l'émotion (jamais deux scènes de suite, pour varier).
 */
const plans = new WeakMap();
function planOf(tl) {
  let sig = "";
  for (const it of tl.items) {
    const s = it.scene;
    sig += `${s.text ?? ""}\u0001${s.kind}\u0001${s.action}\u0001${s.camera ?? ""}\u0001${s.expr ?? ""}\u0001${s.expr2 ?? ""}\u0001${it.duration}\u0002`;
  }
  let pl = plans.get(tl);
  if (pl && pl.sig === sig) return pl;
  pl = { sig, place: [], time: [], weather: [], expr: [], push: [] };
  let place = null, time = null, weather = null, left = 0;
  tl.items.forEach((it, i) => {
    const s = it.scene;
    let expr = null;
    if (s.kind !== "pause") {
      const d = autoOf(s.text ?? "");
      if (d.place && d.place !== place) { place = d.place; left = 0; }
      if (d.time) time = d.time;
      if (d.weather) { weather = d.weather; left = 3; }
      if (s.kind !== "outro") expr = d.expr;
    }
    pl.place[i] = place;
    pl.time[i] = time;
    pl.weather[i] = left > 0 ? weather : null;
    left--;
    pl.expr[i] = expr;
    const manual = [s.expr, s.expr2].some((e) => e && e !== "auto" && e !== "neutral");
    pl.push[i] = s.kind === "scene" && (!s.camera || s.camera === "auto") && it.duration >= 2 && !pl.push[i - 1]
      && (manual || (!!expr && !CLOSED_ACTIONS.has(s.action)));
  });
  plans.set(tl, pl);
  return pl;
}

/** Lieu, couleurs, moment de la journée et météo d'une scène (index : sa place dans la timeline). */
export function sceneSetting(settings, scene, tl, index) {
  const plan = tl && index != null ? planOf(tl) : null;
  const sceneBg = scene?.bg && scene.bg !== "auto" ? scene.bg : null;
  const theme = sceneBg && THEMES[sceneBg] ? sceneBg : settings.theme;
  const mode = settings.figureStyle === "sketch" ? "color" : "dark";
  let backdrop = settings.backdrop ?? "none";
  if (sceneBg && BACKDROPS[sceneBg]) backdrop = sceneBg;
  else if (settings.autoPlace !== false && backdrop !== "image" && plan?.place[index]) backdrop = plan.place[index];
  const illus = illustrationOf(backdrop, mode);
  let tod = settings.timeOfDay && settings.timeOfDay !== "auto" && TIMES_OF_DAY[settings.timeOfDay] ? settings.timeOfDay : null;
  if (!tod) tod = plan?.time[index] ?? (backdrop === "street" || backdrop === "sky" || mode === "dark" ? "night" : "day");
  // Météo : choisie pour la scène, sinon réglage général, sinon déduite du texte (pas de pluie auto dans une pièce).
  let weather = null;
  const sw = scene?.weather, gw = settings.weather;
  if (sw && sw !== "auto") weather = sw;
  else if (gw && gw !== "auto") weather = gw;
  else if (plan?.weather[index]) {
    weather = plan.weather[index];
    if ((INDOOR.has(illus ?? backdrop) || backdrop === "stage" || backdrop === "space" || backdrop === "room") && weather !== "confetti") weather = null;
  }
  if (!WEATHERS[weather] || weather === "none" || weather === "auto") weather = null;
  return { theme, backdrop, mode, tod: illus ? tod : "night", weather, illustrated: !!illus };
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
  const L = layout(W, H, settings.captionPos, settings.figureStyle === "sketch");
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const at = sceneAt(tl, Math.min(t, Math.max(0, tl.total - 1e-3)));
  const scene = at?.item.scene;
  const set = sceneSetting(settings, scene, tl, at?.index);
  const { theme, backdrop } = set;
  if (!at) {
    drawBackground(ctx, W, H, L, theme, backdrop, settings.bgImage, set.mode, set.tod);
    drawWeather(ctx, W, H, set.weather, t, 0, set.mode === "color");
    drawLogo(ctx, W, H, settings);
    ctx.restore();
    return;
  }
  const { item, index, local } = at;
  const plan = planOf(tl);
  // Écart entre les deux personnages (en hauteurs de personnage) : les gestes à deux se rejoignent.
  const duoGap = Math.min(W * 0.17, L.figH * 0.62);
  const gap = (2 * duoGap) / L.figH;
  const cur = scenePoses(item, local, plan.expr[index], gap);
  // Transition douce depuis la fin de la scène précédente.
  const BLEND = 0.55;
  let k = 1, prev = null;
  if (index > 0 && local < BLEND) {
    const pi = tl.items[index - 1];
    prev = scenePoses(pi, pi.duration, plan.expr[index - 1], gap);
    k = easeOutBack(local / BLEND);
  }

  // Style « dessin » : grosse tête, buste plus court (proportions des dessins animés de référence).
  const sketch = settings.figureStyle === "sketch";
  const allChars = (settings.characters ?? [{}, {}]).map((c) => (sketch ? sketchMorph(c) : c));
  // Distribution : quelles personnes sont à l'écran (mode dessin animé à 3 ou 4 personnes : duos alternés).
  const castOf = (sc) => (Array.isArray(sc?.cast) && sc.cast.length ? sc.cast : [0, 1]);
  const cast = castOf(item.scene);
  const chars = [allChars[cast[0]] ?? allChars[0] ?? {}, allChars[cast[1]] ?? allChars[1] ?? allChars[0] ?? {}];
  const duoNow = cur.duo, duoPrev = prev?.duo ?? duoNow;
  const duoAmt = Math.min(1, Math.max(0, prev ? (duoPrev ? 1 : 0) + ((duoNow ? 1 : 0) - (duoPrev ? 1 : 0)) * k : duoNow ? 1 : 0));
  const kk = Math.min(1, Math.max(0, k));
  const solo = soloX(W, cur.pos), soloPrev = prev ? soloX(W, prev.pos) : solo;
  const soloNow = soloPrev + (solo - soloPrev) * kk;
  const x0 = soloNow + (W / 2 - duoGap - soloNow) * duoAmt;
  const x1 = W / 2 + duoGap;

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
  const J0 = figureJoints(p0, chars[0], x0, L.groundY, L.figH, sketch);
  const J1 = p1 ? figureJoints(p1, chars[1], x1, L.groundY, L.figH, sketch) : null;

  // Scène de groupe (3 personnages ou plus).
  const gN = groupSize(item.scene, allChars.length);
  // Caméra (vise celui qui parle en gros plan ; gros plan doux sur le visage quand la scène a une émotion).
  const focusX = gN ? W / 2 : item.scene.speaker === 1 ? x1 : x0;
  let push = null;
  if (plan.push[index] && settings.emotionCloseups !== false && !gN) {
    const s = item.scene;
    const who = J1 && cur.duo && (s.speaker === 1 || (s.speaker == null && !(s.expr && s.expr !== "auto") && s.expr2 && s.expr2 !== "auto")) ? J1 : J0;
    push = { x: who.headC[0], y: who.headC[1] + who.headR * 0.9 };
  }
  const cam = camera(item, local, W, H, L, focusX, push);
  const fx = sceneFx(item.scene);
  if (fx === "slow") cam.zoom *= 1 + 0.08 * smooth(local / item.duration);
  const [shx, shy] = shakeOffset(fx, item.scene.action, local, W);
  const cy = L.groundY - L.figH * 0.5;
  // Le décor suit le zoom de la caméra ; la météo lointaine passe devant le décor, derrière les personnages.
  drawBackground(ctx, W, H, L, theme, backdrop, settings.bgImage, set.mode, set.tod, { zoom: cam.zoom, x: W / 2 + shx - cam.x * cam.zoom, y: cy + shy - cam.y * cam.zoom });
  drawWeather(ctx, W, H, set.weather, t, 0, set.mode === "color");
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

  // Décors de l'action (mur, porte, escalier, lit…), dans le temps de la scène.
  const setT = fx === "slow" ? local * 0.45 : local;
  if (gN) {
    // Groupe : 3 à 6 personnages côte à côte, un peu plus petits, qui apparaissent en fondu.
    // Tout le groupe tient dans l'image : l'écart dépend de la largeur, la taille de l'écart (les têtes du
    // style dessin sont grosses).
    const spacing = (W * 0.8) / gN;
    const gh = Math.min(L.figH * (gN === 3 ? 0.82 : gN === 4 ? 0.72 : 0.6), spacing * (sketch ? 1.75 : 2.8));
    const poses = groupPoses(item, local, gN, plan.expr[index], spacing / gh);
    ctx.save();
    ctx.globalAlpha = index > 0 && local < BLEND && !groupSize(tl.items[index - 1].scene, allChars.length) ? Math.min(1, local / BLEND) : 1;
    poses.forEach((p, i) => {
      const x = W / 2 + (i - (gN - 1) / 2) * spacing, ch = allChars[i % allChars.length] ?? {};
      const q = { ...p, time: t };
      const J = figureJoints(q, ch, x, L.groundY, gh, sketch);
      if (q.set && i === 0) drawSetBehind(ctx, q, J, setT);
      shadow(x + (q.dx ?? 0) * gh, gh * 0.16);
      if (sketch) drawSketchFigure(ctx, q, ch, x, L.groundY, gh);
      else drawFigure(ctx, q, ch, x, L.groundY, gh, look);
      if (q.set && i === 0) drawSetFront(ctx, q, J, setT);
    });
    ctx.restore();
  } else {
    if (p0.set) drawSetBehind(ctx, p0, J0, setT);
    if (p1?.set) drawSetBehind(ctx, p1, J1, setT);
    if (p0.set === "mirror") drawMirror(ctx, p0, chars[0], x0, L, look, J0);
    shadow(x0 + (p0.dx ?? 0) * L.figH, L.figH * 0.16);
    // Second personnage (apparaît / disparaît en fondu).
    if (p1) {
      ctx.save();
      ctx.globalAlpha = duoAmt;
      shadow(x1 + (p1.dx ?? 0) * L.figH, L.figH * 0.16);
      if (sketch) drawSketchFigure(ctx, p1, chars[1], x1, L.groundY, L.figH);
      else drawFigure(ctx, p1, chars[1], x1, L.groundY, L.figH, look);
      ctx.restore();
    }
    if (sketch) drawSketchFigure(ctx, p0, chars[0], x0, L.groundY, L.figH);
    else drawFigure(ctx, p0, chars[0], x0, L.groundY, L.figH, look);
    if (p0.set) drawSetFront(ctx, p0, J0, setT);
    if (p1?.set) drawSetFront(ctx, p1, J1, setT);
    if (p1 && duoAmt > 0.5) {
      if (p0.set === "strings") drawStrings(ctx, J0, J1, setT);
      else if (p1.set === "strings") drawStrings(ctx, J1, J0, setT);
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Météo proche, devant les personnages.
  drawWeather(ctx, W, H, set.weather, t, 1, set.mode === "color");
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
