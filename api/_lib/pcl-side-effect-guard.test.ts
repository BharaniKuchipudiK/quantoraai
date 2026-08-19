import test from "node:test";
import assert from "node:assert/strict";
import { guardPclSideEffect, pclHumanConfirmation } from "./pcl-side-effect-guard.js";

const publish = {
  userSub: "user-1",
  description: "Publish quantora-demo to Vercel production",
  tool: "vercel.deploy",
  args: { projectName: "quantora-demo", contentHash: "abc123" },
  scope: "publish:quantora-demo",
  risk: "high" as const,
  reversibility: "hard" as const,
  sideEffect: "external" as const,
  requiresApproval: true,
};

test("consequential adapter cannot execute without explicit human confirmation", async () => {
  const result = await guardPclSideEffect(publish);
  assert.equal(result.canExecute, false);
  assert.equal(result.status, "require_approval");
  assert.equal(result.reasonCode, "explicit_human_approval_required");
});

test("first-party confirmation authorizes one non-durable request without inventing durable memory", async () => {
  const result = await guardPclSideEffect({
    ...publish,
    humanConfirmed: true,
    confirmationSource: "publish-dialog",
  });
  assert.equal(result.canExecute, true);
  assert.equal(result.status, "allow");
  assert.equal(result.durable, false);
  assert.equal(result.confirmationSource, "publish-dialog");
});

test("reversible preview deployment stays supervised rather than approval-gated", async () => {
  const result = await guardPclSideEffect({
    ...publish,
    description: "Create shareable preview deployment",
    tool: "vercel.preview",
    args: { projectName: "preview-123" },
    risk: "medium",
    reversibility: "partial",
    requiresApproval: false,
  });
  assert.equal(result.canExecute, true);
  assert.equal(result.status, "allow_inform");
});

test("human confirmation header accepts only the endpoint's known UI surfaces", () => {
  assert.deepEqual(
    pclHumanConfirmation({ headers: { "x-quantora-human-confirmed": "publish-dialog" } }, ["publish-dialog"]),
    { confirmed: true, source: "publish-dialog" },
  );
  assert.deepEqual(
    pclHumanConfirmation({ headers: { "x-quantora-human-confirmed": "fabricated-client" } }, ["publish-dialog"]),
    { confirmed: false, source: "fabricated-client" },
  );
});
