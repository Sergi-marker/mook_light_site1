// AI PATTERN VARIATIONS: derive a new drum pattern from an existing one (fill, hi-hat rolls,
// half-time, stripped-down intro, busier groove, drop-out). Output = editable steps.

import type { InstrumentKind, Step, Track } from "../types.ts";
import { rng } from "./rng.ts";

export type VariationKind = "fill" | "hatRolls" | "halfTime" | "sparse" | "busy" | "dropout";

export const VARIATIONS: { id: VariationKind; label: string; detail: string }[] = [
  { id: "fill", label: "Fill de fin", detail: "Roulement de snare/clap sur le dernier temps, kick coupé, open hat final — pour annoncer la section suivante." },
  { id: "hatRolls", label: "Hi-hat rolls", detail: "Triolets et rolls ×2/×3/×4 sur les charleys (signature trap)." },
  { id: "halfTime", label: "Half-time", detail: "Snare sur le 3e temps, kick allégé : même tempo, sensation deux fois plus lente." },
  { id: "sparse", label: "Version épurée", detail: "Kick sur les temps forts, moitié moins de charleys — idéal pour une intro ou un début de couplet." },
  { id: "busy", label: "Plus chargé", detail: "Ghost notes de kick et percussions, charleys en doubles-croches — pour un refrain." },
  { id: "dropout", label: "Drop-out (break)", detail: "Retire kick et 808 : le break juste avant le refrain." },
];

const lane = (drums: Record<string, Step[]>, tracks: Track[], kind: InstrumentKind) => {
  const t = tracks.find((x) => x.instrument === kind);
  return t ? { id: t.id, steps: (drums[t.id] ?? []).map((s) => ({ ...s })) } : null;
};

export function drumVariation(drums: Record<string, Step[]>, tracks: Track[], kind: VariationKind, stepCount: number, seed = 1): Record<string, Step[]> {
  const r = rng(seed * 97 + 13);
  const out: Record<string, Step[]> = {};
  for (const t of tracks) out[t.id] = (drums[t.id] ?? Array.from({ length: stepCount }, () => ({ on: false, velocity: 100 }))).map((s) => ({ ...s }));
  const get = (k: InstrumentKind) => {
    const l = lane(out, tracks, k);
    return l ? out[l.id] : null;
  };
  const kick = get("kick"), snare = get("snare"), clap = get("clap"), hat = get("closedHat"), open = get("openHat"), perc = get("perc"), b808 = get("808");
  const set = (lane: Step[] | null, i: number, v: Partial<Step>) => {
    if (lane && i >= 0 && i < lane.length) lane[i] = { ...lane[i], on: true, velocity: 100, ...v };
  };
  const clear = (lane: Step[] | null, i: number) => {
    if (lane && i >= 0 && i < lane.length) lane[i] = { on: false, velocity: lane[i].velocity };
  };
  const bars = stepCount / 16;
  switch (kind) {
    case "fill": {
      const from = stepCount - 4;
      for (let i = from; i < stepCount; i++) {
        clear(kick, i);
        set(snare, i, { velocity: 70 + ((i - from) * 50) / 4, roll: i >= stepCount - 2 ? 2 : 1 });
      }
      set(clap, stepCount - 4, { velocity: 110 });
      clear(hat, stepCount - 1);
      set(open, stepCount - 1, { velocity: 100 });
      break;
    }
    case "hatRolls": {
      if (!hat) break;
      for (let i = 0; i < stepCount; i += 2) set(hat, i, { velocity: hat[i].on ? hat[i].velocity : 85 });
      for (let i = 0; i < stepCount; i++) {
        if (!hat[i].on) continue;
        const roll = r() < 0.28 ? (r() < 0.5 ? 2 : r() < 0.6 ? 3 : 4) : 1;
        if (roll > 1) hat[i] = { ...hat[i], roll, velocity: Math.min(127, hat[i].velocity + 5) };
      }
      break;
    }
    case "halfTime": {
      for (let b = 0; b < bars; b++) {
        const o = b * 16;
        for (const i of [4, 12]) {
          clear(snare, o + i);
          clear(clap, o + i);
        }
        set(snare, o + 8, { velocity: 115 });
        set(clap, o + 8, { velocity: 100 });
        if (kick) for (let i = 1; i < 16; i++) if (kick[o + i]?.on && i !== 10 && r() < 0.6) clear(kick, o + i);
      }
      break;
    }
    case "sparse": {
      if (kick) for (let i = 0; i < stepCount; i++) if (kick[i].on && i % 16 !== 0 && i % 16 !== 10) clear(kick, i);
      if (hat) for (let i = 0; i < stepCount; i++) if (hat[i].on && (i % 4 !== 0 || r() < 0.3)) clear(hat, i);
      for (const l of [perc, open]) if (l) for (let i = 0; i < stepCount; i++) clear(l, i);
      if (hat) for (let i = 0; i < stepCount; i++) if (hat[i].on) hat[i] = { ...hat[i], roll: 1 };
      break;
    }
    case "busy": {
      for (let i = 0; i < stepCount; i++) {
        if (hat && !hat[i].on) set(hat, i, { velocity: i % 2 ? 70 : 95 });
        if (kick && !kick[i].on && i % 4 === 3 && r() < 0.35) set(kick, i, { velocity: 70 });
        if (perc && !perc[i].on && i % 8 === 6 && r() < 0.6) set(perc, i, { velocity: 80 });
      }
      break;
    }
    case "dropout": {
      for (const l of [kick, b808]) if (l) for (let i = 0; i < stepCount; i++) clear(l, i);
      break;
    }
  }
  return out;
}
