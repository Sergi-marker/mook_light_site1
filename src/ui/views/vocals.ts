// VOCALS: microphone, monitoring, recording (count-in, punch, takes), real-time vocal chain,
// AUTO PITCH (LIVE / STUDIO), AI VOICE CLEAN, VOICE CONSISTENCY, ✨ AUTO VOICE, AI TAKE COMP.

import { Recorder, type InputInfo } from "../../audio/recorder.ts";
import { analyzeTake } from "../../audio/studio.ts";
import { compTakes, takeScores, type CompSegment } from "../../core/ai/takeComp.ts";
import { buildChain, VOCAL_CHAIN_PRESETS, type ChainPreset } from "../../core/effectPresets.ts";
import { AUTO_PITCH_PRESETS, type AutoPitchPreset } from "../../core/dsp/autopitch.ts";
import { integratedLoudness } from "../../core/dsp/loudness.ts";
import type { VoiceAnalysis, VoiceRecommendation } from "../../core/dsp/voiceAnalysis.ts";
import { keyLabel } from "../../core/music.ts";
import { effect, getChannel, secondsToSteps, stepsPerBarOf, stepsToSeconds } from "../../core/project.ts";
import type { Action } from "../../core/reducer.ts";
import type { AudioClip, Effect, Project, VocalRole, VocalTrack } from "../../core/types.ts";
import type { App, View } from "../app.ts";
import { confirmDialog, h, toast } from "../dom.ts";
import { drawWaveform, fmtDb, fmtPct, meter, reactive, slider } from "../widgets.ts";
import { effectEditor, updateEffectMeters } from "./effectEditor.ts";

const CLEAN_LIVE_DB: Record<string, number> = { low: 8, medium: 12, high: 18 };
const LEVEL_AMOUNT: Record<string, number> = { light: 30, normal: 55, strong: 80 };

export function createVocalsView(app: App): View {
  const { store, engine, recorder } = app;
  let selectedId: string | null = null;
  let inputs: InputInfo[] = [];
  let outputs: InputInfo[] = [];
  let analysis: { a: VoiceAnalysis; r: VoiceRecommendation; source: string; trackId: string; previous: Effect[] } | null = null;
  let comp: { trackId: string; segments: CompSegment[]; choice: Record<number, string> } | null = null;
  let punch = false;
  let stopPlay: (() => void) | null = null;

  const inMeter = meter();
  const latencyEl = h("span", { class: "latency" });
  const recState = h("span", { class: "rec-state" });
  const body = h("div", { class: "vocals-body" });
  const el = h("section", { class: "view vocals-view" }, h("div", { class: "toolbar" }, h("h1", {}, "VOCALS"), recState), body);

  const track = (): VocalTrack | undefined => {
    const p = store.getState();
    return p.vocals.find((v) => v.id === selectedId) ?? p.vocals.find((v) => v.armed) ?? p.vocals[0];
  };

  async function refreshDevices(): Promise<void> {
    inputs = await Recorder.listInputs();
    outputs = await Recorder.listOutputs();
    render();
  }

  // --- AUTO VOICE ----------------------------------------------------------------------
  function chainFromRecommendation(v: VocalTrack, r: VoiceRecommendation, current: Effect[]): Effect[] {
    const find = (t: Effect["type"]) => current.find((e) => e.type === t);
    const keep = (t: Effect["type"], enabled: boolean, params: Effect["params"]): Effect => {
      const e = find(t);
      return e ? { ...e, enabled, params: { ...e.params, ...params } } : effect(t, params, enabled);
    };
    return [
      keep("denoise", r.clean !== "off", { amountDb: CLEAN_LIVE_DB[r.clean] ?? 10 }),
      keep("gate", r.gateThresholdDb !== null, { thresholdDb: r.gateThresholdDb ?? -60, rangeDb: 20 }),
      keep("eq", true, { lowCutHz: r.highPassHz, midFreqHz: 350, midGainDb: r.mudCutDb, midQ: 0.9, highFreqHz: 4000, highGainDb: r.presenceBoostDb }),
      keep("deesser", r.deEsserThresholdDb !== null, { thresholdDb: r.deEsserThresholdDb ?? -30, rangeDb: 8 }),
      keep("compressor", true, { ...r.compressor, kneeDb: 6 }),
      keep("autopitch", r.pitchCorrection > 0, { correction: r.pitchCorrection, retuneMs: r.pitchCorrection > 50 ? 50 : 100, humanize: 50, preset: "natural", useProjectKey: true }),
      keep("leveler", r.autoLevel !== "off", { amount: LEVEL_AMOUNT[r.autoLevel] ?? 50 }),
      keep("saturation", v.role === "lead", { drive: 0.12, mix: 0.4 }),
      keep("limiter", true, { ceilingDb: r.limiterCeilingDb }),
    ];
  }

  function autoVoiceActions(): Action[] {
    if (!analysis) return [];
    const p = store.getState();
    const v = p.vocals.find((x) => x.id === analysis!.trackId);
    if (!v) return [];
    const ch = getChannel(p, v.id)!;
    const actions: Action[] = [{ type: "setInserts", channelId: v.id, inserts: chainFromRecommendation(v, analysis.r, ch.inserts) }];
    if (analysis.r.clean !== "off") actions.push({ type: "updateVocalTrack", trackId: v.id, patch: { studio: { ...v.studio, clean: analysis.r.clean } } });
    if (analysis.r.inputGainDb) for (const c of v.clips) actions.push({ type: "updateAudioClip", trackId: v.id, clipId: c.id, patch: { gainDb: Math.max(-12, Math.min(12, c.gainDb + analysis.r.inputGainDb)) } });
    return actions;
  }

  async function runAutoVoice(): Promise<void> {
    const v = track();
    if (!v) return;
    const take = v.takes[v.takes.length - 1];
    let data: { data: Float32Array; sampleRate: number } | null = take ? app.takeData(take) : null;
    let source = take ? `prise « ${take.name} »` : "";
    if (!data) {
      if (!(await confirmDialog("AUTO VOICE", "Aucune prise sur cette piste. Analyser 6 secondes du micro ? Parlez ou chantez normalement, comme pendant un vrai enregistrement.", "Analyser le micro", "Annuler"))) return;
      if (!recorder.isOpen && !(await app.openMic())) return;
      await app.task("Écoute du micro (6 s)…", async () => {
        data = await recorder.captureSnapshot(6);
      });
      source = "6 s du micro";
    }
    if (!data) return;
    const d = data as { data: Float32Array; sampleRate: number };
    await app.task("Analyse de la voix…", async () => {
      const res = await analyzeTake(d.data, d.sampleRate);
      analysis = { a: res.analysis, r: res.recommendation, source, trackId: v.id, previous: getChannel(store.getState(), v.id)!.inserts };
      render();
    });
  }

  function renderAnalysis(): HTMLElement | null {
    if (!analysis) return null;
    const { a, r } = analysis;
    const v = store.getState().vocals.find((x) => x.id === analysis!.trackId);
    const row = (k: string, val: string, cls = "") => h("div", { class: `an-row ${cls}` }, h("span", {}, k), h("strong", {}, val));
    const lvl = (x: string) => (x === "HIGH" ? "warn" : x === "LOW" ? "ok" : "");
    const take = v?.takes[v.takes.length - 1];
    return h("div", { class: "card analysis" },
      h("h3", {}, `VOICE ANALYSIS — ${analysis.source}`),
      h("div", { class: "an-grid" },
        row("Noise", `${a.noise} (SNR ${a.snrDb.toFixed(0)} dB)`, lvl(a.noise)),
        row("Dynamics", `${a.dynamics} (${a.dynamicRangeDb.toFixed(1)} dB)`),
        row("Sibilance", `${a.sibilance} (${a.sibilanceDb.toFixed(1)} dB)`, lvl(a.sibilance)),
        row("Pitch stability", a.voicedRatio > 0.1 ? `${a.pitchStability.toFixed(0)} %` : "voix non tonale"),
        row("Clipping", `${a.clippingPercent.toFixed(2)} %`, a.clippingPercent > 0.01 ? "warn" : "ok"),
        row("Loudness", `${Number.isFinite(a.lufs) ? a.lufs.toFixed(1) : "—"} LUFS · peak ${a.peakDb.toFixed(1)} dBFS`),
        row("Key (voix)", a.detectedKey ? keyLabel(a.detectedKey) : "—"),
      ),
      h("h4", {}, "Recommended processing"),
      h("ul", {},
        h("li", {}, `Nettoyage (AI VOICE CLEAN) : ${r.clean.toUpperCase()}`),
        h("li", {}, `Noise gate : ${r.gateThresholdDb === null ? "off" : `${r.gateThresholdDb} dB`}`),
        h("li", {}, `EQ : ${r.eqLabel} (coupe-bas ${r.highPassHz} Hz${r.mudCutDb ? `, ${r.mudCutDb} dB à 350 Hz` : ""}${r.presenceBoostDb ? `, présence +${r.presenceBoostDb} dB` : ""})`),
        h("li", {}, `De-esser : ${r.deEsserThresholdDb === null ? "off" : `seuil ${r.deEsserThresholdDb} dB`}`),
        h("li", {}, `Recommended compression : ${r.compression} (${r.compressor.ratio}:1, seuil ${r.compressor.thresholdDb} dB)`),
        h("li", {}, `AUTO LEVEL : ${r.autoLevel.toUpperCase()}`),
        h("li", {}, `Recommended pitch correction : ${r.pitchCorrection} %`),
        h("li", {}, `Gain de clip : ${r.inputGainDb > 0 ? "+" : ""}${r.inputGainDb} dB`),
        ...r.notes.map((n) => h("li", { class: "hint" }, n))),
      h("div", { class: "button-row" },
        h("button", { class: "btn", title: "Écouter la chaîne proposée sans modifier le projet", onclick: () => {
          app.startPreview("AUTO VOICE", autoVoiceActions());
          if (take) playTake(analysis!.trackId, take.id);
        } }, "▶ Écouter (preview)"),
        h("button", { class: "btn btn-primary", onclick: () => {
          app.applyActions(autoVoiceActions(), "AUTO VOICE appliqué : la chaîne reste entièrement modifiable.");
        } }, "Appliquer"),
        h("button", { class: "btn", title: "Revenir à la chaîne d'avant AUTO VOICE", onclick: () => {
          app.cancelPreview();
          app.dispatch({ type: "setInserts", channelId: analysis!.trackId, inserts: analysis!.previous });
          toast("AUTO VOICE désactivé : chaîne précédente restaurée.", "ok");
        } }, "Désactiver"),
        h("button", { class: "btn", onclick: () => { analysis = null; render(); } }, "Fermer")),
    );
  }

  // --- chain presets -------------------------------------------------------------------
  function chainActions(v: VocalTrack, preset: ChainPreset): Action[] {
    const ch = getChannel(store.getState(), v.id)!;
    return [
      { type: "setInserts", channelId: v.id, inserts: buildChain(preset, ch.inserts) },
      { type: "updateChannel", channelId: v.id, patch: { sends: { ...preset.sends } } },
    ];
  }

  // --- clips on the timeline -------------------------------------------------------------
  function clipsCard(p: Project, v: VocalTrack): HTMLElement {
    const s = stepsPerBarOf(p);
    const card = h("div", { class: "card" }, h("h3", {}, `Clips de « ${v.name} » sur la timeline`));
    if (!v.clips.length) {
      card.append(h("p", { class: "hint" }, "Aucun clip : enregistrez une prise ou cliquez « Utiliser » sur une prise."));
      return card;
    }
    const rows = v.clips.slice().sort((a, b) => a.start - b.start).map((c) => {
      const take = v.takes.find((t) => t.id === c.takeId);
      const up = (patch: Partial<AudioClip>, key?: string) => app.dispatch({ type: "updateAudioClip", trackId: v.id, clipId: c.id, patch }, key);
      const num = (value: number, min: number, max: number, step: number, on: (x: number) => void, label: string) =>
        h("input", { type: "number", class: "num", value: Number(value.toFixed(2)), min, max, step, "aria-label": label, onchange: (e: Event) => on(Math.max(min, Math.min(max, Number((e.target as HTMLInputElement).value) || 0))) });
      const end = c.start + secondsToSteps(c.duration, p.bpm);
      return h("tr", { class: c.muted ? "muted" : "" },
        h("td", {}, take?.name ?? "?"),
        h("td", {}, `${(c.start / s + 1).toFixed(2)}`),
        h("td", {}, `${c.duration.toFixed(2)} s`),
        h("td", {}, num(c.gainDb, -24, 12, 0.5, (x) => up({ gainDb: x }), "Gain (dB)")),
        h("td", {}, num(c.fadeIn ?? 0, 0, c.duration / 2, 0.05, (x) => up({ fadeIn: x }), "Fade in (s)")),
        h("td", {}, num(c.fadeOut ?? 0, 0, c.duration / 2, 0.05, (x) => up({ fadeOut: x }), "Fade out (s)")),
        h("td", { class: "row-inline" },
          h("button", { class: "btn btn-sm", title: "Placer le curseur au début du clip", onclick: () => { engine.setMode("song"); engine.seek(c.start); } }, "Aller"),
          h("button", { class: "btn btn-sm", title: "Couper le clip au curseur", disabled: !(engine.cursor > c.start && engine.cursor < end), onclick: () => app.dispatch({ type: "splitAudioClips", trackId: v.id, ids: [c.id], step: engine.cursor }) }, "✂"),
          h("button", { class: `btn btn-toggle btn-sm ${c.muted ? "on" : ""}`, onclick: () => up({ muted: !c.muted }) }, "M"),
          h("button", { class: "btn btn-icon btn-sm", title: "Retirer le clip de la timeline (la prise reste)", onclick: () => app.dispatch({ type: "removeAudioClips", trackId: v.id, ids: [c.id] }) }, "✕")));
    });
    card.append(h("table", { class: "comp clips-table" },
      h("tr", {}, h("th", {}, "Prise"), h("th", {}, "Mesure"), h("th", {}, "Durée"), h("th", {}, "Gain dB"), h("th", {}, "Fade in s"), h("th", {}, "Fade out s"), h("th", {}, "")),
      ...rows));
    return card;
  }

  // --- takes ---------------------------------------------------------------------------
  function playTake(trackId: string, takeId: string): void {
    const v = store.getState().vocals.find((x) => x.id === trackId);
    const t = v?.takes.find((x) => x.id === takeId);
    if (!v || !t) return;
    const buf = engine.getAsset(v.playProcessed && t.processedAssetId ? t.processedAssetId : t.assetId);
    if (!buf) return void toast("Audio de la prise introuvable.", "error");
    stopPlay?.();
    engine.stop();
    stopPlay = engine.playBuffer(buf, trackId);
  }

  function useTake(v: VocalTrack, takeId: string): void {
    const t = v.takes.find((x) => x.id === takeId)!;
    const data = app.takeData(t);
    const dur = data ? data.data.length / data.sampleRate : 1;
    app.dispatch({ type: "setAudioClips", trackId: v.id, clips: [{ takeId, start: t.startStep, offset: 0, duration: dur, gainDb: 0 }] });
    toast(`« ${t.name} » est maintenant la prise jouée sur « ${v.name} ».`, "ok");
  }

  function matchTakes(v: VocalTrack): void {
    const levels = v.clips.map((c) => {
      const t = v.takes.find((x) => x.id === c.takeId);
      const d = t && app.takeData(t);
      if (!d) return null;
      const from = Math.floor(c.offset * d.sampleRate);
      return integratedLoudness([d.data.subarray(from, from + Math.floor(c.duration * d.sampleRate))], d.sampleRate);
    });
    const valid = levels.filter((x): x is number => x !== null && Number.isFinite(x));
    if (valid.length < 1) return void toast("Pas de clip mesurable sur cette piste.", "error");
    const target = valid.sort((a, b) => a - b)[Math.floor(valid.length / 2)];
    const actions: Action[] = [];
    v.clips.forEach((c, i) => {
      const l = levels[i];
      if (l !== null && Number.isFinite(l)) actions.push({ type: "updateAudioClip", trackId: v.id, clipId: c.id, patch: { gainDb: Math.max(-12, Math.min(12, target - l)) } });
    });
    app.dispatch({ type: "batch", actions });
    toast(`Niveau des ${actions.length} clip(s) aligné sur ${target.toFixed(1)} LUFS.`, "ok");
  }

  async function runComp(v: VocalTrack): Promise<void> {
    const takes = v.takes.map((t) => ({ t, d: app.takeData(t) })).filter((x) => x.d);
    if (takes.length < 2) return void toast("AI TAKE COMP a besoin d'au moins 2 prises.", "error");
    const p = store.getState();
    await app.task("Analyse des prises…", async () => {
      await new Promise((r) => setTimeout(r, 30));
      const segments = compTakes(takes.map(({ t, d }) => ({ takeId: t.id, startStep: t.startStep, data: d!.data, sampleRate: d!.sampleRate })), p.bpm, stepsPerBarOf(p));
      app.dispatch({ type: "setTakeScores", trackId: v.id, scores: takeScores(segments) });
      comp = { trackId: v.id, segments, choice: Object.fromEntries(segments.map((s, i) => [i, s.best.takeId])) };
      render();
    });
  }

  function applyComp(): void {
    if (!comp) return;
    const p = store.getState();
    const v = p.vocals.find((x) => x.id === comp!.trackId);
    if (!v) return;
    const clips: { takeId: string; start: number; offset: number; duration: number; gainDb: number }[] = [];
    comp.segments.forEach((s, i) => {
      const takeId = comp!.choice[i];
      const t = v.takes.find((x) => x.id === takeId)!;
      const offset = Math.max(0, stepsToSeconds(s.start - t.startStep, p.bpm));
      const d = app.takeData(t);
      const dur = Math.min(stepsToSeconds(s.end - s.start, p.bpm), d ? d.data.length / d.sampleRate - offset : Infinity);
      const prev = clips[clips.length - 1];
      if (prev && prev.takeId === takeId && Math.abs(prev.offset + prev.duration - offset) < 1e-3) prev.duration += dur;
      else if (dur > 0.05) clips.push({ takeId, start: Math.max(s.start, t.startStep), offset, duration: dur, gainDb: 0 });
    });
    app.dispatch({ type: "setAudioClips", trackId: v.id, clips });
    toast(`Comp appliqué : ${clips.length} segment(s). Annulable avec Ctrl+Z.`, "ok");
    comp = null;
    render();
  }

  // --- render ---------------------------------------------------------------------------
  function render(): void {
    const p = store.getState();
    const v = track();
    if (v) selectedId = v.id;
    body.textContent = "";

    // Input / monitoring card
    const inSel = h("select", { "aria-label": "Entrée audio", onchange: () => void app.applySettings({ ...app.settings, inputDevice: inSel.value }) },
      h("option", { value: "" }, "Entrée par défaut (Windows)"), ...inputs.map((d) => h("option", { value: d.deviceId, selected: d.deviceId === app.settings.inputDevice }, d.label)));
    const outSel = h("select", { "aria-label": "Sortie audio (casque)", onchange: () => void app.applySettings({ ...app.settings, outputDevice: outSel.value }) },
      h("option", { value: "" }, "Sortie par défaut (Windows)"), ...outputs.map((d) => h("option", { value: d.deviceId, selected: d.deviceId === app.settings.outputDevice }, d.label)));
    const monitoring = recorder.monitoringTrack !== null;
    const bypassed = v ? engine.mixer?.isBypassed(v.id) ?? false : false;
    body.append(h("div", { class: "card" },
      h("h3", {}, "Entrée & monitoring"),
      h("div", { class: "row-inline" },
        recorder.isOpen
          ? h("button", { class: "btn", onclick: () => { recorder.close(); render(); } }, "Couper le micro")
          : h("button", { class: "btn btn-primary", onclick: async () => { if (await app.openMic()) await refreshDevices(); } }, "🎙 Activer le micro"),
        h("label", { class: "field" }, h("span", { class: "slider-label" }, "MICRO"), inSel),
        h("label", { class: "field" }, h("span", { class: "slider-label" }, "CASQUE"), outSel),
        h("span", { class: "slider-label" }, "NIVEAU"), inMeter.el,
        h("button", { class: `btn btn-toggle ${monitoring ? "on" : ""}`, title: "Entendre sa voix en temps réel à travers la chaîne de la piste armée (utilisez un casque)", disabled: !recorder.isOpen, onclick: () => {
          const target = monitoring ? null : app.armedTrack()?.id ?? null;
          recorder.setMonitoring(target);
          render();
        } }, monitoring ? "🎧 Monitoring ON" : "🎧 Monitoring"),
        v ? h("button", { class: `btn btn-toggle ${bypassed ? "on" : ""}`, title: "RAW / PROCESSED : comparer avec et sans la chaîne vocale (monitoring et lecture)", onclick: () => {
          engine.mixer?.setBypass(v.id, !bypassed);
          render();
        } }, bypassed ? "RAW" : "PROCESSED") : null,
        latencyEl),
      h("p", { class: "hint" }, "Le monitoring passe par toute la chaîne temps réel (gate, EQ, de-esser, compresseur, AUTO PITCH LIVE…). Les prises sont toujours enregistrées brutes : le traitement reste modifiable après coup."),
    ));

    // Recording card
    const m = p.metronome;
    body.append(h("div", { class: "card" },
      h("h3", {}, "Enregistrement"),
      h("div", { class: "row-inline" },
        recorder.isRecording
          ? h("button", { class: "btn btn-rec recording", onclick: () => void app.stopRecording() }, "■ STOP")
          : h("button", { class: "btn btn-rec", title: "Record (R) — commence au curseur de l'arrangement, sur la piste armée", onclick: () => void app.startRecording({ punch }) }, "● REC"),
        h("button", { class: "btn", title: "Play / Stop (Espace)", onclick: () => { engine.setMode("song"); void app.togglePlay(); } }, engine.isPlaying ? "■ Stop" : "▶ Play"),
        h("button", { class: "btn", title: "Pause", onclick: () => app.pause() }, "❚❚ Pause"),
        h("button", { class: `btn btn-toggle ${m.enabled ? "on" : ""}`, onclick: () => app.dispatch({ type: "setMetronome", metronome: { enabled: !m.enabled } }) }, "♩ Métronome"),
        h("label", { class: "field" }, h("span", { class: "slider-label" }, "COUNT-IN"),
          h("select", { "aria-label": "Count-in", onchange: (e: Event) => app.dispatch({ type: "setMetronome", metronome: { countInBars: Number((e.target as HTMLSelectElement).value) } }) },
            ...[0, 1, 2].map((n) => h("option", { value: n, selected: n === m.countInBars }, n ? `${n} mesure${n > 1 ? "s" : ""}` : "aucun")))),
        h("button", { class: `btn btn-toggle ${punch ? "on" : ""}`, title: "Punch in/out : n'enregistre que dans la région de boucle (ARRANGEMENT), avec une mesure de pré-roll", onclick: () => { punch = !punch; render(); } }, "PUNCH"),
        h("span", { class: "hint" }, `Départ : mesure ${Math.floor(engine.cursor / stepsPerBarOf(p)) + 1}${punch && p.arrangement.loop.enabled ? ` · punch mesures ${p.arrangement.loop.start + 1}–${p.arrangement.loop.end}` : punch ? " · ⚠ définissez une boucle dans ARRANGEMENT" : ""}`)),
    ));

    // Tracks & takes
    const tracksCard = h("div", { class: "card" }, h("h3", {}, "Pistes vocales & prises"));
    for (const t of p.vocals) {
      const ch = getChannel(p, t.id)!;
      const selectedCls = t.id === v?.id ? "selected" : "";
      const head = h("div", { class: `voc-row ${selectedCls}` },
        h("input", { type: "radio", name: "armed", checked: t.armed, title: "Armer pour l'enregistrement", "aria-label": `Armer ${t.name}`, onchange: () => {
          app.dispatch({ type: "updateVocalTrack", trackId: t.id, patch: { armed: true } });
          if (recorder.monitoringTrack) recorder.setMonitoring(t.id);
        } }),
        h("button", { class: "track-name", onclick: () => { selectedId = t.id; app.selectedTrackId = t.id; render(); } }, `${t.armed ? "● " : ""}${t.name}`, h("small", {}, ` ${t.takes.length} prise(s)`)),
        h("button", { class: `btn btn-toggle btn-sm ${ch.mute ? "on" : ""}`, onclick: () => app.dispatch({ type: "toggleMute", trackId: t.id }) }, "M"),
        h("button", { class: `btn btn-toggle btn-sm solo ${ch.solo ? "on" : ""}`, onclick: () => app.dispatch({ type: "toggleSolo", trackId: t.id }) }, "S"),
        slider({ label: "Vol", min: 0, max: 1.5, step: 0.01, value: ch.volume, format: fmtPct, learn: `channel:${t.id}:volume`, onInput: (x) => app.dispatch({ type: "updateChannel", channelId: t.id, patch: { volume: x } }, `vol:${t.id}`) }),
        h("button", { class: "btn btn-icon btn-sm", title: "Supprimer la piste", onclick: async () => {
          if (await confirmDialog("Supprimer la piste ?", `« ${t.name} » et ses ${t.takes.length} prise(s) seront retirées du projet (annulable).`, "Supprimer", "Annuler", true)) app.dispatch({ type: "removeVocalTrack", trackId: t.id });
        } }, "✕"));
      tracksCard.append(head);
      if (t.id === v?.id) {
        const list = h("div", { class: "takes" });
        for (const tk of t.takes) {
          const data = app.takeData(tk);
          const cv = h("canvas", { width: 220, height: 28 });
          if (data) drawWaveform(cv, data.data);
          const inUse = t.clips.some((c) => c.takeId === tk.id);
          list.append(h("div", { class: `take ${inUse ? "in-use" : ""}` },
            h("strong", {}, tk.name), cv,
            h("span", { class: "hint" }, `${data ? (data.data.length / data.sampleRate).toFixed(1) : "?"} s${tk.score !== undefined ? ` · score ${tk.score}` : ""}${tk.processedAssetId ? " · STUDIO ✓" : ""}${inUse ? " · sur la timeline" : ""}`),
            h("button", { class: "btn btn-sm", title: "Écouter (à travers la chaîne de la piste)", onclick: () => playTake(t.id, tk.id) }, "▶"),
            h("button", { class: "btn btn-sm", title: "Comparer : utiliser cette prise sur la timeline", onclick: () => useTake(t, tk.id) }, "Utiliser"),
            h("button", { class: "btn btn-sm", title: "Renommer", onclick: () => {
              const n = window.prompt("Nom de la prise :", tk.name);
              if (n) app.dispatch({ type: "renameTake", trackId: t.id, takeId: tk.id, name: n });
            } }, "Renommer"),
            h("button", { class: "btn btn-icon btn-sm", title: "Supprimer la prise", onclick: async () => {
              if (await confirmDialog("Supprimer la prise ?", `« ${tk.name} » sera supprimée (annulable avec Ctrl+Z).`, "Supprimer", "Annuler", true)) app.dispatch({ type: "deleteTake", trackId: t.id, takeId: tk.id });
            } }, "✕")));
        }
        if (!t.takes.length) list.append(h("p", { class: "hint" }, "Pas encore de prise. Armez la piste, placez le curseur dans ARRANGEMENT et appuyez sur ● REC (ou R)."));
        list.append(h("div", { class: "button-row" },
          h("button", { class: "btn btn-sm", onclick: () => stopPlay?.() }, "■ Stop écoute"),
          h("button", { class: "btn btn-sm btn-ai", title: "AI TAKE COMP : choisit la meilleure prise mesure par mesure", onclick: () => void runComp(t) }, "✨ AI TAKE COMP"),
          h("button", { class: "btn btn-sm", title: "VOICE CONSISTENCY : aligne le niveau (LUFS) de tous les clips de la piste", onclick: () => matchTakes(t) }, "Égaliser les niveaux des clips")));
        tracksCard.append(list);
      }
    }
    const roleSel = h("select", { "aria-label": "Rôle" }, ...(["lead", "double", "adlibs", "backing", "custom"] as VocalRole[]).map((r) => h("option", { value: r }, r)));
    tracksCard.append(h("div", { class: "row-inline" }, roleSel, h("button", { class: "btn btn-sm", onclick: () => app.dispatch({ type: "addVocalTrack", role: roleSel.value as VocalRole }) }, "+ Piste vocale")));
    body.append(tracksCard);
    if (v) {
      body.append(clipsCard(p, v));
      const lyrics = h("textarea", { class: "lyrics", rows: 6, placeholder: "Écrivez vos paroles ici (couplets, refrain, ad-libs)… Elles sont enregistrées avec le projet.", "aria-label": `Paroles de ${v.name}` }, v.lyrics ?? "");
      lyrics.addEventListener("input", () => app.dispatch({ type: "updateVocalTrack", trackId: v.id, patch: { lyrics: lyrics.value.slice(0, 20000) } }, `lyrics:${v.id}`));
      const words = (v.lyrics ?? "").trim().split(/\s+/).filter(Boolean).length;
      body.append(h("div", { class: "card" }, h("h3", {}, `Paroles — ${v.name}`), lyrics, h("p", { class: "hint" }, `${words} mot(s) · ${(v.lyrics ?? "").split("\n").filter((l) => l.trim()).length} ligne(s)`)));
    }

    // Take comp results
    if (comp) {
      const ct = p.vocals.find((x) => x.id === comp!.trackId);
      const tName = (id: string) => ct?.takes.find((x) => x.id === id)?.name ?? id;
      body.append(h("div", { class: "card" }, h("h3", {}, "AI TAKE COMP — proposition (vous gardez le contrôle)"),
        h("table", { class: "comp" }, h("tr", {}, h("th", {}, "Mesure"), h("th", {}, "Prise choisie"), h("th", {}, "Pourquoi")),
          ...comp.segments.map((s, i) => h("tr", {},
            h("td", {}, String(Math.floor(s.start / stepsPerBarOf(p)) + 1)),
            h("td", {}, h("select", { onchange: (e: Event) => (comp!.choice[i] = (e.target as HTMLSelectElement).value) },
              ...[s.best, ...s.alternatives].map((c) => h("option", { value: c.takeId, selected: comp!.choice[i] === c.takeId }, `${tName(c.takeId)} (${c.score})`)))),
            h("td", { class: "hint" }, s.alternatives.length ? `meilleur score ; autres : ${s.alternatives.map((a) => `${tName(a.takeId)} ${a.reasons.join(", ") || "ok"}`).join(" · ")}` : "seule prise")))),
        h("div", { class: "button-row" }, h("button", { class: "btn btn-primary", onclick: () => applyComp() }, "Appliquer le comp"), h("button", { class: "btn", onclick: () => { comp = null; render(); } }, "Refuser"))));
    }

    if (!v) return;
    const ch = getChannel(p, v.id)!;
    const ap = ch.inserts.find((e) => e.type === "autopitch");
    const leveler = ch.inserts.find((e) => e.type === "leveler");
    const denoise = ch.inserts.find((e) => e.type === "denoise");
    const pitchMode = v.studio.pitch.enabled ? "studio" : ap?.enabled ? "live" : "off";
    const setPitchMode = (mode: "off" | "live" | "studio") => {
      const actions: Action[] = [];
      if (ap) actions.push({ type: "updateEffect", channelId: v.id, effectId: ap.id, enabled: mode === "live" });
      actions.push({ type: "updateVocalTrack", trackId: v.id, patch: { studio: { ...v.studio, pitch: { ...v.studio.pitch, enabled: mode === "studio" } } } });
      app.dispatch({ type: "batch", actions });
      if (mode === "studio") toast("Mode STUDIO : cliquez « Appliquer le traitement STUDIO » pour calculer la correction haute qualité.", "info", 6000);
    };
    const applyPreset = (k: AutoPitchPreset) => {
      const pr = AUTO_PITCH_PRESETS[k];
      const actions: Action[] = [{ type: "updateVocalTrack", trackId: v.id, patch: { studio: { ...v.studio, pitch: { ...v.studio.pitch, preset: k, correction: pr.correction, retuneMs: pr.retuneMs, humanize: pr.humanize, formant: pr.formant } } } }];
      if (ap) actions.push({ type: "updateEffect", channelId: v.id, effectId: ap.id, params: { preset: k, correction: pr.correction, retuneMs: pr.retuneMs, humanize: pr.humanize, formant: pr.formant } });
      app.dispatch({ type: "batch", actions });
    };
    const setPitchParam = (k: "correction" | "retuneMs" | "humanize" | "formant") => (x: number) => {
      const actions: Action[] = [{ type: "updateVocalTrack", trackId: v.id, patch: { studio: { ...v.studio, pitch: { ...v.studio.pitch, [k]: x } } } }];
      if (ap && k !== "formant") actions.push({ type: "updateEffect", channelId: v.id, effectId: ap.id, params: { [k]: x } });
      app.dispatch({ type: "batch", actions }, `ap:${v.id}:${k}`);
    };
    const sp = v.studio.pitch;
    body.append(h("div", { class: "card" },
      h("h3", {}, `AUTO PITCH — ${v.name} · ${keyLabel(p.key)}`),
      h("div", { class: "row-inline" },
        h("span", { class: "slider-label" }, "MODE"),
        ...(["off", "live", "studio"] as const).map((mo) => h("button", { class: `btn btn-toggle btn-sm ${pitchMode === mo ? "on" : ""}`, title: mo === "live" ? "LIVE PITCH : temps réel (monitoring + lecture), ~10 ms de latence quand il corrige" : mo === "studio" ? "STUDIO PITCH : correction PSOLA haute qualité calculée après l'enregistrement (préserve les formants)" : "Pas de correction", onclick: () => setPitchMode(mo) }, mo === "off" ? "OFF" : mo === "live" ? "LIVE" : "STUDIO"))),
      h("div", { class: "row-inline presets" }, ...(Object.keys(AUTO_PITCH_PRESETS) as AutoPitchPreset[]).map((k) => h("button", { class: `btn btn-sm ${sp.preset === k ? "btn-primary" : ""}`, onclick: () => applyPreset(k) }, AUTO_PITCH_PRESETS[k].label))),
      h("div", { class: "sliders" },
        slider({ label: "Correction", min: 0, max: 100, step: 1, value: sp.correction, format: (x) => `${x}%`, onInput: setPitchParam("correction") }),
        slider({ label: "Retune Speed", min: 0, max: 400, step: 1, value: sp.retuneMs, format: (x) => `${x} ms`, onInput: setPitchParam("retuneMs") }),
        slider({ label: "Humanize", min: 0, max: 100, step: 1, value: sp.humanize, format: (x) => `${x}%`, onInput: setPitchParam("humanize") }),
        slider({ label: "Formant (STUDIO)", min: -6, max: 6, step: 0.5, value: sp.formant, format: (x) => `${x > 0 ? "+" : ""}${x} st`, reset: 0, onInput: setPitchParam("formant") })),
      h("p", { class: "hint" }, "Key / Scale = tonalité du projet (barre du haut). LIVE corrige en temps réel ; STUDIO calcule une correction plus propre après l'enregistrement."),
    ));

    // Clean / consistency / studio processing
    const levelAmount = leveler?.enabled ? Number(leveler.params.amount ?? 50) : 0;
    body.append(h("div", { class: "card" },
      h("h3", {}, "AI VOICE CLEAN · VOICE CONSISTENCY"),
      h("div", { class: "row-inline" }, h("span", { class: "slider-label" }, "AI VOICE CLEAN"),
        ...(["off", "low", "medium", "high"] as const).map((lv) => h("button", { class: `btn btn-toggle btn-sm ${v.studio.clean === lv ? "on" : ""}`, onclick: () => {
          const actions: Action[] = [{ type: "updateVocalTrack", trackId: v.id, patch: { studio: { ...v.studio, clean: lv } } }];
          if (denoise) actions.push({ type: "updateEffect", channelId: v.id, effectId: denoise.id, enabled: lv !== "off", params: { amountDb: CLEAN_LIVE_DB[lv] ?? 10 } });
          app.dispatch({ type: "batch", actions });
        } }, lv.toUpperCase()))),
      h("p", { class: "hint" }, "LIVE : réducteur multibande sans latence pendant le monitoring. STUDIO : débruitage spectral (bruit de fond, souffle, ventilation, PC, silences) calculé sur les prises — les consonnes et respirations sont préservées."),
      h("div", { class: "row-inline" }, h("span", { class: "slider-label" }, "AUTO LEVEL"),
        ...([["off", 0], ["light", 30], ["normal", 55], ["strong", 80]] as const).map(([lab, amt]) => h("button", { class: `btn btn-toggle btn-sm ${(amt === 0 ? levelAmount === 0 : Math.abs(levelAmount - amt) < 1) ? "on" : ""}`, onclick: () => {
          if (leveler) app.dispatch({ type: "updateEffect", channelId: v.id, effectId: leveler.id, enabled: amt > 0, params: { amount: amt || 50 } });
        } }, lab.toUpperCase()))),
      slider({ label: "VOICE CONSISTENCY", min: 0, max: 100, step: 1, value: levelAmount, format: (x) => `${x}%`, onInput: (x) => leveler && app.dispatch({ type: "updateEffect", channelId: v.id, effectId: leveler.id, enabled: x > 0, params: { amount: x } }, `cons:${v.id}`) }),
      h("div", { class: "row-inline" },
        h("button", { class: "btn btn-primary", title: "Calcule AI VOICE CLEAN + STUDIO PITCH sur toutes les prises (non destructif)", onclick: () => void app.processVocalTrack(v.id) }, "Appliquer le traitement STUDIO"),
        h("button", { class: `btn btn-toggle ${v.playProcessed ? "on" : ""}`, title: "Lecture des prises traitées STUDIO (PROCESSED) ou brutes (RAW)", onclick: () => app.dispatch({ type: "updateVocalTrack", trackId: v.id, patch: { playProcessed: !v.playProcessed } }) }, v.playProcessed ? "Lecture : PROCESSED" : "Lecture : RAW")),
    ));

    // AUTO VOICE + chain
    body.append(h("div", { class: "card" },
      h("div", { class: "row-inline" }, h("h3", {}, `Chaîne vocale temps réel — ${v.name}`),
        h("button", { class: "btn btn-ai btn-big", title: "Analyse la voix (bruit, dynamique, spectre, pitch, sibilances, clipping) et propose une chaîne", onclick: () => void runAutoVoice() }, "✨ AUTO VOICE")),
      renderAnalysis(),
      h("div", { class: "row-inline presets" }, h("span", { class: "slider-label" }, "PRESETS DE CHAÎNE"),
        ...VOCAL_CHAIN_PRESETS.map((pr) => h("button", { class: "btn btn-sm", title: `${pr.description} — clic = appliquer (Ctrl+Z pour annuler), Alt+clic = écouter sans appliquer`, onclick: (e: Event) => {
          if ((e as MouseEvent).altKey) {
            app.startPreview(`Chaîne ${pr.name}`, chainActions(v, pr));
            const take = v.takes[v.takes.length - 1];
            if (take) playTake(v.id, take.id);
          } else app.applyActions(chainActions(v, pr), `Chaîne « ${pr.name} » appliquée à ${v.name} — tout reste modifiable.`);
        } }, pr.name))),
      h("p", { class: "hint" }, "MIC → Noise Reduction → Gate → EQ → De-Esser → Compressor → AUTO PITCH → AUTO LEVEL → Saturation → Limiter → envois Reverb / Delay → casque"),
      h("div", { class: "sliders" },
        slider({ label: "Reverb", min: 0, max: 1, step: 0.01, value: ch.sends.reverb, format: fmtPct, onInput: (x) => app.dispatch({ type: "updateChannel", channelId: v.id, patch: { sends: { reverb: x } } }, `rv:${v.id}`) }),
        slider({ label: "Delay", min: 0, max: 1, step: 0.01, value: ch.sends.delay, format: fmtPct, onInput: (x) => app.dispatch({ type: "updateChannel", channelId: v.id, patch: { sends: { delay: x } } }, `dl:${v.id}`) })),
      h("div", { class: "fx-chain" }, ...ch.inserts.map((e, i) => effectEditor(app, ch, e, i, ch.inserts.length))),
    ));
    void fmtDb;
  }

  const rerender = reactive(body, render);
  let sig = "";
  let tick = 0;
  void refreshDevices();
  return {
    el,
    update(p: Project) {
      const s = JSON.stringify([p.vocals, p.channels.filter((c) => c.kind === "vocal"), p.metronome, p.key, p.arrangement.loop, recorder.isOpen, recorder.isRecording, recorder.monitoringTrack, engine.isPlaying, app.settings.inputDevice, app.settings.outputDevice]);
      if (s === sig) return;
      sig = s;
      rerender();
    },
    frame() {
      inMeter.update(recorder.level);
      if (++tick % 15 === 0) {
        latencyEl.textContent = recorder.isOpen ? `Monitoring ≈ ${Math.round(recorder.monitoringLatencyMs())} ms (entrée + sortie)` : "";
        recState.textContent = recorder.isRecording ? (engine.currentPosition() < 0 ? "● COUNT-IN…" : "● RECORDING") : "";
        recState.classList.toggle("on", recorder.isRecording);
        updateEffectMeters(app, body);
      }
    },
    dispose() {
      stopPlay?.();
    },
  };
}
