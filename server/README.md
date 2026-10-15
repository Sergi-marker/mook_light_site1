# Mettre Vidéo Studio en ligne

Le serveur sert l'application web et gère les comptes, les offres, le quota gratuit, les paiements Stripe, la publicité et le partage des vidéos. Il n'utilise que Node.js 22.18 ou plus récent : aucune base de données à installer, il s'appuie sur SQLite, intégré à Node.

## Essayer sur son PC

```bash
npm run server:dev        # http://localhost:8080 — les offres payantes s'activent sans paiement
```

Créez un compte, exportez une vidéo, puis passez à une offre payante depuis « Compte & offres » : en mode `--dev`, l'offre s'active immédiatement, sans paiement.

## Les offres

| Offre | Prix | Vidéos | Durée max | Publicité |
|---|---|---|---|---|
| Gratuit | 0 € | 3 par jour | 30 s | oui |
| Premium | 5 € / mois | illimitées | illimitée | oui |
| Premium sans pub | 10 € / mois | illimitées | illimitée | non |

Ces règles sont définies dans `server/plans.mjs`. Le quota repart à minuit (fuseau `TIME_ZONE`, Berlin par défaut). Un compte est obligatoire pour exporter, même avec l'offre gratuite.

## Mise en production

1. **Hébergement.** Prenez un petit serveur (VPS, Render, Railway, Fly.io…) avec un disque persistant pour le dossier `DATA_DIR`. Ce dossier contient la base de données et les vidéos partagées : sauvegardez-le.
   ```bash
   docker build -t videostudio .
   docker run -d -p 8080:8080 -v videostudio-data:/data --env-file .env videostudio
   ```
   Mettez le site derrière HTTPS (Caddy, Nginx + Let's Encrypt, ou celui de l'hébergeur) et réglez `TRUST_PROXY=1`.
2. **Configuration.** Copiez `.env.example` en `.env` et remplissez-le. Toutes les variables y sont expliquées.
3. **Stripe (paiements).**
   - Créez un compte sur stripe.com et activez-le (identité, compte bancaire).
   - Dans Produits, créez deux produits à **prix récurrent mensuel en EUR** : « Premium » à 5 € et « Premium sans pub » à 10 €. Copiez leurs identifiants `price_…` dans `STRIPE_PRICE_PLUS` et `STRIPE_PRICE_PRO`.
   - Dans Développeurs → Webhooks, ajoutez un point de terminaison `https://VOTRE-SITE/api/stripe/webhook` avec les événements `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` et `customer.subscription.deleted`. Copiez le secret `whsec_…` dans `STRIPE_WEBHOOK_SECRET`.
   - Dans Paramètres → Portail client, activez la résiliation et le changement entre les deux offres.
   - Faites d'abord un essai complet avec les clés de test (`sk_test_…`) et la carte 4242 4242 4242 4242.
4. **Publicité (Google AdSense).** Demandez l'approbation du site sur adsense.google.com, créez un bloc d'annonces « display » et renseignez `ADSENSE_CLIENT` et `ADSENSE_SLOT`. Tant qu'ils sont vides, l'emplacement affiche un encart maison pour l'offre sans publicité. Dans l'Union européenne, Google exige une plateforme de consentement certifiée (CMP) pour diffuser des annonces personnalisées. L'application ne demande que des annonces non personnalisées tant que l'utilisateur n'a pas accepté ; pour monétiser au mieux, activez le message de consentement de Google (Confidentialité et messages) ou une autre CMP certifiée.
5. **E-mails.** Créez une clé sur resend.com (gratuit pour un petit volume), vérifiez votre domaine, et renseignez `RESEND_API_KEY` et `MAIL_FROM`. Sans clé, les liens « mot de passe oublié » sont seulement écrits dans le journal du serveur.
6. **Pages légales.** Renseignez `OPERATOR_NAME`, `OPERATOR_ADDRESS` et `OPERATOR_EMAIL`. Les pages `/legal/impressum`, `/legal/privacy` et `/legal/terms` sont des **modèles** : faites-les relire. En Allemagne, l'Impressum est obligatoire, et la vente d'abonnements numériques implique la TVA (régime OSS pour les clients d'autres pays de l'UE, ou statut de « Kleinunternehmer ») : voyez avec un comptable. Stripe Tax peut calculer la TVA automatiquement.

## Sécurité

- Mots de passe : empreinte scrypt. Sessions : cookie `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS ; seule l'empreinte du jeton est stockée.
- Protection contre les requêtes venant d'autres sites (CSRF), limite d'essais de connexion par adresse IP, webhooks Stripe signés et dédoublonnés.
- Suppression du compte et de ses vidéos depuis l'application (RGPD).

## Limite à connaître

Les vidéos sont fabriquées **dans le navigateur** de l'utilisateur, ce qui ne coûte rien en serveur. Le serveur décompte chaque export et refuse au-delà du quota, et l'application le respecte. En revanche, une personne techniquement avertie pourrait modifier le code de la page pour enregistrer une vidéo sans passer par ce décompte. Pour une garantie absolue, il faudrait fabriquer les vidéos sur le serveur, ce qui coûte du calcul. Pour un service grand public à 5–10 €, ce compromis est courant.

## API

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/config` | Offres, paiement activé, publicité |
| POST | `/api/auth/signup`, `/login`, `/logout`, `/forgot`, `/reset` | Compte |
| GET / DELETE | `/api/me` | Profil, offre et quota du jour ; suppression du compte |
| POST | `/api/exports` | Vérifie et décompte un export `{ duration }` |
| GET / POST | `/api/videos` | Vidéos partagées (POST : le fichier vidéo en corps de requête) |
| DELETE | `/api/videos/:id` | Supprime une vidéo partagée |
| POST | `/api/billing/checkout`, `/api/billing/portal` | Paiement Stripe et espace client |
| POST | `/api/stripe/webhook` | Notifications de Stripe |
| GET | `/v/:id`, `/media/:id` | Page publique de partage, fichier vidéo |

Tests : `node --test tests/unit/server.test.ts` (règles, comptes, quota, Stripe simulé, partage) et `npm run test:account` (parcours complet dans Chromium).
