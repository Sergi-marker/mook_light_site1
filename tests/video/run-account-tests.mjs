// Parcours complet avec le serveur : inscription, quota gratuit, offre Premium (paiement simulé),
// publicité, export et partage d'une vidéo. Usage : npm run test:account
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "../playwright.mjs";
import { createApp } from "../../server/app.mjs";

const dir = mkdtempSync(join(tmpdir(), "vs-e2e-"));
const { server } = createApp({
  publicUrl: "",
  dataDir: dir,
  dbFile: ":memory:",
  staticDir: fileURLToPath(new URL("../../video-studio", import.meta.url)),
  timeZone: "Europe/Berlin",
  devBilling: true,
  maxUploadMb: { free: 50, paid: 400 },
  log: () => {},
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await launchChromium({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
// L'éditeur directement (sans passer par la page d'accueil, testée à part).
await page.addInitScript(() => sessionStorage.setItem("animots.inApp", "1"));
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.log(`not ok - ${name}\n  ${e.message}`); }
};
const me = () => page.evaluate(async () => (await fetch("/api/me")).json());

await page.goto(url);
await page.waitForFunction(() => window.__videoStudio?.project.scenes.length > 0);
// Vidéo courte, sans voix (pas de téléchargement de modèle dans ce test), sans musique.
const shortVideo = (seconds) => page.evaluate((s) => {
  const p = window.__videoStudio.project;
  p.scenes = [{ id: "a", kind: "scene", text: "Tu souris à tout le monde.", action: "think", seed: 1, duration: s }];
  p.settings.voiceMode = "off";
  p.settings.music = "none";
  window.__videoStudio.rebuild();
}, seconds);

await step("sans compte : bouton « Se connecter », publicité affichée, export demande un compte", async () => {
  await page.locator("#accountBtn").getByText("Se connecter").waitFor();
  assert.ok(await page.locator("#adSlot").isVisible());
  await shortVideo(1.5);
  await page.getByRole("tab", { name: "Exporter" }).click();
  await page.getByRole("button", { name: /Exporter la vidéo/ }).click();
  await page.locator("dialog.auth").waitFor();
  assert.match(await page.locator("dialog.auth").textContent(), /compte gratuit/);
});

await step("inscription depuis la fenêtre", async () => {
  await page.locator("dialog.auth").getByRole("button", { name: "Créer un compte" }).first().click().catch(() => {});
  await page.fill("#authEmail", "sam@example.com");
  await page.fill("#authPassword", "unbonmotdepasse");
  await page.locator("dialog.auth form").getByRole("button", { name: "Créer un compte" }).click();
  await page.locator("#accountBtn").getByText(/sam · Gratuit/).waitFor();
});

await step("offre gratuite : export de 1,5 s accepté et décompté (2 restantes)", async () => {
  await page.getByRole("tab", { name: "Exporter" }).click();
  await page.getByRole("button", { name: /Exporter la vidéo/ }).click();
  await page.getByRole("link", { name: /Télécharger/ }).waitFor({ timeout: 30000 });
  const m = await me();
  assert.equal(m.today, 1);
  assert.equal(m.remaining, 2);
});

await step("export annulé : pas de fichier, et la vidéo est rendue au quota", async () => {
  await shortVideo(6);
  await page.getByRole("tab", { name: "Scènes" }).click();
  await page.getByRole("tab", { name: "Exporter" }).click();
  await page.getByRole("button", { name: /Exporter la vidéo/ }).click();
  await page.waitForFunction(async () => (await (await fetch("/api/me")).json()).today === 2, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.waitForFunction(async () => (await (await fetch("/api/me")).json()).today === 1, null, { timeout: 15000 });
  assert.equal(await page.getByRole("link", { name: /Télécharger/ }).count(), 0);
  // On revient à la vidéo courte exportée juste avant, pour l'étape de partage.
  await shortVideo(1.5);
  await page.getByRole("tab", { name: "Scènes" }).click();
  await page.getByRole("tab", { name: "Exporter" }).click();
  await page.getByRole("button", { name: /Exporter la vidéo/ }).click();
  await page.getByRole("link", { name: /Télécharger/ }).waitFor({ timeout: 30000 });
});

await step("partage : lien public qui affiche la vidéo", async () => {
  await page.getByRole("button", { name: /Partager \(lien\)/ }).click();
  const link = page.locator("input.link");
  await link.waitFor({ timeout: 20000 });
  const shareUrl = await link.inputValue();
  const html = await (await fetch(shareUrl.startsWith("http") ? shareUrl : url + shareUrl.replace(/^\//, ""))).text();
  assert.match(html, /<video/);
});

await step("offre gratuite : vidéo de plus de 30 s refusée avec proposition Premium", async () => {
  await shortVideo(40);
  await page.getByRole("tab", { name: "Scènes" }).click();
  await page.getByRole("tab", { name: "Exporter" }).click();
  assert.match(await page.locator(".notice").textContent(), /30 secondes/);
  await page.getByRole("button", { name: /Exporter la vidéo/ }).click();
  await page.locator("dialog.auth.wide").waitFor();
  assert.match(await page.locator("dialog.auth.wide").textContent(), /Premium/);
  await page.keyboard.press("Escape");
});

await step("offre gratuite : 4e vidéo du jour refusée", async () => {
  // Deux exports décomptés directement auprès du serveur (3 au total).
  for (let i = 0; i < 1; i++) await page.evaluate(async () => fetch("/api/exports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ duration: 5 }) }));
  await shortVideo(1.5);
  await page.getByRole("tab", { name: "Scènes" }).click();
  await page.getByRole("tab", { name: "Exporter" }).click();
  await page.getByRole("button", { name: /Exporter la vidéo/ }).click();
  await page.locator("dialog.auth.wide").waitFor();
  assert.match(await page.locator("dialog.auth.wide").textContent(), /3 vidéos gratuites/);
});

await step("Premium sans pub (paiement simulé) : illimité, plus de publicité", async () => {
  const dlg = page.locator("dialog.auth.wide");
  await dlg.locator(".plan").nth(2).getByRole("button", { name: "Choisir" }).click();
  await page.waitForURL(/billing=success/).catch(() => {});
  await page.waitForFunction(() => window.__videoStudio?.project);
  await page.locator("#accountBtn").getByText(/sans pub/).waitFor();
  assert.equal(await page.locator("#adSlot").isVisible(), false);
  await shortVideo(1.5);
  await page.getByRole("tab", { name: "Exporter" }).click();
  await page.getByRole("button", { name: /Exporter la vidéo/ }).click();
  await page.getByRole("link", { name: /Télécharger/ }).waitFor({ timeout: 30000 });
  const m = await me();
  assert.equal(m.plan.id, "pro");
  assert.equal(m.remaining, null);
});

await step("aucune erreur JavaScript", async () => assert.deepEqual(errors, []));

await browser.close();
server.close();
rmSync(dir, { recursive: true, force: true });
if (failed) { console.log(`${failed} échec(s)`); process.exit(1); }
console.log("Comptes et offres : tous les tests passent");
