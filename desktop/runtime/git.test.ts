import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runDeskGitOnDisk } from "./git.ts";

const hasGit = spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0;
const skip = hasGit ? false : "git is not installed";

test("init → status → commit → diff against a real repository", { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "quantora-git-"));
  try {
    writeFileSync(path.join(dir, "index.html"), "<h1>one</h1>\n");

    const before = await runDeskGitOnDisk("status", "", dir);
    assert.equal(before.ok, false);
    assert.match(before.output, /not a git repository/i, "the pane's missing-repo detector must see git's own words");

    const init = await runDeskGitOnDisk("init", "", dir);
    assert.equal(init.ok, true, init.output);

    const status = await runDeskGitOnDisk("status", "", dir);
    assert.equal(status.ok, true);
    assert.match(status.output, /\?\? index\.html/);

    const noMessage = await runDeskGitOnDisk("commit", "   ", dir);
    assert.equal(noMessage.ok, false);
    assert.match(noMessage.output, /real message/);

    const commit = await runDeskGitOnDisk("commit", "first", dir);
    assert.equal(commit.ok, true, commit.output);
    assert.match(commit.output, /first/);

    writeFileSync(path.join(dir, "index.html"), "<h1>two</h1>\n");
    writeFileSync(path.join(dir, "new.txt"), "n\n");
    const diff = await runDeskGitOnDisk("diff", "", dir);
    assert.equal(diff.ok, true);
    assert.match(diff.output, /^-<h1>one<\/h1>$/m);
    assert.match(diff.output, /^\+<h1>two<\/h1>$/m);
    assert.match(diff.output, /\?\? new\.txt/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("only the desk's four verbs are accepted", async () => {
  const result = await runDeskGitOnDisk("push", "", tmpdir());
  assert.equal(result.ok, false);
  assert.match(result.output, /only runs git status, diff, commit/);
});
