// Voix off neuronale (Piper) générée dans le navigateur : chaque scène reçoit un vrai fichier audio,
// qui est joué dans l'aperçu ET enregistré dans la vidéo exportée.
//
// Le moteur (ONNX Runtime + Piper, WebAssembly) et la voix choisie (≈ 20 à 75 Mo) sont téléchargés
// au premier usage puis gardés par le navigateur (stockage privé de l'origine) : ensuite tout marche hors ligne.

import { VOICE_LEAD, plainText } from "./script.js";

const PIPER_URL = "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/dist/piper-tts-web.js";

/**
 * Voix proposées par langue : [identifiant, libellé].
 * « kokoro:… » = voix HD Kokoro (modèle de 2025, bien plus naturel) ; sinon voix Piper (standard).
 * Kokoro n'existe pas en allemand ni en voix d'homme française : ces voix restent en Piper.
 */
export const NEURAL_VOICES = {
  fr: [["kokoro:ff_siwis", "✦ Siwis HD (femme)"], ["fr_FR-tom-medium", "Tom (homme)"], ["fr_FR-gilles-low", "Gilles (homme, grave)"], ["fr_FR-upmc-medium", "UPMC (femme)"], ["fr_FR-siwis-medium", "Siwis (femme)"]],
  de: [["de_DE-thorsten-high", "Thorsten HQ (Mann)"], ["de_DE-thorsten_emotional-medium", "Thorsten emotional (Mann)"], ["de_DE-kerstin-low", "Kerstin (Frau)"], ["de_DE-ramona-low", "Ramona (Frau)"], ["de_DE-thorsten-medium", "Thorsten (Mann)"]],
  en: [["kokoro:af_heart", "✦ Heart HD (woman)"], ["kokoro:am_michael", "✦ Michael HD (man)"], ["kokoro:af_bella", "✦ Bella HD (woman)"], ["kokoro:am_fenrir", "✦ Fenrir HD (man)"], ["kokoro:am_puck", "✦ Puck HD (man)"], ["kokoro:af_nicole", "✦ Nicole HD (woman, soft)"], ["kokoro:bf_emma", "✦ Emma HD (British woman)"], ["kokoro:bm_george", "✦ George HD (British man)"], ["kokoro:bm_fable", "✦ Fable HD (British man)"]],
  es: [["kokoro:ef_dora", "✦ Dora HD (mujer)"], ["kokoro:em_alex", "✦ Alex HD (hombre)"], ["es_ES-davefx-medium", "Davefx (hombre)"]],
  it: [["kokoro:if_sara", "✦ Sara HD (donna)"], ["kokoro:im_nicola", "✦ Nicola HD (uomo)"], ["it_IT-paola-medium", "Paola (donna)"]],
  pt: [["kokoro:pf_dora", "✦ Dora HD (mulher, BR)"], ["kokoro:pm_alex", "✦ Alex HD (homem, BR)"], ["pt_BR-faber-medium", "Faber (homem, BR)"]],
  nl: [["nl_NL-mls-medium", "MLS"]],
  tr: [["tr_TR-fahrettin-medium", "Fahrettin (erkek)"], ["tr_TR-dfki-medium", "DFKI"]],
  ar: [["ar_JO-kareem-medium", "Kareem (رجل)"]],
  pl: [["pl_PL-gosia-medium", "Gosia (kobieta)"], ["pl_PL-darkman-medium", "Darkman (mężczyzna)"]],
  ru: [["ru_RU-irina-medium", "Irina (женщина)"], ["ru_RU-dmitri-medium", "Dmitri (мужчина)"]],
};

export const isKokoro = (voiceId) => String(voiceId).startsWith("kokoro:");

export function defaultVoice(lang) {
  return NEURAL_VOICES[lang]?.[0]?.[0] ?? "";
}

const MALE = /homme|mann\b|\(man\b|\bman[,)]|hombre|uomo|homem|erkek|мужчина|mężczyzna|رجل/i;
const FEMALE = /femme|frau|woman|mujer|donna|mulher|kobieta|женщина/i;

/** Voix par défaut d'un genre (« m » ou « f ») dans une langue, sinon la première voix. */
export function voiceByGender(lang, gender) {
  const list = NEURAL_VOICES[lang] ?? [];
  const re = gender === "m" ? MALE : FEMALE;
  // La meilleure voix du bon genre (les voix HD sont en tête de liste).
  return (list.find(([, label]) => re.test(label)) ?? list[0])?.[0] ?? "";
}

// Voix HD Kokoro : un worker dédié (le modèle tourne hors de l'interface).
let worker = null, nextId = 1;
const pending = new Map();
let onDownload = null;
function kokoroWorker() {
  if (!worker) {
    worker = new Worker(new URL("./kokoro-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") { onDownload?.(m.percent); return; }
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error)); else p.resolve(m);
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || "KOKORO_WORKER"));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

function kokoroSpeak(text, voice, progress) {
  onDownload = progress;
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    kokoroWorker().postMessage({ id, text, voice });
  });
}

let piperPromise = null;
function piper() {
  piperPromise ??= import(PIPER_URL).catch((e) => { piperPromise = null; throw e; });
  return piperPromise;
}

/** Clips déjà générés : clé « voix|texte » → AudioBuffer. Le texte est lu sans les *étoiles* de mise en forme. */
const cache = new Map();
const key = (voiceId, text) => `${voiceId}|${plainText(text)}`;
const speakable = (s) => s.kind !== "pause" && plainText(s.text) !== "";

export function cachedClip(voiceId, text) {
  return cache.get(key(voiceId, text)) ?? null;
}

/**
 * voiceOf(scene) → identifiant de la voix qui lit cette scène (narrateur ou personnage).
 * rate : vitesse de lecture (1 = normale) ; elle raccourcit ou allonge la durée de la voix.
 */
export function voiceDurations(scenes, voiceOf, rate = 1) {
  return scenes.map((s) => {
    const b = speakable(s) ? cachedClip(voiceOf(s), s.text) : null;
    return b ? b.duration / rate : null;
  });
}

export function missingCount(scenes, voiceOf) {
  return scenes.filter((s) => speakable(s) && voiceOf(s) && !cachedClip(voiceOf(s), s.text)).length;
}

/**
 * Génère la voix de toutes les scènes qui n'en ont pas encore.
 * onProgress({ phase: "download" | "speak", done, total, percent }).
 */
export async function generateVoices(audioCtx, scenes, voiceOf, onProgress = () => {}, signal) {
  const todo = scenes.filter((s) => speakable(s) && voiceOf(s) && !cachedClip(voiceOf(s), s.text));
  const needsPiper = todo.some((s) => !isKokoro(voiceOf(s)));
  const tts = needsPiper ? await piper() : null;
  // Le premier appel télécharge le modèle (puis le garde) ; on ne passe pas par tts.download(),
  // qui n'attend pas la fin de l'écriture du fichier et laisse ensuite lire un modèle incomplet.
  const progress = (p) => {
    if (p.total && String(p.url ?? "").endsWith(".onnx")) onProgress({ phase: "download", percent: Math.round((p.loaded * 100) / p.total) });
  };
  const speakOne = async (text, voiceId) => {
    try {
      return await tts.predict({ text, voiceId }, progress);
    } catch (e) {
      // Modèle gardé mais abîmé (téléchargement interrompu) : on le supprime et on recommence une fois.
      await tts.remove(voiceId).catch(() => {});
      return tts.predict({ text, voiceId }, progress);
    }
  };
  let done = 0;
  for (const s of todo) {
    if (signal?.aborted) throw new Error("ABORTED");
    onProgress({ phase: "speak", done, total: todo.length });
    const voiceId = voiceOf(s);
    let buf;
    if (isKokoro(voiceId)) {
      const { samples, sampleRate } = await kokoroSpeak(plainText(s.text), voiceId.slice(7), (percent) => onProgress({ phase: "download", percent }));
      buf = audioCtx.createBuffer(1, samples.length, sampleRate);
      buf.copyToChannel(samples, 0);
    } else {
      const wav = await speakOne(plainText(s.text), voiceId);
      buf = await audioCtx.decodeAudioData(await wav.arrayBuffer());
    }
    cache.set(key(voiceId, s.text), buf);
    done++;
  }
  onProgress({ phase: "speak", done, total: todo.length });
  return todo.length;
}

/** Joue (ou enregistre) les voix de la timeline à partir de la position offset (s). */
export class VoicePlayer {
  constructor(ctx) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.nodes = [];
  }

  connect(node) { this.out.connect(node); }
  disconnect(node) { try { this.out.disconnect(node); } catch { /* déjà fait */ } }
  setVolume(v) { this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  /** items : éléments de la timeline ({ scene, start }) ; voiceOf(scene) : voix utilisée ; rate : vitesse. */
  start(items, voiceOf, offset = 0, delay = 0.05, rate = 1) {
    this.stop();
    const t0 = this.ctx.currentTime + delay - offset;
    for (const it of items) {
      if (it.scene.kind === "pause") continue;
      const buf = cachedClip(voiceOf(it.scene), it.scene.text);
      if (!buf) continue;
      const begin = it.start + VOICE_LEAD;
      const end = begin + buf.duration / rate;
      if (end <= offset) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(this.out);
      if (begin >= offset) src.start(t0 + begin);
      else src.start(this.ctx.currentTime + delay, (offset - begin) * rate); // reprise au milieu d'une phrase
      this.nodes.push(src);
    }
  }

  stop() {
    for (const n of this.nodes) { try { n.stop(); } catch { /* déjà arrêté */ } }
    this.nodes = [];
  }
}


/** Piste audio importée (voix off enregistrée ailleurs, musique…), lue depuis le début de la vidéo. */
export class TrackPlayer {
  constructor(ctx) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.buffer = null;
    this.node = null;
  }

  connect(node) { this.out.connect(node); }
  disconnect(node) { try { this.out.disconnect(node); } catch { /* déjà fait */ } }
  setVolume(v) { this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  async load(file) {
    this.buffer = await this.ctx.decodeAudioData(await file.arrayBuffer());
    return this.buffer.duration;
  }

  start(offset = 0, delay = 0.05) {
    this.stop();
    if (!this.buffer || offset >= this.buffer.duration) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.out);
    src.start(this.ctx.currentTime + delay, offset);
    this.node = src;
  }

  stop() {
    try { this.node?.stop(); } catch { /* déjà arrêté */ }
    this.node = null;
  }
}
