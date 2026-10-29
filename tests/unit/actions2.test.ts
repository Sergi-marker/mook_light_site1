// © la triche — Animots
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore — modules JavaScript de l'application Animots (sans types).
import { parseScript, detectAction, resolveTag } from "../../video-studio/js/script.js";
// @ts-ignore
import { ACTIONS, ACTION_LABELS, DUO_ACTIONS, poseAt, skeleton } from "../../video-studio/js/poses.js";
// @ts-ignore
import { drawSetBehind, drawSetFront } from "../../video-studio/js/scenery.js";

const NEW_DUO = ["betray", "gossip", "trust", "handshake", "promise", "gift", "propose", "kiss", "comfort", "reject", "fight", "forgive", "dance", "confront", "friends"];
const NEW_SOLO = [
  "shock", "doubt", "proud", "scared", "hide", "pray", "hope", "facepalm", "nod", "refuse", "bow", "apologize", "wakeup", "dizzy", "jealous", "sick", "scheme", "eavesdrop",
  "work", "study", "teach", "cook", "eat", "coffee", "drive", "travel", "bike", "shopping", "clean", "money", "late", "knock", "selfie", "sing", "guitar", "paint",
  "plant", "peak", "swim", "fish", "applause", "graduate", "birthday", "grave", "freedom", "trapped", "announce",
];
const TIMES = [0, 0.1, 0.5, 1, 2, 3.3, 5, 8, 12];

test("nouvelles actions : au moins 40, toutes avec trois libellés", () => {
  assert.ok(NEW_DUO.length + NEW_SOLO.length >= 40);
  for (const id of [...NEW_DUO, ...NEW_SOLO]) assert.ok(ACTIONS[id], id);
  for (const id of Object.keys(ACTIONS)) {
    const l = ACTION_LABELS[id];
    assert.ok(Array.isArray(l) && l.length === 3 && l.every((s: string) => typeof s === "string" && s.length > 0), `libellés ${id}`);
  }
  for (const id of NEW_DUO) assert.ok(DUO_ACTIONS.has(id), `duo ${id}`);
  for (const id of NEW_SOLO) assert.ok(!DUO_ACTIONS.has(id), `solo ${id}`);
});

test("toutes les actions : nombres finis à tout instant, rôles 0 et 1, plusieurs écarts", () => {
  for (const id of Object.keys(ACTIONS)) {
    for (const gap of [0.53, 0.765, 1.24]) {
      for (const t of TIMES) {
        for (const role of [0, 1]) {
          const p = poseAt(id, t, 0.37, role, gap);
          for (const [k, v] of Object.entries(p)) if (typeof v === "number") assert.ok(Number.isFinite(v), `${id} ${k} @${t} r${role}`);
          const sk = skeleton(p, {});
          for (const pt of Object.values(sk)) if (Array.isArray(pt)) assert.ok(pt.every(Number.isFinite), `${id} squelette @${t}`);
        }
      }
    }
  }
});

test("à deux : les mains se rejoignent (poignée de main, danse) quel que soit l'écart", () => {
  for (const gap of [0.53, 0.765, 1.24]) {
    for (const id of ["handshake", "dance"]) {
      const t = 1.5;
      const a = poseAt(id, t, 0.5, 0, gap), b = poseAt(id, t + 0.37, 0.5, 1, gap);
      const ha = skeleton(a, {}).handF, hb = skeleton(b, {}).handF;
      // Le second personnage est placé à `gap` et regarde vers l'autre (miroir).
      const xa = a.dx + ha[0], xb = gap - b.dx - hb[0];
      assert.ok(Math.abs(xa - xb) < 0.06, `${id} écart ${gap} : ${xa.toFixed(3)} / ${xb.toFixed(3)}`);
    }
  }
});

test("vélo et nage : le corps ne monte ni ne descend (point le plus bas constant)", () => {
  for (const id of ["bike", "swim"]) {
    const heights: number[] = [];
    for (let t = 0; t < 3; t += 0.07) {
      const p = poseAt(id, t, 0.5);
      const sk = skeleton(p, {});
      let low = Math.max(sk.footF[1], sk.footB[1], sk.kneeF[1], sk.kneeB[1]);
      if (p.rot) low = Math.max(low, sk.handF[1], sk.handB[1], sk.elbowF[1], sk.elbowB[1], sk.headC[1] + sk.headR, sk.shoulder[1] + 0.05);
      heights.push(low + p.lift);
    }
    assert.ok(Math.max(...heights) - Math.min(...heights) < 0.02, `${id} : ${Math.min(...heights)}..${Math.max(...heights)}`);
  }
});

test("détection des nouvelles animations (français, allemand, anglais, espagnol)", () => {
  const cases: [string, string][] = [
    ["Il m'a trahi.", "betray"], ["Quelle trahison !", "betray"], ["He betrayed me.", "betray"], ["Er hat mich verraten.", "betray"], ["Fue una traición.", "betray"],
    ["Elle parlait dans mon dos.", "gossip"], ["They talk behind my back.", "gossip"], ["Er lästert über mich.", "gossip"],
    ["Il avait confiance en lui.", "trust"], ["I trust you.", "trust"], ["Ich vertraue dir.", "trust"],
    ["Une poignée de main.", "handshake"], ["They shook hands.", "handshake"], ["Ein Handschlag genügt.", "handshake"],
    ["Je te le promets.", "promise"], ["I promise.", "promise"], ["Ich verspreche es dir.", "promise"],
    ["Il lui offre un cadeau.", "gift"], ["A gift for you.", "gift"], ["Ein Geschenk für dich.", "gift"],
    ["Veux-tu m'épouser ?", "propose"], ["Will you marry me?", "propose"], ["Ein Heiratsantrag.", "propose"],
    ["Un bisou sur la joue.", "kiss"], ["A kiss on the cheek.", "kiss"], ["Ein Kuss.", "kiss"],
    ["Il la console.", "comfort"], ["She comforts him.", "comfort"], ["Er tröstet sie.", "comfort"],
    ["Elle le repousse.", "reject"], ["She rejected him.", "reject"], ["Er wurde abgewiesen.", "reject"],
    ["Ils se sont battus.", "fight"], ["A huge brawl.", "fight"], ["Eine Schlägerei.", "fight"],
    ["Je te pardonne.", "forgive"], ["I forgive you.", "forgive"], ["Ich verzeihe dir.", "forgive"],
    ["Ils dansent ensemble.", "dance"], ["Let's dance.", "dance"], ["Wir tanzen.", "dance"],
    ["Voici la preuve.", "confront"], ["Here is the proof.", "confront"], ["Hier ist der Beweis.", "confront"],
    ["C'était son meilleur ami.", "friends"], ["My best friend.", "friends"], ["Mein bester Freund.", "friends"],
    ["Il a découvert la vérité.", "shock"], ["I was shocked.", "shock"], ["Ich war schockiert.", "shock"],
    ["C'est le doute qu'elle laisse.", "doubt"], ["I doubt it.", "doubt"], ["Der Zweifel bleibt.", "doubt"],
    ["Tu sais ce que tu vaux.", "proud"], ["Know your worth.", "proud"], ["Ich bin stolz auf dich.", "proud"],
    ["Il est terrifié.", "scared"], ["I saw a ghost.", "scared"], ["Ein Monster!", "scared"],
    ["Il se cache.", "hide"], ["She is hiding.", "hide"], ["Er versteckt sich.", "hide"],
    ["Il prie chaque soir.", "pray"], ["I pray for you.", "pray"], ["Ich bete für dich.", "pray"],
    ["Garde espoir.", "hope"], ["I hope so.", "hope"], ["Ich hoffe es.", "hope"],
    ["Sérieusement ?", "facepalm"], ["Seriously?", "facepalm"], ["Nicht im Ernst!", "facepalm"],
    ["Oui, bien sûr.", "nod"], ["Yes, of course.", "nod"], ["Ja, genau.", "nod"],
    ["Hors de question.", "refuse"], ["No way.", "refuse"], ["Auf keinen Fall.", "refuse"],
    ["Merci beaucoup.", "bow"], ["Thank you.", "bow"], ["Danke schön.", "bow"],
    ["Je suis désolé.", "apologize"], ["I'm sorry.", "apologize"], ["Es tut mir leid.", "apologize"],
    ["Le réveil sonne.", "wakeup"], ["I woke up late.", "wakeup"], ["Er wacht auf.", "wakeup"],
    ["J'ai le vertige.", "dizzy"], ["I feel dizzy.", "dizzy"], ["Mir ist schwindelig.", "dizzy"],
    ["Il est jaloux.", "jealous"], ["She is jealous.", "jealous"], ["Er ist eifersüchtig.", "jealous"],
    ["Je suis malade.", "sick"], ["I have a fever.", "sick"], ["Ich bin krank.", "sick"],
    ["Il prépare sa vengeance.", "scheme"], ["Sweet revenge.", "scheme"], ["Er will Rache.", "scheme"],
    ["Il écoute aux portes.", "eavesdrop"], ["She overheard everything.", "eavesdrop"], ["Er lauscht an der Wand.", "eavesdrop"],
    ["Il travaille sur son ordinateur.", "work"], ["Back to the office.", "work"], ["Ich gehe zur Arbeit.", "work"],
    ["Elle révise ses examens.", "study"], ["I study every night.", "study"], ["Ich lerne für die Prüfung.", "study"],
    ["Le professeur explique.", "teach"], ["The teacher explains.", "teach"], ["Der Lehrer erklärt.", "teach"],
    ["Il fait la cuisine.", "cook"], ["She cooks dinner in the kitchen.", "cook"], ["Ich koche gern.", "cook"],
    ["J'ai faim, on va manger.", "eat"], ["I'm hungry.", "eat"], ["Wir essen zusammen.", "eat"],
    ["Un café, s'il vous plaît.", "coffee"], ["A cup of coffee.", "coffee"], ["Ein Kaffee.", "coffee"],
    ["Il conduit sa voiture.", "drive"], ["She drives to work.", "drive"], ["Er fährt Auto.", "drive"],
    ["Il fait sa valise.", "travel"], ["We travel the world.", "travel"], ["Wir machen Urlaub.", "travel"],
    ["Il fait du vélo.", "bike"], ["I ride my bike.", "bike"], ["Er fährt Fahrrad.", "bike"],
    ["Elle fait les magasins.", "shopping"], ["Let's go shopping.", "shopping"], ["Wir gehen einkaufen.", "shopping"],
    ["Il fait le ménage.", "clean"], ["Clean your room.", "clean"], ["Er putzt die Küche.", "clean"],
    ["Il gagne beaucoup d'argent.", "money"], ["Money talks.", "money"], ["Viel Geld.", "money"],
    ["Je suis en retard !", "late"], ["Hurry up!", "late"], ["Ich bin zu spät.", "late"],
    ["Toc toc, il frappe à la porte.", "knock"], ["Someone knocks.", "knock"], ["Es klopft.", "knock"],
    ["Un petit selfie.", "selfie"], ["Take a picture.", "selfie"], ["Ein Foto.", "selfie"],
    ["Elle chante au micro.", "sing"], ["Sing a song.", "sing"], ["Wir singen.", "sing"],
    ["Il joue de la guitare.", "guitar"], ["He plays guitar.", "guitar"], ["Sie spielt Gitarre.", "guitar"],
    ["Elle peint un tableau.", "paint"], ["She paints.", "paint"], ["Er malt gern.", "paint"],
    ["Il arrose ses fleurs.", "plant"], ["Water the plants.", "plant"], ["Die Blumen im Garten.", "plant"],
    ["Au sommet de la montagne.", "peak"], ["Climb the mountain.", "peak"], ["Auf dem Berg.", "peak"],
    ["Il nage dans la mer.", "swim"], ["Let's swim.", "swim"], ["Wir schwimmen.", "swim"],
    ["Il va à la pêche.", "fish"], ["Gone fishing.", "fish"], ["Er angelt.", "fish"],
    ["Le public applaudit.", "applause"], ["Big applause!", "applause"], ["Viel Applaus.", "applause"],
    ["Il a eu son diplôme.", "graduate"], ["She graduated.", "graduate"], ["Mein Abschluss.", "graduate"],
    ["Joyeux anniversaire !", "birthday"], ["Happy birthday!", "birthday"], ["Alles Gute zum Geburtstag!", "birthday"],
    ["Devant la tombe de son père.", "grave"], ["At the funeral.", "grave"], ["Auf dem Friedhof.", "grave"],
    ["Enfin la liberté.", "freedom"], ["Break free.", "freedom"], ["Endlich Freiheit.", "freedom"],
    ["Prisonnier de ses pensées.", "trapped"], ["Trapped in a cage.", "trapped"], ["Gefangen im Käfig.", "trapped"],
    ["J'ai une annonce à faire.", "announce"], ["Big announcement.", "announce"], ["Er verkündet es.", "announce"],
    ["Son cœur s'est brisé.", "heartbreak"], ["Et il s'est relevé.", "rise"],
  ];
  const wrong = cases.filter(([text, id]) => detectAction(text) !== id).map(([text, id]) => `${text} → ${detectAction(text)} (attendu ${id})`);
  assert.deepEqual(wrong, []);
  // Pas de faux positifs dans des mots qui en contiennent d'autres.
  for (const [text, not] of [
    ["Je développe mon projet.", "bike"], ["Er hatte angefangen zu gehen.", "trapped"], ["A great idea.", "eat"], ["Il est dans la chambre.", "bike"],
    ["Ton personnage principal.", "swim"], ["Ich habe es vergessen.", "eat"], ["Three years later.", "late"], ["Adiós.", "pray"], ["Regarde les étoiles.", "paint"],
  ] as [string, string][]) assert.notEqual(detectAction(text), not, text);
  assert.equal(resolveTag("trahison"), "betray");
  assert.equal(resolveTag("cadeau"), "gift");
  assert.equal(resolveTag("vélo"), "bike");
  assert.equal(resolveTag("Bagarre"), "fight");
});

test("texte « trahison » : animations variées et adaptées à chaque phrase", () => {
  const text = `Il avait confiance en lui. C'était son meilleur ami.
Ils partageaient tout : les rires, les secrets, les rêves.
Un jour, il a découvert la vérité. Son ami parlait dans son dos.
Son cœur s'est brisé.
Le plus dur dans la trahison, ce n'est pas la douleur. C'est le doute qu'elle laisse.
Alors il a tourné le dos et il est parti.
Puis il a compris une chose : celui qui te trahit montre qui il est, pas ce que tu vaux.
Et il s'est relevé.`;
  const acts = parseScript(text).map((s: any) => s.action);
  assert.deepEqual(acts, ["trust", "friends", "highfive", "shock", "gossip", "heartbreak", "betray", "doubt", "leave", "proud", "proud", "rise"]);
  for (let i = 2; i < acts.length; i++) assert.ok(!(acts[i] === acts[i - 1] && acts[i] === acts[i - 2]), "3 fois la même animation");
  for (const a of acts) assert.ok(!["think", "walk", "idle"].includes(a), a);
});

/** Faux contexte 2D : enregistre les appels et vérifie que toutes les coordonnées sont des nombres finis. */
function fakeCtx(bad: string[]) {
  const grad = { addColorStop() {} };
  const target: any = { canvas: { width: 1080, height: 1920 } };
  return new Proxy(target, {
    get(o, k: string) {
      if (k in o) return o[k];
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad;
      if (k === "measureText") return (s: string) => ({ width: s.length * 10 });
      return (...args: any[]) => {
        for (const a of args) if (typeof a === "number" && !Number.isFinite(a)) bad.push(`${k}(${args.join(",")})`);
        if ((k === "arc" || k === "ellipse") && args.slice(2, k === "arc" ? 3 : 4).some((r) => r < 0)) bad.push(`${k} rayon négatif`);
      };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}

test("décors : chaque décor se dessine sans erreur ni coordonnée invalide", () => {
  const sets = new Set<string>();
  for (const id of Object.keys(ACTIONS)) for (const t of TIMES) for (const role of [0, 1]) { const s = poseAt(id, t, 0.4, role).set; if (s) sets.add(s); }
  assert.ok(sets.size >= 40, `${sets.size} décors`);
  const H = 480;
  for (const id of Object.keys(ACTIONS)) {
    for (const t of TIMES) {
      for (const d of [1, -1]) {
        for (const role of [0, 1]) {
          const p = { ...poseAt(id, t, 0.4, role), dir: d };
          if (!p.set) continue;
          const sk = skeleton(p, {});
          const J: any = { h: H, d, headR: sk.headR * H, base: [540, 1300] };
          for (const k of ["hip", "neck", "shoulder", "headC", "elbowF", "handF", "elbowB", "handB", "kneeF", "footF", "kneeB", "footB"]) J[k] = [540 + sk[k][0] * H, 1200 + sk[k][1] * H];
          const bad: string[] = [];
          const ctx = fakeCtx(bad);
          drawSetBehind(ctx, p, J, t);
          drawSetFront(ctx, p, J, t);
          assert.deepEqual(bad, [], `${id} (${p.set}) @${t} d=${d}`);
        }
      }
    }
  }
});
