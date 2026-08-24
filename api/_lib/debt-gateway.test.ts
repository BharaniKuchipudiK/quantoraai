import assert from "node:assert/strict";
import test from "node:test";

const { handleDebtPlan } = await import("./debt-gateway.js");

function untouchableRes() {
  const guard = () => { throw new Error("res must not be touched on a non-matching turn"); };
  return { writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

test("does not intercept a non-finance domain (isolation)", async () => {
  const handled = await handleDebtPlan(
    { method: "POST", body: { studioDomain: "travel", message: "pay off $5000 at 20%, $300/month" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept ordinary finance conversation", async () => {
  const handled = await handleDebtPlan(
    { method: "POST", body: { studioDomain: "finance", message: "should I invest more this year?" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept a non-POST request", async () => {
  const handled = await handleDebtPlan(
    { method: "GET", body: { studioDomain: "finance", message: "debt payoff plan for $5000 at 20%, $300/month" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});
