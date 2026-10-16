#!/usr/bin/env node
// Builds the bundled library of REAL recorded instruments (assets/samples + src/core/sampleLibrary.ts).
//
// Developer tool — the generated files are committed, so users never need to run it (and the app
// works offline). Requires ffmpeg with libopus. Every source below is public domain, CC0 or CC BY
// (credit shown in the app: À PROPOS / crédits). Sources with non-commercial clauses (e.g. the
// jRhodes CC BY-NC samples) are deliberately NOT used: beats made with the app must be sellable.
//
// For each instrument: picks the recorded notes (zones) a few semitones apart, trims the silence
// before the attack, cuts the length, bakes a seamless loop for sustained instruments (strings,
// winds, organ), normalises the loudness and encodes to Ogg Opus.
//
// Usage: node scripts/fetch-samples.mjs [--only id1,id2] [--cache dir]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { freqToMidi, pitchTrack } from "../src/core/dsp/yin.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const OUT = join(root, "assets", "samples");
const args = process.argv.slice(2);
const argVal = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const CACHE = argVal("--cache") ?? join(root, ".sample-cache");
const ONLY = argVal("--only")?.split(",") ?? null;
const SR = 48000;

const DANIGB = "https://danigb.github.io/samples";
const TONEJS = "https://nbrosowsky.github.io/tonejs-instruments/samples";
const VCSL = `${DANIGB}/vcsl`;

const LIC = {
  pd: "Domaine public",
  cc0: "CC0 1.0 (domaine public)",
  ccby: "CC BY 3.0",
};

/**
 * cat: keys | guitar | bass | strings | winds | mallets
 * sustain: bake a loop (instrument can hold notes indefinitely)
 * layers: velocity layers picked from the source ([low, high] velocity 0–127 to sample at)
 */
const INSTRUMENTS = [
  { id: "grand-piano", name: "Piano à queue (Steinway)", cat: "keys", stereo: true, spacing: 3, maxSec: 6, release: 0.35,
    src: { kind: "websfz", url: `${DANIGB}/splendid-grand-piano/websfz.json`, base: `${DANIGB}/splendid-grand-piano/`, groups: [3, 5] },
    layers: [[0, 84], [85, 127]], license: LIC.pd, credit: "Splendid Grand Piano — Akai (domaine public), mapping sfzinstruments, conversion danigb/samples" },
  { id: "upright-piano", name: "Piano droit (lo-fi)", cat: "keys", stereo: true, spacing: 3, maxSec: 5, release: 0.3,
    src: { kind: "websfz", url: `${VCSL}/Zithers/upright-piano-knight.websfz.json`, groups: [0, 1] },
    layers: [[0, 83], [84, 127]], license: LIC.cc0, credit: "Upright Piano (Knight) — Versilian Community Sample Library (CC0)" },
  { id: "wurlitzer", name: "Wurlitzer (piano électrique)", cat: "keys", stereo: true, spacing: 3, maxSec: 5, release: 0.25,
    src: { kind: "websfz", url: `${DANIGB}/gs-e-pianos/Wurlitzer%20EP200/wurlitzer-ep200.websfz.json` },
    layers: [[0, 90], [91, 127]], license: LIC.ccby, credit: "Wurlitzer EP200 — Greg Sullivan's E-Pianos (CC BY 3.0), sfzinstruments" },
  { id: "organ", name: "Orgue", cat: "keys", stereo: false, spacing: 3, maxSec: 3, sustain: true, release: 0.15,
    src: { kind: "tonejs", inst: "organ" }, license: LIC.ccby, credit: "Organ — VSCO 2 via nbrosowsky/tonejs-instruments (CC BY 3.0)" },
  { id: "guitar-acoustic", name: "Guitare acoustique", cat: "guitar", stereo: false, spacing: 2, maxSec: 4, release: 0.3,
    src: { kind: "tonejs", inst: "guitar-acoustic" }, license: LIC.ccby, credit: "Acoustic guitar — University of Iowa EMS via tonejs-instruments (CC BY 3.0)" },
  { id: "guitar-nylon", name: "Guitare nylon (classique)", cat: "guitar", stereo: false, spacing: 2, maxSec: 4, release: 0.3,
    src: { kind: "tonejs", inst: "guitar-nylon" }, license: LIC.ccby, credit: "Classical guitar — quartertone (Freesound) via tonejs-instruments (CC BY 3.0)" },
  { id: "guitar-electric", name: "Guitare électrique (clean)", cat: "guitar", stereo: false, spacing: 2, maxSec: 4, release: 0.25,
    src: { kind: "tonejs", inst: "guitar-electric" }, license: LIC.ccby, credit: "Electric guitar — Karoryfer via tonejs-instruments (CC BY 3.0)" },
  { id: "bass-electric", name: "Basse électrique", cat: "bass", stereo: false, spacing: 2, maxSec: 3, release: 0.12,
    src: { kind: "tonejs", inst: "bass-electric" }, license: LIC.ccby, credit: "Electric bass — Karoryfer via tonejs-instruments (CC BY 3.0)" },
  { id: "harp", name: "Harpe", cat: "strings", stereo: false, spacing: 3, maxSec: 4, release: 0.4,
    src: { kind: "websfz", url: `${VCSL}/Composite%20Chordophones/concert-harp.websfz.json` }, license: LIC.cc0, credit: "Concert Harp — VCSL (CC0)" },
  { id: "violin", name: "Violon", cat: "strings", stereo: false, spacing: 3, maxSec: 3, sustain: true, release: 0.3,
    src: { kind: "tonejs", inst: "violin" }, license: LIC.ccby, credit: "Violin — VSCO 2 via tonejs-instruments (CC BY 3.0)" },
  { id: "cello", name: "Violoncelle", cat: "strings", stereo: false, spacing: 3, maxSec: 3, sustain: true, release: 0.3,
    src: { kind: "tonejs", inst: "cello" }, license: LIC.ccby, credit: "Cello — flcellogrl (Freesound) via tonejs-instruments (CC BY 3.0)" },
  { id: "flute", name: "Flûte", cat: "winds", stereo: false, spacing: 3, maxSec: 3, sustain: true, release: 0.15,
    src: { kind: "tonejs", inst: "flute" }, license: LIC.ccby, credit: "Flute — VSCO 2 via tonejs-instruments (CC BY 3.0)" },
  { id: "saxophone", name: "Saxophone", cat: "winds", stereo: false, spacing: 3, maxSec: 3, sustain: true, release: 0.12,
    src: { kind: "tonejs", inst: "saxophone" }, license: LIC.ccby, credit: "Saxophone — Karoryfer via tonejs-instruments (CC BY 3.0)" },
  { id: "trumpet", name: "Trompette", cat: "winds", stereo: false, spacing: 3, maxSec: 3, sustain: true, release: 0.1,
    src: { kind: "tonejs", inst: "trumpet" }, license: LIC.ccby, credit: "Trumpet — VSCO 2 via tonejs-instruments (CC BY 3.0)" },
  { id: "french-horn", name: "Cor (cuivres)", cat: "winds", stereo: false, spacing: 3, maxSec: 3, sustain: true, release: 0.2,
    src: { kind: "tonejs", inst: "french-horn" }, license: LIC.ccby, credit: "French horn — VSCO 2 via tonejs-instruments (CC BY 3.0)" },
  { id: "kalimba", name: "Kalimba", cat: "mallets", stereo: false, spacing: 2, maxSec: 3, release: 0.4,
    src: { kind: "websfz", url: `${VCSL}/Plucked%20Idiophones/kalimba-kenya.websfz.json` }, license: LIC.cc0, credit: "Kalimba (Kenya) — VCSL (CC0)" },
  { id: "marimba", name: "Marimba", cat: "mallets", stereo: false, spacing: 3, maxSec: 2.5, release: 0.3,
    src: { kind: "websfz", url: `${VCSL}/Struck%20Idiophones/marimba.websfz.json` }, license: LIC.cc0, credit: "Marimba — VCSL (CC0)" },
  { id: "balafon", name: "Balafon", cat: "mallets", stereo: false, spacing: 2, maxSec: 2.5, release: 0.3, retune: true,
    src: { kind: "websfz", url: `${VCSL}/Struck%20Idiophones/balafon-hard-mallet.websfz.json` }, license: LIC.cc0, credit: "Balafon — VCSL (CC0)" },
  { id: "vibraphone", name: "Vibraphone", cat: "mallets", stereo: false, spacing: 3, maxSec: 4, release: 0.5,
    src: { kind: "websfz", url: `${VCSL}/Struck%20Idiophones/vibraphone-hard-mallets.websfz.json` }, license: LIC.cc0, credit: "Vibraphone — VCSL (CC0)" },
  { id: "glockenspiel", name: "Glockenspiel (cloches)", cat: "mallets", stereo: false, spacing: 3, maxSec: 3, release: 0.5,
    src: { kind: "websfz", url: `${VCSL}/Struck%20Idiophones/glockenspiel.websfz.json` }, license: LIC.cc0, credit: "Glockenspiel — VCSL (CC0)" },
];

// --- helpers -------------------------------------------------------------------------------
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "C#4", "Db4", "Ds4" (tonejs), "A-1", 60 → MIDI. */
function toMidi(x) {
  if (typeof x === "number") return x;
  const m = /^([A-Ga-g])([#bs]?)(-?\d)$/.exec(String(x).trim());
  if (!m) throw new Error(`note ${x}`);
  const acc = m[2] === "#" || m[2] === "s" ? 1 : m[2] === "b" ? -1 : 0;
  return NOTE[m[1].toUpperCase()] + acc + (Number(m[3]) + 1) * 12;
}
const NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
const noteName = (n) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

async function fetchCached(url) {
  const file = join(CACHE, encodeURIComponent(url).slice(-180));
  if (existsSync(file)) return readFileSync(file);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, buf);
      return buf;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

/** Pick zones from a websfz instrument: one region per key centre and velocity layer. */
function websfzZones(j, inst) {
  const base = inst.src.base ?? encodeURI(`${j.meta?.baseUrl ?? ""}${j.global?.default_path ?? ""}`);
  const groups = j.groups.filter((g, i) => (inst.src.groups ? inst.src.groups.includes(i) : true) && g.trigger !== "release" && g.pitch_keytrack !== 0);
  const regions = groups.flatMap((g) => g.regions.map((r) => ({ ...r, lovel: r.lovel ?? g.lovel, hivel: r.hivel ?? g.hivel })))
    .filter((r) => r.pitch_keycenter !== undefined && r.trigger !== "release" && !(r.seq_position > 1));
  const layers = inst.layers ?? [[0, 127]];
  const out = [];
  for (const [li, [lo, hi]] of layers.entries()) {
    const target = Math.round((lo + hi) / 2 + (hi - lo) * 0.2);
    const byKey = new Map();
    for (const r of regions) {
      const key = toMidi(r.pitch_keycenter);
      const rlo = r.lovel ?? r.xfin_lovel ?? 0;
      const rhi = r.hivel ?? r.xfout_hivel ?? r.xfin_hivel ?? 127;
      const score = target >= rlo && target <= rhi ? 0 : Math.min(Math.abs(target - rlo), Math.abs(target - rhi));
      const prev = byKey.get(key);
      if (!prev || score < prev.score) byKey.set(key, { score, r });
    }
    for (const [key, { r }] of byKey) out.push({ key, layer: li, vel: [lo / 127, (hi + 1) / 128], url: `${base}${r.sample.split("/").map(encodeURIComponent).join("/")}.ogg`, tune: r.tune ?? 0 });
  }
  return out;
}

async function tonejsZones(inst) {
  const src = (await fetchCached("https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/Tonejs-Instruments.js")).toString();
  const block = new RegExp(`'${inst.src.inst}': \\{([^}]*)\\}`).exec(src)[1];
  const zones = [];
  for (const m of block.matchAll(/'([A-G]#?\d)': '([^.]+)\./g)) zones.push({ key: toMidi(m[1]), layer: 0, vel: [0, 1], url: `${TONEJS}/${inst.src.inst}/${m[2]}.mp3`, tune: 0 });
  return zones;
}

/** Keep zones at least `spacing` semitones apart (per layer), always keeping the extremes. */
function thin(zones, spacing) {
  const out = [];
  const layers = [...new Set(zones.map((z) => z.layer))];
  for (const l of layers) {
    const zs = zones.filter((z) => z.layer === l).sort((a, b) => a.key - b.key);
    const kept = [];
    for (const z of zs) if (!kept.length || z.key - kept.at(-1).key >= spacing) kept.push(z);
    // The highest recorded note is always kept (it replaces a kept neighbour that is too close).
    const top = zs.at(-1);
    if (kept.at(-1) !== top) {
      if (top.key - kept.at(-1).key < spacing && kept.length > 1) kept.pop();
      kept.push(top);
    }
    out.push(...kept);
  }
  return out;
}

function decode(buf, channels) {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", "pipe:0", "-ac", String(channels), "-ar", String(SR), "-f", "f32le", "pipe:1"], { input: buf, maxBuffer: 1 << 28 });
  const inter = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  return Array.from({ length: channels }, (_, c) => Float32Array.from({ length: inter.length / channels }, (_, i) => inter[i * channels + c]));
}

function encode(chs, file, kbps) {
  const n = chs[0].length, C = chs.length;
  const inter = new Float32Array(n * C);
  for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) inter[i * C + c] = chs[c][i];
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "f32le", "-ar", String(SR), "-ac", String(C), "-i", "pipe:0", "-c:a", "libopus", "-b:a", `${kbps}k`, "-vbr", "on", "-application", "audio", file], { input: Buffer.from(inter.buffer) });
}

/** Trim, cut, loop (sustain), normalise. Returns { chs, loop: [start, end] seconds | null }. */
function prepare(chs, inst, key) {
  const n = chs[0].length;
  const mono = (i) => chs.reduce((s, c) => s + c[i], 0) / chs.length;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mono(i)));
  // Silence before the attack: first sample above −40 dB of the peak, minus 3 ms.
  let start = 0;
  while (start < n && Math.abs(mono(start)) < peak * 0.01) start++;
  start = Math.max(0, start - Math.round(SR * 0.003));
  let len = Math.min(n - start, Math.round(SR * inst.maxSec));
  let out = chs.map((c) => c.slice(start, start + len));
  let loop = null;
  if (inst.sustain) {
    // Seamless loop in the steady part: length = whole number of periods, crossfade baked in.
    const period = SR / (440 * 2 ** ((key - 69) / 12));
    const loopStart = Math.round(len * 0.35);
    const periods = Math.max(1, Math.round((len * 0.85 - loopStart) / period));
    const loopEnd = Math.min(len, Math.round(loopStart + periods * period));
    const xf = Math.min(Math.round(SR * 0.08), loopStart, Math.round((loopEnd - loopStart) / 2));
    for (const c of out) {
      const src = Float32Array.from(c);
      for (let i = 0; i < xf; i++) {
        const w = i / xf; // equal-power crossfade
        const a = Math.cos((w * Math.PI) / 2), b = Math.sin((w * Math.PI) / 2);
        c[loopEnd - xf + i] = src[loopEnd - xf + i] * a + src[loopStart - xf + i] * b;
      }
    }
    len = loopEnd;
    out = out.map((c) => c.slice(0, len));
    loop = [loopStart / SR, loopEnd / SR];
  } else {
    // Natural decay, short fade at the cut.
    const fade = Math.min(len, Math.round(SR * 0.25));
    for (const c of out) for (let i = 0; i < fade; i++) c[len - fade + i] *= 1 - i / fade;
  }
  // Loudness: RMS of the first 400 ms → −16 dBFS, peaks capped at −3 dBFS (headroom for the codec).
  const win = Math.min(len, Math.round(SR * 0.4));
  let e = 0;
  for (const c of out) for (let i = 0; i < win; i++) e += c[i] * c[i];
  const rms = Math.sqrt(e / (win * out.length)) || 1e-6;
  let p = 0;
  for (const c of out) for (const x of c) p = Math.max(p, Math.abs(x));
  const g = Math.min(10 ** (-16 / 20) / rms, 10 ** (-3 / 20) / Math.max(p, 1e-6));
  for (const c of out) for (let i = 0; i < c.length; i++) c[i] *= g;
  return { chs: out, loop };
}

/**
 * Measured tuning error (cents) of a note, or 0 when the detection is not reliable. Used for
 * instruments not tuned to equal temperament (`retune`: the balafon) so they sit in tune with the
 * beat. Not for bell-like inharmonic tones (kalimba, glockenspiel), where the detector is unreliable.
 */
function tuningError(ch, key, tune) {
  const seg = ch.subarray(Math.round(SR * 0.08), Math.min(ch.length, Math.round(SR * 0.9)));
  const tr = pitchTrack(seg, SR).filter((r) => r.freq > 0 && r.confidence > 0.85).map((r) => freqToMidi(r.freq)).sort((a, b) => a - b);
  if (tr.length < 8) return 0;
  const err = (tr[Math.floor(tr.length / 2)] - key) * 100 + tune;
  return Math.abs(err) >= 12 && Math.abs(err) <= 120 ? err : 0;
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const libFile = join(root, "src", "core", "sampleLibrary.data.ts");
  const HEAD = "// GENERATED by scripts/fetch-samples.mjs — do not edit by hand.\nimport type { SampledInstrument } from \"./sampleLibrary.ts\";\n\nexport const SAMPLE_DATA: SampledInstrument[] = ";
  const previous = existsSync(libFile) ? JSON.parse(readFileSync(libFile, "utf8").slice(HEAD.length).replace(/;\s*$/, "")) : [];
  const result = [];
  for (const inst of INSTRUMENTS) {
    if (ONLY && !ONLY.includes(inst.id)) {
      const keep = previous.find((p) => p.id === inst.id);
      if (keep) result.push(keep);
      continue;
    }
    process.stdout.write(`${inst.id}: `);
    let zones = inst.src.kind === "tonejs" ? await tonejsZones(inst) : websfzZones(JSON.parse((await fetchCached(inst.src.url)).toString()), inst);
    zones = thin(zones, inst.spacing);
    const dir = join(OUT, inst.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const outZones = [];
    let bytes = 0;
    for (const z of zones) {
      const chs = decode(await fetchCached(z.url), inst.stereo ? 2 : 1);
      const { chs: done, loop } = prepare(chs, inst, z.key);
      const fix = inst.retune ? tuningError(done[0], z.key, z.tune) : 0;
      if (fix) z.tune = Math.round(z.tune - fix);
      const name = `${noteName(z.key)}${inst.layers ? `-v${z.layer + 1}` : ""}.ogg`;
      encode(done, join(dir, name), inst.stereo ? 80 : 56);
      bytes += readFileSync(join(dir, name)).length;
      outZones.push({ note: z.key, file: `${inst.id}/${name}`, ...(inst.layers ? { vel: z.vel.map((v) => Math.round(v * 100) / 100) } : {}), ...(z.tune ? { tune: z.tune } : {}), ...(loop ? { loop: loop.map((v) => Math.round(v * 1e5) / 1e5) } : {}) });
      process.stdout.write(".");
    }
    console.log(` ${outZones.length} zones, ${(bytes / 1024).toFixed(0)} Ko`);
    result.push({ id: inst.id, name: inst.name, category: inst.cat, sustain: !!inst.sustain, release: inst.release, license: inst.license, credit: inst.credit, zones: outZones });
  }
  writeFileSync(libFile, `${HEAD}${JSON.stringify(result, null, 1)};\n`);
  console.log(`→ ${libFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
