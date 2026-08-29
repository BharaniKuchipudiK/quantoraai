import assert from "node:assert/strict";
import test from "node:test";

const { handleFxAnalytics } = await import("./fx-analytics-gateway.js");

// A response object that fails loudly if the gateway touches it — proving the
// non-matching paths return false without any side effect on the turn.
function untouchableRes() {
  const guard = () => { throw new Error("res must not be touched on a non-matching turn"); };
  return { writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

test("does not intercept a non-finance domain (isolation)", async () => {
  const handled = await handleFxAnalytics(
    { method: "POST", body: { studioDomain: "travel", message: "how has USD to SGD performed?" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept a plain conversion (that is the point-lookup gateway's job)", async () => {
  const handled = await handleFxAnalytics(
    { method: "POST", body: { studioDomain: "finance", message: "convert 1000 USD to SGD" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept ordinary finance conversation", async () => {
  const handled = await handleFxAnalytics(
    { method: "POST", body: { studioDomain: "finance", message: "should I invest more this year?" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept a non-POST request", async () => {
  const handled = await handleFxAnalytics(
    { method: "GET", body: { studioDomain: "finance", message: "USD to SGD trend" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});
