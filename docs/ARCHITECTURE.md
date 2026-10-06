# Architecture — Beatmaker Studio

## Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────┐
│ Electron (Windows)  electron/main.cjs                        │
│  fenêtre, protocole app://, confirmation de fermeture         │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ UI  src/ui/           (TypeScript + DOM, sans framework) │ │
│ │  shell (navigation, transport) · vues BEAT/HOME/…        │ │
│ │  persistence (fichiers .bsproj, autosave IndexedDB)      │ │
│ └───────────────▲───────────────────────┬──────────────────┘ │
│        subscribe │                       │ dispatch(action)   │
│ ┌───────────────┴───────────────────────▼──────────────────┐ │
│ │ CORE  src/core/   (TypeScript pur, testé sous Node)      │ │
│ │  types · reducer (actions pures) · store (undo/redo)     │ │
│ │  projectFile (format .bsproj) · templates                │ │
│ │  timing · scheduler (look-ahead)                         │ │
│ │  engine (AudioContext) · voicer (graphe) · drumSynth     │ │
│ └───────────────────────────┬──────────────────────────────┘ │
└─────────────────────────────┼────────────────────────────────┘
                              ▼
                Web Audio (thread audio de Chromium)
                              ▼
            pilote Windows (WASAPI) → casque / enceintes
```

## Principes

- **Une seule source de vérité** : le `Project` (JSON pur) dans `ProjectStore`.
  Seul le reducer le modifie, et toute action annulable passe par lui → undo/redo gratuit.
- **Le moteur ne stocke pas l'état** : à chaque step, le scheduler relit le projet courant.
  Une note ajoutée pendant la lecture est donc entendue au prochain passage.
- **Le cœur ne dépend d'aucun framework** : il est testé sous Node et dans Chromium, et
  peut être réutilisé tel quel par une UI React plus tard.

## Moteur audio (Phase 1)

### Scheduler « two clocks »
Un timer JS (25 ms) se réveille et programme sur l'horloge audio
(`AudioContext.currentTime`, précise à l'échantillon) tous les steps qui tombent dans
les 120 ms suivantes. La gigue du timer JS ne décale donc jamais le rythme. Si le thread
principal se bloque (onglet en arrière-plan, GC), les steps en retard sont **sautés**
et comptés (`lateSteps`) au lieu d'être joués d'un coup.

### Graphe audio
```
source (sample) → gain vélocité → gain piste (volume, mute/solo) → pan ─┐
                                                                          ▼
                     master gain ─┬─→ analyser pré-clip (voyant CLIP)
                                  └─→ ×¼ → soft clipper (WaveShaper) → analyser → sortie
```
- **Choke groups** : le charley fermé coupe l'ouvert ; une nouvelle 808 coupe la précédente.
- **Sécurité anti-clipping** : un `DynamicsCompressorNode` a été mesuré dans Chromium :
  il ajoute **6 ms** de retard fixe et laisse passer des crêtes à 1,31. Il est remplacé par
  une courbe de soft-clip statique : 0 ms de latence, linéaire sous −1,9 dBFS, plafond
  absolu à −0,18 dBFS. Le voyant CLIP s'allume quand le mix atteint la zone de saturation.
- **Kit intégré synthétisé** (`drumSynth.ts`) en TypeScript pur : l'app sonne sans fichier
  de sample, et les sons sont déterministes et testables.

### Latence
La latence affichée = `baseLatency` (buffer) + `outputLatency` (pilote), telles que
rapportées par Chromium. La taille de buffer choisie dans SETTINGS est transmise comme
`latencyHint` : c'est une demande, la valeur réellement obtenue est affichée.

## Vers un moteur natif (architecture hybride)

Web Audio sous Windows passe par WASAPI en mode partagé : typiquement **10–40 ms** de
latence de sortie. C'est suffisant pour programmer des beats, pas pour le **monitoring
vocal** (objectif < 10 ms aller-retour), qui exige WASAPI exclusif ou **ASIO**.

Plan proposé (Phase 3/4) :
1. Un moteur natif (C++ avec JUCE, ou Rust avec `cpal`) chargé dans le processus
   principal Electron (addon N-API) ou en processus séparé.
2. Il gère l'entrée micro, le monitoring et la chaîne vocale temps réel (gate, EQ,
   de-esser, compresseur, pitch) — tout ce qui est critique en latence.
3. L'UI et le format de projet ne changent pas : le natif reçoit le même `Project`
   et les mêmes événements que le moteur Web Audio actuel (interface `AudioEngine`).
4. Les traitements lourds (débruitage IA, pitch « studio ») tournent hors temps réel,
   après l'enregistrement, comme demandé dans le cahier des charges.

## Format de projet `.bsproj`

Un seul fichier JSON : `{ format, version, savedAt, project, sampleData }`.
Les samples importés y sont embarqués (octets d'origine en base64), donc un projet se
déplace d'une machine à l'autre sans perdre ses sons. Le chargement **valide et répare**
(valeurs bornées, pistes inconnues ignorées, sample manquant → son intégré) et signale
chaque réparation. Un fichier d'une version plus récente est refusé avec un message clair.
Limite connue : avec beaucoup de samples, le fichier grossit (+33 % base64). Un format
archive (zip) pourra le remplacer derrière la même API.

## Fiabilité

- Autosave dans IndexedDB 1,5 s après chaque modification.
- Détection de crash : un drapeau est posé au démarrage et retiré à la fermeture propre.
  S'il est encore là au démarrage suivant → « Recover previous session? ».
- Fermeture avec modifications non sauvegardées : confirmation (navigateur et Electron).
- Aucun effacement de pattern ou de projet sans confirmation ; tout est annulable.
