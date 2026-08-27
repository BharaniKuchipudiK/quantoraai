import assert from "node:assert/strict";
import test from "node:test";

const { handleDebtPlan } = await import("./debt-gateway.js");

function untouchableRes() {
  const guard = () => { throw new Error("res must not be touched on a non-matching turn"); };
  return { writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

// A matched intent legitimately sets CORS headers before the data check, so this
// stub allows headers but still throws if the gateway WRITES a response — which
// is what "consumed the turn" means.
function headersOnlyRes() {
  const guard = () => { throw new Error("res must not be written on a fall-through turn"); };
  return { setHeader: () => {}, getHeader: () => undefined, writeHead: guard, write: guard, status: guard, json: guard, end: guard };
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

test("a debt-shaped question WITHOUT balances falls through to the model", async () => {
  // parseDebtIntent reports matched:true on the trigger word alone, so these
  // consumed the turn and returned a demand for balances and APRs forever.
  for (const message of [
    "how does debt affect my credit score?",
    "is debt consolidation a good idea in general?",
    "explain the snowball method",
  ]) {
    const handled = await handleDebtPlan(
      { method: "POST", body: { studioDomain: "finance", message } },
      headersOnlyRes(),
    );
    assert.equal(handled, false, `must fall through: ${message}`);
  }
});
