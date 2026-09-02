import test from "node:test";
import assert from "node:assert/strict";
import {
  QIR_CONTRACT_VERSION,
  type QirAgentRun,
  type QirObservation,
  type QirVerificationResult,
} from "./qir-contracts.js";
import {
  isValidQirRunSnapshot,
  reduceQirObservation,
} from "./qir-run-store.js";
import {
  beginQirCodingRecovery,
  promoteQirCodingCheckpoint,
  resumeQirCodingFromSnapshot,
} from "./qir-coding-runtime.js";

function brokenPreviewRun(): QirAgentRun {
  return {
    version: QIR_CONTRACT_VERSION,
    runId: "coding-proof-run-1",
    goal: { statement: "Build the boutique storefront and render working product imagery", status: "confirmed" },
    status: "EXECUTING",
    steps: [{
      stepId: "render-storefront",
      taskId: "coding.render",
      objective: "Render a storefront whose product cards have working images",
      dependsOn: [],
      status: "active",
      requiresVerification: true,
      actionId: "action-build-1",
    }],
    cursor: { stepId: "render-storefront", actionId: "action-build-1", attempt: 0 },
    artifacts: [{
      artifactId: "storefront-vfs",
      generation: 1,
      ref: "vfs://candidate/storefront/1",
      state: "candidate",
      createdByActionId: "action-build-1",
      verifiedByActionId: null,
    }],
    observations: [],
    verifications: [],
    checkpoints: [{
      checkpointId: "checkpoint-pre-storefront",
      runId: "coding-proof-run-1",
      stepId: null,
      actionId: null,
      artifactGenerations: {},
      createdAt: "2026-09-02T02:00:00.000Z",
    }],
    budget: {
      runUnitsRemaining: 100,
      stepUnitsRemaining: 40,
      recoveryReserveRemaining: 20,
      premiumEscalationRemaining: 5,
    },
    createdAt: "2026-09-02T02:00:00.000Z",
    updatedAt: "2026-09-02T02:00:05.000Z",
  };
}

test("was-red Coding proof: broken Preview survives interruption, rejects stale callbacks, recovers and completes only after verification", () => {
  const initial = brokenPreviewRun();

  const previewFailure: QirObservation = {
    observationId: "obs-preview-broken-1",
    runId: initial.runId,
    actionId: "action-build-1",
    artifactId: "storefront-vfs",
    artifactGeneration: 1,
    kind: "runtime",
    status: "failure",
    evidence: [{
      evidenceId: "evidence-broken-images",
      source: "runtime",
      kind: "preview.image_load_failure",
      actionId: "action-build-1",
      ref: "preview://storefront/product-card-images",
      observedAt: "2026-09-02T02:00:10.000Z",
    }],
    error: {
      code: "RUNTIME_FAILURE",
      message: "Preview rendered product cards with broken image resources.",
      retryable: true,
      recoveryExhausted: false,
    },
    observedAt: "2026-09-02T02:00:10.000Z",
  };

  const failed = reduceQirObservation({
    run: initial,
    observation: previewFailure,
    proofOfDoneStatus: "unverified",
  });
  assert.equal(failed.accepted, true);
  assert.equal(failed.run.status, "REPAIRING");
  assert.equal(failed.run.cursor.attempt, 1);
  assert.equal(failed.run.artifacts[0]?.state, "candidate");
  assert.equal(failed.run.checkpoints.at(-1)?.checkpointId, "checkpoint-pre-storefront");

  // Simulate browser + worker loss. The only thing the replacement worker gets
  // is the serialized durable Run snapshot.
  const serialized = JSON.stringify(failed.run);
  const afterRestart = JSON.parse(serialized) as unknown;
  assert.equal(isValidQirRunSnapshot(afterRestart), true);
  const resumed = afterRestart as QirAgentRun;
  const continuation = resumeQirCodingFromSnapshot(resumed);
  assert.deepEqual(continuation, {
    stepId: "render-storefront",
    taskId: "coding.render",
    actionId: "action-build-1",
  });

  const recovering = beginQirCodingRecovery({
    run: resumed,
    actionId: "action-repair-image-pipeline-2",
    artifactId: "storefront-vfs",
    artifactGeneration: 2,
    artifactRef: "vfs://candidate/storefront/2",
    now: "2026-09-02T02:01:00.000Z",
  });
  assert.equal(recovering.status, "EXECUTING");
  assert.equal(recovering.cursor.attempt, 1, "worker restart must not reset retry budget");
  assert.equal(recovering.cursor.actionId, "action-repair-image-pipeline-2");
  assert.equal(recovering.artifacts[0]?.generation, 2);
  assert.equal(recovering.artifacts[0]?.state, "candidate");

  const lateOldSuccess: QirObservation = {
    observationId: "obs-late-action-1",
    runId: recovering.runId,
    actionId: "action-build-1",
    artifactId: "storefront-vfs",
    artifactGeneration: 1,
    kind: "runtime",
    status: "success",
    evidence: [],
    observedAt: "2026-09-02T02:01:05.000Z",
  };
  const stale = reduceQirObservation({
    run: recovering,
    observation: lateOldSuccess,
    proofOfDoneStatus: "unverified",
  });
  assert.equal(stale.accepted, false);
  assert.equal(stale.stale, true);
  assert.equal(stale.run.artifacts[0]?.generation, 2);

  const repairedPreview: QirObservation = {
    observationId: "obs-preview-working-2",
    runId: recovering.runId,
    actionId: "action-repair-image-pipeline-2",
    artifactId: "storefront-vfs",
    artifactGeneration: 2,
    kind: "runtime",
    status: "success",
    evidence: [{
      evidenceId: "evidence-images-loaded-2",
      source: "runtime",
      kind: "preview.image_load_success",
      actionId: "action-repair-image-pipeline-2",
      ref: "preview://storefront/product-card-images",
      observedAt: "2026-09-02T02:01:10.000Z",
    }],
    observedAt: "2026-09-02T02:01:10.000Z",
  };
  const observed = reduceQirObservation({
    run: recovering,
    observation: repairedPreview,
    proofOfDoneStatus: "unverified",
  });
  assert.equal(observed.run.status, "VERIFYING");
  assert.notEqual(observed.run.status, "COMPLETE", "tool/runtime success is not mission completion");
  assert.equal(observed.run.artifacts[0]?.state, "candidate", "candidate must not replace verified checkpoint before verifier passes");

  const verification: QirVerificationResult = {
    verificationId: "verify-storefront-2",
    runId: observed.run.runId,
    actionId: "independent-verifier-1",
    passed: true,
    proofOfDoneStatus: "verified",
    evidenceRefs: ["evidence-images-loaded-2"],
    verifiedAt: "2026-09-02T02:01:20.000Z",
  };

  const complete = promoteQirCodingCheckpoint({
    run: observed.run,
    verification,
    proofOfDoneStatus: "verified",
    artifactId: "storefront-vfs",
    artifactGeneration: 2,
    checkpointId: "checkpoint-storefront-verified-2",
    now: "2026-09-02T02:01:20.000Z",
  });

  assert.equal(complete.status, "COMPLETE");
  assert.equal(complete.goal.status, "achieved");
  assert.equal(complete.artifacts[0]?.state, "verified");
  assert.equal(complete.artifacts[0]?.verifiedByActionId, "independent-verifier-1");
  assert.equal(complete.checkpoints.at(-1)?.artifactGenerations["storefront-vfs"], 2);
  assert.equal(complete.steps[0]?.status, "verified");
});
