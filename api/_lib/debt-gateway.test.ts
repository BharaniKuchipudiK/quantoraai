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

function capturingRes() {
  const chunks: string[] = [];
  return {
    chunks,
    setHeader: () => {}, getHeader: () => undefined,
    writeHead: () => {},
    write: (c: string) => { chunks.push(String(c)); return true; },
    end: () => {},
    status() { throw new Error("no error status expected"); },
    json() { throw new Error("no error body expected"); },
    text() { return chunks.join(""); },
  };
}

test("a stated income is a constraint, not payment capacity", async () => {
  // 25,000/month of minimums against 15,000/month of income. Before this, the
  // salary was read as EXTRA on top of the minimums and the desk answered
  // "Debt-free in 1 yr" — deterministically, and wrong.
  const res = capturingRes();
  const handled = await handleDebtPlan(
    {
      method: "POST",
      body: {
        studioDomain: "finance",
        message: "Help me pay off my debts: $400,000 at 4% (min $18,000) and $60,000 at 24% (min $7,000). I only earn $15,000 per month.",
      },
    },
    res,
  );
  assert.equal(handled, true);
  const text = res.text();
  assert.doesNotMatch(text, /Debt-free in/);
  assert.match(text, /shortfall of \*\*10,000 every month\*\*/);
  // And it leaves the conversation open rather than ending the turn.
  assert.match(text, /<quantora-modal>/);
  assert.match(text, /quantora-ctx/);
});

test("a plan with real payment capacity still computes", async () => {
  const res = capturingRes();
  const handled = await handleDebtPlan(
    {
      method: "POST",
      body: {
        studioDomain: "finance",
        message: "pay off my debts: $5,000 at 19.99% (min $150) and $3,000 at 24% (min $90). I can put $600 per month extra.",
      },
    },
    res,
  );
  assert.equal(handled, true);
  assert.match(res.text(), /Debt-free in/);
});
