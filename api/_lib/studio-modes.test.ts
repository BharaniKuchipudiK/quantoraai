import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStudioMode } from "./studio-modes.ts";

test("normalizeStudioMode defaults to ask", () => {
  assert.equal(normalizeStudioMode(undefined), "ask");
  assert.equal(normalizeStudioMode("invalid"), "ask");
  assert.equal(normalizeStudioMode("build"), "build");
  assert.equal(normalizeStudioMode("plan"), "plan");
});
