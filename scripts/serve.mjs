// Minimal static server for dist/ (browser mode, no dependency). Usage: node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 5173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".map": "application/json", ".png": "image/png" };

createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = normalize(join(dist, pathname === "/" ? "index.html" : pathname));
  if (!file.startsWith(dist)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Beatmaker Studio: http://127.0.0.1:${port}/`));
