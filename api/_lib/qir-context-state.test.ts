import assert from "node:assert/strict";
import test from "node:test";
import { deriveQirContinuation, QIR_CONTRACT_VERSION, type QirAgentRun } from "./qir-contracts.js";
import {
  attachQirWorkingContext,
  compactQirWorkingContext,
  deriveQirContinuationFromContext,
  isCompatibleQirContextState,
  readQirWorkingContext,
} from "./qir-context-state.js";

function run(): QirAgentRun {
  return {
    version: QIR_CONTRACT_VERSION,
    runId: "context-run-1",
    goal: { statement: "Repair and verify the storefront", status: "confirmed" },
    status: "REPAIRING",
    steps: [{
      stepId: "repair",
      taskId: "coding.repair",
      objective: "Repair missing imagery",
      dependsOn: [],
      status: "failed_recoverable",
      requiresVerification: true,
      actionId: "action-2",
    }],
    cursor: { stepId: "repair", actionId: "action-2", attempt: 1 },
    artifacts: [{
      artifactId: "site",
      generation: 2,
      ref: "vfs://site/g2",
      state: "candidate",
      createdByActionId: "action-2",
    }, {
      artifactId: "baseline",
      generation: 1,
      ref: "vfs://site/g1",
      state: "verified",
      createdByActionId: "action-1",
      verifiedByActionId: "verify-1",
    }],
    observations: [{
      observationId: "obs-1",
      runId: "context-run-1",
      actionId: "action-2",
      artifactId: "site",
      artifactGeneration: 2,
      kind: "runtime",
      status: "failure",
      error: { code: "ARTIFACT_INVALID", message: "Product images are unresolved", retryable: true },
      evidence: [],
      observedAt: "2026-09-02T06:00:00.000Z",
    }],
    verifications: [{
      verificationId: "verify-1",
      runId: "context-run-1",
      actionId: "verify-action-1",
      passed: true,
      proofOfDoneStatus: "verified",
      evidenceRefs: ["build://g1"],
      verifiedAt: "2026-09-02T05:55:00.000Z",
    }],
    checkpoints: [{
      checkpointId: "checkpoint-1",
      runId: "context-run-1",
      stepId: "repair",
      actionId: "action-1",
      artifactGenerations: { baseline: 1 },
      createdAt: "2026-09-02T05:56:00.000Z",
    }],
    budget: {
      runUnitsRemaining: 50,
      stepUnitsRemaining: 5,
      recoveryReserveRemaining: 2,
      premiumEscalationRemaining: 1,
    },
    createdAt: "2026-09-02T05:00:00.000Z",
    updatedAt: "2026-09-02T06:01:00.000Z",
  };
}

test("compaction is deterministic for the same versioned inputs", () => {
  const input = {
    run: run(),
    projectState: { z: 1, a: { y: 2, x: 3 } },
    recentInteractions: Array.from({ length: 100 }, (_, index) => `turn-${index}`),
    compactedAt: "2026-09-02T06:02:00.000Z",
  };
  const first = compactQirWorkingContext(input);
  const second = compactQirWorkingContext(input);
  assert.deepEqual(first, second);
  assert.equal(first.recentInteractionResidue.length, 12);
  assert.equal(first.recentInteractionResidue[0], "turn-88");
});

test("compacted continuation matches full durable Run reconstruction", () => {
  const current = run();
  const context = compactQirWorkingContext({ run: current, compactedAt: "2026-09-02T06:02:00.000Z" });
  assert.deepEqual(deriveQirContinuationFromContext(context), deriveQirContinuation(current));
  assert.deepEqual(context.cursor, current.cursor);
  assert.equal(context.goal.statement, current.goal.statement);
  assert.equal(context.requiredArtifacts.find((artifact) => artifact.artifactId === "site")?.generation, 2);
  assert.equal(context.lastVerifiedCheckpoint?.checkpointId, "checkpoint-1");
  assert.equal(context.unresolvedBlockers[0]?.code, "ARTIFACT_INVALID");
});

test("raw credentials never enter compacted project or interaction state", () => {
  const context = compactQirWorkingContext({
    run: run(),
    projectState: {
      apiKey: "sk-abcdefghijklmnopqrstuvwxyz",
      nested: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz" },
      safe: "keep-me",
    },
    recentInteractions: ["Bearer abcdefghijklmnopqrstuvwxyz", "normal context"],
    compactedAt: "2026-09-02T06:02:00.000Z",
  });
  const serialized = JSON.stringify(context);
  assert.equal(serialized.includes("sk-abcdefghijklmnopqrstuvwxyz"), false);
  assert.equal(serialized.includes("Bearer abcdefghijklmnopqrstuvwxyz"), false);
  assert.equal(serialized.includes("keep-me"), true);
});

test("malformed or tampered compacted state fails closed", () => {
  const context = compactQirWorkingContext({ run: run(), compactedAt: "2026-09-02T06:02:00.000Z" });
  assert.equal(isCompatibleQirContextState(context, "context-run-1"), true);
  assert.equal(isCompatibleQirContextState({ ...context, cursor: { ...context.cursor, attempt: 99 } }, "context-run-1"), false);
  assert.throws(() => deriveQirContinuationFromContext({ ...context, hash: "0".repeat(64) }));
});

test("serialized durable Run carries context another worker can resume without transcript replay", () => {
  const current = run();
  const context = compactQirWorkingContext({ run: current, compactedAt: "2026-09-02T06:02:00.000Z" });
  const persisted = attachQirWorkingContext(current, context);
  const restored = JSON.parse(JSON.stringify(persisted)) as QirAgentRun;
  const restoredContext = readQirWorkingContext(restored);
  assert.ok(restoredContext);
  assert.deepEqual(deriveQirContinuationFromContext(restoredContext), deriveQirContinuation(current));
  assert.equal(restoredContext.recentInteractionResidue.length, 0);
});
