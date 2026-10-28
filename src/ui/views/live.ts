// 🎹 JOUER: play an instrument live — on-screen keyboard (mouse / touch), the computer keyboard
// (physical key positions, so QWERTY and AZERTY play the same notes) or a MIDI keyboard — with a
// sustain pedal, and record a take as it was played (not a loop) straight onto the arrangement.

import { noteName } from "../../core/music.ts";
import { SOUND_LIBRARY, soundParams } from "../../core/soundLibrary.ts";
import type { Project } from "../../core/types.ts";
import type { App, View } from "../app.ts";
import { h, toast } from "../dom.ts";

/** Physical keys → semitones from the keyboard's lowest C (two rows, like a piano). */
const KEYS: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
  KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};
const BLACK = new Set([1, 3, 6, 8, 10]);
const FIRST = 36, LAST = 96; // C2 → C7 on screen

export function createLiveView(app: App): View {
  const { store, engine } = app;
  let octave = 4; // computer keyboard: KeyA = C4
  let velocity = 96;
  let quantize: 0 | 0.5 | 1 | 2 = 0;
  const down = new Set<number>(); // pitches held by this view (mouse / computer keys)
  const byKey = new Map<string, number>(); // computer key → the pitch it started
  const keyEls = new Map<number, HTMLElement>();
  let labels: Map<string, string> | null = null;

  const instrumentSel = h("select", { "aria-label": "Instrument joué", onchange: () => {
    app.selectedInstrumentId = instrumentSel.value;
    void engine.prepareLive(instrumentSel.value).catch(() => {});
    renderInfo();
  } }) as HTMLSelectElement;
  const addSel = h("select", { "aria-label": "Ajouter un instrument", onchange: () => {
    const snd = SOUND_LIBRARY.find((x) => x.id === addSel.value);
    addSel.value = "";
    if (!snd) return;
    const sp = soundParams(snd);
    app.dispatch({ type: "addInstrument", preset: sp.preset, name: snd.name });
    const ins = store.getState().instruments.at(-1)!;
    app.dispatch({ type: "updateInstrument", trackId: ins.id, patch: { synth: sp.synth, bass808: sp.bass808, sample: sp.sample } });
    app.selectedInstrumentId = ins.id;
    void engine.prepareLive(ins.id).catch(() => {});
    toast(`« ${snd.name} » ajouté : joue-le au clavier.`, "ok");
  } }, h("option", { value: "" }, "+ Nouvel instrument…"),
    ...[...new Set(SOUND_LIBRARY.filter((x) => x.preset !== "808").map((x) => x.category))].map((cat) => h("optgroup", { label: cat },
      ...SOUND_LIBRARY.filter((x) => x.category === cat && x.preset !== "808").map((x) => h("option", { value: x.id }, x.name))))) as HTMLSelectElement;
  const octLabel = h("span", { class: "val" });
  const velLabel = h("span", { class: "val" });
  const sustainBtn = h("button", { class: "btn btn-toggle", title: "Pédale de sustain : les notes relâchées continuent de sonner (touche Maj maintenue, ou pédale du clavier MIDI)", onclick: () => app.setSustain(!app.sustain) }, "Pédale (sustain)");
  const recBtn = h("button", { class: "btn btn-rec" });
  const quantSel = h("select", { "aria-label": "Recaler les notes", onchange: () => (quantize = Number(quantSel.value) as typeof quantize) },
    h("option", { value: "0" }, "Garder le jeu tel quel"), h("option", { value: "0.5" }, "Recaler au 1/32"), h("option", { value: "1" }, "Recaler au 1/16"), h("option", { value: "2" }, "Recaler au 1/8")) as HTMLSelectElement;
  const info = h("p", { class: "hint" });
  const recInfo = h("p", { class: "live-rec-info" });

  async function toggleRecord(): Promise<void> {
    if (app.liveRec) {
      const r = app.stopLiveRecording(quantize);
      if (!r) return;
      if (!r.notes) toast("Aucune note jouée : rien n'a été ajouté.", "error");
      else toast(`Prise ajoutée sur l'arrangement : ${r.notes} notes sur ${r.bars} mesure(s), à partir de la mesure ${r.startBar + 1}. Ctrl+Z pour annuler.`, "ok", 7000);
      return;
    }
    const ins = instrumentSel.value || app.liveInstrument();
    if (!ins) return void toast("Ajoute d'abord un instrument (menu « + Nouvel instrument »).", "error");
    const ok = await app.task("Chargement de l'instrument…", () => app.startLiveRecording(ins));
    if (ok) toast("1 mesure de décompte, puis joue : tout est gardé tel que tu le joues (32 mesures max). Re-clique pour arrêter.", "ok", 5000);
  }
  recBtn.addEventListener("click", () => void toggleRecord());

  // --- on-screen keyboard -------------------------------------------------------------------
  const keyboard = h("div", { class: "live-keys", role: "group", "aria-label": "Clavier" });
  let whiteIndex = 0;
  for (let pitch = FIRST; pitch <= LAST; pitch++) {
    const black = BLACK.has(pitch % 12);
    const k = h("div", { class: `live-key ${black ? "black" : "white"}`, "data-pitch": pitch, title: noteName(pitch) },
      pitch % 12 === 0 ? h("span", { class: "live-key-name" }, noteName(pitch)) : null);
    if (black) k.style.left = `calc(${whiteIndex} * var(--kw) - var(--kw) * 0.3)`;
    else whiteIndex++;
    keyEls.set(pitch, k);
    keyboard.append(k);
  }
  keyboard.style.setProperty("--whites", String(whiteIndex));
  let mouseNote: number | null = null;
  const pitchAt = (e: PointerEvent) => {
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>(".live-key");
    return el ? Number(el.dataset.pitch) : null;
  };
  // Lower on the key = louder, like pressing harder.
  const velAt = (e: PointerEvent, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return Math.round(Math.max(30, Math.min(127, 40 + ((e.clientY - r.top) / r.height) * 87)));
  };
  const press = (pitch: number, vel: number) => {
    if (down.has(pitch)) return;
    down.add(pitch);
    app.liveDown(pitch, vel, instrumentSel.value || undefined);
  };
  const release = (pitch: number) => {
    if (!down.delete(pitch)) return;
    app.liveUp(pitch);
  };
  keyboard.addEventListener("pointerdown", (e) => {
    const pitch = pitchAt(e);
    if (pitch === null) return;
    keyboard.setPointerCapture(e.pointerId);
    mouseNote = pitch;
    press(pitch, velAt(e, keyEls.get(pitch)!));
  });
  keyboard.addEventListener("pointermove", (e) => {
    if (mouseNote === null) return;
    const pitch = pitchAt(e);
    if (pitch === null || pitch === mouseNote) return;
    release(mouseNote);
    mouseNote = pitch;
    press(pitch, velAt(e, keyEls.get(pitch)!));
  });
  const mouseUp = () => {
    if (mouseNote !== null) release(mouseNote);
    mouseNote = null;
  };
  keyboard.addEventListener("pointerup", mouseUp);
  keyboard.addEventListener("pointercancel", mouseUp);

  // --- computer keyboard (only while this page is shown) ------------------------------------
  const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
  const onKeyDown = (e: KeyboardEvent) => {
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".modal-overlay")) return;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      if (!app.sustain) app.setSustain(true);
      return;
    }
    const semi = KEYS[e.code];
    if (semi !== undefined || ["KeyZ", "KeyX", "KeyC", "KeyV"].includes(e.code)) {
      e.preventDefault(); // these keys are the piano here (not mute / solo / record)
      e.stopPropagation();
    }
    if (e.repeat) return;
    if (semi !== undefined) {
      const pitch = 12 * (octave + 1) + semi;
      byKey.set(e.code, pitch);
      press(pitch, velocity);
    }
    else if (e.code === "KeyZ") octave = Math.max(1, octave - 1);
    else if (e.code === "KeyX") octave = Math.min(7, octave + 1);
    else if (e.code === "KeyC") velocity = Math.max(20, velocity - 16);
    else if (e.code === "KeyV") velocity = Math.min(127, velocity + 16);
    else return;
    renderInfo();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") return app.setSustain(false);
    // Release what this key started, even if the octave changed meanwhile.
    const pitch = byKey.get(e.code);
    if (pitch === undefined) return;
    byKey.delete(e.code);
    release(pitch);
  };
  const onBlur = () => {
    byKey.clear();
    for (const p of [...down]) release(p);
    app.setSustain(false);
  };
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", onBlur);
  // Letters printed on this computer's keys (AZERTY shows Q Z S E D…).
  const kb = (navigator as unknown as { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard;
  void kb?.getLayoutMap().then((m) => {
    labels = m;
    renderInfo();
  }).catch(() => {});
  const keyLabel = (code: string) => (labels?.get(code) ?? code.replace("Key", "")).toUpperCase();

  app.onLiveNote = (pitch, isDown) => keyEls.get(pitch)?.classList.toggle("on", isDown);

  function renderInfo(): void {
    octLabel.textContent = `Octave ${octave} (${keyLabel("KeyZ")} / ${keyLabel("KeyX")})`;
    velLabel.textContent = `Force ${velocity} (${keyLabel("KeyC")} / ${keyLabel("KeyV")})`;
    const whites = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK"].map(keyLabel).join(" ");
    const blacks = ["KeyW", "KeyE", "KeyT", "KeyY", "KeyU"].map(keyLabel).join(" ");
    info.textContent = `Clavier de l'ordinateur : touches blanches ${whites} (do ré mi fa sol la si do), touches noires ${blacks}. Maj = pédale. Espace = lecture du morceau. Souris : clique les touches (plus bas sur la touche = plus fort).`;
  }

  const el = h("section", { class: "view live-view" },
    h("div", { class: "toolbar" },
      h("h1", {}, "🎹 JOUER"),
      instrumentSel, addSel,
      octLabel, velLabel, sustainBtn),
    keyboard,
    info,
    h("div", { class: "card" },
      h("h3", {}, "Enregistrer une prise live"),
      h("p", { class: "hint" }, "La prise démarre à la mesure du curseur (place-le dans ARRANGEMENT ou avec Entrée = début), après 1 mesure de décompte, le morceau joue derrière toi. Les notes sont gardées comme tu les joues, sans boucle : idéal pour un piano qui accompagne tout un couplet. La prise devient un pattern posé sur l'arrangement, modifiable dans MELODY."),
      h("div", { class: "row-inline" }, recBtn, quantSel),
      recInfo));

  let sig = "";
  return {
    el,
    update(p: Project) {
      const s = `${p.instruments.map((i) => `${i.id}:${i.name}`).join()}|${app.selectedInstrumentId}`;
      if (s !== sig) {
        sig = s;
        const cur = app.liveInstrument();
        instrumentSel.replaceChildren(...p.instruments.map((i) => h("option", { value: i.id, selected: i.id === cur }, i.name)));
        if (cur) void engine.prepareLive(cur).catch(() => {});
      }
      renderInfo();
    },
    frame() {
      const rec = app.liveRec;
      recBtn.textContent = rec ? "■ Arrêter et garder la prise" : "● Enregistrer";
      recBtn.classList.toggle("recording", !!rec);
      sustainBtn.classList.toggle("on", app.sustain);
      if (rec) {
        const pos = engine.currentPosition() - rec.startStep;
        recInfo.textContent = pos < 0 ? "Décompte…" : `● Enregistrement — mesure ${Math.floor(pos / 16) + 1} · ${rec.notes.length + rec.open.size} note(s)`;
      } else recInfo.textContent = "";
    },
    dispose() {
      onBlur();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      app.onLiveNote = null;
    },
  };
}
