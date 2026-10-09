#!/usr/bin/env node
// Robust installer for the Electron binary (electron.exe on Windows).
//
// Why: Electron's own postinstall downloads a ~140 MB zip from GitHub in ONE request and
// starts over from zero when the connection is reset — on some networks (ISP box, antivirus
// scanning downloads, Wi-Fi) it then never finishes, and `npm start` fails with
// "Electron failed to install correctly".
//
// What this script does instead:
//   1. downloads the zip in pieces and RESUMES after every disconnect (HTTP Range), with retries;
//   2. verifies the file against Electron's official SHA-256 (node_modules/electron/checksums.json);
//   3. extracts it into node_modules/electron/dist and writes path.txt, exactly like the official
//      installer — then checks that the executable reports the expected version.
// Only node_modules/electron/dist and path.txt are touched. Your code and projects are not.
//
// Usage:  npm run setup:electron                 (GitHub, the official source)
//         npm run setup:electron -- --mirror     (npmmirror.com copy; still checked against the official checksum)
//         npm run setup:electron -- --check      (only report whether Electron is installed)
//         npm run setup:electron -- --zip C:\path\electron-v38.8.6-win32-x64.zip   (use a zip downloaded by hand)

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, renameSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const electronDir = join(root, "node_modules", "electron");
const OFFICIAL = "https://github.com/electron/electron/releases/download";
const MIRROR = "https://npmmirror.com/mirrors/electron";

export function platformInfo(platform = process.platform, arch = process.arch) {
  const exe = platform === "win32" ? "electron.exe" : platform === "darwin" ? "Electron.app/Contents/MacOS/Electron" : "electron";
  return { platform, arch, exe };
}

/** Is the Electron binary installed and of the version the project expects? */
export function checkInstalled(dir = electronDir) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const { exe } = platformInfo();
  const problems = [];
  const pathTxt = join(dir, "path.txt");
  if (!existsSync(pathTxt)) problems.push("path.txt manquant");
  else if (readFileSync(pathTxt, "utf8") !== exe) problems.push(`path.txt ne pointe pas vers ${exe}`);
  if (!existsSync(join(dir, "dist", exe))) problems.push(`dist/${exe} manquant`);
  const vfile = join(dir, "dist", "version");
  if (!existsSync(vfile)) problems.push("dist/version manquant");
  else if (readFileSync(vfile, "utf8").trim().replace(/^v/, "") !== pkg.version) problems.push(`version installée ${readFileSync(vfile, "utf8").trim()} ≠ ${pkg.version}`);
  return { ok: problems.length === 0, version: pkg.version, problems };
}

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (n) => `${(n / 1048576).toFixed(1)} Mo`;

/**
 * Download `url` to `dest`, resuming from `dest.part` after any network error (HTTP Range).
 * A transfer that stalls for `stallMs` is aborted and resumed.
 */
export async function downloadResumable(url, dest, { attempts = 60, stallMs = 30000, log = console.log } = {}) {
  const part = `${dest}.part`;
  let total = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const have = existsSync(part) ? statSync(part).size : 0;
    if (total && have >= total) break;
    const ctrl = new AbortController();
    let timer = setTimeout(() => ctrl.abort(), stallMs);
    try {
      const res = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {}, redirect: "follow", signal: ctrl.signal });
      if (res.status === 416 && have) { total = have; break; } // already complete
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resumed = res.status === 206;
      if (have && !resumed) rmSync(part, { force: true }); // server ignored Range: start over
      const len = Number(res.headers.get("content-length") ?? 0);
      const range = res.headers.get("content-range");
      total = range ? Number(range.split("/")[1]) : (resumed ? have : 0) + len;
      const out = createWriteStream(part, { flags: resumed ? "a" : "w" });
      let got = resumed ? have : 0;
      let lastLog = 0;
      try {
        for await (const chunk of res.body) {
          clearTimeout(timer);
          timer = setTimeout(() => ctrl.abort(), stallMs);
          if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
          got += chunk.length;
          if (Date.now() - lastLog > 3000) {
            lastLog = Date.now();
            log(`  … ${mb(got)} / ${total ? mb(total) : "?"}`);
          }
        }
      } finally {
        await new Promise((r) => out.end(r));
      }
      if (!total || statSync(part).size >= total) break;
      throw new Error("transfert incomplet");
    } catch (e) {
      const now = existsSync(part) ? statSync(part).size : 0;
      if (attempt === attempts) throw new Error(`Téléchargement impossible après ${attempts} tentatives (${mb(now)} reçus) : ${e.message}`);
      log(`  connexion coupée à ${mb(now)} (${e.cause?.code ?? e.message}) — reprise dans ${Math.min(10, attempt * 2)} s (tentative ${attempt + 1}/${attempts})`);
      await sleep(Math.min(10, attempt * 2) * (process.env.BS_FAST_RETRY ? 10 : 1000));
    } finally {
      clearTimeout(timer);
    }
  }
  renameSync(part, dest);
  return dest;
}

async function extractInto(zip, dir) {
  const require = createRequire(join(electronDir, "package.json"));
  const extract = require("extract-zip");
  const dist = join(dir, "dist");
  rmSync(dist, { recursive: true, force: true }); // only the (broken) Electron binary folder
  mkdirSync(dist, { recursive: true });
  await extract(zip, { dir: dist });
  const types = join(dist, "electron.d.ts");
  if (existsSync(types)) renameSync(types, join(dir, "electron.d.ts"));
  writeFileSync(join(dir, "path.txt"), platformInfo().exe);
}

async function main() {
  const args = process.argv.slice(2);
  if (!existsSync(join(electronDir, "package.json"))) {
    console.error("node_modules/electron est absent : lancez d'abord « npm install ».");
    process.exit(1);
  }
  const state = checkInstalled();
  if (args.includes("--check")) {
    if (state.ok) console.log(`Electron ${state.version} est correctement installé.`);
    else {
      console.error(`Electron ${state.version} n'est pas installé correctement (${state.problems.join(", ")}).`);
      console.error("Réparation : npm run setup:electron   (ou, si GitHub coupe toujours : npm run setup:electron -- --mirror)");
    }
    process.exit(state.ok ? 0 : 1);
  }
  if (state.ok && !args.includes("--force")) {
    console.log(`Electron ${state.version} est déjà correctement installé. Rien à faire (--force pour réinstaller).`);
    return;
  }
  const { platform, arch } = platformInfo();
  const file = `electron-v${state.version}-${platform}-${arch}.zip`;
  const checksums = JSON.parse(readFileSync(join(electronDir, "checksums.json"), "utf8"));
  const expected = checksums[file];
  if (!expected) throw new Error(`Pas de checksum officiel pour ${file}.`);

  let zip;
  const zipArg = args.indexOf("--zip");
  if (zipArg >= 0) {
    zip = args[zipArg + 1];
    console.log(`Utilisation du fichier ${zip}`);
  } else {
    const base = args.includes("--mirror") ? MIRROR : process.env.ELECTRON_MIRROR?.replace(/\/$/, "") || OFFICIAL;
    const url = `${base}/v${state.version}/${file}`;
    const cacheDir = join(tmpdir(), "beatmaker-electron");
    mkdirSync(cacheDir, { recursive: true });
    zip = join(cacheDir, file);
    if (existsSync(zip) && (await sha256File(zip)) === expected) console.log(`Archive déjà téléchargée et vérifiée : ${zip}`);
    else {
      rmSync(zip, { force: true });
      console.log(`Téléchargement de ${file} depuis ${base}`);
      console.log("(reprend automatiquement là où il s'est arrêté si la connexion est coupée)");
      await downloadResumable(url, zip);
    }
  }
  console.log("Vérification de l'intégrité (SHA-256 officiel d'Electron)…");
  const got = await sha256File(zip);
  if (got !== expected) {
    if (zipArg < 0) rmSync(zip, { force: true });
    throw new Error(`Fichier corrompu (SHA-256 ${got.slice(0, 12)}… au lieu de ${expected.slice(0, 12)}…). Relancez la commande.`);
  }
  console.log("Archive intacte. Installation dans node_modules/electron/dist…");
  await extractInto(zip, electronDir);
  const after = checkInstalled();
  if (!after.ok) throw new Error(`Installation incomplète : ${after.problems.join(", ")}`);
  const exe = join(electronDir, "dist", platformInfo().exe);
  try {
    // Run the binary in Node mode (no window) and ask for its Electron version.
    const v = execFileSync(exe, ["-e", "process.stdout.write(process.versions.electron)"], { encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, timeout: 30000 }).trim();
    if (v !== after.version) throw new Error(`l'exécutable répond ${v}, attendu ${after.version}`);
    console.log(`Electron opérationnel : v${v} (exécutable lancé et vérifié)`);
  } catch (e) {
    throw new Error(`Electron est extrait mais ne démarre pas : ${e.message}. Vérifiez que l'antivirus n'a pas mis electron.exe en quarantaine.`);
  }
  console.log("Terminé. Lancez maintenant : npm start");
}

// Run only when executed directly (not when imported by tests). Case-insensitive for Windows paths.
const isMain = !!process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  main().catch((e) => {
    console.error(`\nÉchec : ${e.message}`);
    console.error("Si GitHub coupe toujours la connexion, essayez : npm run setup:electron -- --mirror");
    process.exit(1);
  });
}
