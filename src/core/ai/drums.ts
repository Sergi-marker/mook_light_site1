// AI DRUM GENERATOR: genre-specific probability grids + energy / complexity / swing.
// Produces ordinary editable steps (velocity, rolls) for the 7 drum lanes.

import type { InstrumentKind, Step } from "../types.ts";
import type { Genre } from "./prompt.ts";
import { rng } from "./rng.ts";
import { parseGrid, type StyleDef } from "./styles.ts";

export interface DrumGenOptions {
  genre: Genre;
  energy: number;
  complexity: number;
  stepCount: 16 | 32 | 64;
  seed: number;
  /** Variation used for chorus / verse differences (0 = base). */
  variation?: number;
  /** Precise sub-genre: its own grids, hat rolls and 808 rhythm override the genre's. */
  style?: StyleDef;
}

type Grid = Partial<Record<InstrumentKind, number[]>>; // 16 probabilities per lane (one bar)

// Probabilities (0–1) for each 16th of a bar. 1 = always (backbone), small = ghost/fills.
const GRIDS: Record<Genre, Grid> = {
  trap: {
    kick: [1, 0, 0, 0.15, 0, 0, 0, 0.85, 0, 0, 0.7, 0, 0, 0, 0.3, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0.1],
    clap: [0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0],
    closedHat: [1, 0.3, 1, 0.3, 1, 0.3, 1, 0.4, 1, 0.3, 1, 0.3, 1, 0.5, 1, 0.5],
    openHat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.35],
    perc: [0, 0, 0, 0, 0, 0, 0.2, 0, 0, 0, 0, 0, 0, 0.25, 0, 0],
    "808": [1, 0, 0, 0.15, 0, 0, 0, 0.8, 0, 0, 0.7, 0, 0, 0, 0.25, 0],
  },
  drill: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.4, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    clap: [0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 0.3],
    closedHat: [1, 0, 0, 0.9, 0, 0, 1, 0, 0.3, 0, 1, 0, 0, 0.9, 0, 0.3],
    openHat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    perc: [0, 0, 0.2, 0, 0, 0.6, 0, 0, 0, 0.2, 0, 0, 0.5, 0, 0, 0],
    "808": [1, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0.5, 0, 0],
  },
  afrobeat: {
    kick: [1, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0],
    clap: [0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0.4],
    closedHat: [0.5, 0, 1, 0, 0.5, 0, 1, 0, 0.5, 0, 1, 0, 0.5, 0, 1, 0],
    openHat: [0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 0, 0],
    perc: [0, 0, 0, 0.8, 0, 0.7, 0, 0, 0, 0.8, 0, 0.7, 0, 0, 0, 0.6],
    "808": [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0],
  },
  boombap: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0.7, 0, 0.8, 0, 0, 0, 0, 0.2, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.15],
    clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    closedHat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0.3],
    openHat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0],
    perc: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0, 0, 0, 0],
    "808": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  rnb: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.3],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    closedHat: [1, 0, 0.8, 0, 1, 0, 0.8, 0.3, 1, 0, 0.8, 0, 1, 0, 0.8, 0.3],
    openHat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0],
    perc: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0, 0, 0, 0],
    "808": [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0],
  },
  lofi: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0.5, 0, 0.6, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    closedHat: [0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0.2],
    openHat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    perc: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0, 0, 0, 0, 0],
    "808": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  dancehall: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    clap: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    closedHat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    openHat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    perc: [0, 0, 0.4, 0, 0, 0.4, 0, 0, 0, 0, 0.4, 0, 0, 0.4, 0, 0],
    "808": [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  },
  pop: {
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0.5, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    closedHat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    openHat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.4],
    perc: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "808": [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0.5, 0, 0, 0, 0, 0],
  },
};

const BACKBONE = 0.95;

export function generateDrums(o: DrumGenOptions): Record<InstrumentKind, Step[]> {
  const r = rng(o.seed * 7 + (o.variation ?? 0) * 101);
  const st = o.style;
  const grid: Grid = st ? Object.fromEntries(Object.entries(st.drums).map(([k, g]) => [k, parseGrid(g)])) : GRIDS[o.genre];
  if (st && !st.drums["808"]) grid["808"] = st.bassGrid ? parseGrid(st.bassGrid) : grid.kick;
  const bars = o.stepCount / 16;
  const out = {} as Record<InstrumentKind, Step[]>;
  const kinds: InstrumentKind[] = ["kick", "snare", "clap", "closedHat", "openHat", "perc", "808"];
  for (const k of kinds) {
    const probs = grid[k] ?? new Array(16).fill(0);
    const steps: Step[] = [];
    for (let b = 0; b < bars; b++) {
      for (let i = 0; i < 16; i++) {
        let pr = probs[i];
        if (pr < BACKBONE) {
          // Energy adds density, complexity adds off-grid ghosts.
          pr = pr * (0.4 + o.energy * 0.9) + (pr === 0 && (k === "perc" || k === "closedHat") ? o.complexity * 0.06 : 0);
        }
        // Last bar of the loop: fills on snare/hats when complex.
        if (b === bars - 1 && i >= 12 && (k === "snare" || k === "kick") && o.complexity > 0.6) pr = Math.max(pr, (o.complexity - 0.5) * 0.5);
        const on = pr >= BACKBONE || r() < pr;
        const accent = i % 4 === 0;
        let velocity = Math.round((accent ? 108 : 88) + (r() - 0.5) * 22 * o.complexity);
        if (k === "closedHat" && !accent) velocity -= 12;
        const s: Step = { on, velocity: Math.max(30, Math.min(127, velocity)) };
        const rollAmount = st ? st.hatRolls : o.genre === "trap" || o.genre === "drill" ? 0.5 : 0;
        if (on && k === "closedHat" && rollAmount > 0) {
          const rollChance = (0.03 + o.complexity * 0.18 * (i >= 12 ? 1.6 : 1)) * rollAmount * 2;
          if (r() < rollChance) s.roll = st?.tripletRolls ? (r() < 0.7 ? 3 : 2) : r() < 0.65 ? 2 : r() < 0.6 ? 3 : 4;
        }
        steps.push(s);
      }
    }
    out[k] = steps;
  }
  // 808 and kick share hits in trap/drill most of the time (classic pattern), fills aside.
  if (st ? !st.bassGrid && st.genre === "trap" : o.genre === "trap") for (let i = 0; i < out.kick.length; i++) if (out.kick[i].on && r() < 0.8) out["808"][i] = { ...out["808"][i], on: true };
  // Open hat chokes: never on the same step as a closed hat.
  for (let i = 0; i < out.openHat.length; i++) if (out.openHat[i].on) out.closedHat[i] = { ...out.closedHat[i], on: false };
  return out;
}
