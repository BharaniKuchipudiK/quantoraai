import assert from "node:assert/strict";
import test from "node:test";
import { QIR_CONTRACT_VERSION, type QirAgentRun } from "./qir-contracts.js";
import { createSupabaseQirWorkerStore } from "./qir-supabase-worker-store.js";

function runSnapshot(runId = "run-worker-store-1"): QirAgentRun {
  const now = "2026-09-12T00:00:00.000Z";
  return {
    version: QIR_CONTRACT_VERSION,
    runId,
    goal: { statement: "prove the production worker store bridge", status: "confirmed" },
    status: "EXECUTING",
    steps: [{
      stepId: "step-1",
      taskId: "task-1",
      objective: "advance one durable step",
      dependsOn: [],
      status: "active",
      requiresVerification: false,
      actionId: "action-1",
    }],
    cursor: { stepId: "step-1", actionId: "action-1", attempt: 0 },
    artifacts: [],
    observations: [],
    verifications: [],
    checkpoints: [],
    budget: {
      runUnitsRemaining: 10,
      stepUnitsRemaining: 10,
      recoveryReserveRemaining: 2,
      premiumEscalationRemaining: 1,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function installSupabaseFetch(handler: (url: string, init: any) => Promise<any> | any) {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://qir-worker-store.example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  (globalThis as any).fetch = handler;
  return () => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  };
}

test("worker production adapter reads and commits through the existing QIR store contract", async () => {
  const run = runSnapshot();
  const requests: Array<{ url: string; init: any }> = [];
  const restore = installSupabaseFetch(async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url).includes("/rest/v1/qir_runs?")) {
      return {
        ok: true,
        status: 200,
        json: async () => [{
          version: 4,
          state: run,
          created_at: run.createdAt,
          updated_at: run.updatedAt,
        }],
      };
    }
    if (String(url).endsWith("/rest/v1/rpc/commit_qir_run_event")) {
      const committedRun = { ...run, updatedAt: "2026-09-12T00:01:00.000Z" };
      return {
        ok: true,
        status: 200,
        json: async () => [{
          version: 5,
          state: committedRun,
          created_at: committedRun.createdAt,
          updated_at: committedRun.updatedAt,
        }],
      };
    }
    throw new Error(`unexpected request ${url}`);
  });

  try {
    const store = createSupabaseQirWorkerStore();
    assert.equal(store.kind, "supabase-qir-run-store");

    const record = await store.readRun("user-1", run.runId);
    assert.equal(record?.storageVersion, 4);
    assert.equal(record?.run.runId, run.runId);

    const result = await store.commitEvent({
      userSub: "user-1",
      runId: run.runId,
      expectedVersion: 4,
      eventId: "action-1-observation-1",
      eventType: "observation.succeeded",
      run,
      payload: { actionId: "action-1", kind: "runtime" },
    });
    assert.equal(result.status, "committed");
    assert.equal(result.status === "committed" ? result.record.storageVersion : -1, 5);

    assert.equal(requests.length, 2);
    assert.match(requests[0].url, /qir_runs\?select=version,state,created_at,updated_at/);
    assert.equal(requests[0].init.method, "GET");
    assert.equal(requests[1].init.method, "POST");
    const body = JSON.parse(String(requests[1].init.body));
    assert.equal(body.p_user_sub, "user-1");
    assert.equal(body.p_run_id, run.runId);
    assert.equal(body.p_expected_version, 4);
    assert.equal(body.p_event_id, "action-1-observation-1");
    assert.equal(body.p_event_type, "observation.succeeded");
    assert.deepEqual(body.p_payload, { actionId: "action-1", kind: "runtime" });
  } finally {
    restore();
  }
});

test("worker production adapter preserves the production CAS conflict verdict", async () => {
  const run = runSnapshot("run-worker-store-conflict");
  const restore = installSupabaseFetch(async (url) => {
    if (!String(url).endsWith("/rest/v1/rpc/commit_qir_run_event")) throw new Error(`unexpected request ${url}`);
    return {
      ok: false,
      status: 409,
      text: async () => "qir_run_version_conflict",
    };
  });

  try {
    const result = await createSupabaseQirWorkerStore().commitEvent({
      userSub: "user-1",
      runId: run.runId,
      expectedVersion: 7,
      eventId: "event-conflict",
      eventType: "step.claimed",
      run,
    });
    assert.deepEqual(result, { status: "conflict" });
  } finally {
    restore();
  }
});

test("adapter test seam forwards worker inputs without creating a second persistence policy", async () => {
  const run = runSnapshot("run-worker-store-seam");
  let readArgs: string[] | null = null;
  let commitInput: any = null;
  const expectedRecord = {
    run,
    storageVersion: 3,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
  const store = createSupabaseQirWorkerStore({
    readRun: async (userSub, runId) => {
      readArgs = [userSub, runId];
      return expectedRecord;
    },
    commitEvent: async (input) => {
      commitInput = input;
      return { status: "committed", record: expectedRecord };
    },
  });

  assert.equal(await store.readRun("user-x", run.runId), expectedRecord);
  assert.deepEqual(readArgs, ["user-x", run.runId]);

  const input = {
    userSub: "user-x",
    runId: run.runId,
    expectedVersion: 3,
    eventId: "event-forwarded",
    eventType: "observation.succeeded",
    run,
    payload: { proof: true },
  };
  const result = await store.commitEvent(input);
  assert.equal(result.status, "committed");
  assert.deepEqual(commitInput, input);
});
