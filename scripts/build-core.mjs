// Compile src/core → build/core for the browser engine tests.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
let cmd = ["tsc"];
try {
  cmd = [process.execPath, createRequire(import.meta.url).resolve("typescript/bin/tsc")];
} catch { /* global tsc */ }
execFileSync(cmd[0], [...cmd.slice(1), "-p", "tsconfig.core.json"], { stdio: "inherit", shell: process.platform === "win32" && cmd[0] === "tsc" });
