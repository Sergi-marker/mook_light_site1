# Animots gratuit : site public et stores

Cette version n'a ni compte, ni publicité, ni paiement : tout se passe sur l'appareil de l'utilisateur.
Elle s'installe comme une application (PWA) et fonctionne hors ligne une fois ouverte.

## 1. Construire la version gratuite

```bash
npm run build:free          # crée le dossier dist-free/
npm run test:free           # vérifie : installable, hors ligne, aucun appel serveur
node scripts/serve-video.mjs 5174 --dir dist-free   # essai sur http://127.0.0.1:5174/
```

Variables facultatives (pour la page de confidentialité) : `OPERATOR_NAME`, `OPERATOR_EMAIL`, `OPERATOR_ADDRESS`.
Les polices sont copiées dans l'application (aucune adresse IP envoyée à Google : important en Allemagne).

## 2. Mettre le site en ligne gratuitement (Cloudflare Pages)

1. Créez un compte gratuit sur **dash.cloudflare.com**.
2. **Workers & Pages → Créer → Pages → Connecter à Git**, choisissez le dépôt `mook_light_site1` et la branche à publier.
3. Réglages de construction :
   - Préréglage : *Aucun*
   - Commande de construction : `node scripts/build-free.mjs`
   - Dossier de sortie : `dist-free`
   - Variables d'environnement : `NODE_VERSION` = `22`, puis `OPERATOR_NAME`, `OPERATOR_EMAIL`, `OPERATOR_ADDRESS`.
4. Enregistrez : le site est en ligne à une adresse du type `https://animots.pages.dev`. Chaque envoi sur la branche le met à jour.
5. (Facultatif) Nom de domaine : **Domaines personnalisés** → `animots.app` par exemple (environ 10 à 15 € par an).

**Si Cloudflare a créé un projet « Workers »** (et non « Pages ») : le fichier `wrangler.jsonc` du dépôt est déjà prêt.
Dans le projet → **Settings → Build** : branche = celle qui contient Animots, commande de construction =
`node scripts/build-free.mjs`, commande de déploiement = `npx wrangler deploy`. L'adresse sera du type
`https://tsafack.VOTRE-COMPTE.workers.dev`.

La page de confidentialité est à `https://VOTRE-SITE/privacy.html` : c'est l'adresse à donner aux stores.

## 3. Créer les applications pour les stores (PWABuilder)

Sur **pwabuilder.com**, entrez l'adresse du site, puis **Package for stores** :

| Store | Coût | Ce que PWABuilder fournit |
|---|---|---|
| **Microsoft Store** (Windows) | gratuit pour un particulier | paquet `.msix` à envoyer dans Partner Center |
| **Google Play** (Android) | 25 $ une fois | paquet `.aab` (Trusted Web Activity) + fichier `assetlinks.json` |
| **Samsung Galaxy Store** | gratuit | utilisez l'`.apk` du paquet Android |
| **Huawei AppGallery** | gratuit | utilisez l'`.apk` du paquet Android |
| **Apple App Store** (iPhone) | 99 $ par an + un Mac pour envoyer l'appli | projet Xcode |

Sans store, l'application s'installe déjà : bouton **« Installer l'appli »** dans l'en-tête (Chrome, Edge, Android),
ou sur iPhone : Safari → Partager → **Sur l'écran d'accueil**.

### Google Play : lier l'appli au site
PWABuilder donne un nom de paquet (ex. `app.animots.twa`) et une empreinte SHA-256. Ajoutez dans Cloudflare Pages :
`ANDROID_PACKAGE` = le nom du paquet, `ANDROID_SHA256` = l'empreinte (plusieurs séparées par des virgules : ajoutez aussi celle
de « Signature d'application » affichée par la Play Console). Le fichier `/.well-known/assetlinks.json` est alors créé
automatiquement : sans lui, l'appli Android affiche une barre d'adresse.

**Nouveau compte personnel Google Play** : avant la publication, un test fermé avec au moins 12 testeurs pendant 14 jours
est obligatoire. Préparez une liste d'adresses Gmail (amis, collègues, camarades).

### Questionnaires des stores (réponses pour cette version)
- **Données collectées** : aucune. Pas de compte, pas de publicité, pas de mesure d'audience.
- **Publicité** : non. **Achats** : non.
- **Classification (âge)** : tout public ; l'utilisateur écrit ses propres textes.
- **Accès** : micro (facultatif, enregistrement de la voix pendant l'export) ; Internet (téléchargement des voix au premier usage).
- **Politique de confidentialité** : `https://VOTRE-SITE/privacy.html`

## 4. Textes des fiches

### Français
**Nom** : Animots — vos mots prennent vie
**Description courte (80 caractères)** : Collez un texte, il devient une vidéo animée pour TikTok, Reels et Shorts.
**Description** :
Animots transforme vos textes en vidéos animées, prêtes pour TikTok, Instagram Reels, YouTube Shorts et YouTube.

Collez un texte de psychologie, de motivation, de sport ou une histoire : chaque phrase devient une scène, avec un
personnage pictogramme qui la joue, des sous-titres qui apparaissent mot par mot, une voix off et une musique d'ambiance.

• 63 animations reconnues automatiquement : tristesse, colère, honte, cœur brisé, pluie, foule qui juge, pompes, boxe,
  podium, porte vers la lumière, escalier, étoiles…
• Dialogues à deux personnages, chacun avec sa voix
• Voix naturelles en français, allemand, anglais, espagnol, italien, portugais et plus
• Effets de voix : grave, aiguë, douce et rassurante, radio, écho, bande-annonce…
• 14 musiques d'ambiance : piano triste, épique, lo-fi, trap, suspense…
• Effets de mise en scène : ralenti, flash, projecteur, fondu au noir
• Personnages personnalisables : silhouette, vêtements, coiffure, couleur de peau
• Formats 9:16, 16:9 et 1:1, export vidéo jusqu'à 60 images par seconde
• Gratuit, sans compte et sans publicité ; vos textes restent sur votre appareil

**Mots-clés** : vidéo animée, texte en vidéo, TikTok, Reels, Shorts, psychologie, motivation, sous-titres, voix off, animation

### Deutsch
**Name**: Animots – Worte werden lebendig
**Kurzbeschreibung**: Text einfügen – daraus wird ein animiertes Video für TikTok, Reels und Shorts.
**Beschreibung**:
Animots verwandelt Texte in animierte Videos für TikTok, Instagram Reels, YouTube Shorts und YouTube.

Füge einen Text über Psychologie, Motivation, Sport oder eine Geschichte ein: Jeder Satz wird zu einer Szene, mit einer
Piktogramm-Figur, die ihn spielt, Untertiteln Wort für Wort, Sprecherstimme und Hintergrundmusik.

• 63 automatisch erkannte Animationen: Traurigkeit, Wut, Scham, Liebeskummer, Regen, urteilende Menge, Liegestütze,
  Boxen, Podest, Tür ins Licht, Treppe, Sterne…
• Dialoge mit zwei Figuren, jede mit eigener Stimme
• Natürliche Stimmen auf Deutsch, Französisch, Englisch, Spanisch, Italienisch, Portugiesisch und mehr
• Stimmeffekte: tief, hoch, sanft und beruhigend, Radio, Echo, Trailer…
• 14 Hintergrundmusiken: trauriges Klavier, episch, Lo-fi, Trap, Spannung…
• Effekte: Zeitlupe, Blitz, Scheinwerfer, Abblende
• Anpassbare Figuren: Statur, Kleidung, Frisur, Hautfarbe
• Formate 9:16, 16:9 und 1:1, Export mit bis zu 60 Bildern pro Sekunde
• Kostenlos, ohne Konto und ohne Werbung; deine Texte bleiben auf deinem Gerät

**Stichwörter**: animiertes Video, Text zu Video, TikTok, Reels, Shorts, Psychologie, Motivation, Untertitel, Sprecher, Animation

### English
**Name**: Animots — your words come alive
**Short description**: Paste a text, it becomes an animated video for TikTok, Reels and Shorts.
**Description**:
Animots turns your texts into animated videos for TikTok, Instagram Reels, YouTube Shorts and YouTube.

Paste a psychology, motivation or sports text, or a story: each sentence becomes a scene, with a pictogram character
acting it out, word-by-word captions, a voice-over and background music.

• 63 animations detected automatically: sadness, anger, shame, heartbreak, rain, judging crowd, push-ups, boxing,
  podium, door to the light, stairs, stars…
• Two-character dialogues, each with its own voice
• Natural voices in English, French, German, Spanish, Italian, Portuguese and more
• Voice effects: deep, high, soft and reassuring, radio, echo, movie trailer…
• 14 background music moods: sad piano, epic, lo-fi, trap, suspense…
• Scene effects: slow motion, flash, spotlight, fade to black
• Customizable characters: build, clothes, hair, skin tone
• 9:16, 16:9 and 1:1 formats, video export up to 60 frames per second
• Free, no account and no ads; your texts stay on your device

**Keywords**: animated video, text to video, TikTok, Reels, Shorts, psychology, motivation, captions, voice-over, animation

### Images à fournir
- Icône : `img/icon-512.png` (et `img/maskable-512.png` pour Android)
- Captures : `img/screenshot-phone.jpg` (téléphone) et `img/screenshot-wide.jpg` (ordinateur) ; ajoutez-en 2 ou 3 autres
  (onglet Personnages, onglet Voix & musique) faites depuis votre téléphone.
