import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { QIR_CONTRACT_VERSION, type QirAgentRun } from "./qir-contracts.js";
import {
  type QirWorkflowAdapter,
  type QirWorkflowResult,
  type QirWorkflowSignal,
} from "./qir-workflow-adapter.js";
import { cancelQirCodingRun, pauseQirCodingRun, resumeQirCodingRun, qirRunHasStopped } from "./qir-coding-runtime.js";

/**
 * ---------------------------------------------------------------------------
 * THE CONFORMANCE SUITE FOR ANY QIR WORKFLOW ENGINE.
 *
 * Phase 2 requires "a workflow-engine adapter boundary so the rest of QIR is
 * not coupled to one vendor". A boundary is only real if a second vendor can be
 * held to it, so the promises are asserted HERE — against an adapter, never
 * against one implementation's internals.
 *
 * runQirWorkflowConformance is exported so a Temporal adapter is measured by
 * exactly these assertions on the day it is written. Without that, the
 * interface is a shape with no meaning: two engines could both satisfy the
 * types and disagree about whether cancelling twice is an error.
 *
 * It runs below against an in-memory engine rather than the in-process one,
 * deliberately. The in-process adapter talks to Supabase, so testing only that
 * would test the network. A second implementation is also the only honest proof
 * that the contract is implementable by something OTHER than the code it was
 * extracted from — which is the entire claim being made.
 * ---------------------------------------------------------------------------
 */

function runFixture(overrides: Partial<QirAgentRun> = {}): QirAgentRun {
  return {
    version: QIR_CONTRACT_VERSION,
    runId: "workflow-conformance-run",
    goal: { statement: "Build a storefront", status: "confirmed" },
    status: "EXECUTING",
    steps: [{
      stepId: "render",
      taskId: "coding.render",
      objective: "Render the storefront",
      dependsOn: [],
      status: "active",
      requiresVerification: true,
      actionId: "action-1",
    }],
    cursor: { stepId: "render", actionId: "action-1", attempt: 0 },
    artifacts: [{
      artifactId: "coding-desk-vfs",
      generation: 1,
      ref: "vfs://candidate/1",
      state: "candidate",
      createdByActionId: "action-1",
      verifiedByActionId: null,
    }],
    observations: [],
    verifications: [],
    checkpoints: [],
    budget: {
      runUnitsRemaining: 100,
      stepUnitsRemaining: 40,
      recoveryReserveRemaining: 20,
      premiumEscalationRemaining: 5,
    },
    createdAt: "2026-09-04T09:00:00.000Z",
    updatedAt: "2026-09-04T09:00:00.000Z",
    ...overrides,
  };
}

/**
 * A second engine. It shares the pure transitions — which are the CONTRACT, not
 * an implementation detail — and owns its own storage and versioning, exactly
 * as a Temporal adapter would.
 */
function inMemoryAdapter(): QirWorkflowAdapter {
  const runs = new Map<string, { run: QirAgentRun; storageVersion: number }>();
  const key = (userSub: string, runId: string) => `${userSub}::${runId}`;

  const describe = (userSub: string, runId: string): QirWorkflowResult => {
    const record = runs.get(key(userSub, runId));
    if (!record) return { status: "not-found" };
    return {
      status: "ok",
      state: {
        run: record.run,
        storageVersion: record.storageVersion,
        continuation: record.run.status === "EXECUTING" && record.run.steps.some((s) => s.status === "active")
          ? { stepId: record.run.cursor.stepId as string, taskId: "coding.render", actionId: record.run.cursor.actionId }
          : null,
      },
    };
  };

  return {
    engine: "in-memory-conformance",
    async startRun(userSub, run) {
      runs.set(key(userSub, run.runId), { run, storageVersion: 1 });
      return { status: "ok", state: { run, storageVersion: 1, continuation: null } };
    },
    async describeRun(userSub, runId) {
      return describe(userSub, runId);
    },
    async signalRun(userSub, runId, signal, options = {}) {
      const record = runs.get(key(userSub, runId));
      if (!record) return { status: "not-found" };
      const now = options.now || new Date().toISOString();

      if (signal === "resume" && record.run.status !== "PAUSED") {
        return { status: "not-paused", runStatus: record.run.status };
      }
      if (signal !== "resume" && qirRunHasStopped(record.run)) {
        return { status: "already-stopped", runStatus: record.run.status };
      }
      if (signal === "pause" && record.run.status === "PAUSED") return describe(userSub, runId);

      const next = signal === "pause"
        ? pauseQirCodingRun(record.run, now)
        : signal === "resume"
          ? resumeQirCodingRun(record.run, now)
          : cancelQirCodingRun(record.run, now);
      runs.set(key(userSub, runId), { run: next, storageVersion: record.storageVersion + 1 });
      return describe(userSub, runId);
    },
  };
}

/** The promises every QIR workflow engine must keep. */
export function runQirWorkflowConformance(
  label: string,
  makeAdapter: () => QirWorkflowAdapter,
) {
  const start = async (adapter: QirWorkflowAdapter, run = runFixture()) => {
    const created = await adapter.startRun("user-1", run);
    assert.equal(created.status, "ok", "an engine must be able to start a run");
    return run;
  };
  const expectOk = (result: QirWorkflowResult) => {
    assert.equal(result.status, "ok", `expected ok, got ${JSON.stringify(result)}`);
    return result.status === "ok" ? result.state : null as never;
  };

  test(`${label}: reports which engine it is`, () => {
    assert.ok(makeAdapter().engine.length > 0, "an engine that will not name itself cannot be diagnosed");
  });

  test(`${label}: an unknown run is not-found, never an empty success`, async () => {
    const adapter = makeAdapter();
    assert.equal((await adapter.describeRun("user-1", "no-such-run")).status, "not-found");
    assert.equal((await adapter.signalRun("user-1", "no-such-run", "pause")).status, "not-found");
  });

  test(`${label}: a run belongs to its owner`, async () => {
    // Cross-tenant reads are the failure that matters most here, so it is a
    // contract promise rather than a property of one store's row policy.
    const adapter = makeAdapter();
    const run = await start(adapter);
    assert.equal((await adapter.describeRun("user-2", run.runId)).status, "not-found");
  });

  test(`${label}: pause stops the run and withdraws its continuation`, async () => {
    const adapter = makeAdapter();
    const run = await start(adapter);
    const paused = expectOk(await adapter.signalRun("user-1", run.runId, "pause"));
    assert.equal(paused.run.status, "PAUSED");
    assert.equal(paused.continuation, null, "a paused run must offer nowhere to resume, or a worker takes it");
  });

  test(`${label}: pause is idempotent`, async () => {
    // A double-click, a retry after a dropped response, two tabs. The caller
    // asked for it to be paused and it is paused.
    const adapter = makeAdapter();
    const run = await start(adapter);
    await adapter.signalRun("user-1", run.runId, "pause");
    const again = await adapter.signalRun("user-1", run.runId, "pause");
    assert.equal(again.status, "ok");
  });

  test(`${label}: resume returns the run to work and restores a continuation`, async () => {
    const adapter = makeAdapter();
    const run = await start(adapter);
    await adapter.signalRun("user-1", run.runId, "pause");
    const resumed = expectOk(await adapter.signalRun("user-1", run.runId, "resume"));
    assert.equal(resumed.run.status, "EXECUTING");
    assert.ok(resumed.continuation, "resuming must give a worker somewhere to go");
  });

  test(`${label}: resuming a run that is not paused is refused by name`, async () => {
    // Not silently ignored: it means the caller believes something false.
    const adapter = makeAdapter();
    const run = await start(adapter);
    const refused = await adapter.signalRun("user-1", run.runId, "resume");
    assert.equal(refused.status, "not-paused");
  });

  test(`${label}: cancel is terminal and rejects the candidate`, async () => {
    const adapter = makeAdapter();
    const run = await start(adapter);
    const cancelled = expectOk(await adapter.signalRun("user-1", run.runId, "cancel", { reason: "user stopped it" }));
    assert.equal(cancelled.run.status, "FAILED_TERMINAL");
    assert.equal(cancelled.continuation, null);
    assert.equal(
      cancelled.run.artifacts.some((artifact) => artifact.state === "candidate"),
      false,
      "a surviving candidate blocks the next run the user starts",
    );
  });

  test(`${label}: a stopped run cannot be stopped again`, async () => {
    const adapter = makeAdapter();
    const run = await start(adapter);
    await adapter.signalRun("user-1", run.runId, "cancel");
    assert.equal((await adapter.signalRun("user-1", run.runId, "cancel")).status, "already-stopped");
    assert.equal((await adapter.signalRun("user-1", run.runId, "pause")).status, "already-stopped");
  });

  test(`${label}: a paused run can still be cancelled`, async () => {
    // Paused is not stopped. Missing this would strand a user who paused a run
    // and then decided to abandon it.
    const adapter = makeAdapter();
    const run = await start(adapter);
    await adapter.signalRun("user-1", run.runId, "pause");
    const cancelled = expectOk(await adapter.signalRun("user-1", run.runId, "cancel"));
    assert.equal(cancelled.run.status, "FAILED_TERMINAL");
  });

  test(`${label}: every signal advances the storage version`, async () => {
    // Whatever the engine, a signal that changes the run must be observable as
    // a new version, or a concurrent writer cannot detect it moved.
    const adapter = makeAdapter();
    const run = await start(adapter);
    const before = expectOk(await adapter.describeRun("user-1", run.runId)).storageVersion;
    const after = expectOk(await adapter.signalRun("user-1", run.runId, "pause")).storageVersion;
    assert.ok(after > before, `version must advance: ${before} -> ${after}`);
  });
}

runQirWorkflowConformance("in-memory engine", inMemoryAdapter);

/*
 * The boundary is only worth having if the rest of QIR actually goes through
 * it. These two guard that, because an adapter nobody calls is the same defect
 * as the cost meter and the Context Manager before it.
 */
const ROUTE = readFileSync(path.join(import.meta.dirname, "..", "qir-runs.ts"), "utf8");

test("the route signals the engine rather than mutating runs itself", () => {
  assert.match(ROUTE, /qirWorkflowAdapter\(\)\.signalRun\(/, "lifecycle signals must cross the boundary");
  const code = ROUTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const transition of ["pauseQirCodingRun", "resumeQirCodingRun", "cancelQirCodingRun"]) {
    assert.doesNotMatch(
      code,
      new RegExp(`${transition}\\s*\\(`),
      `${transition} belongs to the engine — the route calling it directly is the coupling this boundary removes`,
    );
  }
});

test("every signal the adapter accepts is reachable from the route", () => {
  // A signal the engine implements and no caller can send is dead weight.
  const signals: QirWorkflowSignal[] = ["pause", "resume", "cancel"];
  for (const signal of signals) {
    assert.match(ROUTE, new RegExp(`"coding\\.${signal}"`), `coding.${signal} must be routable`);
  }
});
