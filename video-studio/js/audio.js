// Musique d'ambiance générée (Web Audio) et voix de synthèse (Web Speech).

/**
 * Ambiances : accords (notes MIDI), tempo, instrument mélodique (lead), nappe (pad), basse et batterie.
 * lead : pluck | piano | bell | saw | null ; pad : soft | strings | null ; bass : sine | 808 | pulse ;
 * drums : null | kick | four | lofi | trap | epic | tick ; every : la mélodie joue toutes les n croches.
 */
export const MOODS = {
  none: { label: ["Aucune", "Keine", "None"] },
  melancolie: { label: ["Mélancolique", "Melancholisch", "Melancholic"], bpm: 68, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], lead: "pluck", every: 2, pad: "soft", bass: "sine" },
  piano: { label: ["Piano triste", "Trauriges Klavier", "Sad piano"], bpm: 64, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], lead: "piano", every: 1, pattern: [0, 1, 2, 1, 3, 2, 1, 2], pad: "soft", bass: "sine" },
  calme: { label: ["Calme", "Ruhig", "Calm"], bpm: 72, chords: [[48, 52, 55, 59], [53, 57, 60, 64], [45, 48, 52, 55], [50, 53, 57, 60]], lead: "pluck", every: 2, pad: "soft", bass: "sine" },
  meditation: { label: ["Méditation", "Meditation", "Meditation"], bpm: 50, chords: [[50, 57, 62, 64], [48, 55, 62, 64]], lead: "bell", every: 4, pattern: [3, 2, 0, 1], pad: "strings", bass: "sine" },
  romantique: { label: ["Romantique", "Romantisch", "Romantic"], bpm: 76, chords: [[53, 57, 60, 64], [57, 60, 64, 67], [58, 62, 65, 69], [48, 52, 55, 58]], lead: "piano", every: 1, pattern: [0, 2, 3, 2, 1, 2, 3, 2], pad: "strings", bass: "sine" },
  inspirant: { label: ["Inspirant", "Inspirierend", "Inspiring"], bpm: 92, chords: [[48, 52, 55, 60], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]], lead: "bell", every: 1, pad: "strings", bass: "sine", drums: "kick" },
  motivation: { label: ["Motivation / sport", "Motivation / Sport", "Motivation / sport"], bpm: 100, chords: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]], lead: "pluck", every: 1, pad: "soft", bass: "sine", drums: "kick" },
  epique: { label: ["Épique / cinéma", "Episch / Kino", "Epic / cinematic"], bpm: 84, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], lead: "saw", every: 1, pattern: [0, 0, 1, 1, 2, 2, 1, 1], pad: "strings", bass: "pulse", drums: "epic" },
  electro: { label: ["Électro / énergie", "Elektro / Energie", "Electro / energy"], bpm: 124, chords: [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]], lead: "saw", every: 1, pattern: [0, 1, 2, 1, 0, 2, 1, 2], pad: "soft", bass: "pulse", drums: "four" },
  joyeux: { label: ["Joyeux", "Fröhlich", "Happy"], bpm: 116, chords: [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55]], lead: "pluck", every: 1, pattern: [0, 1, 2, 1, 2, 1, 0, 2], pad: null, bass: "sine", drums: "four", swing: 0.12 },
  lofi: { label: ["Lo-fi / chill", "Lo-fi / Chill", "Lo-fi / chill"], bpm: 80, chords: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [45, 48, 52, 55]], lead: "piano", every: 2, pattern: [3, 2, 1, 2], pad: "soft", bass: "sine", drums: "lofi", swing: 0.22 },
  trap: { label: ["Trap / hip-hop", "Trap / Hip-Hop", "Trap / hip-hop"], bpm: 140, chords: [[49, 52, 56], [49, 52, 56], [45, 49, 52], [47, 51, 54]], lead: "bell", every: 2, pattern: [2, 1, 0, 1], pad: "soft", bass: "808", drums: "trap" },
  mystere: { label: ["Mystère / histoire", "Mysteriös / Geschichte", "Mystery / story"], bpm: 60, chords: [[50, 53, 57], [50, 53, 58], [46, 50, 53], [49, 52, 57]], lead: null, pad: "soft", bass: "sine" },
  suspense: { label: ["Suspense / tension", "Spannung", "Suspense / tension"], bpm: 70, chords: [[45, 46, 52], [45, 48, 51], [44, 45, 51], [45, 46, 49]], lead: "bell", every: 4, pattern: [1, 2, 0, 2], pad: "strings", bass: "pulse", drums: "tick" },
};

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function impulse(ctx, seconds = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = rnd() * Math.pow(1 - i / len, 2.6);
  }
  return buf;
}

/** Lecteur de musique d'ambiance. Les notes sont planifiées un peu en avance (lookahead). */
export class MusicPlayer {
  constructor(ctx) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
    this.verb = ctx.createConvolver();
    this.verb.buffer = impulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    this.bus = ctx.createGain();
    this.bus.connect(this.out);
    this.bus.connect(this.verb);
    this.verb.connect(wet);
    wet.connect(this.out);
    this.timer = null;
  }

  connect(node) { this.out.connect(node); }
  setVolume(v) { this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  /** Démarre à la position offset (s) de la vidéo. */
  start(mood, offset = 0) {
    this.stop();
    const m = MOODS[mood];
    if (!m || !m.chords) return;
    this.mood = m;
    const beat = 60 / m.bpm;
    this.beat = beat;
    // Grille en doubles croches (1/4 de temps) à partir de l'offset.
    this.step = Math.ceil(offset / (beat / 4));
    this.t0 = this.ctx.currentTime + 0.05 - offset;
    this.timer = setInterval(() => this.schedule(), 80);
    this.schedule();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const n of this.active ?? []) { try { n.stop(); } catch { /* déjà arrêté */ } }
    this.active = [];
  }

  schedule() {
    const { ctx, mood: m, beat } = this;
    const horizon = ctx.currentTime + 0.35;
    for (;;) {
      // Swing : les doubles croches paires sont un peu retardées (lo-fi, joyeux).
      const time = this.t0 + this.step * (beat / 4) + (this.step % 2 ? (m.swing ?? 0) * (beat / 4) : 0);
      if (time > horizon) break;
      if (time >= ctx.currentTime - 0.01) this.playStep(this.step, time, m, beat);
      this.step++;
    }
  }

  playStep(step, time, m, beat) {
    const bar = Math.floor(step / 16);
    const s16 = step % 16;
    const chord = m.chords[bar % m.chords.length];
    if (s16 === 0) {
      if (m.pad) for (const n of chord) (m.pad === "strings" ? this.strings : this.pad).call(this, midiHz(n), time, beat * 4);
      if (m.bass === "808") this.bass808(midiHz(chord[0] - 24), time, beat * 2);
      else if (m.bass !== "pulse") this.bass(midiHz(chord[0] - 12), time, beat * 4);
    }
    if (m.bass === "pulse" && s16 % 2 === 0) this.pulse(midiHz(chord[0] - 12), time, beat / 2, s16 % 8 === 0 ? 0.08 : 0.05);
    if (m.bass === "808" && s16 === 10) this.bass808(midiHz(chord[0] - 24), time, beat * 1.4);
    // Mélodie : sur les croches (s16 pair), toutes les « every » croches.
    if (m.lead && s16 % 2 === 0) {
      const eighth = s16 / 2;
      const every = m.every ?? 1;
      if (eighth % every === 0) {
        const pattern = m.pattern ?? [0, 2, 1, 2, 3, 2, 1, 0];
        const idx = pattern[(eighth / every + bar * (8 / every)) % pattern.length];
        const n = chord[idx % chord.length] + 12;
        const f = midiHz(n);
        if (m.lead === "piano") this.piano(f, time, 0.12);
        else if (m.lead === "bell") this.bell(f * 2, time, 0.05);
        else if (m.lead === "saw") this.saw(f, time, beat / 2, 0.045);
        else if (!(eighth === 6 && bar % 2 === 1)) this.pluck(f, time, m.drums ? 0.06 : 0.09);
      }
    }
    this.drums(m.drums, s16, bar, time);
  }

  drums(kind, s, bar, time) {
    if (!kind) return;
    switch (kind) {
      case "kick": if (s % 4 === 0) this.kick(time, s % 8 === 0 ? 0.55 : 0.3); break;
      case "four":
        if (s % 4 === 0) this.kick(time, 0.6);
        if (s % 4 === 2) this.hat(time, 0.12, 0.05);
        if (s === 4 || s === 12) this.snare(time, 0.22);
        break;
      case "lofi":
        if (s === 0 || s === 7 || s === 10) this.kick(time, 0.45);
        if (s === 4 || s === 12) this.snare(time, 0.16, true);
        if (s % 2 === 0) this.hat(time, s % 4 ? 0.04 : 0.07, 0.04);
        break;
      case "trap":
        if (s === 0 || (s === 11 && bar % 2)) this.kick(time, 0.5);
        if (s === 8) this.snare(time, 0.3);
        // Charleston rapide avec roulements.
        this.hat(time, 0.06, 0.025);
        if (s === 14 && bar % 2) { this.hat(time + 0.035, 0.05, 0.02); this.hat(time + 0.07, 0.05, 0.02); }
        break;
      case "epic":
        if (s === 0 || s === 6 || s === 8) this.tom(time, s === 0 ? 0.7 : 0.45);
        if (s === 12) this.snare(time, 0.2);
        break;
      case "tick": if (s % 4 === 0) this.hat(time, s === 0 ? 0.08 : 0.04, 0.02); break;
      default: break;
    }
  }

  noise() {
    if (!this.noiseBuf) {
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      let seed = 777;
      for (let i = 0; i < len; i++) d[i] = ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    return src;
  }

  hat(time, vol, dur) {
    const { ctx } = this;
    const src = this.noise();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.out);
    src.start(time);
    this.track(src, time + dur + 0.02);
  }

  snare(time, vol, soft = false) {
    const { ctx } = this;
    const src = this.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = soft ? 1500 : 2200;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + (soft ? 0.12 : 0.18));
    src.connect(bp);
    bp.connect(g);
    g.connect(this.bus);
    src.start(time);
    this.track(src, time + 0.25);
  }

  tom(time, vol) {
    const { ctx } = this;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(90, time);
    o.frequency.exponentialRampToValueAtTime(38, time + 0.4);
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.8);
    o.connect(g);
    g.connect(this.bus);
    o.start(time);
    this.track(o, time + 0.85);
  }

  piano(f, time, vol) {
    // Piano doux : fondamentale + harmoniques qui s'éteignent plus vite.
    const { ctx } = this;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.005);
    g.gain.exponentialRampToValueAtTime(vol * 0.3, time + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 2.2);
    g.connect(this.bus);
    for (const [mul, v] of [[1, 1], [2, 0.35], [3, 0.12], [4, 0.06]]) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      og.gain.setValueAtTime(v, time);
      og.gain.exponentialRampToValueAtTime(Math.max(0.0001, v * 0.05), time + 0.3 + 1.2 / mul);
      o.type = "sine";
      o.frequency.value = f * mul;
      o.connect(og);
      og.connect(g);
      o.start(time);
      this.track(o, time + 2.3);
    }
  }

  bell(f, time, vol) {
    // Cloche (synthèse FM) : timbre cristallin.
    const { ctx } = this;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(f * 1.2, time);
    mg.gain.exponentialRampToValueAtTime(1, time + 1.5);
    mod.connect(mg);
    mg.connect(car.frequency);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 2.4);
    car.connect(g);
    g.connect(this.bus);
    car.start(time);
    mod.start(time);
    this.track(car, time + 2.5);
    this.track(mod, time + 2.5);
  }

  saw(f, time, dur, vol) {
    const { ctx } = this;
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = f;
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2600, time);
    lp.frequency.exponentialRampToValueAtTime(500, time + dur);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 1.2);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.bus);
    o.start(time);
    this.track(o, time + dur * 1.3);
  }

  strings(f, time, dur) {
    // Cordes : dents de scie filtrées, attaque lente, léger vibrato.
    const { ctx } = this;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.022, time + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, time + dur * 1.08);
    lp.connect(g);
    g.connect(this.bus);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5;
    lg.gain.value = 6;
    lfo.connect(lg);
    for (const det of [-8, 0, 8]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = det;
      lg.connect(o.detune);
      o.connect(lp);
      o.start(time);
      this.track(o, time + dur * 1.1);
    }
    lfo.start(time);
    this.track(lfo, time + dur * 1.1);
  }

  pulse(f, time, dur, vol) {
    const { ctx } = this;
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "square";
    o.frequency.value = f;
    lp.type = "lowpass";
    lp.frequency.value = 380;
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.bus);
    o.start(time);
    this.track(o, time + dur + 0.02);
  }

  bass808(f, time, dur) {
    const { ctx } = this;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f * 1.6, time);
    o.frequency.exponentialRampToValueAtTime(f, time + 0.08);
    g.gain.setValueAtTime(0.32, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(this.out);
    o.start(time);
    this.track(o, time + dur + 0.05);
  }

  track(node, end) {
    this.active.push(node);
    node.onended = () => { this.active = this.active.filter((n) => n !== node); };
    node.stop(end);
  }

  pad(f, time, dur) {
    const { ctx } = this;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.035, time + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, time + dur * 1.05);
    lp.connect(g);
    g.connect(this.bus);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(time);
      this.track(o, time + dur * 1.1);
    }
  }

  bass(f, time, dur) {
    const { ctx } = this;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.09, time + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(this.bus);
    o.start(time);
    this.track(o, time + dur + 0.05);
  }

  pluck(f, time, vol) {
    const { ctx } = this;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 1.4);
    g.connect(this.bus);
    for (const [type, mul, v] of [["sine", 1, 1], ["triangle", 2, 0.25]]) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      og.gain.value = v;
      o.type = type;
      o.frequency.value = f * mul;
      o.connect(og);
      og.connect(g);
      o.start(time);
      this.track(o, time + 1.5);
    }
  }

  kick(time, vol) {
    const { ctx } = this;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
    o.connect(g);
    g.connect(this.out);
    o.start(time);
    this.track(o, time + 0.4);
  }
}

/** Langues proposées pour la voix et la traduction. */
export const LANGS = {
  fr: { name: "Français", bcp: "fr-FR" },
  de: { name: "Deutsch", bcp: "de-DE" },
  en: { name: "English", bcp: "en-US" },
  es: { name: "Español", bcp: "es-ES" },
  it: { name: "Italiano", bcp: "it-IT" },
  pt: { name: "Português", bcp: "pt-PT" },
  nl: { name: "Nederlands", bcp: "nl-NL" },
  tr: { name: "Türkçe", bcp: "tr-TR" },
  ar: { name: "العربية", bcp: "ar-SA" },
  pl: { name: "Polski", bcp: "pl-PL" },
  ru: { name: "Русский", bcp: "ru-RU" },
  ja: { name: "日本語", bcp: "ja-JP" },
};

export function voicesFor(lang) {
  if (!("speechSynthesis" in globalThis)) return [];
  const pre = (LANGS[lang]?.bcp ?? lang).slice(0, 2).toLowerCase();
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(pre));
}

/** Lit une phrase avec la voix de synthèse du système. */
export function speak(text, { lang = "fr", voice = "", rate = 1, pitch = 1 } = {}) {
  if (!("speechSynthesis" in globalThis)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = LANGS[lang]?.bcp ?? lang;
  const v = voicesFor(lang).find((x) => x.name === voice) ?? voicesFor(lang)[0];
  if (v) u.voice = v;
  u.rate = rate;
  u.pitch = pitch;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ("speechSynthesis" in globalThis) speechSynthesis.cancel();
}
