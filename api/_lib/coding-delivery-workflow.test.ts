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
  QIR_DELIVERY_PILOT_USER_SUB: 'pilot-user',
  QIR_DELIVERY_PILOT_REPO: 'acme/widget',
  QIR_DELIVERY_PILOT_VERCEL_PROJECT: 'widget-web',
} as NodeJS.ProcessEnv;

test('delivery input requires durable identity, repository, branch and Vercel project', () => {
  assert.equal(validCodingDeliveryInput(input), true);
  for (const key of ['userSub', 'runId', 'owner', 'repo', 'branch', 'title', 'vercelProject'] as const) {
    assert.equal(validCodingDeliveryInput({ ...input, [key]: '' }), false, `${key} must be required`);
  }
});

test('autonomous delivery is disabled by default', () => {
  assert.equal(codingDeliveryPilotAllows(input, {} as NodeJS.ProcessEnv), false);
  assert.equal(codingDeliveryPilotAllows(input, { ...enabledEnv, QIR_DELIVERY_PILOT_ENABLED: 'false' }), false);
});

test('pilot requires the exact configured user, repository and deployment project', () => {
  assert.equal(codingDeliveryPilotAllows(input, enabledEnv), true);
  assert.equal(codingDeliveryPilotAllows({ ...input, userSub: 'someone-else' }, enabledEnv), false);
  assert.equal(codingDeliveryPilotAllows({ ...input, repo: 'other' }, enabledEnv), false);
  assert.equal(codingDeliveryPilotAllows({ ...input, vercelProject: 'other-web' }, enabledEnv), false);
});

test('missing scope variables fail closed even when the enable flag is true', () => {
  assert.equal(codingDeliveryPilotAllows(input, { QIR_DELIVERY_PILOT_ENABLED: 'true' } as NodeJS.ProcessEnv), false);
});
