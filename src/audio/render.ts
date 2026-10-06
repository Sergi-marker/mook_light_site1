// Offline rendering (faster than real time) through exactly the same mixer, effects and
// instruments as live playback. Used for export (master / instrumental / vocals / stems),
// AI mix & master analysis and generator previews.

import { stepsPerBarOf } from "../core/project.ts";
import { stepDuration } from "../core/timing.ts";
import type { Project } from "../core/types.ts";
import { WORKLET_URL } from "./engine.ts";
import { MixerGraph } from "./mixer.ts";
import { Sequencer, songEndStep, type PlayMode } from "./sequencer.ts";

export interface RenderMedia {
  samples: ReadonlyMap<string, AudioBuffer>;
  assets: ReadonlyMap<string, AudioBuffer>;
}

export interface RenderOptions {
  sampleRate?: number;
  mode?: PlayMode;
  /** Pattern mode: number of loops. */
  loops?: number;
  /** Song mode: [startBar, endBar). Default: whole song. */
  range?: [number, number];
  /** Source channels to silence (stems / instrumental / vocals-only). */
  muted?: Set<string>;
  /** Seconds rendered after the end for reverb / delay / 808 tails. */
  tail?: number;
  /** Override the master channel inserts with a bypass (raw mix for AI MASTER analysis). */
  bypassMaster?: boolean;
  onProgress?: (fraction: number) => void;
}

export async function renderProject(p: Project, media: RenderMedia, o: RenderOptions = {}): Promise<AudioBuffer> {
  const sr = o.sampleRate ?? 44100;
  const mode = o.mode ?? "song";
  const spb = stepsPerBarOf(p);
  let from = 0;
  let to: number;
  if (mode === "pattern") {
    const pat = p.patterns.find((x) => x.id === p.currentPatternId) ?? p.patterns[0];
    to = pat.stepCount * (o.loops ?? 1);
  } else if (o.range) {
    from = o.range[0] * spb;
    to = o.range[1] * spb;
  } else {
    to = Math.max(spb, songEndStep(p));
  }
  const dur = stepDuration(p.bpm);
  const tail = o.tail ?? 2;
  const length = Math.ceil(((to - from) * dur + tail) * sr);
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate: sr });
  let workletReady = true;
  try {
    await ctx.audioWorklet.addModule(WORKLET_URL);
  } catch {
    workletReady = false;
  }
  const mixer = new MixerGraph(ctx, ctx.destination, { bpm: () => p.bpm, key: () => p.key, workletReady });
  mixer.sync(p, true);
  if (o.bypassMaster) mixer.setBypass("master", true);
  const muteSink = ctx.createGain();
  muteSink.gain.value = 0;
  muteSink.connect(ctx.destination);
  const seq = new Sequencer(ctx, mixer, muteSink);
  seq.syncInstruments(p);
  for (const [k, v] of media.samples) seq.samples.set(k, v);
  for (const [k, v] of media.assets) seq.assets.set(k, v);
  seq.opts = { muted: o.muted, metronome: false };
  if (mode === "song" && from > 0) seq.startRunningClips(p, from, 0);
  for (let pos = from; pos < to; pos++) seq.scheduleStep(p, mode, mode === "pattern" ? pos : pos, (pos - from) * dur);
  if (o.onProgress) {
    const total = length / sr;
    for (let s = 1; s < Math.floor(total); s++) {
      void ctx.suspend(s).then(() => {
        o.onProgress!(s / total);
        void ctx.resume();
      });
    }
  }
  const out = await ctx.startRendering();
  o.onProgress?.(1);
  seq.dispose();
  mixer.dispose();
  return out;
}

/** Channels of an AudioBuffer as plain arrays. */
export function bufferChannels(b: AudioBuffer): Float32Array[] {
  return Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i));
}

/** Source channel groups for export variants. */
export function exportGroups(p: Project) {
  const vocals = new Set(p.vocals.map((v) => v.id));
  const music = new Set([...p.tracks.map((t) => t.id), ...p.instruments.map((i) => i.id)]);
  return {
    instrumental: vocals,
    vocalsOnly: music,
    stem: (channelId: string) => new Set([...vocals, ...music].filter((id) => id !== channelId)),
  };
}
