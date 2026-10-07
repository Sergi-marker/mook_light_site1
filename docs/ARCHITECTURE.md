# Architecture — Beatmaker Studio

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Electron (Windows) — electron/main.cjs + preload.cjs                       │
│   app:// protocol · mic/MIDI permissions · IPC: online assistant (SDK), CPU │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ UI  src/ui/  (TypeScript + DOM, no framework)                          │ │
│ │  shell (transport, nav) · views: HOME BEAT MELODY VOCALS MIXER         │ │
│ │  ARRANGEMENT AI PROJECTS SETTINGS · App controller (app.ts)            │ │
│ └──────────────┬───────────────────────────────▲─────────────────────────┘ │
│     dispatch(action)                     subscribe                          │
│ ┌──────────────▼───────────────────────────────┴─────────────────────────┐ │
│ │ CORE  src/core/  — pure TypeScript, unit-tested in Node                │ │
│ │  types · reducer (all edits, undo/redo) · store · projectFile (.bsproj)│ │
│ │  dsp/ (FFT, YIN, dynamics, loudness, autopitch, denoise, analysis)     │ │
│ │  ai/ (prompt, drums, melody, beat, assistant, mix, master, take comp)  │ │
│ └──────────────┬─────────────────────────────────────────────────────────┘ │
│ ┌──────────────▼─────────────────────────────────────────────────────────┐ │
│ │ AUDIO  src/audio/ — Web Audio                                          │ │
│ │  engine (transport, devices) · sequencer · instruments · mixer/effects │ │
│ │  worklets/processors (real-time DSP) · recorder · render (offline)     │ │
│ │  studioWorker (heavy offline DSP) · export (WAV/MP3) · midi            │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
        mic / interface ──► MediaStream ──► recorder worklet ──► vocal channel
        Web Audio graph ──► WASAPI ──► headphones / speakers
```

## Design principles

- **Single source of truth.** The `Project` (plain JSON) lives in `ProjectStore`. Only the
  reducer changes it, so every edit (including AI suggestions) is undoable, saveable and
  testable.
- **The engine stores no state.** It reads the current project on every step, so edits made
  during playback are heard straight away. AI PREVIEW plays a *modified copy* of the project
  without touching the real one; APPLY sends the same actions to the store.
- **Same code for listening and exporting.** The `Sequencer`, `MixerGraph`, instruments and
  effects drive `AudioContext` (real time) and `OfflineAudioContext` (export, AI analysis)
  alike.
- **Non-destructive vocals.** Takes are always recorded RAW. The live chain is applied at
  playback, and STUDIO processing (PSOLA pitch, spectral cleaning) writes separate audio.
  RAW/PROCESSED toggles between the two.
- **Testable DSP.** All DSP lives in `src/core/dsp`, independent of Web Audio. AudioWorklets
  and the Web Worker import those same modules.

## Real-time audio

- **"Two clocks" scheduler**: a 25 ms JS timer schedules steps 120 ms ahead on the audio
  clock (sample-accurate timing). It supports pattern/song loops and count-in. If the main
  thread stalls, late steps are skipped rather than bursting.
- **Mixer**: `source → input → inserts → pan → fader → meter`, then the bus (DRUM / MUSIC /
  VOCAL), REVERB and DELAY returns, and MASTER → soft-clipper (0 latency, ceiling −0.18 dBFS).
- **Effects**: EQ, saturation, distortion, reverb (generated IR) and delay (tempo-synced,
  ping-pong) and Stereo Width (mid/side gain matrix) use native nodes. Compressor, gate, de-esser, limiter, leveler, denoise and
  AUTO PITCH run as AudioWorklets (`bs-insert`). None of them has look-ahead, hence **no
  added latency** (except AUTO PITCH while it corrects, ≈10 ms). Fast path: silent input is
  not processed. Dynamics are computed at control rate (every 8 samples, interpolated).
- **Instruments**: piano (additive, inharmonicity), pluck (Karplus-Strong), e-piano and bells
  (FM), synth/pad/strings/bass (1–7 unison oscillators of any waveform + filter envelope, LFO
  vibrato / filter wobble, optional mono legato with glide, drive stage per instrument), monophonic 808 (glide,
  punch, saturation, distortion, EQ, compression; the compressor's 6 ms look-ahead is
  compensated by early scheduling).
- **Recording**: `getUserMedia` (with echo cancellation, noise suppression and AGC disabled)
  feeds the `bs-recorder` worklet, which captures timestamped frames. The take is aligned on
  the exact audio frame of the start step, plus the output and input latency compensation.

## Editing model (v3 additions)

- **Pattern clips** carry an optional `offset` (bars into the pattern) and `muted` flag. Splitting a
  clip at the cursor gives two clips; the right one gets an offset so it keeps playing the right
  part of the pattern. The sequencer computes the local step as `(pos − start + offset·spb) mod stepCount`.
- **Audio clips** carry `fadeIn` / `fadeOut` (seconds) and `muted`. The gain envelope is scheduled
  per clip (min 5 ms ramps) and handles playback that starts in the middle of a clip.
- **Insert / delete bars** (`insertBars`) shifts or crops pattern clips, sections, the loop region,
  vocal clips (with take offsets) and automation points in one undoable step.
- **Routing**: each track channel has an `output` (any bus or the master). The mixer reconnects live.
- **Note tools** (`src/core/noteTools.ts`): diatonic chords, scale-degree transpose, humanize,
  legato, strum, reverse, velocity ramps, arpeggiator — pure functions, unit-tested.
- **Libraries**: `soundLibrary.ts` (36 instrument sounds = preset + overrides) and
  `effectPresets.ts` (per-effect presets + 7 complete vocal chains, which reuse existing effect ids
  so live audio nodes are updated rather than rebuilt).

## Vocal DSP

| Module | Method |
|---|---|
| Pitch detection | YIN (sub-sample parabolic interpolation), ×2 decimation in live mode |
| LIVE PITCH | Two-head delay-line pitch shifter, retune speed, humanize, dry bypass when no correction is needed |
| STUDIO PITCH | TD-PSOLA on pitch marks, formants preserved, adjustable formant shift |
| LIVE clean | 4-band complementary downward expander, minimum-statistics noise floor |
| AI VOICE CLEAN | STFT 2048/512 sqrt-Hann WOLA, noise profile from the quiet frames, floored Wiener gain, time/frequency smoothing, attenuation of inter-phrase silences |
| AUTO VOICE | Analysis (SNR, dynamics, sibilance 5–10 kHz, low end, mud, presence, pitch stability, clipping, LUFS, voice key) → conservative chain recommendation |
| Consistency | Leveler (target RMS, ±max dB, frozen in silence) + clip loudness alignment (LUFS) |

## AI (local)

- **Beat**: free-text prompt (FR/EN) → genre, BPM, key, mood, energy, heavy 808. Drums come
  from per-genre probability grids. Chords use mood-based progressions with voice leading. The
  melody is a developed motif (A A′ B A″, chord tones on strong beats). The 808 follows chord
  roots on the kicks, with slides. Five patterns plus a 72-bar arrangement are generated.
- **Assistant**: project analysis (per-pattern energy, Krumhansl key detection, out-of-key 808
  notes, structure). It answers with actions that can be previewed and then applied.
  Optionally, Claude online via the main process (`@anthropic-ai/sdk`, model
  `claude-opus-5-5`, server-side refusal fallbacks), after consent; only text is sent.
- **AI MIX**: renders the full mix and each group, then measures LUFS, peaks, band balance
  against a rap reference, stereo and PLR. It reports problems with corrective actions.
- **AI MASTER**: EQ, glue compression, light saturation, limiter (ceiling −1 dBTP). The gain
  is computed for the target, checked on a real render and corrected; the true peak is checked.
- **Take comp**: per-bar scoring (presence, clipping, SNR, pitch stability, level consistency).
- **CHORDS / 808 / BASS**: mood progressions (scale degrees, voice-led chords) and a bass line on the
  chord roots locked to the kick (or sustained / syncopated), with slides.
- **VARIATIONS** (`ai/variation.ts`): fill, hi-hat rolls, half-time, sparse, busy and drop-out,
  produced as a new pattern so the original stays intact.
- **STRUCTURE** (`ai/structure.ts`): 5 song templates mapped onto the user's existing patterns,
  by name (Intro / Couplet / Refrain / Hook…) or, failing that, by pattern energy.

## Project format `.bsproj` (v2)

A standard ZIP containing `project.json`, `samples/<id>` (original files) and `audio/<id>.wav`
(takes and processed versions, 24-bit). Loading validates and repairs every field. v1 files
(Phase 1) are migrated. Autosave stores the JSON plus each audio file once in IndexedDB.
Crash recovery restores the audio too.

## Towards a native engine (Windows)

Web Audio under Windows goes through shared-mode WASAPI (typically 10–40 ms of output
latency). For monitoring below 10 ms, a native engine (JUCE / Rust `cpal`, exclusive WASAPI or
ASIO) can be loaded by the Electron main process. The `AudioEngine` and `Recorder` interfaces
and the project format stay the same, and the core DSP can be reused (it is pure TypeScript,
portable to WASM).
