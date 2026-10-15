import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore — modules JavaScript de l'application Vidéo Studio (sans types).
import { parseScript, detectAction, splitLong, timeline, sceneAt, resolveTag } from "../../video-studio/js/script.js";
// @ts-ignore
import { ACTIONS, poseAt, skeleton, lerpPose, BASE } from "../../video-studio/js/poses.js";

test("une ligne # devient un titre, chaque phrase une scène", () => {
  const s = parseScript("# Mon titre\nTu souris. Pourtant tu rigoles !\nLe silence fait du bruit…");
  assert.equal(s[0].kind, "title");
  assert.equal(s[0].text, "Mon titre");
  assert.deepEqual(s.slice(1).map((x: any) => x.text), ["Tu souris.", "Pourtant tu rigoles !", "Le silence fait du bruit…"]);
  assert.equal(s[2].action, "laugh");
  assert.equal(s[3].action, "alone");
});

test("détection des animations en français, allemand et anglais", () => {
  assert.equal(detectAction("Il pleure en silence"), "cry");
  assert.equal(detectAction("Er weint jeden Abend"), "cry");
  assert.equal(detectAction("You keep laughing"), "laugh");
  assert.equal(detectAction("Va courir tous les matins"), "run");
  assert.equal(detectAction("Ich gehe ins Krafttraining"), "lift");
  assert.equal(detectAction("Il était une fois un roi"), "read");
  // Mots qui contenaient un mot-clé par accident.
  assert.equal(detectAction("Ton calme n'est pas une faiblesse"), "meditate");
  assert.equal(detectAction("Mon copain est là"), null);
  assert.equal(detectAction("Il a du courage"), null);
});

test("[tag] impose l'animation, même traduit ou en anglais", () => {
  const s = parseScript("[rire] Une phrase neutre.\n[sit] Another one.\n[muscu] Encore.");
  assert.deepEqual(s.map((x: any) => x.action), ["laugh", "sit", "lift"]);
  assert.equal(s[0].text, "Une phrase neutre.");
  assert.equal(resolveTag("Lachen"), "laugh");
  assert.equal(resolveTag("inconnu"), null);
});

test("toutes les actions détectées ou aliasées existent", () => {
  const s = parseScript("Je pleure. Je cours. Je lis un livre. J'attends sur le banc. Je médite. Je soulève des haltères.");
  for (const sc of s) assert.ok(ACTIONS[sc.action], sc.action);
});

test("une phrase trop longue est recoupée pour les sous-titres", () => {
  const long = "Parce que certains soirs, quand tout le monde dort, le silence de la chambre devient tellement lourd, que tu repenses à tout ce que tu as perdu en chemin";
  const parts = splitLong(long, 12);
  assert.ok(parts.length >= 2);
  for (const p of parts) assert.ok(p.split(/\s+/).length <= 12, p);
  assert.equal(parts.join(" ").replace(/\s+/g, " "), long);
});

test("aucune phrase sans mot-clé ne laisse la vidéo figée : animations neutres variées", () => {
  const s = parseScript("Un. Deux. Trois. Quatre.");
  assert.ok(new Set(s.map((x: any) => x.action)).size >= 3);
});

test("timeline : durées selon la vitesse de lecture, scène active à l'instant t", () => {
  const s = parseScript("Un deux trois quatre cinq six sept huit neuf dix. Court.");
  const tl = timeline(s, 2);
  assert.equal(tl.items[0].duration, 10 / 2 + 1);
  assert.equal(tl.items[1].duration, 2.2);
  assert.equal(tl.total, 6 + 2.2);
  assert.equal(sceneAt(tl, 0).index, 0);
  assert.equal(sceneAt(tl, 6.1).index, 1);
  assert.ok(Math.abs(sceneAt(tl, 6.1).local - 0.1) < 1e-9);
  // Une durée imposée est respectée.
  assert.equal(timeline([{ ...s[0], duration: 3 }], 2).total, 3);
});

test("chaque animation produit une pose valide (nombres finis) à tout instant", () => {
  for (const id of Object.keys(ACTIONS)) {
    for (const role of [0, 1]) {
      for (const t of [0, 0.2, 1, 3.7, 12]) {
        const p = poseAt(id, t, 0.3, role);
        for (const k of Object.keys(BASE)) if (typeof BASE[k] === "number") assert.ok(Number.isFinite(p[k]), `${id} ${k} t=${t}`);
        const sk = skeleton(p, {});
        for (const pt of [sk.headC, sk.handF, sk.handB, sk.footF, sk.footB]) assert.ok(pt.every(Number.isFinite), id);
      }
    }
  }
});

test("le buste penche du côté où regarde le personnage", () => {
  const right = skeleton({ ...BASE, lean: 0.3, dir: 1 }, {});
  const left = skeleton({ ...BASE, lean: 0.3, dir: -1 }, {});
  assert.ok(right.neck[0] > 0);
  assert.ok(left.neck[0] < 0);
});

test("interpolation entre deux poses", () => {
  const a = { ...BASE, lean: 0 }, b = { ...BASE, lean: 1, face: "sad" };
  assert.equal(lerpPose(a, b, 0.5).lean, 0.5);
  assert.equal(lerpPose(a, b, 0).face, "neutral");
  assert.equal(lerpPose(a, b, 1).face, "sad");
});

test("avec une voix off, chaque scène dure le temps de sa voix (sauf durée imposée)", () => {
  const s = parseScript("Une phrase. Une autre. Une troisième.");
  const tl = timeline([s[0], s[1], { ...s[2], duration: 4 }], 2.4, [2, null, 3]);
  assert.ok(Math.abs(tl.items[0].duration - 2.7) < 1e-9);
  assert.equal(tl.items[0].voiceDur, 2);
  assert.equal(tl.items[1].voiceDur, null);
  assert.equal(tl.items[1].duration, 2.2); // pas encore de voix : vitesse de lecture
  assert.equal(tl.items[2].duration, 4);
});

// @ts-ignore
import { withBrand, plainText, splitSpeaker } from "../../video-studio/js/script.js";
// @ts-ignore
import { captionWords } from "../../video-studio/js/renderer.js";
// @ts-ignore
import { BUILTIN_STYLES, styleFrom, applyStyle, STYLE_KEYS } from "../../video-studio/js/styles.js";

test("dialogues : « Nom : réplique », deux personnages, narrateur en voix off", () => {
  const s = parseScript("Lui : Tu es là ?\nElle : Oui.\nNarrateur : Le temps passe.\nLui : [rire] Enfin !\nElle : Je sais.");
  assert.deepEqual(s.map((x: any) => [x.speaker, x.speakerName, x.text]), [
    [0, "Lui", "Tu es là ?"], [1, "Elle", "Oui."], [undefined, undefined, "Le temps passe."], [0, "Lui", "Enfin !"], [1, "Elle", "Je sais."],
  ]);
  assert.equal(s[0].figures, 2);
  assert.equal(s[3].action, "laugh");
  assert.equal(s[4].action, "speak"); // pas de mot-clé : celui qui parle fait des gestes
});

test("« Règle numéro un : … » n'est pas pris pour un personnage", () => {
  const s = parseScript("Règle numéro un : échauffe-toi.\nRègle numéro deux : bois de l'eau.");
  assert.equal(s[0].speaker, undefined);
  assert.match(s[0].text, /^Règle numéro un/);
  assert.equal(splitSpeaker("Une phrase sans deux-points"), null);
});

test("[pause 2] crée un silence ; *mot* est mis en couleur et lu sans étoiles", () => {
  const s = parseScript("Avant.\n[pause 2]\nLe *grand silence* arrive.");
  assert.equal(s[1].kind, "pause");
  assert.equal(s[1].duration, 2);
  assert.equal(timeline(s, 2.4).items[1].duration, 2);
  assert.equal(plainText(s[2].text), "Le grand silence arrive.");
  assert.deepEqual(captionWords("Le *grand silence* arrive.").map((w: any) => [w.text, w.hot]), [["LE", false], ["GRAND", true], ["SILENCE", true], ["ARRIVE.", false]]);
});

test("accroche et écran de fin ajoutés autour des scènes", () => {
  const s = parseScript("Une phrase.");
  const all = withBrand(s, { hook: "Écoute bien", outro: "Abonne-toi" });
  assert.deepEqual(all.map((x: any) => x.kind), ["hook", "scene", "outro"]);
  assert.equal(withBrand(s, {}).length, 1);
});

test("styles : appliquer puis ré-extraire donne les mêmes réglages", () => {
  const settings: any = { theme: "nuit", hook: "garde-moi" };
  applyStyle(settings, BUILTIN_STYLES.sport.settings);
  assert.equal(settings.theme, "energie");
  assert.equal(settings.captionFont, "anton");
  assert.equal(settings.hook, "garde-moi"); // l'accroche appartient à la vidéo, pas au style
  const st = styleFrom(settings);
  assert.ok(Object.keys(st).every((k) => STYLE_KEYS.includes(k)));
  assert.equal(st.characters[0].top, "tshirt");
});
