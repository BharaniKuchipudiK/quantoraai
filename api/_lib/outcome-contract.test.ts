import assert from "node:assert/strict";
import test from "node:test";

import type { ConversationSnapshot } from "./conversation-engine.js";
import { buildOutcomeContract, evaluateProofOfDone } from "./outcome-contract.js";

function snapshot(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    policyVersion: "test",
    stateSource: "authoritative",
    authorityScope: "session",
    stateVersion: 1,
    projectContext: null,
    goal: { statement: "Prepare an executive cloud migration strategy", status: "confirmed" },
    definitionOfDone: [
      { criterion: "Executive deck is complete", confirmed: false },
      { criterion: "Roadmap is included", confirmed: false },
    ],
    confirmedFacts: ["Audience is the CIO"],
    inferredFacts: [],
    openQuestions: [],
    decisions: ["Use a phased migration approach"],
    artifacts: [],
    nextActions: [{ action: "Build the executive deck", risk: "low" }],
    cognitiveLedger: [],
    safetyFlags: [],
    recentSignals: [],
    currentTurn: {
      message: "Create the migration strategy",
      taskCategory: "presentation",
      studioMode: "office",
      studioDomain: "presentation",
      guidedBuild: false,
      refineMode: false,
      choiceSelected: false,
    },
    ...overrides,
  };
}

test("Outcome Contract projects the mission and completion criteria without creating a second state store", () => {
  const contract = buildOutcomeContract(snapshot());
  assert.equal(contract.mission.statement, "Prepare an executive cloud migration strategy");
  assert.equal(contract.mission.status, "confirmed");
  assert.equal(contract.successCriteria.length, 2);
  assert.equal(contract.progress.criteriaConfirmed, 0);
  assert.equal(contract.status, "executing");
  assert.deepEqual(contract.context.decisions, ["Use a phased migration approach"]);
});

test("material questions block Done even if criteria are otherwise satisfied", () => {
  const result = evaluateProofOfDone(snapshot({
    goal: { statement: "Prepare an executive cloud migration strategy", status: "achieved" },
    definitionOfDone: [
      { criterion: "Executive deck is complete", confirmed: true },
      { criterion: "Roadmap is included", confirmed: true },
    ],
    openQuestions: [{ question: "Which target cloud is approved?", material: true }],
  }));

  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("No material question remains unresolved"));
});

test("an unverified artifact prevents a verified Done claim", () => {
  const result = evaluateProofOfDone(snapshot({
    goal: { statement: "Prepare an executive cloud migration strategy", status: "achieved" },
    definitionOfDone: [
      { criterion: "Executive deck is complete", confirmed: true },
      { criterion: "Roadmap is included", confirmed: true },
    ],
    artifacts: [{ type: "presentation", ref: "artifact:pptx:v1", verified: false }],
  }));

  assert.equal(result.status, "verification_required");
  assert.ok(result.blockers.includes("Produced artifacts are verified"));
  assert.ok(result.blockers.includes("Completion evidence is attached"));
});

test("verified Done requires achieved mission, satisfied criteria, verified artifact and evidence", () => {
  const result = evaluateProofOfDone(snapshot({
    goal: { statement: "Prepare an executive cloud migration strategy", status: "achieved" },
    definitionOfDone: [
      { criterion: "Executive deck is complete", confirmed: true },
      { criterion: "Roadmap is included", confirmed: true },
    ],
    artifacts: [{ type: "presentation", ref: "artifact:pptx:v2", verified: true }],
    cognitiveLedger: [{
      id: "evidence-1",
      type: "evidence",
      statement: "Presentation verifier passed",
      actor: "tool",
      status: "active",
      ref: "artifact:pptx:v2",
    }],
  }));

  assert.equal(result.status, "verified");
  assert.equal(result.score, 1);
  assert.deepEqual(result.blockers, []);
  assert.ok(result.evidenceRefs.includes("artifact:pptx:v2"));
});

test("criteria completion without explicit mission closure remains verification_required", () => {
  const result = evaluateProofOfDone(snapshot({
    goal: { statement: "Prepare an executive cloud migration strategy", status: "confirmed" },
    definitionOfDone: [
      { criterion: "Executive deck is complete", confirmed: true },
      { criterion: "Roadmap is included", confirmed: true },
    ],
  }));

  assert.equal(result.status, "verification_required");
  assert.ok(result.blockers.includes("Mission is explicitly marked achieved"));
});

test("active rejections and corrections remain visible in the living contract", () => {
  const contract = buildOutcomeContract(snapshot({
    cognitiveLedger: [
      {
        id: "reject-1",
        type: "rejection",
        statement: "Do not use a big-bang migration approach",
        actor: "user",
        status: "active",
      },
      {
        id: "correct-1",
        type: "correction",
        statement: "Use an 18-month roadmap, not 24 months",
        actor: "user",
        status: "active",
      },
    ],
  }));

  assert.deepEqual(contract.unresolved.activeRejections, ["Do not use a big-bang migration approach"]);
  assert.deepEqual(contract.unresolved.activeCorrections, ["Use an 18-month roadmap, not 24 months"]);
});
