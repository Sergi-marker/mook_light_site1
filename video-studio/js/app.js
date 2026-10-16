// Interface de Animots.

import { parseScript, timeline, sceneAt, withBrand, plainText } from "./script.js";
import { ACTIONS, ACTION_LABELS, DUO_ACTIONS, poseAt } from "./poses.js";
import { drawFigure, PRESETS, SKIN_TONES, morphFrom } from "./figure.js";
import { renderFrame, preloadImage, fontCss, FORMATS, THEMES, BACKDROPS, CAMERAS, POSITIONS, FONTS, EFFECTS, TRANSITIONS } from "./renderer.js";
import { BUILTIN_STYLES, styleFrom, applyStyle } from "./styles.js";
import { MusicPlayer, MOODS, LANGS, voicesFor, speak, stopSpeaking } from "./audio.js";
import { recordVideo, bestMimeType } from "./export.js";
import { NEURAL_VOICES, defaultVoice, voiceByGender, generateVoices, voiceDurations, missingCount, VoicePlayer, TrackPlayer, setVoiceStyle, cachedClip } from "./voice.js";
import { VOICE_FX } from "./voicefx.js";
import { translateLines, directScenes } from "./translate.js";
import { t, pick, setUiLang, EXAMPLES } from "./i18n.js";
import { initPwa, renderPwaUi } from "./pwa.js";
import { initAccount, accountPanel, gateExport, exportNotice, shareButton, account, renderAccountUi, refundExport } from "./account.js";

const STORE = "videoStudio.project.v1";
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
      voiceMode: "neural", neuralVoice: "", charVoice0: "", charVoice1: "", fps: 30, voiceRate: 1, voiceFx: "natural", voicePitch: 0, voiceVol: 1, trackVol: 0.8,
      voiceLang: "fr", voice: "", rate: 1, pitch: 1,
      music: "melancolie", musicVol: 0.35, mic: false,
      // Décor, sous-titres et marque.
      backdrop: "none", transition: "auto", bgImage: "", captionFont: "montserrat", captionPos: "top", captionBox: "none", captionColor: "#ffffff",
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

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const p = JSON.parse(raw);
      const d = defaultProject();
      return normalizeProject(p, d);
    }
  } catch { /* stockage indisponible */ }
  return defaultProject();
}

let project = load();
const voiceId = () => project.settings.neuralVoice || defaultVoice(project.settings.voiceLang);
const neuralOn = () => project.settings.voiceMode === "neural" && !!voiceId();
/** Voix qui lit une scène : celle du personnage qui parle (dialogue), sinon celle du narrateur. */
const charVoice = (i) => project.settings[`charVoice${i}`] || voiceByGender(project.settings.voiceLang, i === 0 ? "m" : "f");
const voiceOf = (sc) => (sc.speaker === 0 || sc.speaker === 1 ? charVoice(sc.speaker) : voiceId());
/** Scènes de la vidéo : accroche + scènes du texte + écran de fin. */
const allScenes = () => withBrand(project.scenes, project.settings);
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
    try { localStorage.setItem(STORE, JSON.stringify(project)); } catch { /* ignoré */ }
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

function draw() {
  if (exporting) return;
  applyFormat();
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

const TABS = ["text", "scenes", "chars", "style", "sound", "export", "account"];
let currentTab = "text";
try { currentTab = sessionStorage.getItem("videoStudio.tab") || "text"; } catch { /* ignoré */ }

function renderTabs() {
  const labels = { text: "tabText", scenes: "tabScenes", chars: "tabChars", style: "tabStyle", sound: "tabSound", export: "tabExport", account: "tabAccount" };
  const bar = $("#tabs");
  bar.replaceChildren(...TABS.filter((id) => id !== "account" || account.online).map((id) => h("button", {
    class: `tab ${id === currentTab ? "on" : ""}`, role: "tab", "aria-selected": String(id === currentTab),
    onclick: () => { currentTab = id; try { sessionStorage.setItem("videoStudio.tab", id); } catch { /* ignoré */ } renderTabs(); renderPanel(); },
  }, t(labels[id]))));
}

function renderPanel() {
  const panel = $("#panel");
  const builders = { text: textPanel, scenes: scenesPanel, chars: charsPanel, style: stylePanel, sound: soundPanel, export: exportPanel, account: accountPanel };
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
    project.settings.neuralVoice = ""; project.settings.charVoice0 = ""; project.settings.charVoice1 = "";
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
      field(t("textLang"), select(project.textLang, langOptions(), (v) => { project.textLang = v; project.settings.voiceLang = v; project.settings.voice = ""; project.settings.neuralVoice = ""; project.settings.charVoice0 = ""; project.settings.charVoice1 = ""; rebuildTimeline(); }))),
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
  if (!project.scenes.length) return h("p", { class: "help" }, t("scenesEmpty"));
  const list = h("div", { class: "scenes" });
  const itemOf = (id) => tl.items.findIndex((it) => it.scene.id === id);
  const timeText = (id) => {
    const it = tl.items[itemOf(id)];
    return it ? `${fmtTime(it.start)} · ${it.duration.toFixed(1)}${t("seconds")}` : "";
  };
  const opts = (obj) => Object.entries(obj).map(([k, v]) => [k, pick(v)]);
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
        select(String(duo ? 2 : 1), [["1", `1 ${t("figures").toLowerCase()}`], ["2", `2 ${t("figures").toLowerCase()}`]], (v) => update({ figures: Number(v) })),
        s.figures === 2 || s.speaker != null ? select(String(s.speaker ?? ""), [["", t("speakerNone")], ["0", `${t("speaker")} 1`], ["1", `${t("speaker")} 2`]], (v) => update({ speaker: v === "" ? undefined : Number(v), speakerName: v === "" ? undefined : s.speakerName ?? `${t("speaker")} ${Number(v) + 1}` })) : null),
      s.kind === "pause" ? null : h("div", { class: "row wrap" },
        h("label", { class: "mini-field" }, h("span", {}, "🎥"), select(s.camera ?? "auto", opts(CAMERAS), (v) => update({ camera: v }))),
        h("label", { class: "mini-field" }, h("span", {}, "🖼"), select(s.bg ?? "auto", bgOptions, (v) => update({ bg: v }))),
        duo ? null : h("label", { class: "mini-field" }, h("span", {}, "↔"), select(s.pos ?? "auto", opts(POSITIONS), (v) => update({ pos: v }))),
        h("label", { class: "mini-field" }, h("span", {}, "✨"), select(s.fx ?? "auto", opts(EFFECTS), (v) => update({ fx: v }))),
        h("label", { class: "mini-field" }, h("span", {}, "⇄"), select(s.transition ?? "auto", opts(TRANSITIONS), (v) => update({ transition: v })))),
      h("div", { class: "row wrap" },
        h("input", { type: "number", min: "0.5", max: "30", step: "0.5", class: "num", placeholder: t("auto"), value: s.duration ?? "", title: t("duration"),
          onchange: (e) => update({ duration: e.target.value ? Math.max(0.5, Number(e.target.value)) : undefined }) }),
        h("button", { class: "btn sm", onclick: () => { const it = tl.items[itemOf(s.id)]; if (it) seek(it.start); if (!playing) play(); } }, t("fromHere")),
        h("button", { class: "btn sm ghost", onclick: () => { project.scenes.splice(i, 1); rebuildTimeline(); renderPanel(); } }, t("remove")))));
  });
  list.append(h("div", { class: "row wrap" },
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
  return h("div", { class: "stack" }, h("p", { class: "help" }, t("scenesHelp")), list);
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
      drawFigure(c, { ...p, dx: 0, time: tt }, project.settings.characters[m.index], m.canvas.width / 2, m.canvas.height * 0.86, m.canvas.height * 0.62);
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
  return h("section", { class: "card" },
    h("h3", {}, t(index === 0 ? "charMain" : "charSecond")),
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
          field(t("top"), h("div", { class: "row" }, select(m.top, [["none", t("none")], ["tshirt", t("tshirt")], ["hoodie", t("hoodie")], ["shirt", t("shirt")], ["dress", t("dress")]], (v) => set({ top: v })), color("topColor"))),
          field(t("bottom"), h("div", { class: "row" }, select(m.bottom, [["none", t("none")], ["pants", t("pants")], ["shorts", t("shorts")]], (v) => set({ bottom: v })), color("bottomColor"))),
          field(t("hair"), h("div", { class: "row" }, select(m.hair, [["none", t("hairNone")], ["short", t("hairShort")], ["long", t("hairLong")], ["bun", t("hairBun")], ["curly", t("hairCurly")], ["ponytail", t("hairPonytail")], ["spiky", t("hairSpiky")]], (v) => set({ hair: v })), color("detail"))),
          field(t("eyes"), select(m.eyes, [["dots", t("eyesDots")], ["big", t("eyesBig")], ["lashes", t("eyesLashes")], ["sleepy", t("eyesSleepy")]], (v) => set({ eyes: v })))),
        h("div", { class: "row wrap" },
          ...["glasses", "beard", "cap", "headband", "skirt", "tie"].map((k) => toggle(t(k), m[k], (v) => set({ [k]: v })))),
        h("details", {},
          h("summary", {}, t("bodyShape")),
          h("div", { class: "stack" },
            slider("height", 0.6, 1.25), slider("build", 0.6, 1.8), slider("belly", 0, 1), slider("headSize", 0.75, 1.5),
            slider("legs", 0.75, 1.25), slider("arms", 0.8, 1.25), slider("torso", 0.85, 1.2))))));
}

function charsPanel() {
  const el = h("div", { class: "stack" }, charEditor(0), charEditor(1));
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
        field(t("decor"), select(s.backdrop ?? "none", Object.entries(BACKDROPS).filter(([k]) => k !== "image" || s.bgImage).map(([k, v]) => [k, pick(v)]), (v) => set({ backdrop: v })))),
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
          field(`${t("voiceOfChar")} 1`, select(charVoice(0), list, (v) => { set({ charVoice0: v }); rebuildTimeline(); status.textContent = voiceStatusText(); })),
          field(`${t("voiceOfChar")} 2`, select(charVoice(1), list, (v) => { set({ charVoice1: v }); rebuildTimeline(); status.textContent = voiceStatusText(); })),
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
          set({ voiceLang: v, voice: "", neuralVoice: "", charVoice0: "", charVoice1: "" });
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
initAccount({
  h,
  toast,
  openTab: (id) => { currentTab = id; renderTabs(); renderPanel(); },
  // Le compte a changé (connexion, offre, quota) : on rafraîchit les onglets concernés.
  // (Jamais pendant un export : le panneau en cours afficherait son résultat dans le vide.)
  onChange: () => { renderTabs(); if (currentTab === "account" || (currentTab === "export" && !exportRunning)) renderPanel(); },
});

// Pour les tests automatisés.
window.__videoStudio = { get project() { return project; }, get timeline() { return tl; }, seek, play, pause, rebuild: rebuildTimeline, voiceOf, renderFrame: (tt) => renderFrame(ctx, project, tl, tt) };
