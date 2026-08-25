import assert from "node:assert/strict";
import test from "node:test";

const { handleFinanceAdvisor } = await import("./finance-advisor-gateway.js");

function untouchableRes() {
  const guard = () => { throw new Error("res must not be touched on a non-matching turn"); };
  return { writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

test("ignores a non-finance domain (isolation)", async () => {
  const handled = await handleFinanceAdvisor(
    { method: "POST", body: { studioDomain: "study", message: "build me a financial plan" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("ignores an ordinary finance message with no advice intent", async () => {
  const handled = await handleFinanceAdvisor(
    { method: "POST", body: { studioDomain: "finance", message: "convert 1000 USD to SGD" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("ignores a non-POST request", async () => {
  const handled = await handleFinanceAdvisor(
    { method: "GET", body: { studioDomain: "finance", message: "build me a plan" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});
