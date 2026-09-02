import type { PclAgentExecutionPlan } from "./agent-execution-fabric.js";
import type { ProofOfDoneStatus } from "./outcome-contract.js";

export const QIR_CONTRACT_VERSION = "qir-contracts-2026-09-02.1";

export const QIR_RUN_STATES = [
  "QUEUED",
  "UNDERSTANDING",
  "PLANNING",
  "EXECUTING",
  "WAITING_ON_TOOL",
  "OBSERVING",
  "VERIFYING",
  "REPAIRING",
  "REPLANNING",
  "CHECKPOINTED",
  "WAITING_FOR_USER",
  "WAITING_FOR_CAPACITY",
  "PAUSED",
  "COMPLETE",
  "FAILED_TERMINAL",
] as const;

export type QirRunStatus = typeof QIR_RUN_STATES[number];

export const QIR_FAILURE_CODES = [
  "USER_INPUT_REQUIRED",
  "POLICY_BLOCK",
  "PROVIDER_AUTH",
  "PROVIDER_QUOTA",
  "PROVIDER_TIMEOUT",
  "PROVIDER_TRANSPORT",
  "MODEL_CONTRACT",
  "TOOL_TIMEOUT",
  "TOOL_FAILURE",
  "ARTIFACT_INVALID",
  "COMPILE_FAILURE",
  "RUNTIME_FAILURE",
  "VERIFICATION_FAILURE",
  "BUDGET_WAIT",
  "CAPACITY_WAIT",
  "INTERNAL_INVARIANT",
] as const;

export type QirFailureCode = typeof QIR_FAILURE_CODES[number];

export type QirEvidenceSource =
  | "model"
  | "tool"
  | "compiler"
  | "runtime"
  | "provider"
  | "verifier"
  | "human";

export type QirEvidence = {
  evidenceId: string;
  source: QirEvidenceSource;
  kind: string;
  actionId: string;
  ref?: string | null;
  observedAt: string;
};

export type QirStructuredError = {
  code: QirFailureCode;
  message: string;
  retryable: boolean;
  recoveryExhausted?: boolean;
  causeRef?: string | null;
};

export type QirArtifactState = "candidate" | "verified" | "rejected";

export type QirArtifactRef = {
  artifactId: string;
  generation: number;
  ref: string;
  state: QirArtifactState;
  createdByActionId: string;
  verifiedByActionId?: string | null;
};

export type QirObservationKind = "model" | "tool" | "compiler" | "runtime" | "verification";

export type QirObservation = {
  observationId: string;
  runId: string;
  actionId: string;
  artifactId?: string | null;
  artifactGeneration?: number | null;
  kind: QirObservationKind;
  status: "success" | "failure";
  evidence: QirEvidence[];
  error?: QirStructuredError | null;
  observedAt: string;
};

export type QirVerificationResult = {
  verificationId: string;
  runId: string;
  actionId: string;
  passed: boolean;
  proofOfDoneStatus: ProofOfDoneStatus;
  evidenceRefs: string[];
  verifiedAt: string;
};

export type QirStepStatus =
  | "pending"
  | "active"
  | "waiting"
  | "succeeded"
  | "failed_recoverable"
  | "verified"
  | "rejected";

export type QirAgentStep = {
  stepId: string;
  taskId: string;
  objective: string;
  dependsOn: string[];
  status: QirStepStatus;
  requiresVerification: boolean;
  actionId?: string | null;
};

export type QirCheckpoint = {
  checkpointId: string;
  runId: string;
  stepId: string | null;
  actionId: string | null;
  artifactGenerations: Record<string, number>;
  createdAt: string;
};

export type QirResourceBudget = {
  runUnitsRemaining: number | null;
  stepUnitsRemaining: number | null;
  recoveryReserveRemaining: number | null;
  premiumEscalationRemaining: number | null;
};

export type QirAgentRun = {
  version: string;
  runId: string;
  goal: {
    statement: string | null;
    status: "missing" | "draft" | "confirmed" | "achieved";
  };
  status: QirRunStatus;
  steps: QirAgentStep[];
  cursor: {
    stepId: string | null;
    actionId: string | null;
    attempt: number;
  };
  artifacts: QirArtifactRef[];
  observations: QirObservation[];
  verifications: QirVerificationResult[];
  checkpoints: QirCheckpoint[];
  budget: QirResourceBudget;
  createdAt: string;
  updatedAt: string;
};

export type QirTransitionAssessment = {
  observationAccepted: boolean | null;
  staleObservation: boolean;
  recoverableFailure: boolean;
  terminalFailure: boolean;
  completionAllowed: boolean;
  recommendedStatus: QirRunStatus;
  blockers: string[];
};

const CAPACITY_CODES = new Set<QirFailureCode>(["PROVIDER_QUOTA", "BUDGET_WAIT", "CAPACITY_WAIT"]);
const ARTIFACT_RECOVERY_CODES = new Set<QirFailureCode>([
  "ARTIFACT_INVALID",
  "COMPILE_FAILURE",
  "RUNTIME_FAILURE",
  "VERIFICATION_FAILURE",
]);

function observationIsCurrent(run: QirAgentRun, observation: QirObservation): boolean {
  if (observation.runId !== run.runId) return false;
  if (run.cursor.actionId && observation.actionId !== run.cursor.actionId) return false;

  if (observation.artifactId) {
    const currentArtifact = run.artifacts.find((artifact) => artifact.artifactId === observation.artifactId);
    if (!currentArtifact) return false;
    if (
      typeof observation.artifactGeneration === "number"
      && observation.artifactGeneration !== currentArtifact.generation
    ) return false;
  }

  return true;
}

function failureStatus(error: QirStructuredError): QirRunStatus {
  if (error.code === "USER_INPUT_REQUIRED") return "WAITING_FOR_USER";
  if (CAPACITY_CODES.has(error.code)) return "WAITING_FOR_CAPACITY";
  if (error.recoveryExhausted === true) return "FAILED_TERMINAL";
  if (ARTIFACT_RECOVERY_CODES.has(error.code)) return "REPAIRING";
  return "REPLANNING";
}

/**
 * Canonical Phase-1 transition guard. It does not persist or execute a Run;
 * it pins the rules the future durable runtime must obey.
 */
export function assessQirRunTransition(input: {
  run: QirAgentRun;
  incomingObservation?: QirObservation | null;
  proofOfDoneStatus: ProofOfDoneStatus;
  latestVerification?: QirVerificationResult | null;
}): QirTransitionAssessment {
  const blockers: string[] = [];
  const observationAccepted = input.incomingObservation
    ? observationIsCurrent(input.run, input.incomingObservation)
    : null;
  const staleObservation = observationAccepted === false;

  if (staleObservation) blockers.push("Incoming observation is stale for the current Run/action/artifact generation.");

  const incomingError = observationAccepted && input.incomingObservation?.status === "failure"
    ? input.incomingObservation.error || null
    : null;
  const recommendedFailureStatus = incomingError ? failureStatus(incomingError) : null;
  const terminalFailure = recommendedFailureStatus === "FAILED_TERMINAL";
  const recoverableFailure = Boolean(incomingError) && !terminalFailure;

  const verification = input.latestVerification || null;
  const verificationMatchesRun = Boolean(verification && verification.runId === input.run.runId);
  const independentVerificationPassed = Boolean(
    verificationMatchesRun
      && verification?.passed
      && verification.proofOfDoneStatus === "verified",
  );

  if (input.proofOfDoneStatus !== "verified") blockers.push("Proof of Done is not verified.");
  if (!independentVerificationPassed) blockers.push("Independent verification has not passed for this Run.");

  const completionAllowed = !staleObservation
    && !incomingError
    && input.proofOfDoneStatus === "verified"
    && independentVerificationPassed;

  let recommendedStatus = input.run.status;
  if (completionAllowed) recommendedStatus = "COMPLETE";
  else if (recommendedFailureStatus) recommendedStatus = recommendedFailureStatus;
  else if (observationAccepted && input.incomingObservation?.status === "success") recommendedStatus = "VERIFYING";

  return {
    observationAccepted,
    staleObservation,
    recoverableFailure,
    terminalFailure,
    completionAllowed,
    recommendedStatus,
    blockers: [...new Set(blockers)],
  };
}

function dependencySatisfied(step: QirAgentStep): boolean {
  return step.status === "verified" || (!step.requiresVerification && step.status === "succeeded");
}

/**
 * Derive the continuation cursor from serialized Run state only. No chat replay
 * or browser-local state is required to decide which plan step is next.
 */
export function deriveQirContinuation(run: QirAgentRun): {
  stepId: string;
  taskId: string;
  actionId: string | null;
} | null {
  if (run.status === "COMPLETE" || run.status === "FAILED_TERMINAL" || run.status === "PAUSED") return null;

  if (run.cursor.stepId) {
    const cursorStep = run.steps.find((step) => step.stepId === run.cursor.stepId);
    if (cursorStep && ["active", "waiting", "failed_recoverable"].includes(cursorStep.status)) {
      return {
        stepId: cursorStep.stepId,
        taskId: cursorStep.taskId,
        actionId: run.cursor.actionId || cursorStep.actionId || null,
      };
    }
  }

  const byId = new Map(run.steps.map((step) => [step.stepId, step]));
  const next = run.steps.find((step) => (
    step.status === "pending"
    && step.dependsOn.every((dependency) => {
      const dependencyStep = byId.get(dependency);
      return Boolean(dependencyStep && dependencySatisfied(dependencyStep));
    })
  ));

  return next
    ? { stepId: next.stepId, taskId: next.taskId, actionId: next.actionId || null }
    : null;
}

/**
 * Additive observability projection while Phase 1 pins contracts. It is
 * intentionally explicit that no durable run id/runtime exists yet.
 */
export function publicQirCompatibilitySummary(
  plan: PclAgentExecutionPlan,
  proofOfDoneStatus: ProofOfDoneStatus,
) {
  const projectedRun: QirAgentRun = {
    version: QIR_CONTRACT_VERSION,
    runId: "projection-only",
    goal: { statement: null, status: "missing" },
    status: plan.governance === "blocked" ? "PAUSED" : "PLANNING",
    steps: plan.tasks.map((task) => ({
      stepId: task.id,
      taskId: task.id,
      objective: task.objective,
      dependsOn: task.dependsOn,
      status: "pending",
      requiresVerification: task.requiresEvidence || task.role === "verifier",
      actionId: null,
    })),
    cursor: { stepId: null, actionId: null, attempt: 0 },
    artifacts: [],
    observations: [],
    verifications: [],
    checkpoints: [],
    budget: {
      runUnitsRemaining: null,
      stepUnitsRemaining: null,
      recoveryReserveRemaining: null,
      premiumEscalationRemaining: null,
    },
    createdAt: "",
    updatedAt: "",
  };
  const completion = assessQirRunTransition({
    run: projectedRun,
    proofOfDoneStatus,
    latestVerification: null,
  });
  const continuation = deriveQirContinuation(projectedRun);

  return {
    version: QIR_CONTRACT_VERSION,
    phase: "universal_agent_contracts" as const,
    durability: "not_started" as const,
    completionAuthority: "independent_outcome_verifier" as const,
    runIdentityAssigned: false,
    taskCount: plan.tasks.length,
    nextTaskId: continuation?.taskId || null,
    proofOfDoneStatus,
    completionEligible: completion.completionAllowed,
  };
}
