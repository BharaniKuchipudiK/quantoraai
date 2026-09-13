import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverCodingChange, type CodingDeliveryAdapters } from './coding-delivery-orchestrator.js';

function adapters(overrides: Partial<CodingDeliveryAdapters> = {}): CodingDeliveryAdapters {
  let push = 0;
  const base: CodingDeliveryAdapters = {
    async verifyWorkspace() {
      return { ok: true, detail: 'tests, typecheck and build passed' };
    },
    async pushBranch() {
      push += 1;
      return {
        branch: 'quantora/work',
        headSha: push === 1 ? '1111111111111111111111111111111111111111' : '2222222222222222222222222222222222222222',
      };
    },
    async createPullRequest({ headSha }) {
      return { number: 42, headSha };
    },
    async waitForCi({ expectedHeadSha }) {
      return { status: 'passed', headSha: expectedHeadSha, detail: 'required checks passed' };
    },
    async repairAfterCiFailure() {
      return { repaired: true, detail: 'repaired failing test' };
    },
    async mergePullRequest() {
      return { merged: true, mergeSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
    },
    async waitForProductionDeployment({ mergeSha }) {
      return { ready: true, mergeSha, deploymentRef: 'dpl_123', detail: 'Vercel production READY' };
    },
    async verifyProduction() {
      return { ok: true, detail: 'production readiness passed' };
    },
  };
  return { ...base, ...overrides };
}

test('straight-through delivery reaches production verified and names evidence', async () => {
  const result = await deliverCodingChange(adapters(), { autonomousMergeApproved: true });
  assert.equal(result.ok, true);
  assert.equal(result.stage, 'PRODUCTION_VERIFIED');
  assert.equal(result.pullRequestNumber, 42);
  assert.equal(result.repairs, 0);
  assert.match(result.summary, /opened PR #42/);
  assert.match(result.summary, /CI passed/);
  assert.match(result.summary, /production is healthy/);
});

test('one CI failure can be repaired, reverified, repushed and then merged', async () => {
  let ciCalls = 0;
  const result = await deliverCodingChange(adapters({
    async waitForCi({ expectedHeadSha }) {
      ciCalls += 1;
      if (ciCalls === 1) return { status: 'failed', headSha: expectedHeadSha, detail: 'unit test failed' };
      return { status: 'passed', headSha: expectedHeadSha, detail: 'required checks passed' };
    },
  }), { autonomousMergeApproved: true, maxCiRepairs: 1 });

  assert.equal(result.ok, true);
  assert.equal(result.repairs, 1);
  assert.equal(ciCalls, 2);
  assert.match(result.summary, /CI failed once, I repaired it, CI passed/);
  assert.equal(result.headSha, '2222222222222222222222222222222222222222');
});

test('repository verification failure blocks every GitHub side effect', async () => {
  let pushed = false;
  const result = await deliverCodingChange(adapters({
    async verifyWorkspace() {
      return { ok: false, detail: 'npm test failed' };
    },
    async pushBranch() {
      pushed = true;
      throw new Error('must not run');
    },
  }), { autonomousMergeApproved: true });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'VERIFY');
  assert.equal(pushed, false);
});

test('moved PR head fails closed before merge', async () => {
  let mergeCalled = false;
  const result = await deliverCodingChange(adapters({
    async waitForCi() {
      return { status: 'passed', headSha: '9999999999999999999999999999999999999999', detail: 'checks passed on a different head' };
    },
    async mergePullRequest() {
      mergeCalled = true;
      throw new Error('must not merge');
    },
  }), { autonomousMergeApproved: true });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'CI');
  assert.equal(mergeCalled, false);
  assert.match(result.summary, /moved/);
});

test('green CI is still not enough without explicit autonomous merge approval', async () => {
  let mergeCalled = false;
  const result = await deliverCodingChange(adapters({
    async mergePullRequest() {
      mergeCalled = true;
      throw new Error('must not merge');
    },
  }), { autonomousMergeApproved: false });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'MERGE');
  assert.equal(mergeCalled, false);
  assert.match(result.summary, /not approved/);
});

test('deployment must be READY and correspond to the actual merge SHA', async () => {
  const wrongSha = await deliverCodingChange(adapters({
    async waitForProductionDeployment() {
      return {
        ready: true,
        mergeSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        deploymentRef: 'dpl_wrong',
        detail: 'READY but wrong commit',
      };
    },
  }), { autonomousMergeApproved: true });
  assert.equal(wrongSha.ok, false);
  assert.equal(wrongSha.stage, 'DEPLOY');
  assert.match(wrongSha.summary, /expected merge/);

  const notReady = await deliverCodingChange(adapters({
    async waitForProductionDeployment({ mergeSha }) {
      return { ready: false, mergeSha, deploymentRef: 'dpl_building', detail: 'Vercel still BUILDING' };
    },
  }), { autonomousMergeApproved: true });
  assert.equal(notReady.ok, false);
  assert.equal(notReady.stage, 'DEPLOY');
});

test('production smoke failure blocks the success claim after deployment', async () => {
  const result = await deliverCodingChange(adapters({
    async verifyProduction() {
      return { ok: false, detail: 'readiness gate returned 500' };
    },
  }), { autonomousMergeApproved: true });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'PRODUCTION_VERIFIED');
  assert.doesNotMatch(result.summary, /production is healthy/);
});

test('repair retries are bounded', async () => {
  let repairs = 0;
  const result = await deliverCodingChange(adapters({
    async waitForCi({ expectedHeadSha }) {
      return { status: 'failed', headSha: expectedHeadSha, detail: 'still failing' };
    },
    async repairAfterCiFailure() {
      repairs += 1;
      return { repaired: true, detail: 'repair attempted' };
    },
  }), { autonomousMergeApproved: true, maxCiRepairs: 1 });

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'CI');
  assert.equal(repairs, 1);
  assert.equal(result.repairs, 1);
});
