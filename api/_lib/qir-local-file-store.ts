/*
 * DEV/PROOF-ONLY. NOT PRODUCTION STORAGE.
 *
 * qir-run-store.ts is the real durable store (Supabase-backed, optimistic
 * concurrency via a Postgres RPC). This file exists only so the Phase 1
 * kill/resume proof (scripts/qir-worker-crash-resume-proof.mjs) can exercise
 * the exact same QirDurableStorePort contract (api/_lib/qir-worker-runtime.ts)
 * without needing Supabase credentials in every developer's environment.
 *
 * It is NEVER imported by any request handler, by server.ts, or by anything
 * under src/. Nothing wires it into production. If that ever stops being
 * true, this comment is a lie — grep for the only intended importers:
 * scripts/qir-worker-crash-resume-proof.mjs and this file's own test.
 *
 * CRASH SAFETY, THE PART THAT MATTERS FOR THE PROOF:
 *
 * A commit is one fs.renameSync from a temp file onto the run's real path.
 * POSIX rename is atomic: a process killed at any point before the rename
 * leaves the old file completely intact, and a process killed after it
 * leaves the new file completely intact. There is no window where a reader
 * can observe a half-written file. That is the one property this whole
 * proof depends on, and it is the operating system's guarantee, not this
 * file's.
 *
 * Optimistic concurrency mirrors qir-run-store.ts exactly: every write
 * checks the caller's expectedVersion against the version on disk and
 * refuses (status: "conflict") rather than silently clobbering a newer
 * write it never saw.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { QirAgentRun } from "./qir-contracts.js";
import type {
  QirDurableStorePort,
  QirPersistedRunLike,
  QirRunCommitResultLike,
} from "./qir-worker-runtime.js";

type OnDiskRecord = {
  run: QirAgentRun;
  storageVersion: number;
  createdAt: string;
  updatedAt: string;
  committedEventIds: string[];
};

function runPath(dir: string, userSub: string, runId: string): string {
  // userSub/runId are only ever produced by this codebase's own id
  // generators (RUN_ID-shaped strings), never taken verbatim from a network
  // request in any real call site — but a proof store still refuses to
  // build a path outside its own directory, on principle.
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(dir, `${safe(userSub)}__${safe(runId)}.json`);
}

export function createLocalFileQirStore(dir: string): QirDurableStorePort {
  mkdirSync(dir, { recursive: true });

  return {
    kind: "local-file-dev-proof-only",

    async readRun(userSub, runId) {
      const path = runPath(dir, userSub, runId);
      if (!existsSync(path)) return null;
      try {
        const record: OnDiskRecord = JSON.parse(readFileSync(path, "utf8"));
        return {
          run: record.run,
          storageVersion: record.storageVersion,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };
      } catch {
        return null;
      }
    },

    async commitEvent(input): Promise<QirRunCommitResultLike> {
      const path = runPath(dir, input.userSub, input.runId);
      if (!existsSync(path)) return { status: "not_found" };

      let existing: OnDiskRecord;
      try {
        existing = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        return { status: "unavailable", diagnosis: { cause: "corrupt-local-file", remedy: "delete the proof store directory and re-run the proof" } };
      }

      // Idempotency FIRST, before the version check — this mirrors
      // commit_qir_run_event() in supabase/migrations/20260902093000_qir_durable_run_journal.sql
      // exactly (it checks qir_run_events for the eventId before checking
      // version). Getting this order backwards is a real defect this
      // module's own test caught: a retried commit of an eventId already
      // durably applied would be refused as "conflict" instead of replayed
      // as a no-op success, the moment ANY other event advanced the version
      // in between — which is exactly the ordinary case a retry exists for.
      if (existing.committedEventIds.includes(input.eventId)) {
        const record: QirPersistedRunLike = {
          run: existing.run,
          storageVersion: existing.storageVersion,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        };
        return { status: "committed", record };
      }

      if (existing.storageVersion !== input.expectedVersion) return { status: "conflict" };

      const updated: OnDiskRecord = {
        run: input.run,
        storageVersion: existing.storageVersion + 1,
        createdAt: existing.createdAt,
        updatedAt: input.run.updatedAt,
        committedEventIds: [...existing.committedEventIds, input.eventId],
      };

      const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(tmpPath, JSON.stringify(updated), "utf8");
      renameSync(tmpPath, path); // atomic on POSIX — see module doc comment

      return {
        status: "committed",
        record: {
          run: updated.run,
          storageVersion: updated.storageVersion,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      };
    },
  };
}

/** Test/proof-script helper: seed a brand-new run at version 1. */
export function seedLocalFileQirRun(dir: string, userSub: string, run: QirAgentRun): void {
  mkdirSync(dir, { recursive: true });
  const path = runPath(dir, userSub, run.runId);
  const record: OnDiskRecord = {
    run,
    storageVersion: 1,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    committedEventIds: [],
  };
  const tmpPath = `${path}.${process.pid}.${Date.now()}.seed.tmp`;
  writeFileSync(tmpPath, JSON.stringify(record), "utf8");
  renameSync(tmpPath, path);
}

/** Test/proof-script helper: read the raw on-disk record for assertions. */
export function readLocalFileQirRunRaw(dir: string, userSub: string, runId: string): OnDiskRecord | null {
  const path = runPath(dir, userSub, runId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Test/proof-script helper: wipe a proof directory clean between runs. */
export function clearLocalFileQirStore(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    try { unlinkSync(join(dir, entry)); } catch { /* best effort cleanup */ }
  }
}
