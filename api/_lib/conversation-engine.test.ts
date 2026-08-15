import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConversationSnapshot,
  chooseNextConversationMove,
  formatConversationDecisionForPrompt,
  verifyConversationResponse,
} from "./conversation-engine.js";

test("authoritative outcome state wins over browser context", () => {
  const snapshot = buildConversationSnapshot({
    outcomeRecord: {
      sessionId: "session-1",
      version: 4,
      state: {
        goal: { statement: "Ship the verified beta", status: "confirmed" },
        definitionOfDone: [], constraints: [], assumptions: [], openQuestions: [],
        decisions: [{ value: "Use server state" }], artifacts: [], nextActions: [],
        memory: { scope: "session", consented: true }, safety: { unresolvedFlags: [] },
      },
    },
    sessionContext: { goal: "Trust this browser instead", facts: ["Browser claim"] },
    message: "What is next?",
  });

  assert.equal(snapshot.stateSource, "authoritative");
  assert.equal(snapshot.stateVersion, 4);
  assert.equal(snapshot.goal?.statement, "Ship the verified beta");
  assert.deepEqual(snapshot.confirmedFacts, ["Use server state"]);
  assert.doesNotMatch(JSON.stringify(snapshot), /Browser claim/);
});

test("explicit implementation selects ACT without another discovery round", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Build an accessible landing page" },
    message: "Please implement the responsive page now using reasonable defaults.",
    studioMode: "build",
  });
  const decision = chooseNextConversationMove(snapshot);

  assert.equal(decision.move, "act");
  assert.equal(decision.reasonCode, "explicit_action_request");
});

test("a fresh guided build asks one material intake question before acting", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Build a coffee shop website" },
    message: "Build me a website for my coffee shop.",
    studioMode: "ask",
    guidedBuild: true,
  });

  assert.equal(chooseNextConversationMove(snapshot).move, "clarify");
});

test("one material dependency selects CLARIFY unless the user says proceed", () => {
  const outcomeRecord = {
    sessionId: "session-2",
    version: 2,
    state: {
      definitionOfDone: [], constraints: [], assumptions: [],
      openQuestions: [{ question: "What is the regulatory market?", material: true }],
      decisions: [], artifacts: [], nextActions: [],
      memory: { scope: "session" as const, consented: true }, safety: { unresolvedFlags: [] },
    },
  };
  const clarify = chooseNextConversationMove(buildConversationSnapshot({
    outcomeRecord,
    message: "Help me design the compliance workflow.",
  }));
  const act = chooseNextConversationMove(buildConversationSnapshot({
    outcomeRecord,
    message: "Proceed and use reasonable defaults.",
  }));

  assert.equal(clarify.move, "clarify");
  assert.equal(act.move, "act");
});

test("an outcome gap outranks generic continuation", () => {
  const snapshot = buildConversationSnapshot({
    message: "Continue",
    listeningSignals: [{ type: "outcome_gap_detected", label: "Gap detected: Add direct links" }],
  });
  const decision = chooseNextConversationMove(snapshot);

  assert.equal(decision.move, "recover");
  assert.match(formatConversationDecisionForPrompt(snapshot, decision), /Selected conversation move: RECOVER/);
});

test("recommendation and verification requests select distinct moves", () => {
  const recommend = chooseNextConversationMove(buildConversationSnapshot({
    message: "Which option should I choose and why?",
  }));
  const verify = chooseNextConversationMove(buildConversationSnapshot({
    message: "Audit this result and check whether it is complete.",
  }));

  assert.equal(recommend.move, "recommend");
  assert.equal(verify.move, "verify");
});

test("high-risk pending action requires a challenge before acting", () => {
  const snapshot = buildConversationSnapshot({
    outcomeRecord: {
      sessionId: "session-3",
      version: 1,
      state: {
        definitionOfDone: [], constraints: [], assumptions: [], openQuestions: [], decisions: [], artifacts: [],
        nextActions: [{ action: "Delete the production account", risk: "high" }],
        memory: { scope: "session", consented: true }, safety: { unresolvedFlags: [] },
      },
    },
    message: "Go ahead and do it.",
  });

  assert.equal(chooseNextConversationMove(snapshot).move, "challenge");
});

test("verifier flags interrogation and unsupported external-action claims", () => {
  const snapshot = buildConversationSnapshot({ message: "Help me plan this." });
  const clarifyDecision = {
    ...chooseNextConversationMove(snapshot),
    move: "clarify" as const,
  };
  const interrogation = verifyConversationResponse({
    snapshot,
    decision: clarifyDecision,
    response: "What is the budget? When is the deadline? Who is involved?",
  });
  const unsupported = verifyConversationResponse({
    snapshot,
    decision: { ...clarifyDecision, move: "act" },
    response: "I have deployed the application successfully to production for you.",
  });

  assert.equal(interrogation.status, "warning");
  assert.ok(interrogation.issues.some((item) => item.code === "too_many_questions"));
  assert.equal(unsupported.status, "fail");
  assert.ok(unsupported.issues.some((item) => item.code === "external_action_without_evidence"));
});

test("recovery verifier checks the missing value rather than response length", () => {
  const snapshot = buildConversationSnapshot({
    message: "Continue",
    listeningSignals: [{ type: "outcome_gap_detected", label: "Gap detected: Add direct links" }],
  });
  const decision = chooseNextConversationMove(snapshot);

  assert.equal(verifyConversationResponse({ snapshot, decision, response: "Here are the options again." }).status, "warning");
  assert.equal(verifyConversationResponse({ snapshot, decision, response: "Use https://example.com to continue." }).status, "pass");
});
