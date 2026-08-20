import type { CodeProjectCognition } from "./code-project-cognition.js";

export const CODE_SELF_HEAL_VERSION = "code-self-heal-2026-08-20.1";

export type CodeDiagnosticSeverity = "info" | "warning" | "error";
export type CodeDiagnosticSource = "editor" | "compiler" | "runtime" | "test" | "lint" | "preview";

export type CodeDiagnostic = {
  id: string;
  source: CodeDiagnosticSource;
  severity: CodeDiagnosticSeverity;
  message: string;
  path?: string | null;
  line?: number | null;
  column?: number | null;
  code?: string | null;
};

export type CodeVerificationEvidence = {
  buildPassed?: boolean | null;
  testsPassed?: boolean | null;
  previewLoaded?: boolean | null;
  runtimeClean?: boolean | null;
  lintPassed?: boolean | null;
  notes?: string[];
};

export type CodeRepairPolicy = {
  version: string;
  maxAttempts: number;
  autoHeal: boolean;
  requireReviewableDiff: boolean;
  requireVerification: boolean;
  keepDiagnosticsVisible: boolean;
  qualityRules: string[];
};

export type CodeRepairDecision = {
  shouldRepair: boolean;
  mode: "none" | "suggest" | "auto";
  reasons: string[];
  blockingDiagnostics: CodeDiagnostic[];
};

export type CodeRepairAttempt = {
  attempt: number;
  status: "diagnose" | "patch" | "verify" | "complete" | "failed";
  diagnosticIds: string[];
  changedFiles: string[];
  summary?: string | null;
  verification?: CodeVerificationEvidence | null;
};

export function defaultCodeRepairPolicy(input: { cognition: CodeProjectCognition; autoHeal?: boolean }): CodeRepairPolicy {
  const consequential = input.cognition.architecture.includes("database") || input.cognition.architecture.includes("backend");
  return {
    version: CODE_SELF_HEAL_VERSION,
    maxAttempts: 3,
    autoHeal: input.autoHeal !== false && !consequential,
    requireReviewableDiff: true,
    requireVerification: true,
    keepDiagnosticsVisible: true,
    qualityRules: [
      "Prefer the smallest patch that solves the diagnosed problem.",
      "Reuse existing abstractions before creating new ones.",
      "Do not delete working behaviour merely to make an error disappear.",
      "Preserve established project conventions and architecture.",
      "Never claim success until execution evidence verifies the result.",
    ],
  };
}

export function decideCodeRepair(input: {
  diagnostics?: CodeDiagnostic[];
  policy: CodeRepairPolicy;
}): CodeRepairDecision {
  const diagnostics = input.diagnostics || [];
  const blocking = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (!blocking.length) {
    return { shouldRepair: false, mode: "none", reasons: ["No blocking diagnostics are present."], blockingDiagnostics: [] };
  }

  const reasons = [`${blocking.length} blocking diagnostic${blocking.length === 1 ? "" : "s"} require attention.`];
  if (!input.policy.autoHeal) {
    reasons.push("Policy requires a reviewable suggestion before applying the repair.");
    return { shouldRepair: true, mode: "suggest", reasons, blockingDiagnostics: blocking };
  }

  reasons.push("Auto-heal is allowed, but the patch must remain observable and independently verified.");
  return { shouldRepair: true, mode: "auto", reasons, blockingDiagnostics: blocking };
}

export function verificationSatisfied(evidence: CodeVerificationEvidence | null | undefined): boolean {
  if (!evidence) return false;
  if (evidence.buildPassed === false || evidence.testsPassed === false || evidence.previewLoaded === false || evidence.runtimeClean === false || evidence.lintPassed === false) return false;

  const positiveSignals = [
    evidence.buildPassed,
    evidence.testsPassed,
    evidence.previewLoaded,
    evidence.runtimeClean,
    evidence.lintPassed,
  ].filter((value) => value === true).length;

  return positiveSignals > 0;
}

export function canClaimCodeOutcomeComplete(input: {
  policy: CodeRepairPolicy;
  evidence?: CodeVerificationEvidence | null;
  diagnostics?: CodeDiagnostic[];
}): boolean {
  const blocking = (input.diagnostics || []).some((diagnostic) => diagnostic.severity === "error");
  if (blocking) return false;
  if (!input.policy.requireVerification) return true;
  return verificationSatisfied(input.evidence);
}

export function nextRepairAttempt(input: {
  previousAttempts?: CodeRepairAttempt[];
  diagnostics?: CodeDiagnostic[];
  changedFiles?: string[];
  verification?: CodeVerificationEvidence | null;
  policy: CodeRepairPolicy;
}): CodeRepairAttempt {
  const previous = input.previousAttempts || [];
  const attempt = previous.length + 1;
  const diagnosticIds = (input.diagnostics || []).filter((diagnostic) => diagnostic.severity === "error").map((diagnostic) => diagnostic.id);

  if (attempt > input.policy.maxAttempts) {
    return {
      attempt,
      status: "failed",
      diagnosticIds,
      changedFiles: input.changedFiles || [],
      summary: "Repair attempt budget exhausted; surface the failure instead of looping indefinitely.",
      verification: input.verification || null,
    };
  }

  if (verificationSatisfied(input.verification) && diagnosticIds.length === 0) {
    return {
      attempt,
      status: "complete",
      diagnosticIds,
      changedFiles: input.changedFiles || [],
      summary: "Execution evidence verifies the repaired project.",
      verification: input.verification || null,
    };
  }

  return {
    attempt,
    status: input.changedFiles?.length ? "verify" : "diagnose",
    diagnosticIds,
    changedFiles: input.changedFiles || [],
    verification: input.verification || null,
  };
}
