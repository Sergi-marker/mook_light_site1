import { isChannelAudible } from "../../core/project.ts";
import type { Channel, EffectType, Project } from "../../core/types.ts";
import type { App, View } from "../app.ts";
import { h } from "../dom.ts";
import { fmtGain, fmtPan, meter } from "../widgets.ts";
import { ADDABLE, EFFECT_LABELS, effectEditor, updateEffectMeters } from "./effectEditor.ts";

const KIND_LABEL: Record<Channel["kind"], string> = { drum: "DRUM", instrument: "INST", vocal: "VOX", bus: "BUS", return: "FX", master: "MASTER" };

export function createMixerView(app: App): View {
  const { store } = app;
  const strips = h("div", { class: "mixer-strips" });
  const detail = h("div", { class: "mixer-detail" });
  const el = h("section", { class: "view mixer-view" },
    h("div", { class: "toolbar" }, h("h1", {}, "MIXER"), h("span", { class: "hint" }, "Pistes → DRUM / MUSIC / VOCAL BUS → MASTER · envois vers REVERB et DELAY · cliquez une tranche pour éditer ses effets")),
    strips, detail);
  let selectedId = "master";
  let meters: { id: string; update: (p: number) => void }[] = [];

  function strip(p: Project, ch: Channel): HTMLElement {
    const m = meter(true);
    meters.push({ id: ch.id, update: m.update });
    const audible = isChannelAudible(ch, p.channels);
    const vol = h("input", { type: "range", class: "fader", min: 0, max: 1.5, step: 0.01, value: ch.volume, "aria-label": `Volume ${ch.name}`, "data-learn": `channel:${ch.id}:volume`,
      oninput: () => app.dispatch(ch.kind === "master" ? { type: "setMasterVolume", volume: Number(vol.value) } : { type: "updateChannel", channelId: ch.id, patch: { volume: Number(vol.value) } }, `vol:${ch.id}`),
      ondblclick: () => app.dispatch({ type: "updateChannel", channelId: ch.id, patch: { volume: 0.8 } }) });
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
    return h("div", { class: `strip kind-${ch.kind} ${selectedId === ch.id ? "selected" : ""} ${audible ? "" : "silenced"}`, "data-channel": ch.id, onclick: (e: Event) => {
      if ((e.target as HTMLElement).closest("input,button")) return;
      selectedId = ch.id;
      render();
    } },
      h("div", { class: "strip-kind" }, KIND_LABEL[ch.kind]),
      h("div", { class: "strip-name", title: ch.name }, ch.name),
      h("div", { class: "strip-fx", title: ch.inserts.map((e) => `${EFFECT_LABELS[e.type]}${e.enabled ? "" : " (off)"}`).join(" → ") || "Aucun effet" }, `${ch.inserts.filter((e) => e.enabled).length} FX`),
      sendable ? send("reverb") : h("div", { class: "send" }),
      sendable ? send("delay") : h("div", { class: "send" }),
      ch.kind !== "master" ? h("label", { class: "send" }, h("span", {}, "PAN"), pan) : h("div", { class: "send" }),
      h("div", { class: "fader-wrap" }, vol, m.el),
      volLabel,
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
        ch.kind !== "master" ? h("span", { class: "hint" }, `Sortie : ${p.channels.find((c) => c.id === ch.output)?.name ?? "MASTER"}`) : null),
      h("div", { class: "fx-chain" }, ...(ch.inserts.length ? ch.inserts.map((e, i) => effectEditor(app, ch, e, i, ch.inserts.length)) : [h("p", { class: "hint" }, "Aucun effet. Ajoutez EQ, compresseur, reverb… avec la liste ci-dessus.")])),
    );
  }

  let sig = "";
  function render(): void {
    const p = store.getState();
    meters = [];
    strips.textContent = "";
    for (const ch of p.channels) strips.append(strip(p, ch));
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
      for (const m of meters) m.update(app.engine.mixer?.peak(m.id) ?? 0);
      updateEffectMeters(app, detail);
    },
  };
}
