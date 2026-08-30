import assert from "node:assert/strict";
import test from "node:test";

import { parseFxForecastIntent } from "./fx-forecast-intent.js";

test("parses a forward 'when will X hit <level> Y' question", () => {
  assert.deepEqual(parseFxForecastIntent("when will SGD hit 80 INR"), {
    kind: "fx_forecast", base: "SGD", quote: "INR", target: 80, horizonMonths: 12,
  });
});

test("reads a 'per'-style level with the right direction", () => {
  // "80 INR per 1 SGD" → base is the denominator (SGD), quote the numerator (INR).
  assert.deepEqual(
    parseFxForecastIntent("when will the conversion become 80 INR per 1 SGD"),
    { kind: "fx_forecast", base: "SGD", quote: "INR", target: 80, horizonMonths: 12 },
  );
});

test("reads 'X to the Y' as a per-unit level", () => {
  // A bare "dollar" is intentionally ambiguous (unmapped); "US dollar" resolves.
  assert.deepEqual(
    parseFxForecastIntent("what are the odds the rupee falls to 90 to the US dollar"),
    { kind: "fx_forecast", base: "USD", quote: "INR", target: 90, horizonMonths: 12 },
  );
});

test("captures an explicit horizon and a decimal target", () => {
  assert.deepEqual(
    parseFxForecastIntent("will the pound reach 1.40 against the US dollar in 6 months"),
    { kind: "fx_forecast", base: "GBP", quote: "USD", target: 1.4, horizonMonths: 6 },
  );
});

test("does not fire without a forward/likelihood framing (spot conversion)", () => {
  assert.equal(parseFxForecastIntent("how much is 100 SGD in INR"), null);
  assert.equal(parseFxForecastIntent("convert 500 USD to SGD"), null);
});

test("does not fire on a descriptive history question", () => {
  assert.equal(parseFxForecastIntent("how has SGD/INR moved this year"), null);
});

test("needs two currencies and a target level", () => {
  assert.equal(parseFxForecastIntent("when will SGD hit 80"), null); // one currency
  assert.equal(parseFxForecastIntent("what are the odds for USD and INR"), null); // no target
});
