import { mp3Available, type ExportFormat, type ExportVariant } from "../../audio/export.ts";
import { PROJECT_EXTENSION } from "../../core/constants.ts";
import type { WavBitDepth } from "../../core/io/wav.ts";
import { songLengthBars } from "../../core/project.ts";
import type { App, View } from "../app.ts";
import { h } from "../dom.ts";
import { hasFileHandle } from "../persistence.ts";

export function createProjectsView(app: App): View {
  const info = h("dl", { class: "kv" });
  const variant = h("select", { "aria-label": "Que exporter" },
    h("option", { value: "master" }, "Master (morceau complet)"), h("option", { value: "instrumental" }, "Instrumental (sans voix)"),
    h("option", { value: "vocals" }, "Vocals (voix seules)"), h("option", { value: "stems" }, "Stems (une piste par fichier, .zip)"));
  const format = h("select", { "aria-label": "Format" }, h("option", { value: "wav" }, "WAV"), h("option", { value: "mp3" }, "MP3"));
  const bits = h("select", { "aria-label": "Résolution WAV" }, h("option", { value: "16" }, "16-bit"), h("option", { value: "24", selected: true }, "24-bit"), h("option", { value: "32" }, "32-bit float"));
  const rate = h("select", { "aria-label": "Fréquence" }, h("option", { value: "44100" }, "44.1 kHz"), h("option", { value: "48000" }, "48 kHz"));
  const kbps = h("select", { "aria-label": "Débit MP3" }, ...[320, 256, 192, 128].map((k) => h("option", { value: k }, `${k} kbps`)));
  const mp3Note = h("span", { class: "hint" });
  void mp3Available().then((ok) => {
    mp3Note.textContent = ok ? "Encodeur MP3 (LAME) prêt." : "MP3 : encodeur LAME non installé (exécutez « npm install ») — le WAV fonctionne.";
    (format.querySelector('option[value="mp3"]') as HTMLOptionElement).disabled = !ok;
  });
  const syncFmt = () => {
    bits.disabled = format.value !== "wav";
    kbps.disabled = format.value !== "mp3";
  };
  format.addEventListener("change", syncFmt);
  syncFmt();
  const lastExport = h("div", {});
  const el = h("section", { class: "view projects-view" },
    h("h1", {}, "PROJECTS"),
    h("div", { class: "button-row" },
      h("button", { class: "btn btn-primary", onclick: () => void app.saveProject() }, "Sauvegarder (Ctrl+S)"),
      h("button", { class: "btn", onclick: () => void app.saveProject(true) }, "Sauvegarder sous… (Ctrl+Shift+S)"),
      h("button", { class: "btn", onclick: () => void app.openProject() }, "Ouvrir… (Ctrl+O)"),
      h("button", { class: "btn", onclick: () => void app.newProject("empty") }, "Nouveau projet vide")),
    h("div", { class: "card" }, h("h3", {}, "EXPORT"),
      h("div", { class: "row-inline" }, variant, format, bits, rate, kbps,
        h("button", { class: "btn btn-primary", onclick: () => void app.exportAudio({ variant: variant.value as ExportVariant, format: format.value as ExportFormat, bitDepth: Number(bits.value) as WavBitDepth, sampleRate: Number(rate.value) as 44100 | 48000, mp3Kbps: Number(kbps.value) as 320 }) }, "⤓ Exporter")),
      mp3Note,
      h("p", { class: "hint" }, "Le rendu passe par exactement le même moteur que la lecture (instruments, effets, mixer, master). Sans arrangement, le pattern courant est exporté 4 fois en boucle."),
      lastExport),
    h("div", { class: "card" }, h("h3", {}, "Projet courant"), info),
    h("div", { class: "card" }, h("h3", {}, "Format & sécurité"),
      h("ul", {},
        h("li", {}, `Format ${PROJECT_EXTENSION} : archive ZIP standard — project.json (BPM, tonalité, patterns, MIDI, instruments, mixer, effets, automation, arrangement, réglages vocaux et IA) + audio/ (prises en WAV 24-bit) + samples/.`),
        h("li", {}, "Sauvegarde automatique 1,5 s après chaque modification ; les enregistrements sont stockés localement dès la fin de la prise."),
        h("li", {}, "Crash recovery : « Recover previous session? » au démarrage si l'application ne s'est pas fermée correctement."),
        h("li", {}, "Aucun projet n'est supprimé sans confirmation."))));
  return {
    el,
    update(p) {
      const rows: [string, string][] = [
        ["Nom", p.name],
        ["Tempo", `${p.bpm} BPM · swing ${p.swing}% · ${p.timeSignature.beats}/${p.timeSignature.beatUnit}`],
        ["Contenu", `${p.patterns.length} pattern(s) · ${p.instruments.length} instrument(s) · ${p.vocals.reduce((n, v) => n + v.takes.length, 0)} prise(s) vocale(s)`],
        ["Arrangement", `${songLengthBars(p)} mesure(s) · ${p.arrangement.sections.length} section(s)`],
        ["Samples importés", p.samples.length ? p.samples.map((s) => s.name).join(", ") : "aucun"],
        ["État", app.store.isDirty() ? "Modifications non sauvegardées dans un fichier" : app.fileName ? "Sauvegardé" : "Jamais sauvegardé dans un fichier"],
        ["Fichier", app.fileName ? `${app.fileName}${hasFileHandle() ? " (Ctrl+S réécrit ce fichier)" : ""}` : "aucun"],
        ["Dernière sauvegarde auto", app.lastAutosave ? app.lastAutosave.toLocaleTimeString() : "—"],
      ];
      info.textContent = "";
      for (const [k, v] of rows) info.append(h("dt", {}, k), h("dd", {}, v));
      lastExport.textContent = "";
      const le = app.lastExport;
      if (le) {
        lastExport.append(h("p", {}, `Dernier export : ${le.files.map((f) => `${f.name} (${(f.size / 1048576).toFixed(1)} Mo)`).join(", ")}`));
        if (le.measurements) lastExport.append(h("p", { class: "hint" }, `${le.measurements.integratedLufs.toFixed(1)} LUFS · true peak ${le.measurements.truePeakDb.toFixed(1)} dBTP · ${le.measurements.clippedSamples} échantillon(s) saturé(s)`));
      }
    },
  };
}
