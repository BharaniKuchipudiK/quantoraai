import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { capOutput, defaultShell, resolveInsideRoot, stripAnsi } from "./workspace-policy.ts";

const root = path.resolve("/tmp/quantora-ws");

test("paths resolve strictly inside the root", () => {
  assert.equal(resolveInsideRoot(root, "index.html"), path.join(root, "index.html"));
  assert.equal(resolveInsideRoot(root, "src/App.jsx"), path.join(root, "src", "App.jsx"));
});

test("escapes are refused: dot-dot, absolute, root itself, sibling with the same prefix", () => {
  assert.equal(resolveInsideRoot(root, "../etc/passwd"), null);
  assert.equal(resolveInsideRoot(root, "src/../../x"), null);
  assert.equal(resolveInsideRoot(root, "/etc/passwd"), null);
  assert.equal(resolveInsideRoot(root, "."), null);
  assert.equal(resolveInsideRoot(root, ""), null);
  assert.equal(resolveInsideRoot(root, "../quantora-ws-evil/x"), null, "a sibling sharing the prefix is outside");
  assert.equal(resolveInsideRoot("", "x"), null);
});

test("ANSI colour and OSC sequences are stripped from collected output", () => {
  assert.equal(stripAnsi("\u001b[32mok\u001b[0m done"), "ok done");
  assert.equal(stripAnsi("\u001b]0;title\u0007plain"), "plain");
  assert.equal(stripAnsi("no escapes"), "no escapes");
});

test("output is capped to its tail with a visible marker", () => {
  const long = "a".repeat(100) + "\nTHE END";
  const capped = capOutput(long, 20);
  assert.match(capped, /truncated to the last 20 bytes/);
  assert.ok(capped.endsWith("THE END"));
  assert.equal(capOutput("short", 20), "short");
});

test("the shell is the user's login shell with a per-platform -c", () => {
  assert.deepEqual(defaultShell("linux", { SHELL: "/bin/zsh" }), { command: "/bin/zsh", args: ["-c"] });
  assert.deepEqual(defaultShell("darwin", {}), { command: "/bin/sh", args: ["-c"] });
  assert.deepEqual(defaultShell("win32", { ComSpec: "C:\\\\Windows\\\\system32\\\\cmd.exe" }), { command: "C:\\\\Windows\\\\system32\\\\cmd.exe", args: ["/d", "/s", "/c"] });
});
