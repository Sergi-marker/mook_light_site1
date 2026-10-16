// © la triche — Animots
// Styles de chaîne : un ensemble de réglages (décor, personnages, sous-titres, musique, voix, marque)
// appliqué d'un coup, pour que toutes les vidéos d'une chaîne se ressemblent.

import { PRESETS } from "./figure.js";

/** Réglages qui font partie d'un style (le texte, l'accroche et la langue n'en font pas partie). */
export const STYLE_KEYS = [
  "theme", "backdrop", "bgImage", "format", "transition", "voiceFx", "voicePitch",
  "captionFont", "captionPos", "captionBox", "captionStyle", "captionColor", "captionScale", "accent", "uppercase", "speakerLabels", "progressBar",
  "characters", "music", "musicVol", "neuralVoice", "charVoice0", "charVoice1", "voiceRate",
  "handle", "logo", "logoPos", "logoSize", "outro",
];

/** Valeurs communes aux styles prêts : un style prêt remet ces réglages à zéro (mais garde @signature et logo). */
const BUILTIN_BASE = {
  backdrop: "none", bgImage: "", captionScale: 1, captionColor: "#ffffff", speakerLabels: true, progressBar: false,
  voiceRate: 1, neuralVoice: "", charVoice0: "", charVoice1: "", transition: "auto", voiceFx: "natural", voicePitch: 0,
};

export const BUILTIN_STYLES = {
  psy: {
    label: ["Psychologie sombre", "Psychologie dunkel", "Dark psychology"],
    settings: {
      ...BUILTIN_BASE,
      theme: "nuit", backdrop: "none", captionFont: "montserrat", captionPos: "top", captionBox: "none", captionStyle: "words",
      captionColor: "#ffffff", accent: "#ffd84d", uppercase: true, music: "melancolie", musicVol: 0.3,
      characters: [{ ...PRESETS.penseur.morph }, { ...PRESETS.gris.morph }],
      outro: "Abonne-toi si tu t'es reconnu",
    },
  },
  sport: {
    label: ["Sport énergique", "Sport energisch", "Energetic sport"],
    settings: {
      ...BUILTIN_BASE,
      theme: "energie", backdrop: "gym", captionFont: "anton", captionPos: "middle", captionBox: "word", captionStyle: "full",
      captionColor: "#ffffff", accent: "#ff7a1a", uppercase: true, music: "motivation", musicVol: 0.4, voiceRate: 1.1,
      characters: [{ ...PRESETS.coach.morph }, { ...PRESETS.sportif.morph }],
      outro: "Abonne-toi pour ton entraînement de demain",
    },
  },
  conte: {
    label: ["Histoire / conte", "Geschichte / Märchen", "Story / tale"],
    settings: {
      ...BUILTIN_BASE,
      theme: "sepia", backdrop: "park", captionFont: "serif", captionPos: "bottom", captionBox: "box", captionStyle: "karaoke",
      captionColor: "#fff6e6", accent: "#f3c77a", uppercase: false, music: "mystere", musicVol: 0.3, voiceRate: 0.95,
      characters: [{ ...PRESETS.ancien.morph }, { ...PRESETS.enfant.morph }],
      outro: "La suite dans la prochaine histoire",
    },
  },
  urbain: {
    label: ["Urbain / dialogue", "Urban / Dialog", "Urban / dialogue"],
    settings: {
      ...BUILTIN_BASE,
      theme: "noir", backdrop: "street", captionFont: "bangers", captionPos: "top", captionBox: "none", captionStyle: "words",
      captionColor: "#ffffff", accent: "#5ee0ff", uppercase: true, music: "calme", musicVol: 0.3,
      characters: [{ ...PRESETS.urbain.morph }, { ...PRESETS.etudiante.morph }],
      outro: "Abonne-toi pour la suite",
    },
  },
};

/** Extrait d'un projet les réglages qui forment son style. */
export function styleFrom(settings) {
  const out = {};
  for (const k of STYLE_KEYS) if (settings[k] !== undefined) out[k] = structuredClone(settings[k]);
  return out;
}

/** Applique un style aux réglages (sans toucher au texte ni à la langue). */
export function applyStyle(settings, style) {
  for (const k of STYLE_KEYS) if (style[k] !== undefined) settings[k] = structuredClone(style[k]);
  return settings;
}
