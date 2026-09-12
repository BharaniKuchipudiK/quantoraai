import { randomUUID } from 'node:crypto';
import { createSupabaseQirWorkerStore } from '../../api/_lib/qir-supabase-worker-store.js';
import { createSupabaseQirWorkerLeaseStore } from '../../api/_lib/qir-worker-lease.js';
import { runWithQirWorkerLease } from '../../api/_lib/qir-worker-lease-runtime.js';
import { stepQirRunOnce } from '../../api/_lib/qir-worker-runtime.js';
import { createQirServerCodingExecutor } from '../../api/_lib/qir-server-coding-executor.js';
import { createQirGatewayRunner } from '../../api/_lib/qir-gateway-model.js';
import { readQirWorkingContext } from '../../api/_lib/qir-context-state.js';

export function pilotAllows(userSub: string, runId: string, env = process.env): boolean {
  return env.QIR_WORKFLOW_PILOT_ENABLED === 'true'
    && Boolean(env.QIR_PILOT_USER_SUB && env.QIR_PILOT_RUN_ID && env.QIR_AI_GATEWAY_API_KEY?.trim())
    && Boolean(env.QIR_WORKER_MODEL?.includes('/') && String(env.QIR_GATEWAY_MODELS || '').split(',').map(v => v.trim()).includes(env.QIR_WORKER_MODEL))
    && userSub === env.QIR_PILOT_USER_SUB && runId === env.QIR_PILOT_RUN_ID;
}

export async function runPilotTransition(userSub: string, runId: string) {
  if (!pilotAllows(userSub, runId)) return 'disabled';
  const store = createSupabaseQirWorkerStore();
  const leased = await runWithQirWorkerLease({
    leaseStore: createSupabaseQirWorkerLeaseStore(), userSub, runId,
    workerId: 'vercel-workflow-pilot', leaseToken: randomUUID(), ttlMs: 30_000, heartbeatMs: 10_000,
    run: async ({ signal }) => {
      const record = await store.readRun(userSub, runId);
      if (!record) return 'retry';
      const context = readQirWorkingContext(record.run);
      if (context?.projectState?.executionOwner !== 'server') return 'disabled';
      const result = await stepQirRunOnce(store, createQirServerCodingExecutor({
        modelId: process.env.QIR_WORKER_MODEL,
        modelRunner: createQirGatewayRunner(), maxRepairAttempts: 1,
      }), userSub, runId, signal);
      if (result.status === 'conflict' || result.status === 'unavailable') return 'retry';
      if (result.status === 'no-run') return 'retry';
      return result.status === 'stopped' ? result.run.status : 'advanced';
    },
  });
  return leased.status === 'completed' ? leased.result : 'retry';
}
