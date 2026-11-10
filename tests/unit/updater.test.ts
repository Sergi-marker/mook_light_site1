import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { checkUpdate, applyUpdate } = createRequire(import.meta.url)("../../electron/updater.cjs");
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();

/** origin (bare) + "dev" clone that publishes + "user" clone like the user's PC. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), "bs-upd-"));
  const origin = join(root, "origin.git"), dev = join(root, "dev"), user = join(root, "user");
  execFileSync("git", ["init", "--bare", "-b", "main", origin], { env });
  execFileSync("git", ["clone", origin, dev], { env });
  mkdirSync(join(dev, "scripts"));
  writeFileSync(join(dev, "scripts/build.mjs"), `import { writeFileSync, mkdirSync, readFileSync } from "node:fs"; mkdirSync("dist", { recursive: true }); writeFileSync("dist/version.txt", readFileSync("version.txt", "utf8"));\n`);
  writeFileSync(join(dev, "version.txt"), "1");
  writeFileSync(join(dev, "package.json"), `{ "electron": "^41" }\n`);
  git(dev, "add", "-A"); git(dev, "commit", "-m", "v1"); git(dev, "push", "origin", "main");
  execFileSync("git", ["clone", origin, user], { env });
  const publish = (v: string, file = "version.txt", content = v) => { writeFileSync(join(dev, file), content); git(dev, "commit", "-am", `v${v}`); git(dev, "push", "origin", "main"); };
  return { user, publish };
}

test("one-click update: local edits kept, new version installed and rebuilt; nothing to do when up to date", async () => {
  const { user, publish } = setup();
  assert.deepEqual((await checkUpdate(user)).behind, 0);
  assert.deepEqual((await applyUpdate(user)).steps, ["Déjà à jour."]);
  // The user's own edit (like the Electron version in package.json) and an untracked file.
  writeFileSync(join(user, "package.json"), `{ "electron": "^38.8.6" }\n`);
  writeFileSync(join(user, "electron.zip"), "zip");
  publish("2");
  const c = await checkUpdate(user);
  assert.equal(c.behind, 1);
  const r = await applyUpdate(user);
  assert.ok(r.ok && r.updated, JSON.stringify(r));
  assert.equal(readFileSync(join(user, "version.txt"), "utf8"), "2");
  assert.equal(readFileSync(join(user, "dist/version.txt"), "utf8"), "2", "rebuilt");
  assert.match(readFileSync(join(user, "package.json"), "utf8"), /38\.8\.6/, "local edit restored");
  assert.ok(existsSync(join(user, "electron.zip")), "untracked files untouched");
  assert.equal(git(user, "stash", "list"), "", "nothing left aside");
});

test("one-click update stops safely: local commits, or an edit clashing with the new version (kept)", async () => {
  const a = setup();
  writeFileSync(join(a.user, "mine.txt"), "x");
  git(a.user, "add", "mine.txt"); git(a.user, "commit", "-m", "mine");
  a.publish("2");
  const r = await applyUpdate(a.user);
  assert.ok(!r.ok && /commits/.test(r.error));
  assert.equal(readFileSync(join(a.user, "version.txt"), "utf8"), "1", "nothing changed");

  const b = setup();
  writeFileSync(join(b.user, "package.json"), `{ "electron": "^38.8.6" }\n`);
  b.publish("2", "package.json", `{ "electron": "^42" }\n`);
  const r2 = await applyUpdate(b.user);
  assert.ok(!r2.ok && /gardées/.test(r2.error), JSON.stringify(r2));
  assert.match(git(b.user, "stash", "list"), /beatmaker-auto-update/, "the user's edit is kept in the stash");

  const notGit = mkdtempSync(join(tmpdir(), "bs-nogit-"));
  assert.ok(!(await checkUpdate(notGit)).ok);
});
