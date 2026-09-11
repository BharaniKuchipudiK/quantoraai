import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLocalFileQirStore,
  seedLocalFileQirRun,
  readLocalFileQirRunRaw,
} from "./qir-local-file-store.js";
import type { QirAgentRun } from "./qir-contracts.js";
import { QIR_CONTRACT_VERSION } from "./qir-contracts.js";

function minimalRun(runId: string): QirAgentRun {
  const now = new Date().toISOString();
  return {
    version: QIR_CONTRACT_VERSION,
    runId,
    goal: { statement: "unit test run", status: "confirmed" },
    status: "EXECUTING",
    steps: [{
      stepId: "s0",
      taskId: "t0",
      objective: "do the one thing",
      dependsOn: [],
      status: "pending",
      requiresVerification: false,
      actionId: null,
    }],
    cursor: { stepId: null, actionId: null, attempt: 0 },
    artifacts: [],
    observations: [],
    verifications: [],
    checkpoints: [],
    budget: { runUnitsRemaining: 10, stepUnitsRemaining: 10, recoveryReserveRemaining: 1, premiumEscalationRemaining: 1 },
    createdAt: now,
    updatedAt: now,
  };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "qir-local-file-store-unit-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("readRun returns null for a run that was never seeded", async () => {
  await withTempDir(async (dir) => {
    const store = createLocalFileQirStore(dir);
    const result = await store.readRun("u1", "does-not-exist");
    assert.equal(result, null);
  });
});

test("commitEvent rejects a stale expectedVersion instead of clobbering a newer write", async () => {
  await withTempDir(async (dir) => {
    const store = createLocalFileQirStore(dir);
    const run = minimalRun("run-conflict");
    seedLocalFileQirRun(dir, "u1", run);

    const first = await store.commitEvent({
      userSub: "u1",
      runId: "run-conflict",
      expectedVersion: 1,
      eventId: "event-a",
      eventType: "observation.succeeded",
      run: { ...run, status: "COMPLETE" },
    });
    assert.equal(first.status, "committed");

    // Someone else's write already moved the version to 2; a second commit
    // that still believes it is at version 1 must be refused, not applied.
    const stale = await store.commitEvent({
      userSub: "u1",
      runId: "run-conflict",
      expectedVersion: 1,
      eventId: "event-b",
      eventType: "observation.succeeded",
      run: { ...run, status: "FAILED_TERMINAL" },
    });
    assert.equal(stale.status, "conflict");

    const onDisk = readLocalFileQirRunRaw(dir, "u1", "run-conflict");
    assert.equal(onDisk?.run.status, "COMPLETE", "the accepted write's status stands; the conflicting write never lands");
  });
});

test("commitEvent replaying an already-committed eventId is a no-op success, not a second write", async () => {
  await withTempDir(async (dir) => {
    const store = createLocalFileQirStore(dir);
    const run = minimalRun("run-idempotent");
    seedLocalFileQirRun(dir, "u1", run);

    const first = await store.commitEvent({
      userSub: "u1",
      runId: "run-idempotent",
      expectedVersion: 1,
      eventId: "event-once",
      eventType: "observation.succeeded",
      run: { ...run, status: "EXECUTING" },
    });
    assert.equal(first.status, "committed");
    const versionAfterFirst = first.status === "committed" ? first.record.storageVersion : -1;

    // Replaying the SAME eventId (e.g. a retried commit after a crash right
    // after the rename but before the caller observed success) must not
    // advance the version a second time or apply a second mutation.
    const replay = await store.commitEvent({
      userSub: "u1",
      runId: "run-idempotent",
      expectedVersion: 1,
      eventId: "event-once",
      eventType: "observation.succeeded",
      run: { ...run, status: "FAILED_TERMINAL" }, // even if the caller's payload differs, it must not apply
    });
    assert.equal(replay.status, "committed");
    assert.equal(
      replay.status === "committed" ? replay.record.storageVersion : -1,
      versionAfterFirst,
      "the replayed commit does not advance the version",
    );

    const onDisk = readLocalFileQirRunRaw(dir, "u1", "run-idempotent");
    assert.equal(onDisk?.run.status, "EXECUTING", "the original committed run is untouched by the replay");
    assert.equal(onDisk?.committedEventIds.filter((id) => id === "event-once").length, 1, "the eventId is recorded exactly once");
  });
});

test("commitEvent against a run that was never seeded returns not_found", async () => {
  await withTempDir(async (dir) => {
    const store = createLocalFileQirStore(dir);
    const result = await store.commitEvent({
      userSub: "u1",
      runId: "never-seeded",
      expectedVersion: 1,
      eventId: "event-a",
      eventType: "observation.succeeded",
      run: minimalRun("never-seeded"),
    });
    assert.equal(result.status, "not_found");
  });
});
