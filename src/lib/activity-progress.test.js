import test from 'node:test';
import assert from 'node:assert/strict';
import { activityProgressFromTrace } from './activity-progress.js';

test('projects only observed durable boundaries into truthful progress', () => {
  const events = [
    { at: '2026-09-14T00:00:00.000Z', boundary: 'api.chat', state: 'started' },
    { at: '2026-09-14T00:00:00.100Z', boundary: 'inference.plan', state: 'selected', modelId: 'model-a' },
    { at: '2026-09-14T00:00:00.200Z', boundary: 'inference.provider', state: 'attempting', modelId: 'model-a' },
    { at: '2026-09-14T00:00:01.000Z', boundary: 'inference.provider', state: 'succeeded', modelId: 'model-a' },
    { at: '2026-09-14T00:00:01.100Z', boundary: 'browser.response-parser', state: 'parsed' },
    { at: '2026-09-14T00:00:01.200Z', boundary: 'api.chat', state: 'succeeded' },
  ];
  const progress = activityProgressFromTrace(events);
  assert.deepEqual(progress.map((event) => event.label), [
    'Request received',
    'Model selected · model-a',
    'Generating with model-a',
    'model-a responded',
    'Response received',
    'Turn completed',
  ]);
});

test('recovery is visible without inventing reasoning', () => {
  const progress = activityProgressFromTrace([
    { boundary: 'inference.provider', state: 'failed', modelId: 'model-a', detailCode: 'attempt-timeout' },
    { boundary: 'browser.turn-recovery', state: 'attempting', detailCode: 'switch-model' },
    { boundary: 'inference.provider', state: 'attempting', modelId: 'model-b' },
  ]);
  assert.equal(progress[0].state, 'failed');
  assert.match(progress[0].label, /attempt timeout/);
  assert.equal(progress[1].phase, 'recovery');
  assert.equal(progress[2].label, 'Generating with model-b');
  assert.equal(progress.some((event) => /thinking|reasoning/i.test(event.label)), false);
});

test('collapses duplicate heartbeats and bounds history', () => {
  const events = Array.from({ length: 30 }, (_, index) => ({
    at: new Date(1_789_000_000_000 + index * 1000).toISOString(),
    boundary: index % 2 === 0 ? 'api.chat' : 'inference.provider',
    state: index % 2 === 0 ? 'started' : 'attempting',
    modelId: 'model-a',
  }));
  const progress = activityProgressFromTrace(events);
  assert.ok(progress.length <= 12);
});
