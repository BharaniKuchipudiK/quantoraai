import assert from "node:assert/strict";
import test from "node:test";

const { handleFinancialProfile } = await import("./financial-profile-gateway.js");

function untouchableRes() {
  const guard = () => { throw new Error("res must not be touched on a non-matching turn"); };
  return { writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

test("ignores a non-finance domain (isolation)", async () => {
  const handled = await handleFinancialProfile(
    { method: "POST", body: { studioDomain: "travel", message: "set my goal to SGD 1,000,000 in 20 years" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("ignores an ordinary finance message that is neither a command nor a profile query", async () => {
  const handled = await handleFinancialProfile(
    { method: "POST", body: { studioDomain: "finance", message: "what do you think of index funds?" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("ignores a non-POST request", async () => {
  const handled = await handleFinancialProfile(
    { method: "GET", body: { studioDomain: "finance", message: "show my profile" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});
