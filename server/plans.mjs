// Offres et règles de quota. Module pur : testable sans base de données.

export const PLANS = {
  free: { id: "free", priceEur: 0, dailyVideos: 3, maxSeconds: 30, ads: true, label: ["Gratuit", "Kostenlos", "Free"] },
  plus: { id: "plus", priceEur: 5, dailyVideos: Infinity, maxSeconds: Infinity, ads: true, label: ["Premium", "Premium", "Premium"] },
  pro: { id: "pro", priceEur: 10, dailyVideos: Infinity, maxSeconds: Infinity, ads: false, label: ["Premium sans pub", "Premium ohne Werbung", "Premium ad-free"] },
};

/** Marge de tolérance sur la durée (arrondis d'encodage). */
const DURATION_SLACK = 0.5;

export function planOf(user, now = Date.now()) {
  if (!user) return PLANS.free;
  const p = PLANS[user.plan];
  if (!p || p.id === "free") return PLANS.free;
  // Abonnement expiré (paiement non renouvelé) : retour à l'offre gratuite.
  if (user.plan_until && user.plan_until < now) return PLANS.free;
  return p;
}

/**
 * Peut-on exporter une vidéo de `duration` secondes, sachant `usedToday` exports déjà faits aujourd'hui ?
 * Renvoie { ok: true, remaining } ou { ok: false, reason: "TOO_LONG" | "DAILY_LIMIT", limit }.
 */
export function checkExport(plan, usedToday, duration) {
  if (!(duration > 0) || !Number.isFinite(duration)) return { ok: false, reason: "BAD_DURATION" };
  if (duration > plan.maxSeconds + DURATION_SLACK) return { ok: false, reason: "TOO_LONG", limit: plan.maxSeconds };
  if (usedToday >= plan.dailyVideos) return { ok: false, reason: "DAILY_LIMIT", limit: plan.dailyVideos };
  return { ok: true, remaining: plan.dailyVideos === Infinity ? null : plan.dailyVideos - usedToday - 1 };
}

/** Jour calendaire (AAAA-MM-JJ) dans le fuseau du service : le quota repart à minuit. */
export function dayKey(now = Date.now(), timeZone = "Europe/Berlin") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

/** Vue publique d'une offre (Infinity n'existe pas en JSON). */
export function publicPlan(p) {
  return {
    id: p.id, priceEur: p.priceEur, ads: p.ads, label: p.label,
    dailyVideos: Number.isFinite(p.dailyVideos) ? p.dailyVideos : null,
    maxSeconds: Number.isFinite(p.maxSeconds) ? p.maxSeconds : null,
  };
}
