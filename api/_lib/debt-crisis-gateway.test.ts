import assert from "node:assert/strict";
import test from "node:test";

const { handleDebtCrisis } = await import("./debt-crisis-gateway.js");

function untouchableRes() {
  const guard = () => { throw new Error("res must not be touched on a non-matching turn"); };
  return { writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

test("ignores a non-finance domain (isolation)", async () => {
  const handled = await handleDebtCrisis(
    { method: "POST", body: { studioDomain: "travel", message: "consolidate my debts" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("ignores an ordinary finance message with no crisis intent", async () => {
  const handled = await handleDebtCrisis(
    { method: "POST", body: { studioDomain: "finance", message: "what's the USD to SGD rate?" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("ignores a non-POST request", async () => {
  const handled = await handleDebtCrisis(
    { method: "GET", body: { studioDomain: "finance", message: "bridge the gap between my salary and debt" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});
