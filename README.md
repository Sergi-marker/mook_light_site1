# Beatmaker Studio

Application de production musicale pour rap, trap, drill, afrobeat et R&B : beats, mélodies,
voix et mix, avec de l'IA ajoutée progressivement. Cible : **Windows** (Electron).

> **État : PHASE 1 — AUDIO CORE.** Le step sequencer fonctionne réellement. Les modules
> MELODY, VOCALS, MIXER, ARRANGEMENT et AI sont marqués « en développement » dans l'app,
> sans bouton factice.

## Ce qui fonctionne (Phase 1)

| Fonction | Détail |
|---|---|
| Step sequencer | Kick, Snare, Clap, Closed Hat, Open Hat, Perc, 808 · 16/32/64 steps |
| Édition | Clic = note · molette ou Shift+glisser = vélocité · effacer piste/pattern · dupliquer ×2 |
| Transport | Play/Stop (Espace), BPM 40–220, swing 0–100 %, signature (affichage des mesures) |
| Mix par piste | Volume, pan, pitch (±24 demi-tons, mode PRO), mute, solo · volume master |
| Sons | Kit intégré synthétisé + import WAV/MP3/AIFF/OGG/FLAC (selon le décodeur Chromium) |
| Édition en direct | Toute modification pendant la lecture est entendue au step suivant |
| Undo / Redo | Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y), mouvements de curseur regroupés |
| Projets | Sauvegarde Ctrl+S (`.bsproj`, samples inclus), ouverture Ctrl+O, 6 templates |
| Fiabilité | Autosave, réouverture du dernier projet, « Recover previous session? » après crash |
| Audio | Latence affichée, 44,1/48 kHz, buffer 64–1024 samples, voyant CLIP, anti-clipping 0 ms |
| Interface | Thème sombre, modes SIMPLE / PRO, raccourcis, info-bulles |

## Installation (Windows)

Prérequis : [Node.js 22 LTS](https://nodejs.org) (≥ 22.18).

```bash
npm install
npm start          # application desktop Electron
```

Autres commandes :

```bash
npm run dev        # version navigateur sur http://127.0.0.1:5173 (Chrome/Edge)
npm run dist:win   # installeur Windows (NSIS) + version portable dans release/
npm run test:all   # typecheck + tous les tests
```

## Tests

| Commande | Contenu | Résultat |
|---|---|---|
| `npm run typecheck` | TypeScript strict sur tout `src/` | ✅ |
| `npm test` | 58 tests unitaires (Node) : reducer, BPM, undo/redo, scheduler, swing, synthèse, soft-clip, format projet, templates | ✅ 58/58 |
| `npm run test:browser` | 9 tests du moteur dans Chromium : timing des notes au sample près, swing, mute/solo, vélocité, pitch, import WAV, absence de clipping, lecture temps réel, édition en direct, 0 step en retard | ✅ 9/9 |
| `npm run test:e2e` | 17 étapes pilotant l'interface : lancement, BPM, pattern, Play (audio mesuré), mute/solo clavier, undo/redo, vélocité, import sample, fichier invalide, sauvegarde, réouverture, crash recovery, réglages audio, modules en développement | ✅ 17/17 |

Les tests navigateur et e2e utilisent Playwright (`npm i` l'installe ; il réutilise un Chromium déjà installé).

## Structure

```
src/core/       moteur et modèle, sans framework (testés)
  types.ts        modèle de données du projet
  reducer.ts      toutes les modifications (actions pures)
  store.ts        état + undo/redo + regroupement des modifications
  scheduler.ts    scheduler look-ahead précis à l'échantillon
  engine.ts       AudioContext, lecture, samples, latence, rendu offline
  voicer.ts       graphe audio (pistes, choke, master, soft-clip)
  drumSynth.ts    kit de batterie synthétisé
  projectFile.ts  format .bsproj (sauvegarde / chargement validé)
src/ui/         interface (shell, vues, persistance, raccourcis)
electron/       processus principal Electron
tests/          unit/ (Node) · browser/ (moteur dans Chromium) · e2e/ (interface)
docs/ARCHITECTURE.md
```

## Problèmes connus / limites

- **Electron pas encore exécuté** : l'environnement de développement n'avait pas accès au
  registre npm. L'app a été testée dans Chromium (le même moteur qu'Electron), mais
  `npm start` et `npm run dist:win` n'ont pas encore été lancés. À vérifier en premier sur Windows.
- **UI sans React pour l'instant** : même raison (npm inaccessible). L'UI est en TypeScript
  sans framework ; le cœur est indépendant de l'UI, donc un passage à React reste possible.
- **Latence** : Web Audio sous Windows (WASAPI partagé) donne en général 10–40 ms. C'est
  suffisant pour les beats, pas pour le monitoring vocal. Un moteur natif ASIO/WASAPI
  exclusif est prévu (voir docs/ARCHITECTURE.md).
- **CPU** : non mesurable via Web Audio, l'écran SETTINGS l'indique au lieu d'inventer un chiffre.
- **Taille de buffer** : c'est une demande faite au système, la valeur obtenue est affichée.
- **Sortie audio** : le périphérique se choisit dans Windows pour l'instant.
- **Signature rythmique** : elle n'affecte que l'affichage des mesures (le métronome arrive en Phase 3).
- **Pas encore faits** (phases suivantes) : accent, humanisation, longueur de note,
  découpage/reverse/fades des samples, export WAV/MP3. Le rendu offline existe déjà dans le moteur (`renderPatternOffline`), l'export WAV s'appuiera dessus.

## Prochaine étape — Phase 2 (MIDI)

Piano roll (notes, déplacement, redimensionnement, vélocité, snap, zoom, sélection multiple),
gammes et SCALE LOCK, 808 mélodique avec glide/slide, entrée clavier MIDI (Web MIDI).
