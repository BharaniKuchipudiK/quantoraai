import assert from "node:assert/strict";
import test from "node:test";
import {
  QIR_CONTRACT_VERSION,
  type QirAgentRun,
  type QirObservation,
  type QirVerificationResult,
} from "./qir-contracts.js";
import { isValidQirRunSnapshot, reduceQirObservation } from "./qir-run-store.js";

function run(overrides: Partial<QirAgentRun> = {}): QirAgentRun {
  return {
    version: QIR_CONTRACT_VERSION,
    runId: "run-phase2-1",
    goal: { statement: "Fix and verify the Coding artifact", status: "confirmed" },
    status: "EXECUTING",
    steps: [{
      stepId: "build",
      taskId: "build",
      objective: "Build candidate",
      dependsOn: [],
      status: "active",
      requiresVerification: true,
      actionId: "action-2",
    }],
    cursor: { stepId: "build", actionId: "action-2", attempt: 0 },
    artifacts: [{
      artifactId: "site",
      generation: 2,
      ref: "vfs://site/g2",
      state: "candidate",
      createdByActionId: "action-2",
    }],
    observations: [],
    verifications: [],
    checkpoints: [{
      checkpointId: "checkpoint-1",
      runId: "run-phase2-1",
      stepId: "build",
      actionId: "action-1",
      artifactGenerations: { site: 1 },
      createdAt: "2026-09-02T00:00:00.000Z",
    }],
    budget: {
      runUnitsRemaining: 80,
      stepUnitsRemaining: 20,
      recoveryReserveRemaining: 2,
      premiumEscalationRemaining: 1,
    },
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:01:00.000Z",
    ...overrides,
  };
}

function observation(overrides: Partial<QirObservation> = {}): QirObservation {
  return {
    observationId: "obs-2",
    runId: "run-phase2-1",
    actionId: "action-2",
    artifactId: "site",
    artifactGeneration: 2,
    kind: "compiler",
    status: "success",
    evidence: [{
      evidenceId: "evidence-2",
      source: "compiler",
      kind: "compile_result",
      actionId: "action-2",
      ref: "compile://2",
      observedAt: "2026-09-02T00:02:00.000Z",
    }],
    observedAt: "2026-09-02T00:02:00.000Z",
    ...overrides,
  };
}

test("validates durable snapshots before storage", () => {
  assert.equal(isValidQirRunSnapshot(run()), true);
  assert.equal(isValidQirRunSnapshot({ ...run(), runId: "bad run id" }), false);
  assert.equal(isValidQirRunSnapshot({ ...run(), status: "DONE" }), false);
  assert.equal(isValidQirRunSnapshot({ ...run(), budget: { ...run().budget, recoveryReserveRemaining: -1 } }), false);
});

test("late stale artifact generations are durable no-ops", () => {
  const current = run();
  const stale = observation({
    observationId: "obs-stale",
    actionId: "action-1",
    artifactGeneration: 1,
  });
  const reduced = reduceQirObservation({
    run: current,
    observation: stale,
    proofOfDoneStatus: "not_ready",
  });

  assert.equal(reduced.accepted, false);
  assert.equal(reduced.stale, true);
  assert.strictEqual(reduced.run, current);
  assert.equal(reduced.run.observations.length, 0);
});

test("compile failure remains in the Run and consumes an attempt", () => {
  const failed = observation({
    observationId: "obs-fail",
    status: "failure",
    error: {
      code: "COMPILE_FAILURE",
      message: "Candidate failed compilation",
      retryable: true,
    },
  });
  const reduced = reduceQirObservation({
    run: run(),
    observation: failed,
    proofOfDoneStatus: "not_ready",
  });

  assert.equal(reduced.accepted, true);
  assert.equal(reduced.run.status, "REPAIRING");
  assert.equal(reduced.run.cursor.attempt, 1);
  assert.equal(reduced.run.steps[0]?.status, "failed_recoverable");
  assert.equal(reduced.run.checkpoints[0]?.artifactGenerations.site, 1);
  assert.equal(reduced.run.artifacts[0]?.generation, 2);
});

test("tool success cannot complete a Run without independent verification", () => {
  const reduced = reduceQirObservation({
    run: run(),
    observation: observation(),
    proofOfDoneStatus: "verified",
    latestVerification: null,
  });

  assert.equal(reduced.accepted, true);
  assert.equal(reduced.run.status, "VERIFYING");
  assert.notEqual(reduced.run.status, "COMPLETE");
});

test("verified Proof of Done plus same-run independent verification may complete", () => {
  const verification: QirVerificationResult = {
    verificationId: "verify-2",
    runId: "run-phase2-1",
    actionId: "verify-action-2",
    passed: true,
    proofOfDoneStatus: "verified",
    evidenceRefs: ["compile://2", "preview://2"],
    verifiedAt: "2026-09-02T00:03:00.000Z",
  };
  const reduced = reduceQirObservation({
    run: run({ verifications: [verification], status: "VERIFYING" }),
    observation: observation({ kind: "verification", actionId: "action-2", artifactId: null, artifactGeneration: null }),
    proofOfDoneStatus: "verified",
    latestVerification: verification,
  });

  assert.equal(reduced.accepted, true);
  assert.equal(reduced.run.status, "COMPLETE");
});

test("serialized state keeps the last verified checkpoint while candidate generation changes", () => {
  const current = run();
  const json = JSON.stringify(current);
  const restored = JSON.parse(json) as QirAgentRun;
  assert.equal(isValidQirRunSnapshot(restored), true);
  assert.equal(restored.artifacts[0]?.generation, 2);
  assert.equal(restored.artifacts[0]?.state, "candidate");
  assert.equal(restored.checkpoints[0]?.artifactGenerations.site, 1);
  assert.equal(restored.cursor.actionId, "action-2");
});
