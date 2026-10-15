// Envoi d'e-mails (réinitialisation du mot de passe) via l'API HTTP de Resend.
// Sans clé configurée, le lien est écrit dans le journal du serveur (pratique en développement).

export function createMailer({ resendKey, from, fetchImpl = fetch, log = console.log }) {
  return async function send({ to, subject, text }) {
    if (!resendKey) {
      log(`[e-mail non envoyé : RESEND_API_KEY absent] À ${to} — ${subject}\n${text}`);
      return { sent: false };
    }
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return { sent: true };
  };
}
