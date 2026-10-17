// © la triche — Animots
// Transcription de la parole (Whisper, modèle libre d'OpenAI, licence MIT), exécutée dans un worker
// pour que l'interface reste fluide. Le modèle (≈ 80 Mo) est téléchargé une fois puis gardé par le navigateur.

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/+esm";
const MODEL = "onnx-community/whisper-base";

let asrPromise = null;

function loadModel() {
  asrPromise ??= (async () => {
    const { pipeline } = await import(TRANSFORMERS_URL);
    const progress = (p) => {
      if (p.status === "progress" && /onnx/.test(p.file ?? "")) postMessage({ type: "progress", file: p.file, percent: Math.round(p.progress ?? 0) });
    };
    return pipeline("automatic-speech-recognition", MODEL, { dtype: "q8", device: "wasm", progress_callback: progress });
  })().catch((e) => { asrPromise = null; throw e; });
  return asrPromise;
}

self.onmessage = async (e) => {
  const { id, audio, language } = e.data;
  try {
    const asr = await loadModel();
    postMessage({ type: "progress", phase: "transcribe" });
    const out = await asr(audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(language && language !== "auto" ? { language, task: "transcribe" } : {}),
    });
    const chunks = (out.chunks ?? []).map((c) => ({ text: String(c.text ?? "").trim(), start: c.timestamp?.[0] ?? 0, end: c.timestamp?.[1] ?? null }));
    postMessage({ id, text: String(out.text ?? "").trim(), chunks });
  } catch (err) {
    postMessage({ id, error: String(err?.message ?? err) });
  }
};
