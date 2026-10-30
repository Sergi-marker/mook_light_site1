// © la triche — Animots
// Interface de Animots.

import { parseScript, timeline, sceneAt, withBrand, plainText, MAX_CHARACTERS } from "./script.js";
import { ACTIONS, ACTION_LABELS, DUO_ACTIONS, poseAt } from "./poses.js";
import { drawFigure, PRESETS, SKIN_TONES, morphFrom, drawSketchFigure, EXPRESSIONS, TOPS, BOTTOMS, HATS, HAIRS, ACCESSORIES } from "./figure.js";
import { renderFrame, preloadImage, fontCss, FORMATS, THEMES, BACKDROPS, CAMERAS, POSITIONS, FONTS, EFFECTS, TRANSITIONS, WEATHERS, TIMES_OF_DAY, sketchMorph, setLipSync } from "./renderer.js";
import { BUILTIN_STYLES, styleFrom, applyStyle } from "./styles.js";
import { MusicPlayer, MOODS, LANGS, voicesFor, speak, stopSpeaking } from "./audio.js";
import { recordVideo, bestMimeType } from "./export.js";
import { NEURAL_VOICES, defaultVoice, voiceByGender, generateVoices, voiceDurations, missingCount, VoicePlayer, TrackPlayer, setVoiceStyle, cachedClip } from "./voice.js";
import { VOICE_FX } from "./voicefx.js";
import { translateLines, directScenes } from "./translate.js";
import { t, pick, setUiLang, EXAMPLES } from "./i18n.js";
import { initPwa, renderPwaUi } from "./pwa.js";
import { analyzeDialogue, envelope, dialogueUnits, recastScenes, visemesFromWords, voiceSegments } from "./dub.js";
import { transcribeSegments, toMono16k, voiceEmbeddings } from "./transcribe.js";
import { analyzeFaces, visualSpeaker, matchVoicesToFaces, morphFromPerson } from "./faces.js";
import { initAccount, accountPanel, gateExport, exportNotice, shareButton, account, renderAccountUi, refundExport } from "./account.js";

const STORE = "videoStudio.project.v1";
/** Projet du mode « audio / vidéo → dessin animé », gardé à part du projet « texte → vidéo ». */
const STORE_DUB = "animots.dub.v1";
const MODES = ["text", "dub"];
const KEY_STORE = "videoStudio.apiKey";

// ---------- état ----------

function defaultProject() {
  const text = EXAMPLES.psy.fr;
  return {
    text,
    textLang: "fr",
    scenes: parseScript(text),
    settings: {
      uiLang: "fr", format: "9:16", theme: "nuit", captionStyle: "words", uppercase: true, captionScale: 1,
      accent: "#ffd84d", handle: "", progressBar: false, wps: 2.4,
      characters: [{ ...PRESETS.penseur.morph }, { ...PRESETS.gris.morph }],
      figureStyle: "clean", voiceMode: "neural", neuralVoice: "", charVoice0: "", charVoice1: "", fps: 30, voiceRate: 1, voiceFx: "natural", voicePitch: 0, voiceVol: 1, trackVol: 0.8,
      voiceLang: "fr", voice: "", rate: 1, pitch: 1,
      music: "melancolie", musicVol: 0.35, mic: false,
      // Décor, sous-titres et marque.
      backdrop: "none", transition: "auto", bgImage: "", autoPlace: true, timeOfDay: "auto", weather: "auto", emotionCloseups: true, captionFont: "montserrat", captionPos: "top", captionBox: "none", captionColor: "#ffffff",
      speakerLabels: true, hook: "", outro: "", logo: "", logoPos: "tr", logoSize: 0.14,
    },
  };
}

/** Projet enregistré (navigateur ou fichier) → projet valide : réglages complétés, scènes réparées. */
function normalizeProject(p, d = defaultProject()) {
  const settings = { ...d.settings, ...(p?.settings ?? {}) };
  // Anciens projets : « voiceOn » (voix du système) devient un mode de voix.
  if (p?.settings && !p.settings.voiceMode && p.settings.voiceOn) settings.voiceMode = "system";
  if (!Array.isArray(settings.characters) || settings.characters.length < 2) settings.characters = d.settings.characters;
  const scenes = (Array.isArray(p?.scenes) ? p.scenes : d.scenes)
    .filter((sc) => sc && typeof sc === "object")
    .map((sc, i) => {
      const action = String(sc.action ?? "").trim();
      return {
        ...sc,
        id: sc.id ?? `s${i + 1}`,
        kind: ["scene", "title", "pause"].includes(sc.kind) ? sc.kind : "scene",
        text: String(sc.text ?? ""),
        action: ACTIONS[action] ? action : "idle",
        seed: Number.isFinite(sc.seed) ? sc.seed : i + 1,
      };
    });
  return { ...d, ...p, text: String(p?.text ?? d.text), scenes, settings };
}

/** Nouveau projet « dessin animé » : style dessin, pas de voix de synthèse, le son importé sert de voix. */
function defaultDubProject() {
  const d = defaultProject();
  applyStyle(d.settings, BUILTIN_STYLES.dessin.settings);
  Object.assign(d.settings, { voiceMode: "off", music: "none", trackVol: 1, hook: "", outro: "", dubSpeakers: "auto", dubLang: "auto", dubTranscribe: true, dubNames: ["", ""] });
  return { ...d, mode: "dub", text: "", scenes: [], dubInfo: null };
}

function load(m = "text") {
  const fresh = m === "dub" ? defaultDubProject : defaultProject;
  try {
    const raw = localStorage.getItem(m === "dub" ? STORE_DUB : STORE);
    if (raw) return { ...normalizeProject(JSON.parse(raw), fresh()), mode: m };
  } catch { /* stockage indisponible */ }
  return { ...fresh(), mode: m };
}

let mode = "text";
try { mode = MODES.includes(localStorage.getItem("animots.mode")) ? localStorage.getItem("animots.mode") : "text"; } catch { /* ignoré */ }
let project = load(mode);
const voiceId = () => project.settings.neuralVoice || defaultVoice(project.settings.voiceLang);
const neuralOn = () => project.settings.voiceMode === "neural" && !!voiceId();
/** Voix qui lit une scène : celle du personnage qui parle (dialogue), sinon celle du narrateur. */
const charVoice = (i) => project.settings[`charVoice${i}`] || voiceByGender(project.settings.voiceLang, looksFeminine(project.settings.characters[i]) ?? i % 2 === 1 ? "f" : "m");
/** Personne qui parle dans une scène (sa place dans la liste des personnages), ou null pour le narrateur. */
const personOf = (sc) => sc.person ?? (sc.speaker === 0 || sc.speaker === 1 ? sc.speaker : null);
const voiceOf = (sc) => (personOf(sc) != null ? charVoice(personOf(sc)) : voiceId());
/** Voix par défaut d'après l'allure du personnage (cheveux longs, jupe, robe), null si on ne sait pas. */
function looksFeminine(c) {
  if (!c) return null;
  if (c.skirt || ["dress"].includes(c.top) || ["skirt", "longskirt"].includes(c.bottom) || ["long", "ponytail", "bun", "bob", "braids"].includes(c.hair)) return true;
  if (c.beard || c.mustache || c.tie) return false;
  return null;
}
/** Scènes de la vidéo : accroche + scènes du texte + écran de fin. */
// Mode dessin animé : pas d'accroche ni d'écran de fin, les scènes sont calées sur le son importé.
const allScenes = () => (mode === "dub" ? project.scenes : withBrand(project.scenes, project.settings));
function computeTimeline() {
  const scenes = allScenes();
  const st = project.settings;
  setVoiceStyle(st.voiceFx, st.voicePitch, st.voiceRate);
  return timeline(scenes, st.wps, neuralOn() ? voiceDurations(scenes, voiceOf) : null);
}
let tl = computeTimeline();
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(mode === "dub" ? STORE_DUB : STORE, JSON.stringify(project)); } catch { /* ignoré */ }
  }, 300);
}
function getKey() { try { return localStorage.getItem(KEY_STORE) ?? ""; } catch { return ""; } }
function setKey(k) { try { localStorage.setItem(KEY_STORE, k); } catch { /* ignoré */ } }

// ---------- utilitaires DOM ----------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const $ = (sel) => document.querySelector(sel);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function toast(msg, kind = "") {
  const el = h("div", { class: `toast ${kind}` }, msg);
  $("#toasts").append(el);
  setTimeout(() => el.remove(), 5000);
}

function errText(e) {
  const m = String(e?.message ?? e);
  if (m === "NO_KEY") return t("errNoKey");
  if (m === "BAD_KEY") return t("errBadKey");
  if (m === "RATE_LIMIT") return t("errRate");
  if (m === "REFUSED") return t("errRefused");
  if (m === "NETWORK") return t("errNetwork");
  return `${t("errGeneric")} : ${m}`;
}

// ---------- aperçu ----------

const canvas = $("#stage");
const ctx = canvas.getContext("2d");
let playing = false, pos = 0, playStart = 0, posStart = 0, lastScene = -1, exporting = false;
let audioCtx = null, music = null, voices = null, track = null;

function applyFormat() {
  const f = FORMATS[project.settings.format] ?? FORMATS["9:16"];
  if (canvas.width !== f.w || canvas.height !== f.h) { canvas.width = f.w; canvas.height = f.h; }
  $("#stageWrap").dataset.format = project.settings.format;
}

function rebuildTimeline() {
  tl = computeTimeline();
  pos = Math.min(pos, tl.total);
  updateTransport();
  draw();
  save();
}

// Aperçu du mode dessin animé avant l'import : les deux personnages attendent.
const DUB_PLACEHOLDER = [{ id: "wait", kind: "scene", text: "", action: "idle", figures: 2, duration: 4, seed: 3, camera: "wide", fx: "none" }];

function draw() {
  if (exporting) return;
  applyFormat();
  if (mode === "dub" && !tl.items.length) {
    const pr = { ...project, scenes: DUB_PLACEHOLDER };
    renderFrame(ctx, pr, timeline(DUB_PLACEHOLDER), 1.2);
    return;
  }
  renderFrame(ctx, project, tl, pos);
}

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    music = new MusicPlayer(audioCtx);
    music.connect(audioCtx.destination);
    voices = new VoicePlayer(audioCtx);
    voices.connect(audioCtx.destination);
    track = new TrackPlayer(audioCtx);
    track.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function play() {
  if (!tl.total) return;
  ensureAudio();
  if (pos >= tl.total - 0.05) pos = 0;
  playing = true;
  playStart = performance.now();
  posStart = pos;
  lastScene = -1;
  startAudio(pos);
  $("#playBtn").textContent = "❚❚";
  $("#playBtn").setAttribute("aria-label", t("pause"));
  requestAnimationFrame(loop);
}

/** Lance musique, voix off et piste importée à la position offset de la vidéo. */
function startAudio(offset) {
  const s = project.settings;
  music.setVolume(s.musicVol);
  music.start(s.music, offset);
  voices.setVolume(s.voiceVol);
  if (neuralOn()) voices.start(tl.items, voiceOf, offset, 0.05);
  track.setVolume(s.trackVol);
  track.start(offset);
}

function stopAudio() {
  music?.stop();
  voices?.stop();
  track?.stop();
}

function pause() {
  playing = false;
  stopAudio();
  stopSpeaking();
  $("#playBtn").textContent = "▶";
  $("#playBtn").setAttribute("aria-label", t("play"));
}

function loop() {
  if (!playing) return;
  pos = posStart + (performance.now() - playStart) / 1000;
  if (pos >= tl.total) { pos = tl.total; draw(); updateTransport(); pause(); return; }
  const at = sceneAt(tl, pos);
  if (at && at.index !== lastScene) {
    lastScene = at.index;
    if (project.settings.voiceMode === "system") {
      const s = project.settings;
      const said = plainText(at.item.scene.text);
      if (said) speak(said, { lang: s.voiceLang, voice: s.voice, rate: s.rate, pitch: s.pitch });
    }
    highlightScene(at.index);
  }
  draw();
  updateTransport();
  requestAnimationFrame(loop);
}

function seek(v) {
  const was = playing;
  if (was) pause();
  pos = Math.max(0, Math.min(tl.total, v));
  draw();
  updateTransport();
  if (was) play();
}

function updateTransport() {
  const seekEl = $("#seek");
  seekEl.max = String(tl.total || 0);
  seekEl.value = String(pos);
  $("#time").textContent = `${fmtTime(pos)} / ${fmtTime(tl.total)}`;
}

function highlightScene(i) {
  document.querySelectorAll(".scene-card.active").forEach((e) => e.classList.remove("active"));
  document.querySelector(`.scene-card[data-i="${i}"]`)?.classList.add("active");
}

// ---------- onglets ----------

const TABS_TEXT = ["text", "scenes", "chars", "style", "sound", "export", "account"];
const TABS_DUB = ["dub", "scenes", "chars", "style", "sound", "export", "account"];
const tabsOf = () => (mode === "dub" ? TABS_DUB : TABS_TEXT);
let currentTab = "text";
try { currentTab = sessionStorage.getItem("videoStudio.tab") || "text"; } catch { /* ignoré */ }

function renderTabs() {
  if (!tabsOf().includes(currentTab)) currentTab = tabsOf()[0];
  const labels = { dub: "tabDub", text: "tabText", scenes: "tabScenes", chars: "tabChars", style: "tabStyle", sound: "tabSound", export: "tabExport", account: "tabAccount" };
  const bar = $("#tabs");
  bar.replaceChildren(...tabsOf().filter((id) => id !== "account" || account.online).map((id) => h("button", {
    class: `tab ${id === currentTab ? "on" : ""}`, role: "tab", "aria-selected": String(id === currentTab),
    onclick: () => { currentTab = id; try { sessionStorage.setItem("videoStudio.tab", id); } catch { /* ignoré */ } renderTabs(); renderPanel(); },
  }, t(labels[id]))));
}

function renderPanel() {
  const panel = $("#panel");
  const builders = { dub: dubPanel, text: textPanel, scenes: scenesPanel, chars: charsPanel, style: stylePanel, sound: soundPanel, export: exportPanel, account: accountPanel };
  stopMiniPreviews();
  panel.replaceChildren(builders[currentTab]());
}

function field(label, control, help) {
  return h("label", { class: "field" }, h("span", { class: "lbl" }, label), control, help ? h("small", { class: "help" }, help) : null);
}

function select(value, options, onchange) {
  return h("select", { onchange: (e) => onchange(e.target.value) },
    ...options.map(([v, l]) => h("option", { value: v, selected: v === value ? "" : null }, l)));
}

function range(value, min, max, step, onchange) {
  const out = h("output", {}, String(value));
  const input = h("input", { type: "range", min, max, step, value, oninput: (e) => { out.textContent = e.target.value; onchange(Number(e.target.value)); } });
  return h("div", { class: "range" }, input, out);
}

function toggle(label, value, onchange) {
  return h("label", { class: "toggle" }, h("input", { type: "checkbox", checked: value, onchange: (e) => onchange(e.target.checked) }), h("span", {}, label));
}

const langOptions = () => Object.entries(LANGS).map(([k, v]) => [k, v.name]);

// ---------- Texte ----------

function buildFromText() {
  project.scenes = parseScript(project.text);
  // Un personnage par nom du dialogue (jusqu'à 6).
  ensureTextCharacters(Math.max(0, ...project.scenes.map((sc) => (personOf(sc) ?? -1) + 1)));
  pos = 0;
  rebuildTimeline();
  toast(`${project.scenes.length} ${t("tabScenes").toLowerCase()} · ${fmtTime(tl.total)}`);
}

/** Lit un script depuis un fichier : texte, Markdown, sous-titres .srt ou document Word (.docx). */
async function readScriptFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    if (!window.mammoth) {
      await new Promise((resolve, reject) => {
        const sc = document.createElement("script");
        sc.src = "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js";
        sc.onload = resolve;
        sc.onerror = () => reject(new Error(t("importError")));
        document.head.append(sc);
      });
    }
    const { value } = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value.replace(/\n{3,}/g, "\n\n").trim();
  }
  let text = await file.text();
  if (name.endsWith(".srt") || name.endsWith(".vtt")) {
    // Sous-titres : on garde seulement les lignes de texte (pas les numéros ni les horaires).
    text = text.split(/\r?\n/).filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l) && !/^WEBVTT/.test(l)).join("\n");
  }
  return text.trim();
}

function textPanel() {
  const ta = h("textarea", { id: "script", rows: 12, spellcheck: "true", oninput: (e) => { project.text = e.target.value; save(); } });
  ta.value = project.text;
  const ex = (key) => h("button", { class: "chip", onclick: () => {
    const lang = EXAMPLES[key][project.textLang] ? project.textLang : "fr";
    project.text = EXAMPLES[key][lang];
    ta.value = project.text;
    buildFromText();
  } }, t({ psy: "exPsy", sport: "exSport", story: "exStory", dialogue: "exDialogue" }[key]));

  const keyInput = h("input", { type: "password", autocomplete: "off", placeholder: "sk-ant-…", value: getKey(), onchange: (e) => setKey(e.target.value.trim()) });
  let target = project.settings.voiceLang !== project.textLang ? project.settings.voiceLang : (project.textLang === "fr" ? "de" : "fr");
  const status = h("div", { class: "status" });

  const runAi = async (btn, fn) => {
    btn.disabled = true;
    status.textContent = t("working");
    try { await fn(); status.textContent = t("done"); } catch (e) { status.textContent = ""; toast(errText(e), "error"); } finally { btn.disabled = false; }
  };
  const trBtn = h("button", { class: "btn", onclick: () => runAi(trBtn, async () => {
    // Seules les scènes avec du texte partent à la traduction (pas les pauses).
    const idx = project.scenes.map((sc, i) => (sc.text.trim() ? i : -1)).filter((i) => i >= 0);
    const out = await translateLines(getKey(), idx.map((i) => project.scenes[i].text), target, (d, n) => { status.textContent = `${t("working")} ${d}/${n}`; });
    project.scenes = project.scenes.map((sc) => ({ ...sc }));
    idx.forEach((i, k) => { project.scenes[i].text = out[k]; });
    project.text = project.scenes.map((s) => (s.kind === "title" ? `# ${s.text}` : s.kind === "pause" ? `[pause ${s.duration ?? 1}]` : `${s.speakerName ? `${s.speakerName} : ` : ""}[${s.action}] ${s.text}`)).join("\n");
    project.textLang = target;
    project.settings.voiceLang = target;
    project.settings.voice = "";
    project.settings.neuralVoice = ""; resetCharVoices();
    ta.value = project.text;
    rebuildTimeline();
  }) }, t("translate"));
  const dirBtn = h("button", { class: "btn", onclick: () => runAi(dirBtn, async () => {
    const idx = project.scenes.map((sc, i) => (sc.kind === "scene" && sc.text.trim() ? i : -1)).filter((i) => i >= 0);
    const actions = await directScenes(getKey(), idx.map((i) => project.scenes[i].text), (d, n) => { status.textContent = `${t("working")} ${d}/${n}`; });
    project.scenes = project.scenes.map((sc) => ({ ...sc }));
    // Les répliques d'un dialogue gardent leurs deux personnages.
    idx.forEach((i, k) => { Object.assign(project.scenes[i], { action: actions[k], auto: false, figures: project.scenes[i].speaker != null ? 2 : undefined }); });
    rebuildTimeline();
  }) }, t("direct"));

  return h("div", { class: "stack" },
    field(t("textLabel"), ta, t("textHelp")),
    h("div", { class: "row" },
      h("button", { class: "btn primary", onclick: buildFromText }, t("build")),
      field(t("textLang"), select(project.textLang, langOptions(), (v) => { project.textLang = v; project.settings.voiceLang = v; project.settings.voice = ""; project.settings.neuralVoice = ""; resetCharVoices(); rebuildTimeline(); }))),
    h("div", { class: "row wrap" }, h("span", { class: "lbl" }, t("examples")), ex("psy"), ex("sport"), ex("story"), ex("dialogue")),
    h("div", { class: "row wrap" },
      h("label", { class: "btn sm" }, `📄 ${t("importScript")}`, h("input", { type: "file", accept: ".txt,.md,.srt,.docx,text/plain", hidden: true, onchange: async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          project.text = await readScriptFile(f);
          ta.value = project.text;
          buildFromText();
        } catch (err) { toast(errText(err), "error"); }
      } })),
      h("small", { class: "help" }, t("importHelp"))),
    h("section", { class: "card" },
      h("h3", {}, t("translateTitle")),
      h("p", { class: "help" }, t("translateHelp")),
      field(t("apiKey"), keyInput, t("apiKeyHelp")),
      h("div", { class: "row wrap" }, field(t("target"), select(target, langOptions(), (v) => { target = v; })), trBtn),
      h("div", { class: "row wrap" }, dirBtn, h("small", { class: "help" }, t("directHelp"))),
      status));
}

// ---------- Scènes ----------

function actionOptions() {
  return Object.keys(ACTIONS).map((id) => [id, pick(ACTION_LABELS[id]) || id]);
}

function scenesPanel() {
  if (!project.scenes.length) return h("p", { class: "help" }, t(mode === "dub" ? "dubNoFile" : "scenesEmpty"));
  const list = h("div", { class: "scenes" });
  const itemOf = (id) => tl.items.findIndex((it) => it.scene.id === id);
  const timeText = (id) => {
    const it = tl.items[itemOf(id)];
    return it ? `${fmtTime(it.start)} · ${it.duration.toFixed(1)}${t("seconds")}` : "";
  };
  const opts = (obj) => Object.entries(obj).map(([k, v]) => [k, pick(v)]);
  const names = mode === "dub" ? dubNames() : textNames();
  const exprOptions = [["auto", t("exprAuto")], ...Object.entries(EXPRESSIONS).filter(([k]) => k !== "talk").map(([k, v]) => [k, pick(v)])];
  const bgOptions = [["auto", t("bgStyle")], ...Object.entries(BACKDROPS).filter(([k]) => k !== "image" || project.settings.bgImage).map(([k, v]) => [k, `${t("decor")} · ${pick(v)}`]), ...Object.entries(THEMES).map(([k, v]) => [k, `${t("color")} · ${pick(v.label)}`])];
  project.scenes.forEach((s, i) => {
    const update = (patch) => {
      project.scenes[i] = { ...project.scenes[i], ...patch };
      rebuildTimeline();
      timeCell.textContent = timeText(s.id);
    };
    const timeCell = h("span", { class: "muted" }, timeText(s.id));
    const kindLabel = s.kind === "title" ? t("title") : s.kind === "pause" ? t("pause") : s.speakerName ? `${t("scene")} · ${s.speakerName}` : t("scene");
    const ta = h("textarea", { rows: 2, oninput: (e) => update({ text: e.target.value }) });
    ta.value = s.text;
    const duo = s.figures ? s.figures === 2 : DUO_ACTIONS.has(s.action);
    list.append(h("div", { class: `scene-card ${s.kind}`, "data-i": String(itemOf(s.id)) },
      h("div", { class: "row between" }, h("strong", {}, `${i + 1}. ${kindLabel}`), timeCell),
      s.kind === "pause" ? null : ta,
      s.kind === "pause" ? null : h("div", { class: "row wrap" },
        select(s.action, actionOptions(), (v) => update({ action: v, auto: false })),
        select(String(s.figures ?? (s.group && project.settings.characters.length >= 3 && s.speaker == null ? "group" : duo ? 2 : 1)), [
          ...Array.from({ length: Math.max(2, project.settings.characters.length) }, (_, k) => [String(k + 1), `${k + 1} ${t("figures").toLowerCase()}`]),
          ...(s.figures == null && s.group ? [["group", t("groupAuto")]] : []),
        ], (v) => { if (v !== "group") update({ figures: Number(v) }); }),
        s.figures === 2 || s.speaker != null ? select(String(personOf(s) ?? ""), [["", t("speakerNone")], ...names.map((n, k) => [String(k), n])], (v) => update(speakerPatch(s, v === "" ? null : Number(v), names))) : null),
      s.kind === "pause" ? null : h("div", { class: "row wrap" },
        h("label", { class: "mini-field" }, h("span", {}, "🎥"), select(s.camera ?? "auto", opts(CAMERAS), (v) => update({ camera: v }))),
        h("label", { class: "mini-field" }, h("span", {}, "🖼"), select(s.bg ?? "auto", bgOptions, (v) => update({ bg: v }))),
        duo ? null : h("label", { class: "mini-field" }, h("span", {}, "↔"), select(s.pos ?? "auto", opts(POSITIONS), (v) => update({ pos: v }))),
        h("label", { class: "mini-field" }, h("span", {}, "✨"), select(s.fx ?? "auto", opts(EFFECTS), (v) => update({ fx: v }))),
        h("label", { class: "mini-field" }, h("span", {}, "⇄"), select(s.transition ?? "auto", opts(TRANSITIONS), (v) => update({ transition: v }))),
        h("label", { class: "mini-field" }, h("span", {}, "🌦"), select(s.weather ?? "auto", opts(WEATHERS), (v) => update({ weather: v })))),
      s.kind === "pause" ? null : h("div", { class: "row wrap" },
        h("label", { class: "mini-field" }, h("span", {}, duo ? "🙂 1" : "🙂"), select(s.expr ?? "auto", exprOptions, (v) => update({ expr: v }))),
        duo ? h("label", { class: "mini-field" }, h("span", {}, "🙂 2"), select(s.expr2 ?? "auto", exprOptions, (v) => update({ expr2: v }))) : null),
      mode === "dub" ? null : h("div", { class: "row wrap" },
        h("input", { type: "number", min: "0.5", max: "30", step: "0.5", class: "num", placeholder: t("auto"), value: s.duration ?? "", title: t("duration"),
          onchange: (e) => update({ duration: e.target.value ? Math.max(0.5, Number(e.target.value)) : undefined }) }),
        h("button", { class: "btn sm", onclick: () => { const it = tl.items[itemOf(s.id)]; if (it) seek(it.start); if (!playing) play(); } }, t("fromHere")),
        h("button", { class: "btn sm ghost", onclick: () => { project.scenes.splice(i, 1); rebuildTimeline(); renderPanel(); } }, t("remove")))));
  });
  if (mode !== "dub") list.append(h("div", { class: "row wrap" },
    h("button", { class: "btn", onclick: () => {
      project.scenes.push({ id: `s${Date.now()}`, kind: "scene", text: "…", action: "think", auto: false, seed: (Math.random() * 2 ** 32) >>> 0 });
      rebuildTimeline();
      renderPanel();
    } }, t("addScene")),
    h("button", { class: "btn", onclick: () => {
      project.scenes.push({ id: `p${Date.now()}`, kind: "pause", text: "", action: "idle", auto: false, duration: 1, seed: 1 });
      rebuildTimeline();
      renderPanel();
    } }, t("addPause"))));
  return h("div", { class: "stack" }, h("p", { class: "help" }, t(mode === "dub" ? "scenesHelpDub" : "scenesHelp")), list);
}

/** Changer qui parle dans une scène : la personne passe à l'écran, à côté de son interlocuteur. */
function speakerPatch(s, who, names) {
  if (who == null) return { speaker: undefined, speakerName: undefined, person: undefined };
  const cast = Array.isArray(s.cast) && s.cast.length === 2 ? s.cast : [0, 1];
  const next = cast.includes(who) ? cast : [who, cast[1] !== who ? cast[1] : cast[0]];
  if (who < 2 && !s.cast) return { speaker: who, speakerName: names[who], person: undefined };
  return { person: who, cast: next, speaker: next.indexOf(who), speakerName: names[who], figures: 2 };
}

// ---------- Personnages ----------

let miniRaf = 0;
const minis = [];
function stopMiniPreviews() { cancelAnimationFrame(miniRaf); minis.length = 0; }
function runMiniPreviews() {
  cancelAnimationFrame(miniRaf);
  const start = performance.now();
  const tick = () => {
    const tt = (performance.now() - start) / 1000;
    for (const m of minis) {
      const c = m.canvas.getContext("2d");
      c.fillStyle = "#101124";
      c.fillRect(0, 0, m.canvas.width, m.canvas.height);
      c.fillStyle = "rgba(220,220,255,0.35)";
      c.fillRect(0, m.canvas.height * 0.86, m.canvas.width, 3);
      const action = ["idle", "wave", "think", "laugh", "walk", "celebrate"][Math.floor(tt / 2.5) % 6];
      const p = poseAt(action, tt % 2.5, 0.4, 0);
      const ch = project.settings.characters[m.index];
      if (project.settings.figureStyle === "sketch") {
        c.fillStyle = "#e3b5a0";
        c.fillRect(0, 0, m.canvas.width, m.canvas.height);
        drawSketchFigure(c, { ...p, dx: 0, time: tt }, sketchMorph(ch), m.canvas.width / 2, m.canvas.height * 0.92, m.canvas.height * 0.62);
      } else drawFigure(c, { ...p, dx: 0, time: tt }, ch, m.canvas.width / 2, m.canvas.height * 0.86, m.canvas.height * 0.62);
    }
    miniRaf = requestAnimationFrame(tick);
  };
  tick();
}

/** Petites listes gardées dans ce navigateur (mes personnages, mes styles). */
function loadList(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}
function saveList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { toast(t("storageFull"), "error"); }
}
const MY_CHARS = "videoStudio.myCharacters";

function charEditor(index) {
  const m = morphFrom(project.settings.characters[index]);
  const set = (patch, rerender = false) => {
    project.settings.characters[index] = { ...project.settings.characters[index], ...patch };
    draw();
    save();
    if (rerender) renderPanel();
  };
  const mini = h("canvas", { width: 220, height: 260, class: "mini" });
  minis.push({ canvas: mini, index });
  const slider = (key, min, max) => field(t(key === "build" ? "bodyBuild" : key), range(m[key], min, max, 0.01, (v) => set({ [key]: v })));
  const color = (key) => h("input", { type: "color", value: m[key], oninput: (e) => set({ [key]: e.target.value }) });
  const mine = loadList(MY_CHARS);
  const opts = (obj) => Object.entries(obj).map(([k, v]) => [k, pick(v)]);
  return h("section", { class: "card" },
    h("div", { class: "row between" },
      h("h3", {}, mode === "dub" ? dubNames()[index] : textNames()[index]),
      mode !== "dub" && index >= 2 ? h("button", { class: "btn sm ghost", onclick: () => removeCharacter(index) }, t("removeCharacter")) : null),
    h("div", { class: "char" },
      mini,
      h("div", { class: "stack" },
        h("div", { class: "row wrap" }, h("span", { class: "lbl" }, t("presets")),
          ...Object.entries(PRESETS).map(([, pr]) => h("button", { class: "chip", onclick: () => { project.settings.characters[index] = { ...pr.morph }; draw(); save(); renderPanel(); } }, pick(pr.label)))),
        h("div", { class: "row wrap" }, h("span", { class: "lbl" }, t("myCharacters")),
          ...mine.map((c, ci) => h("span", { class: "chip-group" },
            h("button", { class: "chip", onclick: () => { project.settings.characters[index] = { ...c.morph }; draw(); save(); renderPanel(); } }, c.name),
            h("button", { class: "chip x", "aria-label": t("remove"), onclick: () => { mine.splice(ci, 1); saveList(MY_CHARS, mine); renderPanel(); } }, "×"))),
          (() => {
            const name = h("input", { type: "text", class: "name-input", maxlength: "30", placeholder: t("charName"), "aria-label": t("charName") });
            return h("span", { class: "row" }, name, h("button", { class: "chip add", onclick: () => {
              const n = name.value.trim() || `${t("charMain")} ${mine.length + 1}`;
              mine.push({ name: n.slice(0, 30), morph: { ...project.settings.characters[index] } });
              saveList(MY_CHARS, mine);
              renderPanel();
            } }, `+ ${t("saveCharacter")}`));
          })()),
        h("div", { class: "row wrap" }, h("span", { class: "lbl" }, t("skin")),
          ...SKIN_TONES.map((c) => h("button", { class: `swatch ${m.color === c ? "on" : ""}`, style: `background:${c}`, "aria-label": c, onclick: () => set({ color: c }, true) })),
          color("color")),
        h("div", { class: "grid2" },
          field(t("top"), h("div", { class: "row" }, select(m.top, opts(TOPS), (v) => set({ top: v })), color("topColor"))),
          field(t("bottom"), h("div", { class: "row" }, select(m.skirt && m.bottom === "none" ? "skirt" : m.bottom, opts(BOTTOMS), (v) => set({ bottom: v, skirt: false })), color("bottomColor"))),
          field(t("hair"), h("div", { class: "row" }, select(m.hair, opts(HAIRS), (v) => set({ hair: v })), color("detail"))),
          field(t("hat"), select(m.cap && (m.hat ?? "none") === "none" ? "cap" : m.hat ?? "none", opts(HATS), (v) => set({ hat: v, cap: false }))),
          field(t("eyes"), select(m.eyes, [["dots", t("eyesDots")], ["big", t("eyesBig")], ["lashes", t("eyesLashes")], ["sleepy", t("eyesSleepy")]], (v) => set({ eyes: v }))),
          field(t("shoes"), color("shoeColor"))),
        h("div", { class: "row wrap" },
          ...Object.entries(ACCESSORIES).map(([k, v]) => toggle(pick(v), m[k], (on) => set({ [k]: on })))),
        h("details", {},
          h("summary", {}, t("bodyShape")),
          h("div", { class: "stack" },
            slider("height", 0.6, 1.25), slider("build", 0.6, 1.8), slider("belly", 0, 1), slider("headSize", 0.75, 1.5),
            slider("legs", 0.75, 1.25), slider("arms", 0.8, 1.25), slider("torso", 0.85, 1.2))))));
}

/** Retire un personnage (à partir du 3e) : ses répliques passent au narrateur, les suivants remontent d'une place. */
function removeCharacter(index) {
  const s = project.settings;
  s.characters.splice(index, 1);
  for (let i = index; i < MAX_CHARACTERS; i++) s[`charVoice${i}`] = s[`charVoice${i + 1}`] ?? "";
  project.scenes = project.scenes.map((sc) => {
    const out = { ...sc };
    if (Array.isArray(out.cast)) out.cast = out.cast.map((c) => (c > index ? c - 1 : c === index ? (index === 0 ? 1 : 0) : c));
    if (out.person === index) Object.assign(out, { person: undefined, speaker: undefined, speakerName: undefined });
    else if (out.person > index) out.person -= 1;
    if (out.figures > s.characters.length) out.figures = s.characters.length;
    return out;
  });
  rebuildTimeline();
  renderPanel();
}

function charsPanel() {
  const s = project.settings;
  const styleSel = field(t("figureStyle"), select(s.figureStyle ?? "clean", [["clean", t("figClean")], ["sketch", t("figSketch")], ["outline", t("figOutline")]], (v) => {
    s.figureStyle = v;
    if (v === "sketch" && (s.backdrop ?? "none") === "none") s.backdrop = "cartoon";
    if (v !== "sketch" && (s.backdrop === "cartoon" || s.backdrop === "cartoonBlue")) s.backdrop = "none";
    save();
    draw();
  }));
  const count = mode === "dub" ? Math.min(4, Math.max(2, project.dubInfo?.persons ?? 2)) : Math.max(2, s.characters.length);
  if (mode === "dub") ensureDubCharacters(count);
  const add = mode === "dub" || count >= MAX_CHARACTERS ? null : h("section", { class: "card" },
    h("button", { class: "btn primary", onclick: () => { ensureTextCharacters(count + 1); save(); draw(); renderPanel(); } }, `+ ${t("addCharacter")}`),
    h("p", { class: "help" }, t("addCharacterHelp")));
  const el = h("div", { class: "stack" }, h("section", { class: "card" }, styleSel), ...Array.from({ length: count }, (_, i) => charEditor(i)), add);
  requestAnimationFrame(runMiniPreviews);
  return el;
}

// ---------- Style ----------

const MY_STYLES = "videoStudio.myStyles";

/** Image choisie par l'utilisateur → data URL réduite (le projet et les styles restent légers). */
function imageToDataUrl(file, maxSide, type = "image/jpeg") {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL(type, 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t("imageError"))); };
    img.src = url;
  });
}

function imagePicker(label, onPick, maxSide, type) {
  return h("label", { class: "btn sm" }, label, h("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { onPick(await imageToDataUrl(f, maxSide, type)); } catch (err) { toast(errText(err), "error"); }
  } }));
}

function stylePanel() {
  const s = project.settings;
  const set = (patch, rebuild = false) => { Object.assign(s, patch); if (rebuild) rebuildTimeline(); else { draw(); save(); } };
  const setAndRender = (patch, rebuild = false) => { set(patch, rebuild); renderPanel(); };
  const mine = loadList(MY_STYLES);
  const useStyle = (style) => {
    applyStyle(s, style);
    ensureFont(s.captionFont).then(draw);
    rebuildTimeline();
    renderPanel();
  };
  const styleName = h("input", { type: "text", class: "name-input", maxlength: "30", placeholder: t("styleName"), "aria-label": t("styleName") });

  return h("div", { class: "stack" },
    // Styles de chaîne.
    h("section", { class: "card" },
      h("h3", {}, t("channelStyles")),
      h("p", { class: "help" }, t("channelStylesHelp")),
      h("div", { class: "row wrap" }, h("span", { class: "lbl" }, t("readyStyles")),
        ...Object.values(BUILTIN_STYLES).map((st) => h("button", { class: "chip", onclick: () => useStyle(st.settings) }, pick(st.label)))),
      h("div", { class: "row wrap" }, h("span", { class: "lbl" }, t("myStyles")),
        ...mine.map((st, i) => h("span", { class: "chip-group" },
          h("button", { class: "chip", onclick: () => useStyle(st.settings) }, st.name),
          h("button", { class: "chip x", "aria-label": t("remove"), onclick: () => { mine.splice(i, 1); saveList(MY_STYLES, mine); renderPanel(); } }, "×"))),
        mine.length ? null : h("span", { class: "muted" }, t("noStyles"))),
      h("div", { class: "row wrap" }, styleName, h("button", { class: "btn sm primary", onclick: () => {
        const name = styleName.value.trim() || `${t("myStyle")} ${mine.length + 1}`;
        mine.push({ name: name.slice(0, 30), settings: styleFrom(s) });
        saveList(MY_STYLES, mine);
        toast(`${t("styleSaved")} : ${name}`);
        renderPanel();
      } }, t("saveStyle")))),

    // Image et décor.
    h("section", { class: "card" },
      h("h3", {}, t("decorTitle")),
      h("div", { class: "grid2" },
        field(t("format"), select(s.format, Object.entries(FORMATS).map(([k, v]) => [k, v.label]), (v) => set({ format: v }))),
        field(t("bgColors"), select(s.theme, Object.entries(THEMES).map(([k, v]) => [k, pick(v.label)]), (v) => set({ theme: v }))),
        field("⇄", select(s.transition ?? "auto", Object.entries(TRANSITIONS).map(([k, v]) => [k, pick(v)]), (v) => set({ transition: v }))),
        field(t("decor"), select(s.backdrop ?? "none", Object.entries(BACKDROPS).filter(([k]) => k !== "image" || s.bgImage).map(([k, v]) => [k, pick(v)]), (v) => set({ backdrop: v }))),
        field(t("timeOfDay"), select(s.timeOfDay ?? "auto", Object.entries(TIMES_OF_DAY).map(([k, v]) => [k, pick(v)]), (v) => set({ timeOfDay: v }))),
        field(t("weather"), select(s.weather ?? "auto", Object.entries(WEATHERS).map(([k, v]) => [k, pick(v)]), (v) => set({ weather: v })))),
      h("div", { class: "row wrap" },
        toggle(t("autoPlace"), s.autoPlace !== false, (v) => set({ autoPlace: v })),
        toggle(t("emotionCloseups"), s.emotionCloseups !== false, (v) => set({ emotionCloseups: v }))),
      h("div", { class: "row wrap" },
        imagePicker(t("bgImport"), (url) => setAndRender({ bgImage: url, backdrop: "image" }), 1920, "image/jpeg"),
        s.bgImage ? h("button", { class: "btn sm ghost", onclick: () => setAndRender({ bgImage: "", backdrop: "none" }) }, t("bgRemove")) : null)),

    // Sous-titres.
    h("section", { class: "card" },
      h("h3", {}, t("captionsTitle")),
      h("div", { class: "grid2" },
        field(t("font"), select(s.captionFont ?? "montserrat", Object.entries(FONTS).map(([k, v]) => [k, v.label]), (v) => { set({ captionFont: v }); ensureFont(v).then(draw); })),
        field(t("captionPos"), select(s.captionPos ?? "top", [["top", t("posTop")], ["middle", t("posMiddle")], ["bottom", t("posBottom")]], (v) => set({ captionPos: v }))),
        field(t("captionStyle"), select(s.captionStyle, [["words", t("capWords")], ["karaoke", t("capKaraoke")], ["full", t("capFull")]], (v) => set({ captionStyle: v }))),
        field(t("captionBox"), select(s.captionBox ?? "none", [["none", t("boxNone")], ["box", t("boxBand")], ["word", t("boxWord")]], (v) => set({ captionBox: v }))),
        field(t("captionScale"), range(s.captionScale, 0.6, 1.5, 0.05, (v) => set({ captionScale: v }))),
        field(t("wps"), range(s.wps, 1.2, 4, 0.1, (v) => set({ wps: v }, true))),
        field(t("textColor"), h("input", { type: "color", value: s.captionColor ?? "#ffffff", oninput: (e) => set({ captionColor: e.target.value }) })),
        field(t("accent"), h("input", { type: "color", value: s.accent, oninput: (e) => set({ accent: e.target.value }) }))),
      h("p", { class: "help" }, t("highlightHelp")),
      h("div", { class: "row wrap" },
        toggle(t("uppercase"), s.uppercase, (v) => set({ uppercase: v })),
        toggle(t("speakerLabels"), s.speakerLabels !== false, (v) => set({ speakerLabels: v })),
        toggle(t("progressBar"), s.progressBar, (v) => set({ progressBar: v })))),

    // Marque : accroche, fin, signature, logo.
    h("section", { class: "card" },
      h("h3", {}, t("brandTitle")),
      field(t("hook"), h("input", { type: "text", value: s.hook ?? "", maxlength: "90", placeholder: t("hookPlaceholder"), onchange: (e) => set({ hook: e.target.value }, true) }), t("hookHelp")),
      field(t("outroText"), h("input", { type: "text", value: s.outro ?? "", maxlength: "90", placeholder: t("outroPlaceholder"), onchange: (e) => set({ outro: e.target.value }, true) }), t("outroHelp")),
      field(t("handle"), h("input", { type: "text", value: s.handle, placeholder: "@Homme.Penseur", oninput: (e) => set({ handle: e.target.value.trim() }) })),
      h("div", { class: "row wrap" },
        imagePicker(t("logoImport"), (url) => setAndRender({ logo: url }), 400, "image/png"),
        s.logo ? h("img", { src: s.logo, class: "logo-preview", alt: "" }) : null,
        s.logo ? select(s.logoPos ?? "tr", [["tl", t("cornerTL")], ["tr", t("cornerTR")], ["bl", t("cornerBL")], ["br", t("cornerBR")]], (v) => set({ logoPos: v })) : null,
        s.logo ? h("button", { class: "btn sm ghost", onclick: () => setAndRender({ logo: "" }) }, t("remove")) : null)));
}

/** Charge une police de sous-titres avant de dessiner (le canvas n'attend pas les polices tout seul). */
function ensureFont(id) {
  if (!document.fonts?.load) return Promise.resolve();
  return document.fonts.load(fontCss(id, 60)).catch(() => {});
}

// ---------- Audio / vidéo → dessin animé ----------

/** Petit stockage du fichier importé (IndexedDB) : le dessin animé retrouve son son après rechargement. */
const idb = {
  open() {
    return new Promise((resolve, reject) => {
      const r = window.indexedDB.open("animots", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },
  async put(key, value) {
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  },
  async get(key) {
    const db = await this.open();
    const v = await new Promise((resolve, reject) => {
      const r = db.transaction("files").objectStore("files").get(key);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return v;
  },
};

let dubAbort = null;
let dubBuffer = null; // son d'origine décodé (joué et exporté tel quel)
let dubLip = null; // volume de la voix pour la bouche des personnages
const trackStash = { text: null }; // piste importée du mode texte, mise de côté pendant le mode dessin animé

/** Noms des personnes du dessin animé (« Personnage 1 »… si non renseignés). */
function dubNames() {
  const n = project.settings.dubNames ?? [];
  return [0, 1, 2, 3].map((i) => n[i] || `${t("speaker")} ${i + 1}`);
}

/** Un personnage par personne (jusqu'à 4), chacun avec son allure. */
/** Voix des personnages remises à celles par défaut (changement de langue). */
function resetCharVoices() {
  for (let i = 0; i < MAX_CHARACTERS; i++) project.settings[`charVoice${i}`] = "";
}

/** Personnages proposés quand on en ajoute (tous différents). */
const EXTRA_CHARS = ["etudiante", "pro", "urbain", "coach", "elegante", "ancien"];

/** Complète la liste des personnages (mode texte) jusqu'à count, sans jamais en retirer. */
function ensureTextCharacters(count) {
  const s = project.settings;
  while (s.characters.length < Math.min(MAX_CHARACTERS, count)) {
    const id = EXTRA_CHARS[(s.characters.length - 2) % EXTRA_CHARS.length];
    s.characters.push({ ...(PRESETS[id]?.morph ?? {}) });
  }
}

/** Noms des personnages en mode texte : ceux du dialogue, sinon « Personnage 3 »… */
function textNames() {
  const names = [];
  for (const sc of project.scenes) {
    const p = personOf(sc);
    if (p != null && sc.speakerName && !names[p]) names[p] = sc.speakerName;
  }
  return project.settings.characters.map((_, i) => names[i] || `${t("speaker")} ${i + 1}`);
}

function ensureDubCharacters(count) {
  const s = project.settings;
  const extra = [{ ...PRESETS.etudiante.morph }, { ...PRESETS.pro.morph, color: "#c68b5e" }];
  while (s.characters.length < Math.min(4, Math.max(2, count))) s.characters.push(extra[s.characters.length - 2] ?? {});
}

/** Son importé → personnages, répliques, sous-titres et bouche synchronisée. */
async function processDub(file, status, bar) {
  const s = project.settings;
  ensureAudio();
  dubAbort = new AbortController();
  const signal = dubAbort.signal;
  bar.hidden = false;
  bar.removeAttribute("value");
  status.textContent = t("dubReading");
  let buf;
  try {
    buf = await audioCtx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error(t("dubDecodeError"));
  }
  const mono = await toMono16k(buf);
  let words = [];
  if (s.dubTranscribe !== false) {
    try {
      const speech = voiceSegments(envelope(mono, 16000, 50), 50);
      const r = await transcribeSegments(mono, speech, s.dubLang ?? "auto", (pr) => {
        if (pr.phase === "transcribe") { status.textContent = `${t("dubTranscribing")} ${pr.done + 1}/${pr.total}`; bar.value = pr.done / Math.max(1, pr.total); }
        else if (pr.percent != null) { status.textContent = `${t("dubModelDownload")} ${pr.percent} %`; bar.value = pr.percent / 100; }
      }, signal);
      words = r.words ?? [];
    } catch (e) {
      if (e?.message === "ABORTED") throw e;
      toast(`${t("dubNoTranscript")} (${e?.message ?? e})`, "error");
    }
  }
  if (signal.aborted) throw new Error("ABORTED");
  // Vidéo : visages des vraies personnes (allure des personnages, et qui bouge la bouche).
  let faces = null;
  if (file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name)) {
    status.textContent = t("dubFaces");
    try {
      faces = await analyzeFaces(file, buf.duration, (pr) => { bar.value = pr.done / pr.total; status.textContent = `${t("dubFaces")} ${pr.done}/${pr.total}`; }, signal);
    } catch (e) {
      if (e?.message === "ABORTED") throw e;
      faces = null;
    }
  }
  if (signal.aborted) throw new Error("ABORTED");
  // Qui parle : empreinte de chaque voix par le modèle de reconnaissance (repli : analyse maison).
  const { units } = dialogueUnits(mono, 16000, { words });
  const want = s.dubSpeakers ?? "auto";
  let embeddings = null;
  if (want !== 1 && units.length > 1) {
    status.textContent = t("dubVoices");
    try {
      embeddings = await voiceEmbeddings(units.map((u) => mono.slice(Math.floor(u.start * 16000), Math.ceil(u.end * 16000))), (pr) => {
        if (pr.phase === "embed") { bar.value = pr.done / pr.total; status.textContent = `${t("dubVoices")} ${pr.done}/${pr.total}`; }
        else if (pr.percent != null) { bar.value = pr.percent / 100; status.textContent = `${t("dubVoiceModel")} ${pr.percent} %`; }
      });
    } catch { embeddings = null; }
  }
  if (signal.aborted) throw new Error("ABORTED");
  status.textContent = t("dubSpeakers");
  await new Promise((r) => setTimeout(r, 0));
  const names = dubNames();
  const visual = faces && faces.people.length >= 2 ? (u) => visualSpeaker(faces, u.start, u.end) : null;
  const res = analyzeDialogue(mono, 16000, { speakers: want === "auto" ? "auto" : Number(want), words, units, embeddings, names, visual });
  dubBuffer = buf;
  dubLip = { env: res.env, rate: res.rate, visemes: res.visemes };
  track.buffer = buf;
  setLipSync(dubLip);
  ensureDubCharacters(res.persons);
  // Les personnages prennent l'allure des vraies personnes (peau, cheveux, vêtement).
  let lookalike = 0;
  if (faces && s.dubLookalike !== false) {
    const map = matchVoicesToFaces(faces, res.turns, res.persons);
    map.forEach((f, v) => {
      if (f == null || !faces.people[f]) return;
      s.characters[v] = morphFromPerson(s.characters[v] ?? {}, faces.people[f]);
      lookalike++;
    });
  }
  project.scenes = res.scenes;
  project.dubWords = words;
  project.text = res.turns.map((tr) => (res.persons > 1 ? `${names[tr.person]} : ${tr.text}` : tr.text)).join("\n");
  project.dubInfo = { name: file.name, duration: buf.duration, confident: res.confident, persons: res.persons, speakers: res.persons, turns: res.turns.length, transcribed: words.length > 0, voiceModel: !!embeddings, faces: faces?.people.length ?? 0, lookalike };
  s.voiceMode = "off";
  s.trackVol = s.trackVol ?? 1;
  pos = 0;
  rebuildTimeline();
  save();
  // Le fichier est gardé pour le retrouver après un rechargement (après la mise à jour de l'écran).
  try { await idb.put("dubSource", file); } catch { /* stockage plein : le dessin animé marche quand même jusqu'au rechargement */ }
}

/** Au chargement : on retrouve le son du dernier dessin animé. */
let restoring = null;
function restoreDub() {
  restoring ??= restoreDubNow().finally(() => { restoring = null; });
  return restoring;
}
async function restoreDubNow() {
  if (mode !== "dub") return;
  if (dubBuffer) {
    // Déjà en mémoire (retour depuis l'autre mode).
    ensureAudio();
    track.buffer = dubBuffer;
    setLipSync(dubLip);
    draw();
    return;
  }
  if (!project.dubInfo) return;
  try {
    const file = await idb.get("dubSource");
    if (!file) return;
    ensureAudio();
    const buf = await audioCtx.decodeAudioData(await file.arrayBuffer());
    const mono = await toMono16k(buf);
    if (mode !== "dub") return;
    dubBuffer = buf;
    dubLip = { env: envelope(mono, 16000, 50), rate: 50, visemes: visemesFromWords(project.dubWords ?? []) };
    track.buffer = buf;
    setLipSync(dubLip);
    draw();
    if (currentTab === "dub") renderPanel();
  } catch { /* fichier illisible : il faudra le réimporter */ }
}

const PERSON_COLORS = ["#8fd0ff", "#ffb3c7", "#9be7a4", "#ffd27a"];

/** Frise des répliques : une couleur par personne ; toucher une réplique la donne à la personne suivante. */
function dubTimeline(onChange) {
  const info = project.dubInfo;
  const total = tl.total || 1;
  const persons = Math.max(1, info?.persons ?? 2);
  const bar = h("div", { class: "dub-frise", role: "group", "aria-label": t("dubFrise") });
  const names = dubNames();
  let tAcc = 0;
  project.scenes.forEach((sc, i) => {
    const start = tAcc;
    tAcc += sc.duration;
    const w = `${(sc.duration / total) * 100}%`;
    if (sc.kind !== "scene") { bar.append(h("span", { class: "dub-gap", style: `width:${w}` })); return; }
    const person = sc.person ?? 0;
    bar.append(h("button", {
      class: "dub-turn", style: `width:${w};background:${PERSON_COLORS[person]}`, title: `${names[person]} : ${sc.text}`,
      "aria-label": `${fmtTime(start)} ${names[person]} : ${sc.text}`,
      onclick: () => {
        const next = persons > 1 ? (person + 1) % persons : person;
        project.scenes[i] = { ...sc, person: next };
        project.scenes = recastScenes(project.scenes, dubNames());
        rebuildTimeline();
        seek(start + 0.01);
        onChange();
      },
    }, String(person + 1)));
  });
  return bar;
}

function dubPanel() {
  const s = project.settings;
  const set = (patch) => { Object.assign(s, patch); save(); };
  const info = project.dubInfo;
  const status = h("div", { class: "status" });
  const bar = h("progress", { max: "1", hidden: true });
  let file = null;
  const fileName = h("span", { class: "muted" }, info ? `${info.name} · ${fmtTime(info.duration)}${dubBuffer ? "" : ` · ${t("dubReimport")}`}` : t("dubNoFile"));
  const input = h("input", { type: "file", accept: "audio/*,video/*", hidden: true, onchange: (e) => {
    file = e.target.files?.[0] ?? null;
    if (file) { fileName.textContent = `${file.name} · ${(file.size / 1e6).toFixed(1)} Mo`; go.disabled = false; }
  } });
  const cancel = h("button", { class: "btn ghost", hidden: true, onclick: () => dubAbort?.abort() }, t("cancel"));
  const go = h("button", { class: "btn primary", disabled: true, onclick: async () => {
    if (!file) return;
    pause();
    go.disabled = true;
    cancel.hidden = false;
    try {
      await processDub(file, status, bar);
      renderPanel();
      toast(t("dubDone"));
    } catch (e) {
      status.textContent = e?.message === "ABORTED" ? "" : `${e?.message ?? e}`;
      if (e?.message !== "ABORTED") toast(`${e?.message ?? e}`, "error");
    } finally {
      dubAbort = null;
      go.disabled = false;
      cancel.hidden = true;
      bar.hidden = true;
    }
  } }, `✨ ${t("dubCreate")}`);

  let result = null;
  if (info) {
    const persons = Math.max(1, info.persons ?? info.speakers ?? 2);
    const names = dubNames();
    const friseBox = h("div", {});
    const refresh = () => friseBox.replaceChildren(dubTimeline(refresh));
    refresh();
    result = h("section", { class: "card" },
      h("h3", {}, t("dubResult")),
      h("p", {}, `${info.turns} ${t("dubTurns")} · ${persons} ${persons > 1 ? t("dubPeople") : t("dubPerson")} · ${fmtTime(info.duration)}`),
      persons > 1 && !info.confident ? h("p", { class: "notice" }, t("dubCheckSpeakers")) : null,
      !info.transcribed ? h("p", { class: "help" }, t("dubNoSubtitles")) : null,
      info.lookalike ? h("p", { class: "help" }, `👤 ${t("dubLookalikeDone")}`) : null,
      persons > 1 ? h("p", { class: "help" }, t("dubFriseHelp")) : null,
      friseBox,
      h("div", { class: "grid2" }, ...Array.from({ length: persons }, (_, i) => field(
        h("span", { class: "dub-dot", style: `background:${PERSON_COLORS[i]}` }, String(i + 1)),
        h("input", { type: "text", value: s.dubNames?.[i] ?? "", placeholder: names[i], oninput: (e) => {
          const list = [...(s.dubNames ?? [])];
          list[i] = e.target.value;
          set({ dubNames: list });
          project.scenes = recastScenes(project.scenes, dubNames());
          rebuildTimeline();
        } })))),
      h("div", { class: "row wrap" },
        persons === 2 ? h("button", { class: "btn", onclick: () => {
          project.scenes = recastScenes(project.scenes.map((sc) => (sc.kind === "scene" ? { ...sc, person: 1 - (sc.person ?? 0) } : sc)), dubNames());
          rebuildTimeline();
          refresh();
          toast(t("dubSwapped"));
        } }, `⇄ ${t("dubSwap")}`) : null,
        h("button", { class: "btn", onclick: () => { currentTab = "scenes"; renderTabs(); renderPanel(); } }, t("dubSeeScenes")),
        h("button", { class: "btn", onclick: () => { currentTab = "chars"; renderTabs(); renderPanel(); } }, t("dubSeeChars"))));
  }
  return h("div", { class: "stack" },
    h("section", { class: "card" },
      h("h3", {}, `🎬 ${t("dubTitle")}`),
      h("p", { class: "help" }, t("dubIntro")),
      h("div", { class: "row wrap" }, h("label", { class: "btn" }, `📁 ${t("dubChoose")}`, input), fileName),
      h("div", { class: "grid2" },
        field(t("dubSpeakersLabel"), select(String(s.dubSpeakers ?? "auto"), [["auto", t("dubAuto")], ["1", t("dubOne")], ["2", t("dubTwo")], ["3", t("dubThree")], ["4", t("dubFour")]], (v) => set({ dubSpeakers: v === "auto" ? "auto" : Number(v) }))),
        field(t("dubLangLabel"), select(s.dubLang ?? "auto", [["auto", t("dubLangAuto")], ["fr", "Français"], ["de", "Deutsch"], ["en", "English"], ["es", "Español"], ["it", "Italiano"], ["pt", "Português"], ["nl", "Nederlands"], ["tr", "Türkçe"], ["ar", "العربية"]], (v) => set({ dubLang: v })))),
      toggle(t("dubTranscribeLabel"), s.dubTranscribe !== false, (v) => set({ dubTranscribe: v })),
      toggle(t("dubLookalikeLabel"), s.dubLookalike !== false, (v) => set({ dubLookalike: v })),
      h("div", { class: "row wrap" }, go, cancel),
      bar, status,
      h("p", { class: "help" }, t("dubHelp"))),
    result);
}

// ---------- Accueil : choix du type d'animation ----------

function switchMode(m) {
  if (!MODES.includes(m)) return;
  pause();
  if (m !== mode) {
    save();
    if (track && mode === "text") trackStash.text = track.buffer;
    mode = m;
    project = load(m);
    if (track) track.buffer = m === "dub" ? dubBuffer : trackStash.text;
    setLipSync(null);
    pos = 0;
    currentTab = tabsOf()[0];
    tl = computeTimeline();
    if (m === "dub") restoreDub();
  }
  try { localStorage.setItem("animots.mode", m); sessionStorage.setItem("animots.inApp", "1"); } catch { /* ignoré */ }
  $("#home").hidden = true;
  document.body.classList.remove("on-home");
  renderAll();
}

function showHome() {
  pause();
  const home = $("#home");
  home.replaceChildren(
    h("div", { class: "home-inner" },
      h("img", { class: "home-logo", src: "./img/logo.svg", alt: "" }),
      h("h2", {}, t("homeTitle")),
      h("p", { class: "muted" }, t("homeSubtitle")),
      h("div", { class: "home-cards" },
        h("button", { class: "home-card", "data-mode": "text", onclick: () => switchMode("text") },
          h("span", { class: "home-emoji" }, "✍️"), h("strong", {}, t("homeTextTitle")), h("span", {}, t("homeTextDesc"))),
        h("button", { class: "home-card", "data-mode": "dub", onclick: () => switchMode("dub") },
          h("span", { class: "home-emoji" }, "🎙️"), h("strong", {}, t("homeDubTitle")), h("span", {}, t("homeDubDesc"))),
        h("div", { class: "home-card soon" }, h("span", { class: "home-emoji" }, "✨"), h("strong", {}, t("homeSoonTitle")), h("span", {}, t("homeSoonDesc")))),
      h("p", { class: "muted small" }, "Animots — ", t("homeBy"), " ", h("strong", {}, "la triche"))));
  home.hidden = false;
  document.body.classList.add("on-home");
}

// ---------- Voix & musique ----------

let voiceAbort = null;

/** Génère les voix manquantes. Renvoie "ok", "aborted" (annulé par l'utilisateur) ou "failed". */
async function ensureVoices(status) {
  if (!neuralOn() || !missingCount(allScenes(), voiceOf)) return "ok";
  ensureAudio();
  voiceAbort = new AbortController();
  try {
    await generateVoices(audioCtx, allScenes(), voiceOf, (p) => {
      status.textContent = p.phase === "download" ? `${t("voiceDownload")} ${p.percent ?? 0} %` : p.phase === "fx" ? `${t("voiceFxApplying")} ${p.done}/${p.total}` : `${t("voiceGenerating")} ${p.done}/${p.total}`;
    }, voiceAbort.signal);
    rebuildTimeline();
    status.textContent = `${t("voiceReady")} · ${fmtTime(tl.total)}`;
    return "ok";
  } catch (e) {
    rebuildTimeline();
    status.textContent = "";
    if (e?.message === "ABORTED") return "aborted";
    toast(`${t("voiceError")} (${e?.message ?? e})`, "error");
    return "failed";
  } finally {
    voiceAbort = null;
  }
}

function voiceStatusText() {
  const n = allScenes().filter((sc) => sc.kind !== "pause" && sc.text.trim()).length;
  const missing = missingCount(allScenes(), voiceOf);
  return missing ? `${n - missing}/${n} ${t("voiceScenesReady")}` : `${t("voiceReady")} · ${fmtTime(tl.total)}`;
}

function soundPanel() {
  const s = project.settings;
  const set = (patch) => { Object.assign(s, patch); save(); };

  // Voix neuronale : enregistrée dans la vidéo.
  const status = h("div", { class: "status" }, voiceStatusText());
  const neuralBox = h("div", { class: "stack" });
  // Nouveau réglage de voix : on retraite les phrases déjà générées (quelques instants), sans les régénérer.
  let restyleTimer = null;
  const restyle = () => {
    rebuildTimeline();
    status.textContent = voiceStatusText();
    clearTimeout(restyleTimer);
    restyleTimer = setTimeout(async () => {
      if (voiceAbort) return;
      const raw = allScenes().some((sc) => sc.kind !== "pause" && sc.text.trim() && cachedClip(voiceOf(sc), sc.text));
      if (raw) await ensureVoices(status);
    }, 500);
  };
  const fillNeural = () => {
    const list = NEURAL_VOICES[s.voiceLang];
    const genBtn = h("button", { class: "btn primary", onclick: async () => {
      genBtn.disabled = true;
      stopBtn.hidden = false;
      await ensureVoices(status);
      genBtn.disabled = false;
      stopBtn.hidden = true;
    } }, `🎙 ${t("voiceGenerate")}`);
    const stopBtn = h("button", { class: "btn ghost", hidden: true, onclick: () => voiceAbort?.abort() }, t("cancel"));
    neuralBox.replaceChildren(
      list
        ? h("div", { class: "grid2" },
          field(t("voiceNarrator"), select(voiceId(), list, (v) => { set({ neuralVoice: v }); rebuildTimeline(); status.textContent = voiceStatusText(); })),
          ...textNames().map((n, i) => field(`${t("voiceOfChar")} : ${n}`, select(charVoice(i), list, (v) => { set({ [`charVoice${i}`]: v }); rebuildTimeline(); status.textContent = voiceStatusText(); }))),
          field(t("voiceSpeed"), range(s.voiceRate, 0.6, 1.6, 0.05, (v) => { set({ voiceRate: v }); restyle(); })),
          field(t("voiceEffect"), select(s.voiceFx ?? "natural", Object.entries(VOICE_FX).map(([k, v]) => [k, pick(v.label)]), (v) => { set({ voiceFx: v }); restyle(); })),
          field(t("voicePitch"), range(s.voicePitch ?? 0, -12, 12, 1, (v) => { set({ voicePitch: v }); restyle(); })),
          field(t("volume"), range(s.voiceVol, 0, 1.5, 0.05, (v) => { set({ voiceVol: v }); voices?.setVolume(v); })))
        : h("p", { class: "help" }, t("voiceNoNeural")),
      list ? h("div", { class: "row wrap" }, genBtn, stopBtn) : null,
      status,
      h("p", { class: "help" }, t("voiceNeuralHelp")));
  };
  fillNeural();

  // Voix du système : aperçu seulement.
  const voiceSel = h("select", { onchange: (e) => set({ voice: e.target.value }) });
  const fillVoices = () => {
    const vs = voicesFor(s.voiceLang);
    voiceSel.replaceChildren(h("option", { value: "" }, "—"), ...vs.map((v) => h("option", { value: v.name, selected: v.name === s.voice ? "" : null }, `${v.name} (${v.lang})`)));
  };
  fillVoices();
  if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = fillVoices;
  const systemBox = h("div", { class: "stack" },
    h("div", { class: "grid2" },
      field(t("voice"), voiceSel),
      field(t("rate"), range(s.rate, 0.6, 1.5, 0.05, (v) => set({ rate: v }))),
      field(t("pitch"), range(s.pitch, 0.5, 1.5, 0.05, (v) => set({ pitch: v })))),
    h("button", { class: "btn sm", onclick: () => speak(plainText(project.scenes.find((sc) => sc.text.trim())?.text ?? "Bonjour"), { lang: s.voiceLang, voice: s.voice, rate: s.rate, pitch: s.pitch }) }, "🔊 Test"),
    h("p", { class: "help" }, t("voiceNote")));

  const showMode = () => {
    neuralBox.hidden = s.voiceMode !== "neural";
    systemBox.hidden = s.voiceMode !== "system";
  };
  showMode();

  // Piste audio importée (voix off enregistrée ailleurs, musique…).
  const trackName = h("span", { class: "muted" }, track?.buffer ? fmtTime(track.buffer.duration) : t("trackNone"));
  const trackInput = h("input", { type: "file", accept: "audio/*", hidden: true, onchange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    ensureAudio();
    try {
      const d = await track.load(f);
      trackName.textContent = `${f.name} · ${fmtTime(d)}`;
    } catch { toast(t("trackError"), "error"); }
  } });

  return h("div", { class: "stack" },
    h("section", { class: "card" },
      h("h3", {}, t("voiceTitle")),
      h("div", { class: "grid2" },
        field(t("voiceMode"), select(s.voiceMode, [["neural", t("voiceModeNeural")], ["system", t("voiceModeSystem")], ["off", t("voiceModeOff")]], (v) => {
          set({ voiceMode: v });
          if (v !== "system") stopSpeaking();
          showMode();
          rebuildTimeline();
        })),
        field(t("voiceLang"), select(s.voiceLang, langOptions(), (v) => {
          set({ voiceLang: v, voice: "", neuralVoice: "" });
          resetCharVoices();
          fillVoices();
          fillNeural();
          rebuildTimeline();
          status.textContent = voiceStatusText();
        }))),
      neuralBox, systemBox),
    h("section", { class: "card" },
      h("h3", {}, t("music")),
      h("div", { class: "grid2" },
        field(t("music"), select(s.music, Object.entries(MOODS).map(([k, v]) => [k, pick(v.label)]), (v) => { set({ music: v }); if (playing) music.start(v, pos); })),
        field(t("volume"), range(s.musicVol, 0, 1, 0.05, (v) => { set({ musicVol: v }); music?.setVolume(v); })))),
    h("section", { class: "card" },
      h("h3", {}, t("trackTitle")),
      h("p", { class: "help" }, t("trackHelp")),
      h("div", { class: "row wrap" },
        h("label", { class: "btn sm" }, t("trackImport"), trackInput),
        h("button", { class: "btn sm ghost", onclick: () => { if (track) { track.stop(); track.buffer = null; } trackName.textContent = t("trackNone"); } }, t("remove")),
        trackName),
      field(t("volume"), range(s.trackVol, 0, 1.5, 0.05, (v) => { set({ trackVol: v }); track?.setVolume(v); })),
      toggle(t("mic"), s.mic, (v) => set({ mic: v }))));
}

// ---------- Export ----------

let exportAbort = null;
let exportRunning = false;
function exportPanel() {
  const status = h("div", { class: "status" });
  const result = h("div", { class: "row wrap" });
  const bar = h("progress", { max: "1", value: "0" });
  const cancelBtn = h("button", { class: "btn ghost", disabled: true, onclick: () => exportAbort?.abort() }, t("cancel"));
  const btn = h("button", { class: "btn primary", onclick: async () => {
    if (bestMimeType() === null) return toast(t("noRecorder"), "error");
    exportRunning = true;
    pause();
    ensureAudio();
    btn.disabled = true;
    cancelBtn.disabled = false;
    result.replaceChildren();
    const dest = audioCtx.createMediaStreamDestination();
    music.connect(dest);
    voices.connect(dest);
    track.connect(dest);
    let micStream = null;
    let counted = false; // l'export a été décompté du quota
    try {
      // La voix off doit exister avant l'enregistrement : elle fixe la durée des scènes.
      // Si elle ne peut pas être créée (pas d'Internet au premier usage), la vidéo est exportée sans voix.
      if ((await ensureVoices(status)) === "aborted") throw new Error("ABORTED");
      // Compte et quota (offre gratuite : 3 vidéos par jour, 30 s maximum), vérifiés par le serveur.
      if (!(await gateExport(tl.total))) throw new Error("ABORTED");
      counted = true;
      if (project.settings.mic) {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        audioCtx.createMediaStreamSource(micStream).connect(dest);
      }
      // Images et police prêtes avant la première image enregistrée.
      await Promise.all([preloadImage(project.settings.bgImage), preloadImage(project.settings.logo), ensureFont(project.settings.captionFont)]);
      exporting = true;
      applyFormat();
      startAudio(0);
      exportAbort = new AbortController();
      const { blob, ext } = await recordVideo(canvas, {
        duration: tl.total,
        audioStream: dest.stream,
        signal: exportAbort.signal,
        draw: (tt) => renderFrame(ctx, project, tl, tt),
        fps: project.settings.fps === 60 ? 60 : 30,
        bitrate: project.settings.fps === 60 ? 14_000_000 : 8_000_000,
        onTime: (tt) => { bar.value = tt / tl.total; status.textContent = `${fmtTime(tt)} / ${fmtTime(tl.total)}`; },
      });
      const name = `video-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
      const url = URL.createObjectURL(blob);
      status.textContent = `${t("done")} · ${(blob.size / 1e6).toFixed(1)} Mo · ${ext.toUpperCase()}`;
      const file = new File([blob], name, { type: blob.type });
      result.replaceChildren(
        h("a", { class: "btn primary", href: url, download: name }, `⬇ ${t("download")}`),
        navigator.canShare?.({ files: [file] }) ? h("button", { class: "btn", onclick: () => navigator.share({ files: [file] }).catch(() => {}) }, t("share")) : null,
        shareButton(blob, { title: project.scenes.find((sc) => sc.kind === "title")?.text ?? project.scenes[0]?.text ?? "", duration: tl.total }),
        h("video", { src: url, controls: true, playsinline: true, class: "result" }));
    } catch (e) {
      if (counted) refundExport();
      if (e?.message !== "ABORTED") toast(errText(e), "error");
      status.textContent = "";
    } finally {
      exporting = false;
      exportRunning = false;
      stopAudio();
      try { music.out.disconnect(dest); } catch { /* déjà déconnecté */ }
      voices.disconnect(dest);
      track.disconnect(dest);
      micStream?.getTracks().forEach((tr) => tr.stop());
      btn.disabled = false;
      cancelBtn.disabled = true;
      bar.value = 0;
      draw();
    }
  } }, `🎬 ${t("exportBtn")}`);
  return h("div", { class: "stack" },
    h("p", {}, `${t("duration")} : ${fmtTime(tl.total)} · ${FORMATS[project.settings.format].label}`),
    field(t("fps"), select(String(project.settings.fps ?? 30), [["30", t("fps30")], ["60", t("fps60")]], (v) => { project.settings.fps = Number(v); save(); })),
    h("div", { class: "row" }, btn, cancelBtn),
    exportNotice(tl.total) ? h("p", { class: "notice" }, exportNotice(tl.total)) : null,
    bar, status,
    h("p", { class: "help" }, t("exportHelp")),
    result,
    h("hr"),
    h("div", { class: "row wrap" },
      h("button", { class: "btn sm", onclick: () => {
        const blob = new Blob([JSON.stringify(project, null, 1)], { type: "application/json" });
        const a = h("a", { href: URL.createObjectURL(blob), download: "projet-video.json" });
        a.click();
      } }, t("saveProject")),
      h("label", { class: "btn sm" }, t("openProject"), h("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          project = normalizeProject(JSON.parse(await f.text()));
          pos = 0;
          rebuildTimeline();
          renderAll();
        } catch (err) { toast(errText(err), "error"); }
      } }))));
}

// ---------- assemblage ----------

function renderAll() {
  setUiLang(project.settings.uiLang);
  document.documentElement.lang = project.settings.uiLang;
  $("#appTitle").textContent = t("appTitle");
  $("#tagline").textContent = t("tagline");
  const ui = $("#uiLang");
  ui.value = project.settings.uiLang;
  ui.setAttribute("aria-label", t("langUi"));
  renderTabs();
  renderPanel();
  updateTransport();
  draw();
  renderAccountUi();
  renderPwaUi();
}

$("#uiLang").addEventListener("change", (e) => { project.settings.uiLang = e.target.value; save(); renderAll(); });
$("#playBtn").addEventListener("click", () => (playing ? pause() : play()));
$("#seek").addEventListener("input", (e) => seek(Number(e.target.value)));
canvas.addEventListener("click", () => (playing ? pause() : play()));
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement?.tagName)) { e.preventDefault(); playing ? pause() : play(); }
});

// La police des sous-titres peut arriver après le premier rendu.
document.fonts?.ready.then(() => ensureFont(project.settings.captionFont)).then(draw);
// Les images du projet (décor, logo) arrivent après le premier rendu.
Promise.all([preloadImage(project.settings.bgImage), preloadImage(project.settings.logo)]).then(draw);
renderAll();
initPwa();
// Accueil au lancement (le choix reste pour la session) ; ?mode=text|dub l'ouvre directement.
{
  const asked = new URLSearchParams(location.search).get("mode");
  let inApp = false;
  try { inApp = sessionStorage.getItem("animots.inApp") === "1"; } catch { /* ignoré */ }
  if (MODES.includes(asked)) switchMode(asked);
  else if (!inApp) showHome();
  if (mode === "dub") restoreDub();
}
$("#homeBtn")?.addEventListener("click", showHome);
initAccount({
  h,
  toast,
  openTab: (id) => { currentTab = id; renderTabs(); renderPanel(); },
  // Le compte a changé (connexion, offre, quota) : on rafraîchit les onglets concernés.
  // (Jamais pendant un export : le panneau en cours afficherait son résultat dans le vide.)
  onChange: () => { renderTabs(); if (currentTab === "account" || (currentTab === "export" && !exportRunning)) renderPanel(); },
});

// Pour les tests automatisés.
window.__videoStudio = { get mode() { return mode; }, get dubReady() { return !!dubBuffer; }, switchMode, showHome, get project() { return project; }, get timeline() { return tl; }, seek, play, pause, rebuild: rebuildTimeline, voiceOf, renderFrame: (tt) => renderFrame(ctx, project, tl, tt) };
