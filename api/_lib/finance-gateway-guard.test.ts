import assert from "node:assert/strict";
import test from "node:test";

import { guardFinanceGateway } from "./finance-gateway-guard.js";

function fakeRes() {
  return {
    headersSent: false,
    writableEnded: false,
    ended: 0,
    end() { this.ended += 1; this.writableEnded = true; },
  };
}

test("passes through a normal true result untouched", async () => {
  const res = fakeRes();
  const handled = await guardFinanceGateway("x", res, async () => true);
  assert.equal(handled, true);
  assert.equal(res.ended, 0, "the guard did not touch the response");
});

test("passes through a normal false result untouched", async () => {
  const res = fakeRes();
  const handled = await guardFinanceGateway("x", res, async () => false);
  assert.equal(handled, false);
  assert.equal(res.ended, 0);
});

test("a throw BEFORE the stream opens falls through to chat (returns false)", async () => {
  const res = fakeRes(); // headersSent stays false
  const handled = await guardFinanceGateway("x", res, async () => {
    throw new Error("boom before writeHead");
  });
  assert.equal(handled, false, "pipeline should continue to normal chat");
  assert.equal(res.ended, 0, "no half-open stream to close");
});

test("a throw AFTER the stream opens closes it cleanly and reports handled", async () => {
  const res = fakeRes();
  const handled = await guardFinanceGateway("x", res, async () => {
    res.headersSent = true; // simulate sendStream having written the head
    throw new Error("boom mid-stream");
  });
  assert.equal(handled, true, "cannot fall through once bytes are sent");
  assert.equal(res.ended, 1, "the open stream was ended exactly once");
});

test("never rethrows even if res.end itself throws", async () => {
  const res = {
    headersSent: true,
    writableEnded: false,
    end() { throw new Error("socket already gone"); },
  };
  const handled = await guardFinanceGateway("x", res, async () => {
    throw new Error("boom");
  });
  assert.equal(handled, true, "swallows the secondary failure and reports handled");
});
