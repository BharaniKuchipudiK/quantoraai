import assert from 'node:assert/strict';
import test from 'node:test';
import { pilotAllows } from '../../services/qir-workflow/transition.js';
const env = {
  QIR_WORKFLOW_PILOT_ENABLED: 'true', QIR_PILOT_USER_SUB: 'pilot-user', QIR_PILOT_RUN_ID: 'pilot-run',
  QIR_AI_GATEWAY_API_KEY: 'local-test-only', QIR_WORKER_MODEL: 'test/model', QIR_GATEWAY_MODELS: 'test/model',
};
test('pilot is pinned to one user and run and requires explicit, budgeted routing', () => {
  assert.equal(pilotAllows('pilot-user', 'pilot-run', env), true);
  assert.equal(pilotAllows('another-user', 'pilot-run', env), false);
  assert.equal(pilotAllows('pilot-user', 'another-run', env), false);
  for (const key of Object.keys(env)) {
    assert.equal(pilotAllows('pilot-user', 'pilot-run', { ...env, [key]: '' }), false, key);
  }
  assert.equal(pilotAllows('pilot-user', 'pilot-run', { ...env, QIR_GATEWAY_MODELS: 'expensive/model' }), false);
});
