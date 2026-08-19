import assert from "node:assert/strict";
import test from "node:test";
import {
  appendExplicitHumanLedgerEvent,
  deriveCognitiveLedgerTransitions,
  reconcileOutcomeCognitiveLedger,
} from "./cognitive-ledger-transitions.js";

const base = {
  definitionOfDone: [], constraints: [], assumptions: [], openQuestions: [], decisions: [], artifacts: [], nextActions: [],
  cognitiveLedger: [],
  memory: { scope: "project" as const, consented: true }, safety: { unresolvedFlags: [] },
};

test("a new persisted decision creates a deterministic ledger event", () => {
  const ledger = deriveCognitiveLedgerTransitions(base, {
    ...base,
    decisions: [{ value: "Use the API pull mechanism", rationale: "Lower coupling" }],
  }, { sourceTurn: "turn-1", now: "2026-08-19T01:00:00Z" });

  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].type, "decision");
  assert.equal(ledger[0].actor, "system");
  assert.equal(ledger[0].statement, "Use the API pull mechanism");
  assert.equal(ledger[0].rationale, "Lower coupling");
});

test("rejected assumption becomes first-class rejection history", () => {
  const previous = { ...base, assumptions: [{ value: "Use batch sync", status: "confirmed" as const }] };
  const next = { ...base, assumptions: [{ value: "Use batch sync", status: "rejected" as const }] };
  const ledger = deriveCognitiveLedgerTransitions(previous, next, { now: "2026-08-19T01:00:00Z" });

  assert.equal(ledger[0].type, "rejection");
  assert.match(ledger[0].rationale || "", /Previously confirmed/);
});

test("goal change, verification and achieved outcome leave durable traces", () => {
  const previous = {
    ...base,
    goal: { statement: "Prepare the architecture", status: "confirmed" as const },
    artifacts: [{ type: "architecture", ref: "arch:v2", verifiedAt: null }],
  };
  const next = {
    ...base,
    goal: { statement: "Ship the verified architecture", status: "achieved" as const },
    artifacts: [{ type: "architecture", ref: "arch:v2", verifiedAt: "2026-08-19T02:00:00Z" }],
  };
  const ledger = deriveCognitiveLedgerTransitions(previous, next, { now: "2026-08-19T02:00:00Z" });

  assert.ok(ledger.some((entry) => entry.type === "correction" && /goal changed/i.test(entry.statement)));
  assert.ok(ledger.some((entry) => entry.type === "evidence" && entry.ref === "arch:v2"));
  assert.ok(ledger.some((entry) => entry.type === "outcome_transition" && /achieved/i.test(entry.statement)));
});

test("normal state save preserves server ledger and ignores replacement deletion", () => {
  const previous = {
    ...base,
    cognitiveLedger: [{
      id: "reject-old",
      type: "rejection" as const,
      statement: "Do not use the old layout",
      actor: "user" as const,
      status: "active" as const,
    }],
  };
  const next = { ...base, cognitiveLedger: [] };
  const reconciled = reconcileOutcomeCognitiveLedger(previous, next, { now: "2026-08-19T03:00:00Z" });

  assert.equal(reconciled.cognitiveLedger.length, 1);
  assert.equal(reconciled.cognitiveLedger[0].id, "reject-old");
});

test("explicit human ledger append is server-stamped as user judgment", () => {
  const next = appendExplicitHumanLedgerEvent(base, {
    type: "approval",
    statement: "Approve the production deployment",
    rationale: "Release checks passed",
    ref: "deploy:release-42",
  }, { sourceTurn: "turn-user-4", now: "2026-08-19T04:00:00Z" });

  assert.ok(next);
  assert.equal(next?.cognitiveLedger.length, 1);
  assert.equal(next?.cognitiveLedger[0].type, "approval");
  assert.equal(next?.cognitiveLedger[0].actor, "user");
  assert.equal(next?.cognitiveLedger[0].confidence, 1);
});

test("invalid explicit human judgment is rejected", () => {
  const next = appendExplicitHumanLedgerEvent(base, {
    type: "approval",
    statement: "   ",
  });
  assert.equal(next, null);
});
