// © la triche — Animots
// Serveur statique minimal pour Animots (video-studio/). Usage : node scripts/serve-video.mjs [port] [--host 0.0.0.0] [--dir dist-free]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../video-studio/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
};

/** dir : dossier servi (par défaut video-studio/, ou la version gratuite construite). */
export function videoStudioServer(dir = root) {
  return createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = normalize(join(dir, pathname === "/" ? "index.html" : pathname));
    if (!file.startsWith(normalize(`${dir}/`))) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] ?? process.env.PORT ?? 5174);
  const host = process.argv.includes("--host") ? process.argv[process.argv.indexOf("--host") + 1] : "127.0.0.1";
  const dir = process.argv.includes("--dir") ? normalize(`${process.cwd()}/${process.argv[process.argv.indexOf("--dir") + 1]}/`) : root;
  videoStudioServer(dir).listen(port, host, () => console.log(`Animots : http://${host}:${port}/`));
}
