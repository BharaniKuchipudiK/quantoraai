import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, verifyPasswordAgainstStore, isStrongEnoughPassword } from "./password.ts";

test("password hash roundtrip", async () => {
  const hash = await hashPassword("test-password-123");
  assert.equal(await verifyPassword("test-password-123", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("missing accounts still pay a password-check cost and never verify as true", async () => {
  assert.equal(await verifyPasswordAgainstStore("any-password", null), false);
  assert.equal(await verifyPasswordAgainstStore("quantora-dummy-not-a-password", null), false);
});
