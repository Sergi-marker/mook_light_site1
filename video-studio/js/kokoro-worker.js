// Voix « HD » Kokoro (modèle neuronal de 2025, licence Apache 2.0), exécutée dans un worker
// pour que l'interface reste fluide pendant la génération.
//
// Kokoro-js ne sait prononcer que l'anglais ; pour les autres langues, la prononciation (phonèmes IPA)
// est calculée par espeak-ng, déjà fourni avec le moteur Piper, puis donnée directement au modèle.

const KOKORO_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm";
const PHONEMIZE_URL = "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/dist/piper-o91UDS6e.js";
const ESPEAK_BASE = "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize";
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

/** Langue espeak-ng de chaque préfixe de voix Kokoro (a = anglais US, b = britannique : géré par kokoro-js). */
const ESPEAK_LANG = { f: "fr", e: "es", i: "it", p: "pt-br", h: "hi" };

let ttsPromise = null;

function loadModel() {
  ttsPromise ??= (async () => {
    const { KokoroTTS } = await import(KOKORO_URL);
    // Carte graphique (WebGPU) si disponible : rapide, précision maximale. Sinon processeur, modèle compressé.
    let device = "wasm", dtype = "q8";
    try {
      if (self.navigator?.gpu && (await self.navigator.gpu.requestAdapter())) { device = "webgpu"; dtype = "fp32"; }
    } catch { /* pas de WebGPU */ }
    const progress = (p) => {
      if (p.status === "progress" && /onnx/.test(p.file ?? "")) postMessage({ type: "progress", percent: Math.round(p.progress ?? 0) });
    };
    try {
      return await KokoroTTS.from_pretrained(MODEL, { dtype, device, progress_callback: progress });
    } catch (e) {
      if (device === "wasm") throw e;
      // WebGPU présent mais inutilisable : on repasse sur le processeur.
      return KokoroTTS.from_pretrained(MODEL, { dtype: "q8", device: "wasm", progress_callback: progress });
    }
  })().catch((e) => { ttsPromise = null; throw e; });
  return ttsPromise;
}

let phonemizerPromise = null;
function phonemize(text, lang) {
  phonemizerPromise ??= import(PHONEMIZE_URL).then((m) => m.createPiperPhonemize);
  return phonemizerPromise.then((create) => new Promise((resolve, reject) => {
    create({
      print: (out) => {
        try { resolve(JSON.parse(out).phonemes.join("")); } catch (e) { reject(e); }
      },
      printErr: (msg) => reject(new Error(msg)),
      locateFile: (url) => (url.endsWith(".wasm") ? `${ESPEAK_BASE}.wasm` : url.endsWith(".data") ? `${ESPEAK_BASE}.data` : url),
    }).then((mod) => mod.callMain(["-l", lang, "--input", JSON.stringify([{ text }]), "--espeak_data", "/espeak-ng-data"]), reject);
  }));
}

async function speak(text, voice) {
  const tts = await loadModel();
  const lang = ESPEAK_LANG[voice[0]];
  let audio;
  if (!lang) {
    audio = await tts.generate(text, { voice });
  } else {
    // espeak marque les liaisons par « - » : Kokoro ne les connaît pas.
    const phonemes = (await phonemize(text, lang)).replace(/-/g, "").trim();
    const { input_ids } = tts.tokenizer(phonemes, { truncation: true });
    audio = await tts.generate_from_ids(input_ids, { voice });
  }
  return { samples: audio.audio, sampleRate: audio.sampling_rate };
}

self.onmessage = async (e) => {
  const { id, text, voice, preload } = e.data;
  try {
    if (preload) { await loadModel(); postMessage({ id, ok: true }); return; }
    const { samples, sampleRate } = await speak(text, voice);
    postMessage({ id, samples, sampleRate }, [samples.buffer]);
  } catch (err) {
    postMessage({ id, error: String(err?.message ?? err) });
  }
};
