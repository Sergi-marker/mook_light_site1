# Consignes du projet (à lire à chaque session)

## Signature : « la triche »
- Tout ce que nous créons (logiciels, applications, sites, pages, fiches des stores) porte la signature **la triche**,
  écrite exactement ainsi : en minuscules, avec un espace.
- Où la mettre : pied de page de l'application (« Animots — créé par la triche »), page « À propos » / confidentialité,
  balise `<meta name="author">`, champ `author` de `package.json` et du manifeste, éditeur affiché dans les stores,
  et l'en-tête `// © la triche — Animots` (ou le nom du nouveau projet) en haut de chaque fichier de code.
- Nom de domaine prévu : **latriche** (ex. `latriche.com` ; Animots pourra être à `animots.latriche.com`).
  Pas encore acheté au moment où cette consigne est écrite.

## Comment travailler avec le propriétaire
- Il ne sait pas coder : il attend un travail complet, installé et vérifié, pas des instructions techniques.
- Avant de lui demander une action, tester soi-même tout le chemin (construction, déploiement à blanc, tests).
- Quand une action de sa part est indispensable (compte, paiement, clic dans un site), donner une seule étape à la fois,
  avec l'emplacement exact du bouton et le texte exact à copier. Ne jamais lui faire répéter une étape déjà faite.
- Répondre en français, simplement.

## Animots (dossier `video-studio/`)
- Application texte → vidéo animée (personnage pictogramme). Version gratuite construite par `node scripts/build-free.mjs`
  (dossier `dist-free/`), version complète avec comptes et abonnements dans `server/`.
- En ligne sur Cloudflare (Worker **tsafack**, branche `ccr-a343f806-gshxhf`) : `wrangler.jsonc` construit et publie
  le site tout seul avec `npx wrangler deploy` ; la case « Build command » de Cloudflare peut rester vide.
- Avant d'activer de l'argent (publicité, abonnements) : rappeler qu'il faut l'accord des autorités pour son titre de séjour.
- Deux types d'animation, proposés sur la page d'accueil : « Texte → vidéo animée » et « Audio / vidéo → dessin animé »
  (son d'origine gardé, retranscription Whisper mot à mot, 1 à 4 personnes reconnues par empreinte de voix WeSpeaker,
  frise de correction, bouche qui forme les sons, ressemblance aux vraies personnes via MediaPipe, style « dessin »).
  Le propriétaire proposera d'autres types d'animation : les ajouter comme nouvelles cartes de l'accueil.
- Tests : `npm test`, `npm run test:video`, `npm run test:matrix`, `npm run test:account`, `npm run test:free`, `npm run test:dub`.
