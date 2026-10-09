// AI SONG ASSISTANT (local, offline): analyses the project (structure, energy per section,
// harmony, 808/melody compatibility, vocals) and answers questions in French or English with
// concrete recommendations — each one optionally backed by actions that apply it.

import { detectKey, inScale, keyLabel, NOTE_NAMES, snapToScale } from "../music.ts";
import { currentPattern, newId, stepsPerBarOf } from "../project.ts";
import type { Action } from "../reducer.ts";
import type { InstrumentKind, Note, Pattern, Project, Step } from "../types.ts";
import { harmonyKey } from "./melody.ts";
import { generateMelody, chooseProgression } from "./melody.ts";

export interface AssistantAnswer {
  topic: string;
  text: string[];
  suggestions: { label: string; detail: string; actions: Action[] }[];
}

interface PatternStats {
  pattern: Pattern;
  drumHits: number;
  hatHits: number;
  noteCount: number;
  layers: number;
  energy: number;
}

function stats(p: Project, pat: Pattern): PatternStats {
  const kindOf = (id: string) => p.tracks.find((t) => t.id === id)?.instrument;
  let drumHits = 0, hatHits = 0, vel = 0;
  for (const [id, steps] of Object.entries(pat.drums))
    for (const s of steps)
      if (s.on) {
        drumHits += s.roll ?? 1;
        vel += s.velocity;
        if (kindOf(id) === "closedHat" || kindOf(id) === "openHat") hatHits += s.roll ?? 1;
      }
  const noteCount = Object.values(pat.notes).reduce((n, v) => n + v.length, 0);
  const layers = Object.values(pat.drums).filter((v) => v.some((s) => s.on)).length + Object.values(pat.notes).filter((v) => v.length).length;
  const bars = pat.stepCount / 16;
  const energy = (drumHits / bars) * 1.0 + (noteCount / bars) * 0.6 + layers * 3 + (drumHits ? vel / drumHits / 20 : 0);
  return { pattern: pat, drumHits, hatHits, noteCount, layers, energy };
}

function findPattern(p: Project, re: RegExp): Pattern | undefined {
  const fromSections = p.arrangement.sections.find((s) => re.test(s.name));
  if (fromSections) {
    const clip = p.arrangement.clips.find((c) => c.start <= fromSections.start && c.start + c.length > fromSections.start);
    const pat = clip && p.patterns.find((x) => x.id === clip.patternId);
    if (pat) return pat;
  }
  return p.patterns.find((x) => re.test(x.name));
}

const trackOf = (p: Project, k: InstrumentKind) => p.tracks.find((t) => t.instrument === k);

/** Actions that add energy to a pattern: rolls, open hats, perc, louder accents, counter-melody. */
function energize(p: Project, pat: Pattern): Action[] {
  const actions: Action[] = [{ type: "selectPattern", patternId: pat.id }];
  const hat = trackOf(p, "closedHat");
  if (hat) {
    const steps = pat.drums[hat.id].map((s, i): Step => {
      if (i % 2 === 0 && !s.on) return { on: true, velocity: 80 };
      if (s.on && i % 16 >= 12 && i % 2 === 1) return { ...s, roll: 3 };
      if (s.on && i % 8 === 6) return { ...s, roll: 2 };
      return s;
    });
    actions.push({ type: "setDrumSteps", trackId: hat.id, steps, patternId: pat.id });
  }
  const oh = trackOf(p, "openHat");
  if (oh) actions.push({ type: "setDrumSteps", trackId: oh.id, patternId: pat.id, steps: pat.drums[oh.id].map((s, i) => (i % 16 === 14 ? { on: true, velocity: 90 } : s)) });
  const perc = trackOf(p, "perc");
  if (perc) actions.push({ type: "setDrumSteps", trackId: perc.id, patternId: pat.id, steps: pat.drums[perc.id].map((s, i) => (i % 16 === 6 || i % 16 === 13 ? { on: true, velocity: 85 } : s)) });
  const clap = trackOf(p, "clap");
  const snare = trackOf(p, "snare");
  if (clap && snare) actions.push({ type: "setDrumSteps", trackId: clap.id, patternId: pat.id, steps: pat.drums[clap.id].map((s, i) => (pat.drums[snare.id][i]?.on ? { on: true, velocity: 110 } : s)) });
  const lead = p.instruments.find((i) => i.preset !== "808" && (pat.notes[i.id]?.length ?? 0) > 0);
  const counter = p.instruments.find((i) => i.preset !== "808" && i.id !== lead?.id && (pat.notes[i.id]?.length ?? 0) === 0);
  if (counter) {
    const notes = generateMelody({ key: p.key, genre: "trap", mood: "dark", complexity: 0.4, stepCount: pat.stepCount, progression: chooseProgression("dark", 7), seed: 4242, range: [72, 88] });
    actions.push({ type: "setNotes", trackId: counter.id, patternId: pat.id, notes });
  }
  return actions;
}

function allNotes(p: Project, filter: (insId: string) => boolean): Note[] {
  return p.patterns.flatMap((pat) => Object.entries(pat.notes).filter(([id]) => filter(id)).flatMap(([, v]) => v));
}

export function analyzeProject(p: Project) {
  const per = p.patterns.map((x) => stats(p, x));
  const b808 = p.instruments.find((i) => i.preset === "808");
  const melodicIds = new Set(p.instruments.filter((i) => i.preset !== "808").map((i) => i.id));
  const melodic = allNotes(p, (id) => melodicIds.has(id));
  const bassNotes = b808 ? allNotes(p, (id) => id === b808.id) : [];
  const detected = detectKey(melodic.length ? melodic : bassNotes);
  const outOfKey808 = bassNotes.filter((n) => !inScale(n.pitch, p.key));
  const outOfKeyMelody = melodic.filter((n) => !inScale(n.pitch, p.key));
  const spb = stepsPerBarOf(p);
  const songBars = Math.max(0, ...p.arrangement.clips.map((c) => c.start + c.length));
  const vocalSec = p.vocals.reduce((s, v) => s + v.clips.reduce((a, c) => a + c.duration, 0), 0);
  return { per, b808, detected, outOfKey808, outOfKeyMelody, songBars, vocalSec, spb };
}

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

export function askAssistant(p: Project, question: string): AssistantAnswer {
  const q = question.toLowerCase();
  const a = analyzeProject(p);
  // --- chorus energy
  if (has(q, "refrain", "chorus", "hook") && has(q, "vide", "empty", "énergie", "energie", "energy", "plat", "flat", "fade", "mou", "faible", "manque")) {
    const chorus = findPattern(p, /chorus|refrain|hook/i) ?? currentPattern(p);
    const st = stats(p, chorus);
    const verse = findPattern(p, /verse|couplet/i);
    const vs = verse ? stats(p, verse) : null;
    const text = [
      `Pattern analysé : « ${chorus.name} » — ${st.layers} couches, ${st.drumHits} coups de drums, ${st.noteCount} notes.`,
      vs ? `Le couplet (« ${verse!.name} ») a une énergie de ${vs.energy.toFixed(0)} contre ${st.energy.toFixed(0)} pour le refrain${st.energy <= vs.energy ? " : le refrain n'apporte PAS plus d'énergie que le couplet." : "."}` : "",
      "Pour un refrain qui décolle : densifier les hi-hats (rolls en fin de mesure), ajouter un open hat et des percs, doubler la snare par un clap, et superposer une contre-mélodie à l'octave.",
    ].filter(Boolean);
    return { topic: "chorus", text, suggestions: [{ label: "Donner de l'énergie au refrain", detail: "Rolls de hi-hats, open hat, percs, clap sur la snare, contre-mélodie.", actions: energize(p, chorus) }] };
  }
  // --- 808 vs melody
  if (has(q, "808", "basse", "bass") && has(q, "mélodie", "melodie", "melody", "fonctionne", "work", "sonne faux", "clash", "accord", "tonalit")) {
    const text: string[] = [];
    const sugg: AssistantAnswer["suggestions"] = [];
    if (!a.b808) return { topic: "808", text: ["Aucune piste 808 dans le projet. Ajoutez une piste 808 dans MELODY."], suggestions: [] };
    text.push(`Tonalité du projet : ${keyLabel(p.key)}.${a.detected ? ` Tonalité détectée dans vos notes : ${keyLabel(a.detected.key)}.` : ""}`);
    if (a.outOfKey808.length) {
      text.push(`${a.outOfKey808.length} note(s) de 808 sont hors gamme (${[...new Set(a.outOfKey808.map((n) => NOTE_NAMES[n.pitch % 12]))].join(", ")}) : c'est la cause la plus fréquente d'une 808 qui « sonne faux ».`);
    } else text.push("Toutes les notes de 808 sont dans la gamme.");
    // Align 808 to the root of what the melody/chords play in each bar.
    const fixActions: Action[] = [];
    for (const pat of p.patterns) {
      const bass = pat.notes[a.b808.id] ?? [];
      if (!bass.length) continue;
      const updates = bass.map((n) => {
        const bar = Math.floor(n.start / 16);
        const others = Object.entries(pat.notes).filter(([id]) => id !== a.b808!.id).flatMap(([, v]) => v).filter((m) => Math.floor(m.start / 16) === bar);
        let target = snapToScale(n.pitch, p.key);
        if (others.length) {
          const low = others.reduce((m, x) => (x.pitch < m.pitch ? x : m), others[0]);
          const pc = low.pitch % 12;
          let cand = n.pitch - ((n.pitch % 12) - pc);
          if (Math.abs(cand - n.pitch) > 6) cand += cand > n.pitch ? -12 : 12;
          if (!n.slide) target = cand;
        }
        return { id: n.id, pitch: target };
      }).filter((u, i) => u.pitch !== bass[i].pitch);
      if (updates.length) fixActions.push({ type: "updateNotes", trackId: a.b808.id, patternId: pat.id, updates });
    }
    text.push("Règle d'or : sur chaque temps fort, la 808 doit jouer la fondamentale de l'accord (la note la plus grave des accords/mélodie à ce moment).");
    if (fixActions.length) sugg.push({ label: "Caler la 808 sur la gamme et les fondamentales", detail: `${fixActions.reduce((n, x) => n + (x.type === "updateNotes" ? x.updates.length : 0), 0)} note(s) corrigée(s).`, actions: fixActions });
    if (a.detected && (a.detected.key.root !== p.key.root || a.detected.key.scale !== p.key.scale)) sugg.push({ label: `Passer le projet en ${keyLabel(a.detected.key)}`, detail: "Tonalité détectée à partir de vos notes.", actions: [{ type: "setKey", key: a.detected.key }] });
    return { topic: "808", text, suggestions: sugg };
  }
  // --- verse 2 energy
  if (has(q, "couplet", "verse") && has(q, "2", "deux", "second", "énergi", "energi", "ajouter", "add", "ennuy", "boring", "répétitif", "repetit")) {
    const verse = findPattern(p, /verse|couplet/i) ?? currentPattern(p);
    const secondSection = p.arrangement.sections.filter((s) => /verse|couplet/i.test(s.name))[1];
    const newId2 = newId("pat");
    const copy: Pattern = { ...verse, id: newId2, name: `${verse.name} 2`, drums: { ...verse.drums }, notes: { ...verse.notes } };
    const actions: Action[] = [{ type: "patchProject", patch: { patterns: [...p.patterns, copy] } }, ...energize(p, copy).filter((x) => x.type !== "selectPattern")];
    if (secondSection) {
      for (const c of p.arrangement.clips.filter((c) => c.start >= secondSection.start && c.start < secondSection.start + secondSection.length && c.patternId === verse.id)) actions.push({ type: "updateClip", clipId: c.id, patch: { patternId: newId2 } });
    }
    actions.push({ type: "selectPattern", patternId: newId2 });
    return {
      topic: "verse2",
      text: [
        "Le 2e couplet doit évoluer sans changer d'identité : garder la même 808 et les mêmes accords, mais varier la rythmique.",
        "Idées concrètes : rolls de hi-hats en fin de mesure, nouvelles percs, un clap sur la snare, une contre-mélodie discrète, ou couper le kick sur la 1re mesure (« drop » qui relance).",
        secondSection ? `Le pattern sera remplacé sur la section « ${secondSection.name} » (mesures ${secondSection.start + 1}–${secondSection.start + secondSection.length}).` : "Aucune section « Verse 2 » dans l'arrangement : le nouveau pattern sera créé, à placer sur la timeline.",
      ],
      suggestions: [{ label: "Créer « Verse 2 » plus énergique", detail: "Copie du couplet + rolls, percs, clap, contre-mélodie.", actions }],
    };
  }
  // --- key detection
  if (has(q, "tonalité", "tonalite", "key", "gamme", "scale")) {
    if (!a.detected) return { topic: "key", text: ["Pas assez de notes pour détecter une tonalité : écrivez au moins quelques mesures de mélodie ou d'accords."], suggestions: [] };
    const same = a.detected.key.root === p.key.root && a.detected.key.scale === p.key.scale;
    return {
      topic: "key",
      text: [`Tonalité la plus probable : ${keyLabel(a.detected.key)} (confiance ${(a.detected.confidence * 100).toFixed(0)} %).`, `Tonalité du projet : ${keyLabel(p.key)}${same ? " — cohérent." : "."}`, a.outOfKeyMelody.length ? `${a.outOfKeyMelody.length} note(s) mélodiques sont hors de la gamme du projet.` : "Toutes les notes mélodiques sont dans la gamme du projet."],
      suggestions: same ? [] : [{ label: `Régler le projet en ${keyLabel(a.detected.key)}`, detail: "SCALE LOCK et AUTO PITCH utiliseront cette tonalité.", actions: [{ type: "setKey", key: a.detected.key }] }],
    };
  }
  // --- structure
  if (has(q, "structure", "arrangement", "arranger", "organiser", "plan")) {
    const pats = p.patterns;
    const pick = (re: RegExp, i: number) => pats.find((x) => re.test(x.name)) ?? pats[Math.min(i, pats.length - 1)];
    const layout: [string, Pattern, number][] = [
      ["Intro", pick(/intro/i, 0), 4], ["Verse 1", pick(/verse|couplet/i, 0), 16], ["Chorus", pick(/chorus|refrain|hook/i, 0), 8],
      ["Verse 2", pick(/verse 2|couplet 2/i, 0) ?? pick(/verse|couplet/i, 0), 16], ["Chorus", pick(/chorus|refrain|hook/i, 0), 8],
      ["Bridge", pick(/bridge|pont/i, 0), 8], ["Chorus", pick(/chorus|refrain|hook/i, 0), 8], ["Outro", pick(/outro/i, 0), 4],
    ];
    const actions: Action[] = [{ type: "removeClips", ids: p.arrangement.clips.map((c) => c.id) }, ...p.arrangement.sections.map((s): Action => ({ type: "removeSection", sectionId: s.id }))];
    let bar = 0;
    const colors: Record<string, string> = { Intro: "#64748b", Verse: "#2563eb", Chorus: "#db2777", Bridge: "#d97706", Outro: "#475569" };
    for (const [name, pat, len] of layout) {
      actions.push({ type: "addSection", section: { name, start: bar, length: len, color: colors[name.split(" ")[0]] ?? "#7c5cff" } });
      actions.push({ type: "addClip", clip: { patternId: pat.id, lane: 0, start: bar, length: len } });
      bar += len;
    }
    return {
      topic: "structure",
      text: [
        "Structure rap classique (≈ 3 min à 140 BPM) : Intro 4 · Couplet 16 · Refrain 8 · Couplet 16 · Refrain 8 · Pont 8 · Refrain 8 · Outro 4 mesures.",
        `Votre arrangement actuel : ${a.songBars ? `${a.songBars} mesures, ${p.arrangement.sections.length} section(s)` : "vide"}.`,
        "Conseils : le refrain doit être le moment le plus dense ; enlevez la 808 ou le kick 1 mesure avant le refrain pour créer de la tension.",
      ],
      suggestions: pats.length ? [{ label: "Construire cette structure avec mes patterns", detail: "Remplace l'arrangement actuel (annulable avec Ctrl+Z).", actions }] : [],
    };
  }
  // --- vocals / mix
  if (has(q, "voix", "vocal", "voice", "mix", "mixage", "niveau", "level")) {
    return {
      topic: "mix",
      text: [
        a.vocalSec ? `Voix sur la timeline : ${a.vocalSec.toFixed(0)} s.` : "Pas encore de voix sur la timeline.",
        "Pour un diagnostic chiffré (niveaux, LUFS, balance tonale, clipping, stéréo), lancez l'AI MIX ASSISTANT dans l'onglet AI : il fait un vrai rendu du morceau et propose des corrections à prévisualiser puis appliquer.",
        "Chaîne vocale recommandée : AUTO VOICE dans VOCALS analyse votre prise et règle nettoyage, EQ, de-esser, compression et correction de pitch.",
      ],
      suggestions: [],
    };
  }
  // --- fallback: project overview
  const busiest = [...a.per].sort((x, y) => y.energy - x.energy)[0];
  const text = [
    `Projet : ${p.bpm} BPM, ${keyLabel(p.key)}, ${p.patterns.length} pattern(s), arrangement de ${a.songBars} mesure(s), ${a.vocalSec.toFixed(0)} s de voix.`,
    busiest ? `Pattern le plus énergique : « ${busiest.pattern.name} » (${busiest.layers} couches).` : "",
    a.outOfKey808.length ? `⚠ ${a.outOfKey808.length} note(s) de 808 hors gamme.` : "",
    "Je peux aider sur : énergie du refrain, 808 vs mélodie, 2e couplet, tonalité, structure, voix et mix. Exemple : « Mon refrain manque d'énergie ».",
  ].filter(Boolean);
  void harmonyKey;
  return { topic: "overview", text, suggestions: [] };
}

/** Text summary of the project sent to a remote AI (only with explicit user consent). */
export function projectSummaryForRemote(p: Project): string {
  const a = analyzeProject(p);
  return JSON.stringify({
    bpm: p.bpm,
    key: keyLabel(p.key),
    swing: p.swing,
    patterns: a.per.map((s) => ({ name: s.pattern.name, bars: s.pattern.stepCount / 16, drumHits: s.drumHits, notes: s.noteCount, layers: s.layers })),
    instruments: p.instruments.map((i) => ({ name: i.name, preset: i.preset })),
    sections: p.arrangement.sections.map((s) => ({ name: s.name, start: s.start + 1, bars: s.length })),
    vocals: p.vocals.map((v) => ({ name: v.name, takes: v.takes.length, secondsOnTimeline: Math.round(v.clips.reduce((s, c) => s + c.duration, 0)) })),
    outOfKey808Notes: a.outOfKey808.length,
  });
}
