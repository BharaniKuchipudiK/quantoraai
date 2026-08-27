import test from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_RESET_GENERIC_MESSAGE, passwordResetDelivery, providerLabel, rowsMatchingAuthEmail } from "./auth-privacy.ts";

test("password reset never distinguishes missing accounts in the public copy", () => {
  assert.match(PASSWORD_RESET_GENERIC_MESSAGE, /if an account exists/i);
  assert.equal(passwordResetDelivery(null), "none");
  assert.equal(passwordResetDelivery({ password_hash: null }), "provider-notice");
  assert.equal(passwordResetDelivery({ password_hash: "scrypt:x" }), "reset");
});

test("provider labels stay generic and do not include emails", () => {
  assert.equal(providerLabel("github"), "GitHub");
  assert.equal(providerLabel("email"), "email and password");
  assert.equal(providerLabel("google"), "Google");
  assert.equal(providerLabel(undefined), "Google");
});

test("email lookup ignores ILIKE underscore aliases", () => {
  const rows = [
    { email: "janeXdoe@quantora.test" },
    { email: "jane_doe@quantora.test" },
  ];
  const matches = rowsMatchingAuthEmail(rows, "Jane_Doe@quantora.test");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].email, "jane_doe@quantora.test");
});
