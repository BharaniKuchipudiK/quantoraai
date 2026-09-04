import {
  QIR_CONTRACT_VERSION,
  QIR_RUN_STATES,
  assessQirRunTransition,
  deriveQirContinuation,
  type QirAgentRun,
  type QirObservation,
  type QirRunStatus,
  type QirVerificationResult,
} from "./qir-contracts.js";
import type { ProofOfDoneStatus } from "./outcome-contract.js";
import { diagnoseQirPersistFailure } from "../../shared/qir-persist-diagnosis.js";

const REST_TIMEOUT_MS = 5_000;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const EVENT_TYPE = /^[a-z][a-z0-9_.-]{0,95}$/;
const RUN_STATES = new Set<string>(QIR_RUN_STATES);

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function isQirRunStoreConfigured(): boolean {
  return config() !== null;
}

async function requestRaw(path: string, init: RequestInit & { headers?: Record<string, string> }) {
  const cfg = config();
  if (!cfg) return null;
  try {
    return await fetch(`${cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
    });
  } catch (error: any) {
    console.warn(`QIR Supabase ${init.method || "GET"} ${path} failed:`, error?.message || error);
    return null;
  }
}

export type QirPersistedRun = {
  run: QirAgentRun;
  storageVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type QirRunCommitResult =
  | { status: "committed"; record: QirPersistedRun }
  | { status: "conflict" }
  | { status: "not_found" }
  /*
   * WHY THIS CARRIES A DIAGNOSIS.
   *
   * It used to be a bare marker, so the reason the store refused a write was
   * console.warn'd into a log nobody reads and then dropped. The route could
   * only answer "persist-failed" and the desk chip could only say "rejected the
   * last write" - true, and not actionable. Missing table, blocked policy and
   * stale key are three different jobs for three different people.
   *
   * The verdict is CLASSIFIED here, never forwarded raw: diagnoseQirPersistFailure
   * emits fixed strings, so Supabase's own text - which names tables, columns and
   * sometimes the project - never crosses the wire to a browser.
   */
  | { status: "unavailable"; diagnosis?: { cause: string; remedy: string } | null };

function finiteNonNegative(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

/**
 * Strict enough to prevent corrupt durable state while remaining forward
 * compatible with additive contract fields. Completion authority still lives
 * in the QIR transition/verifier logic, never in this structural validator.
 */
export function isValidQirRunSnapshot(value: unknown): value is QirAgentRun {
  if (!value || typeof value !== "object") return false;
  const run = value as QirAgentRun;
  if (run.version !== QIR_CONTRACT_VERSION) return false;
  if (!RUN_ID.test(String(run.runId || ""))) return false;
  if (!RUN_STATES.has(String(run.status || ""))) return false;
  if (!run.goal || !["missing", "draft", "confirmed", "achieved"].includes(run.goal.status)) return false;
  if (!Array.isArray(run.steps) || !Array.isArray(run.artifacts) || !Array.isArray(run.observations)) return false;
  if (!Array.isArray(run.verifications) || !Array.isArray(run.checkpoints)) return false;
  if (!run.cursor || typeof run.cursor.attempt !== "number" || run.cursor.attempt < 0) return false;
  if (!run.budget) return false;
  if (!finiteNonNegative(run.budget.runUnitsRemaining)) return false;
  if (!finiteNonNegative(run.budget.stepUnitsRemaining)) return false;
  if (!finiteNonNegative(run.budget.recoveryReserveRemaining)) return false;
  if (!finiteNonNegative(run.budget.premiumEscalationRemaining)) return false;
  if (typeof run.createdAt !== "string" || typeof run.updatedAt !== "string") return false;
  return true;
}

function persistedRun(row: any): QirPersistedRun | null {
  const version = Number(row?.version);
  const state = row?.state;
  if (!Number.isInteger(version) || version < 1 || !isValidQirRunSnapshot(state)) return null;
  return {
    run: state,
    storageVersion: version,
    createdAt: String(row.created_at || state.createdAt || ""),
    updatedAt: String(row.updated_at || state.updatedAt || ""),
  };
}

function firstRecord(payload: any): QirPersistedRun | null {
  const row = Array.isArray(payload) ? payload[0] : payload;
  return persistedRun(row);
}

/*
 * CREATE IS THE FIRST CALL, SO IT NEEDS THE DIAGNOSIS MOST.
 *
 * This returned a bare null and console.warn'd the reason, so the very first
 * failure a new Run can hit - the one you get when the migration was never
 * applied to this project - reached the desk with no cause at all. The commit
 * path was given a verdict first; diagnosing the second failure mode and not
 * the first is the same dropped-boundary defect, one function over.
 */
export type QirRunCreateResult =
  | { status: "created"; record: QirPersistedRun }
  | { status: "unavailable"; diagnosis?: { cause: string; remedy: string } | null };

export async function createQirRun(userSub: string, run: QirAgentRun): Promise<QirRunCreateResult> {
  if (!userSub || !isValidQirRunSnapshot(run)) return { status: "unavailable" };
  const response = await requestRaw("rpc/create_qir_run", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ p_user_sub: userSub, p_run_id: run.runId, p_state: run }),
  });
  if (!response?.ok) {
    if (!response) return { status: "unavailable" };
    const detail = await response.text();
    console.warn(`QIR create run -> ${response.status}`, detail);
    return {
      status: "unavailable",
      diagnosis: diagnoseQirPersistFailure({ httpStatus: response.status, detail }),
    };
  }
  try {
    const record = firstRecord(await response.json());
    return record ? { status: "created", record } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function readQirRun(userSub: string, runId: string): Promise<QirPersistedRun | null> {
  if (!userSub || !RUN_ID.test(runId)) return null;
  const response = await requestRaw(
    `qir_runs?select=version,state,created_at,updated_at&user_sub=eq.${encodeURIComponent(userSub)}&run_id=eq.${encodeURIComponent(runId)}&limit=1`,
    { method: "GET" },
  );
  if (!response?.ok) return null;
  try {
    return firstRecord(await response.json());
  } catch {
    return null;
  }
}

export async function commitQirRunEvent(input: {
  userSub: string;
  runId: string;
  expectedVersion: number;
  eventId: string;
  eventType: string;
  run: QirAgentRun;
  payload?: Record<string, unknown>;
}): Promise<QirRunCommitResult> {
  if (
    !input.userSub
    || !RUN_ID.test(input.runId)
    || input.run.runId !== input.runId
    || !Number.isInteger(input.expectedVersion)
    || input.expectedVersion < 1
    || !EVENT_ID.test(input.eventId)
    || !EVENT_TYPE.test(input.eventType)
    || !isValidQirRunSnapshot(input.run)
  ) return { status: "unavailable" };

  const response = await requestRaw("rpc/commit_qir_run_event", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_user_sub: input.userSub,
      p_run_id: input.runId,
      p_expected_version: input.expectedVersion,
      p_event_id: input.eventId,
      p_event_type: input.eventType,
      p_state: input.run,
      p_payload: input.payload || {},
    }),
  });
  if (!response) return { status: "unavailable" };
  if (!response.ok) {
    const detail = await response.text();
    if (detail.includes("qir_run_version_conflict")) return { status: "conflict" };
    if (detail.includes("qir_run_not_found")) return { status: "not_found" };
    console.warn(`QIR commit event -> ${response.status}`, detail);
    return {
      status: "unavailable",
      diagnosis: diagnoseQirPersistFailure({ httpStatus: response.status, detail }),
    };
  }
  try {
    const record = firstRecord(await response.json());
    return record ? { status: "committed", record } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export type QirObservationReduction = {
  accepted: boolean;
  stale: boolean;
  run: QirAgentRun;
  recommendedStatus: QirRunStatus;
};

/**
 * Pure deterministic reducer used by the durable worker before compare-and-swap.
 * Stale observations are no-ops, so a late provider/tool callback can never
 * mutate the current action or artifact generation.
 */
export function reduceQirObservation(input: {
  run: QirAgentRun;
  observation: QirObservation;
  proofOfDoneStatus: ProofOfDoneStatus;
  latestVerification?: QirVerificationResult | null;
}): QirObservationReduction {
  const assessment = assessQirRunTransition({
    run: input.run,
    incomingObservation: input.observation,
    proofOfDoneStatus: input.proofOfDoneStatus,
    latestVerification: input.latestVerification || null,
  });
  if (!assessment.observationAccepted) {
    return { accepted: false, stale: assessment.staleObservation, run: input.run, recommendedStatus: input.run.status };
  }

  const now = input.observation.observedAt || new Date().toISOString();
  const steps = input.run.steps.map((step) => {
    if (step.stepId !== input.run.cursor.stepId) return step;
    if (input.observation.status === "failure") return { ...step, status: "failed_recoverable" as const };
    return { ...step, status: "succeeded" as const };
  });
  return {
    accepted: true,
    stale: false,
    recommendedStatus: assessment.recommendedStatus,
    run: {
      ...input.run,
      status: assessment.recommendedStatus,
      steps,
      observations: [...input.run.observations, input.observation],
      cursor: {
        ...input.run.cursor,
        attempt: input.observation.status === "failure" ? input.run.cursor.attempt + 1 : input.run.cursor.attempt,
      },
      updatedAt: now,
    },
  };
}

export async function persistQirObservation(input: {
  userSub: string;
  record: QirPersistedRun;
  observation: QirObservation;
  proofOfDoneStatus: ProofOfDoneStatus;
  latestVerification?: QirVerificationResult | null;
}): Promise<QirRunCommitResult | { status: "stale"; record: QirPersistedRun }> {
  const reduced = reduceQirObservation({
    run: input.record.run,
    observation: input.observation,
    proofOfDoneStatus: input.proofOfDoneStatus,
    latestVerification: input.latestVerification,
  });
  if (!reduced.accepted) return { status: "stale", record: input.record };
  return commitQirRunEvent({
    userSub: input.userSub,
    runId: reduced.run.runId,
    expectedVersion: input.record.storageVersion,
    eventId: input.observation.observationId,
    eventType: input.observation.status === "failure" ? "observation.failed" : "observation.succeeded",
    run: reduced.run,
    payload: {
      actionId: input.observation.actionId,
      artifactId: input.observation.artifactId || null,
      artifactGeneration: input.observation.artifactGeneration ?? null,
      kind: input.observation.kind,
    },
  });
}

/** Worker-resume packet comes from durable state alone, never transcript replay. */
export async function resumeQirRun(userSub: string, runId: string): Promise<{
  record: QirPersistedRun;
  continuation: ReturnType<typeof deriveQirContinuation>;
} | null> {
  const record = await readQirRun(userSub, runId);
  if (!record) return null;
  return { record, continuation: deriveQirContinuation(record.run) };
}
