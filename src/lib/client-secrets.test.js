import assert from "node:assert/strict";
import test from "node:test";
import {
  BYOK_HEADER_GEMINI,
  BYOK_HEADER_OPENROUTER,
  byokRequestHeaders,
  clearLegacyPersistentSecrets,
  clearClientSecrets,
  getClientSecret,
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

test("provider secrets are memory-only and legacy localStorage values are deleted", () => {
  const values = new Map([
    ["geminiApiKey", "legacy-gemini"],
    ["openRouterApiKey", "legacy-openrouter"],
    ["unrelated", "keep-me"],
  ]);
  const storage = {
    getItem: (key) => values.get(key) || null,
    removeItem: (key) => values.delete(key),
  };

  clearClientSecrets();
  clearLegacyPersistentSecrets(storage);

  assert.equal(values.has("geminiApiKey"), false);
  assert.equal(values.has("openRouterApiKey"), false);
  assert.equal(values.get("unrelated"), "keep-me");
  assert.equal(getClientSecret("gemini"), "");
  assert.equal(getClientSecret("openrouter"), "");
});
