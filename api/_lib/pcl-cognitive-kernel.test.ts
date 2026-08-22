import assert from "node:assert/strict";
import test from "node:test";
import { buildConversationSnapshot, chooseNextConversationMove } from "./conversation-engine.js";
import { assessPclCognition, formatPclCognitiveContract } from "./pcl-cognitive-kernel.js";
import { derivePclConversationLead } from "./pcl-conversation-lead.js";

test("safe reversible work stays autonomous instead of asking unnecessary questions", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Draft the executive summary" },
    message: "Draft the executive summary now.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const cognition = assessPclCognition({ snapshot, decision });

  assert.equal(decision.move, "act");
  assert.equal(cognition.humanGate, "none");
  assert.equal(cognition.autonomy, "autonomous");
  assert.equal(cognition.responsePolicy.questionBudget, 0);
  assert.equal(cognition.responsePolicy.leadWithOutcome, true);
});

test("Travel can lead naturally with one optional next question after delivering value", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Plan a Bali trip" },
    studioDomain: "travel",
    message: "What is the best area to stay in Bali?",
  });
  const decision = chooseNextConversationMove(snapshot);
  const cognition = assessPclCognition({ snapshot, decision });
  const lead = derivePclConversationLead({
    snapshot,
    decision,
    humanGate: cognition.humanGate,
    alignment: cognition.outcomeAlignment,
  });

  assert.equal(cognition.humanGate, "none");
  assert.equal(cognition.responsePolicy.questionBudget, 1);
  assert.equal(lead.conversationLead, "answer_and_advance");
  assert.equal(lead.leadingQuestionMode, "optional");
});

test("medium-impact reversible work proceeds under supervision rather than blocking", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Update the project plan" },
    message: "Update the project plan now.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const cognition = assessPclCognition({
    snapshot,
    decision,
    action: { risk: "medium", reversibility: "partial" },
  });

  assert.equal(cognition.humanGate, "inform");
  assert.equal(cognition.autonomy, "supervised");
  assert.equal(cognition.responsePolicy.requireApprovalBeforeAction, false);
});

test("high-risk or hard-to-reverse work requires explicit human approval", () => {
  const snapshot = buildConversationSnapshot({
    outcomeRecord: {
      sessionId: "session-risk",
      version: 3,
      state: {
        goal: { statement: "Clean up the production account", status: "confirmed" },
        definitionOfDone: [], constraints: [], assumptions: [], openQuestions: [], decisions: [], artifacts: [],
        nextActions: [{ action: "Delete the production account", risk: "high" }],
        memory: { scope: "project", consented: true }, safety: { unresolvedFlags: [] },
      },
    },
    message: "Go ahead and do it.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const cognition = assessPclCognition({ snapshot, decision });
  const lead = derivePclConversationLead({ snapshot, decision, humanGate: cognition.humanGate, alignment: cognition.outcomeAlignment });

  assert.equal(cognition.humanGate, "approve");
  assert.equal(cognition.autonomy, "gated");
  assert.equal(cognition.responsePolicy.questionBudget, 1);
  assert.equal(lead.leadingQuestionMode, "required");
  assert.equal(lead.conversationLead, "seek_approval");
  assert.equal(cognition.responsePolicy.requireApprovalBeforeAction, true);
});

test("one material ambiguity creates one human choice, not an intake questionnaire", () => {
  const snapshot = buildConversationSnapshot({
    outcomeRecord: {
      sessionId: "session-clarify",
      version: 1,
      state: {
        goal: { statement: "Prepare the regulatory plan", status: "confirmed" },
        definitionOfDone: [], constraints: [], assumptions: [],
        openQuestions: [{ question: "Which regulatory market applies?", material: true }],
        decisions: [], artifacts: [], nextActions: [],
        memory: { scope: "project", consented: true }, safety: { unresolvedFlags: [] },
      },
    },
    message: "Help me prepare the regulatory plan.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const cognition = assessPclCognition({ snapshot, decision });
  const lead = derivePclConversationLead({ snapshot, decision, humanGate: cognition.humanGate, alignment: cognition.outcomeAlignment });

  assert.equal(decision.move, "clarify");
  assert.equal(cognition.humanGate, "choose");
  assert.deepEqual(cognition.missingCritical, ["Which regulatory market applies?"]);
  assert.equal(cognition.responsePolicy.questionBudget, 1);
  assert.equal(lead.leadingQuestionMode, "required");
  assert.equal(lead.conversationLead, "resolve_blocker");
});

test("explicit context conflict keeps the human as governor", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Prepare the launch plan" },
    message: "Continue with the launch plan.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const cognition = assessPclCognition({
    snapshot,
    decision,
    conflicts: ["Current request conflicts with the confirmed decision to keep the launch Singapore-only."],
  });

  assert.equal(cognition.outcomeAlignment, "conflicted");
  assert.equal(cognition.humanGate, "choose");
  assert.equal(cognition.responsePolicy.surfaceConflict, true);
});

test("verified artifacts contribute evidence and an achieved goal stops new work", () => {
  const snapshot = buildConversationSnapshot({
    outcomeRecord: {
      sessionId: "session-done",
      version: 5,
      state: {
        goal: { statement: "Deliver the verified board deck", status: "achieved" },
        definitionOfDone: [{ criterion: "Board deck verified", confirmed: true }],
        constraints: [], assumptions: [], openQuestions: [], decisions: [],
        artifacts: [{ type: "powerpoint", ref: "artifact://deck-v3", verifiedAt: "2026-08-19T00:00:00Z" }],
        nextActions: [], memory: { scope: "project", consented: true }, safety: { unresolvedFlags: [] },
      },
    },
    message: "Thanks, that's done.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const cognition = assessPclCognition({ snapshot, decision });
  const lead = derivePclConversationLead({ snapshot, decision, humanGate: cognition.humanGate, alignment: cognition.outcomeAlignment });

  assert.equal(decision.move, "close");
  assert.equal(cognition.outcomeAlignment, "complete");
  assert.equal(cognition.autonomy, "complete");
  assert.equal(cognition.completion, 1);
  assert.equal(cognition.evidenceCoverage, 1);
  assert.equal(cognition.responsePolicy.stopWhenOutcomeAchieved, true);
  assert.equal(cognition.responsePolicy.questionBudget, 0);
  assert.equal(lead.conversationLead, "close");
});

test("study turns get an optional leading question like Travel, not a questionnaire", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Understand projectile motion" },
    studioDomain: "education",
    message: "Explain projectile motion.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const cognition = assessPclCognition({ snapshot, decision });
  const lead = derivePclConversationLead({ snapshot, decision, humanGate: cognition.humanGate, alignment: cognition.outcomeAlignment });
  assert.equal(lead.leadingQuestionMode, "optional");
  assert.equal(lead.questionBudget, 1);
  assert.ok(cognition.reasons.includes("study_conversation_lead"));
});

test("cognitive contract is provider-neutral and encodes human conversation leadership", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Plan a Bali trip" },
    studioDomain: "travel",
    message: "Recommend where I should stay.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const contract = formatPclCognitiveContract(assessPclCognition({ snapshot, decision }));

  assert.match(contract, /PCL COGNITIVE GOVERNANCE/);
  assert.match(contract, /Safe, reversible work: keep moving/);
  assert.match(contract, /OPTIONAL leading question/);
  assert.match(contract, /Never re-ask a fact already present/);
  assert.match(contract, /no intake questionnaire/i);
  assert.match(contract, /Never claim completion without available evidence/);
  assert.doesNotMatch(contract, /Gemini|Claude|OpenAI|Ollama|Cursor/i);
});
