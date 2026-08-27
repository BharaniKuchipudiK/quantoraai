import test from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_RESET_GENERIC_MESSAGE, passwordResetDelivery, providerLabel } from "./auth-privacy.ts";

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
