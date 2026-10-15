// Voix off neuronale (Piper) générée dans le navigateur : chaque scène reçoit un vrai fichier audio,
// qui est joué dans l'aperçu ET enregistré dans la vidéo exportée.
//
// Le moteur (ONNX Runtime + Piper, WebAssembly) et la voix choisie (≈ 20 à 75 Mo) sont téléchargés
// au premier usage puis gardés par le navigateur (stockage privé de l'origine) : ensuite tout marche hors ligne.

import { VOICE_LEAD, plainText } from "./script.js";

const PIPER_URL = "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/dist/piper-tts-web.js";

/** Voix proposées par langue : [identifiant Piper, libellé]. */
export const NEURAL_VOICES = {
  fr: [["fr_FR-siwis-medium", "Siwis (femme)"], ["fr_FR-tom-medium", "Tom (homme)"], ["fr_FR-upmc-medium", "UPMC (femme)"], ["fr_FR-gilles-low", "Gilles (homme, grave)"]],
  de: [["de_DE-thorsten-medium", "Thorsten (Mann)"], ["de_DE-kerstin-low", "Kerstin (Frau)"], ["de_DE-thorsten_emotional-medium", "Thorsten emotional (Mann)"], ["de_DE-ramona-low", "Ramona (Frau)"]],
  en: [["en_US-ryan-medium", "Ryan (man)"], ["en_US-hfc_female-medium", "HFC (woman)"], ["en_US-lessac-medium", "Lessac (woman)"], ["en_GB-alan-medium", "Alan (British man)"], ["en_GB-cori-medium", "Cori (British woman)"]],
  es: [["es_ES-davefx-medium", "Davefx (hombre)"], ["es_ES-sharvard-medium", "Sharvard"]],
  it: [["it_IT-paola-medium", "Paola (donna)"], ["it_IT-riccardo-x_low", "Riccardo (uomo)"]],
  pt: [["pt_BR-faber-medium", "Faber (homem, BR)"], ["pt_BR-edresson-low", "Edresson (homem, BR)"]],
  nl: [["nl_NL-mls-medium", "MLS"]],
  tr: [["tr_TR-fahrettin-medium", "Fahrettin (erkek)"], ["tr_TR-dfki-medium", "DFKI"]],
  ar: [["ar_JO-kareem-medium", "Kareem (رجل)"]],
  pl: [["pl_PL-gosia-medium", "Gosia (kobieta)"], ["pl_PL-darkman-medium", "Darkman (mężczyzna)"]],
  ru: [["ru_RU-irina-medium", "Irina (женщина)"], ["ru_RU-dmitri-medium", "Dmitri (мужчина)"]],
};

export function defaultVoice(lang) {
  return NEURAL_VOICES[lang]?.[0]?.[0] ?? "";
}

const MALE = /homme|mann\b|\(man|man\)|hombre|uomo|homem|erkek|мужчина|mężczyzna|رجل/i;
const FEMALE = /femme|frau|woman|donna|kobieta|женщина/i;

/** Voix par défaut d'un genre (« m » ou « f ») dans une langue, sinon la première voix. */
export function voiceByGender(lang, gender) {
  const list = NEURAL_VOICES[lang] ?? [];
  const re = gender === "m" ? MALE : FEMALE;
  return (list.find(([, label]) => re.test(label)) ?? list[0])?.[0] ?? "";
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
  const tts = await piper();
  const todo = scenes.filter((s) => speakable(s) && voiceOf(s) && !cachedClip(voiceOf(s), s.text));
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
    const wav = await speakOne(plainText(s.text), voiceId);
    const buf = await audioCtx.decodeAudioData(await wav.arrayBuffer());
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
