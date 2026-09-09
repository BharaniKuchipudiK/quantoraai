import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConversationSnapshot,
  chooseNextConversationMove,
  formatConversationDecisionForPrompt,
  publicConversationMetadata,
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

test("[was-red] conversation metadata preserves routed domain contracts", () => {
  const snapshot = buildConversationSnapshot({ message: "Show it with an animation.", studioDomain: "education" });
  const decision = chooseNextConversationMove(snapshot);
  const verification = verifyConversationResponse({ snapshot, decision, response: "Here is the animation." });
  const metadata = publicConversationMetadata(snapshot, decision, verification, {
    studyCognitiveRouting: {
      representation: {
        primaryRepresentation: "simulation_or_lab",
        rendererRequired: true,
        rendererKind: "newton-lab",
        fallback: "none",
      },
    },
    financeRouting: { responseMode: "direct" },
  }) as any;

  assert.equal(metadata.studyCognitiveRouting.representation.rendererKind, "newton-lab");
  assert.equal(metadata.financeRouting.responseMode, "direct");
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

test("a specified tool is not trapped in guided intake even if the client flags it", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Build a calculator" },
    message: "Make me a simple calculator app",
    studioMode: "ask",
    guidedBuild: true,
  });
  assert.equal(chooseNextConversationMove(snapshot).move, "act");
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

test("verifier flags a Done claim when Proof of Done is not verified", () => {
  const snapshot = buildConversationSnapshot({
    outcomeRecord: {
      sessionId: "session-done-1",
      version: 1,
      state: {
        goal: { statement: "Create the executive deck", status: "confirmed" },
        definitionOfDone: [{ criterion: "Deck is verified", confirmed: false }],
        constraints: [], assumptions: [], openQuestions: [], decisions: [], artifacts: [], nextActions: [],
        memory: { scope: "session", consented: true }, safety: { unresolvedFlags: [] },
      },
    },
    message: "Continue.",
  });
  const decision = { ...chooseNextConversationMove(snapshot), move: "answer" as const };
  const verification = verifyConversationResponse({
    snapshot,
    decision,
    response: "The presentation is complete and ready for you to use.",
  });

  assert.equal(verification.status, "fail");
  assert.ok(verification.issues.some((item) => item.code === "outcome_done_without_proof"));
});

test("verifier raises reply_truncated when the provider says the reply hit its output budget", () => {
  /*
   * 2026-09-05. Until this, the live turn never read finish_reason: a reply cut
   * off by the budget was accepted and recorded as a success. In JSON it broke
   * loudly (the intake modal); in prose it was silent. The verifier is where a
   * cut becomes a NAMED outcome the desk shows.
   */
  const snapshot = buildConversationSnapshot({ message: "Explain the pipeline." });
  const decision = { ...chooseNextConversationMove(snapshot), move: "answer" as const };
  const cut = verifyConversationResponse({
    snapshot,
    decision,
    response: "The weighted pipeline value feeds utilisation forecasts by taking each deal and",
    finish: { kind: "truncated", reason: "MAX_TOKENS" },
  });
  assert.equal(cut.status, "fail");
  assert.ok(cut.issues.some((item) => item.code === "reply_truncated" && item.severity === "failure"));

  // The same reply with a normal finish, and with none at all, raises nothing —
  // the paths that predate this input must keep behaving exactly as before.
  for (const finish of [{ kind: "complete" as const, reason: "STOP" }, null, undefined]) {
    const ok = verifyConversationResponse({ snapshot, decision, response: "The weighted pipeline value feeds utilisation forecasts.", finish });
    assert.ok(!ok.issues.some((item) => item.code === "reply_truncated"), `finish=${JSON.stringify(finish)} must not be read as a cut`);
  }

  // Blocked is deliberately NOT this verifier's — the safety path owns its copy.
  const blocked = verifyConversationResponse({ snapshot, decision, response: "Partial.", finish: { kind: "blocked", reason: "SAFETY" } });
  assert.ok(!blocked.issues.some((item) => item.code === "reply_truncated"));
});

test("verifier permits a Done claim when the Outcome Contract is fully verified", () => {
  const snapshot = buildConversationSnapshot({
    outcomeRecord: {
      sessionId: "session-done-2",
      version: 3,
      state: {
        goal: { statement: "Create the executive deck", status: "achieved" },
        definitionOfDone: [{ criterion: "Deck is verified", confirmed: true }],
        constraints: [], assumptions: [], openQuestions: [], decisions: [],
        artifacts: [{ type: "presentation", ref: "artifact:pptx:verified", verifiedAt: "2026-08-19T04:00:00.000Z" }],
        nextActions: [],
        cognitiveLedger: [{
          id: "done-evidence",
          type: "evidence",
          statement: "Presentation verification passed",
          actor: "tool",
          status: "active",
          ref: "artifact:pptx:verified",
        }],
        memory: { scope: "session", consented: true }, safety: { unresolvedFlags: [] },
      },
    },
    message: "Is it complete?",
  });
  const decision = { ...chooseNextConversationMove(snapshot), move: "answer" as const };
  const verification = verifyConversationResponse({
    snapshot,
    decision,
    response: "The presentation is complete and ready for you to use.",
  });

  assert.ok(!verification.issues.some((item) => item.code === "outcome_done_without_proof"));
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
