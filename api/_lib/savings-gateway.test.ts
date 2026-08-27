import assert from "node:assert/strict";
import test from "node:test";

const { handleSavingsGoal } = await import("./savings-gateway.js");

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

test("a savings-shaped question WITHOUT numbers falls through to the model", async () => {
  // The trigger is the bare word "save", so these all matched and used to be
  // answered with a canned demand for three numbers — streamed as the assistant,
  // with the model never called. Rephrasing kept the trigger, so there was no way
  // out. untouchableRes() throws if the gateway writes, proving it stays silent.
  for (const message of [
    "how can I save on taxes?",
    "should I save or invest right now?",
    "help me start saving, I don't know where to begin",
  ]) {
    const handled = await handleSavingsGoal(
      { method: "POST", body: { studioDomain: "finance", message } },
      headersOnlyRes(),
    );
    assert.equal(handled, false, `must fall through: ${message}`);
  }
});
