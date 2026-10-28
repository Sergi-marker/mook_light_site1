// © la triche — Animots
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore — modules JavaScript de l'application Animots (sans types).
// @ts-ignore
import { BACKDROPS, WEATHERS, TIMES_OF_DAY, sceneSetting, sceneFaces } from "../../video-studio/js/renderer.js";
// @ts-ignore
import { timeline } from "../../video-studio/js/script.js";
// @ts-ignore
import { detectPlace, detectWeather, detectExpression, detectTimeOfDay, reactionTo, PLACE_KEYWORDS, EXPRESSION_KEYWORDS, WEATHER_KEYWORDS } from "../../video-studio/js/places.js";

test("lieu déduit du texte en français, allemand, anglais et espagnol", () => {
  const cases: [string, string][] = [
    ["Ce matin, au bureau, mon patron m'appelle.", "office"],
    ["Ich sitze im Büro und warte.", "office"],
    ["At work, nobody listens to me.", "office"],
    ["À l'école, personne ne me parlait.", "classroom"],
    ["Er geht in die Schule.", "classroom"],
    ["Je prépare le dîner dans la cuisine.", "kitchen"],
    ["She is cooking in the kitchen.", "kitchen"],
    ["Wir gehen an den Strand.", "beach"],
    ["Un jour à la plage, face à la mer.", "beach"],
    ["Perdu dans la forêt.", "forest"],
    ["Lost in the forest at night.", "forest"],
    ["Wir wandern im Wald.", "forest"],
    ["En haut de la montagne, le silence.", "mountain"],
    ["Il est à l'hôpital depuis hier.", "hospital"],
    ["Er liegt im Krankenhaus.", "hospital"],
    ["J'attends le bus depuis une heure.", "station"],
    ["Am Bahnhof ist niemand.", "station"],
    ["Ce soir, il monte sur scène pour son premier concert.", "stage"],
    ["Devant sa tombe au cimetière.", "cemetery"],
    ["Auf dem Friedhof ist es still.", "cemetery"],
    ["Mes grands-parents vivent à la campagne, dans une ferme.", "countryside"],
    ["Un astronaute flotte dans l'espace.", "space"],
    ["Sous les étoiles, je pense à toi.", "sky"],
    ["Elle lit à la bibliothèque.", "library"],
    ["Allongé sur le canapé du salon.", "livingroom"],
    ["Dans ma chambre, la nuit.", "room"],
    ["En ville, tout va trop vite.", "city"],
    ["Walking down the street.", "city"],
    ["On se promène au parc.", "park"],
    ["Je vais à la salle de sport.", "gym"],
    ["On boit un verre au café.", "cafe"],
    ["Perdido en el desierto.", "desert"],
    ["En la playa con mis amigos.", "beach"],
  ];
  for (const [text, place] of cases) assert.equal(detectPlace(text), place, text);
});

test("pas de faux lieu dans des phrases neutres", () => {
  for (const text of [
    "Parce que tu le vaux bien.",
    "Je bois un verre d'eau.",
    "Il est en train de manger.",
    "Je vais acheter du pain.",
    "Ferme les yeux et respire.",
    "Tu es un vrai champion.",
    "Ich habe keine Zeit.",
    "Never give up on your dreams.",
    "Le courage, c'est d'avancer.",
    "Merci pour tout.",
  ]) assert.equal(detectPlace(text), null, text);
});

test("météo déduite du texte", () => {
  assert.equal(detectWeather("Il pleut depuis ce matin."), "rain");
  assert.equal(detectWeather("Es regnet schon wieder."), "rain");
  assert.equal(detectWeather("Walking in the rain."), "rain");
  assert.equal(detectWeather("La neige tombe doucement."), "snow");
  assert.equal(detectWeather("Der Schnee ist weiß."), "snow");
  assert.equal(detectWeather("Un orage éclate."), "storm");
  assert.equal(detectWeather("A storm is coming."), "storm");
  assert.equal(detectWeather("Le vent emporte les feuilles."), "leaves");
  assert.equal(detectWeather("Un épais brouillard."), "fog");
  assert.equal(detectWeather("Dichter Nebel am Morgen."), "fog");
  assert.equal(detectWeather("C'est la fête ! Joyeux anniversaire !"), "confetti");
  assert.equal(detectWeather("Happy birthday to you."), "confetti");
  for (const text of ["Il est en train de partir.", "Mon cerveau est fatigué.", "My brain hurts.", "Souvent je pense à toi.", "Je prends le train."]) assert.equal(detectWeather(text), null, text);
});

test("moment de la journée déduit du texte", () => {
  assert.equal(detectTimeOfDay("Cette nuit, je n'ai pas dormi."), "night");
  assert.equal(detectTimeOfDay("Au coucher de soleil."), "sunset");
  assert.equal(detectTimeOfDay("Every morning I run."), "day");
  assert.equal(detectTimeOfDay("Je t'aime."), null);
});

test("expression du visage déduite du texte", () => {
  const cases: [string, string][] = [
    ["Quelle joie de te revoir !", "joy"],
    ["Ich bin so glücklich.", "joy"],
    ["I am so happy today.", "joy"],
    ["Il est étonné par la nouvelle.", "surprised"],
    ["Wow, incroyable !", "surprised"],
    ["Elle est complètement choquée.", "shocked"],
    ["I was shocked.", "shocked"],
    ["Ce type est louche, je suis méfiant.", "suspicious"],
    ["Er ist misstrauisch.", "suspicious"],
    ["J'ai peur du noir.", "fear"],
    ["Ich habe Angst.", "fear"],
    ["I'm scared.", "fear"],
    ["Beurk, quel dégoût !", "disgust"],
    ["Je suis inquiet pour demain.", "worried"],
    ["She is worried about him.", "worried"],
    ["Je suis fier de toi.", "proud"],
    ["Ich bin stolz auf dich.", "proud"],
    ["Il est amoureux d'elle.", "love"],
    ["Elle est timide et rougit.", "shy"],
    ["Je m'ennuie à mourir.", "bored"],
    ["Er langweilt sich.", "bored"],
    ["Je suis déterminé à réussir.", "determined"],
    ["J'ai le vertige.", "dizzy"],
    ["Aïe ! Ça fait mal !", "pain"],
    ["Il est pensif, songeur.", "pensive"],
    ["Elle pleure en silence.", "cry"],
    ["Er weint.", "cry"],
    ["Je suis en colère.", "angry"],
    ["Er ist wütend.", "angry"],
    ["Je suis triste.", "sad"],
    ["Ich bin traurig.", "sad"],
    ["On rigole bien.", "laugh"],
    ["They laugh together.", "laugh"],
    ["Il sourit.", "happy"],
    ["Sie lächelt.", "happy"],
  ];
  for (const [text, expr] of cases) assert.equal(detectExpression(text), expr, text);
  for (const text of ["Il marche vers la porte.", "Le courage, c'est d'avancer.", "Je vais acheter du pain.", "Ich gehe nach Hause.", "We walk to the station.", "Dans ma chambre."]) assert.equal(detectExpression(text), null, text);
});

test("réaction de l'autre personnage", () => {
  assert.equal(reactionTo("sad"), "worried");
  assert.equal(reactionTo("joy"), "happy");
  assert.ok(["shocked", "surprised"].includes(reactionTo("surprised", 1)));
  assert.equal(reactionTo("inconnu"), null);
});

test("tables de mots-clés : tout en minuscules et sans accents", () => {
  for (const table of [PLACE_KEYWORDS, EXPRESSION_KEYWORDS, WEATHER_KEYWORDS])
    for (const [, words] of table) for (const w of words) assert.equal(w, w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""), w);
});

test("décors, météos et moments : libellés en 3 langues, lieux détectés tous dessinables", () => {
  for (const table of [BACKDROPS, WEATHERS, TIMES_OF_DAY])
    for (const [id, label] of Object.entries(table)) {
      assert.equal((label as string[]).length, 3, id);
      for (const l of label as string[]) assert.ok(typeof l === "string" && l.length > 0, id);
    }
  for (const id of ["office", "classroom", "kitchen", "livingroom", "cafe", "city", "beach", "forest", "mountain", "hospital", "station", "stage", "cemetery", "countryside", "space", "library"]) assert.ok(BACKDROPS[id], id);
  for (const [place] of PLACE_KEYWORDS) assert.ok(BACKDROPS[place], place);
  assert.ok(WEATHERS.auto && WEATHERS.none);
});

test("le lieu détecté reste pour les scènes suivantes ; le réglage de la scène et l'image gardent la main", () => {
  const scenes = [
    { id: "1", kind: "scene", text: "Ce matin, au bureau.", action: "idle", seed: 1 },
    { id: "2", kind: "scene", text: "Personne ne me regarde.", action: "idle", seed: 2 },
    { id: "3", kind: "scene", text: "Il pleut sur la plage.", action: "idle", seed: 3 },
    { id: "4", kind: "scene", text: "Je marche.", action: "walk", seed: 4, bg: "forest" },
    { id: "5", kind: "scene", text: "Encore.", action: "walk", seed: 5, weather: "snow" },
  ];
  const tl = timeline(scenes);
  const base = { theme: "nuit", backdrop: "none" };
  const at = (i: number, st: any = base) => sceneSetting(st, scenes[i], tl, i);
  assert.equal(at(0).backdrop, "office");
  assert.equal(at(1).backdrop, "office");
  assert.equal(at(2).backdrop, "beach");
  assert.equal(at(2).weather, "rain");
  assert.equal(at(3).backdrop, "forest");
  assert.equal(at(4).weather, "snow");
  assert.equal(at(0, { ...base, autoPlace: false }).backdrop, "none");
  assert.equal(at(0, { ...base, backdrop: "image" }).backdrop, "image");
  assert.equal(at(2, { ...base, weather: "none" }).weather, null);
  assert.equal(at(0, { ...base, timeOfDay: "sunset" }).tod, "sunset");
});

test("expressions : détectée pour celui qui parle, réaction de l'autre, réglage manuel prioritaire", () => {
  const dlg = { kind: "scene", speaker: 1, seed: 0 };
  assert.deepEqual(sceneFaces(dlg, "sad", "talk", true).faces, ["worried", "sad"]);
  assert.deepEqual(sceneFaces({ ...dlg, expr2: "angry" }, "sad", "talk", true).faces, ["worried", "angry"]);
  assert.deepEqual(sceneFaces({ kind: "scene", seed: 0 }, "joy", "idle", false).faces, ["joy", null]);
  assert.deepEqual(sceneFaces({ kind: "scene", seed: 0 }, "joy", "sleep", false).faces, [null, null]);
  assert.deepEqual(sceneFaces({ kind: "scene", seed: 0, expr: "love" }, null, "sleep", false).faces, ["love", null]);
});
