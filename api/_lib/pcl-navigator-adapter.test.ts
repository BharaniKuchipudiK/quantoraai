import assert from "node:assert/strict";
import test from "node:test";
import { buildConversationSnapshot, chooseNextConversationMove } from "./conversation-engine.js";
import { inferPclActionContext } from "./pcl-action-policy.js";
import {
  assessPclNavigatorTurn,
  formatPclNavigatorDirective,
  publicPclNavigatorMetadata,
} from "./pcl-navigator-adapter.js";

function turn(message: string, studioMode = "ask") {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Complete the requested work safely" },
    message,
    studioMode,
  });
  const decision = chooseNextConversationMove(snapshot);
  return { snapshot, decision };
}

test("drafting stays autonomous and reversible", () => {
  const { snapshot, decision } = turn("Draft the customer email now.");
  const action = inferPclActionContext(snapshot, decision);
  const cognition = assessPclNavigatorTurn(snapshot, decision);

  assert.equal(decision.move, "act");
  assert.equal(action.sideEffect, "internal");
  assert.equal(action.reversibility, "easy");
  assert.equal(cognition.humanGate, "none");
  assert.equal(cognition.autonomy, "autonomous");
});

test("sending is materially different from drafting and requires approval", () => {
  const { snapshot, decision } = turn("Send the customer email now.");
  const action = inferPclActionContext(snapshot, decision);
  const cognition = assessPclNavigatorTurn(snapshot, decision);

  assert.equal(decision.move, "act");
  assert.equal(action.sideEffect, "external");
  assert.equal(action.reversibility, "hard");
  assert.equal(cognition.humanGate, "approve");
  assert.equal(cognition.responsePolicy.requireApprovalBeforeAction, true);
});

test("financial transactions are high risk and gated", () => {
  const { snapshot, decision } = turn("Pay the invoice now.");
  const action = inferPclActionContext(snapshot, decision);
  const cognition = assessPclNavigatorTurn(snapshot, decision);

  assert.equal(action.sideEffect, "transactional");
  assert.equal(action.risk, "high");
  assert.equal(cognition.humanGate, "approve");
});

test("destructive work is high risk even without a pre-existing next action", () => {
  const { snapshot, decision } = turn("Delete the production database now.");
  const action = inferPclActionContext(snapshot, decision);
  const cognition = assessPclNavigatorTurn(snapshot, decision);

  assert.equal(action.sideEffect, "destructive");
  assert.equal(action.risk, "high");
  assert.equal(cognition.humanGate, "approve");
});

test("preview deployment can proceed under supervision", () => {
  const { snapshot, decision } = turn("Deploy this to staging now.", "build");
  const action = inferPclActionContext(snapshot, decision);
  const cognition = assessPclNavigatorTurn(snapshot, decision);

  assert.equal(action.sideEffect, "internal");
  assert.equal(action.risk, "medium");
  assert.equal(action.reversibility, "partial");
  assert.equal(cognition.humanGate, "inform");
  assert.equal(cognition.autonomy, "supervised");
});

test("education turns attach the existing Study advisor contract instead of a new tutor stack", () => {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Get stronger at mechanics" },
    studioDomain: "education",
    message: "I keep missing projectile motion questions.",
  });
  const decision = chooseNextConversationMove(snapshot);
  const directive = formatPclNavigatorDirective(snapshot, decision);
  assert.match(directive, /PCL ADVISOR INTELLIGENCE/);
  assert.match(directive, /Never invent a gap, mastery level/i);
  assert.doesNotMatch(directive, /LangChain|Gemini|Claude/i);
});

test("PCL directive carries governance plus the living Outcome Contract", () => {
  const { snapshot, decision } = turn("Draft the analysis now.");
  const directive = formatPclNavigatorDirective(snapshot, decision);
  const metadata = publicPclNavigatorMetadata(snapshot, decision);

  assert.match(directive, /PCL COGNITIVE GOVERNANCE/);
  assert.match(directive, /PCL OUTCOME CONTRACT/);
  assert.match(directive, /Proof of Done:/);
  assert.doesNotMatch(directive, /Gemini|Claude|OpenAI|Ollama|Cursor/i);
  assert.equal(metadata.humanGate, "none");
  assert.equal(metadata.sideEffect, "internal");
  assert.equal(metadata.proofOfDoneStatus, "not_ready");
  assert.ok(typeof metadata.proofOfDoneScore === "number");
  assert.ok(Array.isArray(metadata.proofOfDoneBlockers));
  assert.equal(metadata.agentExecution.providerNeutral, true);
  assert.ok(metadata.agentExecution.taskCount >= 1);
  assert.ok(Array.isArray(metadata.agentExecution.requiredCapabilities));
  assert.ok(!("reasons" in metadata));
  assert.ok(!("conflicts" in metadata));
});
