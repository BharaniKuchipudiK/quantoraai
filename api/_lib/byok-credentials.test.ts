import assert from "node:assert/strict";
import test from "node:test";
import {
  BYOK_HEADER_ANTHROPIC,
  BYOK_HEADER_GEMINI,
  BYOK_HEADER_OPENROUTER,
  readByokCredentials,
} from "./byok-credentials.js";

test("readByokCredentials prefers headers and ignores body keys", () => {
  const creds = readByokCredentials({
    headers: {
      [BYOK_HEADER_GEMINI]: " header-gemini ",
      [BYOK_HEADER_OPENROUTER]: "header-or",
      [BYOK_HEADER_ANTHROPIC]: "header-anthropic",
    },
    body: {
      userKey: "body-gemini",
      openRouterKey: "body-or",
      anthropicKey: "body-anthropic",
    },
  });
  assert.deepEqual(creds, {
    gemini: "header-gemini",
    openRouter: "header-or",
    anthropic: "header-anthropic",
  });
});

test("readByokCredentials does not fall back to body fields", () => {
  const creds = readByokCredentials({
    headers: {},
    body: {
      userKey: "body-gemini",
      openRouterKey: "body-or",
      anthropicKey: "body-anthropic",
    },
  });
  assert.deepEqual(creds, {});
});

test("readByokCredentials accepts case-insensitive header names", () => {
  const creds = readByokCredentials({
    headers: {
      "X-Quantora-Gemini-Key": "G",
    },
  });
  assert.equal(creds.gemini, "G");
});
