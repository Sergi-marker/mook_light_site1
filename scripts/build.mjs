// Build: TypeScript → dist/app (ES modules, no bundler needed), plus static files.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
process.chdir(root);
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

// Prefer the project's TypeScript, fall back to a global `tsc`.
let tscCmd = ["tsc"];
try {
  tscCmd = [process.execPath, createRequire(import.meta.url).resolve("typescript/bin/tsc")];
} catch { /* use global */ }
execFileSync(tscCmd[0], [...tscCmd.slice(1), "-p", "tsconfig.json"], { stdio: "inherit", shell: process.platform === "win32" && tscCmd[0] === "tsc" });

copyFileSync("index.html", "dist/index.html");
copyFileSync("src/styles.css", "dist/styles.css");
if (existsSync("public/icon.png")) copyFileSync("public/icon.png", "dist/icon.png");
// MP3 encoder (LAME, from the `lamejs` package) — copied when installed.
const lame = ["node_modules/lamejs/lame.min.js", "node_modules/lamejs/lame.all.js"].find((f) => existsSync(f));
if (lame) {
  mkdirSync("dist/vendor", { recursive: true });
  copyFileSync(lame, "dist/vendor/lame.min.js");
} else console.warn("Note: lamejs not installed — MP3 export disabled (WAV export works).");
console.log("Built to dist/");
