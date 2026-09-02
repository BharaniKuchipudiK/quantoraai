import {
  assessQirRunTransition,
  deriveQirContinuation,
  type QirAgentRun,
  type QirArtifactRef,
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
