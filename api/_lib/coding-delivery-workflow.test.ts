import test from 'node:test';
import assert from 'node:assert/strict';
import { validCodingDeliveryInput } from '../../services/qir-workflow/delivery.js';
import { codingDeliveryPilotAllows } from '../../services/qir-workflow/delivery-policy.js';

const input = {
  userSub: 'pilot-user',
  runId: 'run-123',
  owner: 'acme',
  repo: 'widget',
  branch: 'quantora/fix-123',
  baseBranch: 'main',
  title: 'Fix the production bug',
  body: 'Verified by Quantora before delivery.',
  vercelProject: 'widget-web',
  vercelTeamId: 'team_123',
};

const enabledEnv = {
  QIR_DELIVERY_PILOT_ENABLED: 'true',
  QIR_DELIVERY_PILOT_REPO: 'acme/widget',
  QIR_DELIVERY_PILOT_VERCEL_PROJECT: 'widget-web',
} as NodeJS.ProcessEnv;

test('delivery input requires durable identity, repository, branch and Vercel project', () => {
  assert.equal(validCodingDeliveryInput(input), true);
  for (const key of ['userSub', 'runId', 'owner', 'repo', 'branch', 'title', 'vercelProject'] as const) {
    assert.equal(validCodingDeliveryInput({ ...input, [key]: '' }), false, `${key} must be required`);
  }
});

test('autonomous delivery is disabled without explicit user consent', () => {
  assert.equal(codingDeliveryPilotAllows(input, false, enabledEnv), false);
  assert.equal(codingDeliveryPilotAllows(input, true, {} as NodeJS.ProcessEnv), false);
  assert.equal(codingDeliveryPilotAllows(input, true, { ...enabledEnv, QIR_DELIVERY_PILOT_ENABLED: 'false' }), false);
});

test('stored Auto Deliver consent plus the exact configured target is required', () => {
  assert.equal(codingDeliveryPilotAllows(input, true, enabledEnv), true);
  assert.equal(codingDeliveryPilotAllows({ ...input, userSub: 'someone-else' }, true, enabledEnv), true,
    'user identity is authorized by stored consent, not an environment pin');
  assert.equal(codingDeliveryPilotAllows({ ...input, repo: 'other' }, true, enabledEnv), false);
  assert.equal(codingDeliveryPilotAllows({ ...input, vercelProject: 'other-web' }, true, enabledEnv), false);
});

test('Auto PR never implies Auto Deliver', () => {
  const autoPrEnabled = true;
  const autoDeliverEnabled = false;
  assert.equal(autoPrEnabled, true);
  assert.equal(codingDeliveryPilotAllows(input, autoDeliverEnabled, enabledEnv), false);
});

test('missing target scope variables fail closed even when user consent is on', () => {
  assert.equal(codingDeliveryPilotAllows(input, true, { QIR_DELIVERY_PILOT_ENABLED: 'true' } as NodeJS.ProcessEnv), false);
});
