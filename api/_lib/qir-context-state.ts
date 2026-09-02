import { createHash } from "node:crypto";
import {
  deriveQirContinuation,
  type QirAgentRun,
  type QirArtifactRef,
  type QirCheckpoint,
} from "./qir-contracts.js";

export const QIR_CONTEXT_STATE_VERSION = "qir-context-2026-09-02.1";
export const QIR_CONTEXT_DEFAULT_RECENT_LIMIT = 12;

export type QirContextContinuation = {
  stepId: string;
  taskId: string;
  actionId: string | null;
} | null;

export type QirContextState = {
  version: string;
  runId: string;
  goal: QirAgentRun["goal"];
  runStatus: QirAgentRun["status"];
  cursor: QirAgentRun["cursor"];
  unresolvedBlockers: Array<{ code: string; message: string }>;
  verifiedEvidenceRefs: string[];
  requiredArtifacts: QirArtifactRef[];
  lastVerifiedCheckpoint: QirCheckpoint | null;
  nextAction: QirContextContinuation;
  recentInteractionResidue: string[];
  projectState: Record<string, unknown>;
  compactedAt: string;
  hash: string;
};

export type QirRunWithWorkingContext = QirAgentRun & {
  workingContext?: QirContextState;
};

const SENSITIVE_KEY = /(api[_-]?key|secret|password|passwd|token|authorization|cookie|credential|private[_-]?key)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+\/-]+=*|sk-[a-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

function sanitizeScalar(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return SECRET_VALUE.test(value) ? "[REDACTED]" : value;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (value === null || typeof value !== "object") return sanitizeScalar(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitize((value as Record<string, unknown>)[key], depth + 1);
  }
  return out;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
}

function hashContext(value: Omit<QirContextState, "hash">): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function lastVerifiedCheckpoint(run: QirAgentRun): QirCheckpoint | null {
  const verifiedGenerations = new Map(
    run.artifacts.filter((artifact) => artifact.state === "verified").map((artifact) => [artifact.artifactId, artifact.generation]),
  );
  return [...run.checkpoints].reverse().find((checkpoint) => (
    Object.entries(checkpoint.artifactGenerations).every(([artifactId, generation]) => verifiedGenerations.get(artifactId) === generation)
  )) || run.checkpoints.at(-1) || null;
}

function blockers(run: QirAgentRun): Array<{ code: string; message: string }> {
  const seen = new Set<string>();
  const result: Array<{ code: string; message: string }> = [];
  for (const observation of run.observations) {
    const error = observation.error;
    if (!error || observation.status !== "failure") continue;
    const key = `${error.code}:${error.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ code: error.code, message: String(sanitizeScalar(error.message)) });
  }
  return result.slice(-16);
}

function evidenceRefs(run: QirAgentRun): string[] {
  const refs = new Set<string>();
  for (const verification of run.verifications) {
    if (!verification.passed) continue;
    for (const ref of verification.evidenceRefs) if (ref) refs.add(ref);
  }
  for (const observation of run.observations) {
    if (observation.status !== "success") continue;
    for (const evidence of observation.evidence) if (evidence.ref) refs.add(evidence.ref);
  }
  return [...refs].sort().slice(-128);
}

export function compactQirWorkingContext(input: {
  run: QirAgentRun;
  projectState?: Record<string, unknown> | null;
  recentInteractions?: unknown[] | null;
  recentLimit?: number;
  compactedAt?: string;
}): QirContextState {
  const recentLimit = Number.isInteger(input.recentLimit) && Number(input.recentLimit) >= 0
    ? Math.min(Number(input.recentLimit), 32)
    : QIR_CONTEXT_DEFAULT_RECENT_LIMIT;
  const compactedAt = input.compactedAt || input.run.updatedAt || input.run.createdAt;
  const recent = (input.recentInteractions || [])
    .slice(-recentLimit)
    .map((entry) => String(sanitizeScalar(typeof entry === "string" ? entry : stable(sanitize(entry)))).slice(0, 2_000));

  const withoutHash: Omit<QirContextState, "hash"> = {
    version: QIR_CONTEXT_STATE_VERSION,
    runId: input.run.runId,
    goal: { ...input.run.goal },
    runStatus: input.run.status,
    cursor: { ...input.run.cursor },
    unresolvedBlockers: blockers(input.run),
    verifiedEvidenceRefs: evidenceRefs(input.run),
    requiredArtifacts: input.run.artifacts
      .filter((artifact) => artifact.state !== "rejected")
      .map((artifact) => ({ ...artifact }))
      .sort((a, b) => a.artifactId.localeCompare(b.artifactId) || a.generation - b.generation),
    lastVerifiedCheckpoint: lastVerifiedCheckpoint(input.run),
    nextAction: deriveQirContinuation(input.run),
    recentInteractionResidue: recent,
    projectState: sanitize(input.projectState || {}) as Record<string, unknown>,
    compactedAt,
  };

  return { ...withoutHash, hash: hashContext(withoutHash) };
}

export function isCompatibleQirContextState(value: unknown, runId?: string): value is QirContextState {
  if (!value || typeof value !== "object") return false;
  const state = value as QirContextState;
  if (state.version !== QIR_CONTEXT_STATE_VERSION) return false;
  if (!state.runId || (runId && state.runId !== runId)) return false;
  if (!state.goal || !state.cursor || !Array.isArray(state.unresolvedBlockers)) return false;
  if (!Array.isArray(state.verifiedEvidenceRefs) || !Array.isArray(state.requiredArtifacts)) return false;
  if (!Array.isArray(state.recentInteractionResidue) || !state.projectState || typeof state.projectState !== "object") return false;
  if (!/^[a-f0-9]{64}$/.test(String(state.hash || ""))) return false;
  const { hash, ...withoutHash } = state;
  return hashContext(withoutHash) === hash;
}

export function attachQirWorkingContext(run: QirAgentRun, context: QirContextState): QirRunWithWorkingContext {
  if (!isCompatibleQirContextState(context, run.runId)) throw new Error("Incompatible QIR working context.");
  return { ...run, workingContext: context };
}

export function readQirWorkingContext(run: QirAgentRun): QirContextState | null {
  const value = (run as QirRunWithWorkingContext).workingContext;
  return isCompatibleQirContextState(value, run.runId) ? value : null;
}

export function deriveQirContinuationFromContext(context: QirContextState): QirContextContinuation {
  if (!isCompatibleQirContextState(context)) throw new Error("Malformed or incompatible QIR working context.");
  return context.nextAction ? { ...context.nextAction } : null;
}
