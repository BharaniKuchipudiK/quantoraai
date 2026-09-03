import assert from "node:assert/strict";
import test from "node:test";

import {
  QIR_CONTRACT_VERSION,
  assessQirRunTransition,
  deriveQirContinuation,
  type QirAgentRun,
  type QirObservation,
  type QirVerificationResult,
} from "./qir-contracts.js";

function run(overrides: Partial<QirAgentRun> = {}): QirAgentRun {
  return {
    version: QIR_CONTRACT_VERSION,
    runId: "run-1",
    goal: { statement: "Repair the app", status: "confirmed" },
    status: "EXECUTING",
    steps: [
      {
        stepId: "build",
        taskId: "build",
        objective: "Create a candidate fix",
        dependsOn: [],
        status: "active",
        requiresVerification: true,
        actionId: "action-2",
      },
      {
        stepId: "verify",
        taskId: "verify",
        objective: "Verify the candidate",
        dependsOn: ["build"],
        status: "pending",
        requiresVerification: true,
        actionId: null,
      },
    ],
    cursor: { stepId: "build", actionId: "action-2", attempt: 2 },
    artifacts: [
      {
        artifactId: "app",
        generation: 2,
        ref: "vfs://candidate/app@2",
        state: "candidate",
        createdByActionId: "action-2",
        verifiedByActionId: null,
      },
    ],
    observations: [],
    verifications: [],
    checkpoints: [],
    budget: {
      runUnitsRemaining: 10,
      stepUnitsRemaining: 3,
      recoveryReserveRemaining: 2,
      premiumEscalationRemaining: 1,
    },
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:01.000Z",
    ...overrides,
  };
}

function observation(overrides: Partial<QirObservation> = {}): QirObservation {
  return {
    observationId: "obs-2",
    runId: "run-1",
    actionId: "action-2",
    artifactId: "app",
    artifactGeneration: 2,
    kind: "tool",
    status: "success",
    evidence: [],
    observedAt: "2026-09-02T00:00:02.000Z",
    ...overrides,
  };
}

function verification(overrides: Partial<QirVerificationResult> = {}): QirVerificationResult {
  return {
    verificationId: "verify-1",
    runId: "run-1",
    actionId: "verify-action",
    passed: true,
    proofOfDoneStatus: "verified",
    evidenceRefs: ["compile://pass", "runtime://pass"],
    verifiedAt: "2026-09-02T00:00:03.000Z",
    ...overrides,
  };
}

test("provider/tool success cannot declare the mission complete", () => {
  const result = assessQirRunTransition({
    run: run(),
    incomingObservation: observation({ status: "success" }),
    proofOfDoneStatus: "not_ready",
    latestVerification: null,
  });

  assert.equal(result.observationAccepted, true);
  assert.equal(result.completionAllowed, false);
  assert.equal(result.recommendedStatus, "VERIFYING");
  assert.match(result.blockers.join(" "), /Proof of Done/i);
  assert.match(result.blockers.join(" "), /Independent verification/i);
});

test("late observations from an older action or artifact generation are rejected", () => {
  const stale = assessQirRunTransition({
    run: run(),
    incomingObservation: observation({
      observationId: "obs-old",
      actionId: "action-1",
      artifactGeneration: 1,
    }),
    proofOfDoneStatus: "verification_required",
    latestVerification: null,
  });

  assert.equal(stale.observationAccepted, false);
  assert.equal(stale.staleObservation, true);
  assert.equal(stale.completionAllowed, false);
  assert.equal(stale.recommendedStatus, "EXECUTING");
});

test("compile failure remains recoverable inside the Run", () => {
  const failed = assessQirRunTransition({
    run: run(),
    incomingObservation: observation({
      kind: "compiler",
      status: "failure",
      error: {
        code: "COMPILE_FAILURE",
        message: "TypeScript compilation failed",
        retryable: true,
      },
    }),
    proofOfDoneStatus: "not_ready",
    latestVerification: null,
  });

  assert.equal(failed.recoverableFailure, true);
  assert.equal(failed.terminalFailure, false);
  assert.equal(failed.recommendedStatus, "REPAIRING");
});

test("FAILED_TERMINAL requires explicit recovery exhaustion", () => {
  const providerFailure = observation({
    status: "failure",
    artifactId: null,
    artifactGeneration: null,
    error: {
      code: "PROVIDER_TRANSPORT",
      message: "Provider connection failed",
      retryable: true,
    },
  });
  const recoverable = assessQirRunTransition({
    run: run(),
    incomingObservation: providerFailure,
    proofOfDoneStatus: "not_ready",
    latestVerification: null,
  });
  const exhausted = assessQirRunTransition({
    run: run(),
    incomingObservation: {
      ...providerFailure,
      error: { ...providerFailure.error!, recoveryExhausted: true },
    },
    proofOfDoneStatus: "not_ready",
    latestVerification: null,
  });

  assert.equal(recoverable.recommendedStatus, "REPLANNING");
  assert.equal(recoverable.terminalFailure, false);
  assert.equal(exhausted.recommendedStatus, "FAILED_TERMINAL");
  assert.equal(exhausted.terminalFailure, true);
});

test("only verified Proof of Done plus independent verification may authorize COMPLETE", () => {
  const notVerified = assessQirRunTransition({
    run: run({ status: "VERIFYING" }),
    proofOfDoneStatus: "verification_required",
    latestVerification: verification(),
  });
  const wrongRun = assessQirRunTransition({
    run: run({ status: "VERIFYING" }),
    proofOfDoneStatus: "verified",
    latestVerification: verification({ runId: "run-old" }),
  });
  const verified = assessQirRunTransition({
    run: run({ status: "VERIFYING" }),
    proofOfDoneStatus: "verified",
    latestVerification: verification(),
  });

  assert.equal(notVerified.completionAllowed, false);
  assert.equal(wrongRun.completionAllowed, false);
  assert.equal(verified.completionAllowed, true);
  assert.equal(verified.recommendedStatus, "COMPLETE");
});

test("another worker can derive the next action from serialized Run state", () => {
  const serialized = JSON.stringify(run({
    status: "PLANNING",
    steps: [
      {
        stepId: "build",
        taskId: "build",
        objective: "Build candidate",
        dependsOn: [],
        status: "verified",
        requiresVerification: true,
        actionId: "build-action",
      },
      {
        stepId: "verify",
        taskId: "verify",
        objective: "Verify candidate",
        dependsOn: ["build"],
        status: "pending",
        requiresVerification: true,
        actionId: null,
      },
    ],
    cursor: { stepId: null, actionId: null, attempt: 0 },
  }));
  const restored = JSON.parse(serialized) as QirAgentRun;

  assert.deepEqual(deriveQirContinuation(restored), {
    stepId: "verify",
    taskId: "verify",
    actionId: null,
  });
});

/*
 * THE MISSION MUST OUTLIVE THE TURN (2026-09-03).
 *
 * The rule above is right, and the browser lied to it. Every terminal failure
 * site in src/hooks/useChatStream.js reported `recoveryExhausted: true` meaning
 * "this TURN's automatic retry budget is spent", which this guard reads as the
 * MISSION's verdict. Measured end to end:
 *
 *     turn 1 ends -> Run status becomes: FAILED_TERMINAL
 *     turn 2 asks the journal where to continue: null
 *     turn 2 may open a new attempt (needs QUEUED|REPLANNING): false
 *
 * So the first spent turn sealed the Run: deriveQirContinuation returns null
 * for FAILED_TERMINAL and api/qir-runs.ts answers 409 to coding.attempt, which
 * means the durable journal stopped accepting anything for the rest of the
 * browser session while the person was still asking for the same thing. That
 * is why QIR looked write-only — it wrote once and then bricked itself.
 *
 * src/lib/mission-continuation.js now decides that boolean from evidence: the
 * mission is exhausted only when no engine remains that has not already failed
 * on it. These two tests pin what each answer must buy.
 */
test("a spent turn budget leaves the mission continuable", () => {
  const turnBudgetSpent = assessQirRunTransition({
    run: run(),
    incomingObservation: observation({
      status: "failure",
      artifactId: null,
      artifactGeneration: null,
      error: {
        code: "PROVIDER_TRANSPORT",
        message: "no healthy AI route",
        retryable: true,
        recoveryExhausted: false,
      },
    }),
    proofOfDoneStatus: "not_ready",
    latestVerification: null,
  });

  assert.equal(turnBudgetSpent.recommendedStatus, "REPLANNING");
  assert.equal(turnBudgetSpent.terminalFailure, false);

  const continued = { ...run(), status: turnBudgetSpent.recommendedStatus };
  assert.notEqual(
    deriveQirContinuation(continued),
    null,
    "the next turn must be able to find where this mission stands",
  );
  assert.ok(
    ["QUEUED", "REPLANNING"].includes(continued.status),
    "coding.attempt accepts only these, so anything else silently ends the mission",
  );
});

test("an exhausted mission is terminal, and stays terminal", () => {
  const exhausted = assessQirRunTransition({
    run: run(),
    incomingObservation: observation({
      status: "failure",
      artifactId: null,
      artifactGeneration: null,
      error: {
        code: "PROVIDER_TRANSPORT",
        message: "every engine available has failed on this mission",
        retryable: false,
        recoveryExhausted: true,
      },
    }),
    proofOfDoneStatus: "not_ready",
    latestVerification: null,
  });

  assert.equal(exhausted.recommendedStatus, "FAILED_TERMINAL");
  assert.equal(
    deriveQirContinuation({ ...run(), status: "FAILED_TERMINAL" }),
    null,
    "a genuinely dead mission must not offer a continuation either",
  );
});
