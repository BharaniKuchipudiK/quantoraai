import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCollected } from "./shell.ts";

const skip = process.platform === "win32" ? "POSIX shell semantics" : false;

function withDir(fn: (dir: string) => Promise<void>) {
  return async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "quantora-shell-"));
    try {
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test("a real command produces its real output and exit code", { skip }, withDir(async (dir) => {
  const nonce = `quantora-${Date.now()}`;
  const result = await runCollected(`echo ${nonce}`, { cwd: dir });
  assert.equal(result.ok, true);
  assert.equal(result.output, nonce);
  assert.equal(result.exitCode, 0);
}));

test("the command runs inside the attached folder", { skip }, withDir(async (dir) => {
  writeFileSync(path.join(dir, "hello.txt"), "from disk");
  const result = await runCollected("cat hello.txt && pwd", { cwd: dir });
  assert.equal(result.ok, true);
  assert.ok(result.output.startsWith("from disk"), result.output);
  assert.ok(result.output.trim().endsWith(path.basename(dir)), "pwd is the attached folder");
}));

test("a failing command reports its exit code and stderr, never success", { skip }, withDir(async (dir) => {
  const result = await runCollected("echo oops 1>&2; exit 3", { cwd: dir });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 3);
  assert.match(result.output, /oops/);
}));

test("a silent command is killed after the timeout and says so", { skip }, withDir(async (dir) => {
  const result = await runCollected("sleep 5", { cwd: dir, timeoutMs: 300 });
  assert.equal(result.ok, false);
  assert.match(result.output, /killed: no output/);
}));

test("an invalid line never reaches a shell", withDir(async (dir) => {
  const result = await runCollected("", { cwd: dir });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, null);
}));
