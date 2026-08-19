import assert from "node:assert/strict";
import test from "node:test";
import { buildConversationSnapshot, chooseNextConversationMove } from "./conversation-engine.js";
import { inferPclActionContext } from "./pcl-action-policy.js";
import { assessPclNavigatorTurn } from "./pcl-navigator-adapter.js";
import { authorizePclExecution, createPclActionRef } from "./pcl-execution-gate.js";

function assess(message: string) {
  const snapshot = buildConversationSnapshot({
    sessionContext: { goal: "Complete the requested action safely" },
    message,
  });
  const decision = chooseNextConversationMove(snapshot);
  const action = inferPclActionContext(snapshot, decision);
  const cognition = assessPclNavigatorTurn(snapshot, decision);
  return { snapshot, decision, action, cognition };
}

test("safe reversible work passes the execution boundary", () => {
  const { action, cognition } = assess("Draft the release note now.");
  const authorization = authorizePclExecution({ cognition, action });

  assert.equal(authorization.status, "allow");
  assert.equal(authorization.canExecute, true);
});

test("consequential action cannot execute from model intent alone", () => {
  const { action, cognition } = assess("Send the customer email now.");
  const actionRef = createPclActionRef({ action, tool: "send_email", args: { to: "customer@example.com" } });
  const authorization = authorizePclExecution({ cognition, action, actionRef, ledger: [] });

  assert.equal(cognition.humanGate, "approve");
  assert.equal(authorization.status, "require_approval");
  assert.equal(authorization.canExecute, false);
});

test("matching explicit human approval authorizes only the referenced action", () => {
  const { action, cognition } = assess("Send the customer email now.");
  const actionRef = createPclActionRef({ action, tool: "send_email", args: { to: "customer@example.com" } });
  const otherRef = createPclActionRef({ action, tool: "send_email", args: { to: "other@example.com" } });
  const ledger = [{
    id: "approval-1",
    type: "approval" as const,
    statement: "Approve sending the customer email",
    actor: "user" as const,
    status: "active" as const,
    ref: actionRef,
  }];

  assert.equal(authorizePclExecution({ cognition, action, actionRef, ledger }).canExecute, true);
  assert.equal(authorizePclExecution({ cognition, action, actionRef: otherRef, ledger }).canExecute, false);
});

test("execution evidence blocks accidental replay of the same side effect", () => {
  const { action, cognition } = assess("Send the customer email now.");
  const actionRef = createPclActionRef({ action, tool: "send_email", args: { to: "customer@example.com" } });
  const ledger = [
    { id: "approval-1", type: "approval" as const, statement: "Approved", actor: "user" as const, status: "active" as const, ref: actionRef },
    { id: "evidence-1", type: "evidence" as const, statement: "Provider confirmed send", actor: "tool" as const, status: "active" as const, ref: actionRef },
  ];
  const authorization = authorizePclExecution({ cognition, action, actionRef, ledger });

  assert.equal(authorization.status, "block");
  assert.equal(authorization.reasonCode, "action_already_evidenced");
  assert.equal(authorization.canExecute, false);
});

test("stable action refs change when consequential arguments change", () => {
  const { action } = assess("Send the customer email now.");
  const customer = createPclActionRef({ action, tool: "send_email", args: { to: "customer@example.com" }, scope: "project-1" });
  const other = createPclActionRef({ action, tool: "send_email", args: { to: "other@example.com" }, scope: "project-1" });

  assert.notEqual(customer, other);
});
