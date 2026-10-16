// AI PRODUCER MEMORY: what the producer learns about YOUR taste, stored only on this computer.
// Learns from: 👍 / 👎 on generated versions, the version you apply, the sounds you replace
// after a generation, the tempo you move to, the drum kit you switch to, the commands you type.
// Used to: make "Version 1" of the next generation follow your taste (versions 2 and 3 keep
// exploring), order the styles you like first, and explain in plain words what was learnt.

export type SoundRole = "lead" | "chords" | "bass";

export interface TasteMemory {
  version: 1;
  /** Per style id: 👍, 👎, versions applied. */
  styles: Record<string, { liked: number; disliked: number; applied: number }>;
  /** Per style id and role: score of each sound id (+ liked / kept / chosen, − disliked / replaced). */
  sounds: Record<string, Partial<Record<SoundRole, Record<string, number>>>>;
  /** Per style id: last tempo changes made after a generation (BPM offsets). */
  tempo: Record<string, number[]>;
  /** Per style id: drum kit chosen after a generation. */
  kits: Record<string, string>;
  /** Last commands typed (most recent first). */
  commands: string[];
  events: number;
}

export type MemoryEvent =
  | { type: "rate"; styleId: string; sounds: Record<SoundRole, string>; liked: boolean }
  | { type: "apply"; styleId: string; sounds: Record<SoundRole, string> }
  | { type: "soundChange"; styleId: string; role: SoundRole; from: string; to: string }
  | { type: "tempo"; styleId: string; offset: number }
  | { type: "kit"; styleId: string; kitId: string }
  | { type: "command"; text: string };

export function emptyMemory(): TasteMemory {
  return { version: 1, styles: {}, sounds: {}, tempo: {}, kits: {}, commands: [], events: 0 };
}

/** Accept anything (hand-edited / older storage) and return a valid memory. */
export function parseMemory(raw: unknown): TasteMemory {
  const m = emptyMemory();
  if (!raw || typeof raw !== "object") return m;
  const r = raw as Partial<TasteMemory>;
  const obj = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
  for (const [k, v] of Object.entries(obj(r.styles))) {
    const s = obj(v);
    m.styles[k] = { liked: num(s.liked), disliked: num(s.disliked), applied: num(s.applied) };
  }
  for (const [k, v] of Object.entries(obj(r.sounds))) {
    m.sounds[k] = {};
    for (const role of ["lead", "chords", "bass"] as const) {
      const scores = obj(obj(v)[role]);
      if (Object.keys(scores).length) m.sounds[k][role] = Object.fromEntries(Object.entries(scores).map(([id, sc]) => [id, num(sc)]));
    }
  }
  for (const [k, v] of Object.entries(obj(r.tempo))) if (Array.isArray(v)) m.tempo[k] = v.map(num).filter((x) => Math.abs(x) <= 60).slice(-5);
  for (const [k, v] of Object.entries(obj(r.kits))) if (typeof v === "string") m.kits[k] = v;
  m.commands = Array.isArray(r.commands) ? r.commands.filter((c): c is string => typeof c === "string").slice(0, 20) : [];
  m.events = num(r.events);
  return m;
}

function num(x: unknown): number {
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

function bump(m: TasteMemory, styleId: string, role: SoundRole, sound: string, by: number): void {
  const s = (m.sounds[styleId] ??= {});
  const r = (s[role] ??= {});
  r[sound] = Math.max(-5, Math.min(10, (r[sound] ?? 0) + by));
}

/** Pure: a new memory with the event learnt. */
export function learn(mem: TasteMemory, e: MemoryEvent): TasteMemory {
  const m: TasteMemory = structuredClone(mem);
  m.events++;
  const st = (id: string) => (m.styles[id] ??= { liked: 0, disliked: 0, applied: 0 });
  switch (e.type) {
    case "rate":
      if (e.liked) st(e.styleId).liked++;
      else st(e.styleId).disliked++;
      for (const role of ["lead", "chords", "bass"] as const) bump(m, e.styleId, role, e.sounds[role], e.liked ? 1 : -1);
      break;
    case "apply":
      st(e.styleId).applied++;
      for (const role of ["lead", "chords", "bass"] as const) bump(m, e.styleId, role, e.sounds[role], 0.5);
      break;
    case "soundChange":
      if (e.from === e.to) break;
      bump(m, e.styleId, e.role, e.from, -1);
      bump(m, e.styleId, e.role, e.to, 2);
      break;
    case "tempo":
      if (e.offset === 0) break;
      m.tempo[e.styleId] = [...(m.tempo[e.styleId] ?? []), Math.round(e.offset)].slice(-5);
      break;
    case "kit":
      m.kits[e.styleId] = e.kitId;
      break;
    case "command":
      m.commands = [e.text, ...m.commands.filter((c) => c !== e.text)].slice(0, 20);
      break;
  }
  return m;
}

export interface Preferences {
  sounds: Partial<Record<SoundRole, string>>;
  /** BPM offset to apply to the style's default tempo. */
  bpmOffset: number;
  kit?: string;
}

/** What "Version 1" should use for this style. Only clear signals count (score ≥ 2). */
export function preferencesFor(mem: TasteMemory, styleId: string, defaults: Record<SoundRole, string>): Preferences {
  const prefs: Preferences = { sounds: {}, bpmOffset: 0 };
  for (const role of ["lead", "chords", "bass"] as const) {
    const scores = mem.sounds[styleId]?.[role] ?? {};
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2 && best[0] !== defaults[role] && best[1] > (scores[defaults[role]] ?? 0)) prefs.sounds[role] = best[0];
  }
  const offs = mem.tempo[styleId] ?? [];
  if (offs.length >= 2) {
    const sorted = [...offs].sort((a, b) => a - b);
    prefs.bpmOffset = sorted[Math.floor(sorted.length / 2)];
  }
  if (mem.kits[styleId]) prefs.kit = mem.kits[styleId];
  return prefs;
}

/** Style ids ordered by how much you like them (only styles with a signal). */
export function favouriteStyles(mem: TasteMemory): string[] {
  const score = (s: { liked: number; disliked: number; applied: number }) => s.liked * 2 + s.applied - s.disliked * 2;
  return Object.entries(mem.styles).filter(([, s]) => score(s) > 0).sort((a, b) => score(b[1]) - score(a[1])).map(([id]) => id);
}

/** "What the AI learnt", in plain French. `names` resolves style and sound ids to labels. */
export function describeMemory(mem: TasteMemory, names: (id: string) => string): string[] {
  if (!mem.events) return ["Rien pour l'instant : notez les versions (👍 / 👎), appliquez celles qui vous plaisent, changez les sons — l'IA apprend de chaque choix."];
  const out: string[] = [];
  const fav = favouriteStyles(mem).slice(0, 4);
  if (fav.length) out.push(`Styles préférés : ${fav.map(names).join(", ")}.`);
  const roleLabel: Record<SoundRole, string> = { lead: "mélodie", chords: "accords", bass: "basse" };
  for (const [styleId, roles] of Object.entries(mem.sounds)) {
    for (const role of ["lead", "chords", "bass"] as const) {
      const scores = Object.entries(roles[role] ?? {}).sort((a, b) => b[1] - a[1]);
      const top = scores[0];
      const worst = scores[scores.length - 1];
      if (top && top[1] >= 2) out.push(`${names(styleId)} — ${roleLabel[role]} : vous préférez « ${names(top[0])} ».`);
      if (worst && worst[1] <= -2) out.push(`${names(styleId)} — ${roleLabel[role]} : vous évitez « ${names(worst[0])} ».`);
    }
  }
  for (const [styleId, offs] of Object.entries(mem.tempo)) {
    if (offs.length < 2) continue;
    const med = [...offs].sort((a, b) => a - b)[Math.floor(offs.length / 2)];
    if (med) out.push(`${names(styleId)} : vous jouez ${Math.abs(med)} BPM plus ${med > 0 ? "vite" : "lentement"} que le tempo par défaut.`);
  }
  for (const [styleId, kit] of Object.entries(mem.kits)) out.push(`${names(styleId)} : batterie « ${names(kit)} ».`);
  if (mem.commands.length) out.push(`Dernières commandes : ${mem.commands.slice(0, 3).map((c) => `« ${c} »`).join(", ")}.`);
  out.push(`${mem.events} choix enregistrés.`);
  return out;
}
