// Démarrage du serveur : node server/index.mjs (configuration par variables d'environnement, voir server/README.md).

import { fileURLToPath } from "node:url";
import { createApp } from "./app.mjs";

const env = process.env;
const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(env.PORT ?? 8080);
const host = env.HOST ?? "0.0.0.0";
const publicUrl = env.PUBLIC_URL ?? `http://localhost:${port}`;

const cfg = {
  publicUrl,
  dataDir: env.DATA_DIR ?? `${root}data`,
  dbFile: env.DB_FILE ?? `${env.DATA_DIR ?? `${root}data`}/videostudio.db`,
  staticDir: `${root}video-studio`,
  timeZone: env.TIME_ZONE ?? "Europe/Berlin",
  secureCookies: publicUrl.startsWith("https://"),
  trustProxy: env.TRUST_PROXY === "1",
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    prices: { plus: env.STRIPE_PRICE_PLUS, pro: env.STRIPE_PRICE_PRO },
  },
  devBilling: env.DEV_BILLING === "1" || process.argv.includes("--dev"),
  ads: env.ADSENSE_CLIENT ? { client: env.ADSENSE_CLIENT, slot: env.ADSENSE_SLOT } : null,
  resendKey: env.RESEND_API_KEY,
  mailFrom: env.MAIL_FROM ?? "Vidéo Studio <no-reply@example.com>",
  maxUploadMb: { free: Number(env.MAX_UPLOAD_MB_FREE ?? 40), paid: Number(env.MAX_UPLOAD_MB_PAID ?? 400) },
  operator: { name: env.OPERATOR_NAME, address: env.OPERATOR_ADDRESS, email: env.OPERATOR_EMAIL, vat: env.OPERATOR_VAT },
};

if (cfg.stripe.secretKey && (!cfg.stripe.prices.plus || !cfg.stripe.prices.pro || !cfg.stripe.webhookSecret)) {
  console.warn("Attention : STRIPE_PRICE_PLUS, STRIPE_PRICE_PRO et STRIPE_WEBHOOK_SECRET sont nécessaires pour les abonnements.");
}
if (cfg.devBilling) console.warn("DEV_BILLING=1 : les abonnements s'activent sans paiement (à n'utiliser qu'en test).");

const { server } = createApp(cfg);
server.listen(port, host, () => console.log(`Vidéo Studio : ${publicUrl} (écoute sur ${host}:${port})`));
