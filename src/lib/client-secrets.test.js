import assert from "node:assert/strict";
import test from "node:test";
import {
  BYOK_HEADER_GEMINI,
  BYOK_HEADER_OPENROUTER,
  byokRequestHeaders,
  clearClientSecrets,
  setClientSecret,
} from "./client-secrets.js";

test("byokRequestHeaders puts secrets in headers only", () => {
  clearClientSecrets();
  setClientSecret("gemini", "g-key");
  setClientSecret("openrouter", "or-key");
  const headers = byokRequestHeaders({ "Content-Type": "application/json" });
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers[BYOK_HEADER_GEMINI], "g-key");
  assert.equal(headers[BYOK_HEADER_OPENROUTER], "or-key");
  assert.equal(headers.userKey, undefined);
  assert.equal(headers.openRouterKey, undefined);
  clearClientSecrets();
});
