// Loaded in Chromium by run-browser-tests.mjs. Exposes the compiled core to Playwright.
import { AudioEngine, renderPatternOffline } from "/build/core/engine.js";
import { ProjectStore } from "/build/core/store.js";
import { createDefaultProject } from "/build/core/project.js";
import { reduce } from "/build/core/reducer.js";

/** Minimal 16-bit PCM mono WAV encoder, used to fake an imported sample file. */
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

function emptyProject() {
  return createDefaultProject("browser-test", false);
}

function withSteps(p, kind, steps, velocity) {
  const t = p.tracks.find((x) => x.instrument === kind);
  for (const s of steps) {
    p = reduce(p, { type: "toggleStep", trackId: t.id, step: s });
    if (velocity) p = reduce(p, { type: "setStepVelocity", trackId: t.id, step: s, velocity });
  }
  return p;
}

/** Sample indexes where the signal rises above `thr` after at least `gap` s of quiet. */
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
    const d = buffer.getChannelData(c);
    for (const x of d) {
      if (!Number.isFinite(x)) nan = true;
      peak = Math.max(peak, Math.abs(x));
      sumSq += x * x;
    }
  }
  return { peak, rms: Math.sqrt(sumSq / (buffer.length * buffer.numberOfChannels)), nan };
}

window.tests = {
  async offlineTiming() {
    let p = withSteps(emptyProject(), "kick", [0, 4, 8, 12]);
    p = reduce(p, { type: "setBpm", bpm: 120 });
    const buf = await renderPatternOffline(p, { sampleRate: 44100, loops: 1, tail: 0.5 });
    return { onsets: onsets(buf.getChannelData(0), 44100), ...stats(buf) };
  },
  async offlineSwing() {
    let p = withSteps(emptyProject(), "closedHat", [0, 1, 2, 3]);
    p = reduce(p, { type: "setBpm", bpm: 120 });
    p = reduce(p, { type: "setSwing", swing: 100 });
    const buf = await renderPatternOffline(p, { sampleRate: 44100, tail: 0.2 });
    return onsets(buf.getChannelData(0), 44100, 0.05, 0.02);
  },
  async offlineMuteSolo() {
    let p = withSteps(emptyProject(), "kick", [0]);
    p = withSteps(p, "snare", [8]);
    const kick = p.tracks.find((t) => t.instrument === "kick");
    const snare = p.tracks.find((t) => t.instrument === "snare");
    const render = async (q) => onsets((await renderPatternOffline(q, { tail: 0.5 })).getChannelData(0), 44100);
    return {
      both: await render(p),
      kickMuted: await render(reduce(p, { type: "toggleMute", trackId: kick.id })),
      snareSolo: await render(reduce(p, { type: "toggleSolo", trackId: snare.id })),
    };
  },
  async offlineVelocity() {
    const loud = await renderPatternOffline(withSteps(emptyProject(), "snare", [0], 127), { tail: 0.4 });
    const soft = await renderPatternOffline(withSteps(emptyProject(), "snare", [0], 30), { tail: 0.4 });
    return { loud: stats(loud).peak, soft: stats(soft).peak };
  },
  async offlineFullBeatNoClip() {
    // Everything on every step at max volume: the safety limiter must prevent clipping.
    let p = emptyProject();
    for (const t of p.tracks) {
      p = reduce(p, { type: "updateTrack", trackId: t.id, patch: { volume: 1.5 } });
      for (let s = 0; s < 16; s++) p = reduce(p, { type: "toggleStep", trackId: t.id, step: s });
    }
    p = reduce(p, { type: "setMasterVolume", volume: 1.5 });
    return stats(await renderPatternOffline(p, { loops: 2 }));
  },
  async offlinePitch() {
    // 808 pitched +12 st must have ~2× the zero-crossing rate.
    const zc = async (pitch) => {
      let p = withSteps(emptyProject(), "808", [0]);
      const t = p.tracks.find((x) => x.instrument === "808");
      p = reduce(p, { type: "updateTrack", trackId: t.id, patch: { pitch } });
      const d = (await renderPatternOffline(p, { tail: 1 })).getChannelData(0);
      let n = 0;
      for (let i = 4410 + 1; i < 4410 + 22050; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++;
      return n;
    };
    return { base: await zc(0), up: await zc(12) };
  },
  async importedSample() {
    // Decode a WAV through the real engine path, then render with it on the kick track.
    let p = withSteps(emptyProject(), "kick", [0]);
    p = reduce(p, { type: "addSample", sample: { id: "smp_sine", name: "sine.wav", mime: "audio/wav" } });
    const kick = p.tracks.find((t) => t.instrument === "kick");
    p = reduce(p, { type: "assignSample", trackId: kick.id, sampleId: "smp_sine" });
    const engine = new AudioEngine(() => p);
    const decoded = await engine.loadSample("smp_sine", sineWav(1000, 0.3));
    const buf = await renderPatternOffline(p, { samples: new Map([["smp_sine", decoded]]), tail: 0.5 });
    const d = buf.getChannelData(0);
    let zc = 0;
    for (let i = 1; i < 0.25 * 44100; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) zc++;
    let rejected = false;
    try {
      await engine.loadSample("bad", new Uint8Array([1, 2, 3, 4]));
    } catch {
      rejected = true;
    }
    await engine.dispose();
    return { duration: decoded.duration, zeroCrossingsIn250ms: zc, rejectedGarbage: rejected };
  },
  async realtimePlayback() {
    const store = new ProjectStore(emptyProject());
    store.dispatch({ type: "setBpm", bpm: 160 });
    const engine = new AudioEngine(store.getState);
    store.subscribe(() => engine.syncMixer());
    await engine.init({ latencyHint: "interactive" });
    await engine.play();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const peakOver = async (ms) => {
      let peak = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) {
        peak = Math.max(peak, engine.getMasterPeak());
        await sleep(10);
      }
      return peak;
    };
    const silentPeak = await peakOver(400);
    const stepsSeen = new Set();
    // Live edit while playing: turn the kick on, on every step.
    const kick = store.getState().tracks.find((t) => t.instrument === "kick");
    for (let s = 0; s < 16; s++) store.dispatch({ type: "toggleStep", trackId: kick.id, step: s });
    let livePeak = 0;
    for (let i = 0; i < 60; i++) {
      stepsSeen.add(engine.getPlayheadStep());
      livePeak = Math.max(livePeak, engine.getMasterPeak());
      await sleep(15);
    }
    // Live mute: output must fall back to (near) silence.
    store.dispatch({ type: "toggleMute", trackId: kick.id });
    await sleep(600);
    const mutedPeak = await peakOver(400);
    const latency = engine.getLatency();
    const lateSteps = engine.lateSteps;
    engine.stop();
    const stoppedStep = engine.getPlayheadStep();
    await engine.dispose();
    return { silentPeak, livePeak, mutedPeak, stepsSeen: stepsSeen.size, latency, lateSteps, stoppedStep };
  },
};
window.testsReady = true;
