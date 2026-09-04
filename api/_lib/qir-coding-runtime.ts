import {
  assessQirRunTransition,
  deriveQirContinuation,
  type QirAgentRun,
  type QirArtifactRef,
  type QirRunStatus,
  type QirVerificationResult,
} from "./qir-contracts.js";
import type { ProofOfDoneStatus } from "./outcome-contract.js";

export function beginQirCodingRecovery(input: {
  run: QirAgentRun;
  actionId: string;
  artifactId: string;
  artifactGeneration: number;
  artifactRef: string;
  now: string;
}): QirAgentRun {
  const { run } = input;
  if (!["REPAIRING", "REPLANNING"].includes(run.status)) {
    throw new Error(`QIR recovery requires REPAIRING/REPLANNING, got ${run.status}.`);
  }
  if (!run.cursor.stepId) throw new Error("QIR recovery requires an active step.");
  if (!input.actionId || input.actionId === run.cursor.actionId) {
    throw new Error("QIR recovery must use a materially different action id.");
  }
  if (!Number.isInteger(input.artifactGeneration) || input.artifactGeneration < 1) {
    throw new Error("QIR recovery requires a positive artifact generation.");
  }

  const existing = run.artifacts.find((artifact) => artifact.artifactId === input.artifactId);
  if (existing && input.artifactGeneration <= existing.generation) {
    throw new Error("QIR recovery must advance the candidate artifact generation.");
  }

  const candidate: QirArtifactRef = {
    artifactId: input.artifactId,
    generation: input.artifactGeneration,
    ref: input.artifactRef,
    state: "candidate",
    createdByActionId: input.actionId,
    verifiedByActionId: null,
  };

  return {
    ...run,
    status: "EXECUTING",
    cursor: {
      ...run.cursor,
      actionId: input.actionId,
    },
    steps: run.steps.map((step) => (
      step.stepId === run.cursor.stepId
        ? { ...step, status: "active", actionId: input.actionId }
        : step
    )),
    artifacts: [
      ...run.artifacts.filter((artifact) => artifact.artifactId !== input.artifactId),
      candidate,
    ],
    updatedAt: input.now,
  };
}

export function resumeQirCodingFromSnapshot(run: QirAgentRun) {
  const continuation = deriveQirContinuation(run);
  if (!continuation) throw new Error("QIR durable snapshot has no resumable Coding continuation.");
  return continuation;
}

export function promoteQirCodingCheckpoint(input: {
  run: QirAgentRun;
  verification: QirVerificationResult;
  proofOfDoneStatus: ProofOfDoneStatus;
  artifactId: string;
  artifactGeneration: number;
  checkpointId: string;
  now: string;
}): QirAgentRun {
  const { run, verification } = input;
  if (verification.runId !== run.runId || !verification.passed || verification.proofOfDoneStatus !== "verified") {
    throw new Error("QIR checkpoint promotion requires passing independent verification for this Run.");
  }
  const artifact = run.artifacts.find((candidate) => candidate.artifactId === input.artifactId);
  if (!artifact || artifact.generation !== input.artifactGeneration || artifact.state !== "candidate") {
    throw new Error("QIR checkpoint promotion requires the current candidate artifact generation.");
  }

  const verifiedArtifacts = run.artifacts.map((candidate) => (
    candidate.artifactId === input.artifactId
      ? { ...candidate, state: "verified" as const, verifiedByActionId: verification.actionId }
      : candidate
  ));
  const verifiedRun: QirAgentRun = {
    ...run,
    artifacts: verifiedArtifacts,
    verifications: [...run.verifications, verification],
    checkpoints: [
      ...run.checkpoints,
      {
        checkpointId: input.checkpointId,
        runId: run.runId,
        stepId: run.cursor.stepId,
        actionId: run.cursor.actionId,
        artifactGenerations: {
          ...Object.fromEntries(
            run.artifacts
              .filter((candidate) => candidate.state === "verified")
              .map((candidate) => [candidate.artifactId, candidate.generation]),
          ),
          [input.artifactId]: input.artifactGeneration,
        },
        createdAt: input.now,
      },
    ],
    steps: run.steps.map((step) => (
      step.stepId === run.cursor.stepId ? { ...step, status: "verified" } : step
    )),
    goal: { ...run.goal, status: "achieved" },
    status: "CHECKPOINTED",
    updatedAt: input.now,
  };

  const completion = assessQirRunTransition({
    run: verifiedRun,
    proofOfDoneStatus: input.proofOfDoneStatus,
    latestVerification: verification,
  });
  return {
    ...verifiedRun,
    status: completion.completionAllowed ? "COMPLETE" : "CHECKPOINTED",
  };
}

/**
 * ---------------------------------------------------------------------------
 * THE STOP BUTTON.
 *
 * Phase 2 asks for pause/resume/cancel. PAUSED existed as a state in
 * qir-contracts.ts and deriveQirContinuation already honoured it, but no action
 * could ever reach it: /api/qir-runs accepted only start, attempt, observe,
 * recover and promote. A user with a runaway build could close the tab, which
 * stops a browser and not a Run.
 *
 * These are pure transitions so they can be tested as logic rather than through
 * a serverless handler — the route holds ownership, versioning and the event
 * write; the RULES live here.
 * ---------------------------------------------------------------------------
 */
const STOPPED: QirRunStatus[] = ["COMPLETE", "FAILED_TERMINAL"];

/** A Run that has already stopped cannot be paused, resumed or cancelled again. */
export function qirRunHasStopped(run: QirAgentRun): boolean {
  return STOPPED.includes(run.status);
}

/**
 * Stop for now. Every artifact, budget and cursor is left exactly as it stands,
 * because the whole point is that resuming loses nothing.
 */
export function pauseQirCodingRun(run: QirAgentRun, now: string): QirAgentRun {
  return { ...run, status: "PAUSED", updatedAt: now };
}

/**
 * Where a paused Run resumes TO is derived from the plan, not remembered.
 *
 * deriveQirContinuation returns null for a paused Run by design, so it is asked
 * about a non-paused copy. Somewhere to continue means EXECUTING; nowhere means
 * QUEUED, which is a status coding.attempt accepts. A stored pre-pause status
 * could be stale by the time anyone resumes; the plan is the truth about where
 * the work actually is.
 */
export function resumeQirCodingRun(run: QirAgentRun, now: string): QirAgentRun {
  const continuation = deriveQirContinuation({ ...run, status: "EXECUTING" });
  return { ...run, status: continuation ? "EXECUTING" : "QUEUED", updatedAt: now };
}

/**
 * Stop for good.
 *
 * NOT a second pause. An earlier draft of mine had cancel parking at PAUSED,
 * which would have made it pause under another name and left the user with no
 * way to actually end anything.
 *
 * The candidate is REJECTED rather than left dangling: a surviving candidate is
 * exactly what coding.attempt refuses to start over ("a candidate artifact
 * already exists"), so a cancelled Run's own wreckage would block the next one.
 * Verified artifacts are untouched — work that passed independent verification
 * before the cancel is real, and destroying it would take back an outcome the
 * user already earned.
 */
export function cancelQirCodingRun(run: QirAgentRun, now: string): QirAgentRun {
  return {
    ...run,
    status: "FAILED_TERMINAL",
    artifacts: run.artifacts.map((artifact) => (
      artifact.state === "candidate" ? { ...artifact, state: "rejected" } : artifact
    )),
    updatedAt: now,
  };
}
