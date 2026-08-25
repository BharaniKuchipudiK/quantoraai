import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, isStrongEnoughPassword } from "./password.ts";

test("password hash roundtrip", async () => {
  const hash = await hashPassword("test-password-123");
  assert.equal(await verifyPassword("test-password-123", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("password strength check", () => {
  assert.equal(isStrongEnoughPassword("short"), false);
  assert.equal(isStrongEnoughPassword("long-enough"), true);
});
