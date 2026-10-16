// AI PRODUCER COMMANDS (local, offline): plain-language edits in French or English, several in
// one sentence — « plus de basse et change le piano en guitare », « tempo 140 », « kit afro »,
// « plus de reverb sur la voix », « coupe les percs », « passe en la mineur »…
// Each understood part becomes ordinary reducer actions (one undo step); parts that are not
// understood are reported, never guessed silently.

import { DRUM_KITS } from "../drumSamples.ts";
import { NOTE_NAMES, snapToScale, type Key, type ScaleId } from "../music.ts";
import { BUS_DRUMS, currentPattern, getChannel } from "../project.ts";
import { energize } from "./assistant.ts";
import type { Action } from "../reducer.ts";
import { SOUND_LIBRARY, soundParams } from "../soundLibrary.ts";
import type { InstrumentKind, InstrumentTrack, Project } from "../types.ts";

export interface CommandResult {
  actions: Action[];
  /** What was done, one line per understood command (French). */
  done: string[];
  /** Parts of the sentence that were not understood. */
  notUnderstood: string[];
  /** Library sounds put on instruments (for the producer memory). */
  soundChanges: { trackId: string; soundId: string }[];
}

/** Lower case, no accents, single spaces. */
export function normalize(text: string): string {
  return ` ${text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ").replace(/[^a-z0-9#+\-.,; ]/g, " ").replace(/\s+/g, " ").trim()} `;
}

// --- targets -------------------------------------------------------------------------------

interface Target { id: string; label: string }

const DRUM_WORDS: [RegExp, InstrumentKind, string][] = [
  [/\b(kick|grosse caisse|kicks)\b/, "kick", "kick"],
  [/\b(snare|caisse claire|snares)\b/, "snare", "snare"],
  [/\b(clap|claps|snap|snaps)\b/, "clap", "clap"],
  [/\b(hi ?hats?|charleys?|hats?|charley ferme|hihats?)\b/, "closedHat", "charleys"],
  [/\b(open ?hats?|charley ouvert)\b/, "openHat", "open hat"],
  [/\b(percs?|percussions?|congas?|shakers?)\b/, "perc", "percussions"],
];

/** Mixer channel targeted by the words of a command part. */
function findTargets(p: Project, t: string): Target[] {
  const out: Target[] = [];
  const add = (id: string | undefined, label: string) => { if (id && !out.some((x) => x.id === id)) out.push({ id, label }); };
  const insByName = (re: RegExp) => p.instruments.find((i) => re.test(normalize(i.name)));
  if (/\b(808|basse|bass|log drum|sub)\b/.test(t)) add((insByName(/808|bass|basse|log drum/) ?? p.instruments.find((i) => i.preset === "808" || i.preset === "bass"))?.id, "basse / 808");
  if (/\b(melodie|melody|lead|mélodie)\b/.test(t)) add(insByName(/melody|melodie|lead/)?.id, "mélodie");
  if (/\b(accords?|chords?|nappes?|pad)\b/.test(t)) add(insByName(/chord|accord|pad/)?.id, "accords");
  if (/\b(voix|vocals?|voice|chant|lead vocal)\b/.test(t)) for (const v of p.vocals) add(v.id, `voix « ${v.name} »`);
  if (/\b(batterie|drums?|rythmique)\b/.test(t)) add(BUS_DRUMS, "batterie");
  for (const [re, kind, label] of DRUM_WORDS) if (re.test(t)) add(p.tracks.find((x) => x.instrument === kind)?.id, label);
  // An instrument named in the sentence (piano, guitare…) — by track name or current sound.
  for (const ins of p.instruments) {
    const n = normalize(ins.name).trim();
    if (n.length > 2 && t.includes(` ${n} `)) add(ins.id, ins.name);
  }
  return out;
}

// --- sounds --------------------------------------------------------------------------------

/** Words → sound library id (first match wins; specific words before generic ones). */
const SOUND_WORDS: [RegExp, string][] = [
  [/\bguitare? (espagnole|nylon|classique)|spanish guitar|nylon\b/, "guitar-nylon"],
  [/\bguitare? (electrique|clean)|electric guitar\b/, "guitar-electric"],
  [/\bguitare? afro|highlife\b/, "afro-guitar"],
  [/\bguitare?s?|guitar\b/, "guitar-acoustic"],
  [/\bpiano droit|upright\b/, "upright"],
  [/\b(dark|sombre) piano|piano (dark|sombre)\b/, "dark-piano"],
  [/\bpiano\b/, "grand"],
  [/\bwurli(tzer)?\b/, "wurli"],
  [/\b(rhodes|piano electrique|e-?piano)\b/, "rnb-rhodes"],
  [/\borgue|organ\b/, "organ"],
  [/\bviolon ?celles?|cellos?\b/, "cello"],
  [/\bviolons?|violins?\b/, "violin"],
  [/\bcordes?|strings?\b/, "strings"],
  [/\bflute|flûte\b/, "flute"],
  [/\bsax(ophone)?\b/, "sax"],
  [/\btrompette|trumpet\b/, "trumpet"],
  [/\b(cuivres?|cor|horns?|brass)\b/, "horns"],
  [/\bkalimba\b/, "kalimba"],
  [/\bmarimba\b/, "marimba"],
  [/\bbalafon\b/, "balafon"],
  [/\bvibraphone|vibes\b/, "vibes"],
  [/\bharpe|harp\b/, "harp"],
  [/\b(cloches?|bells?)\b/, "bells"],
  [/\bglockenspiel|glock\b/, "glock"],
  [/\bchoeurs?|choir\b/, "choir"],
  [/\bpad\b/, "warm-pad"],
  [/\bwhistle|sifflement\b/, "whistle"],
  [/\bcowbell\b/, "cowbell"],
  [/\blog ?drum\b/, "log-drum"],
  [/\bbasse electrique|electric bass\b/, "bass-electric"],
  [/\b808 distordue|808 dist|distorted 808\b/, "808-dist"],
  [/\b808 drill\b/, "808-drill"],
];

function soundIn(t: string): string | null {
  for (const [re, id] of SOUND_WORDS) if (re.test(t)) return id;
  return null;
}

// --- drum kits ---------------------------------------------------------------------------

/** Words → drum kit (specific styles first, « real / acoustic » last). */
const KIT_WORDS: [RegExp, string][] = [
  [/\bamapiano\b/, "amapiano"],
  [/\bafro\w*\b/, "afro"],
  [/\b(dancehall|kompa|konpa|zouk|reggaeton|caraibes?)\b/, "dancehall"],
  [/\b(r ?n ?b|rnb|r and b|organique)\b/, "rnb"],
  [/\b(boom ?bap|old ?school|lo ?fi)\b/, "boombap"],
  [/\b(hybride|hybrid)\b/, "trap-hybrid"],
  [/\b(electronique|electro|808|synthe?|synth|trap|drill)\b/, "synth"],
  [/\b(reelle?s?|acoustiques?|live|vraie?s?|real|acoustic)\b/, "live"],
];

// --- key -----------------------------------------------------------------------------------

// Note names (French and English) followed by a space: « fa# », « sol diese », « si bemol », « Bb ».
const ROOTS: [RegExp, number][] = [
  [/ (do|c)( ?#| diese) /, 1], [/ (re|d) ?(b|bemol) /, 1], [/ (re|d)( ?#| diese) /, 3], [/ (mi|e) ?(b|bemol) /, 3],
  [/ (fa|f)( ?#| diese) /, 6], [/ (sol|g) ?(b|bemol) /, 6], [/ (sol|g)( ?#| diese) /, 8], [/ (la|a) ?(b|bemol) /, 8],
  [/ (la|a)( ?#| diese) /, 10], [/ (si|b) ?(b|bemol) /, 10],
  [/ (do|c) /, 0], [/ (re|d) /, 2], [/ (mi|e) /, 4], [/ (fa|f) /, 5], [/ (sol|g) /, 7], [/ (la|a) /, 9], [/ (si|b) /, 11],
];

function keyIn(t: string, current: Key): Key | null {
  const m = /\b(?:en|in|tonalite|key|gamme)\s+(.{1,24})/.exec(t);
  if (!m) return null;
  const rest = ` ${m[1]} `;
  const scale: ScaleId | null = /\b(mineur|minor|min|m)\b/.test(rest) ? "minor" : /\b(majeur|major|maj)\b/.test(rest) ? "major" : null;
  for (const [re, root] of ROOTS) if (re.test(rest)) return { root, scale: scale ?? current.scale };
  return null;
}

/** Move every melodic note to a new key: shortest transposition, then snapped to the new scale. */
function transposeActions(p: Project, key: Key): Action[] {
  let diff = (((key.root - p.key.root) % 12) + 12) % 12;
  if (diff > 6) diff -= 12;
  const actions: Action[] = [{ type: "setKey", key }];
  for (const pat of p.patterns)
    for (const [trackId, notes] of Object.entries(pat.notes)) {
      const updates = notes.map((n) => ({ id: n.id, pitch: snapToScale(n.pitch + diff, key) })).filter((u, i) => u.pitch !== notes[i].pitch);
      if (updates.length) actions.push({ type: "updateNotes", trackId, patternId: pat.id, updates });
    }
  return actions;
}

// --- main ----------------------------------------------------------------------------------

const DB = (db: number) => 10 ** (db / 20);
const MORE = /\b(plus|more|monte|augmente|booste?|fort|louder|up|davantage|encore)\b/;
const LESS = /\b(moins|less|baisse|diminue|reduis|lower|down|doucement|plus bas|trop fort)\b/;

/**
 * Interpret a sentence. The sentence is split on « et », « puis », « , », « ; », « and », « then »;
 * each part is matched independently.
 */
export function interpretCommand(p: Project, text: string): CommandResult {
  const res: CommandResult = { actions: [], done: [], notUnderstood: [], soundChanges: [] };
  const parts = normalize(text).split(/\b(?:et|puis|ensuite|and|then)\b|[,;.]/).map((s) => s.trim()).filter((s) => s.length > 1);
  let proj = p;
  for (const raw of parts) {
    const t = ` ${raw} `;
    const before = res.actions.length;
    // 1. Tempo
    const bpmNum = /\b(?:tempo|bpm)\s*(?:a|à|de|to|=)?\s*(\d{2,3})\b|\b(\d{2,3})\s*bpm\b/.exec(t);
    if (bpmNum) {
      const bpm = Number(bpmNum[1] ?? bpmNum[2]);
      res.actions.push({ type: "setBpm", bpm });
      res.done.push(`Tempo : ${bpm} BPM.`);
    } else if (/\b(plus (rapide|vite)|accelere|faster|speed up)\b/.test(t)) {
      res.actions.push({ type: "setBpm", bpm: proj.bpm + 5 });
      res.done.push(`Tempo : ${proj.bpm} → ${proj.bpm + 5} BPM.`);
    } else if (/\b(plus lent|ralentis|slower|slow down|moins vite)\b/.test(t)) {
      res.actions.push({ type: "setBpm", bpm: proj.bpm - 5 });
      res.done.push(`Tempo : ${proj.bpm} → ${proj.bpm - 5} BPM.`);
    }
    // 2. Key
    const key = res.actions.length === before ? keyIn(t, proj.key) : null;
    if (key) {
      res.actions.push(...transposeActions(proj, key));
      res.done.push(`Tonalité : ${NOTE_NAMES[key.root]} ${key.scale === "major" ? "majeur" : key.scale === "minor" ? "mineur" : key.scale} (toutes les notes transposées).`);
    }
    // 3. Swing
    if (res.actions.length === before && /\b(swing|groove|shuffle)\b/.test(t)) {
      const s = LESS.test(t) || /\bsans\b/.test(t) ? Math.max(0, proj.swing - 15) : Math.min(60, proj.swing + 15);
      res.actions.push({ type: "setSwing", swing: s });
      res.done.push(`Swing : ${proj.swing} → ${s} %.`);
    }
    // 4. Drum kit
    if (res.actions.length === before && /\b(kit|batterie|drums?)\b/.test(t)) {
      const kitId = KIT_WORDS.find(([re]) => re.test(t))?.[1];
      const kit = DRUM_KITS.find((k) => k.id === kitId);
      if (kit) {
        res.actions.push({ type: "applyDrumKit", kitId: kit.id });
        res.done.push(`Batterie : kit « ${kit.name} ».`);
      }
    }
    // 5. Change a sound: « change le piano en guitare », « mets une flûte sur la mélodie »
    if (res.actions.length === before && /\b(change|remplace|mets?|met|passe|utilise|transforme|swap|replace|use|put|en|par|avec)\b/.test(t)) {
      // The new sound is the one named AFTER « en / par / avec / to / with » when present.
      const after = /\b(?:en|par|avec|to|with|into)\s+(?:une?|des|la|le|l|a|an)?\s*(.+)$/.exec(t);
      const head = after ? ` ${t.slice(0, after.index)} ` : t;
      // Target, by score: a track that actually PLAYS notes (+4) — an empty « Piano » track left
      // from the template must not win over the Melody track playing the piano —, a track whose
      // CURRENT sound is the one named before « en » (+2), a track named / designated (+1).
      const oldSnd = after ? soundIn(head) : null;
      const ref = oldSnd ? soundParams(SOUND_LIBRARY.find((x) => x.id === oldSnd)!) : null;
      const named = new Set([...findTargets(proj, head), ...findTargets(proj, t)].map((x) => x.id));
      const plays = (id: string) => proj.patterns.some((pt) => (pt.notes[id]?.length ?? 0) > 0);
      const sounds = (i: InstrumentTrack) => !!ref && i.preset === ref.preset && (ref.preset !== "sampler" || i.sample === ref.sample);
      const scored = proj.instruments
        .map((i) => ({ i, score: (named.has(i.id) ? 1 : 0) + (sounds(i) ? 2 : 0) + (named.has(i.id) || sounds(i) ? (plays(i.id) ? 4 : 0) : 0) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      const ins = scored[0]?.i;
      const sndId = soundIn(after ? ` ${after[1]} ` : t);
      const snd = sndId ? SOUND_LIBRARY.find((x) => x.id === sndId) : undefined;
      if (ins && snd) {
        const sp = soundParams(snd);
        res.actions.push({ type: "updateInstrument", trackId: ins.id, patch: { preset: sp.preset, synth: sp.synth, bass808: sp.bass808, sample: sp.sample } });
        res.done.push(`« ${ins.name} » joue maintenant : ${snd.name}.`);
        res.soundChanges.push({ trackId: ins.id, soundId: snd.id });
      }
    }
    // 6. Mute / unmute
    if (res.actions.length === before && /\b(coupe|mute|enleve|retire|supprime|sans|remove|unmute|remets|reactive)\b/.test(t)) {
      const on = !/\b(unmute|remets|reactive)\b/.test(t);
      for (const tg of findTargets(proj, t)) {
        if (!getChannel(proj, tg.id)) continue;
        res.actions.push({ type: "updateChannel", channelId: tg.id, patch: { mute: on } });
        res.done.push(`${on ? "Coupé" : "Réactivé"} : ${tg.label}.`);
      }
    }
    // 7. Reverb
    if (res.actions.length === before && /\b(reverb|reverbe|echo|espace|delay)\b/.test(t)) {
      const send = /\b(delay|echo)\b/.test(t) ? "delay" : "reverb";
      const targets = findTargets(proj, t);
      for (const tg of targets.length ? targets : []) {
        const ch = getChannel(proj, tg.id);
        if (!ch) continue;
        const v = Math.round(Math.max(0, Math.min(1, ch.sends[send] + (LESS.test(t) ? -0.15 : 0.15))) * 100) / 100;
        res.actions.push({ type: "updateChannel", channelId: tg.id, patch: { sends: { [send]: v } } });
        res.done.push(`${send === "reverb" ? "Réverbe" : "Delay"} sur ${tg.label} : ${Math.round(ch.sends[send] * 100)} → ${Math.round(v * 100)} %.`);
      }
    }
    // 8. Volume: « plus de basse », « moins de charleys », « monte la voix »
    if (res.actions.length === before && (MORE.test(t) || LESS.test(t))) {
      const less = LESS.test(t) && !/\bpas assez\b/.test(t);
      for (const tg of findTargets(proj, t)) {
        const ch = getChannel(proj, tg.id);
        if (!ch) continue;
        const v = Math.round(Math.max(0, Math.min(1.5, ch.volume * DB(less ? -3 : 3))) * 1000) / 1000;
        res.actions.push({ type: "updateChannel", channelId: tg.id, patch: { volume: v } });
        res.done.push(`${less ? "Moins" : "Plus"} de ${tg.label} (${less ? "−" : "+"}3 dB).`);
      }
    }
    // 9. Energy: « plus d'énergie », « plus de rolls », « plus dynamique »
    if (res.actions.length === before && /\b(energie|energy|rolls?|dynamique|patate|punch|bouge)\b/.test(t) && !LESS.test(t)) {
      const pat = currentPattern(proj);
      res.actions.push(...energize(proj, pat));
      res.done.push(`Plus d'énergie sur « ${pat.name} » : rolls de charleys, open hat, percs, clap sur la snare, contre-mélodie si une piste est libre.`);
    }
    if (res.actions.length === before) res.notUnderstood.push(raw);
    // Later parts see the effect of earlier ones (e.g. « tempo 140 puis plus rapide »).
    for (const a of res.actions.slice(before)) if (a.type === "setBpm") proj = { ...proj, bpm: a.bpm };
  }
  return res;
}

/** Example commands shown to beginners. */
export const COMMAND_EXAMPLES = [
  "plus de basse",
  "change le piano en guitare",
  "mets une flûte sur la mélodie",
  "kit afro",
  "plus de reverb sur la voix",
  "moins de charleys",
  "tempo 140",
  "passe en la mineur",
  "coupe les percs",
  "plus de swing",
];
