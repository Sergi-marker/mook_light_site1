// © la triche — Animots
// Transcription de la parole (Whisper, modèle libre d'OpenAI, licence MIT), exécutée dans un worker
// pour que l'interface reste fluide. Le modèle (≈ 80 Mo) est téléchargé une fois puis gardé par le navigateur.

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/+esm";
// Version « timestamped » : donne aussi l'instant de chaque mot (sous-titres mot à mot, bouche synchronisée).
const MODEL = "onnx-community/whisper-base_timestamped";

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

const wordsOf = (out, offset = 0) => (out.chunks ?? [])
  .map((c) => ({ text: String(c.text ?? "").trim(), start: (c.timestamp?.[0] ?? 0) + offset, end: c.timestamp?.[1] == null ? null : c.timestamp[1] + offset }))
  .filter((w) => w.text);

self.onmessage = async (e) => {
  const { id, audio, segments, language } = e.data;
  try {
    const asr = await loadModel();
    const opts = {
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(language && language !== "auto" ? { language, task: "transcribe" } : {}),
    };
    if (segments) {
      // Un passage de parole à la fois : Whisper ne peut plus en sauter un (ce qui arrive sur un long son).
      const words = [];
      for (const [i, seg] of segments.entries()) {
        postMessage({ type: "progress", phase: "transcribe", done: i, total: segments.length });
        const out = await asr(seg.audio, opts);
        for (const w of wordsOf(out, seg.offset)) words.push({ ...w, region: i });
      }
      postMessage({ id, text: words.map((w) => w.text).join(" "), words });
      return;
    }
    postMessage({ type: "progress", phase: "transcribe" });
    const out = await asr(audio, opts);
    // Un morceau par mot : { text, start, end } en secondes.
    postMessage({ id, text: String(out.text ?? "").trim(), words: wordsOf(out) });
  } catch (err) {
    postMessage({ id, error: String(err?.message ?? err) });
  }
};
