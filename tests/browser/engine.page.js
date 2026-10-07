// Loaded in Chromium by run-browser-tests.mjs (served from the built dist/).
import { AudioEngine } from "/app/audio/engine.js";
import { renderProject } from "/app/audio/render.js";
import { ProjectStore } from "/app/core/store.js";
import { createEmptyProject, effect } from "/app/core/project.js";
import { reduce } from "/app/core/reducer.js";
import { TEMPLATES, projectFromTemplate } from "/app/core/templates.js";
import { SOUND_LIBRARY, soundParams } from "/app/core/soundLibrary.js";
import { Yin, freqToMidi } from "/app/core/dsp/yin.js";
import { measure } from "/app/core/dsp/loudness.js";

const SR = 44100;
const media = { samples: new Map(), assets: new Map() };

function sineWav(freq, seconds, sampleRate = 44100) {
  const n = Math.floor(seconds * sampleRate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5 * 32767, true);
  return new Uint8Array(buf);
}

const empty = () => {
  let p = createEmptyProject("browser-test");
  // neutral master for measurements: no limiter
  p = reduce(p, { type: "setInserts", channelId: "master", inserts: [] });
  return p;
};
const drum = (p, kind) => p.tracks.find((t) => t.instrument === kind);
function withSteps(p, kind, steps, velocity) {
  const t = drum(p, kind);
  for (const s of steps) {
    p = reduce(p, { type: "toggleStep", trackId: t.id, step: s });
    if (velocity) p = reduce(p, { type: "setStepVelocity", trackId: t.id, step: s, velocity });
  }
  return p;
}

function onsets(data, sr, thr = 0.05, gap = 0.08) {
  const out = [];
  let last = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > thr) {
      if (i - last > gap * sr) out.push(i / sr);
      last = i;
    }
  }
  return out;
}

function stats(buffer) {
  let peak = 0, sumSq = 0, nan = false;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    for (const x of buffer.getChannelData(c)) {
      if (!Number.isFinite(x)) nan = true;
      peak = Math.max(peak, Math.abs(x));
      sumSq += x * x;
    }
  }
  return { peak, rms: Math.sqrt(sumSq / (buffer.length * buffer.numberOfChannels)), nan };
}

function pitchAt(buf, t, minF = 60, win = 4096) {
  const y = new Yin(buf.sampleRate, win, minF, 2000);
  const d = buf.getChannelData(0);
  const r = y.detect(d, Math.floor(t * buf.sampleRate));
  return r.freq ? freqToMidi(r.freq) : 0;
}

window.tests = {
  async drumTiming() {
    let p = withSteps(empty(), "kick", [0, 4, 8, 12]);
    p = reduce(p, { type: "setBpm", bpm: 120 });
    const buf = await renderProject(p, media, { mode: "pattern", tail: 0.5 });
    return { onsets: onsets(buf.getChannelData(0), SR), ...stats(buf) };
  },
  async swingAndRolls() {
    let p = withSteps(empty(), "closedHat", [0, 1, 2, 3]);
    p = reduce(p, { type: "setBpm", bpm: 120 });
    p = reduce(p, { type: "setSwing", swing: 100 });
    const swung = onsets((await renderProject(p, media, { mode: "pattern", tail: 0.2 })).getChannelData(0), SR, 0.03, 0.02);
    let r = withSteps(empty(), "closedHat", [0]);
    r = reduce(r, { type: "setBpm", bpm: 60 }); // step = 0.25 s
    r = reduce(r, { type: "setStep", trackId: drum(r, "closedHat").id, step: 0, value: { roll: 4 } });
    const rolled = onsets((await renderProject(r, media, { mode: "pattern", tail: 0.2 })).getChannelData(0), SR, 0.03, 0.012);
    return { swung, rolled };
  },
  async instrumentsInTune() {
    const out = {};
    for (const preset of ["piano", "epiano", "synth", "pad", "strings", "pluck", "bells", "bass"]) {
      let p = empty();
      p = reduce(p, { type: "addInstrument", preset });
      const ins = p.instruments[p.instruments.length - 1];
      p = reduce(p, { type: "setBpm", bpm: 120 });
      p = reduce(p, { type: "addNotes", trackId: ins.id, notes: [{ pitch: 57, start: 0, length: 8, velocity: 100 }] });
      const buf = await renderProject(p, media, { mode: "pattern", tail: 0.5 });
      // bells are inharmonic by design: only check they sound
      out[preset] = { midi: pitchAt(buf, 0.3), ...stats(buf) };
    }
    return out;
  },
  async bass808Glide() {
    let p = empty();
    const ins = p.instruments.find((i) => i.preset === "808");
    p = reduce(p, { type: "setBpm", bpm: 60 });
    p = reduce(p, { type: "updateInstrument", trackId: ins.id, patch: { bass808: { glide: 0.2, saturation: 0, distortion: 0, punch: 0 } } });
    p = reduce(p, { type: "addNotes", trackId: ins.id, notes: [
      { pitch: 45, start: 0, length: 4, velocity: 110 },
      { pitch: 52, start: 4, length: 4, velocity: 110, slide: true },
    ] });
    const buf = await renderProject(p, media, { mode: "pattern", tail: 0.5 });
    return { first: pitchAt(buf, 0.5, 40, 8192), mid: pitchAt(buf, 1.05, 40, 4096), second: pitchAt(buf, 1.6, 40, 8192), ...stats(buf) };
  },
  async soundLibrary() {
    const out = {};
    for (const snd of SOUND_LIBRARY) {
      let p = empty();
      p = reduce(p, { type: "setBpm", bpm: 120 });
      const sp = soundParams(snd);
      p = reduce(p, { type: "addInstrument", preset: "piano" });
      const ins = p.instruments[p.instruments.length - 1];
      p = reduce(p, { type: "updateInstrument", trackId: ins.id, patch: { preset: sp.preset, synth: sp.synth, bass808: sp.bass808 } });
      const pitch = sp.preset === "808" ? 45 : 57;
      p = reduce(p, { type: "addNotes", trackId: ins.id, notes: [{ pitch, start: 0, length: 8, velocity: 100 }] });
      const buf = await renderProject(p, media, { mode: "pattern", tail: 0.5 });
      out[snd.id] = { preset: sp.preset, expect: pitch + 12 * (sp.synth.octave ?? 0) + (sp.preset === "808" ? sp.bass808.tune : 0), midi: pitchAt(buf, 0.3, 40, 8192), ...stats(buf) };
    }
    return out;
  },
  async synthMonoGlideAndWidth() {
    let p = empty();
    p = reduce(p, { type: "setBpm", bpm: 60 });
    p = reduce(p, { type: "addInstrument", preset: "synth" });
    const ins = p.instruments[p.instruments.length - 1];
    p = reduce(p, { type: "updateInstrument", trackId: ins.id, patch: { synth: { mono: true, glide: 0.3, wave: "triangle", voices: 1, detune: 0, sustain: 1, cutoff: 12000, filterEnv: 0, drive: 0 } } });
    // Overlapping notes → legato glide from A2 (45) to E3 (52).
    p = reduce(p, { type: "addNotes", trackId: ins.id, notes: [{ pitch: 45, start: 0, length: 5, velocity: 110 }, { pitch: 52, start: 4, length: 4, velocity: 110 }] });
    const mono = await renderProject(p, media, { mode: "pattern", tail: 0.5 });
    const glide = { first: pitchAt(mono, 0.5, 40, 8192), mid: pitchAt(mono, 1.1, 40, 2048), second: pitchAt(mono, 1.7, 40, 8192) };
    // Stereo width 0 on the master after a hard-left channel → identical L/R.
    let q = reduce(p, { type: "updateChannel", channelId: ins.id, patch: { pan: -1 } });
    const panned = await renderProject(q, media, { mode: "pattern", tail: 0.2 });
    q = reduce(q, { type: "setInserts", channelId: "master", inserts: [effect("width", { width: 0 })] });
    const narrowed = await renderProject(q, media, { mode: "pattern", tail: 0.2 });
    const rms = (b, c) => Math.sqrt(b.getChannelData(c).reduce((a, x) => a + x * x, 0) / b.length);
    return { glide, panned: [rms(panned, 0), rms(panned, 1)], narrowed: [rms(narrowed, 0), rms(narrowed, 1)], ...stats(mono) };
  },
  async effectsAndRouting() {
    const base = () => withSteps(empty(), "snare", [0, 8]);
    const r = async (p) => renderProject(p, media, { mode: "pattern", tail: 1.5 });
    let p = base();
    const dry = await r(p);
    // Reverb send: energy after the hit should increase a lot.
    p = reduce(base(), { type: "updateChannel", channelId: drum(base(), "snare").id, patch: { sends: { reverb: 1 } } });
    const sn = drum(p, "snare").id;
    p = reduce(p, { type: "updateChannel", channelId: sn, patch: { sends: { reverb: 1 } } });
    const wet = await r(p);
    const tailE = (b) => { const d = b.getChannelData(0); let e = 0; for (let i = Math.floor(SR * 1.8); i < Math.min(d.length, Math.floor(SR * 3.0)); i++) e += d[i] * d[i]; return e; };
    // Compressor insert on the snare channel lowers its peak.
    let q = base();
    const sid = drum(q, "snare").id;
    q = reduce(q, { type: "addEffect", channelId: sid, effectType: "compressor" });
    const fx = q.channels.find((c) => c.id === sid).inserts[0];
    q = reduce(q, { type: "updateEffect", channelId: sid, effectId: fx.id, params: { thresholdDb: -40, ratio: 10, attackMs: 0.1, makeupDb: 0 } });
    const comp = await r(q);
    // Master limiter at -6 dBFS holds the ceiling even when driven.
    let m = withSteps(empty(), "kick", [0, 4, 8, 12]);
    for (const t of m.tracks) m = reduce(m, { type: "updateChannel", channelId: t.id, patch: { volume: 1.5 } });
    m = reduce(m, { type: "setInserts", channelId: "master", inserts: [effect("limiter", { ceilingDb: -6, inputGainDb: 12 })] });
    const lim = await r(m);
    // Delay return: echo 1/8 note later (140 BPM → 0.214 s).
    let d = withSteps(empty(), "perc", [0]);
    const cl = drum(d, "perc").id;
    d = reduce(d, { type: "updateChannel", channelId: cl, patch: { sends: { delay: 1 } } });
    const dl = await r(d);
    // Mute & solo through the channels.
    let s = withSteps(withSteps(empty(), "kick", [0]), "snare", [8]);
    const muted = await r(reduce(s, { type: "toggleMute", trackId: drum(s, "kick").id }));
    const soloed = await r(reduce(s, { type: "toggleSolo", trackId: drum(s, "snare").id }));
    return {
      dryTail: tailE(dry), wetTail: tailE(wet),
      dryPeak: stats(dry).peak, compPeak: stats(comp).peak,
      limPeak: stats(lim).peak,
      delayOnsets: onsets(dl.getChannelData(0), SR, 0.02, 0.05),
      mutedOnsets: onsets(muted.getChannelData(0), SR), soloOnsets: onsets(soloed.getChannelData(0), SR),
    };
  },
  async songModeAndVocals() {
    let p = empty();
    p = reduce(p, { type: "setBpm", bpm: 120 }); // 1 bar = 2 s
    const pat = p.patterns[0];
    p = withSteps(p, "kick", [0]);
    p = reduce(p, { type: "addClip", clip: { patternId: pat.id, lane: 0, start: 1, length: 2 } }); // bars 1-2
    // A vocal take (1 kHz sine 0.5 s) placed at bar 3 (step 48).
    const v = p.vocals[0];
    const ctx = new OfflineAudioContext(1, 1, SR);
    const tb = await ctx.decodeAudioData(sineWav(1000, 0.5).buffer);
    const asset = { id: "a1", name: "take", sampleRate: SR, frames: tb.length, channels: 1 };
    p = reduce(p, { type: "setInserts", channelId: v.id, inserts: [] });
    p = reduce(p, { type: "addTake", trackId: v.id, take: { id: "t1", name: "Take 1", assetId: "a1", startStep: 48, recordedAt: "" }, asset, clip: { takeId: "t1", start: 48, offset: 0, duration: 0.5, gainDb: 0 } });
    const buf = await renderProject(p, { samples: new Map(), assets: new Map([["a1", tb]]) }, { mode: "song", tail: 0.5 });
    const ons = onsets(buf.getChannelData(0), SR, 0.05, 0.3);
    const instrumental = await renderProject(p, { samples: new Map(), assets: new Map([["a1", tb]]) }, { mode: "song", tail: 0.5, muted: new Set(p.vocals.map((x) => x.id)) });
    return { onsets: ons, duration: buf.duration, instrumentalOnsets: onsets(instrumental.getChannelData(0), SR, 0.05, 0.3) };
  },
  async clipEditing() {
    let p = empty();
    p = reduce(p, { type: "setBpm", bpm: 120 }); // 1 bar = 2 s
    p = reduce(p, { type: "setStepCount", stepCount: 32 });
    p = reduce(p, { type: "addInstrument", preset: "synth" });
    const ins = p.instruments[p.instruments.length - 1];
    p = reduce(p, { type: "updateInstrument", trackId: ins.id, patch: { synth: { wave: "triangle", voices: 1, detune: 0, sustain: 1, filterEnv: 0, cutoff: 12000, drive: 0, release: 0.05 } } });
    // A3 in bar 1 of the pattern, A4 in bar 2.
    p = reduce(p, { type: "addNotes", trackId: ins.id, notes: [{ pitch: 57, start: 0, length: 14, velocity: 100 }, { pitch: 69, start: 16, length: 14, velocity: 100 }] });
    p = reduce(p, { type: "addClip", clip: { patternId: p.patterns[0].id, lane: 0, start: 0, length: 2 } });
    p = reduce(p, { type: "splitClips", ids: [p.arrangement.clips[0].id], bar: 1 });
    const right = p.arrangement.clips.find((c) => c.start === 1);
    // Move the right half (which starts in the middle of the pattern) to bar 3, mute the left half.
    p = reduce(p, { type: "updateClip", clipId: right.id, patch: { start: 3 } });
    p = reduce(p, { type: "updateClip", clipId: p.arrangement.clips.find((c) => c.start === 0).id, patch: { muted: true } });
    const buf = await renderProject(p, media, { mode: "song", tail: 0.3 });
    const d = buf.getChannelData(0);
    const rmsAt = (t0, t1) => { let s = 0; const a = Math.floor(t0 * SR), b = Math.floor(t1 * SR); for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / (b - a)); };
    // Vocal clip with a 1 s fade-in.
    const v = p.vocals[0];
    const ctx = new OfflineAudioContext(1, 1, SR);
    const tb = await ctx.decodeAudioData(sineWav(1000, 3).buffer);
    let q = reduce(empty(), { type: "setBpm", bpm: 120 });
    q = reduce(q, { type: "setInserts", channelId: q.vocals[0].id, inserts: [] });
    q = reduce(q, { type: "addTake", trackId: q.vocals[0].id, take: { id: "t1", name: "T", assetId: "a1", startStep: 0, recordedAt: "" }, asset: { id: "a1", name: "T", sampleRate: SR, frames: tb.length, channels: 1 }, clip: { takeId: "t1", start: 0, offset: 0, duration: 3, gainDb: 0, fadeIn: 1 } });
    const vb = await renderProject(q, { samples: new Map(), assets: new Map([["a1", tb]]) }, { mode: "song", tail: 0.2 });
    const vd = vb.getChannelData(0);
    const vr = (t0, t1) => { let s = 0; const a = Math.floor(t0 * SR), b = Math.floor(t1 * SR); for (let i = a; i < b; i++) s += vd[i] * vd[i]; return Math.sqrt(s / (b - a)); };
    void v;
    return { mutedBar0: rmsAt(0.1, 1.8), pitchBar3: pitchAt(buf, 6.5, 60, 4096), rmsBar3: rmsAt(6.1, 7.5), fadeStart: vr(0.05, 0.15), fadeEnd: vr(1.5, 2) };
  },
  async templateHeadroom() {
    const out = {};
    for (const t of TEMPLATES) {
      const p = projectFromTemplate(t.id);
      const buf = await renderProject(p, media, { mode: "pattern", loops: 2, bypassMaster: true });
      out[t.id] = measure([buf.getChannelData(0), buf.getChannelData(1)], buf.sampleRate).truePeakDb;
    }
    return out;
  },
  async realtime() {
    const store = new ProjectStore(withSteps(empty(), "snare", []));
    store.dispatch({ type: "setBpm", bpm: 160 });
    const engine = new AudioEngine(store.getState);
    store.subscribe(() => engine.sync());
    await engine.init({ latencyHint: "interactive" });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const peakOver = async (ms) => {
      let peak = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) { peak = Math.max(peak, engine.getMasterPeak()); await sleep(10); }
      return peak;
    };
    await engine.play();
    const silent = await peakOver(400);
    const kick = drum(store.getState(), "kick");
    for (let s = 0; s < 16; s++) store.dispatch({ type: "toggleStep", trackId: kick.id, step: s });
    const steps = new Set();
    let live = 0;
    for (let i = 0; i < 50; i++) { steps.add(engine.getPlayheadStep()); live = Math.max(live, engine.getMasterPeak()); await sleep(15); }
    store.dispatch({ type: "toggleMute", trackId: kick.id });
    await sleep(500);
    const muted = await peakOver(400);
    store.dispatch({ type: "toggleMute", trackId: kick.id });
    // pause keeps position, play resumes from it
    engine.pause();
    const pausedPos = engine.currentPosition();
    await engine.play();
    await sleep(100);
    const resumedPos = engine.currentPosition();
    engine.stop();
    // Song mode with a clip
    store.dispatch({ type: "addClip", clip: { patternId: store.getState().patterns[0].id, lane: 0, start: 0, length: 1 } });
    engine.setMode("song");
    await engine.play();
    const songPeak = await peakOver(600);
    const songPos = engine.currentPosition();
    engine.stop();
    const result = { silent, live, muted, steps: steps.size, pausedPos, resumedPos, songPeak, songPos, late: engine.lateSteps, worklet: engine.workletReady, workletError: engine.workletError, latency: engine.getLatency(), dspLoad: engine.dspLoad };
    await engine.dispose();
    return result;
  },
};
window.testsReady = true;
