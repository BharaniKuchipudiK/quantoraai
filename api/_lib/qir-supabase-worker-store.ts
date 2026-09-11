/*
 * Production durable-store adapter for the standalone QIR worker.
 *
 * IMPORTANT: this file deliberately contains no Supabase/PostgREST logic of
 * its own. qir-run-store.ts is already the production authority for reading
 * durable Runs and committing versioned/idempotent journal events. The worker
 * must use that exact authority rather than grow a second persistence path.
 *
 * Nothing here starts a worker or changes browser/request ownership. It only
 * makes the existing production store satisfy QirDurableStorePort so a worker
 * process can be pointed at the same durable Run journal when explicitly
 * configured to do so.
 */

import { commitQirRunEvent, readQirRun } from "./qir-run-store.js";
import type {
  QirDurableStorePort,
  QirPersistedRunLike,
  QirRunCommitResultLike,
} from "./qir-worker-runtime.js";

type ProductionRunStoreBindings = {
  readRun(userSub: string, runId: string): Promise<QirPersistedRunLike | null>;
  commitEvent(input: {
    userSub: string;
    runId: string;
    expectedVersion: number;
    eventId: string;
    eventType: string;
    run: QirPersistedRunLike["run"];
    payload?: Record<string, unknown>;
  }): Promise<QirRunCommitResultLike>;
};

const productionBindings: ProductionRunStoreBindings = {
  readRun: readQirRun,
  commitEvent: commitQirRunEvent,
};

/**
 * Wrap the existing production QIR Run store behind the worker port.
 *
 * `bindings` exists only as a narrow test seam. Production callers should use
 * the default so the worker and request path share readQirRun /
 * commitQirRunEvent, including the same validation, CAS, event idempotency and
 * persistence diagnostics.
 */
export function createSupabaseQirWorkerStore(
  bindings: ProductionRunStoreBindings = productionBindings,
): QirDurableStorePort {
  return {
    kind: "supabase-qir-run-store",
    readRun: (userSub, runId) => bindings.readRun(userSub, runId),
    commitEvent: (input) => bindings.commitEvent(input),
  };
}
