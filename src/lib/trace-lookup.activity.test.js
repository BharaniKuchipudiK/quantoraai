import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTraceStory } from './trace-lookup.js';

test('trace lookup returns user-safe activity progress from durable events', async () => {
  const body = {
    story: { headline: 'Quantora finished this turn.', detail: 'ok', steps: [] },
    events: [
      { boundary: 'api.chat', state: 'started', at: '2026-09-14T00:00:00.000Z' },
      { boundary: 'inference.plan', state: 'selected', modelId: 'model-a', at: '2026-09-14T00:00:00.050Z' },
      { boundary: 'inference.provider', state: 'attempting', modelId: 'model-a', at: '2026-09-14T00:00:00.100Z' },
    ],
  };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => body });
  const result = await fetchTraceStory('studio-719887e2-b5a4-4de5-b84a-f474192befa2', { fetchImpl });
  assert.equal(result.ok, true);
  assert.deepEqual(result.activities.map((item) => item.label), [
    'Request received',
    'Model selected · model-a',
    'Generating with model-a',
  ]);
});
