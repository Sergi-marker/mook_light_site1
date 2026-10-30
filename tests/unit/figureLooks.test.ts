// © la triche — Animots
// Expressions du visage, vêtements, chapeaux, coiffures et accessoires des personnages : libellés complets
// et dessin sans erreur dans les deux styles (pictogramme et dessin), avec un faux contexte 2D.
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore — modules JavaScript de l'application Animots (sans types).
import { EXPRESSIONS, TOPS, BOTTOMS, HATS, HAIRS, ACCESSORIES, PRESETS, DEFAULT_MORPH, drawFigure, drawSketchFigure } from "../../video-studio/js/figure.js";
// @ts-ignore
import { poseAt, BASE } from "../../video-studio/js/poses.js";

const CHECKED = new Set(["arc", "ellipse", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "arcTo", "rect", "fillRect", "fillText", "translate", "scale"]);

/** Faux contexte 2D : accepte toute méthode / propriété et relève les nombres invalides. */
function fakeContext(bad: string[]) {
  const target: Record<string, any> = {};
  const gradient = { addColorStop() {} };
  return new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key];
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (key === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      if (key === "measureText") return () => ({ width: 1 });
      if (key === "canvas") return { width: 100, height: 100 };
      return (...args: any[]) => {
        if (CHECKED.has(key) && args.some((a) => typeof a === "number" && !Number.isFinite(a))) bad.push(`${key}(${args.join(", ")})`);
      };
    },
    set(t, key: string, v) {
      t[key] = v;
      return true;
    },
  });
}

// Toile hors écran factice : drawFigure (style pictogramme) dessine d'abord dans une toile de travail.
let bad: string[] = [];
(globalThis as any).OffscreenCanvas = class {
  width: number;
  height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext() { return fakeContext(bad); }
};

function draw(style: string, pose: any, morph: any) {
  const ctx = fakeContext(bad);
  if (style === "sketch") drawSketchFigure(ctx, pose, morph, 540, 1500, 420);
  else drawFigure(ctx, pose, morph, 540, 1500, 420);
}

function expectClean(label: string) {
  assert.deepEqual(bad, [], `${label} : nombres invalides`);
  bad = [];
}

test("chaque option a ses trois libellés (FR, DE, EN)", () => {
  for (const [name, list] of Object.entries({ EXPRESSIONS, TOPS, BOTTOMS, HATS, HAIRS, ACCESSORIES })) {
    assert.ok(Object.keys(list as object).length > 0, name);
    for (const [id, labels] of Object.entries(list as Record<string, string[]>)) {
      assert.equal(labels.length, 3, `${name}.${id}`);
      for (const l of labels) assert.ok(typeof l === "string" && l.trim().length > 0, `${name}.${id}`);
    }
  }
  for (const id of ["neutral", "happy", "laugh", "sad", "angry", "surprised", "closed", "talk", "cry", "joy", "shocked", "suspicious", "fear", "disgust", "worried", "proud", "love", "shy", "bored", "determined", "dizzy", "pain", "pensive"]) assert.ok(EXPRESSIONS[id], id);
  for (const id of ["none", "tshirt", "hoodie", "shirt", "dress", "jacket", "suit", "sweater", "tank", "coat", "labcoat", "jersey"]) assert.ok(TOPS[id], id);
  assert.deepEqual(Object.keys(BOTTOMS), ["none", "pants", "shorts", "skirt", "longskirt"]);
  assert.deepEqual(Object.keys(HATS), ["none", "cap", "beanie", "fedora", "crown", "cowboy", "bow"]);
  for (const id of ["none", "short", "long", "bun", "curly", "ponytail", "spiky", "bob", "braids", "mohawk"]) assert.ok(HAIRS[id], id);
  for (const k of Object.keys(ACCESSORIES)) assert.equal(typeof DEFAULT_MORPH[k], "boolean", k);
  assert.equal(DEFAULT_MORPH.shoeColor, "#16161d");
  assert.equal(DEFAULT_MORPH.hat, "none");
});

test("toutes les expressions se dessinent dans les deux styles, peau claire et foncée, en parlant ou non", () => {
  for (const face of [...Object.keys(EXPRESSIONS), "inconnue"]) {
    for (const style of ["clean", "sketch"]) {
      for (const color of ["#f1f1f3", "#45291a"]) {
        for (const speaking of [false, true]) {
          for (const time of [0, 0.37, 2.9]) {
            const pose = { ...BASE, face, speaking, time, mouthOpen: 0.7, mouthShape: speaking ? "A" : null, symbol: face === "sad" ? "tear" : null };
            draw(style, pose, { color, beard: face === "talk", glasses: face === "joy", mustache: face === "laugh" });
            draw(style, { ...pose, dir: -1, look: 0.5 }, { color, eyes: time ? "big" : "lashes" });
          }
          expectClean(`${face} ${style} ${color}`);
        }
      }
    }
  }
});

test("vêtements, chapeaux, coiffures et accessoires se dessinent dans les deux styles", () => {
  const poses = [BASE, poseAt("walk", 0.4), poseAt("pushup", 0.5), poseAt("sit", 1)];
  const morphs: any[] = [];
  for (const top of Object.keys(TOPS)) for (const bottom of Object.keys(BOTTOMS)) morphs.push({ top, bottom, topColor: "#f4f4f6" });
  for (const hat of Object.keys(HATS)) morphs.push({ hat });
  for (const hair of Object.keys(HAIRS)) morphs.push({ hair, color: "#6e4529" });
  for (const k of Object.keys(ACCESSORIES)) morphs.push({ [k]: true, top: "tshirt" });
  morphs.push({ cap: true }, { skirt: true }, { ...Object.fromEntries(Object.keys(ACCESSORIES).map((k) => [k, true])), hat: "cowboy", hair: "braids", top: "coat", bottom: "longskirt", build: 1.6, belly: 1 });
  for (const pr of Object.values(PRESETS) as any[]) morphs.push(pr.morph);
  for (const style of ["clean", "sketch"]) {
    for (const morph of morphs) {
      for (const pose of poses) draw(style, { ...pose, time: 1.3 }, morph);
      expectClean(`${style} ${JSON.stringify(morph)}`);
    }
  }
});

test("nouveaux préréglages : ils utilisent les nouveaux vêtements", () => {
  const all = Object.values(PRESETS).map((p: any) => p.morph);
  assert.ok(all.some((m: any) => m.top === "labcoat"));
  assert.ok(all.some((m: any) => m.hat === "crown"));
  assert.ok(all.some((m: any) => m.bottom === "longskirt"));
  assert.ok(all.some((m: any) => m.backpack));
});
