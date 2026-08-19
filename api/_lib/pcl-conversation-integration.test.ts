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
  assert.ok(!("reasons" in metadata.pcl));
  assert.ok(!("missingCritical" in metadata.pcl));
});
