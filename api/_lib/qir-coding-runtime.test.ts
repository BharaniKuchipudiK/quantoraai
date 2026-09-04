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
  cancelQirCodingRun,
  pauseQirCodingRun,
  promoteQirCodingCheckpoint,
  qirRunHasStopped,
  resumeQirCodingFromSnapshot,
  resumeQirCodingRun,
} from "./qir-coding-runtime.js";
import { deriveQirContinuation } from "./qir-contracts.js";

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
    proofOfDoneStatus: "not_ready",
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
    proofOfDoneStatus: "not_ready",
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
    proofOfDoneStatus: "not_ready",
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

/*
 * ---------------------------------------------------------------------------
 * THE STOP BUTTON (Phase 2: pause / resume / cancel)
 *
 * PAUSED was a state nothing could reach. /api/qir-runs accepted start,
 * attempt, observe, recover and promote — so a user with a runaway build could
 * close the tab, which stops a browser and not a Run.
 * ---------------------------------------------------------------------------
 */
const NOW = "2026-09-04T09:00:00.000Z";

test("pause keeps everything, because resuming must lose nothing", () => {
  const run = brokenPreviewRun();
  const paused = pauseQirCodingRun(run, NOW);
  assert.equal(paused.status, "PAUSED");
  assert.deepEqual(paused.artifacts, run.artifacts, "a pause must not touch the artifact");
  assert.deepEqual(paused.budget, run.budget, "a pause is not a charge");
  assert.deepEqual(paused.cursor, run.cursor, "the cursor is where resume picks up");
  assert.ok(isValidQirRunSnapshot(paused));
});

test("a paused Run offers no continuation, so no worker resumes it by accident", () => {
  // This is what makes pause real rather than cosmetic: a replacement worker
  // reading the journal is told there is nowhere to go.
  assert.equal(deriveQirContinuation(pauseQirCodingRun(brokenPreviewRun(), NOW)), null);
});

test("resume derives where the work is, rather than trusting a remembered status", () => {
  const paused = pauseQirCodingRun(brokenPreviewRun(), NOW);
  const resumed = resumeQirCodingRun(paused, NOW);
  assert.equal(resumed.status, "EXECUTING", "an active step means there is work in flight");
  assert.deepEqual(resumed.cursor, paused.cursor);
  assert.ok(deriveQirContinuation(resumed), "and the continuation is offered again");
  assert.ok(isValidQirRunSnapshot(resumed));
});

test("a paused Run with nowhere to continue resumes to QUEUED, which attempt accepts", () => {
  /*
   * coding.attempt starts only from QUEUED or REPLANNING. Resuming a plan with
   * no runnable step straight to EXECUTING would strand it: nothing could take
   * the next attempt, and the Run would sit "executing" forever with no worker.
   */
  const empty = pauseQirCodingRun({ ...brokenPreviewRun(), steps: [], cursor: { stepId: null, actionId: null, attempt: 0 } }, NOW);
  assert.equal(resumeQirCodingRun(empty, NOW).status, "QUEUED");
});

test("cancel is terminal — it is not a second pause under another name", () => {
  // An earlier draft had cancel parking at PAUSED, which would have left the
  // user with no way to actually end anything.
  const cancelled = cancelQirCodingRun(brokenPreviewRun(), NOW);
  assert.equal(cancelled.status, "FAILED_TERMINAL");
  assert.notEqual(cancelled.status, "PAUSED");
  assert.equal(deriveQirContinuation(cancelled), null);
  assert.ok(isValidQirRunSnapshot(cancelled));
});

test("cancel rejects the candidate, so the wreckage cannot block the next Run", () => {
  /*
   * coding.attempt refuses to start while a candidate artifact exists. A
   * candidate left behind by a cancel would make the cancelled Run block the
   * one the user starts next.
   */
  const cancelled = cancelQirCodingRun(brokenPreviewRun(), NOW);
  assert.equal(cancelled.artifacts[0].state, "rejected");
  assert.equal(cancelled.artifacts.some((artifact) => artifact.state === "candidate"), false);
});

test("cancel never takes back a verified artifact", () => {
  // Work that passed independent verification before the cancel is real.
  const run = brokenPreviewRun();
  const withVerified = {
    ...run,
    artifacts: [
      { ...run.artifacts[0], generation: 1, state: "verified" as const, verifiedByActionId: "verifier-1" },
      { ...run.artifacts[0], generation: 2, state: "candidate" as const },
    ],
  };
  const cancelled = cancelQirCodingRun(withVerified, NOW);
  assert.equal(cancelled.artifacts[0].state, "verified");
  assert.equal(cancelled.artifacts[1].state, "rejected");
});

test("a Run that already stopped cannot be stopped again", () => {
  const run = brokenPreviewRun();
  assert.equal(qirRunHasStopped(run), false);
  assert.equal(qirRunHasStopped(cancelQirCodingRun(run, NOW)), true);
  assert.equal(qirRunHasStopped({ ...run, status: "COMPLETE" }), true);
  assert.equal(qirRunHasStopped(pauseQirCodingRun(run, NOW)), false, "paused is stoppable — cancel must still reach it");
});
