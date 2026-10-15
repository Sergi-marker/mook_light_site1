// Voix off neuronale (Piper) générée dans le navigateur : chaque scène reçoit un vrai fichier audio,
// qui est joué dans l'aperçu ET enregistré dans la vidéo exportée.
//
// Le moteur (ONNX Runtime + Piper, WebAssembly) et la voix choisie (≈ 20 à 75 Mo) sont téléchargés
// au premier usage puis gardés par le navigateur (stockage privé de l'origine) : ensuite tout marche hors ligne.

import { VOICE_LEAD } from "./script.js";

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

let piperPromise = null;
function piper() {
  piperPromise ??= import(PIPER_URL).catch((e) => { piperPromise = null; throw e; });
  return piperPromise;
}

/** Clips déjà générés : clé « voix|texte » → AudioBuffer. */
const cache = new Map();
const key = (voiceId, text) => `${voiceId}|${text.trim()}`;

export function cachedClip(voiceId, text) {
  return cache.get(key(voiceId, text)) ?? null;
}

/** Durée (s) de la voix de chaque scène, ou null si pas encore générée. */
export function voiceDurations(scenes, voiceId) {
  return scenes.map((s) => cachedClip(voiceId, s.text)?.duration ?? null);
}

export function missingCount(scenes, voiceId) {
  return scenes.filter((s) => s.text.trim() && !cachedClip(voiceId, s.text)).length;
}

/**
 * Génère la voix de toutes les scènes qui n'en ont pas encore.
 * onProgress({ phase: "download" | "speak", done, total, percent }).
 */
export async function generateVoices(audioCtx, scenes, voiceId, onProgress = () => {}, signal) {
  if (!voiceId) throw new Error("NO_VOICE");
  const tts = await piper();
  const todo = scenes.filter((s) => s.text.trim() && !cachedClip(voiceId, s.text));
  // Le premier appel télécharge le modèle (puis le garde) ; on ne passe pas par tts.download(),
  // qui n'attend pas la fin de l'écriture du fichier et laisse ensuite lire un modèle incomplet.
  const progress = (p) => {
    if (p.total && String(p.url ?? "").endsWith(".onnx")) onProgress({ phase: "download", percent: Math.round((p.loaded * 100) / p.total) });
  };
  const speakOne = async (text) => {
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
    const wav = await speakOne(s.text.trim());
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

  /** items : éléments de la timeline ({ scene, start }) ; voiceId : voix utilisée. */
  start(items, voiceId, offset = 0, delay = 0.05) {
    this.stop();
    const t0 = this.ctx.currentTime + delay - offset;
    for (const it of items) {
      const buf = cachedClip(voiceId, it.scene.text);
      if (!buf) continue;
      const begin = it.start + VOICE_LEAD;
      const end = begin + buf.duration;
      if (end <= offset) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.out);
      if (begin >= offset) src.start(t0 + begin);
      else src.start(this.ctx.currentTime + delay, offset - begin); // reprise au milieu d'une phrase
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
