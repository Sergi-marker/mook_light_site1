import { createEmptyProject } from "./project.ts";
import { reduce } from "./reducer.ts";
import type { InstrumentKind, Project } from "./types.ts";

export interface Template {
  id: string;
  name: string;
  description: string;
  bpm: number;
  swing: number;
  /** instrument → step indexes (16-step grid); `!` suffix = accent (velocity 127). */
  pattern: Partial<Record<InstrumentKind, (number | `${number}!`)[]>>;
}

export const TEMPLATES: readonly Template[] = [
  {
    id: "empty",
    name: "Empty",
    description: "Blank 16-step pattern, 140 BPM.",
    bpm: 140,
    swing: 0,
    pattern: {},
  },
  {
    id: "trap",
    name: "Trap",
    description: "140 BPM, half-time snare, rolling hats, 808 on the kick.",
    bpm: 140,
    swing: 0,
    pattern: {
      kick: [0, 7, 10],
      snare: [8],
      clap: [8],
      closedHat: ["0!", 2, 4, 6, "8!", 10, 12, 13, 14, 15],
      openHat: [11],
      "808": [0, 7, 10],
    },
  },
  {
    id: "drill",
    name: "Drill",
    description: "142 BPM, syncopated kick, snare on 3, sliding-style 808 rhythm.",
    bpm: 142,
    swing: 8,
    pattern: {
      kick: [0, 11],
      snare: [8],
      closedHat: [0, 3, 6, 8, 10, 13],
      perc: [5, 14],
      "808": [0, 3, 11, 14],
    },
  },
  {
    id: "afrobeat",
    name: "Afrobeat",
    description: "105 BPM, swung percussion and off-beat hats.",
    bpm: 105,
    swing: 20,
    pattern: {
      kick: [0, 6, 10],
      snare: [4, 12],
      closedHat: [2, 6, 10, 14],
      openHat: [7],
      perc: [3, 5, 9, 11, 15],
      "808": [0, 10],
    },
  },
  {
    id: "boombap",
    name: "Boom Bap",
    description: "90 BPM, classic swung hip-hop groove.",
    bpm: 90,
    swing: 30,
    pattern: {
      kick: [0, 7, 9],
      snare: [4, 12],
      closedHat: [0, 2, 4, 6, 8, 10, 12, 14],
    },
  },
  {
    id: "rnb",
    name: "R&B",
    description: "75 BPM, laid-back groove with claps.",
    bpm: 75,
    swing: 15,
    pattern: {
      kick: [0, 10],
      clap: [4, 12],
      closedHat: [0, 2, 4, 6, 8, 10, 12, 14],
      "808": [0, 10],
    },
  },
];

export function projectFromTemplate(templateId: string, name?: string): Project {
  const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  let p = createEmptyProject(name ?? `${tpl.name} Beat`);
  p = reduce(p, { type: "setBpm", bpm: tpl.bpm });
  p = reduce(p, { type: "setSwing", swing: tpl.swing });
  for (const track of p.tracks) {
    for (const entry of tpl.pattern[track.instrument] ?? []) {
      const accent = typeof entry === "string";
      const step = accent ? parseInt(entry, 10) : entry;
      p = reduce(p, { type: "toggleStep", trackId: track.id, step });
      if (accent) p = reduce(p, { type: "setStepVelocity", trackId: track.id, step, velocity: 127 });
    }
  }
  return p;
}
