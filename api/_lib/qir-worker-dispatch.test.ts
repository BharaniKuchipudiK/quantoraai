import assert from 'node:assert/strict';
import test from 'node:test';
import { runQirWorkerDispatchCycle } from './qir-worker-dispatch.js';
import type { QirWorkerLeasePort } from './qir-worker-lease.js';

function leaseStore(busyRunId = ''): QirWorkerLeasePort {
  return {
    kind: 'fake',
    async claim(input) {
      if (input.runId === busyRunId) {
        return {
          status: 'busy',
          lease: {
            workerId: 'other',
            leaseToken: 'other-token',
            leasedUntil: new Date(Date.now() + 60_000).toISOString(),
            heartbeatAt: new Date().toISOString(),
          },
        };
      }
      return {
        status: 'acquired',
        lease: {
          workerId: input.workerId,
          leaseToken: input.leaseToken,
          leasedUntil: new Date(Date.now() + input.ttlMs).toISOString(),
          heartbeatAt: new Date().toISOString(),
        },
      };
    },
    async heartbeat(input) {
      return {
        status: 'renewed',
        lease: {
          workerId: input.workerId,
          leaseToken: input.leaseToken,
          leasedUntil: new Date(Date.now() + input.ttlMs).toISOString(),
          heartbeatAt: new Date().toISOString(),
        },
      };
    },
    async release() { return { status: 'released' }; },
  };
}

test('dispatch cycle leases and drives each discovered run, skipping a busy run', async () => {
  const driven: string[] = [];
  const result = await runQirWorkerDispatchCycle({
    listRunnableRuns: async () => [
      { userSub: 'u1', runId: 'run-1', updatedAt: '2026-09-12T00:00:00Z' },
      { userSub: 'u1', runId: 'run-2', updatedAt: '2026-09-12T00:00:01Z' },
    ],
    leaseStore: leaseStore('run-2'),
    workerId: 'worker-a',
    ttlMs: 30_000,
    heartbeatMs: 10_000,
    leaseToken: () => 'lease-token',
    driveRun: async (ref) => { driven.push(ref.runId); },
  });

  assert.deepEqual(driven, ['run-1']);
  assert.deepEqual(result, {
    discovered: 2,
    acquired: 1,
    busy: 1,
    completed: 1,
    failed: 0,
  });
});

test('an unavailable discovery is visible as a failed cycle instead of an empty queue', async () => {
  const result = await runQirWorkerDispatchCycle({
    listRunnableRuns: async () => null,
    leaseStore: leaseStore(),
    workerId: 'worker-a',
    ttlMs: 30_000,
    heartbeatMs: 10_000,
    driveRun: async () => { throw new Error('must not run'); },
  });
  assert.equal(result.discovered, 0);
  assert.equal(result.failed, 1);
});
