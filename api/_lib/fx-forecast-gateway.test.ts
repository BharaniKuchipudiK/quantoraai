import assert from "node:assert/strict";
import test from "node:test";

const { handleFxForecast } = await import("./fx-forecast-gateway.js");

function untouchableRes() {
  const guard = () => { throw new Error("res must not be touched on a non-matching turn"); };
  return { writeHead: guard, write: guard, status: guard, json: guard, end: guard };
}

test("ignores a non-finance domain (isolation)", async () => {
  const handled = await handleFxForecast(
    { method: "POST", body: { studioDomain: "study", message: "when will SGD hit 80 INR" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("ignores a finance turn with no forecast intent", async () => {
  const handled = await handleFxForecast(
    { method: "POST", body: { studioDomain: "finance", message: "convert 1000 USD to SGD" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});

test("ignores a non-POST request", async () => {
  const handled = await handleFxForecast(
    { method: "GET", body: { studioDomain: "finance", message: "when will SGD hit 80 INR" } },
    untouchableRes(),
  );
  assert.equal(handled, false);
});
