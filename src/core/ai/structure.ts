// AI SONG STRUCTURE: build a full arrangement (sections + clips) from the project's EXISTING
// patterns, using their names (Intro / Couplet / Refrain…) or, failing that, their energy.

import { newId, PATTERN_COLORS } from "../project.ts";
import type { Arrangement, Pattern, PatternClip, Project, Section } from "../types.ts";

export type SectionRole = "Intro" | "Verse" | "Pre-Chorus" | "Chorus" | "Bridge" | "Outro";

export const STRUCTURES: { id: string; label: string; sections: [SectionRole, number, string?][] }[] = [
  { id: "trap", label: "Trap / Rap classique (≈ 3 min à 140)", sections: [["Intro", 4], ["Verse", 16, "Verse 1"], ["Chorus", 8], ["Verse", 16, "Verse 2"], ["Chorus", 8], ["Bridge", 8], ["Chorus", 8], ["Outro", 4]] },
  { id: "short", label: "Court / radio (hook d'abord)", sections: [["Chorus", 8, "Hook"], ["Verse", 16, "Verse 1"], ["Chorus", 8, "Hook"], ["Verse", 8, "Verse 2"], ["Chorus", 8, "Hook"], ["Outro", 4]] },
  { id: "drill", label: "Drill (intro longue, couplets de 16)", sections: [["Intro", 8], ["Chorus", 8, "Hook"], ["Verse", 16, "Verse 1"], ["Chorus", 8, "Hook"], ["Verse", 16, "Verse 2"], ["Chorus", 8, "Hook"], ["Outro", 4]] },
  { id: "afro", label: "Afro / R&B (pré-refrain)", sections: [["Intro", 4], ["Verse", 8, "Verse 1"], ["Pre-Chorus", 4], ["Chorus", 8], ["Verse", 8, "Verse 2"], ["Pre-Chorus", 4], ["Chorus", 8], ["Bridge", 8], ["Chorus", 8], ["Outro", 4]] },
  { id: "freestyle", label: "Freestyle (un long couplet)", sections: [["Intro", 4], ["Verse", 32, "Freestyle"], ["Outro", 4]] },
];

const SECTION_COLORS: Record<SectionRole, string> = { Intro: "#64748b", Verse: "#2563eb", "Pre-Chorus": "#0891b2", Chorus: "#db2777", Bridge: "#d97706", Outro: "#475569" };

const NAME_HINTS: [SectionRole, RegExp][] = [
  ["Intro", /intro/i],
  ["Pre-Chorus", /pre[- ]?(chorus|hook|refrain)|pont/i],
  ["Chorus", /chorus|hook|refrain|drop/i],
  ["Verse", /verse|couplet|rap/i],
  ["Bridge", /bridge|break/i],
  ["Outro", /outro|fin\b|end/i],
];

/** Pattern "energy": number of drum hits + notes (weighted by velocity). */
export function patternEnergy(pat: Pattern): number {
  let e = 0;
  for (const steps of Object.values(pat.drums)) for (const s of steps) if (s.on) e += (s.velocity / 127) * (s.roll ?? 1);
  for (const notes of Object.values(pat.notes)) for (const n of notes) e += (n.velocity / 127) * 0.7;
  return e / Math.max(1, pat.stepCount / 16);
}

/** Which existing pattern to use for each section role. */
export function assignPatterns(patterns: Pattern[]): Record<SectionRole, Pattern> {
  const byName: Partial<Record<SectionRole, Pattern>> = {};
  for (const pat of patterns)
    for (const [role, re] of NAME_HINTS)
      if (!byName[role] && re.test(pat.name)) {
        byName[role] = pat;
        break;
      }
  const sorted = patterns.slice().sort((a, b) => patternEnergy(a) - patternEnergy(b));
  const low = sorted[0], high = sorted[sorted.length - 1], mid = sorted[Math.floor((sorted.length - 1) / 2)];
  const chorus = byName.Chorus ?? high;
  const verse = byName.Verse ?? (mid !== chorus ? mid : sorted[Math.max(0, sorted.length - 2)]);
  return {
    Intro: byName.Intro ?? low,
    Verse: verse,
    "Pre-Chorus": byName["Pre-Chorus"] ?? byName.Bridge ?? verse,
    Chorus: chorus,
    Bridge: byName.Bridge ?? low,
    Outro: byName.Outro ?? byName.Intro ?? low,
  };
}

/** A complete arrangement for `structureId`; vocal clips are not touched. */
export function buildStructure(p: Project, structureId: string): { arrangement: Arrangement; summary: string[] } {
  const st = STRUCTURES.find((s) => s.id === structureId) ?? STRUCTURES[0];
  const map = assignPatterns(p.patterns);
  const clips: PatternClip[] = [];
  const sections: Section[] = [];
  let bar = 0;
  st.sections.forEach(([role, bars, name], i) => {
    const pat = map[role];
    sections.push({ id: newId("sec"), name: name ?? role, start: bar, length: bars, color: SECTION_COLORS[role] ?? PATTERN_COLORS[i % PATTERN_COLORS.length] });
    clips.push({ id: newId("clip"), patternId: pat.id, lane: 0, start: bar, length: bars });
    bar += bars;
  });
  const used = [...new Set(st.sections.map(([r]) => r))].map((r) => `${r} → « ${map[r].name} »`);
  return {
    arrangement: { ...p.arrangement, clips, sections, lanes: Math.max(p.arrangement.lanes, 1), loop: { ...p.arrangement.loop, start: 0, end: Math.min(bar, 8) } },
    summary: [`${st.label} : ${bar} mesures`, ...used],
  };
}
