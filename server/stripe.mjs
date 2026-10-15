// Paiements Stripe (abonnements mensuels) par l'API HTTP de Stripe, sans dépendance.

import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.stripe.com/v1";

/** Encode un objet imbriqué au format formulaire de Stripe : a[b][0][c]=… */
export function formEncode(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export function createStripe({ secretKey, fetchImpl = fetch }) {
  async function call(method, path, params) {
    const res = await fetchImpl(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
      body: params ? formEncode(params).toString() : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${data?.error?.message ?? "erreur"}`);
    return data;
  }
  return {
    /** Page de paiement Stripe pour s'abonner à un prix mensuel. */
    checkout({ priceId, customerId, email, userId, successUrl, cancelUrl }) {
      return call("POST", "/checkout/sessions", {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer: customerId || undefined,
        customer_email: customerId ? undefined : email,
        client_reference_id: String(userId),
        metadata: { user_id: String(userId) },
        subscription_data: { metadata: { user_id: String(userId) } },
        allow_promotion_codes: "true",
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    },
    /** Espace client Stripe : changer d'offre, carte, factures, résiliation. */
    portal({ customerId, returnUrl }) {
      return call("POST", "/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
    },
    subscription(id) {
      return call("GET", `/subscriptions/${encodeURIComponent(id)}`);
    },
  };
}

/**
 * Vérifie la signature d'un webhook Stripe (en-tête Stripe-Signature : t=…,v1=…).
 * Renvoie l'événement JSON, ou lève une erreur.
 */
export function verifyWebhook(rawBody, header, secret, toleranceSec = 300, now = Date.now()) {
  const parts = Object.fromEntries(String(header ?? "").split(",").map((kv) => kv.split("=").map((x) => x.trim())).filter((x) => x.length === 2));
  const t = Number(parts.t);
  const sigs = String(header ?? "").split(",").filter((kv) => kv.trim().startsWith("v1=")).map((kv) => kv.trim().slice(3));
  if (!t || !sigs.length) throw new Error("BAD_SIGNATURE_HEADER");
  if (Math.abs(now / 1000 - t) > toleranceSec) throw new Error("SIGNATURE_TOO_OLD");
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const ok = sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!ok) throw new Error("BAD_SIGNATURE");
  return JSON.parse(rawBody);
}

/** Pour les tests : en-tête signé comme le ferait Stripe. */
export function signWebhook(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

/** Offre correspondant à un abonnement Stripe (selon son prix et son statut). */
export function planFromSubscription(sub, prices) {
  const active = ["active", "trialing", "past_due"].includes(sub?.status);
  if (!active) return { plan: "free", until: null };
  const priceId = sub.items?.data?.[0]?.price?.id;
  const plan = priceId === prices.pro ? "pro" : priceId === prices.plus ? "plus" : null;
  if (!plan) return { plan: "free", until: null };
  // Fin de la période payée (+ 3 jours de grâce pour un renouvellement en retard).
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return { plan, until: end ? (end + 3 * 86400) * 1000 : null };
}
