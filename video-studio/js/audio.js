// Musique d'ambiance générée (Web Audio) et voix de synthèse (Web Speech).

export const MOODS = {
  none: { label: ["Aucune", "Keine", "None"] },
  melancolie: { label: ["Mélancolique", "Melancholisch", "Melancholic"], bpm: 68, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], kick: false, arp: true },
  calme: { label: ["Calme", "Ruhig", "Calm"], bpm: 72, chords: [[48, 52, 55, 59], [53, 57, 60, 64], [45, 48, 52, 55], [50, 53, 57, 60]], kick: false, arp: true },
  motivation: { label: ["Motivation / sport", "Motivation / Sport", "Motivation / sport"], bpm: 100, chords: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]], kick: true, arp: true },
  mystere: { label: ["Mystère / histoire", "Mysteriös / Geschichte", "Mystery / story"], bpm: 60, chords: [[50, 53, 57], [50, 53, 58], [46, 50, 53], [49, 52, 57]], kick: false, arp: false },
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
    // Index de croche suivant (1/2 temps) à partir de l'offset.
    this.step = Math.ceil(offset / (beat / 2));
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
      const time = this.t0 + this.step * (beat / 2);
      if (time > horizon) break;
      if (time >= ctx.currentTime - 0.01) this.playStep(this.step, time, m, beat);
      this.step++;
    }
  }

  playStep(step, time, m, beat) {
    const stepsPerBar = 8;
    const bar = Math.floor(step / stepsPerBar);
    const inBar = step % stepsPerBar;
    const chord = m.chords[bar % m.chords.length];
    if (inBar === 0) {
      for (const n of chord) this.pad(midiHz(n), time, beat * 4);
      this.bass(midiHz(chord[0] - 12), time, beat * 4);
    }
    if (m.arp && (inBar % 2 === 0 || m.kick)) {
      const pattern = [0, 2, 1, 2, 3, 2, 1, 0];
      const n = chord[pattern[inBar] % chord.length] + 12;
      if (!(inBar === 6 && bar % 2 === 1)) this.pluck(midiHz(n), time, m.kick ? 0.06 : 0.09);
    }
    if (m.kick && inBar % 2 === 0) this.kick(time, inBar % 4 === 0 ? 0.55 : 0.3);
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
