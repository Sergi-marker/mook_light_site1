// © la triche — Animots
// Transcription de la parole d'un son (Float32Array mono à 16 kHz) par le worker Whisper.

let worker = null, nextId = 1, onProgress = null;
const pending = new Map();

function whisperWorker() {
  if (!worker) {
    worker = new Worker(new URL("./whisper-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") { onProgress?.(m); return; }
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error)); else p.resolve(m);
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || "WHISPER_WORKER"));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

/**
 * Renvoie { text, chunks: [{ text, start, end }] }.
 * progress({ percent }) pendant le téléchargement du modèle, puis ({ phase: "transcribe" }).
 */
export function transcribe(audio16k, language = "auto", progress = () => {}, signal) {
  onProgress = progress;
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    signal?.addEventListener("abort", () => {
      pending.delete(id);
      worker?.terminate();
      worker = null;
      reject(new Error("ABORTED"));
    });
    // Copie : le son d'origine reste utilisable ici.
    const copy = Float32Array.from(audio16k);
    whisperWorker().postMessage({ id, audio: copy, language }, [copy.buffer]);
  });
}

/** Son décodé (AudioBuffer) → mono 16 kHz, le format attendu par Whisper et par l'analyse des voix. */
export async function toMono16k(buffer) {
  const rate = 16000;
  const len = Math.max(1, Math.ceil(buffer.duration * rate));
  const ctx = new OfflineAudioContext(1, len, rate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination); // le mélange des canaux en mono est fait par le contexte
  src.start(0);
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}
