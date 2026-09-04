import {
  cancelQirCodingRun,
  pauseQirCodingRun,
  qirRunHasStopped,
  resumeQirCodingRun,
} from "./qir-coding-runtime.js";
import { commitQirRunEvent, createQirRun, resumeQirRun } from "./qir-run-store.js";
import { deriveQirContinuation } from "./qir-contracts.js";
import type { QirAgentRun } from "./qir-contracts.js";
import { randomUUID } from "node:crypto";

/**
 * ---------------------------------------------------------------------------
 * THE WORKFLOW-ENGINE BOUNDARY (QIR Phase 2)
 *
 * The architecture document is specific about what is required here, and it is
 * NOT a Temporal integration:
 *
 *   "The first implementation should evaluate Temporal with the TypeScript SDK
 *    as the default durable workflow engine ... The architecture must keep a
 *    workflow-engine adapter boundary so the rest of QIR is not coupled to one
 *    vendor."
 *
 * So the deliverable is the seam. Today the engine is Quantora's own request
 * handler: a client calls /api/qir-runs, pure reducers compute the next Run,
 * and qir-run-store commits it against an expected version. That is a real
 * durable engine — it survives worker loss, which the deployed durability gate
 * proves against the actual journal — it is simply an in-process one.
 *
 * WHY A BOUNDARY WITH ONE IMPLEMENTATION IS NOT AUTOMATICALLY DECORATION.
 *
 * This repository keeps deleting code that was "written, tested, and connected
 * to nothing" — the cost meter, the Context Manager, the Resource Governor. An
 * interface with a single implementation and no consumer would be the same
 * defect wearing an architectural hat, so two things are deliberately true:
 *
 *   1. It is LOAD-BEARING. /api/qir-runs routes its lifecycle operations
 *      through this adapter rather than reaching for the store directly, so
 *      the boundary is on the live path and cannot rot unnoticed.
 *   2. It is HELD TO A CONFORMANCE SUITE. The contract below is asserted
 *      against an adapter, not against this file's implementation details, so
 *      a Temporal adapter is held to exactly the same promises on the day it
 *      is written. That suite is the part a second vendor actually needs.
 *
 * WHAT DELIBERATELY DOES NOT CROSS THIS BOUNDARY. Model attempts, observations,
 * recovery and promotion stay in the route: those carry request-scoped concerns
 * — the verifier, the artifact bytes, spend — and pretending an engine owns them
 * would be a bigger lie than the coupling it removed. What an engine genuinely
 * owns is the LIFECYCLE: start a run, signal it, ask where it is.
 * ---------------------------------------------------------------------------
 */

export type QirWorkflowSignal = "pause" | "resume" | "cancel";

export type QirWorkflowState = {
  run: QirAgentRun;
  storageVersion: number;
  /** Where a worker would pick this Run up, or null when there is nowhere. */
  continuation: { stepId: string; taskId: string; actionId: string | null } | null;
};

/*
 * A STRING discriminant on every member, matching QirRunCommitResult next door.
 *
 * The first draft used `ok: true | false`. This project compiles without
 * `strict`, and without strictNullChecks a boolean discriminant does not narrow
 * — every branch still saw the whole union, so `result.state` failed to compile
 * inside the very case that guarantees it. A shared string tag narrows under
 * this repo's real compiler settings, which is the only setting that counts
 * (§3: measure with the project's own command).
 */
export type QirWorkflowResult =
  | { status: "ok"; state: QirWorkflowState }
  | { status: "not-found" }
  | { status: "already-stopped"; runStatus: QirAgentRun["status"] }
  | { status: "not-paused"; runStatus: QirAgentRun["status"] }
  | { status: "conflict"; state: QirWorkflowState }
  | { status: "unavailable"; diagnosis: { cause: string; remedy: string } | null };

export interface QirWorkflowAdapter {
  /** Which engine is executing runs. Reported, never inferred. */
  readonly engine: string;
  startRun(userSub: string, run: QirAgentRun): Promise<QirWorkflowResult>;
  describeRun(userSub: string, runId: string): Promise<QirWorkflowResult>;
  signalRun(
    userSub: string,
    runId: string,
    signal: QirWorkflowSignal,
    options?: { reason?: string; now?: string },
  ): Promise<QirWorkflowResult>;
}

/*
 * Signals are pure transitions plus a guard, so the table says what each one
 * refuses and why. Keeping them in one place is what lets a second engine
 * implement the same refusals rather than inventing its own.
 */
const SIGNALS: Record<QirWorkflowSignal, {
  eventType: string;
  guard: (run: QirAgentRun) => QirWorkflowResult | null;
  apply: (run: QirAgentRun, now: string, reason: string) => QirAgentRun;
  payload: (run: QirAgentRun, next: QirAgentRun, reason: string) => Record<string, unknown>;
}> = {
  pause: {
    eventType: "coding.paused",
    guard: (run) => (qirRunHasStopped(run) ? { status: "already-stopped", runStatus: run.status } : null),
    apply: (run, now) => pauseQirCodingRun(run, now),
    payload: (run) => ({ pausedFrom: run.status }),
  },
  resume: {
    eventType: "coding.resumed",
    guard: (run) => (run.status === "PAUSED" ? null : { status: "not-paused", runStatus: run.status }),
    apply: (run, now) => resumeQirCodingRun(run, now),
    payload: (_run, next) => ({ resumedTo: next.status }),
  },
  cancel: {
    eventType: "coding.cancelled",
    guard: (run) => (qirRunHasStopped(run) ? { status: "already-stopped", runStatus: run.status } : null),
    apply: (run, now) => cancelQirCodingRun(run, now),
    payload: (run, _next, reason) => ({ cancelledFrom: run.status, reason }),
  },
};

function stateFrom(
  resumed: Awaited<ReturnType<typeof resumeQirRun>>,
): QirWorkflowState | null {
  if (!resumed?.record) return null;
  return {
    run: resumed.record.run,
    storageVersion: resumed.record.storageVersion,
    continuation: resumed.continuation,
  };
}

/**
 * The engine Quantora runs today: its own request handler over the durable
 * journal. Named honestly rather than as a placeholder — this is what executes
 * runs in production, and a deployed gate proves a Run written by one worker is
 * resumed by another against the real database.
 */
export function inProcessQirWorkflowAdapter(): QirWorkflowAdapter {
  return {
    engine: "quantora-in-process",

    async startRun(userSub, run) {
      const created = await createQirRun(userSub, run);
      if (created.status !== "created") {
        return { status: "unavailable", diagnosis: created.diagnosis || null };
      }
      return {
        status: "ok",
        state: {
          run: created.record.run,
          storageVersion: created.record.storageVersion,
          continuation: null,
        },
      };
    },

    async describeRun(userSub, runId) {
      const state = stateFrom(await resumeQirRun(userSub, runId));
      return state ? { status: "ok", state } : { status: "not-found" };
    },

    async signalRun(userSub, runId, signal, options = {}) {
      const current = stateFrom(await resumeQirRun(userSub, runId));
      if (!current) return { status: "not-found" };

      const rule = SIGNALS[signal];
      const refusal = rule.guard(current.run);
      if (refusal) return refusal;

      /*
       * Idempotent where repeating the signal is what the caller already asked
       * for. A double-click, a retry after a dropped response, or two tabs
       * pausing the same Run is not an error — it is already paused. Cancel
       * gets this through already-stopped; resume cannot, because resuming a
       * running Run is a genuine mistake worth naming.
       */
      if (signal === "pause" && current.run.status === "PAUSED") {
        return { status: "ok", state: current };
      }

      const now = options.now || new Date().toISOString();
      const reason = options.reason || "Cancelled by the user.";
      const next = rule.apply(current.run, now, reason);
      const commit = await commitQirRunEvent({
        userSub,
        runId,
        expectedVersion: current.storageVersion,
        eventId: `coding-${signal}-${randomUUID()}`,
        eventType: rule.eventType,
        run: next,
        payload: rule.payload(current.run, next, reason),
      });

      if (commit.status === "not_found") return { status: "not-found" };
      if (commit.status === "unavailable") {
        return { status: "unavailable", diagnosis: commit.diagnosis || null };
      }
      if (commit.status === "conflict") {
        /*
         * Somebody else advanced this Run between the read and the write. The
         * caller is handed the CURRENT state rather than a bare marker, so it
         * can decide whether its signal still applies instead of guessing.
         */
        const fresh = stateFrom(await resumeQirRun(userSub, runId));
        return fresh
          ? { status: "conflict", state: fresh }
          : { status: "not-found" };
      }
      return {
        status: "ok",
        state: {
          run: commit.record.run,
          storageVersion: commit.record.storageVersion,
          continuation: deriveQirContinuation(commit.record.run),
        },
      };
    },
  };
}

/**
 * The engine in use. A single seam so swapping vendors is one edit here rather
 * than a search across the route surface — which is the whole point of the
 * boundary the architecture asks for.
 */
export function qirWorkflowAdapter(): QirWorkflowAdapter {
  return inProcessQirWorkflowAdapter();
}
