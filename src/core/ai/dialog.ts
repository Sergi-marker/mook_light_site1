// OFFLINE PRODUCER CONVERSATION: answers in full sentences, keeps the context of the exchange
// (« encore », « et pour la voix ? », « annule », « non, plutôt une guitare »), understands
// feelings (« c'est trop vide », « on entend pas la voix »), answers questions (« c'est quoi
// une 808 ? », « pourquoi mon refrain est plat ? ») and asks back when it is not sure.
// Without Internet it cannot understand everything a person can say — it says so honestly and
// suggests what it can do. The online mode (Claude) handles free conversation.

import type { Action } from "../reducer.ts";
import type { Project } from "../types.ts";
import { askAssistant } from "./assistant.ts";
import { interpretCommand, normalize } from "./commands.ts";
import { detectStyle, type StyleDef } from "./styles.ts";
import type { VoiceLayerKind } from "./producerTools.ts";

export interface DialogState {
  /** Last command that changed something (for « encore », « pareil pour… »). */
  last?: { text: string; kind: Kind };
  /** A question the producer asked and is waiting an answer for. */
  waiting?: "style";
}

type Kind = "volume+" | "volume-" | "reverb" | "mute" | "sound" | "other";

export interface DialogReply {
  text: string;
  actions: Action[];
  /** Undo this many steps instead of applying actions. */
  undo?: number;
  /** Generate a beat in this style. */
  generate?: { style: StyleDef; prompt: string };
  /** Clickable follow-ups. */
  suggestions: string[];
  /** Optional actions the user can apply with a button (assistant analysis). */
  offers?: { label: string; actions: Action[] }[];
  soundChanges: { trackId: string; soundId: string }[];
  /** Create doubles / harmonies from a vocal track. */
  layers?: { trackId: string; kinds: VoiceLayerKind[] };
  /** Add transition FX (+ drums cut before choruses). */
  transitions?: { drops: boolean };
  /** SAMPLE FLIP: re-flip the chops, back to the original order, or ask for a file (button). */
  flip?: "flip" | "original" | "import";
  /** WRITING help (needs the word list, loaded by the app): rhymes for a word / line end… */
  rhymes?: { target: string };
  /** …or the flow of a text (the given one, else the lyrics of the project). */
  flow?: { text: string };
}

/** Quoted part of a message (« … », "…"), if any. */
const quoted = (text: string) => /[«"“]\s*([^»"”]+?)\s*[»"”]/.exec(text)?.[1] ?? null;
/** Lyrics written in the project (the first vocal track that has some). */
const projectLyrics = (p: Project) => p.vocals.find((v) => v.lyrics?.trim())?.lyrics ?? "";

const has = (t: string, re: RegExp) => re.test(t);
const reply = (text: string, extra: Partial<DialogReply> = {}): DialogReply => ({ text, actions: [], suggestions: [], soundChanges: [], ...extra });

// --- glossary: plain-language answers to beginner questions --------------------------------

const GLOSSARY: [RegExp, string][] = [
  [/\b808\b/, "La 808, c'est la basse grave et longue de la trap et de la drill : à l'origine le kick d'une boîte à rythmes Roland des années 80, accordée comme une note. Elle doit jouer la note de base des accords, sinon ça sonne faux. En drill, elle « glisse » d'une note à l'autre (les slides)."],
  [/\b(bpm|tempo)\b/, "Le BPM, c'est la vitesse du morceau en battements par minute. Trap : 130–150, drill : 140–145, afrobeats : 95–110, amapiano : 110–115, R&B : 60–90. Tu peux me dire « tempo 140 » ou « plus rapide »."],
  [/\bswing|groove|shuffle\b/, "Le swing décale légèrement une note sur deux pour que le rythme « balance » au lieu d'être robotique. Indispensable en afro, en boom bap et en lo-fi. Dis-moi « plus de swing » pour essayer."],
  [/\b(reverb|reverbe)\b/, "La réverbe, c'est l'effet de pièce : elle donne de l'espace et de la profondeur. Un peu sur la voix et les mélodies, presque rien sur la basse et le kick, sinon tout devient flou."],
  [/\bdelay|echo\b/, "Le delay répète le son en écho, calé sur le tempo. Très utilisé sur les fins de phrases et les adlibs."],
  [/\b(gamme|tonalite|cle|key|scale|mineur|majeur)\b/, "La tonalité, c'est l'ensemble des notes qui vont bien ensemble. Mineur = sombre ou triste (la plupart de la trap et de la drill), majeur = joyeux ou lumineux. Je peux changer la tonalité et toutes les notes suivent : « passe en la mineur »."],
  [/\b(hi ?hat|charley|charleys|hats?)\b/, "Les charleys (hi-hats), ce sont les petits « tchik-tchik » rapides. En trap, ils font des rolls (doubles, triples) qui donnent l'énergie ; en drill, ils sont en triolets."],
  [/\b(log ?drum)\b/, "Le log drum, c'est la signature de l'amapiano : une basse courte et percussive qui rebondit d'une note à l'autre et glisse. Il remplace la 808."],
  [/\b(mix|mixage)\b/, "Le mixage, c'est équilibrer les volumes, la place de chaque son (gauche/droite, devant/derrière) et les effets pour que tout s'entende clairement. L'onglet AI MIX ASSISTANT le fait automatiquement, et tu peux me dire « plus de voix », « moins de basse »…"],
  [/\b(master|mastering)\b/, "Le mastering, c'est la dernière étape : il rend le morceau fort et équilibré, au niveau des plateformes de streaming, sans saturer. AI MASTER le fait en un clic."],
  [/\b(sample|sampler)\b/, "Un sample, c'est un extrait audio réutilisé (une boucle, un son de batterie…). Dans BEAT › SAMPLER, tu peux importer tes propres sons et les découper."],
  [/\b(drill)\b/, "La drill, c'est la trap londonienne puis new-yorkaise : 140–145 BPM, charleys en triolets, snare décalée, 808 qui glisse sans arrêt, ambiance sombre."],
  [/\b(amapiano)\b/, "L'amapiano vient d'Afrique du Sud : kick à chaque temps, shakers, log drum qui rebondit, accords de piano jazzy. Dis-moi « fais-moi un amapiano » pour en générer un."],
  [/\b(refrain|hook|chorus)\b/, "Le refrain (hook), c'est la partie qui revient et qu'on retient : elle doit être plus chargée et plus énergique que le couplet. Dis-moi si ton refrain manque d'énergie, je l'analyse."],
  [/\b(autotune|auto ?pitch)\b/, "L'auto-tune corrige la justesse de la voix. Léger, il reste naturel ; à fond (Hard Tune), il donne l'effet robotique de la trap mélodique. Réglages dans VOCALS › AUTO PITCH."],
];

// --- feelings → commands ------------------------------------------------------------------

const FEELINGS: [RegExp, string, string][] = [
  [/\b(trop vide|vide|manque de (patate|energie|punch)|plat|mou|ennuyeux|ca bouge pas|pas assez (d energie|de patate))\b/, "plus d'énergie", "J'ai ajouté de l'énergie sur le pattern affiché : rolls de charleys, open hat, percussions et un clap sur la snare."],
  [/\b(trop charge|trop de trucs|trop rempli|bordel|trop busy)\b/, "moins de charleys et coupe les percs", "J'ai allégé : charleys plus bas et percussions coupées."],
  [/\b(on entend (pas|plus|mal) (la|ma) voix|voix (trop basse|noyee|cachee))\b/, "plus de voix", "J'ai monté la voix de 3 dB pour qu'elle passe devant."],
  [/\b(basse|808) (trop forte|ecrase|trop presente)|trop de basse\b/, "moins de basse", "J'ai baissé la basse de 3 dB."],
  [/\b(pas assez de basse|basse trop faible|on entend pas la basse|plus de grave)\b/, "plus de basse", "J'ai monté la basse de 3 dB."],
  [/\b(plus joyeux|plus gai|plus lumineux|trop triste|trop sombre)\b/, "", ""],
  [/\b(plus triste|plus sombre|plus dark|plus melancolique)\b/, "", ""],
];

const SUGGEST_START = ["fais-moi un beat drill", "c'est trop vide", "plus de basse", "change le piano en guitare", "c'est quoi une 808 ?"];

function kindOf(cmd: string): Kind {
  if (/\b(reverb|reverbe|delay|echo)\b/.test(cmd)) return "reverb";
  if (/\b(coupe|mute|enleve|retire)\b/.test(cmd)) return "mute";
  if (/\b(change|remplace|mets?|met)\b/.test(cmd)) return "sound";
  if (/\b(moins|baisse|diminue)\b/.test(cmd)) return "volume-";
  if (/\b(plus|monte|augmente)\b/.test(cmd)) return "volume+";
  return "other";
}

/** « et pour la voix ? » / « pareil pour les charleys » → the last command applied to a new target. */
function retarget(last: NonNullable<DialogState["last"]>, target: string): string | null {
  switch (last.kind) {
    case "volume+": return `plus de ${target}`;
    case "volume-": return `moins de ${target}`;
    case "reverb": return `plus de reverb sur ${target}`;
    case "mute": return `coupe ${target}`;
    default: return null;
  }
}

/** Natural sentence from the list of things done. */
function sentence(done: string[]): string {
  // « Tempo : 120 BPM. » → « tempo 120 BPM » (labels read better inside a sentence).
  const clean = done.map((d) => d.replace(/\.$/, "").replace(/^([^:«]{2,30}) : /, "$1 "));
  if (clean.length === 1) return `C'est fait : ${lowerFirst(clean[0])}.`;
  return `C'est fait : ${clean.slice(0, -1).map(lowerFirst).join(", ")} et ${lowerFirst(clean[clean.length - 1])}.`;
}
const lowerFirst = (s: string) => (/^[A-ZÉÈ][a-zé]/.test(s) && !/^« /.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

function followUp(kind: Kind): string[] {
  switch (kind) {
    case "volume+": case "volume-": return ["encore un peu", "pareil pour la voix", "annule"];
    case "sound": return ["non, plutôt une flûte", "plus de reverb sur la mélodie", "annule"];
    case "reverb": return ["encore un peu", "moins de reverb", "annule"];
    case "mute": return ["remets-les", "plus d'énergie", "annule"];
    default: return ["c'est trop vide", "plus de basse", "annule"];
  }
}

/**
 * One turn of the offline conversation.
 * @returns the reply and the new dialog state.
 */
export function converse(p: Project, text: string, state: DialogState = {}): { reply: DialogReply; state: DialogState } {
  const t = normalize(text);
  const words = t.trim().split(" ").filter(Boolean);
  const next: DialogState = { ...state };

  // Answer to « quel style ? »
  if (state.waiting === "style") {
    next.waiting = undefined;
    const st = detectStyle(text);
    if (st) return { reply: reply(`Parfait, je te prépare un ${st.label} : ${st.description} Écoute le refrain, et dis-moi ce que tu veux changer.`, { generate: { style: st, prompt: text }, suggestions: ["c'est trop vide", "plus de basse", "change le piano en guitare"] }), state: next };
  }

  if (!words.length) return { reply: reply("Je t'écoute : dis-moi ce que tu veux faire ou ce que tu ressens en écoutant.", { suggestions: SUGGEST_START }), state: next };

  // Greetings, thanks
  if (words.length <= 4 && has(t, /\b(salut|bonjour|bonsoir|hello|yo|wesh|coucou|hey)\b/))
    return { reply: reply("Salut ! Je suis ton producteur. On fait quoi aujourd'hui ? Je peux te générer un beat dans le style que tu veux, ou retoucher celui-là : dis-moi simplement ce que tu entends ou ce que tu voudrais entendre.", { suggestions: SUGGEST_START }), state: next };
  if (words.length <= 5 && has(t, /\b(merci|thanks|cool|parfait|top|nickel|super|c est bon|ca marche|genial)\b/))
    return { reply: reply("Avec plaisir ! Quand tu es prêt, on peut passer à la voix : VOCALS › Test du micro, puis ● REC.", { suggestions: ["c'est quoi le mastering ?", "plus d'énergie", "fais-moi un autre beat"] }), state: next };

  // Undo
  if (has(t, /\b(annule|undo|reviens en arriere|remets comme avant|non pas ca|j aime pas|c est nul|retour en arriere)\b/)) {
    next.last = undefined;
    return { reply: reply("OK, j'ai annulé la dernière modification. Tu veux essayer autre chose ?", { undo: 1, suggestions: ["plus de basse", "change le piano en guitare", "c'est trop vide"] }), state: next };
  }

  // « encore / un peu plus » → repeat the last command
  if (state.last && words.length <= 4 && has(t, /\b(encore|un peu plus|davantage|plus fort|again|continue|vas y)\b/) && !/\b(de|du|des)\b/.test(t)) {
    const r = interpretCommand(p, state.last.text);
    if (r.actions.length) return { reply: reply(`${sentence(r.done)} Dis-moi « stop » ou « annule » si c'est trop.`, { actions: r.actions, soundChanges: r.soundChanges, suggestions: followUp(state.last.kind) }), state: next };
  }

  // « et pour la voix ? » / « pareil pour les charleys »
  const same = /\b(?:et pour|pareil pour|meme chose pour|idem pour|et sur|pareil sur|et)\s+(?:la|le|les|l)?\s*(.+?)\s*$/.exec(t.trim());
  if (state.last && same && words.length <= 6) {
    const cmd = retarget(state.last, same[1]);
    const r = cmd ? interpretCommand(p, cmd) : null;
    if (r && r.actions.length) {
      next.last = { text: cmd!, kind: state.last.kind };
      return { reply: reply(sentence(r.done), { actions: r.actions, soundChanges: r.soundChanges, suggestions: followUp(state.last.kind) }), state: next };
    }
  }

  // « non, plutôt une guitare » → change the last sound changed
  if (state.last?.kind === "sound" && has(t, /\b(plutot|non|finalement|en fait)\b/)) {
    const tail = t.replace(/\b(non|plutot|finalement|en fait|mets|met|une?|des|la|le)\b/g, " ").trim();
    const r = interpretCommand(p, `${state.last.text.split(/\b(?:en|par|avec)\b/)[0]} en ${tail}`);
    if (r.actions.length) {
      next.last = { text: `${state.last.text.split(/\b(?:en|par|avec)\b/)[0]} en ${tail}`, kind: "sound" };
      return { reply: reply(`${sentence(r.done)} Ça te va mieux ?`, { actions: r.actions, soundChanges: r.soundChanges, suggestions: followUp("sound") }), state: next };
    }
  }

  // Writing: rhymes
  if (has(t, /\b(rimes?|rimer|rimant|rime avec|qui rime)\b/) && !has(t, /\b(c est quoi|qu est ce)\b/)) {
    const m = /\b(?:rimes?|rimer|rimant|rime)\s+(?:avec|pour|en|sur|a|à)\s+(.+)$/i.exec(text);
    let target = (quoted(text) ?? m?.[1] ?? "").replace(/[?!.,;:]+$/, "").replace(/^(le mot|la phrase|l'expression)\s+/i, "").trim();
    if (!target) target = projectLyrics(p).trim().split("\n").filter((l) => l.trim() && !/^\[.*\]$/.test(l.trim())).pop()?.split(/\s+/).slice(-2).join(" ") ?? "";
    if (!target) return { reply: reply("Donne-moi le mot ou la fin de phrase : par exemple « trouve des rimes avec nuit » ou « rime avec dans le noir ».", { suggestions: ["trouve des rimes avec nuit", "rime avec dans le noir"] }), state: next };
    return { reply: reply(`Voici des rimes pour « ${target} » — d'abord les multi-syllabes, celles qui sonnent le plus en rap :`, { rhymes: { target }, suggestions: ["analyse mon flow", `rimes en 2 syllabes avec ${target}`] }), state: next };
  }

  // Writing: flow / syllables
  if (has(t, /\b(flow|syllabes?|mon texte|mes paroles|mon couplet|mes lyrics|mes rimes|mon ecriture)\b/) && !has(t, /\b(c est quoi|qu est ce)\b/)) {
    const own = quoted(text);
    const lyrics = own ?? projectLyrics(p);
    if (!lyrics.trim()) return { reply: reply("Je n'ai pas encore tes paroles : écris-les dans VOCALS (sous la piste vocale), une ligne par mesure, ou colle une phrase entre guillemets : « combien de syllabes dans \"j'suis dans le bloc avec mes frères\" ».", { suggestions: ["trouve des rimes avec nuit"] }), state: next };
    return { reply: reply(own ? "Je compte :" : `J'analyse tes paroles à ${p.bpm} BPM, une ligne par mesure :`, { flow: { text: lyrics }, suggestions: ["trouve des rimes", "plus lent", "plus rapide"] }), state: next };
  }

  // Sample flip
  if (has(t, /\b(flip|flips|flippe|flipper|flippes|reflip|chops?|decoupe|decouper|decoupes|sample flip)\b/) && !has(t, /\b(c est quoi|qu est ce)\b/)) {
    const chops = p.tracks.filter((x) => x.chop).length;
    if (!chops || has(t, /\b(nouveau sample|autre sample|importe|importer|charge|charger|un sample|une boucle)\b/)) {
      return { reply: reply("Choisis une boucle (WAV, MP3…) : je détecte son tempo et sa tonalité, je la cale sur ton projet sans changer sa hauteur, je la découpe sur ses attaques et je te fais un premier flip dans BEAT. Utilise un sample libre de droits ou dont tu as l'autorisation.", { flip: "import", suggestions: ["nouveau flip", "ordre d'origine"] }), state: next };
    }
    if (has(t, /\b(origine|original|originale|comme avant|d avant|comme dans la boucle)\b/)) {
      return { reply: reply(`Je remets les ${chops} chops dans l'ordre de la boucle d'origine : tu réentends le sample tel quel, au tempo du projet.`, { flip: "original", suggestions: ["nouveau flip", "annule"] }), state: next };
    }
    return { reply: reply(`Nouveau flip : je réordonne les ${chops} chops sur un autre rythme, le premier chop toujours sur le temps fort. Redemande « nouveau flip » autant que tu veux, ou « annule » pour revenir.`, { flip: "flip", suggestions: ["nouveau flip", "ordre d'origine", "annule"] }), state: next };
  }

  // Transitions
  if (has(t, /\b(transitions?|riser|risers|montee|montees|impact|impacts|whoosh|effets? de transition|fx|sans coupure|avec coupure)\b/) && !has(t, /\b(c est quoi|qu est ce)\b/)) {
    if (!p.arrangement.sections.length) return { reply: reply("Il me faut d'abord la structure du morceau (intro, couplets, refrains) pour savoir où placer les transitions. Tu veux que je te génère un beat complet ?", { suggestions: ["fais-moi un beat trap", "comment structurer mon morceau ?"] }), state: next };
    const drops = !has(t, /\b(sans coupure|sans couper|pas de coupure)\b/);
    return { reply: reply(`J'ajoute les transitions : une montée qui fait monter la tension avant chaque refrain, un impact pile sur le refrain, une descente juste après et une cymbale inversée avant les couplets${drops ? ", et je coupe la batterie et la 808 sur le dernier temps avant chaque refrain pour que l'entrée frappe plus fort" : ""}. Tout est sur la piste « FX / Transitions ».`, { transitions: { drops }, suggestions: ["sans coupure", "annule", "plus d'énergie"] }), state: next };
  }

  // Doubles / harmonies on the recorded voice
  if (has(t, /\b(harmonie|harmonies|choeur|choeurs|chorus vocal|double|doubles|doubler|epaissi|backs?)\b/) && has(t, /\b(voix|vocal|ajoute|fais|met|mets|cree|double|doubler|epaissi)\b/) && !has(t, /\b(c est quoi|qu est ce)\b/)) {
    const v = p.vocals.find((x) => x.clips.length);
    if (!v) return { reply: reply("Pour faire des doubles ou des harmonies, il me faut d'abord ta voix : va dans VOCALS, fais le test du micro puis ● REC. Ensuite redemande-moi, je m'occupe du reste.", { suggestions: ["c'est quoi l'autotune ?", "plus de basse"] }), state: next };
    const kinds: VoiceLayerKind[] = [];
    if (/\b(double|doubles|doubler|epaissi)\b/.test(t)) kinds.push("double");
    if (/\b(harmonie|harmonies|choeur|choeurs|backs?)\b/.test(t)) kinds.push("third-up", ...(/\b(choeur|choeurs|riche|plein)\b/.test(t) ? (["sixth-down"] as VoiceLayerKind[]) : []));
    if (/\bquinte\b/.test(t)) kinds.push("fifth-up");
    if (/\boctave\b/.test(t)) kinds.push("octave-up");
    const what = kinds.map((k) => ({ double: "un double", "third-up": "une harmonie à la tierce au-dessus", "fifth-up": "une quinte", "sixth-down": "une tierce en dessous", "octave-up": "une octave au-dessus", "octave-down": "une octave en dessous" })[k]);
    return { reply: reply(`Je crée ${what.join(" et ")} à partir de « ${v.name} », dans la tonalité du morceau. Les nouvelles pistes sont plus basses et réparties à gauche et à droite : écoute le refrain, et coupe-les (bouton M) pour comparer.`, { layers: { trackId: v.id, kinds }, suggestions: ["plus de reverb sur la voix", "annule", "ajoute une quinte"] }), state: next };
  }

  // Make a beat
  if (has(t, /\b(fais|fait|cree|creer|genere|generer|compose|je veux|donne)\b.*\b(beat|instru|instrumentale?|son|prod|morceau|track)\b|\b(un|une) (beat|instru|prod)\b/)) {
    const st = detectStyle(text);
    if (st) return { reply: reply(`C'est parti pour un ${st.label}. ${st.description} J'ai tout mis dans le projet : écoute le refrain, puis dis-moi ce que tu ressens (« trop vide », « plus de basse », « change le piano »…).`, { generate: { style: st, prompt: text }, suggestions: ["c'est trop vide", "plus de basse", "change le piano en guitare"] }), state: next };
    next.waiting = "style";
    return { reply: reply("Avec plaisir ! Dans quel style ? Par exemple trap, drill UK, love drill, afrobeats, amapiano, R&B, boom bap, kompa, zouk… Tu peux aussi me citer un artiste (« comme Burna Boy »).", { suggestions: ["drill UK", "afrobeats", "amapiano", "trap mélodique", "R&B"] }), state: next };
  }

  // Feelings
  for (const [re, cmd, said] of FEELINGS) {
    if (!re.test(t)) continue;
    if (!cmd) {
      const major = /\b(plus joyeux|plus gai|plus lumineux|trop triste|trop sombre)\b/.test(t);
      const names = ["do", "do#", "re", "re#", "mi", "fa", "fa#", "sol", "sol#", "la", "la#", "si"];
      const c = `passe en ${names[p.key.root]} ${major ? "majeur" : "mineur"}`;
      if ((major && p.key.scale === "major") || (!major && p.key.scale !== "major")) return { reply: reply(major ? "Le morceau est déjà en majeur. Pour plus de lumière, essaie un son plus brillant : « mets des cloches sur la mélodie » ou « mets une guitare »." : "Le morceau est déjà en mineur. Pour plus de noirceur : « change la mélodie en dark piano » ou « mets des cordes sur les accords ».", { suggestions: major ? ["mets des cloches sur la mélodie", "plus rapide"] : ["change la mélodie en dark piano", "plus lent"] }), state: next };
      const r = interpretCommand(p, c);
      return { reply: reply(`${sentence(r.done)} ${major ? "Le majeur rend tout plus lumineux." : "Le mineur rend le morceau plus sombre et émouvant."} Écoute et dis-moi.`, { actions: r.actions, suggestions: ["annule", "plus lent", "plus de reverb sur la mélodie"] }), state: next };
    }
    const r = interpretCommand(p, cmd);
    if (r.actions.length) {
      next.last = { text: cmd, kind: kindOf(cmd) };
      return { reply: reply(`${said} Écoute, et dis-moi si c'est mieux.`, { actions: r.actions, soundChanges: r.soundChanges, suggestions: followUp(kindOf(cmd)) }), state: next };
    }
  }

  // Questions
  const question = text.includes("?") || has(t, /^ ?(pourquoi|comment|c est quoi|qu est ce|quest ce|est ce que|quel|quelle|quels|explique|ca veut dire|why|how|what)\b/);
  if (question) {
    if (has(t, /\b(c est quoi|qu est ce|ca veut dire|explique|definition|what is)\b/))
      for (const [re, answer] of GLOSSARY) if (re.test(t)) return { reply: reply(answer, { suggestions: ["fais-moi un beat drill", "c'est trop vide", "plus de basse"] }), state: next };
    const a = askAssistant(p, text);
    const text2 = a.text.filter(Boolean).join(" ");
    return { reply: reply(text2 || "Je n'ai pas de réponse précise à ça hors ligne. Avec une clé API (PARAMÈTRES › IA), je peux en parler librement.", { offers: a.suggestions.map((s) => ({ label: s.label, actions: s.actions })), suggestions: ["mon refrain manque d'énergie", "ma 808 sonne faux ?", "comment structurer mon morceau ?"] }), state: next };
  }

  // Direct commands (several at once)
  const r = interpretCommand(p, text);
  if (r.actions.length) {
    const first = normalize(text).split(/\b(?:et|puis|ensuite|and|then)\b|[,;.]/).map((x) => x.trim()).filter((x) => x.length > 1).find((part) => interpretCommand(p, part).actions.length) ?? text;
    next.last = { text: first, kind: kindOf(` ${first} `) };
    const missed = r.notUnderstood.length ? ` Par contre, je n'ai pas compris « ${r.notUnderstood.join(" », « ")} » : tu peux le dire autrement ?` : "";
    return { reply: reply(`${sentence(r.done)}${missed}`, { actions: r.actions, soundChanges: r.soundChanges, suggestions: followUp(next.last.kind) }), state: next };
  }

  // Style named alone → generate
  const st = detectStyle(text);
  if (st && words.length <= 5) return { reply: reply(`Tu veux un ${st.label} ? Je le génère : ${st.description}`, { generate: { style: st, prompt: text }, suggestions: ["c'est trop vide", "plus de basse"] }), state: next };

  // Glossary without question mark
  for (const [re, answer] of GLOSSARY) if (re.test(t) && words.length <= 4) return { reply: reply(answer, { suggestions: SUGGEST_START }), state: next };

  return {
    reply: reply("Je ne suis pas sûr de comprendre — hors ligne, je comprends les demandes sur le son (volume, instruments, batterie, tempo, tonalité, énergie) et les questions de base. Tu peux me dire par exemple « c'est trop vide », « plus de basse », « change le piano en guitare » ou « fais-moi un beat afro ». Avec une clé API Anthropic (PARAMÈTRES › IA), je peux parler de tout librement.", { suggestions: SUGGEST_START }),
    state: next,
  };
}
