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
      last.words = [...(last.words ?? []), ...(s.words ?? [])];
    } else out.push({ ...s, words: [...(s.words ?? [])] });
  }
  return out;
}

// ---------- Phrases à partir des mots horodatés ----------

/** Mots → phrases (une réplique) : coupure à la ponctuation finale, sur un silence, ou si c'est trop long. */
export function sentencesFromWords(words, { maxGap = 0.55, maxLen = 8 } = {}) {
  const out = [];
  let cur = null;
  for (const w0 of words) {
    const w = { text: w0.text, start: w0.start ?? 0, end: w0.end ?? (w0.start ?? 0) + 0.3, region: w0.region };
    const prev = cur?.words[cur.words.length - 1];
    // Nouveau passage de parole (silence détecté entre les deux) : nouvelle réplique, la personne a pu changer.
    const cut = !cur || w.start - prev.end > maxGap || /[.?!…]["»”)]*$/.test(prev.text) || (w.region != null && w.region !== prev.region)
      || (w.end - cur.start > maxLen && /[,;:]$/.test(prev.text)) || w.end - cur.start > maxLen + 3;
    if (cut) { cur = { start: w.start, end: w.end, words: [w] }; out.push(cur); } else { cur.words.push(w); cur.end = w.end; }
  }
  return out.map((u) => ({ ...u, text: u.words.map((w) => w.text).join(" ").replace(/\s+([,.?!…;:])/g, "$1") }));
}

// ---------- Empreinte de la voix (MFCC) ----------

const FFT_N = 512;
let melBank = null;
function mel(sr) {
  if (melBank?.sr === sr) return melBank.f;
  const nMel = 26, toMel = (f) => 2595 * Math.log10(1 + f / 700), toHz = (m) => 700 * (10 ** (m / 2595) - 1);
  const lo = toMel(60), hi = toMel(Math.min(7600, sr / 2));
  const pts = Array.from({ length: nMel + 2 }, (_, i) => Math.floor(((FFT_N + 1) * toHz(lo + ((hi - lo) * i) / (nMel + 1))) / sr));
  const f = [];
  for (let m = 1; m <= nMel; m++) {
    const w = new Float32Array(FFT_N / 2 + 1);
    for (let k = pts[m - 1]; k < pts[m]; k++) w[k] = (k - pts[m - 1]) / Math.max(1, pts[m] - pts[m - 1]);
    for (let k = pts[m]; k < pts[m + 1]; k++) w[k] = (pts[m + 1] - k) / Math.max(1, pts[m + 1] - pts[m]);
    f.push(w);
  }
  melBank = { sr, f };
  return f;
}

/** Spectre de puissance d'une trame (FFT radix 2). */
function powerSpectrum(re) {
  const n = re.length, im = new Float32Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  const p = new Float32Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
  return p;
}

/** Empreinte d'un passage : moyenne et écart des coefficients MFCC 1 à 12 sur les trames parlées. */
export function voicePrint(samples, sr, seg) {
  const win = Math.round(sr * 0.025), hop = Math.round(sr * 0.01);
  const a0 = Math.max(0, Math.floor(seg.start * sr)), a1 = Math.min(samples.length, Math.floor(seg.end * sr));
  const bank = mel(sr);
  const frames = [], energies = [];
  for (let a = a0; a + win <= a1; a += hop) {
    let e = 0;
    for (let i = 0; i < win; i++) e += samples[a + i] * samples[a + i];
    energies.push(e);
    frames.push(a);
  }
  if (frames.length < 5) return null;
  const thr = percentile(energies, 0.5) * 0.4;
  const coeffs = [];
  const buf = new Float32Array(FFT_N);
  frames.forEach((a, fi) => {
    if (energies[fi] < thr) return;
    buf.fill(0);
    for (let i = 0; i < win; i++) buf[i] = (samples[a + i] - (i ? 0.97 * samples[a + i - 1] : 0)) * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (win - 1)));
    const p = powerSpectrum(buf);
    const logm = bank.map((w) => { let s = 1e-10; for (let k = 0; k < w.length; k++) if (w[k]) s += w[k] * p[k]; return Math.log(s); });
    const c = [];
    for (let q = 1; q <= 12; q++) {
      let s = 0;
      for (let m = 0; m < logm.length; m++) s += logm[m] * Math.cos((Math.PI * q * (m + 0.5)) / logm.length);
      c.push(s);
    }
    coeffs.push(c);
  });
  if (coeffs.length < 4) return null;
  const mean = new Array(12).fill(0), sd = new Array(12).fill(0);
  for (const c of coeffs) c.forEach((v, q) => { mean[q] += v / coeffs.length; });
  for (const c of coeffs) c.forEach((v, q) => { sd[q] += (v - mean[q]) ** 2 / coeffs.length; });
  const f = segmentFeatures(samples, sr, seg);
  return { mean, sd: sd.map(Math.sqrt), pitch: f.pitch, frames: coeffs.length };
}

/**
 * Regroupe les passages par voix (classification hiérarchique sur les empreintes).
 * speakers : nombre de personnes (1 à 4) ou "auto". Renvoie { labels, k, confident }.
 */
export function clusterVoices(prints, speakers = 2, embeddings = null, durations = null, gaps = null) {
  const n = prints.length;
  const useEmb = Array.isArray(embeddings) && embeddings.filter(Boolean).length >= 2;
  let idx = (useEmb ? embeddings : prints).map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  // Les répliques très courtes (« Salut ! ») ont une empreinte floue : on forme les groupes avec les
  // répliques nettes (≥ 1 s), puis on rattache les courtes à la voix la plus proche.
  let late = [];
  if (useEmb && durations) {
    const clear = idx.filter((i) => durations[i] >= 1);
    if (clear.length >= 2 && clear.length < idx.length) { late = idx.filter((i) => durations[i] < 1); idx = clear; }
  }
  const fixedK = speakers === "auto" ? null : Math.max(1, Math.min(4, Number(speakers) || 2));
  if (fixedK === 1 || idx.length < 2) return { labels: fillGaps(new Array(n).fill(idx.length ? 0 : -1)), k: 1, confident: true };
  let D;
  if (useEmb) {
    // Empreintes du modèle de reconnaissance de voix : distance = 1 − similarité (cosinus).
    const v = idx.map((i) => { const e = embeddings[i]; const nr = Math.hypot(...e) || 1; return e.map((x) => x / nr); });
    D = v.map((a) => v.map((b) => 1 - a.reduce((s, x, d) => s + x * b[d], 0)));
  } else {
    // Vecteurs centrés-réduits ; la hauteur de voix compte beaucoup (homme / femme / enfant).
    const raw = idx.map((i) => {
      const p = prints[i];
      return [...p.mean, ...p.sd.map((x) => x * 0.5), p.pitch > 0 ? Math.log2(p.pitch) : NaN];
    });
    const dims = raw[0].length;
    const pitchVals = raw.map((r) => r[dims - 1]).filter(Number.isFinite);
    const pitchMean = pitchVals.length ? pitchVals.reduce((a, b) => a + b, 0) / pitchVals.length : 0;
    for (const r of raw) if (!Number.isFinite(r[dims - 1])) r[dims - 1] = pitchMean;
    const z = raw.map((r) => r.slice());
    for (let d = 0; d < dims; d++) {
      const m = raw.reduce((a, r) => a + r[d], 0) / raw.length;
      const sd = Math.sqrt(raw.reduce((a, r) => a + (r[d] - m) ** 2, 0) / raw.length) || 1;
      const w = d === dims - 1 ? 2.2 : d < 12 ? 1 : 0.6;
      for (const r of z) r[d] = ((r[d] - m) / sd) * w;
    }
    // Échelle comparable aux empreintes : distance ramenée vers 0..2.
    const scale = Math.sqrt(dims) * 1.4;
    D = z.map((a) => z.map((b) => Math.hypot(...a.map((x, d) => x - b[d])) / scale));
  }
  // Classification hiérarchique (lien moyen).
  let clusters = idx.map((_, i) => [i]);
  const linkD = (A, B) => { let s = 0; for (const a of A) for (const b of B) s += D[a][b]; return s / (A.length * B.length); };
  const merges = [];
  while (clusters.length > (fixedK ?? 1)) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const d = linkD(clusters[i], clusters[j]);
      if (d < bd) { bd = d; bi = i; bj = j; }
    }
    merges.push({ d: bd, before: clusters.map((c) => c.slice()) });
    clusters[bi] = clusters[bi].concat(clusters[bj]);
    clusters.splice(bj, 1);
  }
  let chosen = clusters;
  if (!fixedK) {
    // Nombre de personnes « auto ». Seuil adapté à la conversation : les premières fusions réunissent des
    // passages d'une même voix ; on s'arrête quand une fusion est nettement plus lointaine (×1,5), et
    // toujours au-delà de 0,5 (empreintes). Mesuré sur de vraies voix : même personne ≤ 0,27, autres ≥ 0,29.
    let stop = 0.84;
    if (useEmb) {
      const half = merges.slice(0, Math.max(1, Math.ceil(merges.length / 2))).map((m) => m.d).sort((a, b) => a - b);
      const typical = half[Math.floor((half.length - 1) / 2)];
      stop = Math.max(0.26, Math.min(0.5, typical * 1.5));
    }
    chosen = [idx.map((_, i) => i)];
    for (const m of merges) {
      if (m.d > stop) { chosen = m.before.map((c) => c.slice()); break; }
    }
    if (chosen.length > 4) chosen = merges.find((m) => m.before.length === 4)?.before.map((c) => c.slice()) ?? chosen;
    // Une « personne » d'une seule réplique dont la voix reste assez proche d'une autre : c'est la même
    // (voix qui varie d'une phrase à l'autre), sauf si sa voix est franchement différente (> 0,5).
    if (idx.length >= 4) {
      for (let again = true; again && chosen.length > 1;) {
        again = false;
        const single = chosen.findIndex((c) => c.length === 1);
        if (single < 0) break;
        let near = -1, nd = Infinity;
        chosen.forEach((c, k) => { if (k !== single) { const d = linkD(chosen[single], c); if (d < nd) { nd = d; near = k; } } });
        if (nd < (useEmb ? 0.5 : 1)) { chosen[near] = chosen[near].concat(chosen[single]); chosen.splice(single, 1); again = true; }
      }
    }
  }
  // Séparation : distance entre groupes rapportée à la dispersion dans les groupes.
  let inter = 0, intra = 0, ni = 0, na = 0;
  chosen.forEach((A, a) => chosen.forEach((B, b) => {
    if (a < b) { inter += linkD(A, B); ni++; }
    if (a === b && A.length > 1) { intra += linkD(A, A); na++; }
  }));
  const sep = ni ? inter / ni / Math.max(useEmb ? 0.15 : 0.35, na ? intra / na : 1) : 99;
  const lab = new Array(n).fill(-1);
  chosen.forEach((c, k) => c.forEach((i) => { lab[idx[i]] = k; }));
  if (late.length) {
    const unit = (e) => { const nr = Math.hypot(...e) || 1; return e.map((x) => x / nr); };
    const groups = chosen.map((c) => c.map((i) => unit(embeddings[idx[i]])));
    for (const i of [...late].sort((a, b) => a - b)) {
      const v = unit(embeddings[i]);
      const dist = groups.map((g) => g.reduce((acc, u) => acc + (1 - u.reduce((s2, x, j) => s2 + x * v[j], 0)), 0) / g.length);
      let best = dist.indexOf(Math.min(...dist));
      // Réplique courte collée à la précédente (ou à la suivante) et voix hésitante : même personne qui continue.
      for (const nb of [i - 1, i + 1]) {
        if (nb < 0 || nb >= n || lab[nb] < 0) continue;
        const gap = gaps ? (nb < i ? gaps[i] : gaps[nb]) : null;
        if (gap != null && gap < 0.6 && dist[lab[nb]] - dist[best] < 0.12) { best = lab[nb]; break; }
      }
      lab[i] = best;
    }
  }
  // Numérotation dans l'ordre d'apparition (personne 1 = la première qui parle).
  const order = [];
  for (const l of lab) if (l >= 0 && !order.includes(l)) order.push(l);
  const labels = fillGaps(lab.map((l) => (l < 0 ? -1 : order.indexOf(l))));
  return { labels, k: chosen.length, confident: sep > 1.35, separation: sep, merges: merges.map((m) => +m.d.toFixed(3)) };
}

/** Passages sans empreinte (trop courts) : même personne que le passage précédent. */
function fillGaps(labels) {
  let last = labels.find((l) => l >= 0) ?? 0;
  return labels.map((l) => (l >= 0 ? (last = l) : last));
}

// ---------- Mise en scène à plusieurs ----------

/**
 * Chaque réplique montre celui qui parle et la personne à qui il répond (la dernière autre personne
 * qui a parlé) : à 3 ou 4 personnes, on alterne les duos comme un champ / contrechamp de cinéma.
 * cast = [personne à gauche, personne à droite] ; speaker = place (0 ou 1) de celui qui parle.
 */
export function castTurns(turns) {
  const persons = [...new Set(turns.map((t) => t.person))];
  return turns.map((t, i) => {
    let partner = null;
    for (let j = i - 1; j >= 0 && partner == null; j--) if (turns[j].person !== t.person) partner = turns[j].person;
    for (let j = i + 1; j < turns.length && partner == null; j++) if (turns[j].person !== t.person) partner = turns[j].person;
    if (partner == null || persons.length < 2) return { ...t, cast: [t.person], speaker: 0 };
    const cast = [t.person, partner].sort((a, b) => a - b);
    return { ...t, cast, speaker: cast.indexOf(t.person) };
  });
}

// ---------- Bouche : formes des sons (visèmes) ----------

/** Forme de bouche d'une lettre : A (grande ouverte), E (large), O (ronde), M (fermée), F (lèvre sur les dents), C (consonne). */
function letterShape(ch) {
  if ("aàâä".includes(ch)) return "A";
  if ("eéèêëiîïy".includes(ch)) return "E";
  if ("oôöuùûüw".includes(ch)) return "O";
  if ("mbp".includes(ch)) return "M";
  if ("fv".includes(ch)) return "F";
  return "C";
}

/** Formes de bouche au fil du temps, d'après les mots horodatés : [{ start, end, shape }]. */
export function visemesFromWords(words) {
  const out = [];
  for (const w of words) {
    const start = w.start ?? 0, end = w.end ?? start + 0.3;
    const letters = [...String(w.text).toLowerCase().normalize("NFC")].filter((c) => /\p{L}/u.test(c));
    // Lettres muettes de fin de mot (français : -e, -es, -s, -t, -nt) : pas de forme propre.
    let l = letters.join("").replace(/(es|e|s|t|nt|x|d)$/u, "");
    if (!l) l = letters.join("");
    const groups = [];
    for (const ch of l) {
      const sh = letterShape(ch);
      if (groups[groups.length - 1] !== sh) groups.push(sh);
    }
    if (!groups.length) continue;
    const step = (end - start) / groups.length;
    groups.forEach((sh, i) => out.push({ start: start + i * step, end: start + (i + 1) * step, shape: sh }));
  }
  return out;
}

/** Forme de bouche à l'instant t (null entre les mots). */
export function shapeAt(track, t) {
  let lo = 0, hi = track.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (track[mid].end < t) lo = mid + 1;
    else if (track[mid].start > t) hi = mid - 1;
    else return track[mid].shape;
  }
  return null;
}

/**
 * Scènes du dessin animé, calées exactement sur le son : chaque réplique est une scène
 * (le bon personnage parle, geste déduit des paroles), les silences sont des pauses.
 * La somme des durées est égale à la durée du son.
 */
export function buildDubScenes(turns, total, { names = [] } = {}) {
  const cast = castTurns(turns.map((t) => ({ ...t, person: t.person ?? t.speaker ?? 0 })));
  const scenes = [];
  let t = 0, i = 0, lastCast = [0, 1];
  const pause = (d) => scenes.push({ id: `d${scenes.length + 1}`, kind: "pause", text: "", action: "idle", auto: true, duration: d, figures: lastCast.length === 2 ? 2 : 1, cast: lastCast, seed: scenes.length + 7 });
  for (const tr of cast) {
    let start = Math.max(t, tr.start);
    if (start - t >= 0.3) pause(start - t);
    else start = t; // court silence : rattaché à la réplique
    const end = Math.max(start + 0.3, Math.min(total, tr.end));
    const text = tr.text || "";
    const found = text ? detectAction(text) : null;
    const action = found && TALK_GESTURES.has(found) ? found : "speak";
    scenes.push({
      id: `d${scenes.length + 1}`, kind: "scene", text, action, auto: true, duration: end - start, dub: true,
      person: tr.person, cast: tr.cast, figures: tr.cast.length, speaker: tr.speaker, speakerName: names[tr.person] ?? `${tr.person + 1}`,
      // Mots avec leur instant dans la scène : sous-titres mot à mot.
      words: (tr.words ?? []).map((w) => ({ text: w.text, t: Math.max(0, w.start - start), e: Math.max(0, (w.end ?? w.start + 0.3) - start) })),
      // Gros plan sur celui qui parle une fois sur deux (comme les vidéos de référence), pour les longues répliques.
      camera: end - start > 2.4 && i % 2 === 1 ? "close" : "auto", fx: "none", transition: "cut",
      seed: (Math.round(start * 1000) * 2654435761) >>> 0,
    });
    lastCast = tr.cast;
    t = end;
    i++;
  }
  if (total - t >= 0.3) pause(total - t);
  else if (scenes.length && total > t) scenes[scenes.length - 1].duration += total - t;
  return scenes;
}

/** Après une correction (qui parle), on recalcule les duos à l'écran et les noms. */
export function recastScenes(scenes, names = []) {
  const turns = scenes.filter((s) => s.kind === "scene").map((s) => ({ person: s.person ?? s.speaker ?? 0 }));
  const cast = castTurns(turns);
  let k = 0, lastCast = cast[0]?.cast ?? [0, 1];
  return scenes.map((s) => {
    if (s.kind !== "scene") return { ...s, cast: lastCast, figures: lastCast.length };
    const c = cast[k++];
    lastCast = c.cast;
    return { ...s, cast: c.cast, figures: c.cast.length, speaker: c.speaker, speakerName: names[c.person] ?? `${c.person + 1}` };
  });
}

/**
 * Calcul complet à partir d'un son mono : répliques, qui parle, texte, formes de bouche, scènes.
 * words : mots horodatés de la retranscription (facultatif). visual(unit) : personne vue en train
 * de parler sur la vidéo pendant ce passage, ou null (facultatif).
 */
/** Répliques à analyser : phrases de la retranscription, sinon passages de parole. */
export function dialogueUnits(samples, sr, { words = [], chunks = [] } = {}) {
  const rate = 50;
  const env = envelope(samples, sr, rate);
  const units = words.length ? sentencesFromWords(words) : attachText(voiceSegments(env, rate), chunks).map((u) => ({ ...u, words: [] }));
  return { env, rate, units };
}

export function analyzeDialogue(samples, sr, { speakers = 2, words = [], chunks = [], names = [], visual = null, embeddings = null, units: given = null } = {}) {
  const { env, rate, units: found } = dialogueUnits(samples, sr, { words, chunks });
  const units = given ?? found;
  const total = samples.length / sr;
  const prints = units.map((u) => voicePrint(samples, sr, u));
  const voice = clusterVoices(prints, speakers, embeddings, units.map((u) => u.end - u.start), units.map((u, i) => (i ? u.start - units[i - 1].end : null)));
  let labels = voice.labels, k = voice.k, confident = voice.confident;
  // La vidéo voit qui bouge la bouche : elle l'emporte sur la voix quand elle est sûre d'elle.
  if (visual) {
    const seen = units.map((u) => visual(u));
    const known = seen.filter((v) => v != null).length;
    if (known >= Math.max(1, units.length * 0.4)) {
      // Pour les passages non tranchés par l'image : groupe de voix → personne vue le plus souvent.
      const map = new Map();
      seen.forEach((v, i) => { if (v != null) { const key = `${labels[i]}>${v}`; map.set(key, (map.get(key) ?? 0) + 1); } });
      const bestFor = (lab) => {
        let best = null, n = 0;
        for (const [key, c] of map) { const [l, p] = key.split(">").map(Number); if (l === lab && c > n) { n = c; best = p; } }
        return best ?? lab;
      };
      labels = labels.map((l, i) => seen[i] ?? bestFor(l));
      k = Math.max(k, ...labels.map((l) => l + 1));
      confident = true;
    }
  }
  const turns = mergeTurns(units.map((u, i) => ({ ...u, speaker: labels[i], person: labels[i] })))
    .map((t) => ({ ...t, person: t.speaker }));
  const visemes = visemesFromWords(words);
  return { env, rate, units, turns, persons: k, confident, visemes, scenes: buildDubScenes(turns, total, { names }), total };
}
