import assert from "node:assert/strict";
import test from "node:test";

const { handleMarketDataLookup } = await import("./market-data-gateway.js");

// A response object that fails loudly if the gateway touches it — proving the
// non-matching paths return false without any side effect on the turn.
function untouchableRes() {
  const guard = () => { throw new Error("res must not be touched on a non-matching turn"); };
  return { writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

test("does not intercept a non-finance domain (isolation)", async () => {
  const handled = await handleMarketDataLookup(
    { method: "POST", body: { studioDomain: "travel", message: "USD to SGD" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept ordinary finance conversation", async () => {
  const handled = await handleMarketDataLookup(
    { method: "POST", body: { studioDomain: "finance", message: "should I invest more this year?" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept a non-POST request", async () => {
  const handled = await handleMarketDataLookup(
    { method: "GET", body: { studioDomain: "finance", message: "USD to SGD" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});
