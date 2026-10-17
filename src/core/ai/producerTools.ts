// Tools the online AI producer (Claude) can use on the project. Pure: each call returns
// reducer actions + a short French result the model reads back. Inputs come from the model,
// so every value is validated and clamped here — an invalid call becomes an error result,
// never a broken project.

import { DRUM_KITS } from "../drumSamples.ts";
import { NOTE_NAMES, snapToScale, SCALES, type Key, type ScaleId } from "../music.ts";
import { BUS_DRUMS, BUS_MUSIC, BUS_VOCALS, currentPattern, getChannel, MASTER } from "../project.ts";
import type { Action } from "../reducer.ts";
import { SOUND_LIBRARY, soundParams } from "../soundLibrary.ts";
import type { Project } from "../types.ts";
import { energize } from "./assistant.ts";
import { STYLES } from "./styles.ts";

/** JSON-schema tool definition (same shape as the Anthropic SDK's Tool). */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
}

export interface ToolOutcome {
  actions: Action[];
  /** What happened, for the model (French). */
  result: string;
  isError?: boolean;
  /** Undo the last change(s) instead of applying actions. */
  undo?: number;
  /** Generate a beat in this style (needs the app: preferences, memory). */
  generate?: { styleId: string; prompt: string };
  /** Library sounds put on instruments (for the taste memory). */
  soundChanges?: { trackId: string; soundId: string }[];
  /** Create doubles / harmonies from a vocal track (audio processing, done by the app). */
  layers?: { trackId: string; kinds: VoiceLayerKind[] };
  /** Add transition FX (risers, impacts…) and optionally the drums cut before choruses. */
  transitions?: { drops: boolean };
}

export type VoiceLayerKind = "double" | "third-up" | "fifth-up" | "sixth-down" | "octave-up" | "octave-down";
const LAYER_KINDS: VoiceLayerKind[] = ["double", "third-up", "fifth-up", "sixth-down", "octave-up", "octave-down"];

const obj = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) =>
  ({ type: "object" as const, properties, required, additionalProperties: false as const });

export const PRODUCER_TOOLS: ToolDef[] = [
  {
    name: "get_project",
    description: "Détail du projet : tempo, tonalité, pistes (nom, son, volume, mute, réverbe), patterns et nombre de notes, sections de l'arrangement, prises de voix. À appeler avant de modifier quelque chose dont tu n'es pas sûr.",
    input_schema: obj({}),
  },
  {
    name: "set_tempo",
    description: "Change le tempo du projet (BPM, 50–200).",
    input_schema: obj({ bpm: { type: "number" } }),
  },
  {
    name: "set_key",
    description: "Change la tonalité. Les notes existantes sont transposées et recalées dans la nouvelle gamme. root : nom de note anglais (C, C#, D, … B). scale : minor, major, dorian, phrygian, harmonicMinor…",
    input_schema: obj({ root: { type: "string" }, scale: { type: "string" } }),
  },
  {
    name: "set_swing",
    description: "Change le swing / groove (0–60 %).",
    input_schema: obj({ swing: { type: "number" } }),
  },
  {
    name: "change_sound",
    description: "Change le son d'un instrument mélodique (piste par son nom exact, par ex. « Melody », « Chords », « Piano », « 808 Bass », « Log Drum »). sound_id : un id de la bibliothèque (voir la liste dans les instructions).",
    input_schema: obj({ track: { type: "string" }, sound_id: { type: "string" } }),
  },
  {
    name: "mix_track",
    description: "Règle le mixage d'une piste ou d'un bus (nom exact de la piste, ou « batterie », « musique », « voix »). volume_db : variation relative en dB (−12 à +12, 0 = inchangé). mute : true / false / null (inchangé). reverb et delay : niveau d'envoi absolu 0–1, ou null (inchangé).",
    input_schema: obj({ track: { type: "string" }, volume_db: { type: "number" }, mute: { type: ["boolean", "null"] }, reverb: { type: ["number", "null"] }, delay: { type: ["number", "null"] } }),
  },
  {
    name: "apply_drum_kit",
    description: "Change tous les sons de batterie (sauf la 808) par un kit. kit_id : synth (électronique 808, trap / drill), trap-hybrid, boombap, live, rnb, afro, amapiano, dancehall.",
    input_schema: obj({ kit_id: { type: "string", enum: DRUM_KITS.map((k) => k.id) } }),
  },
  {
    name: "add_energy",
    description: "Donne plus d'énergie à un pattern (rolls de charleys, open hat, percussions, clap sur la snare, contre-mélodie). pattern : nom du pattern (« Chorus », « Verse »…) ou chaîne vide pour le pattern affiché.",
    input_schema: obj({ pattern: { type: "string" } }),
  },
  {
    name: "generate_beat",
    description: "Génère un morceau complet (patterns, instruments, arrangement) dans un style, en tenant compte des goûts appris de l'utilisateur. Remplace l'arrangement actuel (annulable). prompt : détails en français (tonalité, humeur, BPM…), peut être vide.",
    input_schema: obj({ style_id: { type: "string", enum: STYLES.map((s) => s.id) }, prompt: { type: "string" } }),
  },
  {
    name: "add_vocal_layers",
    description: "Crée des doubles et/ou des harmonies à partir d'une piste vocale enregistrée (nouvelles pistes, dans la tonalité). track : nom exact de la piste vocale (vide = la première qui a des prises). layers : parmi double, third-up (tierce au-dessus), fifth-up (quinte), sixth-down (tierce en dessous), octave-up, octave-down.",
    input_schema: obj({ track: { type: "string" }, layers: { type: "array", items: { type: "string", enum: ["double", "third-up", "fifth-up", "sixth-down", "octave-up", "octave-down"] } } }),
  },
  {
    name: "add_transitions",
    description: "Ajoute des effets de transition d'après les sections de l'arrangement : montée (riser) et impact sur chaque refrain, descente après, cymbale inversée avant les couplets / ponts. drops : true pour couper aussi la batterie et la 808 sur le dernier temps avant chaque refrain.",
    input_schema: obj({ drops: { type: "boolean" } }),
  },
  {
    name: "undo",
    description: "Annule les dernières modifications (steps : nombre d'étapes, 1 par défaut).",
    input_schema: obj({ steps: { type: "number" } }),
  },
];

/** Compact text description of the project for the model (no audio, ever). */
export function describeProject(p: Project): string {
  const lines: string[] = [];
  const keyName = `${NOTE_NAMES[p.key.root]} ${p.key.scale}`;
  lines.push(`Projet « ${p.name} » : ${p.bpm} BPM, ${keyName}, swing ${p.swing} %.`);
  const db = (v: number) => (v > 0 ? `${(20 * Math.log10(v)).toFixed(1)} dB` : "−∞");
  lines.push("Pistes de batterie :");
  for (const t of p.tracks) {
    const ch = getChannel(p, t.id);
    lines.push(`- ${t.name} (${t.instrument}) son ${t.sampleId ? "importé" : t.builtinSample ?? "synthétisé"} · volume ${ch ? db(ch.volume) : "?"}${ch?.mute ? " · MUTE" : ""}`);
  }
  lines.push("Instruments :");
  for (const i of p.instruments) {
    const ch = getChannel(p, i.id);
    const notes = p.patterns.reduce((n, pt) => n + (pt.notes[i.id]?.length ?? 0), 0);
    const snd = SOUND_LIBRARY.find((s) => s.preset === i.preset && (i.preset !== "sampler" || s.sample === i.sample));
    lines.push(`- ${i.name} : ${i.preset === "sampler" ? `instrument réel ${i.sample}` : i.preset}${snd ? ` (son proche : ${snd.id})` : ""} · ${notes} notes · volume ${ch ? db(ch.volume) : "?"} · réverbe ${Math.round((ch?.sends.reverb ?? 0) * 100)} %${ch?.mute ? " · MUTE" : ""}`);
  }
  if (p.vocals.length) lines.push(`Voix : ${p.vocals.map((v) => `${v.name} (${v.takes.length} prise(s), ${v.clips.length} clip(s))`).join(", ")}.`);
  lines.push(`Patterns : ${p.patterns.map((x) => `${x.name}${x.id === p.currentPatternId ? " (affiché)" : ""}`).join(", ")}.`);
  if (p.arrangement.sections.length) lines.push(`Arrangement : ${p.arrangement.sections.map((s) => `${s.name} (${s.length} mesures)`).join(" → ")}.`);
  else lines.push("Arrangement vide.");
  return lines.join("\n");
}

const num = (x: unknown, lo: number, hi: number): number | null => (typeof x === "number" && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : null);

function trackByName(p: Project, name: unknown): { id: string; label: string } | null {
  if (typeof name !== "string" || !name.trim()) return null;
  const n = name.trim().toLowerCase();
  const BUSES: Record<string, string> = { batterie: BUS_DRUMS, drums: BUS_DRUMS, musique: BUS_MUSIC, music: BUS_MUSIC, voix: BUS_VOCALS, vocals: BUS_VOCALS, master: MASTER };
  if (BUSES[n] && getChannel(p, BUSES[n])) return { id: BUSES[n], label: name.trim() };
  const all = [...p.tracks, ...p.instruments, ...p.vocals];
  const exact = all.find((t) => t.name.toLowerCase() === n) ?? all.find((t) => t.name.toLowerCase().includes(n) || n.includes(t.name.toLowerCase()));
  return exact ? { id: exact.id, label: exact.name } : null;
}

const fail = (result: string): ToolOutcome => ({ actions: [], result, isError: true });

/** Run one tool call against the project. */
export function runProducerTool(p: Project, name: string, input: unknown): ToolOutcome {
  const a = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  switch (name) {
    case "get_project":
      return { actions: [], result: describeProject(p) };
    case "set_tempo": {
      const bpm = num(a.bpm, 50, 200);
      if (bpm === null) return fail("bpm manquant ou invalide.");
      return { actions: [{ type: "setBpm", bpm: Math.round(bpm) }], result: `Tempo : ${p.bpm} → ${Math.round(bpm)} BPM.` };
    }
    case "set_swing": {
      const s = num(a.swing, 0, 60);
      if (s === null) return fail("swing manquant ou invalide.");
      return { actions: [{ type: "setSwing", swing: Math.round(s) }], result: `Swing : ${p.swing} → ${Math.round(s)} %.` };
    }
    case "set_key": {
      const root = NOTE_NAMES.indexOf(String(a.root ?? "").trim().toUpperCase().replace("♯", "#") as (typeof NOTE_NAMES)[number]);
      const flat: Record<string, number> = { DB: 1, EB: 3, GB: 6, AB: 8, BB: 10 };
      const r = root >= 0 ? root : flat[String(a.root ?? "").trim().toUpperCase()] ?? -1;
      const scale = String(a.scale ?? "") as ScaleId;
      if (r < 0) return fail(`Note « ${String(a.root)} » inconnue (C, C#, D, D#, E, F, F#, G, G#, A, A#, B).`);
      if (!(scale in SCALES)) return fail(`Gamme « ${scale} » inconnue (${Object.keys(SCALES).join(", ")}).`);
      const key: Key = { root: r, scale };
      let diff = (((r - p.key.root) % 12) + 12) % 12;
      if (diff > 6) diff -= 12;
      const actions: Action[] = [{ type: "setKey", key }];
      let moved = 0;
      for (const pat of p.patterns)
        for (const [trackId, notes] of Object.entries(pat.notes)) {
          const updates = notes.map((n) => ({ id: n.id, pitch: snapToScale(n.pitch + diff, key) })).filter((u, i) => u.pitch !== notes[i].pitch);
          moved += updates.length;
          if (updates.length) actions.push({ type: "updateNotes", trackId, patternId: pat.id, updates });
        }
      return { actions, result: `Tonalité : ${NOTE_NAMES[r]} ${scale}, ${moved} note(s) transposée(s).` };
    }
    case "change_sound": {
      const t = trackByName(p, a.track);
      const ins = t && p.instruments.find((i) => i.id === t.id);
      if (!ins) return fail(`Instrument « ${String(a.track)} » introuvable. Instruments : ${p.instruments.map((i) => i.name).join(", ")}.`);
      const snd = SOUND_LIBRARY.find((s) => s.id === a.sound_id);
      if (!snd) return fail(`Son « ${String(a.sound_id)} » inconnu.`);
      const sp = soundParams(snd);
      return {
        actions: [{ type: "updateInstrument", trackId: ins.id, patch: { preset: sp.preset, synth: sp.synth, bass808: sp.bass808, sample: sp.sample } }],
        result: `« ${ins.name} » joue maintenant : ${snd.name}.`,
        soundChanges: [{ trackId: ins.id, soundId: snd.id }],
      };
    }
    case "mix_track": {
      const t = trackByName(p, a.track);
      const ch = t && getChannel(p, t.id);
      if (!t || !ch) return fail(`Piste « ${String(a.track)} » introuvable.`);
      const patch: { volume?: number; mute?: boolean; sends?: { reverb?: number; delay?: number } } = {};
      const parts: string[] = [];
      const dv = num(a.volume_db, -12, 12);
      if (dv) {
        patch.volume = Math.round(Math.max(0, Math.min(1.5, ch.volume * 10 ** (dv / 20))) * 1000) / 1000;
        parts.push(`volume ${dv > 0 ? "+" : ""}${dv.toFixed(1)} dB`);
      }
      if (typeof a.mute === "boolean" && a.mute !== ch.mute) {
        patch.mute = a.mute;
        parts.push(a.mute ? "coupée" : "réactivée");
      }
      const rv = num(a.reverb, 0, 1), dl = num(a.delay, 0, 1);
      if (rv !== null || dl !== null) {
        patch.sends = {};
        if (rv !== null) { patch.sends.reverb = rv; parts.push(`réverbe ${Math.round(rv * 100)} %`); }
        if (dl !== null) { patch.sends.delay = dl; parts.push(`delay ${Math.round(dl * 100)} %`); }
      }
      if (!parts.length) return { actions: [], result: `Rien à changer sur « ${t.label} ».` };
      return { actions: [{ type: "updateChannel", channelId: t.id, patch }], result: `« ${t.label} » : ${parts.join(", ")}.` };
    }
    case "apply_drum_kit": {
      const kit = DRUM_KITS.find((k) => k.id === a.kit_id);
      if (!kit) return fail(`Kit inconnu (${DRUM_KITS.map((k) => k.id).join(", ")}).`);
      return { actions: [{ type: "applyDrumKit", kitId: kit.id }], result: `Batterie : kit « ${kit.name} ».` };
    }
    case "add_energy": {
      const want = String(a.pattern ?? "").trim().toLowerCase();
      const pat = (want && p.patterns.find((x) => x.name.toLowerCase().includes(want))) || currentPattern(p);
      return { actions: energize(p, pat), result: `Plus d'énergie sur « ${pat.name} » (rolls, open hat, percs, clap, contre-mélodie si une piste est libre).` };
    }
    case "generate_beat": {
      const st = STYLES.find((s) => s.id === a.style_id);
      if (!st) return fail("Style inconnu.");
      return { actions: [], result: "", generate: { styleId: st.id, prompt: typeof a.prompt === "string" ? a.prompt.slice(0, 300) : "" } };
    }
    case "add_vocal_layers": {
      const t = trackByName(p, a.track);
      const v = (t && p.vocals.find((x) => x.id === t.id)) || p.vocals.find((x) => x.clips.length);
      if (!v || !v.clips.length) return fail("Aucune piste vocale avec des prises : il faut d'abord enregistrer une voix (VOCALS › ● REC).");
      const kinds = (Array.isArray(a.layers) ? a.layers : []).filter((k): k is VoiceLayerKind => LAYER_KINDS.includes(k as VoiceLayerKind));
      if (!kinds.length) return fail("Aucune couche demandée (double, third-up, fifth-up, sixth-down, octave-up, octave-down).");
      return { actions: [], result: "", layers: { trackId: v.id, kinds: [...new Set(kinds)] } };
    }
    case "add_transitions":
      if (!p.arrangement.sections.length) return fail("L'arrangement n'a pas de sections : il faut d'abord générer ou construire la structure du morceau.");
      return { actions: [], result: "", transitions: { drops: a.drops !== false } };
    case "undo": {
      const steps = Math.round(num(a.steps, 1, 10) ?? 1);
      return { actions: [], result: `${steps} modification(s) annulée(s).`, undo: steps };
    }
    default:
      return fail(`Outil « ${name} » inconnu.`);
  }
}

/** System prompt of the online producer (stable → cached). */
export function producerSystemPrompt(): string {
  const sounds = SOUND_LIBRARY.map((s) => `${s.id} (${s.name})`).join(", ");
  const styles = STYLES.map((s) => `${s.id} (${s.label})`).join(", ");
  return [
    "Tu es le producteur IA de Beatmaker Studio, un logiciel de création musicale pour le rap, la trap, la drill, l'afro et le R&B. Tu parles avec l'utilisateur comme un vrai beatmaker en studio : en français, en tutoyant, de façon naturelle, chaleureuse et concrète.",
    "L'utilisateur n'est souvent pas beatmaker : explique simplement, sans jargon inutile, et propose toujours une prochaine étape. Pose une question quand sa demande est ambiguë au lieu de deviner. Garde tes réponses courtes (2 à 5 phrases) sauf si on te demande une explication détaillée.",
    "Tu peux agir sur le projet avec tes outils. Quand l'utilisateur demande un changement, fais-le avec les outils puis dis en une phrase ce que tu as fait et pourquoi ça sonne mieux. Ne prétends jamais avoir fait une modification sans avoir appelé l'outil, et si un outil échoue, dis-le. Tu ne peux pas écouter l'audio : tu raisonnes à partir de la description texte du projet.",
    "Chaque message de l'utilisateur commence par un bloc [État du projet] à jour. Utilise les noms de pistes exacts qui y figurent.",
    `Sons disponibles (change_sound) : ${sounds}.`,
    `Styles disponibles (generate_beat) : ${styles}.`,
    "Toutes les modifications sont annulables (Ctrl+Z ou l'outil undo).",
    "Si l'outil web_search est disponible, utilise-le quand une question porte sur l'actualité, un artiste, une tendance ou une technique que tu ne connais pas avec certitude ; résume en une ou deux phrases et cite la source (nom du site). Ne fais pas de recherche pour les simples modifications du projet.",
  ].join("\n\n");
}
