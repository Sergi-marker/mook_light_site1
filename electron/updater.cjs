// One-click update for an app run from its Git checkout (npm start): does what the manual steps
// did — put local edits aside, fetch, fast-forward, put the edits back, rebuild — and never
// deletes anything: projects live outside the checkout, local edits are stashed and restored,
// and anything unexpected stops the update with a clear message (the checkout is left as it was).
"use strict";
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function run(cmd, args, cwd, env) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, env: { ...process.env, ...env }, timeout: 10 * 60 * 1000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout ?? ""}${stderr ?? ""}`.trim() });
    });
  });
}
const git = (args, cwd) => run("git", args, cwd);

/** Branch, whether an update is available, how many changes behind. Never modifies anything. */
async function checkUpdate(dir) {
  if (!fs.existsSync(path.join(dir, ".git"))) return { ok: false, error: "Cette installation n'est pas une copie Git : la mise à jour automatique n'est pas possible." };
  const br = await git(["rev-parse", "--abbrev-ref", "HEAD"], dir);
  if (!br.ok || br.out === "HEAD") return { ok: false, error: "Impossible de lire la branche Git." };
  const branch = br.out;
  let f = await git(["fetch", "origin", branch], dir);
  // Connection reset on some networks: HTTP/1.1 usually gets through (it did for the manual steps).
  if (!f.ok) f = await git(["-c", "http.version=HTTP/1.1", "fetch", "origin", branch], dir);
  if (!f.ok) return { ok: false, error: `Téléchargement impossible (connexion ?) : ${f.out.split("\n").pop()}` };
  const behind = await git(["rev-list", "--count", `HEAD..origin/${branch}`], dir);
  const ahead = await git(["rev-list", "--count", `origin/${branch}..HEAD`], dir);
  return { ok: true, branch, behind: Number(behind.out) || 0, ahead: Number(ahead.out) || 0 };
}

/**
 * Update the checkout in `dir` and rebuild. `nodeCmd` runs scripts/build.mjs (Electron's own
 * binary with ELECTRON_RUN_AS_NODE). Returns the steps done, in French, for the user.
 */
async function applyUpdate(dir, nodeCmd = process.execPath) {
  const steps = [];
  const c = await checkUpdate(dir);
  if (!c.ok) return { ok: false, steps, error: c.error };
  if (!c.behind) return { ok: true, steps: ["Déjà à jour."], updated: false };
  if (c.ahead) return { ok: false, steps, error: "Ta copie contient des changements enregistrés (commits) qui ne sont pas sur GitHub : mise à jour automatique arrêtée pour ne rien perdre." };
  steps.push(`${c.behind} nouveauté(s) téléchargée(s).`);
  // Local edits to tracked files (e.g. package.json) are put aside, then restored.
  const dirty = await git(["status", "--porcelain", "--untracked-files=no"], dir);
  let stashed = false;
  if (dirty.out) {
    const s = await git(["stash", "push", "-m", "beatmaker-auto-update"], dir);
    if (!s.ok) return { ok: false, steps, error: `Impossible de mettre de côté tes modifications locales : ${s.out}` };
    stashed = true;
    steps.push("Tes modifications locales sont mises de côté.");
  }
  const m = await git(["merge", "--ff-only", `origin/${c.branch}`], dir);
  if (!m.ok) {
    if (stashed) await git(["stash", "pop"], dir);
    return { ok: false, steps, error: `Mise à jour impossible (fusion) : ${m.out.split("\n").pop()}` };
  }
  steps.push("Nouvelle version installée.");
  if (stashed) {
    const p = await git(["stash", "pop"], dir);
    if (!p.ok) return { ok: false, steps, error: "La nouvelle version est installée, mais tes modifications locales n'ont pas pu être remises automatiquement : elles sont gardées (git stash list). Envoie ce message pour qu'on les remette ensemble." };
    steps.push("Tes modifications locales sont remises.");
  }
  const b = await run(nodeCmd, ["scripts/build.mjs"], dir, { ELECTRON_RUN_AS_NODE: "1" });
  if (!b.ok) return { ok: false, steps, error: `La nouvelle version est installée mais la construction a échoué : ${b.out.split("\n").slice(-3).join(" ")}` };
  steps.push("Application reconstruite.");
  return { ok: true, steps, updated: true };
}

module.exports = { checkUpdate, applyUpdate };
