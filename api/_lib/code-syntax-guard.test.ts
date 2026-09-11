/**
 * The free, real safety net: a file that cannot even parse must never be
 * pushed as a commit. Not a test run — Vercel's serverless runtime has no
 * git or npm binary at execution time (confirmed with a live search before
 * writing this, not assumed) — but a real parse check, in memory, for free.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { checkFilesParse } from "./code-syntax-guard.js";

test("valid TypeScript, TSX, JS, JSX and JSON all pass", () => {
  const result = checkFilesParse([
    { path: "api/x.ts", content: "export const x: number = 1;\n" },
    { path: "src/Widget.tsx", content: "export default function Widget() { return <div>hi</div>; }\n" },
    { path: "api/y.js", content: "module.exports = { ok: true };\n" },
    { path: "src/Thing.jsx", content: "export default function Thing() { return <span>hi</span>; }\n" },
    { path: "package.json", content: JSON.stringify({ name: "x" }) },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("a stray unclosed brace is caught, names the file, and does not throw", () => {
  const result = checkFilesParse([
    { path: "api/broken.ts", content: "export function f() {\n  return 1;\n" },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].path, "api/broken.ts");
  assert.match(result.failures[0].error, /error/i);
});

test("invalid JSON is caught by name, separately from JS/TS parsing", () => {
  const result = checkFilesParse([
    { path: "config.json", content: "{ not: valid, json" },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].path, "config.json");
});

test("one broken file among several good ones fails the whole batch and names only the broken one", () => {
  const result = checkFilesParse([
    { path: "api/good.ts", content: "export const ok = true;\n" },
    { path: "api/bad.ts", content: "export function f( {\n" },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].path, "api/bad.ts");
});

test("an unrecognised extension is reported as skipped, never silently counted as passing", () => {
  const result = checkFilesParse([
    { path: "README.md", content: "# not checked" },
    { path: "assets/logo.svg", content: "<svg>not js</svg>" },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.skipped.sort(), ["README.md", "assets/logo.svg"]);
});

test("an empty file list is trivially ok, with nothing skipped or failed", () => {
  const result = checkFilesParse([]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.skipped, []);
});
