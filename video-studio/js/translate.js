// Traduction et mise en scène par Claude (optionnel, avec la clé API Anthropic de l'utilisateur).
// Le SDK officiel est chargé à la demande depuis le CDN : rien n'est téléchargé tant qu'on n'utilise pas ces fonctions.

import { ACTIONS } from "./poses.js";
import { LANGS } from "./audio.js";

const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.130.0/+esm";
export const MODEL = "claude-opus-5-5";
const BATCH = 60; // lignes par requête

let clientPromise = null;
let clientKey = "";

async function client(apiKey) {
  if (!apiKey) throw new Error("NO_KEY");
  if (!clientPromise || clientKey !== apiKey) {
    clientKey = apiKey;
    clientPromise = import(SDK_URL).then((mod) => {
      const Anthropic = mod.default ?? mod.Anthropic;
      // La clé reste dans le navigateur de l'utilisateur et part directement vers l'API Anthropic.
      return { Anthropic, c: new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) };
    });
  }
  return clientPromise;
}

/** Appel structuré : renvoie l'objet JSON conforme au schéma. */
async function ask(apiKey, system, user, schema) {
  const { Anthropic, c } = await client(apiKey);
  let res;
  try {
    res = await c.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Si le modèle décline, l'API relance la demande sur un modèle de repli.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("BAD_KEY");
    if (e instanceof Anthropic.RateLimitError) throw new Error("RATE_LIMIT");
    if (e instanceof Anthropic.APIConnectionError) throw new Error("NETWORK");
    if (e instanceof Anthropic.APIError) throw new Error(`API ${e.status ?? ""}: ${e.message}`);
    throw e;
  }
  if (res.stop_reason === "refusal") throw new Error("REFUSED");
  if (res.stop_reason === "max_tokens") throw new Error("TOO_LONG");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

/**
 * Traduit les textes des scènes (ordre et nombre conservés, pour garder les animations).
 * onProgress(done, total) est appelé après chaque lot.
 */
export async function translateLines(apiKey, lines, target, onProgress = () => {}) {
  const langName = LANGS[target]?.name ?? target;
  const out = [];
  for (let i = 0; i < lines.length; i += BATCH) {
    const chunk = lines.slice(i, i + BATCH);
    const schema = {
      type: "object",
      properties: { lines: { type: "array", items: { type: "string" } } },
      required: ["lines"],
      additionalProperties: false,
    };
    const system =
      `You translate short subtitle lines for an animated narrated video (psychology, sport, stories). ` +
      `Translate each line into ${langName}. Keep the meaning, tone and emotional impact; write natural spoken ${langName}, ` +
      `short enough to read as a subtitle. Return exactly ${chunk.length} lines, in the same order, one output line per input line ` +
      `(never merge or split lines).`;
    const user = JSON.stringify({ lines: chunk });
    const res = await ask(apiKey, system, user, schema);
    if (!Array.isArray(res.lines) || res.lines.length !== chunk.length) throw new Error("BAD_COUNT");
    out.push(...res.lines.map(String));
    onProgress(Math.min(lines.length, i + BATCH), lines.length);
  }
  return out;
}

/** Choisit une animation pour chaque scène en lisant tout le texte (meilleur que les mots-clés). */
export async function directScenes(apiKey, lines, onProgress = () => {}) {
  const ids = Object.keys(ACTIONS);
  const out = [];
  for (let i = 0; i < lines.length; i += BATCH) {
    const chunk = lines.slice(i, i + BATCH);
    const schema = {
      type: "object",
      properties: { actions: { type: "array", items: { type: "string", enum: ids } } },
      required: ["actions"],
      additionalProperties: false,
    };
    const system =
      `You direct a short animated video where a simple pictogram character (sometimes two) acts out each subtitle line. ` +
      `For each line choose the one animation that best illustrates it, from: ${ids.join(", ")}. ` +
      `Actions mock, argue, talk, point, ignore and hug show two characters. Vary the choices so consecutive lines rarely repeat ` +
      `the same animation, unless the story clearly continues the same action. Return exactly ${chunk.length} actions, in order.`;
    const res = await ask(apiKey, system, JSON.stringify({ lines: chunk }), schema);
    if (!Array.isArray(res.actions) || res.actions.length !== chunk.length) throw new Error("BAD_COUNT");
    out.push(...res.actions.map((a) => (ACTIONS[a] ? a : "idle")));
    onProgress(Math.min(lines.length, i + BATCH), lines.length);
  }
  return out;
}
