// © la triche — Animots
// Audio / vidéo → dessin animé : on garde le son d'origine, on repère qui parle et quand,
// on retranscrit les paroles, puis chaque prise de parole devient une scène où le bon personnage
// parle, avec la bouche qui suit le volume de la voix. Les fonctions de calcul sont pures (testables sous Node).

import { detectAction } from "./script.js";

/** Gestes possibles pendant une conversation (le personnage reste à sa place, face à l'autre). */
export const TALK_GESTURES = new Set(["speak", "laugh", "angry", "sad", "cry", "surprised", "think", "confused", "idea", "shrug", "love", "celebrate", "wave", "anxious", "shame", "heartbreak", "calm", "argue", "point", "mock", "explode"]);

/** Volume de la voix au fil du temps : une valeur (0..1) tous les 1/rate s. */
export function envelope(samples, sr, rate = 50) {
  const hop = Math.max(1, Math.round(sr / rate));
  const n = Math.ceil(samples.length / hop);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const a = i * hop, b = Math.min(samples.length, a + hop);
    for (let j = a; j < b; j++) s += samples[j] * samples[j];
    env[i] = Math.sqrt(s / Math.max(1, b - a));
  }
  // Normalisation sur un niveau de parole « fort » (95e centile) : indépendant du volume d'enregistrement.
  const top = percentile(env, 0.95) || 1;
  for (let i = 0; i < n; i++) env[i] = Math.min(1, env[i] / top);
  return env;
}

export function percentile(arr, q) {
  if (!arr.length) return 0;
  const s = Float32Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
}

/**
 * Passages où quelqu'un parle : [{ start, end }] en secondes.
 * Seuil adaptatif (entre le bruit de fond et le niveau de parole), petits silences fusionnés.
 */
export function voiceSegments(env, rate = 50, { minSpeech = 0.25, minGap = 0.35, pad = 0.06 } = {}) {
  const floor = percentile(env, 0.15), speech = percentile(env, 0.9);
  const thr = floor + Math.max(0.04, (speech - floor) * 0.18);
  const raw = [];
  let start = -1;
  for (let i = 0; i <= env.length; i++) {
    const on = i < env.length && env[i] > thr;
    if (on && start < 0) start = i;
    if (!on && start >= 0) { raw.push([start / rate, i / rate]); start = -1; }
  }
  const merged = [];
  for (const [a, b] of raw) {
    const last = merged[merged.length - 1];
    if (last && a - last[1] < minGap) last[1] = b; else merged.push([a, b]);
  }
  const total = env.length / rate;
  return merged
    .filter(([a, b]) => b - a >= minSpeech)
    .map(([a, b]) => ({ start: Math.max(0, a - pad), end: Math.min(total, b + pad) }));
}

/** Hauteur de la voix (Hz) d'une trame, par autocorrélation ; 0 si non voisée. */
function framePitch(x, a, n, sr) {
  const minLag = Math.floor(sr / 400), maxLag = Math.floor(sr / 70);
  let e0 = 0;
  for (let i = 0; i < n; i++) e0 += x[a + i] * x[a + i];
  if (e0 < 1e-6 * n) return 0;
  let best = 0, bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i < n - lag; i += 2) c += x[a + i] * x[a + i + lag];
    if (c > best) { best = c; bestLag = lag; }
  }
  return best / (e0 / 2) > 0.3 && bestLag ? sr / bestLag : 0;
}

/** Empreinte d'une voix sur un passage : hauteur médiane (Hz) et brillance (taux de passage par zéro). */
export function segmentFeatures(samples, sr, seg) {
  const a0 = Math.floor(seg.start * sr), a1 = Math.min(samples.length, Math.floor(seg.end * sr));
  const n = Math.floor(sr * 0.04), hop = Math.floor(sr * 0.02);
  const pitches = [];
  let zc = 0, total = 0;
  for (let a = a0; a + n < a1; a += hop * 2) {
    const f = framePitch(samples, a, n, sr);
    if (f) pitches.push(f);
  }
  for (let i = a0 + 1; i < a1; i++) {
    if ((samples[i - 1] < 0) !== (samples[i] < 0)) zc++;
    total++;
  }
  pitches.sort((p, q) => p - q);
  return { pitch: pitches.length ? pitches[pitches.length >> 1] : 0, zcr: total ? zc / total : 0, voiced: pitches.length };
}

/**
 * Répartit les passages entre deux personnes (k-means sur la hauteur de voix et la brillance).
 * Si les deux voix se ressemblent trop, on alterne à chaque prise de parole (dialogue).
 * Renvoie { labels, confident }.
 */
export function clusterSpeakers(features, speakers = 2) {
  const n = features.length;
  if (speakers < 2 || n < 2) return { labels: new Array(n).fill(0), confident: true };
  const pts = features.map((f) => [f.pitch > 0 ? Math.log2(f.pitch) : NaN, f.zcr]);
  const good = pts.filter((p) => Number.isFinite(p[0]));
  if (good.length < 2) return { labels: features.map((_, i) => i % 2), confident: false };
  const meanZ = good.reduce((s, p) => s + p[1], 0) / good.length;
  const sdZ = Math.sqrt(good.reduce((s, p) => s + (p[1] - meanZ) ** 2, 0) / good.length) || 1;
  // Hauteur en octaves (1 = une octave), brillance moins influente.
  const feat = pts.map((p) => (Number.isFinite(p[0]) ? [p[0], ((p[1] - meanZ) / sdZ) * 0.15] : null));
  const vals = feat.filter(Boolean);
  let c = [vals.reduce((m, p) => (p[0] < m[0] ? p : m)), vals.reduce((m, p) => (p[0] > m[0] ? p : m))].map((p) => [...p]);
  let labels = new Array(n).fill(0);
  for (let it = 0; it < 20; it++) {
    labels = feat.map((p) => (p ? (dist(p, c[0]) <= dist(p, c[1]) ? 0 : 1) : -1));
    const next = [0, 1].map((k) => {
      const mine = feat.filter((p, i) => p && labels[i] === k);
      return mine.length ? [mine.reduce((s, p) => s + p[0], 0) / mine.length, mine.reduce((s, p) => s + p[1], 0) / mine.length] : c[k];
    });
    if (next.every((q, k) => dist(q, c[k]) < 1e-6)) break;
    c = next;
  }
  const gap = Math.abs(c[0][0] - c[1][0]); // écart de hauteur en octaves
  if (gap < 0.22) return { labels: features.map((_, i) => i % 2), confident: false };
  // Passages sans hauteur mesurable : même personne que le passage précédent.
  for (let i = 0; i < n; i++) if (labels[i] < 0) labels[i] = i ? labels[i - 1] : 0;
  // Personnage 1 = celui qui parle en premier.
  if (labels[0] === 1) labels = labels.map((l) => 1 - l);
  return { labels, confident: true };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Rattache le texte transcrit (morceaux horodatés) aux passages de parole. */
export function attachText(segments, chunks = []) {
  const out = segments.map((s) => ({ ...s, text: "" }));
  for (const ch of chunks) {
    if (!ch.text) continue;
    const a = ch.start ?? 0, b = ch.end ?? a + 2;
    let best = -1, bestOv = 0;
    out.forEach((s, i) => {
      const ov = Math.min(b, s.end) - Math.max(a, s.start);
      if (ov > bestOv) { bestOv = ov; best = i; }
    });
    if (best < 0) {
      // Pas de chevauchement : le passage le plus proche.
      let d = Infinity;
      out.forEach((s, i) => { const dd = Math.min(Math.abs(s.start - b), Math.abs(a - s.end)); if (dd < d) { d = dd; best = i; } });
    }
    if (best >= 0) out[best].text = `${out[best].text} ${ch.text}`.trim();
  }
  return out;
}

/** Passages consécutifs de la même personne, proches dans le temps : une seule scène. */
export function mergeTurns(segments, maxGap = 0.6, maxLen = 9) {
  const out = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (last && last.speaker === s.speaker && s.start - last.end < maxGap && s.end - last.start <= maxLen) {
      last.end = s.end;
      last.text = `${last.text} ${s.text}`.trim();
    } else out.push({ ...s });
  }
  return out;
}

/**
 * Scènes du dessin animé, calées exactement sur le son : chaque prise de parole est une scène
 * (le bon personnage parle, geste déduit des paroles), les silences sont des pauses.
 * La somme des durées est égale à la durée du son.
 */
export function buildDubScenes(turns, total, { speakers = 2, names = [] } = {}) {
  const scenes = [];
  let t = 0, i = 0;
  const pause = (d) => scenes.push({ id: `d${scenes.length + 1}`, kind: "pause", text: "", action: "idle", auto: true, duration: d, figures: speakers, seed: scenes.length + 7 });
  for (const tr of turns) {
    let start = Math.max(t, tr.start);
    if (start - t >= 0.3) pause(start - t);
    else start = t; // court silence : rattaché à la réplique
    const end = Math.max(start + 0.3, Math.min(total, tr.end));
    const text = tr.text || "";
    const found = text ? detectAction(text) : null;
    const action = found && TALK_GESTURES.has(found) ? found : "speak";
    const sp = speakers >= 2 ? tr.speaker ?? 0 : 0;
    scenes.push({
      id: `d${scenes.length + 1}`, kind: "scene", text, action, auto: true, duration: end - start, dub: true,
      figures: speakers >= 2 ? 2 : 1, speaker: sp, speakerName: names[sp] ?? `${sp + 1}`,
      // Gros plan sur celui qui parle une fois sur deux (comme les vidéos de référence), pour les longues répliques.
      camera: end - start > 2.4 && i % 2 === 1 ? "close" : "auto", fx: "none", transition: "cut",
      seed: (Math.round(start * 1000) * 2654435761) >>> 0,
    });
    t = end;
    i++;
  }
  if (total - t >= 0.3) pause(total - t);
  else if (scenes.length && total > t) scenes[scenes.length - 1].duration += total - t;
  return scenes;
}

/** Calcul complet à partir d'un son mono : passages, locuteurs, texte, scènes. */
export function analyzeDialogue(samples, sr, { speakers = 2, chunks = [], names = [] } = {}) {
  const rate = 50;
  const env = envelope(samples, sr, rate);
  const segs = voiceSegments(env, rate);
  const feats = segs.map((s) => segmentFeatures(samples, sr, s));
  const { labels, confident } = clusterSpeakers(feats, speakers);
  const withSpk = segs.map((s, i) => ({ ...s, speaker: labels[i] ?? 0 }));
  const turns = mergeTurns(attachText(withSpk, chunks));
  const total = samples.length / sr;
  return { env, rate, turns, confident, scenes: buildDubScenes(turns, total, { speakers, names }), total };
}
