// AI: beat / melody / drum generators, song assistant, mix assistant and AI master.
// Everything runs locally; the optional online assistant (Claude) only receives a text
// summary of the project after explicit consent — never audio.

import { bufferChannels, exportGroups, renderProject } from "../../audio/render.ts";
import { songEndStep } from "../../audio/sequencer.ts";
import { measureMix } from "../../audio/studio.ts";
import { askAssistant, projectSummaryForRemote, type AssistantAnswer } from "../../core/ai/assistant.ts";
import { generateSong, melodyOptions } from "../../core/ai/beat.ts";
import { STYLE_FAMILIES, STYLES, styleById } from "../../core/ai/styles.ts";
import { SOUND_LIBRARY } from "../../core/soundLibrary.ts";
import { generateDrums } from "../../core/ai/drums.ts";
import { generateBass, generateChords, progressionsFor } from "../../core/ai/melody.ts";
import { buildStructure, STRUCTURES } from "../../core/ai/structure.ts";
import { drumVariation, VARIATIONS, type VariationKind } from "../../core/ai/variation.ts";
import { MASTER_TARGETS, proposeMaster, refineLimiterGain, type MasterTarget } from "../../core/ai/master.ts";
import { analyzeMix, type GroupMeasure, type Suggestion } from "../../core/ai/mix.ts";
import { parseBeatPrompt, type Mood } from "../../core/ai/prompt.ts";
import type { MixMeasurements } from "../../core/dsp/loudness.ts";
import { bandBalance } from "../../core/dsp/spectrum.ts";
import { degreeToMidi, keyLabel, NOTE_NAMES, SCALES, type ScaleId } from "../../core/music.ts";
import { currentPattern, getChannel, masterChannel } from "../../core/project.ts";
import { reduce, type Action } from "../../core/reducer.ts";
import type { Effect, Project, SynthPreset } from "../../core/types.ts";
import { desktop, type App, type View } from "../app.ts";
import { confirmDialog, h, toast } from "../dom.ts";
import type { Route } from "../shell.ts";

type Tab = "beat" | "melody" | "chords" | "bass" | "drums" | "variation" | "structure" | "assistant" | "mix" | "master";
const TABS: [Tab, string][] = [["beat", "BEAT GENERATOR"], ["melody", "MELODY GENERATOR"], ["chords", "CHORDS"], ["bass", "808 / BASS"], ["drums", "GENERATE DRUMS"], ["variation", "VARIATIONS"], ["structure", "STRUCTURE"], ["assistant", "SONG ASSISTANT"], ["mix", "AI MIX ASSISTANT"], ["master", "AI MASTER"]];
const MOODS: Mood[] = ["dark", "sad", "aggressive", "happy", "chill", "epic", "romantic"];

let lastTab: Tab = "beat";
const chat: { role: "user" | "assistant"; text: string; answer?: AssistantAnswer; remote?: boolean }[] = [];
let remoteConsent = false;

export function createAiView(app: App, navigate: (r: Route) => void): View {
  const { store } = app;
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const panel = h("div", { class: "ai-panel" });
  const el = h("section", { class: "view ai-view" },
    h("div", { class: "toolbar" }, h("h1", {}, "AI"), h("span", { class: "hint" }, "Tout fonctionne hors ligne, sur votre machine. Les résultats sont des patterns, notes et réglages éditables — jamais un simple fichier audio.")),
    tabs, panel);
  let tab = lastTab;

  const field = (label: string, input: HTMLElement) => h("label", { class: "field" }, h("span", { class: "slider-label" }, label), input);
  /** Style picker grouped by family (value = style id). */
  const styleSelect = (value: string) => h("select", { "aria-label": "Style" }, ...STYLE_FAMILIES.map((fam) => h("optgroup", { label: fam },
    ...STYLES.filter((x) => x.family === fam).map((x) => h("option", { value: x.id, selected: x.id === value }, x.label)))));
  const moodSelect = (value: Mood) => h("select", {}, ...MOODS.map((m) => h("option", { value: m, selected: m === value }, m)));
  const range = (min: number, max: number, step: number, value: number) => h("input", { type: "range", min, max, step, value });

  // --- BEAT -----------------------------------------------------------------------------
  type BeatResult = { seed: number; req: ReturnType<typeof parseBeatPrompt>; song: ReturnType<typeof generateSong> };
  let beatState: { prompt: string; style: string; results: BeatResult[]; understood: string[] } = {
    prompt: store.getState().ai.lastBeatPrompt || "140 BPM, F minor, melancholic, heavy 808.", style: "trap", results: [], understood: [],
  };
  function beatTab(): HTMLElement {
    const ta = h("textarea", { class: "prompt", rows: 2, "aria-label": "Décrivez le beat" }, beatState.prompt);
    const st = styleById(beatState.style);
    const gen = (count: number) => {
      beatState.prompt = ta.value;
      const req = parseBeatPrompt(ta.value, beatState.style, store.getState().key.root);
      beatState.understood = req.understood;
      // A style named in the text wins over the picked one; show it as selected.
      beatState.style = req.style;
      beatState.results = Array.from({ length: count }, (_, i) => {
        const seed = Math.floor(Math.random() * 1e6) + i * 7919;
        return { seed, req, song: generateSong(store.getState(), req, seed, i) };
      });
      app.cancelPreview();
      render();
    };
    const families = STYLE_FAMILIES.map((fam) => h("div", { class: "style-family" },
      h("span", { class: "slider-label" }, fam),
      h("div", { class: "style-chips" }, ...STYLES.filter((x) => x.family === fam).map((x) => h("button", {
        class: `style-chip ${x.id === beatState.style ? "active" : ""}`, title: `${x.description} (${x.bpm[0]}–${x.bpm[2]} BPM)`,
        onclick: () => { beatState.style = x.id; render(); },
      }, x.label)))));
    const resultCard = (res: BeatResult, i: number) => h("div", { class: "card" },
      h("h3", {}, beatState.results.length > 1 ? `Version ${i + 1}` : "Proposition"),
      h("ul", {}, ...res.song.summary.map((x) => h("li", {}, x))),
      h("div", { class: "button-row" },
        h("button", { class: "btn", onclick: async () => {
          app.startPreview(`AI BEAT ${i + 1}`, reduce(store.getState(), { type: "patchProject", patch: res.song.patch }));
          app.engine.setMode("song");
          const chorus = res.song.patch.arrangement?.sections.find((x) => /chorus|hook/i.test(x.name));
          app.engine.seek((chorus?.start ?? 0) * 16);
          if (!app.engine.isPlaying) await app.togglePlay();
        } }, "▶ Écouter le refrain"),
        h("button", { class: "btn btn-primary", onclick: () => {
          app.engine.stop();
          app.applyActions([{ type: "patchProject", patch: res.song.patch }, { type: "setAiSettings", ai: { lastBeatPrompt: beatState.prompt } }], `${styleById(res.req.style).label} généré : tout est éditable dans BEAT, MELODY et ARRANGEMENT (Ctrl+Z pour annuler).`);
          beatState.results = [];
          navigate("arrangement");
        } }, "Appliquer au projet")));
    return h("div", {},
      h("p", {}, "1. Choisissez un style  2. Ajoutez des détails si vous voulez (BPM, tonalité, humeur, « 808 lourde »…)  3. Générez une ou trois versions et écoutez-les."),
      ...families,
      h("p", { class: "style-desc" }, h("strong", {}, `${st.label} — `), st.description, h("span", { class: "hint" }, `  · ${st.bpm[0]}–${st.bpm[2]} BPM · sons : ${[st.sounds.lead, st.sounds.chords, st.sounds.bass].map((id) => SOUND_LIBRARY.find((x) => x.id === id)?.name ?? id).join(", ")}`)),
      ta,
      h("p", { class: "hint" }, "Vous pouvez aussi écrire le style directement : « love drill en Bb minor », « mumble rap triste 150 BPM », « drift phonk », « amapiano », « Pop Smoke type beat »…"),
      h("div", { class: "button-row" },
        h("button", { class: "btn btn-ai", onclick: () => gen(1) }, "✨ GENERATE BEAT"),
        h("button", { class: "btn btn-ai", title: "Trois versions différentes du même style, à comparer", onclick: () => gen(3) }, "✨ 3 versions"),
        beatState.results.length ? h("button", { class: "btn", onclick: () => { app.cancelPreview(); app.engine.stop(); } }, "■ Stop / annuler la preview") : null),
      beatState.understood.length ? h("p", { class: "hint" }, `Compris : ${beatState.understood.join(" · ")}`) : null,
      beatState.results.length ? h("div", { class: "options" }, ...beatState.results.map(resultCard)) : null,
      beatState.results.length ? h("p", { class: "hint" }, "Chaque version crée les patterns Intro / Verse / Chorus / Bridge / Outro, les instruments du style et l'arrangement complet. Vos patterns existants sont conservés.") : null,
    );
  }

  // --- MELODY ---------------------------------------------------------------------------
  let melState: { options: ReturnType<typeof melodyOptions> | null; target: string; style: string; mood: Mood; complexity: number } = { options: null, target: "", style: "trap", mood: "dark", complexity: 0.6 };
  function melodyTab(): HTMLElement {
    const p = store.getState();
    const pat = currentPattern(p);
    const melodic = p.instruments.filter((i) => i.preset !== "808");
    if (!melState.target || !p.instruments.some((i) => i.id === melState.target)) melState.target = melodic[0]?.id ?? p.instruments[0]?.id ?? "";
    const g = styleSelect(melState.style);
    const m = moodSelect(melState.mood);
    const cx = range(0, 1, 0.05, melState.complexity);
    const rootSel = h("select", {}, ...NOTE_NAMES.map((n, i) => h("option", { value: i, selected: i === p.key.root }, n)));
    const scaleSel = h("select", {}, ...(Object.keys(SCALES) as ScaleId[]).map((s) => h("option", { value: s, selected: s === p.key.scale }, SCALES[s].label)));
    const target = h("select", {}, ...p.instruments.map((i) => h("option", { value: i.id, selected: i.id === melState.target }, i.name)));
    const previewOption = async (notes: { pitch: number; start: number; length: number; velocity: number }[]) => {
      const q = reduce(store.getState(), { type: "setNotes", trackId: target.value, notes });
      const solo = reduce(q, { type: "patchProject", patch: { channels: q.channels.map((c) => (c.kind === "drum" ? { ...c, mute: true } : c)) } });
      const buf = await app.renderPreview(solo, "pattern", 1);
      if (buf) app.playPreviewBuffer(buf);
    };
    return h("div", {},
      h("div", { class: "row-inline" },
        field("Style", g), field("BPM", h("span", { class: "val" }, String(p.bpm))), field("Key", rootSel), field("Scale", scaleSel), field("Humeur", m), field("Complexité", cx), field("Instrument", target)),
      h("div", { class: "button-row" }, h("button", { class: "btn btn-ai", onclick: () => {
        melState = { ...melState, style: g.value, mood: m.value as Mood, complexity: Number(cx.value), target: target.value };
        melState.options = melodyOptions({ key: { root: Number(rootSel.value), scale: scaleSel.value as ScaleId }, genre: styleById(melState.style).genre, style: melState.style, mood: melState.mood, complexity: melState.complexity, stepCount: pat.stepCount, count: 4 });
        render();
      } }, "✨ Générer 4 options")),
      melState.options ? h("div", { class: "options" }, ...melState.options.map((o) => h("div", { class: "card option" },
        h("h3", {}, o.name), h("p", { class: "hint" }, `${o.notes.length} notes · ${pat.stepCount / 16} mesure(s)`),
        h("div", { class: "button-row" },
          h("button", { class: "btn", onclick: () => void previewOption(o.notes) }, "▶ Écouter"),
          h("button", { class: "btn btn-primary", onclick: () => {
            app.stopPreviewPlayback();
            app.dispatch({ type: "setNotes", trackId: target.value, notes: o.notes });
            app.selectedInstrumentId = target.value;
            toast(`${o.name} importée dans « ${p.instruments.find((i) => i.id === target.value)?.name} » (pattern « ${pat.name} »). Modifiez-la dans le piano roll.`, "ok");
            navigate("melody");
          } }, "Importer"))))) : null,
      h("button", { class: "btn btn-sm", onclick: () => app.stopPreviewPlayback() }, "■ Stop"),
    );
  }

  // --- DRUMS ------------------------------------------------------------------------------
  let drumState = { style: "trap", energy: 0.7, complexity: 0.5, swing: 0 };
  function drumsTab(): HTMLElement {
    const g = styleSelect(drumState.style);
    g.addEventListener("change", () => {
      const st = styleById(g.value);
      drumState = { ...drumState, style: st.id, swing: st.swing, energy: st.energy, complexity: st.complexity };
      render();
    });
    const en = range(0, 1, 0.05, drumState.energy);
    const cx = range(0, 1, 0.05, drumState.complexity);
    const sw = range(0, 100, 1, drumState.swing);
    const make = (): Action[] => {
      drumState = { style: g.value, energy: Number(en.value), complexity: Number(cx.value), swing: Number(sw.value) };
      const p = store.getState();
      const pat = currentPattern(p);
      const st = styleById(drumState.style);
      const d = generateDrums({ genre: st.genre, style: st, energy: drumState.energy, complexity: drumState.complexity, stepCount: pat.stepCount, seed: Math.floor(Math.random() * 1e6) });
      return [...p.tracks.map((t): Action => ({ type: "setDrumSteps", trackId: t.id, steps: d[t.instrument] })), { type: "setSwing", swing: drumState.swing }];
    };
    let pending: Action[] | null = null;
    return h("div", {},
      h("div", { class: "row-inline" }, field("Style", g), field("BPM", h("span", { class: "val" }, `${store.getState().bpm} (conseillé : ${styleById(drumState.style).bpm[0]}–${styleById(drumState.style).bpm[2]})`)), field("Énergie", en), field("Complexité", cx), field("Swing", sw)),
      h("p", { class: "hint" }, `Cible : pattern « ${currentPattern(store.getState()).name} » (${currentPattern(store.getState()).stepCount} steps).`),
      h("div", { class: "button-row" },
        h("button", { class: "btn btn-ai", onclick: async () => {
          pending = make();
          app.startPreview("GENERATE DRUMS", pending);
          app.engine.setMode("pattern");
          if (!app.engine.isPlaying) await app.togglePlay();
        } }, "✨ Generate Drums (écouter)"),
        h("button", { class: "btn btn-primary", onclick: () => {
          app.applyActions(pending ?? make(), "Pattern de drums appliqué — éditable dans BEAT.");
          pending = null;
        } }, "Appliquer"),
        h("button", { class: "btn", onclick: () => { app.cancelPreview(); app.engine.stop(); } }, "Annuler")));
  }

  // Target instrument: an existing track, or a new one created on apply ("new:<preset>").
  const targetSelect = (presets: SynthPreset[], value: string) => {
    const p = store.getState();
    const list = p.instruments.filter((i) => presets.includes(i.preset));
    return h("select", { "aria-label": "Instrument cible" },
      ...list.map((i) => h("option", { value: i.id, selected: i.id === value }, i.name)),
      ...presets.map((pr) => h("option", { value: `new:${pr}`, selected: value === `new:${pr}` }, `+ nouvel instrument ${pr}`)));
  };
  /** Resolve a target (creating the instrument if needed) and write notes into the current pattern. */
  const writeNotes = (target: string, notes: { pitch: number; start: number; length: number; velocity: number; slide?: boolean }[], label: string) => {
    let id = target;
    if (target.startsWith("new:")) {
      app.dispatch({ type: "addInstrument", preset: target.slice(4) as SynthPreset });
      const p = store.getState();
      id = p.instruments[p.instruments.length - 1].id;
    }
    app.dispatch({ type: "setNotes", trackId: id, notes });
    app.selectedInstrumentId = id;
    toast(`${label} : ${notes.length} notes dans « ${store.getState().instruments.find((i) => i.id === id)?.name} » (pattern « ${currentPattern(store.getState()).name} »). Éditables dans MELODY, Ctrl+Z pour annuler.`, "ok", 6000);
    return id;
  };
  const previewNotes = async (target: string, notes: { pitch: number; start: number; length: number; velocity: number; slide?: boolean }[], preset: SynthPreset) => {
    let q = store.getState();
    let id = target;
    if (target.startsWith("new:")) {
      q = reduce(q, { type: "addInstrument", preset });
      id = q.instruments[q.instruments.length - 1].id;
    }
    q = reduce(q, { type: "setNotes", trackId: id, notes });
    const buf = await app.renderPreview(q, "pattern", 1);
    if (buf) app.playPreviewBuffer(buf);
  };

  // --- CHORDS -------------------------------------------------------------------------------
  let chordState = { mood: "dark" as Mood, prog: 0, style: "sustain" as "sustain" | "stabs" | "arp", target: "", seed: 1 };
  function chordsTab(): HTMLElement {
    const p = store.getState();
    const pat = currentPattern(p);
    const m = moodSelect(chordState.mood);
    const progs = progressionsFor(chordState.mood);
    const roman = (deg: number) => ["I", "II", "III", "IV", "V", "VI", "VII"][deg % 7];
    const chordName = (deg: number) => {
      const root = degreeToMidi(deg, p.key, 60);
      const third = degreeToMidi(deg + 2, p.key, 60) - root;
      return `${NOTE_NAMES[root % 12]}${third === 3 ? "m" : ""}`;
    };
    const progSel = h("select", { "aria-label": "Progression" }, ...progs.map((pr, i) => h("option", { value: i, selected: i === chordState.prog }, `${pr.map(roman).join(" – ")}   (${pr.map(chordName).join(" – ")})`)));
    const styleSel = h("select", { "aria-label": "Style d'accords" }, ...([["sustain", "Tenus (pad)"], ["stabs", "Stabs rythmiques"], ["arp", "Arpège"]] as const).map(([v, l]) => h("option", { value: v, selected: v === chordState.style }, l)));
    const def = p.instruments.find((i) => ["pad", "strings", "epiano", "piano"].includes(i.preset))?.id ?? "new:pad";
    const target = targetSelect(["pad", "strings", "epiano", "piano", "synth", "pluck"], chordState.target || def);
    m.addEventListener("change", () => { chordState.mood = m.value as Mood; chordState.prog = 0; render(); });
    const make = () => {
      chordState = { ...chordState, mood: m.value as Mood, prog: Number(progSel.value), style: styleSel.value as typeof chordState.style, target: target.value };
      return generateChords({ key: p.key, progression: progs[chordState.prog] ?? progs[0], stepCount: pat.stepCount, genre: "trap", seed: chordState.seed, style: chordState.style });
    };
    const presetOf = () => (target.value.startsWith("new:") ? (target.value.slice(4) as SynthPreset) : "pad");
    return h("div", {},
      h("p", {}, `Progressions d'accords dans la tonalité du projet (${keyLabel(p.key)}), une par mesure, avec un voice-leading fluide.`),
      h("div", { class: "row-inline" }, field("Humeur", m), field("Progression", progSel), field("Style", styleSel), field("Instrument", target)),
      h("div", { class: "button-row" },
        h("button", { class: "btn", onclick: () => void previewNotes(target.value, make(), presetOf()) }, "▶ Écouter"),
        h("button", { class: "btn btn-primary", onclick: () => { app.stopPreviewPlayback(); writeNotes(target.value, make(), "Accords"); render(); } }, "Appliquer au pattern"),
        h("button", { class: "btn", onclick: () => { chordState.seed = Math.floor(Math.random() * 1e6); toast("Nouveau voicing (rythme des stabs/arpèges) : réécoutez.", "info"); } }, "↻ Varier"),
        h("button", { class: "btn btn-sm", onclick: () => app.stopPreviewPlayback() }, "■ Stop")));
  }

  // --- 808 / BASS -----------------------------------------------------------------------------
  let bassState = { mood: "dark" as Mood, prog: 0, rhythm: "kick" as "kick" | "sustain" | "bounce", slides: true, target: "", style: "trap", seed: 1 };
  function bassTab(): HTMLElement {
    const p = store.getState();
    const pat = currentPattern(p);
    const m = moodSelect(bassState.mood);
    const g = styleSelect(bassState.style);
    g.addEventListener("change", () => { bassState.style = g.value; bassState.mood = styleById(g.value).mood; bassState.prog = 0; render(); });
    const progs = [...styleById(bassState.style).progressions, ...progressionsFor(bassState.mood)];
    const progSel = h("select", { "aria-label": "Progression" }, ...progs.map((pr, i) => h("option", { value: i, selected: i === bassState.prog }, pr.map((d) => ["I", "II", "III", "IV", "V", "VI", "VII"][d % 7]).join(" – "))));
    const rhy = h("select", { "aria-label": "Rythme" }, ...([["kick", "Suit le kick"], ["sustain", "Notes longues (1 par mesure)"], ["bounce", "Rebond (syncopé)"]] as const).map(([v, l]) => h("option", { value: v, selected: v === bassState.rhythm }, l)));
    const slides = h("input", { type: "checkbox", checked: bassState.slides, "aria-label": "Slides" });
    const def = p.instruments.find((i) => i.preset === "808")?.id ?? "new:808";
    const target = targetSelect(["808", "bass"], bassState.target || def);
    m.addEventListener("change", () => { bassState.mood = m.value as Mood; bassState.prog = 0; render(); });
    const make = () => {
      bassState = { ...bassState, mood: m.value as Mood, style: g.value, prog: Number(progSel.value), rhythm: rhy.value as typeof bassState.rhythm, slides: slides.checked, target: target.value };
      const kickTrack = p.tracks.find((t) => t.instrument === "kick");
      const kickSteps = kickTrack ? pat.drums[kickTrack.id] : undefined;
      const rhythm = Array.from({ length: pat.stepCount }, (_, i) => {
        const on = bassState.rhythm === "kick" ? !!kickSteps?.[i]?.on : bassState.rhythm === "sustain" ? i % 16 === 0 : [0, 3, 7, 10, 14].includes(i % 16);
        return { on, velocity: 110 };
      });
      if (!rhythm.some((s) => s.on)) for (let i = 0; i < pat.stepCount; i += 16) rhythm[i] = { on: true, velocity: 110 };
      return generateBass({ key: p.key, progression: progs[bassState.prog] ?? progs[0], stepCount: pat.stepCount, rhythm, genre: styleById(bassState.style).genre, seed: bassState.seed, slides: bassState.slides, slideAmount: Math.max(0.15, styleById(bassState.style).slides) });
    };
    const presetOf = () => (target.value.startsWith("new:") ? (target.value.slice(4) as SynthPreset) : "808");
    return h("div", {},
      h("p", {}, `Ligne de 808 / basse sur les fondamentales des accords, en ${keyLabel(p.key)}, calée sur le kick du pattern « ${pat.name} ». Les slides (glissés) sont éditables avec la touche L dans le piano roll.`),
      h("div", { class: "row-inline" }, field("Style", g), field("Humeur", m), field("Progression", progSel), field("Rythme", rhy), h("label", { class: "field" }, slides, " Slides"), field("Instrument", target)),
      h("div", { class: "button-row" },
        h("button", { class: "btn", onclick: () => void previewNotes(target.value, make(), presetOf()) }, "▶ Écouter"),
        h("button", { class: "btn btn-primary", onclick: () => { app.stopPreviewPlayback(); writeNotes(target.value, make(), "808"); render(); } }, "Appliquer au pattern"),
        h("button", { class: "btn", onclick: () => { bassState.seed = Math.floor(Math.random() * 1e6); toast("Nouvelle variante de slides : réécoutez.", "info"); } }, "↻ Varier"),
        h("button", { class: "btn btn-sm", onclick: () => app.stopPreviewPlayback() }, "■ Stop")));
  }

  // --- VARIATIONS ---------------------------------------------------------------------------
  let varKind: VariationKind = "fill";
  function variationTab(): HTMLElement {
    const p = store.getState();
    const pat = currentPattern(p);
    const make = (kind: VariationKind): Action[] => {
      const d = drumVariation(pat.drums, p.tracks, kind, pat.stepCount, Math.floor(Math.random() * 1e6));
      return p.tracks.map((t) => ({ type: "setDrumSteps", trackId: t.id, steps: d[t.id], patternId: pat.id }));
    };
    let pending: Action[] | null = null;
    return h("div", {},
      h("p", {}, `Crée une variation du pattern « ${pat.name} » (drums). « Nouveau pattern » garde l'original intact : posez la variation dans l'ARRANGEMENT (fin de couplet, break…).`),
      h("div", { class: "options" }, ...VARIATIONS.map((v) => h("div", { class: `card option ${varKind === v.id ? "selected" : ""}` },
        h("h3", {}, v.label), h("p", { class: "hint" }, v.detail),
        h("div", { class: "button-row" },
          h("button", { class: "btn", onclick: async () => {
            varKind = v.id;
            pending = make(v.id);
            app.startPreview(`Variation ${v.label}`, pending);
            app.engine.setMode("pattern");
            if (!app.engine.isPlaying) await app.togglePlay();
          } }, "▶ Écouter"),
          h("button", { class: "btn btn-primary", title: "Crée un nouveau pattern avec cette variation", onclick: () => {
            const acts = varKind === v.id && pending ? pending : make(v.id);
            app.cancelPreview();
            app.dispatch({ type: "addPattern", copyFrom: pat.id, name: `${pat.name} ${v.label}`.slice(0, 30), select: true });
            const id = store.getState().currentPatternId;
            app.dispatch({ type: "batch", actions: acts.map((a) => (a.type === "setDrumSteps" ? { ...a, patternId: id } : a)) });
            pending = null;
            toast(`Pattern « ${currentPattern(store.getState()).name} » créé — éditable dans BEAT, prêt pour l'ARRANGEMENT.`, "ok", 6000);
            render();
          } }, "Nouveau pattern"),
          h("button", { class: "btn btn-sm", title: "Remplace les drums du pattern actuel (Ctrl+Z pour annuler)", onclick: () => {
            app.applyActions(varKind === v.id && pending ? pending : make(v.id), `Variation « ${v.label} » appliquée à « ${pat.name} ».`);
            pending = null;
          } }, "Remplacer"))))),
      h("button", { class: "btn btn-sm", onclick: () => { app.cancelPreview(); app.engine.stop(); } }, "■ Stop / annuler la preview"));
  }

  // --- STRUCTURE ------------------------------------------------------------------------------
  let structId = "trap";
  function structureTab(): HTMLElement {
    const p = store.getState();
    const sel = h("select", { "aria-label": "Structure" }, ...STRUCTURES.map((st) => h("option", { value: st.id, selected: st.id === structId }, st.label)));
    sel.addEventListener("change", () => { structId = sel.value; render(); });
    const res = buildStructure(p, structId);
    const action: Action = { type: "patchProject", patch: { arrangement: res.arrangement } };
    return h("div", {},
      h("p", {}, "Construit un arrangement complet à partir de VOS patterns existants (choisis d'après leur nom — Intro, Couplet/Verse, Refrain/Chorus/Hook, Bridge, Outro — ou leur énergie). Les clips vocaux ne sont pas touchés."),
      h("div", { class: "row-inline" }, field("Structure", sel), h("span", { class: "hint" }, `${p.patterns.length} pattern(s) disponibles`)),
      h("div", { class: "card" }, h("h3", {}, "Proposition"), h("ul", {}, ...res.summary.map((x) => h("li", {}, x))),
        h("p", { class: "hint" }, res.arrangement.sections.map((x) => `${x.name} (${x.length})`).join(" → ")),
        p.arrangement.clips.length ? h("p", { class: "hint" }, `⚠ Remplace l'arrangement actuel (${p.arrangement.clips.length} clips) — annulable avec Ctrl+Z.`) : null,
        h("div", { class: "button-row" },
          h("button", { class: "btn", onclick: async () => {
            app.startPreview("Structure", [action]);
            app.engine.setMode("song");
            app.engine.seek(0);
            if (!app.engine.isPlaying) await app.togglePlay();
          } }, "▶ Écouter (preview)"),
          h("button", { class: "btn btn-primary", onclick: () => {
            app.engine.stop();
            app.applyActions([action], "Structure appliquée : ajustez-la dans ARRANGEMENT (Ctrl+Z pour annuler).");
            navigate("arrangement");
          } }, "Appliquer"),
          h("button", { class: "btn", onclick: () => { app.cancelPreview(); app.engine.stop(); } }, "Stop / annuler la preview"))));
  }

  // --- ASSISTANT ----------------------------------------------------------------------------
  function assistantTab(): HTMLElement {
    const log = h("div", { class: "chat" });
    for (const m of chat) {
      if (m.role === "user") log.append(h("div", { class: "msg user" }, m.text));
      else {
        const box = h("div", { class: `msg bot ${m.remote ? "remote" : ""}` }, ...(m.answer ? m.answer.text.map((t) => h("p", {}, t)) : m.text.split("\n").map((t) => h("p", {}, t))));
        for (const s of m.answer?.suggestions ?? []) {
          box.append(h("div", { class: "suggestion" }, h("strong", {}, s.label), h("span", { class: "hint" }, ` — ${s.detail}`),
            h("button", { class: "btn btn-sm", onclick: () => app.startPreview(s.label, s.actions) }, "▶ Preview"),
            h("button", { class: "btn btn-sm btn-primary", onclick: () => app.applyActions(s.actions, `Appliqué : ${s.label} (Ctrl+Z pour annuler)`) }, "Appliquer")));
        }
        log.append(box);
      }
    }
    const input = h("input", { type: "text", class: "chat-input", placeholder: "Ex. : Mon refrain est trop vide.", "aria-label": "Question" });
    const send = () => {
      const q = input.value.trim();
      if (!q) return;
      chat.push({ role: "user", text: q });
      chat.push({ role: "assistant", text: "", answer: askAssistant(store.getState(), q) });
      render();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    const askRemote = async () => {
      const q = input.value.trim();
      if (!q) return void toast("Écrivez d'abord votre question.", "error");
      const d = desktop();
      if (!d) return void toast("AI service unavailable : l'assistant en ligne n'est disponible que dans l'application desktop (Electron). L'assistant local répond hors ligne.", "error", 8000);
      if (!app.settings.aiApiKey) return void toast("AI service unavailable : ajoutez une clé API Anthropic dans SETTINGS → IA.", "error", 8000);
      const summary = projectSummaryForRemote(store.getState());
      if (!remoteConsent) {
        const ok = await confirmDialog("Envoyer à un service en ligne ?",
          `L'assistant en ligne (Claude, Anthropic) recevra votre question et ce résumé TEXTE du projet (${summary.length} caractères : BPM, tonalité, noms et tailles des patterns/sections, nombre de prises). Aucun fichier audio, aucun enregistrement n'est envoyé. Connexion Internet nécessaire.`,
          "Envoyer", "Annuler");
        if (!ok) return;
        remoteConsent = true;
      }
      chat.push({ role: "user", text: q });
      render();
      await app.task("Assistant en ligne…", async () => {
        const history = chat.filter((m) => m.remote || m.role === "user").slice(-8).map((m) => ({ role: m.role, content: m.text || m.answer?.text.join("\n") || "" }));
        const res = await d.askClaude({
          apiKey: app.settings.aiApiKey,
          model: app.settings.aiModel,
          system: `Tu es un producteur de rap/trap expérimenté qui aide dans un logiciel de production. Réponds en français, de façon concrète et actionnable (notes, mesures, réglages en dB/Hz/BPM). Résumé du projet (JSON) : ${summary}`,
          messages: history,
        });
        if (res.error) throw new Error(`AI service unavailable : ${res.error}`);
        chat.push({ role: "assistant", text: res.refusal ? "La demande a été refusée par le service." : res.text ?? "", remote: true });
        render();
      });
    };
    const examples = ["Mon refrain est trop vide.", "Ma 808 ne fonctionne pas avec ma mélodie.", "Je veux rendre le deuxième couplet plus énergique.", "Quelle tonalité correspond à cette mélodie ?", "Propose-moi une structure de morceau."];
    return h("div", {},
      log,
      h("div", { class: "row-inline" }, input, h("button", { class: "btn btn-primary", onclick: send }, "Demander"), h("button", { class: "btn", title: "Question libre à Claude (en ligne, avec votre accord)", onclick: () => void askRemote() }, "Demander en ligne (Claude)")),
      h("div", { class: "row-inline examples" }, ...examples.map((e) => h("button", { class: "btn btn-sm", onclick: () => { input.value = e; send(); } }, e))),
      h("p", { class: "hint" }, "L'assistant local analyse votre projet (structure, énergie, tonalité, 808) et propose des modifications prévisualisables puis applicables. L'assistant en ligne est optionnel et ne reçoit jamais d'audio."));
  }

  // --- MIX ----------------------------------------------------------------------------------
  let mixState: { suggestions: Suggestion[]; mix: (MixMeasurements & { bands: ReturnType<typeof bandBalance> }) | null } = { suggestions: [], mix: null };
  async function analyzeCurrentMix(): Promise<void> {
    if (!(await app.ensureAudio())) return;
    app.engine.stop();
    await app.task("Rendu & analyse du mix…", async () => {
      const p = store.getState();
      const media = app.media();
      const song = songEndStep(p) > 0;
      // Representative excerpt (end of a verse + the first chorus, max 16 bars) keeps the analysis fast.
      const chorus = p.arrangement.sections.find((x) => /chorus|refrain|hook/i.test(x.name));
      const firstClip = Math.min(...p.arrangement.clips.map((c) => c.start), Infinity);
      const startBar = chorus ? Math.max(0, chorus.start - 8) : Number.isFinite(firstClip) ? firstClip : 0;
      const range: [number, number] = [startBar, startBar + 16];
      const base = { mode: (song ? "song" : "pattern") as "song" | "pattern", loops: 4, tail: 1, bypassMaster: true, range: song ? range : undefined };
      const groups = exportGroups(p);
      const b808 = p.instruments.filter((i) => i.preset === "808").map((i) => i.id);
      const drumIds = p.tracks.map((t) => t.id);
      const all = new Set([...drumIds, ...p.instruments.map((i) => i.id), ...p.vocals.map((v) => v.id)]);
      const only = (keep: string[]) => new Set([...all].filter((id) => !keep.includes(id)));
      const measureGroup = async (keep: string[]): Promise<GroupMeasure | null> => {
        if (!keep.length) return null;
        const buf = await renderProject(p, media, { ...base, muted: only(keep) });
        const ch = bufferChannels(buf);
        const m = await measureMix(ch, buf.sampleRate);
        return { lufs: m.integratedLufs, peakDb: m.samplePeakDb, bands: bandBalance(ch, buf.sampleRate, 150) };
      };
      app.busy = "Analyse : mix complet…"; app.emit();
      const full = await renderProject(p, media, base);
      const fch = bufferChannels(full);
      const fm = await measureMix(fch, full.sampleRate);
      const mix = { ...fm, bands: bandBalance(fch, full.sampleRate) };
      app.busy = "Analyse : groupes…"; app.emit();
      const input = {
        mix,
        drums: await measureGroup(drumIds),
        bass808: await measureGroup(b808),
        music: await measureGroup(p.instruments.filter((i) => i.preset !== "808").map((i) => i.id)),
        vocals: p.vocals.some((v) => v.clips.length) ? await measureGroup([...groups.instrumental]) : null,
      };
      mixState = { suggestions: analyzeMix(p, input), mix };
      render();
    });
  }
  function mixTab(): HTMLElement {
    const m = mixState.mix;
    const sev = { ok: "✓", info: "ℹ", warn: "⚠", issue: "✖" };
    const allActions = mixState.suggestions.flatMap((s) => s.actions);
    return h("div", {},
      h("div", { class: "button-row" }, h("button", { class: "btn btn-ai", onclick: () => void analyzeCurrentMix() }, "✨ Analyser le mix")),
      h("p", { class: "hint" }, "Rendu complet du morceau puis mesure des groupes (drums, 808, musique, voix) : niveaux LUFS, balance tonale, clipping, dynamique, stéréo."),
      m ? h("div", { class: "card an-grid" },
        h("div", { class: "an-row" }, h("span", {}, "Loudness (avant master)"), h("strong", {}, `${m.integratedLufs.toFixed(1)} LUFS`)),
        h("div", { class: "an-row" }, h("span", {}, "Crête"), h("strong", {}, `${m.samplePeakDb.toFixed(1)} dBFS`)),
        h("div", { class: "an-row" }, h("span", {}, "Dynamique (PLR)"), h("strong", {}, `${m.plr.toFixed(1)} dB`)),
        h("div", { class: "an-row" }, h("span", {}, "Balance stéréo"), h("strong", {}, `${(m.stereoBalance * 100).toFixed(0)} %`)),
        h("div", { class: "an-row" }, h("span", {}, "Sub / Graves / Bas-méd / Méd / Aigus"), h("strong", {}, [m.bands.sub, m.bands.low, m.bands.lowMid, m.bands.mid, m.bands.high].map((x) => x.toFixed(0)).join(" / ") + " dB"))) : null,
      ...mixState.suggestions.map((s) => h("div", { class: `card sugg sev-${s.severity}` },
        h("h3", {}, `${sev[s.severity]} ${s.title}`), h("p", {}, s.detail),
        s.actions.length ? h("div", { class: "button-row" },
          h("button", { class: "btn btn-sm", onclick: async () => {
            app.startPreview(s.title, s.actions);
            app.engine.setMode(songEndStep(store.getState()) > 0 ? "song" : "pattern");
            if (!app.engine.isPlaying) await app.togglePlay();
          } }, "▶ PREVIEW"),
          h("button", { class: "btn btn-sm btn-primary", onclick: () => {
            app.applyActions(s.actions, `Appliqué : ${s.title}`);
            mixState.suggestions = mixState.suggestions.filter((x) => x !== s);
            render();
          } }, "APPLY")) : null)),
      allActions.length > 1 ? h("div", { class: "button-row" },
        h("button", { class: "btn", onclick: () => app.startPreview("Toutes les corrections", allActions) }, "▶ PREVIEW tout"),
        h("button", { class: "btn btn-primary", onclick: () => { app.applyActions(allActions, "Toutes les corrections appliquées (Ctrl+Z pour annuler)."); mixState.suggestions = []; render(); } }, "APPLY tout"),
        h("button", { class: "btn", onclick: () => app.cancelPreview() }, "Annuler la preview")) : null);
  }

  // --- MASTER -------------------------------------------------------------------------------
  const savedTarget = store.getState().ai.masterTarget as MasterTarget;
  let masterState: { target: MasterTarget; before: (MixMeasurements & { bands: ReturnType<typeof bandBalance> }) | null; proposal: Effect[] | null; notes: string[]; after: MixMeasurements | null } = { target: savedTarget in MASTER_TARGETS ? savedTarget : "loud", before: null, proposal: null, notes: [], after: null };
  /** Loudest part of the song (around the first chorus, 16 bars): the loudness target applies there. */
  function loudRange(p: Project): [number, number] | undefined {
    if (songEndStep(p) <= 0) return undefined;
    const chorus = p.arrangement.sections.find((x) => /chorus|refrain|hook/i.test(x.name));
    const start = chorus ? chorus.start : Math.min(...p.arrangement.clips.map((c) => c.start), 0);
    return [start, start + 16];
  }
  async function renderMaster(p: Project, bypass: boolean) {
    const song = songEndStep(p) > 0;
    const buf = await renderProject(p, app.media(), { mode: song ? "song" : "pattern", loops: 4, tail: 1, bypassMaster: bypass, range: loudRange(p) });
    const ch = bufferChannels(buf);
    return { m: await measureMix(ch, buf.sampleRate), ch, sr: buf.sampleRate };
  }
  async function analyzeMaster(): Promise<void> {
    if (!(await app.ensureAudio())) return;
    app.engine.stop();
    await app.task("AI MASTER : analyse…", async () => {
      const r = await renderMaster(store.getState(), true);
      masterState.before = { ...r.m, bands: bandBalance(r.ch, r.sr) };
      const prop = proposeMaster(r.m, masterState.before.bands, masterState.target);
      masterState.proposal = prop.inserts;
      masterState.notes = prop.notes;
      masterState.after = null;
      render();
    });
  }
  async function applyMaster(): Promise<void> {
    if (!masterState.proposal) return;
    app.cancelPreview();
    let inserts = masterState.proposal.map((e) => ({ ...e, params: { ...e.params } }));
    app.dispatch({ type: "batch", actions: [{ type: "setInserts", channelId: "master", inserts }, { type: "setAiSettings", ai: { masterTarget: masterState.target } }] });
    await app.task("AI MASTER : vérification…", async () => {
      // Verify on the real render, correct the limiter gain once, and make sure TP ≤ ceiling.
      let res = await renderMaster(store.getState(), false);
      const lim = inserts.find((e) => e.type === "limiter")!;
      const g = refineLimiterGain(Number(lim.params.inputGainDb), res.m, masterState.target);
      if (Math.abs(g - Number(lim.params.inputGainDb)) > 0.3) {
        inserts = inserts.map((e) => (e.id === lim.id ? { ...e, params: { ...e.params, inputGainDb: g } } : e));
        app.dispatch({ type: "setInserts", channelId: "master", inserts });
        res = await renderMaster(store.getState(), false);
      }
      const ceiling = MASTER_TARGETS[masterState.target].ceilingDb;
      if (res.m.truePeakDb > ceiling) {
        const l2 = inserts.find((e) => e.type === "limiter")!;
        inserts = inserts.map((e) => (e.id === l2.id ? { ...e, params: { ...e.params, ceilingDb: ceiling - (res.m.truePeakDb - ceiling) - 0.2 } } : e));
        app.dispatch({ type: "setInserts", channelId: "master", inserts });
        res = await renderMaster(store.getState(), false);
      }
      masterState.after = res.m;
      toast(`AI MASTER appliqué : ${res.m.integratedLufs.toFixed(1)} LUFS, true peak ${res.m.truePeakDb.toFixed(1)} dBTP.`, "ok", 8000);
      render();
    });
  }
  function masterTab(): HTMLElement {
    const tSel = h("select", { onchange: () => (masterState.target = tSel.value as MasterTarget) }, ...(Object.keys(MASTER_TARGETS) as MasterTarget[]).map((k) => h("option", { value: k, selected: k === masterState.target }, MASTER_TARGETS[k].label)));
    const table = (title: string, m: MixMeasurements) => h("div", { class: "card an-grid" }, h("h3", {}, title),
      h("div", { class: "an-row" }, h("span", {}, "Integrated LUFS"), h("strong", {}, `${m.integratedLufs.toFixed(1)} LUFS`)),
      h("div", { class: "an-row" }, h("span", {}, "True Peak"), h("strong", {}, `${m.truePeakDb.toFixed(1)} dBTP`)),
      h("div", { class: "an-row" }, h("span", {}, "Dynamic Range"), h("strong", {}, `LRA ${m.loudnessRange.toFixed(1)} LU · PLR ${m.plr.toFixed(1)} dB`)),
      h("div", { class: "an-row" }, h("span", {}, "Clipping"), h("strong", {}, `${m.clippedSamples} échantillon(s)`)),
      h("div", { class: "an-row" }, h("span", {}, "Stereo Balance"), h("strong", {}, `${(m.stereoBalance * 100).toFixed(0)} % · corrélation ${m.correlation.toFixed(2)}`)));
    const current = masterChannel(store.getState()).inserts;
    return h("div", {},
      h("div", { class: "row-inline" }, h("label", { class: "field" }, h("span", { class: "slider-label" }, "OBJECTIF"), tSel), h("button", { class: "btn btn-ai", onclick: () => void analyzeMaster() }, "✨ Analyser le mix (MASTER ANALYSIS)")),
      masterState.before ? table("MASTER ANALYSIS — mix brut (chaîne master contournée)", masterState.before) : null,
      masterState.proposal ? h("div", { class: "card" }, h("h3", {}, "Chaîne proposée : EQ → Compression → Saturation légère → Limiter"),
        h("ul", {}, ...masterState.notes.map((n) => h("li", {}, n))),
        h("p", { class: "hint" }, "Mesures sur la partie la plus forte du morceau (autour du refrain), là où l'objectif de loudness s'applique. Le limiteur ne dépasse jamais le plafond : après application, le passage est re-rendu et mesuré pour vérifier le true peak. L'export affiche ensuite le loudness intégré du morceau complet."),
        h("div", { class: "button-row" },
          h("button", { class: "btn", onclick: async () => {
            app.startPreview("AI MASTER", [{ type: "setInserts", channelId: "master", inserts: masterState.proposal! }]);
            app.engine.setMode(songEndStep(store.getState()) > 0 ? "song" : "pattern");
            if (!app.engine.isPlaying) await app.togglePlay();
          } }, "▶ PREVIEW"),
          h("button", { class: "btn btn-primary", onclick: () => void applyMaster() }, "APPLY"),
          h("button", { class: "btn", onclick: () => app.cancelPreview() }, "Annuler la preview"))) : null,
      masterState.after ? table("Après AI MASTER (vérifié par rendu)", masterState.after) : null,
      h("p", { class: "hint" }, `Chaîne master actuelle : ${current.map((e) => `${e.type}${e.enabled ? "" : " (off)"}`).join(" → ") || "vide"} — modifiable dans MIXER → MASTER.`));
  }

  function render(): void {
    lastTab = tab;
    tabs.textContent = "";
    for (const [id, label] of TABS) tabs.append(h("button", { class: `tab ${tab === id ? "active" : ""}`, role: "tab", "aria-selected": String(tab === id), onclick: () => { tab = id; render(); } }, label));
    panel.textContent = "";
    const views: Record<Tab, () => HTMLElement> = { beat: beatTab, melody: melodyTab, chords: chordsTab, bass: bassTab, drums: drumsTab, variation: variationTab, structure: structureTab, assistant: assistantTab, mix: mixTab, master: masterTab };
    panel.append(views[tab]());
  }

  render();
  return {
    el,
    update() {
      /* panels re-render on their own actions */
    },
    dispose() {
      app.stopPreviewPlayback();
    },
  };
}

void keyLabel;
void getChannel;
