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

/**
 * Retranscrit passage par passage (bornes en secondes) : chaque mot garde son instant absolu
 * et le numéro de son passage (region). Plus fiable qu'un seul passage sur tout le son.
 */
export function transcribeSegments(audio16k, segments, language = "auto", progress = () => {}, signal) {
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
    const rate = 16000, pad = 0.15;
    const segs = segments.map((s) => {
      const a = Math.max(0, Math.floor((s.start - pad) * rate)), b = Math.min(audio16k.length, Math.ceil((s.end + pad) * rate));
      return { offset: a / rate, audio: audio16k.slice(a, b) };
    });
    whisperWorker().postMessage({ id, segments: segs, language }, segs.map((s) => s.audio.buffer));
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

let spk = null, spkId = 1;
const spkPending = new Map();
let spkProgress = null;

/** Empreintes de voix (WeSpeaker) de passages (Float32Array mono 16 kHz) ; null pour un passage trop court. */
export function voiceEmbeddings(segments, progress = () => {}) {
  spkProgress = progress;
  if (!spk) {
    spk = new Worker(new URL("./speaker-worker.js", import.meta.url), { type: "module" });
    spk.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") { spkProgress?.(m); return; }
      const p = spkPending.get(m.id);
      if (!p) return;
      spkPending.delete(m.id);
      if (m.error) p.reject(new Error(m.error)); else p.resolve(m.embeddings);
    };
    spk.onerror = (e) => {
      for (const p of spkPending.values()) p.reject(new Error(e.message || "SPEAKER_WORKER"));
      spkPending.clear();
      spk = null;
    };
  }
  return new Promise((resolve, reject) => {
    const id = spkId++;
    spkPending.set(id, { resolve, reject });
    spk.postMessage({ id, segments });
  });
}
