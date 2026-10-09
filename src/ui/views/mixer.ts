// MIXER: channel strips grouped by family (DRUMS / MUSIC / VOCALS / BUS & FX) with the MASTER
// pinned on the right. Volume, pan, sends, mute/solo, routing, rename, peak meters with hold
// and clip indicator; detail panel with the insert chain, effect presets and chain copy/paste.

import { cloneChain } from "../../core/effectPresets.ts";
import { isChannelAudible, MASTER } from "../../core/project.ts";
import type { Action } from "../../core/reducer.ts";
import type { Channel, Effect, EffectType, Project } from "../../core/types.ts";
import type { App, View } from "../app.ts";
import { h, toast } from "../dom.ts";
import { fmtGain, fmtPan, meter } from "../widgets.ts";
import { ADDABLE, EFFECT_LABELS, effectEditor, updateEffectMeters } from "./effectEditor.ts";

const KIND_LABEL: Record<Channel["kind"], string> = { drum: "DRUM", instrument: "INST", vocal: "VOX", bus: "BUS", return: "FX", master: "MASTER" };
const GROUPS: { title: string; kinds: Channel["kind"][] }[] = [
  { title: "DRUMS", kinds: ["drum"] },
  { title: "MUSIC", kinds: ["instrument"] },
  { title: "VOCALS", kinds: ["vocal"] },
  { title: "BUS & FX", kinds: ["bus", "return"] },
];

/** Inserts copied with "Copier la chaîne" (shared across views). */
let chainClipboard: Effect[] | null = null;

export function createMixerView(app: App): View {
  const { store } = app;
  const strips = h("div", { class: "mixer-strips" });
  const masterCol = h("div", { class: "mixer-master" });
  const detail = h("div", { class: "mixer-detail" });
  const el = h("section", { class: "view mixer-view" },
    h("div", { class: "toolbar" }, h("h1", {}, "MIXER"),
      h("span", { class: "hint" }, "Pistes → DRUM / MUSIC / VOCAL BUS → MASTER · envois REVERB / DELAY · double-clic sur un nom = renommer · cliquez une tranche pour éditer ses effets"),
      h("button", { class: "btn btn-sm", title: "Remet à zéro les pics mémorisés et les voyants CLIP", onclick: () => { peaks.clear(); } }, "Reset pics")),
    h("div", { class: "mixer-board" }, strips, masterCol), detail);
  let selectedId = MASTER;
  let meters: { id: string; update: (p: number) => void; readout: HTMLElement; clip: HTMLElement }[] = [];
  /** Peak hold (linear) per channel since the last reset. */
  const peaks = new Map<string, number>();

  function rename(ch: Channel): void {
    const n = window.prompt("Nom de la piste :", ch.name)?.trim();
    if (!n || n === ch.name) return;
    const p = store.getState();
    const actions: Action[] = [{ type: "updateChannel", channelId: ch.id, patch: { name: n } }];
    if (p.instruments.some((i) => i.id === ch.id)) actions.push({ type: "updateInstrument", trackId: ch.id, patch: { name: n } });
    if (p.vocals.some((v) => v.id === ch.id)) actions.push({ type: "updateVocalTrack", trackId: ch.id, patch: { name: n } });
    if (p.tracks.some((t) => t.id === ch.id)) actions.push({ type: "updateTrack", trackId: ch.id, patch: { name: n } });
    app.dispatch({ type: "batch", actions });
  }

  function strip(p: Project, ch: Channel): HTMLElement {
    const m = meter(true);
    const readout = h("span", { class: "peak-readout", title: "Pic maximal depuis le dernier reset" }, "−∞");
    const clip = h("button", { class: "clip-led", title: "CLIP : le signal a dépassé 0 dBFS (clic = reset)", onclick: () => peaks.delete(ch.id) }, "CLIP");
    meters.push({ id: ch.id, update: m.update, readout, clip });
    const audible = isChannelAudible(ch, p.channels);
    const vol = h("input", { type: "range", class: "fader", min: 0, max: 1.5, step: 0.01, value: ch.volume, "aria-label": `Volume ${ch.name}`, "data-learn": `channel:${ch.id}:volume`,
      oninput: () => app.dispatch(ch.kind === "master" ? { type: "setMasterVolume", volume: Number(vol.value) } : { type: "updateChannel", channelId: ch.id, patch: { volume: Number(vol.value) } }, `vol:${ch.id}`),
      ondblclick: () => app.dispatch(ch.kind === "master" ? { type: "setMasterVolume", volume: 0.7 } : { type: "updateChannel", channelId: ch.id, patch: { volume: 0.8 } }) });
    const volLabel = h("span", { class: "val small" }, fmtGain(ch.volume));
    vol.addEventListener("input", () => (volLabel.textContent = fmtGain(Number(vol.value))));
    const pan = h("input", { type: "range", class: "knob", min: -1, max: 1, step: 0.01, value: ch.pan, "aria-label": `Pan ${ch.name}`, title: `Pan ${fmtPan(ch.pan)} (double-clic = centre)`, "data-learn": `channel:${ch.id}:pan`,
      oninput: () => app.dispatch({ type: "updateChannel", channelId: ch.id, patch: { pan: Number(pan.value) } }, `pan:${ch.id}`),
      ondblclick: () => app.dispatch({ type: "updateChannel", channelId: ch.id, patch: { pan: 0 } }) });
    const sendable = ch.kind !== "return" && ch.kind !== "master";
    const send = (k: "reverb" | "delay") => {
      const s = h("input", { type: "range", class: "knob", min: 0, max: 1, step: 0.01, value: ch.sends[k], "aria-label": `Envoi ${k} ${ch.name}`, title: `Envoi ${k.toUpperCase()} ${Math.round(ch.sends[k] * 100)}%`,
        oninput: () => app.dispatch({ type: "updateChannel", channelId: ch.id, patch: { sends: { [k]: Number(s.value) } } }, `${k}:${ch.id}`) });
      return h("label", { class: "send" }, h("span", {}, k === "reverb" ? "REV" : "DLY"), s);
    };
    const routable = ch.kind === "drum" || ch.kind === "instrument" || ch.kind === "vocal";
    const outSel = routable
      ? h("select", { class: "strip-out", "aria-label": `Sortie de ${ch.name}`, title: "Routage : vers quel bus va cette piste", onchange: (e: Event) => app.dispatch({ type: "updateChannel", channelId: ch.id, patch: { output: (e.target as HTMLSelectElement).value } }) },
        ...p.channels.filter((c) => c.kind === "bus" || c.kind === "master").map((c) => h("option", { value: c.id, selected: c.id === ch.output }, c.kind === "master" ? "→ MASTER" : `→ ${c.name.replace(" BUS", "")}`)))
      : h("div", { class: "strip-out" });
    const name = h("div", { class: "strip-name", title: `${ch.name} (double-clic = renommer)` }, ch.name);
    if (ch.kind !== "master" && ch.kind !== "return") name.addEventListener("dblclick", () => rename(ch));
    return h("div", { class: `strip kind-${ch.kind} ${selectedId === ch.id ? "selected" : ""} ${audible ? "" : "silenced"}`, "data-channel": ch.id, onclick: (e: Event) => {
      if ((e.target as HTMLElement).closest("input,button,select")) return;
      selectedId = ch.id;
      render();
    } },
      h("div", { class: "strip-kind" }, KIND_LABEL[ch.kind]),
      name,
      h("div", { class: "strip-fx", title: ch.inserts.map((e) => `${EFFECT_LABELS[e.type]}${e.enabled ? "" : " (off)"}`).join(" → ") || "Aucun effet" }, `${ch.inserts.filter((e) => e.enabled).length} FX`),
      sendable ? send("reverb") : h("div", { class: "send" }),
      sendable ? send("delay") : h("div", { class: "send" }),
      ch.kind !== "master" ? h("label", { class: "send" }, h("span", {}, "PAN"), pan) : h("div", { class: "send" }),
      clip,
      h("div", { class: "fader-wrap" }, vol, m.el),
      readout,
      volLabel,
      outSel,
      h("div", { class: "strip-btns" },
        ch.kind !== "master" ? h("button", { class: `btn btn-toggle btn-sm ${ch.mute ? "on" : ""}`, title: "Mute", "aria-pressed": String(ch.mute), onclick: () => app.dispatch({ type: "toggleMute", trackId: ch.id }) }, "M") : null,
        ch.kind !== "master" && ch.kind !== "return" ? h("button", { class: `btn btn-toggle btn-sm solo ${ch.solo ? "on" : ""}`, title: "Solo", "aria-pressed": String(ch.solo), onclick: () => app.dispatch({ type: "toggleSolo", trackId: ch.id }) }, "S") : null),
    );
  }

  function renderDetail(p: Project): void {
    detail.textContent = "";
    const ch = p.channels.find((c) => c.id === selectedId) ?? p.channels[p.channels.length - 1];
    const add = h("select", { "aria-label": "Ajouter un effet" }, h("option", { value: "" }, "+ Ajouter un effet…"), ...ADDABLE.map((t) => h("option", { value: t }, EFFECT_LABELS[t])));
    add.addEventListener("change", () => {
      if (add.value) app.dispatch({ type: "addEffect", channelId: ch.id, effectType: add.value as EffectType });
    });
    const bypassed = app.engine.mixer?.isBypassed(ch.id) ?? false;
    detail.append(
      h("div", { class: "toolbar" }, h("h2", {}, `${ch.name} — effets`), add,
        h("button", { class: `btn btn-toggle btn-sm ${bypassed ? "on" : ""}`, title: "Écouter sans les effets (A/B)", onclick: () => {
          app.engine.mixer?.setBypass(ch.id, !bypassed);
          render();
        } }, bypassed ? "BYPASS (raw)" : "Bypass"),
        h("button", { class: "btn btn-sm", title: "Copier la chaîne d'effets de cette tranche", disabled: !ch.inserts.length, onclick: () => {
          chainClipboard = ch.inserts.map((e) => ({ ...e, params: { ...e.params } }));
          toast(`Chaîne de ${ch.name} copiée (${ch.inserts.length} effets).`, "info");
        } }, "Copier la chaîne"),
        h("button", { class: "btn btn-sm", title: "Remplacer la chaîne de cette tranche par la chaîne copiée", disabled: !chainClipboard, onclick: () => {
          if (!chainClipboard) return;
          app.dispatch({ type: "setInserts", channelId: ch.id, inserts: cloneChain(chainClipboard) });
          toast(`Chaîne collée sur ${ch.name} (Ctrl+Z pour annuler).`, "ok");
        } }, "Coller la chaîne"),
        ch.kind !== "master" ? h("button", { class: "btn btn-sm", title: "Volume 0 dB… pan centre, envois à zéro", onclick: () => app.dispatch({ type: "updateChannel", channelId: ch.id, patch: { volume: 0.8, pan: 0, sends: { reverb: 0, delay: 0 } } }) }, "Réinitialiser") : null,
        ch.kind !== "master" ? h("span", { class: "hint" }, `Sortie : ${p.channels.find((c) => c.id === ch.output)?.name ?? "MASTER"}`) : null),
      h("div", { class: "fx-chain" }, ...(ch.inserts.length ? ch.inserts.map((e, i) => effectEditor(app, ch, e, i, ch.inserts.length)) : [h("p", { class: "hint" }, "Aucun effet. Ajoutez EQ, compresseur, reverb… avec la liste ci-dessus.")])),
    );
  }

  let sig = "";
  function render(): void {
    const p = store.getState();
    meters = [];
    strips.textContent = "";
    masterCol.textContent = "";
    for (const g of GROUPS) {
      const list = p.channels.filter((c) => g.kinds.includes(c.kind));
      if (!list.length) continue;
      strips.append(h("div", { class: "strip-group" }, h("div", { class: "strip-group-title" }, g.title), h("div", { class: "strip-group-row" }, ...list.map((c) => strip(p, c)))));
    }
    const master = p.channels.find((c) => c.kind === "master");
    if (master) masterCol.append(h("div", { class: "strip-group-title" }, "MASTER"), strip(p, master));
    renderDetail(p);
  }
  let pointerDown = false;
  el.addEventListener("pointerdown", () => (pointerDown = true));
  window.addEventListener("pointerup", () => {
    if (!pointerDown) return;
    pointerDown = false;
    const p = store.getState();
    const s = JSON.stringify(p.channels);
    if (s !== sig) {
      sig = s;
      render();
    }
  });
  return {
    el,
    update(p) {
      const s = JSON.stringify(p.channels);
      if (s === sig || pointerDown) return;
      sig = s;
      render();
    },
    frame() {
      for (const m of meters) {
        const pk = app.engine.mixer?.peak(m.id) ?? 0;
        m.update(pk);
        const hold = Math.max(pk, peaks.get(m.id) ?? 0);
        if (hold > 0) peaks.set(m.id, hold);
        m.readout.textContent = hold <= 1e-5 ? "−∞" : `${(20 * Math.log10(hold)).toFixed(1)}`;
        m.readout.classList.toggle("hot", hold >= 0.89);
        m.clip.classList.toggle("on", hold >= 0.999);
      }
      updateEffectMeters(app, detail);
    },
  };
}
