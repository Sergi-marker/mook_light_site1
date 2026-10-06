// Generic insert-effect editor: enable, reorder, remove and edit every parameter.

import { AUTO_PITCH_PRESETS, type AutoPitchPreset } from "../../core/dsp/autopitch.ts";
import { SCALES, NOTE_NAMES } from "../../core/music.ts";
import type { Channel, Effect, EffectType, ParamValue } from "../../core/types.ts";
import type { App } from "../app.ts";
import { h } from "../dom.ts";
import { fmtDb, fmtHz, fmtMs, fmtPct, select, slider } from "../widgets.ts";

type Spec =
  | { key: string; label: string; kind: "range"; min: number; max: number; step: number; fmt: (v: number) => string }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[] }
  | { key: string; label: string; kind: "bool" };

const r = (key: string, label: string, min: number, max: number, step: number, fmt: (v: number) => string): Spec => ({ key, label, kind: "range", min, max, step, fmt });
const db = fmtDb;
const ratio = (v: number) => `${v.toFixed(1)}:1`;

export const EFFECT_LABELS: Record<EffectType, string> = {
  eq: "EQ", compressor: "Compressor", limiter: "Limiter", saturation: "Saturation", distortion: "Distortion",
  deesser: "De-Esser", gate: "Noise Gate", reverb: "Reverb", delay: "Delay", denoise: "Noise Reduction (live)",
  autopitch: "AUTO PITCH (live)", leveler: "AUTO LEVEL / Consistency", width: "Stereo Width",
};

export const EFFECT_SPECS: Record<EffectType, Spec[]> = {
  eq: [r("lowCutHz", "Coupe-bas", 0, 400, 5, (v) => (v <= 0 ? "off" : fmtHz(v))), r("lowFreqHz", "Graves f", 40, 400, 5, fmtHz), r("lowGainDb", "Graves", -12, 12, 0.5, db),
    r("midFreqHz", "Médium f", 150, 8000, 10, fmtHz), r("midGainDb", "Médium", -12, 12, 0.5, db), r("midQ", "Médium Q", 0.3, 6, 0.1, (v) => v.toFixed(1)),
    r("highFreqHz", "Aigus f", 2000, 16000, 100, fmtHz), r("highGainDb", "Aigus", -12, 12, 0.5, db)],
  compressor: [r("thresholdDb", "Seuil", -60, 0, 0.5, db), r("ratio", "Ratio", 1, 20, 0.1, ratio), r("attackMs", "Attack", 0.1, 100, 0.1, fmtMs), r("releaseMs", "Release", 10, 1000, 5, fmtMs), r("kneeDb", "Knee", 0, 18, 0.5, db), r("makeupDb", "Gain", -12, 24, 0.5, db)],
  limiter: [r("inputGainDb", "Gain d'entrée", 0, 18, 0.1, db), r("ceilingDb", "Plafond", -12, 0, 0.1, db), r("releaseMs", "Release", 5, 500, 5, fmtMs)],
  saturation: [r("drive", "Drive", 0, 1, 0.01, fmtPct), r("mix", "Mix", 0, 1, 0.01, fmtPct)],
  distortion: [r("drive", "Drive", 0, 1, 0.01, fmtPct), r("toneHz", "Tone", 500, 16000, 50, fmtHz), r("mix", "Mix", 0, 1, 0.01, fmtPct)],
  deesser: [r("freq", "Fréquence", 3000, 10000, 100, fmtHz), r("thresholdDb", "Seuil", -60, 0, 0.5, db), r("rangeDb", "Réduction max", 0, 24, 0.5, db)],
  gate: [r("thresholdDb", "Seuil", -90, -10, 0.5, db), r("rangeDb", "Atténuation", 0, 80, 1, db), r("attackMs", "Attack", 0.1, 50, 0.1, fmtMs), r("holdMs", "Hold", 0, 500, 5, fmtMs), r("releaseMs", "Release", 10, 1000, 5, fmtMs)],
  reverb: [r("size", "Taille", 0, 1, 0.01, fmtPct), r("decay", "Durée", 0.2, 8, 0.1, (v) => `${v.toFixed(1)} s`), r("preDelayMs", "Pre-delay", 0, 200, 1, fmtMs), r("toneHz", "Tone", 1000, 16000, 100, fmtHz), r("mix", "Mix", 0, 1, 0.01, fmtPct)],
  delay: [{ key: "time", label: "Temps", kind: "select", options: ["1/16", "1/8", "1/8d", "1/4t", "1/4", "1/2"].map((v) => ({ value: v, label: v })) },
    r("feedback", "Feedback", 0, 0.92, 0.01, fmtPct), r("toneHz", "Tone", 500, 16000, 50, fmtHz), r("mix", "Mix", 0, 1, 0.01, fmtPct), { key: "pingPong", label: "Ping-pong", kind: "bool" }],
  denoise: [r("amountDb", "Réduction max", 0, 30, 1, db)],
  autopitch: [
    { key: "preset", label: "Preset", kind: "select", options: (Object.keys(AUTO_PITCH_PRESETS) as AutoPitchPreset[]).map((k) => ({ value: k, label: AUTO_PITCH_PRESETS[k].label })) },
    r("correction", "Correction", 0, 100, 1, (v) => `${v}%`), r("retuneMs", "Retune speed", 0, 400, 1, fmtMs), r("humanize", "Humanize", 0, 100, 1, (v) => `${v}%`),
    { key: "useProjectKey", label: "Tonalité du projet", kind: "bool" },
    { key: "root", label: "Key (manuelle)", kind: "select", options: NOTE_NAMES.map((n, i) => ({ value: String(i), label: n })) },
    { key: "scale", label: "Scale (manuelle)", kind: "select", options: Object.entries(SCALES).map(([k, v]) => ({ value: k, label: v.label })) },
  ],
  width: [r("width", "Largeur", 0, 2, 0.01, (v) => (v < 0.02 ? "mono" : `${Math.round(v * 100)}%`))],
  leveler: [r("amount", "Consistency", 0, 100, 1, (v) => `${v}%`), r("targetDb", "Niveau cible", -30, -8, 0.5, db), r("maxDb", "Correction max", 1, 18, 0.5, db), r("speedMs", "Vitesse", 50, 2000, 10, fmtMs)],
};

export function effectEditor(app: App, ch: Channel, e: Effect, index: number, total: number): HTMLElement {
  const set = (params: Record<string, ParamValue>, key?: string) => app.dispatch({ type: "updateEffect", channelId: ch.id, effectId: e.id, params }, key);
  const meterEl = h("span", { class: "fx-meter", "data-fx": e.id });
  const head = h("div", { class: "fx-head" },
    h("button", { class: `btn btn-toggle btn-sm ${e.enabled ? "on" : ""}`, title: e.enabled ? "Désactiver" : "Activer", "aria-pressed": String(e.enabled), onclick: () => app.dispatch({ type: "updateEffect", channelId: ch.id, effectId: e.id, enabled: !e.enabled }) }, e.enabled ? "ON" : "OFF"),
    h("strong", {}, EFFECT_LABELS[e.type]),
    meterEl,
    h("span", { class: "grow" }),
    h("button", { class: "btn btn-icon btn-sm", title: "Monter", disabled: index === 0, onclick: () => app.dispatch({ type: "moveEffect", channelId: ch.id, effectId: e.id, delta: -1 }) }, "↑"),
    h("button", { class: "btn btn-icon btn-sm", title: "Descendre", disabled: index === total - 1, onclick: () => app.dispatch({ type: "moveEffect", channelId: ch.id, effectId: e.id, delta: 1 }) }, "↓"),
    h("button", { class: "btn btn-icon btn-sm", title: "Retirer l'effet", "aria-label": `Retirer ${EFFECT_LABELS[e.type]}`, onclick: () => app.dispatch({ type: "removeEffect", channelId: ch.id, effectId: e.id }) }, "✕"));
  const body = h("div", { class: "fx-body" });
  for (const s of EFFECT_SPECS[e.type]) {
    const v = e.params[s.key];
    if (e.type === "autopitch" && (s.key === "root" || s.key === "scale") && e.params.useProjectKey !== false) continue;
    if (s.kind === "range") {
      body.append(slider({ label: s.label, min: s.min, max: s.max, step: s.step, value: typeof v === "number" ? v : s.min, format: s.fmt, onInput: (x) => set({ [s.key]: x }, `fx:${e.id}:${s.key}`) }));
    } else if (s.kind === "select") {
      body.append(select(s.label, s.options, String(v ?? s.options[0].value), (x) => {
        if (e.type === "autopitch" && s.key === "preset") {
          const pr = AUTO_PITCH_PRESETS[x as AutoPitchPreset];
          set({ preset: x, correction: pr.correction, retuneMs: pr.retuneMs, humanize: pr.humanize, formant: pr.formant });
        } else set({ [s.key]: s.key === "root" ? Number(x) : x });
      }));
    } else {
      body.append(h("label", { class: "field" }, h("input", { type: "checkbox", checked: v !== false, onchange: (ev: Event) => set({ [s.key]: (ev.target as HTMLInputElement).checked }) }), " ", s.label));
    }
  }
  return h("div", { class: `fx ${e.enabled ? "" : "off"}` }, head, e.enabled ? body : null);
}

/** Update the live meters (gain reduction, detected pitch…) of rendered effect editors. */
export function updateEffectMeters(app: App, root: HTMLElement): void {
  const meters = app.engine.mixer?.effectMeters;
  if (!meters) return;
  root.querySelectorAll<HTMLElement>(".fx-meter").forEach((el) => {
    const m = meters.get(el.dataset.fx ?? "");
    if (!m) return;
    if (m.gr !== undefined) el.textContent = m.gr > 0.1 ? `GR −${m.gr.toFixed(1)} dB` : "";
    else if (m.detected !== undefined) el.textContent = m.detected > 0 ? `♪ ${noteOf(m.detected)} ${m.shift >= 0 ? "+" : ""}${(m.shift * 100).toFixed(0)} ct` : "—";
    else if (m.gain !== undefined) el.textContent = `${m.gain >= 0 ? "+" : ""}${m.gain.toFixed(1)} dB`;
  });
}

function noteOf(m: number): string {
  const r = Math.round(m);
  return `${NOTE_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}

export const ADDABLE: EffectType[] = ["eq", "compressor", "deesser", "gate", "saturation", "distortion", "limiter", "reverb", "delay", "denoise", "autopitch", "leveler", "width"];
