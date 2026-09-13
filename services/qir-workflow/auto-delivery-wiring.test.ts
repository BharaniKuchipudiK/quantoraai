import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('./workflow.ts', import.meta.url), 'utf8');

test('verified completion is the only automatic delivery entry point', () => {
  assert.match(workflow, /if \(result === 'COMPLETE'\)/);
  assert.match(workflow, /await invokeAutoDelivery\(userSub, runId\)/);
  assert.doesNotMatch(workflow, /result === 'FAILED_TERMINAL'.*invokeAutoDelivery/s);
});

test('consent and target policy are checked before any delivery side effect', () => {
  const consent = workflow.indexOf('readGithubAutoDeliverEnabled(userSub)');
  const policy = workflow.indexOf('codingDeliveryPilotAllows(input, autoDeliverEnabled)');
  const marker = workflow.indexOf("eventType: 'delivery.auto_scheduled'");
  const delivery = workflow.indexOf('executeCodingDelivery(input)');
  assert.ok(consent >= 0 && policy > consent);
  assert.ok(marker > policy, 'durable schedule marker must follow consent/policy');
  assert.ok(delivery > marker, 'delivery side effects must start only after the durable marker');
});

test('automatic delivery step cannot be blindly retried by Workflow', () => {
  assert.match(workflow, /invokeAutoDelivery\.maxRetries = 0/);
});
