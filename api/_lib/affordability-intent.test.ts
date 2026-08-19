import test from "node:test";
import assert from "node:assert/strict";
import { parseAffordabilityIntent } from "./affordability-intent.js";

test("detects explicit affordability question with SGD amount", () => {
  assert.deepEqual(
    parseAffordabilityIntent("Can I afford a SGD 3,000 Japan trip in October?"),
    { matched: true, proposedCost: 3000, currency: "SGD" },
  );
});

test("supports amount suffixes and currency after amount", () => {
  assert.deepEqual(
    parseAffordabilityIntent("Could we afford 4.5k SGD for the holiday?"),
    { matched: true, proposedCost: 4500, currency: "SGD" },
  );
});

test("US dollar symbol cannot be misread as Singapore dollars", () => {
  assert.deepEqual(
    parseAffordabilityIntent("Can I afford US$ 3,000 for this?"),
    { matched: true, proposedCost: 3000, currency: "USD" },
  );
});

test("plain dollar symbol is intentionally ambiguous", () => {
  assert.deepEqual(
    parseAffordabilityIntent("Can I afford a $3,000 trip?"),
    { matched: true, proposedCost: null, currency: null },
  );
});

test("multiple currencies fail closed instead of guessing", () => {
  assert.deepEqual(
    parseAffordabilityIntent("Can I afford SGD 3,000 if the quote is also shown as USD 2,300?"),
    { matched: true, proposedCost: null, currency: null },
  );
});

test("ordinary financial questions are not hijacked by the decision gateway", () => {
  assert.deepEqual(
    parseAffordabilityIntent("What is a sensible travel budget for Japan?"),
    { matched: false, proposedCost: null, currency: null },
  );
});
