import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.BS_FAST_RETRY = "1";
// @ts-ignore — plain ES module script
import { downloadResumable, sha256File } from "../../scripts/setup-electron.mjs";

test("Electron download resumes after repeated connection resets and ends byte-identical", async () => {
  const data = randomBytes(5 * 1024 * 1024 + 123);
  const expected = createHash("sha256").update(data).digest("hex");
  let requests = 0;
  // Like the failing network: every response is cut after ~1 MB (socket destroyed = "connection reset").
  const server = createServer((req, res) => {
    requests++;
    const m = /bytes=(\d+)-/.exec(req.headers.range ?? "");
    const start = m ? Number(m[1]) : 0;
    res.writeHead(m ? 206 : 200, {
      "content-length": String(data.length - start),
      ...(m ? { "content-range": `bytes ${start}-${data.length - 1}/${data.length}` } : {}),
    });
    const end = Math.min(data.length, start + 1024 * 1024);
    res.write(data.subarray(start, end), () => {
      if (end < data.length) req.socket.destroy();
      else res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  const dir = mkdtempSync(join(tmpdir(), "bs-dl-"));
  const dest = join(dir, "electron.zip");
  const logs: string[] = [];
  try {
    await downloadResumable(`http://127.0.0.1:${port}/electron.zip`, dest, { attempts: 20, log: (s: string) => logs.push(s) });
  } finally {
    server.close();
  }
  assert.ok(requests >= 6, `resumed ${requests} times`);
  assert.ok(logs.some((l) => /reprise/.test(l)), "the user sees that it resumes");
  assert.equal(await sha256File(dest), expected);
  assert.equal(readFileSync(dest).length, data.length);
  assert.equal(existsSync(`${dest}.part`), false);
});
