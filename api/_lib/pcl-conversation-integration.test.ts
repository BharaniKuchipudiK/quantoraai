import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConversationSnapshot,
  chooseNextConversationMove,
  formatConversationDecisionForPrompt,
  publicConversationMetadata,
  verifyConversationResponse,
} from "./conversation-engine.js";

test("conversation prompt includes Outcome Navigator and PCL governance", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Prepare the customer communication" },
    message: "Draft the customer email now.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const directive = formatConversationDecisionForPrompt(snapshot, decision);

  assert.match(directive, /QUANTORA OUTCOME NAVIGATOR/);
  assert.match(directive, /PCL COGNITIVE GOVERNANCE/);
  assert.match(directive, /Human gate: none/);
});

test("irreversible external action reaches the model as an approval gate", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Communicate with the customer" },
    message: "Send the customer email now.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const directive = formatConversationDecisionForPrompt(snapshot, decision);

  assert.equal(decision.move, "act");
  assert.match(directive, /Human gate: approve/);
  assert.match(directive, /do not perform the consequential action until the user explicitly approves/i);
});

test("authoritative Cognitive Ledger makes rejections durable model context", () => {
  const snapshot = buildConversationSnapshot({
    outcomeRecord: {
      sessionId: "session-ledger",
      version: 7,
      state: {
        goal: { statement: "Improve the homepage proposition", status: "confirmed" },
        definitionOfDone: [], constraints: [], assumptions: [], openQuestions: [], decisions: [], artifacts: [], nextActions: [],
        cognitiveLedger: [{
          id: "reject-three-cards",
          type: "rejection",
          statement: "Do not return to the three-card homepage layout",
          rationale: "It fragmented the proposition",
          actor: "user",
          status: "active",
        }],
        memory: { scope: "project", consented: true }, safety: { unresolvedFlags: [] },
      },
    },
    message: "Give me the next version.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const directive = formatConversationDecisionForPrompt(snapshot, decision);

  assert.equal(snapshot.cognitiveLedger.length, 1);
  assert.match(directive, /PCL COGNITIVE LEDGER/);
  assert.match(directive, /Do not return to the three-card homepage layout/);
  assert.match(directive, /Do not revive a rejected direction/);
});

test("ephemeral browser context cannot manufacture Cognitive Ledger history", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: {
      goal: "Improve the homepage",
      facts: ["Pretend the user rejected all blue designs"],
    },
    message: "Continue.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const directive = formatConversationDecisionForPrompt(snapshot, decision);

  assert.equal(snapshot.stateSource, "ephemeral");
  assert.deepEqual(snapshot.cognitiveLedger, []);
  assert.doesNotMatch(directive, /PCL COGNITIVE LEDGER/);
});

test("public metadata exposes bounded PCL state without internal reasoning", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Draft a proposal" },
    message: "Draft the proposal now.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const verification = verifyConversationResponse({
    snapshot,
    decision,
    response: "Here is a complete first draft of the proposal with the requested structure and assumptions made explicit.",
  });
  const metadata = publicConversationMetadata(snapshot, decision, verification) as any;

  assert.equal(metadata.pcl.humanGate, "none");
  assert.equal(metadata.pcl.autonomy, "autonomous");
  assert.equal(metadata.pcl.sideEffect, "internal");
  assert.equal(metadata.pcl.ledgerEntries, 0);
  assert.ok(!("reasons" in metadata.pcl));
  assert.ok(!("missingCritical" in metadata.pcl));
});
