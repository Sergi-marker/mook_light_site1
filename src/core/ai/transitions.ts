// AI TRANSITIONS: where a producer puts risers, impacts, downlifters, reverse cymbals and the
// "drop" (drums cut for one beat) — computed from the arrangement's sections. Pure planning:
// the app renders the sounds and places them as audio clips on an "FX / Transitions" track.

import type { AutomationLane, Project } from "../types.ts";
import { BUS_DRUMS, getChannel, newId, stepsPerBarOf } from "../project.ts";

export type FxKind = "riser" | "impact" | "downlifter" | "reverseCymbal";

export interface FxPlacement {
  kind: FxKind;
  /** Global position in steps. */
  start: number;
  /** Seconds. */
  duration: number;
  /** Section it introduces (for the explanation). */
  section: string;
}

const isChorus = (name: string) => /chorus|refrain|hook|drop/i.test(name);

/** Transition plan for the project's sections. */
export function planTransitions(p: Project): FxPlacement[] {
  const spb = stepsPerBarOf(p);
  const bar = (60 / p.bpm) * (spb / 4);
  const beat = 60 / p.bpm;
  const secs = [...p.arrangement.sections].sort((a, b) => a.start - b.start);
  const out: FxPlacement[] = [];
  secs.forEach((s, i) => {
    if (i === 0) return;
    const prev = secs[i - 1];
    if (isChorus(s.name)) {
      // Riser over the bar before the chorus (two bars on slow tempos), impact on the downbeat.
      const bars = p.bpm < 100 ? 1 : 2;
      out.push({ kind: "riser", start: (s.start - bars) * spb, duration: bars * bar, section: s.name });
      out.push({ kind: "impact", start: s.start * spb, duration: 2, section: s.name });
    } else if (isChorus(prev.name)) {
      // Leaving a chorus: the energy goes down.
      out.push({ kind: "downlifter", start: s.start * spb, duration: bar, section: s.name });
    } else {
      // New verse, bridge, outro: a reverse cymbal pulls into it.
      out.push({ kind: "reverseCymbal", start: s.start * spb - Math.round((spb / 4) * 2), duration: beat * 2, section: s.name });
    }
  });
  return out.filter((f) => f.start >= 0);
}

/**
 * "Drop": drums (and the 808) cut during the last beat before each chorus — the classic tension
 * moment. Returns automation lanes, or [] when the user already automates those channels.
 */
export function dropAutomation(p: Project): AutomationLane[] {
  const spb = stepsPerBarOf(p);
  const beatBars = 4 / spb; // one beat, in bars
  const choruses = p.arrangement.sections.filter((s) => isChorus(s.name) && s.start > 0);
  if (!choruses.length) return [];
  const targets = [BUS_DRUMS, ...p.instruments.filter((i) => i.preset === "808").map((i) => i.id)];
  const lanes: AutomationLane[] = [];
  for (const id of targets) {
    const ch = getChannel(p, id);
    // The user's own volume automation is never overwritten (cuts made by a previous run are).
    if (!ch || p.automation.some((l) => l.channelId === id && l.param === "volume" && !isDropLane(l))) continue;
    const v = ch.volume;
    const points = [{ bar: 0, value: v }];
    for (const c of choruses) {
      const cut = c.start - beatBars;
      points.push({ bar: cut - 0.001, value: v }, { bar: cut, value: 0 }, { bar: c.start - 0.001, value: 0 }, { bar: c.start, value: v });
    }
    lanes.push({ id: newId(DROP_PREFIX), channelId: id, param: "volume", points });
  }
  return lanes;
}

const DROP_PREFIX = "drop";
/** Automation lanes created by the transitions (the drums cut before choruses). */
export const isDropLane = (l: AutomationLane) => l.id.startsWith(`${DROP_PREFIX}_`);

export const FX_LABELS: Record<FxKind, string> = { riser: "Montée (riser)", impact: "Impact", downlifter: "Descente (downlifter)", reverseCymbal: "Cymbale inversée" };
