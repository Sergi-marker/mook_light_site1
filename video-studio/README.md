# Vidéo Studio

Collez un texte : il devient une vidéo animée, avec un ou deux personnages « pictogramme » qui jouent chaque phrase, et des sous-titres qui apparaissent mot par mot. Le style est celui des vidéos de psychologie qu'on voit sur TikTok (fond sombre, projecteur, sol lumineux). Ça marche aussi pour le sport et les histoires.

Application web sans installation ni compilation : elle tourne dans Chrome, Edge ou Firefox, sur ordinateur et sur téléphone.

```bash
npm run server:dev     # version complète (comptes, offres, partage) : http://localhost:8080
npm run video          # version locale, sans compte ni limites : http://127.0.0.1:5174/
```

Pour la mise en ligne (comptes, abonnements Stripe, publicité, pages légales), voir [server/README.md](../server/README.md).

## Offres

| Offre | Prix | Vidéos | Publicité |
|---|---|---|---|
| Gratuit | 0 € | 3 par jour, 30 s maximum | oui |
| Premium | 5 € / mois | illimitées | oui |
| Premium sans pub | 10 € / mois | illimitées | non |

Après l'export, **Partager (lien)** met la vidéo en ligne et donne un lien public (page avec lecteur et boutons WhatsApp, Telegram, Facebook, X).

## Utilisation

1. **Texte** : collez votre texte, puis touchez **Créer la vidéo**.
   - Chaque phrase devient une scène. Une phrase trop longue est découpée pour rester lisible.
   - Une ligne qui commence par `#` devient un carton de titre.
   - Pour imposer une animation, mettez un tag en début de phrase : `[rire] Pourtant tu rigoles.`
2. **Scènes** : vous pouvez changer le texte, l'animation, le nombre de personnages (1 ou 2) et la durée de chaque scène.
3. **Personnages** : modèles prêts (Penseur, Sportif, Femme, Ado, Enfant, Costaud, Grand-père, Bureau…), puis réglage de la taille, de la corpulence, du ventre, de la tête, des jambes, des bras et du buste, des couleurs, des cheveux et des accessoires (lunettes, barbe, casquette, bandeau, jupe, cravate). Le second personnage se règle séparément.
4. **Style** : format 9:16 (TikTok, Reels, Shorts), 16:9 (YouTube) ou 1:1, décor (bleu nuit, noir, sépia, forêt, bordeaux, aube), sous-titres (mot par mot, karaoké, phrase entière), taille du texte, couleur d'accent, signature `@pseudo`, barre de progression, vitesse de lecture.
5. **Voix & musique** :
   - **Voix naturelle (dans la vidéo)** : générée sur l'appareil, jouée dans l'aperçu et **enregistrée dans la vidéo exportée** ; chaque scène dure le temps de sa phrase et les sous-titres suivent la voix.
     - **Voix ✦ HD** : [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) (modèle de 2025, licence Apache 2.0, utilisable commercialement), bien plus naturelle. Disponible en français (voix de femme), anglais (9 voix), espagnol, italien et portugais. Pour les langues autres que l'anglais, la prononciation est calculée par espeak-ng puis donnée au modèle. Le modèle tourne dans un worker (l'interface reste fluide) et utilise la carte graphique (WebGPU) si elle est disponible. Premier téléchargement : environ 90 Mo (300 Mo en mode carte graphique).
     - **Voix standard** : [Piper](https://github.com/rhasspy/piper), pour l'allemand, les voix d'homme françaises et les autres langues.
   - **Voix du téléphone** : la voix du système, pour un aperçu rapide (elle n'est pas enregistrée dans le fichier).
   - **Musique d'ambiance** générée : mélancolique, calme, motivation, mystère.
   - **Votre propre audio** : importez une voix off ou une musique (MP3, WAV, M4A), mixée dans l'export ; ou enregistrez votre voix au micro pendant l'export.
6. **Exporter** : enregistre un fichier MP4 (ou WebM selon le navigateur), à télécharger ou partager directement.

## Écrire son script

| Écrire | Effet |
|---|---|
| Une phrase | Une scène, avec son sous-titre et son animation |
| `# Titre` en début de ligne | Carton de titre |
| `[rire] …`, `[triste] …`, `[pense] …`, `[court] …`, `[muscu] …` | Geste imposé |
| `Lui : …` / `Elle : …` (au moins deux répliques chacun) | Dialogue : deux personnages, chacun avec sa voix ; celui qui parle remue la bouche, l'autre écoute |
| `Narrateur : …` | Voix off |
| `*mot*` | Mot en couleur dans le sous-titre (les emojis marchent aussi) |
| `[pause]`, `[pause 2]` seul sur une ligne | Silence (en secondes) |

Le script peut aussi être importé depuis un fichier `.txt`, Word (`.docx`) ou de sous-titres (`.srt`).

## Personnaliser

- **Styles de chaîne** (onglet Style) : quatre styles prêts (Psychologie sombre, Sport énergique, Histoire / conte, Urbain / dialogue), et **vos propres styles** enregistrés. Un style comprend le décor, les personnages, les sous-titres, la musique, les voix et la marque. Toutes vos vidéos gardent ainsi le même aspect.
- **Chaque scène** (onglet Scènes) : cadrage (plan large, gros plan, zoom avant ou arrière), décor (couleur, chambre, rue, parc, salle de sport, ciel étoilé, votre image), position du personnage, personnage qui parle, durée. On peut aussi ajouter une pause.
- **Personnages** : 13 modèles, couleur de peau (8 teintes ou au choix), haut (t-shirt, sweat à capuche, chemise, robe) et bas (pantalon, short) avec leurs couleurs, 7 coiffures, 4 styles d'yeux, accessoires, silhouette. Les **traits du visage s'éclaircissent sur une peau foncée** pour rester visibles. « Mes personnages » enregistre vos créations.
- **Sous-titres** : 7 polices, position (haut, milieu, bas), fond (aucun, bandeau sombre, mot surligné façon TikTok), couleur du texte et d'accent, nom de celui qui parle.
- **Marque** : accroche d'ouverture (gros texte qui « frappe » pendant la première seconde), écran de fin avec votre @signature, logo dans un coin, image de fond personnelle.
- **Voix** : une voix pour le narrateur et une pour chaque personnage, vitesse réglable.

## Personnage et animations

Le personnage a un contour net et un halo de contre-jour qui le détachent du décor, un léger modelé (lumière du projecteur), des mains, des pieds et des épaules arrondies. Ses mouvements ont de l'inertie (la tête et les bras suivent le corps avec un léger retard), il s'étire dans les sauts, et les changements de scène se font avec un petit rebond.

30 animations : repos, réfléchit, perdu, idée, triste, pleure, seul, fatigué, marche, court, rit, surpris, en colère, amour, joie, hausse les épaules, tombe, salue, assis sur un banc, téléphone, lit une histoire, musculation, squats, médite, et à deux personnages : se moque, dispute, parle, accuse, ignore, câlin. Elles bougent en continu (respiration, clignement des yeux, gestes), passent en douceur d'une scène à l'autre, et la caméra varie (zoom lent, léger décalage, personnage tourné d'un côté ou de l'autre) pour que deux scènes ne soient jamais identiques.

L'animation est choisie à partir des mots de la phrase, en français, allemand, anglais et espagnol (« pleure / weint / cry » → pleure, « muscu / Krafttraining / workout » → musculation…). Si aucun mot ne correspond, l'application alterne des animations neutres pour que la vidéo ne soit jamais figée.

## Langues et traduction

- L'interface est en français, allemand ou anglais (sélecteur en haut à droite).
- Le texte peut être écrit dans n'importe quelle langue ; la voix de l'aperçu propose 12 langues.
- **Traduire** (onglet Texte) traduit chaque scène dans une autre langue en gardant les mêmes animations. **Mise en scène par l'IA** fait lire tout le texte à Claude pour choisir l'animation de chaque scène. Ces deux fonctions sont optionnelles : elles utilisent votre clé API Anthropic (gardée seulement dans le navigateur) et envoient le texte des scènes à Anthropic. Elles utilisent le SDK officiel `@anthropic-ai/sdk`, chargé à la demande, avec repli automatique sur un autre modèle si une demande est déclinée.

## Limites connues

- La **voix du téléphone** (mode aperçu) ne peut pas être enregistrée dans le fichier : utilisez la **voix naturelle** pour une vidéo qui parle.
- La voix naturelle demande Internet au premier usage de chaque voix (téléchargement du modèle). Elle ne fonctionne pas dans la version de démonstration publiée sur claude.ai, qui bloque ces téléchargements.
- L'export se fait en temps réel : une vidéo de 3 minutes prend 3 minutes. Gardez l'écran allumé et la page ouverte (sur téléphone, l'enregistrement s'arrête si la page passe en arrière-plan).
- Le format MP4 dépend du navigateur (Chrome / Edge récents) ; sinon le fichier est en WebM, accepté par YouTube et convertible pour TikTok.

## Fichiers

| Fichier | Rôle |
|---|---|
| `js/script.js` | Texte → scènes, détection des animations, durées, timeline |
| `js/poses.js` | Squelette et les 30 animations (fonctions du temps) |
| `js/figure.js` | Dessin du personnage, morphologie, accessoires, symboles, objets |
| `js/renderer.js` | Rendu d'une image : décor, projecteur, caméra, sous-titres, titres |
| `js/audio.js` | Musique d'ambiance (Web Audio) et voix du système |
| `js/voice.js` | Voix naturelle (Piper) : génération, lecture, mixage ; piste audio importée |
| `js/export.js` | Enregistrement vidéo (MediaRecorder) |
| `js/translate.js` | Traduction et mise en scène par Claude |
| `js/styles.js` | Styles de chaîne prêts et enregistrés |
| `js/account.js` | Compte, offres, quota d'export, partage, publicité |
| `js/app.js`, `js/i18n.js` | Interface et textes FR / DE / EN |
| `../server/` | Serveur : comptes, abonnements Stripe, quotas, partage (voir server/README.md) |

Tests : `node --test tests/unit/videoStudio.test.ts` (découpage, détection, poses) et `npm run test:video` (interface dans Chromium et export d'une vraie vidéo).
