// © la triche — Animots
// Effets de voix : hauteur (plus grave / plus aiguë) sans changer la vitesse, vitesse sans changer
// la hauteur, et couleur du son (douce et rassurante, radio, téléphone, écho, grande salle, robot…).
//
// Le traitement se fait une fois par phrase, hors temps réel : le son obtenu est le même dans
// l'aperçu et dans la vidéo exportée.

/** Préréglages : pitch (demi-tons), rate (vitesse), et chaîne d'effets. */
export const VOICE_FX = {
  natural: { label: ["Naturelle", "Natürlich", "Natural"], pitch: 0 },
  soft: { label: ["Douce et rassurante", "Sanft und beruhigend", "Soft and reassuring"], pitch: -1, rate: 0.95, warm: 3, air: -5, lowpass: 5500, comp: true, reverb: 0.1 },
  deep: { label: ["Grave", "Tief", "Deep"], pitch: -3, warm: 2 },
  narrator: { label: ["Très grave (bande-annonce)", "Sehr tief (Trailer)", "Very deep (movie trailer)"], pitch: -5, warm: 4, comp: true, reverb: 0.12 },
  giant: { label: ["Géant / monstre", "Riese / Monster", "Giant / monster"], pitch: -9, warm: 3, reverb: 0.25, hall: true },
  high: { label: ["Aiguë", "Hoch", "High"], pitch: 3 },
  child: { label: ["Enfant", "Kind", "Child"], pitch: 6, air: 2 },
  chipmunk: { label: ["Petite créature", "Kleines Wesen", "Tiny creature"], pitch: 10, rate: 1.08 },
  podcast: { label: ["Podcast (présente, dynamique)", "Podcast (präsent)", "Podcast (present, punchy)"], pitch: 0, rate: 1.04, highpass: 90, presence: 4, comp: true },
  radio: { label: ["Radio", "Radio", "Radio"], pitch: 0, highpass: 400, lowpass: 3800, presence: 5, comp: true, drive: 0.35 },
  phone: { label: ["Téléphone", "Telefon", "Phone call"], pitch: 0, highpass: 700, lowpass: 3000, drive: 0.6 },
  echo: { label: ["Écho", "Echo", "Echo"], pitch: 0, echo: 0.32, reverb: 0.12 },
  hall: { label: ["Grande salle / église", "Großer Saal / Kirche", "Big hall / church"], pitch: 0, reverb: 0.42, hall: true },
  mystery: { label: ["Mystérieuse", "Geheimnisvoll", "Mysterious"], pitch: -2, lowpass: 4500, reverb: 0.32, hall: true, rate: 0.94 },
  robot: { label: ["Robot", "Roboter", "Robot"], pitch: 0, robot: true, comp: true },
};

/** Paramètres effectifs (préréglage + réglage manuel de hauteur et de vitesse). */
export function fxParams(fx = "natural", pitch = 0, rate = 1) {
  const p = VOICE_FX[fx] ?? VOICE_FX.natural;
  return { ...p, id: VOICE_FX[fx] ? fx : "natural", pitch: (p.pitch ?? 0) + (Number(pitch) || 0), rate: (p.rate ?? 1) * (Number(rate) || 1) };
}

/** Le son doit-il être retraité ? (voix naturelle, hauteur et vitesse normales : non) */
export function isNeutral(q) {
  return q.id === "natural" && Math.abs(q.pitch) < 0.01 && Math.abs(q.rate - 1) < 0.001;
}

/** Clé de cache d'un réglage. */
export function fxKey(q) {
  return `${q.id}:${q.pitch.toFixed(2)}:${q.rate.toFixed(3)}`;
}

/**
 * Allonge (factor > 1) ou raccourcit le son sans changer sa hauteur (WSOLA : on recolle des morceaux
 * qui se ressemblent pour éviter les « clics » et l'effet métallique).
 */
export function timeStretch(x, factor, sr) {
  if (Math.abs(factor - 1) < 1e-3) return Float32Array.from(x);
  const N = Math.max(64, Math.round(sr * 0.03) & ~1); // fenêtre de 30 ms
  const Hs = N / 2;
  const Ha = Hs / factor;
  const delta = Math.round(sr * 0.008);
  const outLen = Math.ceil(x.length * factor);
  const out = new Float32Array(outLen + N);
  const norm = new Float32Array(outLen + N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const at = (i) => (i >= 0 && i < x.length ? x[i] : 0);
  let prev = 0; // début du morceau précédent dans le signal d'origine
  for (let k = 0, posOut = 0; posOut < outLen; k++, posOut += Hs) {
    const target = Math.round(k * Ha);
    let best = target;
    if (k > 0) {
      // Morceau le plus ressemblant à la suite naturelle du précédent (corrélation, 1 point sur 4).
      const nat = prev + Hs;
      let bestC = -Infinity;
      for (let o = -delta; o <= delta; o += 2) {
        const s = target + o;
        let c = 0;
        for (let i = 0; i < N; i += 4) c += at(s + i) * at(nat + i);
        if (c > bestC) { bestC = c; best = s; }
      }
    }
    for (let i = 0; i < N; i++) {
      out[posOut + i] += at(best + i) * win[i];
      norm[posOut + i] += win[i];
    }
    prev = best;
  }
  const y = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) y[i] = norm[i] > 1e-3 ? out[i] / norm[i] : out[i];
  return y;
}

/** Relit le son « ratio » fois plus vite (interpolation linéaire) : plus aigu et plus court. */
export function resample(x, ratio) {
  const len = Math.max(1, Math.floor(x.length / ratio));
  const y = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const p = i * ratio, j = Math.floor(p), f = p - j;
    y[i] = (x[j] ?? 0) * (1 - f) + (x[j + 1] ?? 0) * f;
  }
  return y;
}

/** Hauteur (demi-tons) et vitesse indépendantes : durée finale = durée / rate, hauteur × 2^(pitch/12). */
export function pitchAndRate(x, sr, pitch, rate) {
  const r = Math.pow(2, pitch / 12);
  return resample(timeStretch(x, r / rate, sr), r);
}

function impulse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = rnd() * Math.pow(1 - i / len, 3);
  }
  return buf;
}

function driveCurve(amount) {
  const n = 1024, c = new Float32Array(n), k = amount * 20 + 1;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

/**
 * Applique le réglage q à un AudioBuffer et renvoie un nouvel AudioBuffer (mono).
 * OfflineCtx : constructeur (OfflineAudioContext), injectable pour les tests.
 */
export async function processVoice(buffer, q, OfflineCtx = globalThis.OfflineAudioContext) {
  const sr = buffer.sampleRate;
  let x = buffer.getChannelData(0);
  if (Math.abs(q.pitch) > 0.01 || Math.abs(q.rate - 1) > 0.001) x = pitchAndRate(x, sr, q.pitch, q.rate);
  const tail = q.echo ? 1.4 : q.reverb ? (q.hall ? 2.2 : 0.8) : 0.05;
  const len = x.length + Math.ceil(tail * sr);
  const ctx = new OfflineCtx(1, len, sr);
  const src = ctx.createBufferSource();
  const inBuf = ctx.createBuffer(1, x.length, sr);
  inBuf.copyToChannel(x, 0);
  src.buffer = inBuf;
  let node = src;
  const chain = (n) => { node.connect(n); node = n; return n; };
  const biquad = (type, freq, gain = 0, Q = 0.7) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = freq;
    b.gain.value = gain;
    b.Q.value = Q;
    return chain(b);
  };
  if (q.highpass) biquad("highpass", q.highpass);
  if (q.lowpass) biquad("lowpass", q.lowpass);
  if (q.warm) biquad("lowshelf", 220, q.warm);
  if (q.air) biquad("highshelf", 4500, q.air);
  if (q.presence) biquad("peaking", 2500, q.presence, 1);
  if (q.drive) {
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(q.drive);
    chain(ws);
  }
  if (q.robot) {
    // Modulation en anneau : la voix est multipliée par une onde à 55 Hz (son métallique).
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.frequency.value = 55;
    osc.connect(ring.gain);
    osc.start(0);
    const mix = ctx.createGain();
    node.connect(ring);
    const dry = ctx.createGain();
    dry.gain.value = 0.35;
    node.connect(dry);
    ring.connect(mix);
    dry.connect(mix);
    node = mix;
  }
  if (q.comp) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -24;
    c.ratio.value = 4;
    c.attack.value = 0.005;
    c.release.value = 0.15;
    chain(c);
    const makeup = ctx.createGain();
    makeup.gain.value = 1.5;
    chain(makeup);
  }
  const out = ctx.createGain();
  node.connect(out);
  if (q.echo) {
    const d = ctx.createDelay(1);
    d.delayTime.value = q.echo;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    node.connect(d);
    d.connect(fb);
    fb.connect(d);
    d.connect(wet);
    wet.connect(out);
  }
  if (q.reverb) {
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, q.hall ? 2.4 : 0.9);
    const wet = ctx.createGain();
    wet.gain.value = q.reverb;
    node.connect(conv);
    conv.connect(wet);
    wet.connect(out);
  }
  out.connect(ctx.destination);
  src.start(0);
  const res = await ctx.startRendering();
  // Normalise le volume (crête à -1 dB) et coupe le silence de fin.
  const y = res.getChannelData(0);
  let peak = 0, end = 0;
  for (let i = 0; i < y.length; i++) {
    const a = Math.abs(y[i]);
    if (a > peak) peak = a;
    if (a > 0.003) end = i;
  }
  const inPeak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const gain = peak > 0 ? Math.min(0.89, Math.max(inPeak, 0.5)) / peak : 1;
  const n = Math.max(x.length, Math.min(y.length, end + Math.round(sr * 0.05)));
  const final = new Float32Array(n);
  for (let i = 0; i < n; i++) final[i] = y[i] * gain;
  // Petit fondu de sortie pour éviter un clic.
  const fade = Math.min(n, Math.round(sr * 0.02));
  for (let i = 0; i < fade; i++) final[n - 1 - i] *= i / fade;
  const outBuf = new (globalThis.AudioBuffer)({ length: n, sampleRate: sr, numberOfChannels: 1 });
  outBuf.copyToChannel(final, 0);
  return outBuf;
}
