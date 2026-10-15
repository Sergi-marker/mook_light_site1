# Vidéo Studio

Collez un texte : il devient une vidéo animée, avec un ou deux personnages « pictogramme » qui jouent chaque phrase, et des sous-titres qui apparaissent mot par mot. Le style est celui des vidéos de psychologie qu'on voit sur TikTok (fond sombre, projecteur, sol lumineux). Ça marche aussi pour le sport et les histoires.

Application web sans installation ni compilation : elle tourne dans Chrome, Edge ou Firefox, sur ordinateur et sur téléphone.

```bash
npm run video          # http://127.0.0.1:5174/
node scripts/serve-video.mjs 5174 --host 0.0.0.0   # pour l'ouvrir depuis un téléphone du même Wi-Fi
```

## Utilisation

1. **Texte** : collez votre texte, puis touchez **Créer la vidéo**.
   - Chaque phrase devient une scène. Une phrase trop longue est découpée pour rester lisible.
   - Une ligne qui commence par `#` devient un carton de titre.
   - Pour imposer une animation, mettez un tag en début de phrase : `[rire] Pourtant tu rigoles.`
2. **Scènes** : vous pouvez changer le texte, l'animation, le nombre de personnages (1 ou 2) et la durée de chaque scène.
3. **Personnages** : modèles prêts (Penseur, Sportif, Femme, Ado, Enfant, Costaud, Grand-père, Bureau…), puis réglage de la taille, de la corpulence, du ventre, de la tête, des jambes, des bras et du buste, des couleurs, des cheveux et des accessoires (lunettes, barbe, casquette, bandeau, jupe, cravate). Le second personnage se règle séparément.
4. **Style** : format 9:16 (TikTok, Reels, Shorts), 16:9 (YouTube) ou 1:1, décor (bleu nuit, noir, sépia, forêt, bordeaux, aube), sous-titres (mot par mot, karaoké, phrase entière), taille du texte, couleur d'accent, signature `@pseudo`, barre de progression, vitesse de lecture.
5. **Voix & musique** : lecture à voix haute pendant l'aperçu (voix du système, 12 langues), musique d'ambiance générée (mélancolique, calme, motivation, mystère) et, pour la vidéo finale, enregistrement de votre voix au micro pendant l'export.
6. **Exporter** : enregistre un fichier MP4 (ou WebM selon le navigateur), à télécharger ou partager directement.

## Animations

30 animations : repos, réfléchit, perdu, idée, triste, pleure, seul, fatigué, marche, court, rit, surpris, en colère, amour, joie, hausse les épaules, tombe, salue, assis sur un banc, téléphone, lit une histoire, musculation, squats, médite, et à deux personnages : se moque, dispute, parle, accuse, ignore, câlin. Elles bougent en continu (respiration, clignement des yeux, gestes), passent en douceur d'une scène à l'autre, et la caméra varie (zoom lent, léger décalage, personnage tourné d'un côté ou de l'autre) pour que deux scènes ne soient jamais identiques.

L'animation est choisie à partir des mots de la phrase, en français, allemand, anglais et espagnol (« pleure / weint / cry » → pleure, « muscu / Krafttraining / workout » → musculation…). Si aucun mot ne correspond, l'application alterne des animations neutres pour que la vidéo ne soit jamais figée.

## Langues et traduction

- L'interface est en français, allemand ou anglais (sélecteur en haut à droite).
- Le texte peut être écrit dans n'importe quelle langue ; la voix de l'aperçu propose 12 langues.
- **Traduire** (onglet Texte) traduit chaque scène dans une autre langue en gardant les mêmes animations. **Mise en scène par l'IA** fait lire tout le texte à Claude pour choisir l'animation de chaque scène. Ces deux fonctions sont optionnelles : elles utilisent votre clé API Anthropic (gardée seulement dans le navigateur) et envoient le texte des scènes à Anthropic. Elles utilisent le SDK officiel `@anthropic-ai/sdk`, chargé à la demande, avec repli automatique sur un autre modèle si une demande est déclinée.

## Limites connues

- **La voix de synthèse n'est pas enregistrée dans le fichier exporté** : les navigateurs ne donnent pas accès à son signal audio. Pour une vidéo qui parle, enregistrez votre voix au micro pendant l'export, ou ajoutez la voix « texte vers parole » de TikTok / CapCut sur la vidéo exportée.
- L'export se fait en temps réel : une vidéo de 3 minutes prend 3 minutes. Gardez l'écran allumé et la page ouverte (sur téléphone, l'enregistrement s'arrête si la page passe en arrière-plan).
- Le format MP4 dépend du navigateur (Chrome / Edge récents) ; sinon le fichier est en WebM, accepté par YouTube et convertible pour TikTok.

## Fichiers

| Fichier | Rôle |
|---|---|
| `js/script.js` | Texte → scènes, détection des animations, durées, timeline |
| `js/poses.js` | Squelette et les 30 animations (fonctions du temps) |
| `js/figure.js` | Dessin du personnage, morphologie, accessoires, symboles, objets |
| `js/renderer.js` | Rendu d'une image : décor, projecteur, caméra, sous-titres, titres |
| `js/audio.js` | Musique d'ambiance (Web Audio) et voix de synthèse |
| `js/export.js` | Enregistrement vidéo (MediaRecorder) |
| `js/translate.js` | Traduction et mise en scène par Claude |
| `js/app.js`, `js/i18n.js` | Interface et textes FR / DE / EN |

Tests : `node --test tests/unit/videoStudio.test.ts` (découpage, détection, poses) et `npm run test:video` (interface dans Chromium et export d'une vraie vidéo).
