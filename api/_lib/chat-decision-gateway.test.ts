import test from "node:test";
import assert from "node:assert/strict";
import { formatAffordabilityResponse } from "./chat-decision-gateway.js";
import type { AffordabilityDecision } from "./affordability.js";

function decision(overrides: Partial<AffordabilityDecision> = {}): AffordabilityDecision {
  return {
    verdict: "comfortable",
    currency: "SGD",
    proposedCost: 3000,
    safeSpend: 7000,
    headroom: 4000,
    liquidCash: 12000,
    expectedInflows: 3000,
    commitments: 5000,
    minimumReserve: 3000,
    horizonEnd: "2026-11-17T00:00:00.000Z",
    consideredNodeIds: ["cash", "reserve", "tuition"],
    missing: [],
    reasons: [],
    ...overrides,
  };
}

test("decision response exposes the deterministic cash-flow basis", () => {
  const response = formatAffordabilityResponse(decision());
  assert.match(response, /within your current safe-spend guardrail/i);
  assert.match(response, /Liquid cash: SGD 12000\.00/);
  assert.match(response, /Known commitments.*SGD 5000\.00/);
  assert.match(response, /Protected reserve: SGD 3000\.00/);
  assert.match(response, /not a guess from the language model/i);
});

test("insufficient context never becomes an invented yes or no", () => {
  const response = formatAffordabilityResponse(decision({
    verdict: "insufficient_data",
    safeSpend: null,
    headroom: null,
    minimumReserve: null,
    missing: ["finance.minimum_reserve in SGD"],
  }));
  assert.match(response, /can't give you a safe yes\/no yet/i);
  assert.match(response, /finance\.minimum_reserve in SGD/);
  assert.match(response, /won't treat portfolio value/i);
});
