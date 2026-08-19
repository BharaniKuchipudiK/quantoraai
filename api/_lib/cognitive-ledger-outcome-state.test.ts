import assert from "node:assert/strict";
import test from "node:test";
import { emptyOutcomeState, normalizeOutcomeState } from "./outcome-state.js";

test("legacy Outcome State normalizes with an empty Cognitive Ledger", () => {
  const state = normalizeOutcomeState({
    goal: { statement: "Ship the beta", status: "confirmed" },
    decisions: [{ value: "Use API pull" }],
    memory: { scope: "project", consented: true },
  });

  assert.equal(state.goal?.statement, "Ship the beta");
  assert.deepEqual(state.cognitiveLedger, []);
});

test("empty Outcome State includes the Cognitive Ledger contract", () => {
  assert.deepEqual(emptyOutcomeState().cognitiveLedger, []);
});

test("Outcome State normalizes durable rejection and correction history", () => {
  const state = normalizeOutcomeState({
    cognitiveLedger: [
      {
        id: "reject-layout",
        type: "rejection",
        statement: "Do not return to the three-card homepage layout",
        actor: "user",
      },
      {
        id: "correct-layout",
        type: "correction",
        statement: "Use one continuous outcome story",
        actor: "user",
        supersedes: "old-layout-decision",
      },
    ],
    memory: { scope: "project", consented: true },
  });

  assert.equal(state.cognitiveLedger.length, 2);
  assert.equal(state.cognitiveLedger[0].type, "rejection");
  assert.equal(state.cognitiveLedger[1].type, "correction");
});

test("malformed ledger entries cannot pollute Outcome State", () => {
  const state = normalizeOutcomeState({
    cognitiveLedger: [null, {}, { type: "decision", statement: "" }, { type: "decision", statement: "Keep this", actor: "user" }],
  });

  assert.equal(state.cognitiveLedger.length, 1);
  assert.equal(state.cognitiveLedger[0].statement, "Keep this");
});
