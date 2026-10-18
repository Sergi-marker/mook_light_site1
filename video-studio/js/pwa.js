// © la triche — Animots
// Application installable : service worker (marche hors ligne), bouton « Installer l'appli »,
// et, dans la version gratuite (stores), lien vers la politique de confidentialité.

import { uiIndex } from "./i18n.js";

const S = {
  install: ["Installer l'appli", "App installieren", "Install the app"],
  iosHint: ["Sur iPhone : touchez Partager puis « Sur l'écran d'accueil ».", "Auf dem iPhone: Teilen und dann „Zum Home-Bildschirm“.", "On iPhone: tap Share, then “Add to Home Screen”."],
  privacy: ["Confidentialité", "Datenschutz", "Privacy"],
  about: ["À propos", "Über", "About"],
  by: ["créé par", "erstellt von", "made by"],
};

/** Signature de l'auteur, présente sur tout ce que nous publions. */
export const SIGNATURE = "la triche";
const tr = (k) => S[k][uiIndex()] ?? S[k][0];

/** Version gratuite sans serveur (stores) : ni compte, ni publicité, ni paiement. */
export const FREE_MODE = document.querySelector('meta[name="animots-mode"]')?.content === "free";

let deferred = null;

export function initPwa() {
  const secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  // Pas de service worker sous un navigateur piloté (tests), sauf demande explicite.
  let forced = false;
  try { forced = localStorage.getItem("animots.forceSw") === "1"; } catch { /* ignoré */ }
  if ("serviceWorker" in navigator && secure && (!navigator.webdriver || forced)) {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* pas de mode hors ligne : tant pis */ });
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    renderPwaUi();
  });
  window.addEventListener("appinstalled", () => { deferred = null; renderPwaUi(); });
  renderPwaUi();
}

const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone();

/** Bouton d'installation (en-tête) et pied de page signé (liens légaux dans la version gratuite). À rappeler au changement de langue. */
export function renderPwaUi() {
  const btn = document.getElementById("installBtn");
  if (btn) {
    btn.hidden = standalone() || (!deferred && !isIos());
    btn.textContent = `⤓ ${tr("install")}`;
    btn.onclick = async () => {
      if (deferred) {
        deferred.prompt();
        await deferred.userChoice.catch(() => null);
        deferred = null;
        renderPwaUi();
      } else alert(tr("iosHint"));
    };
  }
  const foot = document.getElementById("appFooter");
  if (foot) {
    foot.hidden = false;
    const sign = `Animots — ${tr("by")} <strong>${SIGNATURE}</strong>`;
    const lang = ["fr", "de", "en"][uiIndex()] ?? "fr";
    foot.innerHTML = FREE_MODE
      ? `<a href="./privacy.html#${lang}">${tr("privacy")}</a> · <a href="./privacy.html#about-${lang}">${tr("about")}</a> · ${sign}`
      : sign;
  }
}
