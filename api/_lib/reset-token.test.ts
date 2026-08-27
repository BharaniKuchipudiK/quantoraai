import test from "node:test";
import assert from "node:assert/strict";
import { createPasswordResetToken, readPasswordResetToken } from "./reset-token.js";

function withSecret(run: () => void) {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "quantora-test-session-secret-32chars!!";
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
}

test("password reset tokens round-trip and reject tampering", () => {
  withSecret(() => {
    const token = createPasswordResetToken(" Casey@Quantora.app ");
    assert.ok(token);
    assert.deepEqual(readPasswordResetToken(token), { email: "casey@quantora.app" });
    assert.equal(readPasswordResetToken(`${token}x`), null);
    assert.equal(readPasswordResetToken("not-a-token"), null);
  });
});
