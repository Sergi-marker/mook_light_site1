import { chooseProgression, generateBass, generateChords, generateMelody } from "../../core/ai/melody.ts";
import { keyLabel } from "../../core/music.ts";
import { currentPattern, getChannel, SYNTH_PRESETS } from "../../core/project.ts";
import type { Bass808Params, InstrumentTrack, Project, SynthParams, SynthPreset } from "../../core/types.ts";
import type { App, View } from "../app.ts";
import { confirmDialog, h, toast } from "../dom.ts";
import { fmtDb, fmtHz, fmtMs, fmtPct, reactive, slider } from "../widgets.ts";
import { patternBar } from "./patternBar.ts";
import { createPianoRoll } from "./pianoRoll.ts";

export function createMelodyView(app: App): View {
  const { store } = app;
  const pbar = patternBar(app);
  const trackList = h("div", { class: "ins-list" });
  const params = h("div", { class: "ins-params" });
  const presetAdd = h("select", { "aria-label": "Type d'instrument" }, ...(Object.keys(SYNTH_PRESETS) as SynthPreset[]).map((k) => h("option", { value: k }, SYNTH_PRESETS[k].label)));
  const midiRecBtn = h("button", { class: "btn btn-toggle btn-sm", title: "Enregistrer le clavier MIDI dans le piano roll pendant la lecture (mode PATTERN)", onclick: async () => {
    if (!app.midi.enabled) await app.enableMidi();
    app.midiRecord = !app.midiRecord;
    midiRecBtn.classList.toggle("on", app.midiRecord);
    if (app.midiRecord && !app.midi.inputs().length) toast("Aucun clavier MIDI détecté. Branchez-le puis réessayez.", "error");
  } }, "● REC MIDI");
  const keyInfo = h("span", { class: "hint" });

  const selectedId = (): string | null => {
    const p = store.getState();
    if (app.selectedInstrumentId && p.instruments.some((i) => i.id === app.selectedInstrumentId)) return app.selectedInstrumentId;
    app.selectedInstrumentId = p.instruments[0]?.id ?? null;
    return app.selectedInstrumentId;
  };
  const sel = (): InstrumentTrack | undefined => store.getState().instruments.find((i) => i.id === selectedId());

  const roll = createPianoRoll(app, { getTrackId: selectedId, isMono808: () => sel()?.preset === "808" });

  const aiFill = async () => {
    const p = store.getState();
    const ins = sel();
    if (!ins) return;
    const pat = currentPattern(p);
    if ((pat.notes[ins.id]?.length ?? 0) > 0 && !(await confirmDialog("Remplacer les notes ?", `Les notes de « ${ins.name} » dans ce pattern seront remplacées (annulable avec Ctrl+Z).`, "Générer", "Annuler"))) return;
    const seed = Math.floor(Math.random() * 1e6);
    const prog = chooseProgression(p.key.scale.includes("minor") || p.key.scale === "phrygian" ? "dark" : "happy", seed);
    let notes;
    if (ins.preset === "808" || ins.preset === "bass") {
      const kick = p.tracks.find((t) => t.instrument === "kick");
      const rhythm = (kick && pat.drums[kick.id]?.some((s) => s.on)) ? pat.drums[kick.id] : Array.from({ length: pat.stepCount }, (_, i) => ({ on: i % 16 === 0 || i % 16 === 10, velocity: 100 }));
      notes = generateBass({ key: p.key, progression: prog, stepCount: pat.stepCount, rhythm, genre: "trap", seed, slides: ins.preset === "808" });
    } else if (ins.preset === "pad" || ins.preset === "strings") {
      notes = generateChords({ key: p.key, progression: prog, stepCount: pat.stepCount, genre: "trap", seed });
    } else {
      notes = generateMelody({ key: p.key, genre: "trap", mood: "dark", complexity: 0.55, stepCount: pat.stepCount, progression: prog, seed });
    }
    app.dispatch({ type: "setNotes", trackId: ins.id, notes });
    toast(`${notes.length} notes générées en ${keyLabel(p.key)} — toutes éditables.`, "ok");
  };

  const toolbar = h("div", { class: "toolbar" },
    h("h1", {}, "MELODY"),
    keyInfo,
    midiRecBtn,
    h("button", { class: "btn btn-ai", title: "Génère des notes pour l'instrument sélectionné (mélodie, accords ou ligne de 808), dans la tonalité du projet", onclick: () => void aiFill() }, "✨ Générer (IA)"),
  );

  const left = h("aside", { class: "ins-side" },
    h("h3", {}, "Instruments"),
    trackList,
    h("div", { class: "row-inline" }, presetAdd, h("button", { class: "btn btn-sm", onclick: () => {
      app.dispatch({ type: "addInstrument", preset: presetAdd.value as SynthPreset });
      const p = store.getState();
      app.selectedInstrumentId = p.instruments[p.instruments.length - 1].id;
      app.emit();
    } }, "+ Ajouter")),
    params,
  );
  const el = h("section", { class: "view melody-view" }, toolbar, pbar.el, h("div", { class: "melody-body" }, left, h("div", { class: "melody-main" }, roll.el)));

  function renderList(p: Project): void {
    trackList.textContent = "";
    const anySolo = p.channels.some((c) => c.solo && (c.kind === "drum" || c.kind === "instrument" || c.kind === "vocal"));
    for (const ins of p.instruments) {
      const ch = getChannel(p, ins.id)!;
      const count = currentPattern(p).notes[ins.id]?.length ?? 0;
      trackList.append(h("div", { class: `ins-row ${ins.id === selectedId() ? "selected" : ""} ${ch.mute || (anySolo && !ch.solo) ? "silenced" : ""}` },
        h("button", { class: "track-name", title: "Sélectionner (le clavier MIDI joue cet instrument)", onclick: () => {
          app.selectedInstrumentId = ins.id;
          app.selectedTrackId = ins.id;
          app.emit();
        } }, h("i", { class: "swatch", style: `background:${ins.color}` }), `${ins.name}`, h("small", {}, ` ${SYNTH_PRESETS[ins.preset].label} · ${count}`)),
        h("button", { class: `btn btn-toggle btn-sm ${ch.mute ? "on" : ""}`, title: "Mute", onclick: () => app.dispatch({ type: "toggleMute", trackId: ins.id }) }, "M"),
        h("button", { class: `btn btn-toggle btn-sm solo ${ch.solo ? "on" : ""}`, title: "Solo", onclick: () => app.dispatch({ type: "toggleSolo", trackId: ins.id }) }, "S"),
        h("button", { class: "btn btn-icon btn-sm", title: "Supprimer l'instrument", "aria-label": `Supprimer ${ins.name}`, onclick: async () => {
          if (await confirmDialog("Supprimer l'instrument ?", `« ${ins.name} » et toutes ses notes seront supprimés (annulable).`, "Supprimer", "Annuler", true)) app.dispatch({ type: "removeInstrument", trackId: ins.id });
        } }, "✕")));
    }
  }

  function renderParams(): void {
    params.textContent = "";
    const ins = sel();
    if (!ins) return;
    const p = store.getState();
    const ch = getChannel(p, ins.id)!;
    const id = ins.id;
    const setSynth = (k: keyof SynthParams) => (v: number) => app.dispatch({ type: "updateInstrument", trackId: id, patch: { synth: { [k]: v } } }, `syn:${id}:${k}`);
    const set808 = (k: keyof Bass808Params) => (v: number) => app.dispatch({ type: "updateInstrument", trackId: id, patch: { bass808: { [k]: v } } }, `808:${id}:${k}`);
    const presetSel = h("select", { "aria-label": "Son", onchange: () => app.dispatch({ type: "updateInstrument", trackId: id, patch: { preset: presetSel.value as SynthPreset } }) },
      ...(Object.keys(SYNTH_PRESETS) as SynthPreset[]).map((k) => h("option", { value: k, selected: k === ins.preset }, SYNTH_PRESETS[k].label)));
    params.append(
      h("h3", {}, ins.name),
      h("label", { class: "field" }, h("span", { class: "slider-label" }, "Son"), presetSel),
      slider({ label: "Volume", min: 0, max: 1.5, step: 0.01, value: ch.volume, format: fmtPct, reset: 0.7, learn: `channel:${id}:volume`, onInput: (v) => app.dispatch({ type: "updateChannel", channelId: id, patch: { volume: v } }, `vol:${id}`) }),
      slider({ label: "Pan", min: -1, max: 1, step: 0.01, value: ch.pan, format: (v) => (Math.abs(v) < 0.01 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`), reset: 0, onInput: (v) => app.dispatch({ type: "updateChannel", channelId: id, patch: { pan: v } }, `pan:${id}`) }),
      slider({ label: "Reverb", min: 0, max: 1, step: 0.01, value: ch.sends.reverb, format: fmtPct, onInput: (v) => app.dispatch({ type: "updateChannel", channelId: id, patch: { sends: { reverb: v } } }, `rv:${id}`) }),
    );
    if (ins.preset === "808") {
      const b = ins.bass808;
      params.append(h("h4", {}, "808"),
        slider({ label: "Pitch (tune)", min: -12, max: 12, step: 1, value: b.tune, format: (v) => `${v > 0 ? "+" : ""}${v} st`, reset: 0, onInput: set808("tune") }),
        slider({ label: "Glide / slide", min: 0.01, max: 0.5, step: 0.01, value: b.glide, format: (v) => fmtMs(v * 1000), onInput: set808("glide") }),
        slider({ label: "Punch", min: 0, max: 1, step: 0.01, value: b.punch, format: fmtPct, onInput: set808("punch") }),
        slider({ label: "Attack", min: 0.001, max: 0.1, step: 0.001, value: b.attack, format: (v) => fmtMs(v * 1000), onInput: set808("attack") }),
        slider({ label: "Decay", min: 0.05, max: 4, step: 0.01, value: b.decay, format: (v) => `${v.toFixed(2)} s`, onInput: set808("decay") }),
        slider({ label: "Sustain", min: 0, max: 1, step: 0.01, value: b.sustain, format: fmtPct, onInput: set808("sustain") }),
        slider({ label: "Release", min: 0.01, max: 2, step: 0.01, value: b.release, format: (v) => `${v.toFixed(2)} s`, onInput: set808("release") }),
        slider({ label: "Saturation", min: 0, max: 1, step: 0.01, value: b.saturation, format: fmtPct, onInput: set808("saturation") }),
        slider({ label: "Distortion", min: 0, max: 1, step: 0.01, value: b.distortion, format: fmtPct, onInput: set808("distortion") }),
        slider({ label: "EQ graves (60 Hz)", min: -6, max: 9, step: 0.5, value: b.lowBoostDb, format: fmtDb, reset: 0, onInput: set808("lowBoostDb") }),
        slider({ label: "EQ coupe-haut", min: 300, max: 12000, step: 10, value: b.highCutHz, format: fmtHz, onInput: set808("highCutHz") }),
        slider({ label: "Compression", min: 0, max: 1, step: 0.01, value: b.compression, format: fmtPct, onInput: set808("compression") }),
        h("p", { class: "hint" }, "Slide : sélectionnez une note et appuyez sur L (ou bouton « Slide 808 ») — la 808 glisse depuis la note précédente. Deux notes qui se chevauchent glissent aussi."));
    } else {
      const s = ins.synth;
      params.append(h("h4", {}, "Synthé"),
        slider({ label: "Attack", min: 0.001, max: 2, step: 0.001, value: s.attack, format: (v) => `${v.toFixed(3)} s`, onInput: setSynth("attack") }),
        slider({ label: "Decay", min: 0.01, max: 4, step: 0.01, value: s.decay, format: (v) => `${v.toFixed(2)} s`, onInput: setSynth("decay") }),
        slider({ label: "Sustain", min: 0, max: 1, step: 0.01, value: s.sustain, format: fmtPct, onInput: setSynth("sustain") }),
        slider({ label: "Release", min: 0.01, max: 4, step: 0.01, value: s.release, format: (v) => `${v.toFixed(2)} s`, onInput: setSynth("release") }),
        slider({ label: "Filtre", min: 200, max: 18000, step: 10, value: s.cutoff, format: fmtHz, onInput: setSynth("cutoff") }),
        slider({ label: "Résonance", min: 0.1, max: 12, step: 0.1, value: s.resonance, format: (v) => v.toFixed(1), onInput: setSynth("resonance") }),
        slider({ label: "Env. filtre", min: 0, max: 1, step: 0.01, value: s.filterEnv, format: fmtPct, onInput: setSynth("filterEnv") }),
        slider({ label: "Detune", min: 0, max: 40, step: 1, value: s.detune, format: (v) => `${v} ct`, onInput: setSynth("detune") }));
    }
  }

  const rerender = reactive(params, renderParams);
  let paramSig = "";
  return {
    el,
    update(p) {
      pbar.update(p);
      keyInfo.textContent = `KEY : ${keyLabel(p.key)} — les rangées violettes sont dans la gamme`;
      renderList(p);
      const ins = sel();
      const s = ins ? `${ins.id}|${ins.preset}|${JSON.stringify(ins.synth)}|${JSON.stringify(ins.bass808)}|${JSON.stringify(getChannel(p, ins.id))}` : "";
      if (s !== paramSig) {
        paramSig = s;
        rerender();
      }
      midiRecBtn.classList.toggle("on", app.midiRecord);
      roll.update();
    },
    frame: () => roll.frame(),
  };
}
