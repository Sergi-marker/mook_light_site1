// AI PRODUCER CHAT: a real conversation with the producer.
//  • Online (optional, desktop app + Anthropic API key + consent): Claude talks freely, uses
//    tools to change the project and can search the Internet. Only text is sent — never audio.
//  • Offline: the local dialogue engine (core/ai/dialog.ts), in full sentences with context.
// Each change is an ordinary undoable action.

import { generateSong } from "../../core/ai/beat.ts";
import { converse, type DialogState } from "../../core/ai/dialog.ts";
import { describeMemory, preferencesFor } from "../../core/ai/memory.ts";
import { PRODUCER_TOOLS, describeProject, producerSystemPrompt, runProducerTool, type VoiceLayerKind } from "../../core/ai/producerTools.ts";
import { parseBeatPrompt } from "../../core/ai/prompt.ts";
import { styleById } from "../../core/ai/styles.ts";
import { DRUM_KITS } from "../../core/drumSamples.ts";
import type { Action } from "../../core/reducer.ts";
import { SOUND_LIBRARY } from "../../core/soundLibrary.ts";
import { desktop, type App, type ChatBlock, type ChatMessage } from "../app.ts";
import { keyLabel } from "../../core/music.ts";
import { analyzeFlow, findRhymes, flowAdvice } from "../../core/lyrics/writing.ts";
import { confirmDialog, h, toast } from "../dom.ts";

type Entry = {
  role: "user" | "assistant" | "note";
  text: string;
  suggestions?: string[];
  offers?: { label: string; actions: Action[] }[];
  /** Show the « choose a loop » button (SAMPLE FLIP needs a file picked by the user). */
  pickSample?: boolean;
  online?: boolean;
};

// Kept for the whole session (the AI page is re-created on navigation).
const entries: Entry[] = [];
const api: ChatMessage[] = [];
let dialog: DialogState = {};
let consent = false;
let busy = false;

const WELCOME: Entry = {
  role: "assistant",
  text: "Salut, je suis ton producteur. Parle-moi normalement : dis-moi ce que tu veux créer (« fais-moi un afro chill ») ou ce que tu ressens en écoutant (« c'est trop vide », « on entend pas la voix »), pose-moi des questions — je modifie le projet et je t'explique. Tout s'annule avec Ctrl+Z.",
  suggestions: ["fais-moi un beat drill", "c'est trop vide", "change le piano en guitare", "c'est quoi une 808 ?"],
};

export function createProducerChat(app: App, rerender: () => void) {
  const { store } = app;

  const online = () => !!desktop()?.chatClaude && !!app.settings.aiApiKey;

  /** Generate a beat (version 1 = learnt taste) and apply it. Returns a short summary. */
  function generate(styleId: string, prompt: string): string {
    const p = store.getState();
    const req = parseBeatPrompt(prompt || styleById(styleId).label, styleId, p.key.root);
    const song = generateSong(p, req, Math.floor(Math.random() * 1e6), 0, preferencesFor(app.memory, req.style, styleById(req.style).sounds));
    app.applyActions([{ type: "patchProject", patch: song.patch }], "");
    app.startTasteSession(song);
    return song.summary.join(" ");
  }

  function apply(actions: Action[], soundChanges: { trackId: string; soundId: string }[] = []): void {
    if (actions.length) app.applyActions(actions, "");
    for (const c of soundChanges) app.noteSoundChoice(c.trackId, c.soundId);
    if (actions.length || soundChanges.length) app.markGuide("adjust");
  }

  async function layers(trackId: string, kinds: VoiceLayerKind[]): Promise<string> {
    const made = (await app.task("Doubles & harmonies…", () => app.makeVoiceLayers(trackId, kinds))) ?? 0;
    app.markGuide("adjust");
    rerender();
    return made ? `${made} piste(s) vocale(s) créée(s) : ${kinds.join(", ")}.` : "Aucune piste créée (pas de prise audio disponible).";
  }

  async function transitions(drops: boolean): Promise<string> {
    const r = await app.task("Transitions…", () => app.addTransitions(drops));
    app.markGuide("adjust");
    rerender();
    return r ? `${r.placed.length} effet(s) placés (${[...new Set(r.placed.map((f) => f.kind))].join(", ")})${r.drops ? `, batterie coupée avant ${r.drops} refrain(s)` : ""}.` : "Audio indisponible.";
  }

  function flip(mode: "flip" | "original"): string {
    const ok = app.reflip(mode);
    rerender();
    return ok ? (mode === "flip" ? "Nouveau flip écrit dans le pattern courant." : "Chops remis dans l'ordre d'origine.") : "Aucun sample découpé.";
  }

  /** Rhymes as text (for the chat and for Claude). */
  async function rhymes(target: string, syllables?: number): Promise<string> {
    const lex = await app.lexicon();
    if (!lex) return "Le dictionnaire de rimes n'a pas pu être chargé.";
    const all = findRhymes(target, lex, { max: 60, syllables });
    if (!all.length) return `Pas de rime trouvée pour « ${target} ».`;
    const list = (xs: typeof all) => xs.slice(0, 14).map((r) => r.word).join(", ");
    const multi = all.filter((r) => r.multi >= 2), rest = all.filter((r) => r.multi < 2);
    return [
      multi.length ? `Multi-syllabes : ${list(multi)}` : "",
      rest.some((r) => r.kind === "riche") ? `Riches : ${list(rest.filter((r) => r.kind === "riche"))}` : "",
      rest.some((r) => r.kind === "rime") ? `Simples : ${list(rest.filter((r) => r.kind === "rime"))}` : "",
    ].filter(Boolean).join("\n");
  }

  /** Flow analysis as text: one line per bar, then advice. */
  async function flowReport(text: string): Promise<string> {
    const lex = await app.lexicon();
    const bpm = store.getState().bpm;
    const flows = analyzeFlow(text, bpm, lex);
    const lines = flows.slice(0, 24).map((f) => `${f.scheme || "·"} ${String(f.syllables).padStart(2)} syll. (${f.density}${f.rhymeSyllables >= 2 ? `, rime ${f.rhymeSyllables} syll.` : ""}) — ${f.text}`);
    return [...lines, "", ...flowAdvice(flows, bpm)].join("\n");
  }

  async function writingAnswer(r: { rhymes?: { target: string; syllables?: number }; flow?: { text: string } }): Promise<string> {
    return r.rhymes ? rhymes(r.rhymes.target, r.rhymes.syllables) : r.flow ? flowReport(r.flow.text) : "";
  }

  async function pickSample(): Promise<void> {
    const r = await app.task("Sample flip : analyse, mise au tempo et découpe…", () => app.sampleFlip());
    if (!r) return;
    const p = store.getState();
    const key = r.sourceKey ? `en ${keyLabel(r.sourceKey)}${r.shift ? `, transposée de ${r.shift > 0 ? "+" : ""}${r.shift} demi-ton(s) vers ${keyLabel(p.key)}` : ", déjà compatible"}` : "à la tonalité incertaine (je ne l'ai pas transposée)";
    entries.push({ role: "assistant", text: `« ${r.name} » : boucle à ${r.bars ? `${r.sourceBpm} BPM (${r.bars} mesure(s))` : `environ ${r.sourceBpm} BPM`} ${key}. Je l'ai calée à ${p.bpm} BPM et découpée en ${r.chops} chops, avec un premier flip dans BEAT. Lance la lecture !`, suggestions: ["nouveau flip", "ordre d'origine", "ajoute des transitions"] });
    rerender();
  }

  function undo(n: number): void {
    for (let i = 0; i < n; i++) store.undo();
    app.engine.sync();
    app.emit();
  }

  // --- offline -------------------------------------------------------------------------------
  function sendOffline(text: string, note?: string): void {
    const { reply, state } = converse(store.getState(), text, dialog);
    dialog = state;
    if (reply.undo) undo(reply.undo);
    if (reply.generate) generate(reply.generate.style.id, reply.generate.prompt);
    apply(reply.actions, reply.soundChanges);
    if (reply.layers) void layers(reply.layers.trackId, reply.layers.kinds);
    if (reply.transitions) void transitions(reply.transitions.drops);
    if (reply.flip && reply.flip !== "import") flip(reply.flip);
    const writing = reply.rhymes || reply.flow;
    entries.push({ role: "assistant", text: note ? `${note} ${reply.text}` : reply.text, suggestions: writing ? undefined : reply.suggestions, offers: reply.offers, pickSample: reply.flip === "import" });
    if (writing) {
      void writingAnswer(reply).then((answer) => {
        entries.push({ role: "assistant", text: answer, suggestions: reply.suggestions });
        rerender();
      });
    }
  }

  // --- online (Claude + tools) ---------------------------------------------------------------
  async function sendOnline(text: string): Promise<void> {
    const d = desktop()!;
    const startLen = api.length;
    api.push({ role: "user", content: [{ type: "text", text: `[État du projet]\n${describeProject(store.getState())}\n\n[Message de l'utilisateur]\n${text}` }] });
    for (let turn = 0; turn < 10; turn++) {
      const res = await d.chatClaude!({
        apiKey: app.settings.aiApiKey, model: app.settings.aiModel || "claude-opus-5-5",
        system: producerSystemPrompt(), tools: PRODUCER_TOOLS, messages: api, webSearch: app.settings.aiWebSearch !== false,
      });
      if (res.error || !res.content) {
        // Nothing of this exchange reached the model: drop it, answer offline instead.
        if (turn === 0) api.length = startLen;
        sendOffline(text, `(Mode en ligne indisponible : ${res.error ?? "réponse vide"} — je te réponds hors ligne.)`);
        return;
      }
      // Full content, unchanged (thinking blocks included): the conversation stays append-only.
      api.push({ role: "assistant", content: res.content });
      for (const b of res.content) {
        if (b.type === "server_tool_use" && b.name === "web_search") entries.push({ role: "note", text: `🔎 Recherche sur Internet : « ${String((b.input as { query?: string })?.query ?? "")} »` });
      }
      const said = res.content.filter((b): b is ChatBlock & { text: string } => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("").trim();
      if (res.stop_reason === "refusal") {
        entries.push({ role: "assistant", text: "Je ne peux pas répondre à cette demande. On revient à ton morceau ?", online: true });
        return;
      }
      if (said) entries.push({ role: "assistant", text: said, online: true });
      rerender();
      if (res.stop_reason === "pause_turn") continue; // long web search: let the model continue
      if (res.stop_reason !== "tool_use") return;
      const results: ChatBlock[] = [];
      for (const b of res.content) {
        if (b.type !== "tool_use") continue;
        const out = runProducerTool(store.getState(), String(b.name), b.input);
        let result = out.result;
        if (out.generate) result = generate(out.generate.styleId, out.generate.prompt);
        else if (out.layers) result = await layers(out.layers.trackId, out.layers.kinds);
        else if (out.transitions) result = await transitions(out.transitions.drops);
        else if (out.flip) result = flip(out.flip);
        else if (out.rhymes || out.flow) result = await writingAnswer(out);
        else if (out.undo) undo(out.undo);
        else apply(out.actions, out.soundChanges);
        results.push({ type: "tool_result", tool_use_id: String(b.id), content: result || "Fait.", ...(out.isError ? { is_error: true } : {}) });
      }
      api.push({ role: "user", content: results });
    }
  }

  async function send(raw: string): Promise<void> {
    const text = raw.trim();
    if (!text || busy) return;
    entries.push({ role: "user", text });
    app.remember({ type: "command", text });
    if (online() && !consent) {
      consent = await confirmDialog("Utiliser le producteur en ligne ?",
        "Pour une vraie conversation, Claude (Anthropic) reçoit vos messages et une description TEXTE du projet (tempo, tonalité, noms des pistes, sons, volumes, sections). Jamais d'audio ni d'enregistrement. Il peut aussi faire des recherches sur Internet (désactivable dans PARAMÈTRES). Facturé sur votre clé API. Sinon, le producteur répond hors ligne.",
        "Oui, en ligne", "Non, hors ligne");
    }
    busy = true;
    rerender();
    try {
      if (online() && consent) await sendOnline(text);
      else sendOffline(text);
    } finally {
      busy = false;
      rerender();
    }
  }

  return function producerTab(): HTMLElement {
    if (!entries.length) entries.push(WELCOME);
    const mode = online() && consent !== false ? (consent ? "🟢 Claude en ligne" + (app.settings.aiWebSearch !== false ? " + recherche Internet" : "") : "🟢 Claude disponible (en ligne, avec votre accord)") : "⚪ Mode hors ligne";
    const log = h("div", { class: "chat-log", role: "log", "aria-live": "polite" },
      ...entries.map((e, i) => h("div", { class: `chat-msg ${e.role}` },
        h("div", { class: "bubble" }, e.text),
        ...(e.offers?.length ? [h("div", { class: "chips" }, ...e.offers.map((o) => h("button", { class: "btn btn-sm btn-primary", onclick: () => { apply(o.actions); entries.push({ role: "note", text: `✓ ${o.label}` }); rerender(); } }, o.label)))] : []),
        ...(e.pickSample ? [h("div", { class: "chips" }, h("button", { class: "btn btn-sm btn-primary", onclick: () => void pickSample() }, "✂️ Choisir une boucle…"))] : []),
        ...(e.suggestions?.length && i === entries.length - 1 ? [h("div", { class: "chips" }, ...e.suggestions.map((s) => h("button", { class: "chip", onclick: () => void send(s) }, s)))] : []))),
      ...(busy ? [h("div", { class: "chat-msg assistant" }, h("div", { class: "bubble typing" }, "…"))] : []));
    const input = h("textarea", { class: "chat-input", rows: 2, placeholder: "Écris comme tu parles : « mets plus de basse et fais-moi un refrain qui tape »", "aria-label": "Message au producteur" }) as HTMLTextAreaElement;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send(input.value);
      }
    });
    queueMicrotask(() => {
      log.scrollTop = log.scrollHeight;
      if (!busy) input.focus();
    });
    const names = (id: string) => (styleById(id).id === id ? styleById(id).label : SOUND_LIBRARY.find((x) => x.id === id)?.name ?? DRUM_KITS.find((k) => k.id === id)?.name ?? id);
    return h("div", { class: "producer-chat" },
      h("div", { class: "row-inline chat-head" }, h("strong", {}, mode),
        !online() ? h("span", { class: "hint" }, desktop() ? "Pour une conversation libre et des recherches sur Internet : ajoutez une clé API Anthropic dans PARAMÈTRES › IA (optionnel)." : "Conversation libre : disponible dans l'application desktop avec une clé API.") : null,
        h("button", { class: "btn btn-sm", onclick: () => { entries.length = 0; api.length = 0; dialog = {}; rerender(); } }, "Nouvelle conversation")),
      log,
      h("div", { class: "row-inline chat-row" }, input, h("button", { class: "btn btn-ai", disabled: busy, onclick: () => void send(input.value) }, busy ? "…" : "Envoyer")),
      h("details", { class: "card" },
        h("summary", {}, "🧠 Ce que l'IA a appris de vous"),
        h("ul", {}, ...describeMemory(app.memory, names).map((x) => h("li", {}, x))),
        h("button", { class: "btn btn-sm", onclick: async () => {
          if (!(await confirmDialog("Effacer la mémoire de l'IA ?", "L'IA oubliera vos goûts et repartira des réglages de chaque style.", "Effacer", "Annuler", true))) return;
          app.forgetTaste();
          toast("Mémoire effacée.", "ok");
          rerender();
        } }, "Effacer la mémoire")));
  };
}
