// Shared Playwright loader for the browser and end-to-end tests.
// Uses the project's Playwright; when the Chromium build it expects is not downloaded, falls back
// to a Chromium already on the machine (PLAYWRIGHT_CHROMIUM or $PLAYWRIGHT_BROWSERS_PATH/chromium).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadPlaywright() {
  for (const id of ["playwright", "@playwright/test", "/opt/node22/lib/node_modules/playwright"]) {
    try { return require(id); } catch { /* next */ }
  }
  throw new Error("Playwright not found. Install it with: npm i -D playwright");
}

export const { chromium } = loadPlaywright();

/** chromium.launch() with an executable that exists. */
export function launchChromium(options = {}) {
  if (existsSync(chromium.executablePath())) return chromium.launch(options);
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM, process.env.PLAYWRIGHT_BROWSERS_PATH && join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium")];
  const executablePath = candidates.find((p) => p && existsSync(p));
  if (!executablePath) throw new Error(`Chromium for Playwright is not installed (${chromium.executablePath()}). Run: npx playwright install chromium`);
  return chromium.launch({ ...options, executablePath });
}
