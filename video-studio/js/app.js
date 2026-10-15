// Interface de Vidéo Studio.

import { parseScript, timeline, sceneAt } from "./script.js";
import { ACTIONS, ACTION_LABELS, DUO_ACTIONS, poseAt } from "./poses.js";
import { drawFigure, PRESETS, morphFrom } from "./figure.js";
import { renderFrame, FORMATS, THEMES } from "./renderer.js";
import { MusicPlayer, MOODS, LANGS, voicesFor, speak, stopSpeaking } from "./audio.js";
import { recordVideo, bestMimeType } from "./export.js";
import { NEURAL_VOICES, defaultVoice, generateVoices, voiceDurations, missingCount, VoicePlayer, TrackPlayer } from "./voice.js";
import { translateLines, directScenes } from "./translate.js";
import { t, pick, setUiLang, EXAMPLES } from "./i18n.js";

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
      voiceMode: "neural", neuralVoice: "", voiceVol: 1, trackVol: 0.8,
      voiceLang: "fr", voice: "", rate: 1, pitch: 1,
      music: "melancolie", musicVol: 0.35, mic: false,
    },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const p = JSON.parse(raw);
      const d = defaultProject();
      const settings = { ...d.settings, ...p.settings };
      // Anciens projets : « voiceOn » (voix du système) devient un mode de voix.
      if (p.settings && !p.settings.voiceMode && p.settings.voiceOn) settings.voiceMode = "system";
      return { ...d, ...p, settings };
    }
  } catch { /* stockage indisponible */ }
  return defaultProject();
}

let project = load();
const voiceId = () => project.settings.neuralVoice || defaultVoice(project.settings.voiceLang);
const neuralOn = () => project.settings.voiceMode === "neural" && !!voiceId();
function computeTimeline() {
  return timeline(project.scenes, project.settings.wps, neuralOn() ? voiceDurations(project.scenes, voiceId()) : null);
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
  if (neuralOn()) voices.start(tl.items, voiceId(), offset);
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
      speak(at.item.scene.text, { lang: s.voiceLang, voice: s.voice, rate: s.rate, pitch: s.pitch });
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

const TABS = ["text", "scenes", "chars", "style", "sound", "export"];
let currentTab = "text";
try { currentTab = sessionStorage.getItem("videoStudio.tab") || "text"; } catch { /* ignoré */ }

function renderTabs() {
  const labels = { text: "tabText", scenes: "tabScenes", chars: "tabChars", style: "tabStyle", sound: "tabSound", export: "tabExport" };
  const bar = $("#tabs");
  bar.replaceChildren(...TABS.map((id) => h("button", {
    class: `tab ${id === currentTab ? "on" : ""}`, role: "tab", "aria-selected": String(id === currentTab),
    onclick: () => { currentTab = id; try { sessionStorage.setItem("videoStudio.tab", id); } catch { /* ignoré */ } renderTabs(); renderPanel(); },
  }, t(labels[id]))));
}

function renderPanel() {
  const panel = $("#panel");
  const builders = { text: textPanel, scenes: scenesPanel, chars: charsPanel, style: stylePanel, sound: soundPanel, export: exportPanel };
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

function textPanel() {
  const ta = h("textarea", { id: "script", rows: 12, spellcheck: "true", oninput: (e) => { project.text = e.target.value; save(); } });
  ta.value = project.text;
  const ex = (key) => h("button", { class: "chip", onclick: () => {
    const lang = EXAMPLES[key][project.textLang] ? project.textLang : "fr";
    project.text = EXAMPLES[key][lang];
    ta.value = project.text;
    buildFromText();
  } }, t({ psy: "exPsy", sport: "exSport", story: "exStory" }[key]));

  const keyInput = h("input", { type: "password", autocomplete: "off", placeholder: "sk-ant-…", value: getKey(), onchange: (e) => setKey(e.target.value.trim()) });
  let target = project.settings.voiceLang !== project.textLang ? project.settings.voiceLang : (project.textLang === "fr" ? "de" : "fr");
  const status = h("div", { class: "status" });

  const runAi = async (btn, fn) => {
    btn.disabled = true;
    status.textContent = t("working");
    try { await fn(); status.textContent = t("done"); } catch (e) { status.textContent = ""; toast(errText(e), "error"); } finally { btn.disabled = false; }
  };
  const trBtn = h("button", { class: "btn", onclick: () => runAi(trBtn, async () => {
    const lines = project.scenes.map((s) => s.text);
    const out = await translateLines(getKey(), lines, target, (d, n) => { status.textContent = `${t("working")} ${d}/${n}`; });
    project.scenes = project.scenes.map((s, i) => ({ ...s, text: out[i] }));
    project.text = project.scenes.map((s) => (s.kind === "title" ? `# ${s.text}` : `[${s.action}] ${s.text}`)).join("\n");
    project.textLang = target;
    project.settings.voiceLang = target;
    project.settings.voice = "";
    project.settings.neuralVoice = "";
    ta.value = project.text;
    rebuildTimeline();
  }) }, t("translate"));
  const dirBtn = h("button", { class: "btn", onclick: () => runAi(dirBtn, async () => {
    const actions = await directScenes(getKey(), project.scenes.map((s) => s.text), (d, n) => { status.textContent = `${t("working")} ${d}/${n}`; });
    project.scenes = project.scenes.map((s, i) => (s.kind === "title" ? s : { ...s, action: actions[i], auto: false, figures: undefined }));
    rebuildTimeline();
  }) }, t("direct"));

  return h("div", { class: "stack" },
    field(t("textLabel"), ta, t("textHelp")),
    h("div", { class: "row" },
      h("button", { class: "btn primary", onclick: buildFromText }, t("build")),
      field(t("textLang"), select(project.textLang, langOptions(), (v) => { project.textLang = v; project.settings.voiceLang = v; project.settings.voice = ""; project.settings.neuralVoice = ""; rebuildTimeline(); }))),
    h("div", { class: "row wrap" }, h("span", { class: "lbl" }, t("examples")), ex("psy"), ex("sport"), ex("story")),
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
  tl.items.forEach((it, i) => {
    const s = it.scene;
    const update = (patch) => { project.scenes[i] = { ...project.scenes[i], ...patch }; rebuildTimeline(); timeCell.textContent = `${fmtTime(tl.items[i].start)} · ${tl.items[i].duration.toFixed(1)}${t("seconds")}`; };
    const timeCell = h("span", { class: "muted" }, `${fmtTime(it.start)} · ${it.duration.toFixed(1)}${t("seconds")}`);
    const ta = h("textarea", { rows: 2, oninput: (e) => update({ text: e.target.value }) });
    ta.value = s.text;
    const duo = s.figures ? s.figures === 2 : DUO_ACTIONS.has(s.action);
    list.append(h("div", { class: `scene-card ${s.kind}`, "data-i": String(i) },
      h("div", { class: "row between" },
        h("strong", {}, `${i + 1}. ${s.kind === "title" ? t("title") : t("scene")}`), timeCell),
      ta,
      h("div", { class: "row wrap" },
        select(s.action, actionOptions(), (v) => update({ action: v, auto: false, figures: undefined })),
        select(String(duo ? 2 : 1), [["1", `1 ${t("figures").toLowerCase()}`], ["2", `2 ${t("figures").toLowerCase()}`]], (v) => update({ figures: Number(v) })),
        h("input", { type: "number", min: "1", max: "30", step: "0.5", class: "num", placeholder: t("auto"), value: s.duration ?? "", title: t("duration"),
          onchange: (e) => update({ duration: e.target.value ? Math.max(0.5, Number(e.target.value)) : undefined }) }),
        h("button", { class: "btn sm", onclick: () => { seek(tl.items[i].start); if (!playing) play(); } }, t("fromHere")),
        h("button", { class: "btn sm ghost", onclick: () => { project.scenes.splice(i, 1); rebuildTimeline(); renderPanel(); } }, t("remove")))));
  });
  list.append(h("button", { class: "btn", onclick: () => {
    project.scenes.push({ id: `s${Date.now()}`, kind: "scene", text: "…", action: "think", auto: false, seed: (Math.random() * 2 ** 32) >>> 0 });
    rebuildTimeline();
    renderPanel();
  } }, t("addScene")));
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

function charEditor(index) {
  const m = morphFrom(project.settings.characters[index]);
  const set = (patch) => {
    project.settings.characters[index] = { ...project.settings.characters[index], ...patch };
    draw();
    save();
  };
  const mini = h("canvas", { width: 220, height: 260, class: "mini" });
  minis.push({ canvas: mini, index });
  const slider = (key, min, max) => field(t(key === "build" ? "bodyBuild" : key), range(m[key], min, max, 0.01, (v) => set({ [key]: v })));
  return h("section", { class: "card" },
    h("h3", {}, t(index === 0 ? "charMain" : "charSecond")),
    h("div", { class: "char" },
      mini,
      h("div", { class: "stack" },
        h("div", { class: "row wrap" }, h("span", { class: "lbl" }, t("presets")),
          ...Object.entries(PRESETS).map(([id, pr]) => h("button", { class: "chip", onclick: () => {
            project.settings.characters[index] = { ...pr.morph };
            draw(); save(); renderPanel();
          } }, pick(pr.label)))),
        slider("height", 0.6, 1.25), slider("build", 0.6, 1.8), slider("belly", 0, 1), slider("headSize", 0.75, 1.5),
        slider("legs", 0.75, 1.25), slider("arms", 0.8, 1.25), slider("torso", 0.85, 1.2),
        h("div", { class: "row wrap" },
          field(t("color"), h("input", { type: "color", value: m.color, oninput: (e) => set({ color: e.target.value }) })),
          field(t("detail"), h("input", { type: "color", value: m.detail, oninput: (e) => set({ detail: e.target.value }) })),
          field(t("hair"), select(m.hair, [["none", t("hairNone")], ["short", t("hairShort")], ["long", t("hairLong")], ["bun", t("hairBun")]], (v) => set({ hair: v })))),
        h("div", { class: "row wrap" },
          ...["glasses", "beard", "cap", "headband", "skirt", "tie"].map((k) => toggle(t(k), m[k], (v) => set({ [k]: v })))))));
}

function charsPanel() {
  const el = h("div", { class: "stack" }, charEditor(0), charEditor(1));
  requestAnimationFrame(runMiniPreviews);
  return el;
}

// ---------- Style ----------

function stylePanel() {
  const s = project.settings;
  const set = (patch, rebuild = false) => { Object.assign(s, patch); if (rebuild) rebuildTimeline(); else { draw(); save(); } };
  return h("div", { class: "stack" },
    h("div", { class: "grid2" },
      field(t("format"), select(s.format, Object.entries(FORMATS).map(([k, v]) => [k, v.label]), (v) => set({ format: v }))),
      field(t("theme"), select(s.theme, Object.entries(THEMES).map(([k, v]) => [k, pick(v.label)]), (v) => set({ theme: v }))),
      field(t("captionStyle"), select(s.captionStyle, [["words", t("capWords")], ["karaoke", t("capKaraoke")], ["full", t("capFull")]], (v) => set({ captionStyle: v }))),
      field(t("captionScale"), range(s.captionScale, 0.6, 1.5, 0.05, (v) => set({ captionScale: v }))),
      field(t("wps"), range(s.wps, 1.2, 4, 0.1, (v) => set({ wps: v }, true))),
      field(t("accent"), h("input", { type: "color", value: s.accent, oninput: (e) => set({ accent: e.target.value }) })),
      field(t("handle"), h("input", { type: "text", value: s.handle, placeholder: "@Homme.Penseur", oninput: (e) => set({ handle: e.target.value.trim() }) }))),
    h("div", { class: "row wrap" },
      toggle(t("uppercase"), s.uppercase, (v) => set({ uppercase: v })),
      toggle(t("progressBar"), s.progressBar, (v) => set({ progressBar: v }))));
}

// ---------- Voix & musique ----------

let voiceAbort = null;

/** Génère les voix manquantes. Renvoie "ok", "aborted" (annulé par l'utilisateur) ou "failed". */
async function ensureVoices(status) {
  if (!neuralOn() || !missingCount(project.scenes, voiceId())) return "ok";
  ensureAudio();
  voiceAbort = new AbortController();
  try {
    await generateVoices(audioCtx, project.scenes, voiceId(), (p) => {
      status.textContent = p.phase === "download" ? `${t("voiceDownload")} ${p.percent ?? 0} %` : `${t("voiceGenerating")} ${p.done}/${p.total}`;
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
  const n = project.scenes.filter((sc) => sc.text.trim()).length;
  const missing = missingCount(project.scenes, voiceId());
  return missing ? `${n - missing}/${n} ${t("voiceScenesReady")}` : `${t("voiceReady")} · ${fmtTime(tl.total)}`;
}

function soundPanel() {
  const s = project.settings;
  const set = (patch) => { Object.assign(s, patch); save(); };

  // Voix neuronale : enregistrée dans la vidéo.
  const status = h("div", { class: "status" }, voiceStatusText());
  const neuralBox = h("div", { class: "stack" });
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
          field(t("voice"), select(voiceId(), list, (v) => { set({ neuralVoice: v }); rebuildTimeline(); status.textContent = voiceStatusText(); })),
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
    h("button", { class: "btn sm", onclick: () => speak(project.scenes[0]?.text ?? "Bonjour", { lang: s.voiceLang, voice: s.voice, rate: s.rate, pitch: s.pitch }) }, "🔊 Test"),
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
function exportPanel() {
  const status = h("div", { class: "status" });
  const result = h("div", { class: "row wrap" });
  const bar = h("progress", { max: "1", value: "0" });
  const cancelBtn = h("button", { class: "btn ghost", disabled: true, onclick: () => exportAbort?.abort() }, t("cancel"));
  const btn = h("button", { class: "btn primary", onclick: async () => {
    if (bestMimeType() === null) return toast(t("noRecorder"), "error");
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
    try {
      // La voix off doit exister avant l'enregistrement : elle fixe la durée des scènes.
      // Si elle ne peut pas être créée (pas d'Internet au premier usage), la vidéo est exportée sans voix.
      if ((await ensureVoices(status)) === "aborted") throw new Error("ABORTED");
      if (project.settings.mic) {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        audioCtx.createMediaStreamSource(micStream).connect(dest);
      }
      exporting = true;
      applyFormat();
      startAudio(0);
      exportAbort = new AbortController();
      const { blob, ext } = await recordVideo(canvas, {
        duration: tl.total,
        audioStream: dest.stream,
        signal: exportAbort.signal,
        draw: (tt) => renderFrame(ctx, project, tl, tt),
        onTime: (tt) => { bar.value = tt / tl.total; status.textContent = `${fmtTime(tt)} / ${fmtTime(tl.total)}`; },
      });
      const name = `video-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}`;
      const url = URL.createObjectURL(blob);
      status.textContent = `${t("done")} · ${(blob.size / 1e6).toFixed(1)} Mo · ${ext.toUpperCase()}`;
      const file = new File([blob], name, { type: blob.type });
      result.replaceChildren(
        h("a", { class: "btn primary", href: url, download: name }, `⬇ ${t("download")}`),
        navigator.canShare?.({ files: [file] }) ? h("button", { class: "btn", onclick: () => navigator.share({ files: [file] }).catch(() => {}) }, t("share")) : null,
        h("video", { src: url, controls: true, playsinline: true, class: "result" }));
    } catch (e) {
      if (e?.message !== "ABORTED") toast(errText(e), "error");
      status.textContent = "";
    } finally {
      exporting = false;
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
    h("div", { class: "row" }, btn, cancelBtn),
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
          const p = JSON.parse(await f.text());
          const d = defaultProject();
          project = { ...d, ...p, settings: { ...d.settings, ...p.settings } };
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
}

$("#uiLang").addEventListener("change", (e) => { project.settings.uiLang = e.target.value; save(); renderAll(); });
$("#playBtn").addEventListener("click", () => (playing ? pause() : play()));
$("#seek").addEventListener("input", (e) => seek(Number(e.target.value)));
canvas.addEventListener("click", () => (playing ? pause() : play()));
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement?.tagName)) { e.preventDefault(); playing ? pause() : play(); }
});

// La police des sous-titres peut arriver après le premier rendu.
document.fonts?.ready.then(draw);
renderAll();

// Pour les tests automatisés.
window.__videoStudio = { get project() { return project; }, get timeline() { return tl; }, seek, play, pause, renderFrame: (tt) => renderFrame(ctx, project, tl, tt) };
