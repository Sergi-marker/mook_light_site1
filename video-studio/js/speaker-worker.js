// © la triche — Animots
// Empreintes de voix (modèle WeSpeaker ResNet34, licence Apache 2.0, ≈ 26 Mo) : deux passages de la même
// personne donnent deux empreintes proches. Exécuté dans un worker, téléchargé une fois puis gardé.

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/+esm";
const MODEL = "onnx-community/wespeaker-voxceleb-resnet34-LM";

let ready = null;
function load() {
  ready ??= (async () => {
    const { AutoModel, AutoProcessor } = await import(TRANSFORMERS_URL);
    const progress = (p) => { if (p.status === "progress" && /onnx/.test(p.file ?? "")) postMessage({ type: "progress", percent: Math.round(p.progress ?? 0) }); };
    const [model, processor] = await Promise.all([
      AutoModel.from_pretrained(MODEL, { dtype: "fp32", device: "wasm", progress_callback: progress }),
      AutoProcessor.from_pretrained(MODEL),
    ]);
    return { model, processor };
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

self.onmessage = async (e) => {
  const { id, segments } = e.data;
  try {
    const { model, processor } = await load();
    const out = [];
    for (const [i, audio] of segments.entries()) {
      if (!audio || audio.length < 16000 * 0.4) { out.push(null); continue; }
      const inputs = await processor(audio);
      const res = await model(inputs);
      // Nom de la sortie selon la version du modèle : on prend la première.
      const emb = res.embeddings ?? res.embedding ?? Object.values(res)[0];
      out.push(Array.from(emb.data));
      postMessage({ type: "progress", phase: "embed", done: i + 1, total: segments.length });
    }
    postMessage({ id, embeddings: out });
  } catch (err) {
    postMessage({ id, error: String(err?.message ?? err) });
  }
};
