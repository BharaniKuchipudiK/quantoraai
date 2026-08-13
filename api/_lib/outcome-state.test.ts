import assert from "node:assert/strict";
import test from "node:test";
import { emptyOutcomeState, normalizeOutcomeSessionId, normalizeOutcomeState } from "./outcome-state.js";

test("outcome state defaults to non-consented session memory", () => {
  assert.deepEqual(emptyOutcomeState().memory, { scope: "session", consented: false });
});

test("normalizes provenance, confidence, and enum values", () => {
  const state = normalizeOutcomeState({
    goal: { statement: " Ship a safe beta ", status: "confirmed", sourceTurn: "turn-1" },
    constraints: [{ value: "No fake metrics", confidence: 4, sourceTurn: "turn-2" }],
    assumptions: [{ value: "Mobile first", status: "unknown" }],
    memory: { scope: "project", consented: true },
  });
  assert.equal(state.goal?.statement, "Ship a safe beta");
  assert.equal(state.constraints[0].confidence, 1);
  assert.equal(state.assumptions[0].status, "inferred");
  assert.deepEqual(state.memory, { scope: "project", consented: true });
});

test("rejects unsafe or ambiguous session identifiers", () => {
  assert.equal(normalizeOutcomeSessionId("session-123"), "session-123");
  assert.equal(normalizeOutcomeSessionId("../other-user"), null);
  assert.equal(normalizeOutcomeSessionId("spaces are not valid"), null);
});
