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
//        node scripts/fetch-samples.mjs --drums     (drum & percussion one-shots only)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { freqToMidi, pitchTrack } from "../src/core/dsp/yin.ts";
import { synthesizeDrum } from "../src/core/drumSynth.ts";

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

// --- Drum & percussion one-shots (all CC0) ------------------------------------------------
const SPI = `${DANIGB}/sample-pi/drums/one-shots`;
const SPI_CREDIT = "Sample Pi / Sonic Pi — Freesound (CC0)";
const VC = (path, re) => ({ websfz: `${VCSL}/${path}.websfz.json`, re });
const VCSL_CREDIT = "Versilian Community Sample Library (CC0)";
/** kind: the drum lane it is meant for (kick, snare, clap, closedHat, openHat, perc). */
const DRUMS = [
  // Kicks
  { id: "kick-acoustic", name: "Kick acoustique", kind: "kick", src: `${SPI}/kick/drum_bass_hard.ogg`, maxSec: 1.2 },
  { id: "kick-soft", name: "Kick doux (R&B, afro)", kind: "kick", src: `${SPI}/kick/drum_bass_soft.ogg`, maxSec: 1.2 },
  { id: "kick-heavy", name: "Kick lourd (boom bap)", kind: "kick", src: `${SPI}/kick/drum_heavy_kick.ogg`, maxSec: 1.2 },
  { id: "kick-boom", name: "Kick boom", kind: "kick", src: `${SPI}/kick/bd_boom.ogg`, maxSec: 1.5 },
  { id: "kick-fat", name: "Kick fat", kind: "kick", src: `${SPI}/kick/bd_fat.ogg`, maxSec: 1.2 },
  { id: "kick-808-sample", name: "Kick 808 (sample)", kind: "kick", src: `${SPI}/kick/bd_808.ogg`, maxSec: 1.5 },
  { id: "kick-house", name: "Kick house (afro house, amapiano)", kind: "kick", src: `${SPI}/kick/bd_haus.ogg`, maxSec: 1 },
  { id: "kick-concert", name: "Grosse caisse de concert", kind: "kick", src: VC("Struck%20Membranophones/bass-drum-1", /BDrumNew_hit_v5/), maxSec: 1.5 },
  // Snares
  { id: "snare-acoustic", name: "Caisse claire acoustique", kind: "snare", src: `${SPI}/snare/drum_snare_hard.ogg`, maxSec: 1 },
  { id: "snare-soft", name: "Caisse claire douce", kind: "snare", src: `${SPI}/snare/drum_snare_soft.ogg`, maxSec: 1 },
  { id: "snare-modern", name: "Caisse claire moderne (live)", kind: "snare", src: VC("Struck%20Membranophones/snare-drum-modern-1", /Snare2_HitSN_v7/), maxSec: 1 },
  { id: "snare-dub", name: "Snare dub", kind: "snare", src: `${SPI}/snare/sn_dub.ogg`, maxSec: 1 },
  { id: "snare-crisp", name: "Snare sec", kind: "snare", src: `${SPI}/snare/sn_dolf.ogg`, maxSec: 0.8 },
  { id: "snare-tight", name: "Snare serré", kind: "snare", src: `${SPI}/snare/sn_generic.ogg`, maxSec: 0.8 },
  // Claps & snaps
  { id: "clap-group", name: "Clap (groupe, réel)", kind: "clap", src: VC("Struck%20Idiophones/claps", /\/Clap/), maxSec: 0.8 },
  { id: "clap-solo", name: "Clap solo (réel)", kind: "clap", src: VC("Struck%20Idiophones/claps", /SoloClap_vl3/), maxSec: 0.6 },
  { id: "snap", name: "Claquement de doigts", kind: "clap", src: `${SPI}/percussion/perc_snap.ogg`, maxSec: 0.6 },
  { id: "snap-2", name: "Claquement de doigts 2", kind: "clap", src: `${SPI}/percussion/perc_snap2.ogg`, maxSec: 0.6 },
  // Hats, shakers
  { id: "hat-closed", name: "Charley fermé (acoustique)", kind: "closedHat", src: `${SPI}/cymbal/drum_cymbal_closed.ogg`, maxSec: 0.5 },
  { id: "hat-pedal", name: "Charley pédale", kind: "closedHat", src: `${SPI}/cymbal/drum_cymbal_pedal.ogg`, maxSec: 0.5 },
  { id: "hat-tight", name: "Charley fermé serré", kind: "closedHat", src: VC("Struck%20Idiophones/hihat-cymbal", /HiHat_HitC_v3/), maxSec: 0.4 },
  { id: "shaker", name: "Shaker", kind: "closedHat", src: VC("Struck%20Idiophones/shaker-small", /Mid_Shaker_Slap/), maxSec: 0.4 },
  { id: "shaker-down", name: "Shaker (aller, amapiano)", kind: "closedHat", src: VC("Struck%20Idiophones/shaker-small", /Mid_ShakerDouble_Down/), maxSec: 0.4, onset: 0.2 },
  { id: "shaker-large", name: "Gros shaker", kind: "closedHat", src: VC("Struck%20Idiophones/shaker-large", /LShaker_Hit/), maxSec: 0.5 },
  { id: "cabasa", name: "Cabasa", kind: "closedHat", src: VC("Struck%20Idiophones/cabasa", /Cabasa1_Hit/), maxSec: 0.4 },
  { id: "hat-open", name: "Charley ouvert (acoustique)", kind: "openHat", src: `${SPI}/cymbal/drum_cymbal_open.ogg`, maxSec: 1.5 },
  { id: "hat-open-loose", name: "Charley ouvert (live)", kind: "openHat", src: VC("Struck%20Idiophones/hihat-cymbal", /HiHat_HitO/), maxSec: 1.5 },
  { id: "tambourine", name: "Tambourin", kind: "openHat", src: VC("Struck%20Idiophones/tambourine-1", /Tamb1_Hit_v2/), maxSec: 0.8 },
  { id: "crash", name: "Cymbale crash", kind: "openHat", src: `${SPI}/other/drum_splash_hard.ogg`, maxSec: 2.5 },
  // Percussion
  { id: "conga-open", name: "Conga ouverte", kind: "perc", src: VC("Struck%20Membranophones/conga", /Conga_HitN_v2/), maxSec: 0.8 },
  { id: "conga-low", name: "Tumba (conga grave)", kind: "perc", src: VC("Struck%20Membranophones/conga", /Tumba_HitN_v1/), maxSec: 0.9 },
  { id: "conga-high", name: "Quinto (conga aiguë)", kind: "perc", src: VC("Struck%20Membranophones/conga", /Quinto_HitN_v2/), maxSec: 0.7 },
  { id: "bongo-high", name: "Bongo aigu", kind: "perc", src: VC("Struck%20Membranophones/bongos", /BongoH_Hit1_v2/), maxSec: 0.6 },
  { id: "bongo-low", name: "Bongo grave", kind: "perc", src: VC("Struck%20Membranophones/bongos", /BongoL_Hit1_v2/), maxSec: 0.6 },
  { id: "cajon", name: "Cajón", kind: "perc", src: VC("Struck%20Idiophones/cajon", /Cajon_hit1_f/), maxSec: 0.7 },
  { id: "claves", name: "Claves", kind: "perc", src: VC("Struck%20Idiophones/claves", /Claves1_Hit_v2/), maxSec: 0.4 },
  { id: "woodblock", name: "Wood block", kind: "perc", src: VC("Struck%20Idiophones/woodblock", /wood_click_f/), maxSec: 0.4 },
  { id: "cowbell-real", name: "Cloche (cowbell réelle)", kind: "perc", src: VC("Struck%20Idiophones/cowbells", /Cowbell1_Normal_v3/), maxSec: 0.8 },
  { id: "agogo", name: "Agogô", kind: "perc", src: VC("Struck%20Idiophones/agogo-bells", /Agogo_High_v2/), maxSec: 0.8 },
  { id: "tom-low", name: "Tom grave", kind: "perc", src: `${SPI}/tom/drum_tom_lo_hard.ogg`, maxSec: 1.2 },
  { id: "tom-mid", name: "Tom medium", kind: "perc", src: `${SPI}/tom/drum_tom_mid_hard.ogg`, maxSec: 1 },
  { id: "tom-high", name: "Tom aigu", kind: "perc", src: `${SPI}/tom/drum_tom_hi_hard.ogg`, maxSec: 0.9 },
  { id: "tabla-na", name: "Tabla (na)", kind: "perc", src: `${SPI}/tabla/tabla_na.ogg`, maxSec: 0.8 },
  { id: "tabla-ghe", name: "Tabla grave (ghe)", kind: "perc", src: `${SPI}/tabla/tabla_ghe1.ogg`, maxSec: 1 },
];

async function drumUrl(src) {
  if (typeof src === "string") return src;
  const j = JSON.parse((await fetchCached(src.websfz)).toString());
  const base = encodeURI(`${j.meta?.baseUrl ?? ""}${j.global?.default_path ?? ""}`);
  const r = j.groups.flatMap((g) => g.regions).find((x) => src.re.test(x.sample));
  if (!r) throw new Error(`no region ${src.re} in ${src.websfz}`);
  return `${base}${r.sample.split("/").map(encodeURIComponent).join("/")}.ogg`;
}

/** One-shot: silence before the hit removed, length capped with a fade, peak at −3 dBFS. */
function prepareHit(ch, maxSec, onset = 0.15) {
  let peak = 0;
  for (const x of ch) peak = Math.max(peak, Math.abs(x));
  let start = 0;
  while (start < ch.length && Math.abs(ch[start]) < peak * onset) start++;
  // Aligned on the main transient (like a producer trims a one-shot), 1.5 ms of pre-attack kept.
  start = Math.max(0, start - Math.round(SR * 0.0015));
  const len = Math.min(ch.length - start, Math.round(SR * maxSec));
  const out = ch.slice(start, start + len);
  // End: fade the last 30 % (or the tail of the cut).
  const fade = Math.min(len, Math.max(Math.round(SR * 0.02), Math.round(len * 0.3)));
  for (let i = 0; i < fade; i++) out[len - fade + i] *= Math.cos((i / fade) * Math.PI / 2);
  const g = 10 ** (-3 / 20) / Math.max(peak, 1e-6);
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

function hitRms(d) {
  const n = Math.min(d.length, Math.round(SR * 0.15));
  let e = 0;
  for (let i = 0; i < n; i++) e += d[i] * d[i];
  return 10 * Math.log10(e / n + 1e-12);
}

async function buildDrums() {
  const dir = join(OUT, "drums");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const result = [];
  let bytes = 0;
  process.stdout.write("drums: ");
  for (const d of DRUMS) {
    const url = await drumUrl(d.src);
    const [ch] = decode(await fetchCached(url), 1);
    const hit = prepareHit(ch, d.maxSec, d.onset);
    encode([hit], join(dir, `${d.id}.ogg`), 64);
    // Playback gain so the hit sits at the loudness of the built-in sound of its lane (first 150 ms).
    const gainDb = Math.round(Math.max(-6, Math.min(9, hitRms(synthesizeDrum(d.kind, SR)) - hitRms(hit))) * 10) / 10;
    bytes += readFileSync(join(dir, `${d.id}.ogg`)).length;
    result.push({ id: d.id, name: d.name, kind: d.kind, file: `drums/${d.id}.ogg`, gainDb, license: LIC.cc0, credit: typeof d.src === "string" ? SPI_CREDIT : VCSL_CREDIT });
    process.stdout.write(".");
  }
  console.log(` ${result.length} sons, ${(bytes / 1024).toFixed(0)} Ko`);
  const file = join(root, "src", "core", "drumSamples.data.ts");
  writeFileSync(file, `// GENERATED by scripts/fetch-samples.mjs — do not edit by hand.\nimport type { DrumSample } from "./drumSamples.ts";\n\nexport const DRUM_SAMPLE_DATA: DrumSample[] = ${JSON.stringify(result, null, 1)};\n`);
  console.log(`→ ${file}`);
}

async function main() {
  if (args.includes("--drums")) {
    mkdirSync(CACHE, { recursive: true });
    return buildDrums();
  }
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
