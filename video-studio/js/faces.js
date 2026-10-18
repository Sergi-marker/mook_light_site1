// © la triche — Animots
// Ressemblance avec les vraies personnes : sur une vidéo, on repère les visages (MediaPipe Face Landmarker,
// Google, licence Apache 2.0, ≈ 4 Mo), on relève pour chaque personne la couleur de peau, de cheveux et
// de vêtements, et on mesure l'ouverture de sa bouche au fil du temps (qui parle, vu à l'image).

const VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarkerPromise = null;
function landmarker() {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, FaceLandmarker } = await import(VISION_URL);
    const files = await FilesetResolver.forVisionTasks(WASM_URL);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "IMAGE", numFaces: 4, outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 0.4,
    });
    try {
      return await FaceLandmarker.createFromOptions(files, opts("GPU"));
    } catch {
      return FaceLandmarker.createFromOptions(files, opts("CPU"));
    }
  })().catch((e) => { landmarkerPromise = null; throw e; });
  return landmarkerPromise;
}

// ---------- Couleurs ----------

/** Médiane de chaque canal des pixels d'un rectangle (coordonnées en pixels), ou null s'il sort de l'image. */
export function regionColor(img, x0, y0, x1, y1) {
  const { width: W, height: H, data } = img;
  const a = Math.max(0, Math.floor(Math.min(x0, x1))), b = Math.min(W, Math.ceil(Math.max(x0, x1)));
  const c = Math.max(0, Math.floor(Math.min(y0, y1))), d = Math.min(H, Math.ceil(Math.max(y0, y1)));
  if (b - a < 2 || d - c < 2) return null;
  const rs = [], gs = [], bs = [];
  const step = Math.max(1, Math.floor(Math.sqrt(((b - a) * (d - c)) / 400)));
  for (let y = c; y < d; y += step) for (let x = a; x < b; x += step) {
    const i = (y * W + x) * 4;
    rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
  }
  const med = (v) => v.sort((p, q) => p - q)[v.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

/** Couleur de peau : pixels de plusieurs zones, sans les reflets ni les ombres (on garde le milieu des luminosités). */
export function skinColor(img, points, r) {
  const { width: W, height: H, data } = img;
  const px = [];
  for (const [x, y] of points) {
    for (let dy = -r; dy <= r; dy += Math.max(1, r / 4)) for (let dx = -r; dx <= r; dx += Math.max(1, r / 4)) {
      const xx = Math.round(x + dx), yy = Math.round(y + dy);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = (yy * W + xx) * 4;
      px.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  if (px.length < 4) return null;
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  px.sort((p, q) => lum(p) - lum(q));
  const mid = px.slice(Math.floor(px.length * 0.25), Math.ceil(px.length * 0.6));
  return [0, 1, 2].map((k) => mid.reduce((a, c) => a + c[k], 0) / mid.length);
}

export const toHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const colorDist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const mix = (cols) => {
  const ok = cols.filter(Boolean);
  if (!ok.length) return null;
  return [0, 1, 2].map((k) => ok.map((c) => c[k]).sort((a, b) => a - b)[ok.length >> 1]);
};

/** Allure d'une personne vue sur une image : peau, cheveux (couleur, longs ou non), vêtement. */
export function lookFromFace(img, lm) {
  const W = img.width, H = img.height;
  const P = (i) => [lm[i].x * W, lm[i].y * H];
  const xs = lm.map((p) => p.x * W), ys = lm.map((p) => p.y * H);
  const fx0 = Math.min(...xs), fx1 = Math.max(...xs), fy0 = Math.min(...ys), fy1 = Math.max(...ys);
  const fw = fx1 - fx0, fh = fy1 - fy0;
  // Peau : joues (points 50 et 280) et front (point 151).
  // Peau : pommettes et joues (loin de la bouche et des yeux), sans reflets.
  const skin = skinColor(img, [P(116), P(345), P(123), P(352), P(206), P(426)], Math.max(2, fw * 0.04));
  // Cheveux : juste au-dessus du front ; longs si la même couleur se retrouve à côté des joues, sous les oreilles.
  const top = P(10);
  const hairTop = regionColor(img, top[0] - fw * 0.25, top[1] - fh * 0.32, top[0] + fw * 0.25, top[1] - fh * 0.12);
  const sideL = regionColor(img, fx0 - fw * 0.28, fy1 - fh * 0.35, fx0 - fw * 0.08, fy1);
  const sideR = regionColor(img, fx1 + fw * 0.08, fy1 - fh * 0.35, fx1 + fw * 0.28, fy1);
  // Vêtement : sous le menton (point 152).
  const chin = P(152);
  const clothes = regionColor(img, chin[0] - fw * 0.45, chin[1] + fh * 0.45, chin[0] + fw * 0.45, chin[1] + fh * 1.1);
  let hair = "none", hairColor = null;
  if (hairTop && skin && colorDist(hairTop, skin) > 45) {
    hairColor = hairTop;
    const longSides = [sideL, sideR].filter((sd) => sd && colorDist(sd, hairTop) < 40).length;
    hair = longSides === 2 ? "long" : "short";
  }
  return { skin, hair, hairColor, clothes, box: { x: fx0 / W, y: fy0 / H, w: fw / W, h: fh / H } };
}

/** Ouverture de la mâchoire (0..1) d'un visage détecté. */
function jawOf(blend) {
  const cat = blend?.categories?.find((c) => c.categoryName === "jawOpen");
  return cat ? cat.score : 0;
}

// ---------- Vidéo ----------

/**
 * Analyse une vidéo : visages repérés sur des images prises régulièrement.
 * Renvoie null s'il n'y a pas de visage, sinon
 * { people: [{ skin, hair, hairColor, clothes, x }], frames: [{ t, jaw: [par personne] }] } (personnes de gauche à droite).
 */
export async function analyzeFaces(file, duration, progress = () => {}, signal) {
  const lmk = await landmarker();
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error("VIDEO"));
    });
    if (!video.videoWidth) return null;
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    // 5 images par seconde (moins pour une longue vidéo : 600 images au plus).
    const fps = Math.min(5, 600 / Math.max(1, duration));
    const n = Math.max(1, Math.floor(duration * fps));
    const raw = [];
    for (let i = 0; i < n; i++) {
      if (signal?.aborted) throw new Error("ABORTED");
      const t = Math.min(duration - 0.05, (i + 0.5) / fps);
      await new Promise((resolve) => {
        video.onseeked = resolve;
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const res = lmk.detect(canvas);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const faces = (res.faceLandmarks ?? []).map((lm, k) => {
        const look = lookFromFace(img, lm);
        return { ...look, cx: look.box.x + look.box.w / 2, jaw: jawOf(res.faceBlendshapes?.[k]) };
      });
      raw.push({ t, faces });
      progress({ done: i + 1, total: n });
    }
    return groupPeople(raw);
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
  }
}

/**
 * Regroupe les visages vus sur toutes les images en personnes (par position horizontale, de gauche à droite),
 * avec leur allure moyenne et l'ouverture de la bouche image par image.
 */
export function groupPeople(raw) {
  const counts = raw.map((r) => r.faces.length).sort((a, b) => a - b);
  const k = Math.min(4, counts[Math.floor(counts.length * 0.8)] ?? 0);
  if (!k) return null;
  // Centres des personnes : moyennes 1D (k-moyennes sur la position horizontale des visages).
  const all = raw.flatMap((r) => r.faces.map((f) => f.cx)).sort((a, b) => a - b);
  let centers = Array.from({ length: k }, (_, i) => all[Math.floor(((i + 0.5) / k) * (all.length - 1))]);
  for (let it = 0; it < 15; it++) {
    const sums = centers.map(() => [0, 0]);
    for (const x of all) { const j = nearest(centers, x); sums[j][0] += x; sums[j][1]++; }
    centers = sums.map(([s, c], j) => (c ? s / c : centers[j]));
  }
  centers.sort((a, b) => a - b);
  const people = centers.map((x) => ({ x, looks: [] }));
  const frames = raw.map((r) => {
    const jaw = new Array(k).fill(null);
    for (const f of r.faces) {
      const j = nearest(centers, f.cx);
      if (jaw[j] == null || f.jaw > jaw[j]) jaw[j] = f.jaw;
      people[j].looks.push(f);
    }
    return { t: r.t, jaw };
  });
  return {
    frames,
    people: people.map((p) => {
      const hairVotes = p.looks.map((l) => l.hair);
      const hair = ["long", "short", "none"].sort((a, b) => hairVotes.filter((h) => h === b).length - hairVotes.filter((h) => h === a).length)[0];
      const pick = (key) => { const c = mix(p.looks.map((l) => l[key])); return c ? toHex(c) : null; };
      return { x: p.x, seen: p.looks.length, skin: pick("skin"), hair, hairColor: pick("hairColor"), clothes: pick("clothes") };
    }),
  };
}

const nearest = (centers, x) => centers.reduce((best, c, j) => (Math.abs(c - x) < Math.abs(centers[best] - x) ? j : best), 0);

/**
 * Personne qu'on voit parler entre start et end (s) : celle dont la bouche bouge le plus, nettement plus
 * que les autres. null si l'image ne permet pas de trancher.
 */
export function visualSpeaker(faces, start, end) {
  const act = faceActivity(faces, start, end);
  if (!act) return null;
  const order = act.map((a, j) => [a, j]).sort((a, b) => b[0] - a[0]);
  if (order[0][0] < 0.03) return null;
  if (act.length > 1 && order[0][0] < order[1][0] * 1.6) return null;
  return order[0][1];
}

/** Mouvement de la bouche de chaque personne entre start et end (s) : écart type de l'ouverture de la mâchoire. */
export function faceActivity(faces, start, end) {
  const fr = faces.frames.filter((f) => f.t >= start && f.t <= end);
  if (fr.length < 2) return null;
  return faces.people.map((_, j) => {
    const v = fr.map((f) => f.jaw[j]).filter((x) => x != null);
    if (v.length < 2) return 0;
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    // Une bouche qui parle s'ouvre et se ferme : on mesure ses variations (une bouche ouverte immobile ne parle pas).
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
  });
}

/**
 * Quelle personne de la vidéo correspond à chaque voix : celle dont la bouche bouge le plus pendant
 * que cette voix parle (meilleure attribution d'ensemble). Sans indice, de gauche à droite.
 * Renvoie un tableau : personne (voix) → numéro de visage.
 */
export function matchVoicesToFaces(faces, turns, voices) {
  const k = faces.people.length;
  const A = Array.from({ length: voices }, () => new Array(k).fill(0));
  for (const tr of turns) {
    const act = faceActivity(faces, tr.start, tr.end);
    if (act && tr.person < voices) act.forEach((a, j) => { A[tr.person][j] += a * (tr.end - tr.start); });
  }
  const perms = (arr, n) => (n === 0 ? [[]] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)], n - 1).map((q) => [x, ...q])));
  const faceIdx = [...Array(k).keys()];
  let best = null, bestScore = -1;
  for (const pm of perms(faceIdx, Math.min(voices, k))) {
    const score = pm.reduce((acc, f, v) => acc + A[v][f], 0);
    if (score > bestScore + 1e-9) { bestScore = score; best = pm; }
  }
  const map = new Array(voices).fill(null);
  (best ?? []).forEach((f, v) => { map[v] = f; });
  return map;
}

/** Gamme de tons de peau naturels, du plus clair au plus foncé (luminosité → couleur). */
const SKIN_SCALE = [[0.86, [246, 220, 196]], [0.74, [232, 185, 143]], [0.6, [198, 139, 94]], [0.46, [154, 100, 64]], [0.33, [110, 69, 41]], [0.2, [69, 41, 26]]];

/**
 * Ton de peau naturel de même luminosité que la couleur mesurée : l'éclairage ou une vieille photo
 * (teinte rouge, bleue…) ne donne jamais une peau de couleur étrange.
 */
export function naturalSkin(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const L = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  if (L >= SKIN_SCALE[0][0]) return toHex(SKIN_SCALE[0][1]);
  for (let i = 1; i < SKIN_SCALE.length; i++) {
    const [l1, c1] = SKIN_SCALE[i - 1], [l2, c2] = SKIN_SCALE[i];
    if (L >= l2) {
      const k = (l1 - L) / (l1 - l2);
      return toHex(c1.map((v, j) => v + (c2[j] - v) * k));
    }
  }
  return toHex(SKIN_SCALE[SKIN_SCALE.length - 1][1]);
}

/** Allure d'un personnage d'après une personne de la vidéo. */
export function morphFromPerson(base, person) {
  const out = { ...base };
  if (person.skin) out.color = naturalSkin(person.skin);
  if (person.hair) out.hair = person.hair;
  if (person.hairColor) out.detail = person.hairColor;
  if (person.clothes) { out.top = "tshirt"; out.topColor = person.clothes; }
  return out;
}
