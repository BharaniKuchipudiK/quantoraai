import assert from "node:assert/strict";
import test from "node:test";

const { handleSavingsGoal } = await import("./savings-gateway.js");

function untouchableRes() {
  const guard = () => { throw new Error("res must not be touched on a non-matching turn"); };
  return { writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

test("does not intercept a non-finance domain (isolation)", async () => {
  const handled = await handleSavingsGoal(
    { method: "POST", body: { studioDomain: "education", message: "save $20,000 in 3 years, $400/month" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept ordinary finance conversation", async () => {
  const handled = await handleSavingsGoal(
    { method: "POST", body: { studioDomain: "finance", message: "what's my portfolio doing this year?" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("does not intercept a non-POST request", async () => {
  const handled = await handleSavingsGoal(
    { method: "GET", body: { studioDomain: "finance", message: "save $20,000 in 3 years, $400/month" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});
