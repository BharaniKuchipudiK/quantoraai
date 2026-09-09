import assert from 'node:assert/strict';
import test from 'node:test';
import {
  summarizeCircuits,
  summarizeModelQuality,
  summarizeVercelDeployments,
  type ModelQualityRow,
  type ProviderCircuitRow,
} from './operations-analytics.js';

test('model reliability excludes routing pseudo-models and weights latency by successful samples', () => {
  const rows: ModelQualityRow[] = [
    {
      model_id: 'auto', task_category: 'coding', successful_responses: 0, failed_responses: 50,
      helpful_votes: 0, not_helpful_votes: 0, fallback_rescues: 0, avg_latency_ms: 0, last_event_at: '2026-09-09T00:00:00Z',
    },
    {
      model_id: 'provider/model-a', task_category: 'coding', successful_responses: 9, failed_responses: 1,
      helpful_votes: 0, not_helpful_votes: 0, fallback_rescues: 2, avg_latency_ms: 10_000, last_event_at: '2026-09-09T00:01:00Z',
    },
    {
      model_id: 'provider/model-a', task_category: 'general', successful_responses: 1, failed_responses: 0,
      helpful_votes: 0, not_helpful_votes: 0, fallback_rescues: 1, avg_latency_ms: 20_000, last_event_at: '2026-09-09T00:02:00Z',
    },
    {
      model_id: 'provider/model-b', task_category: 'general', successful_responses: 4, failed_responses: 4,
      helpful_votes: 0, not_helpful_votes: 0, fallback_rescues: 0, avg_latency_ms: 5_000, last_event_at: '2026-09-09T00:03:00Z',
    },
  ];

  const summary = summarizeModelQuality(rows);
  assert.equal(summary.attempts, 19);
  assert.equal(summary.successes, 14);
  assert.equal(summary.failures, 5);
  assert.equal(summary.fallbackRescues, 3);
  assert.equal(summary.successRate, 73.7);
  assert.equal(summary.models.length, 2);

  const modelA = summary.models.find((row) => row.modelId === 'provider/model-a');
  assert.ok(modelA);
  assert.equal(modelA.attempts, 11);
  assert.equal(modelA.successRate, 90.9);
  assert.equal(modelA.fallbackRescues, 3);
  assert.equal(modelA.avgLatencyMs, 11_000, '9 successful 10s calls + 1 successful 20s call must weight to 11s');
  assert.equal(modelA.lastEventAt, '2026-09-09T00:02:00Z');
});

test('circuit summary distinguishes actively open, impaired, and recovered inference routes', () => {
  const now = Date.parse('2026-09-09T01:00:00Z');
  const rows: ProviderCircuitRow[] = [
    {
      circuit_key: 'inference:route:openrouter:a', failures: 5,
      opened_until: '2026-09-09T01:05:00Z', last_failure_at: '2026-09-09T00:59:00Z',
      last_success_at: '2026-09-08T23:00:00Z', updated_at: '2026-09-09T00:59:00Z',
    },
    {
      circuit_key: 'inference:route:openrouter:b', failures: 2,
      opened_until: '2026-09-09T00:55:00Z', last_failure_at: '2026-09-09T00:50:00Z',
      last_success_at: '2026-09-09T00:40:00Z', updated_at: '2026-09-09T00:50:00Z',
    },
    {
      circuit_key: 'inference:route:gemini:c', failures: 3,
      opened_until: null, last_failure_at: '2026-09-09T00:20:00Z',
      last_success_at: '2026-09-09T00:30:00Z', updated_at: '2026-09-09T00:30:00Z',
    },
    {
      circuit_key: 'places:search', failures: 99,
      opened_until: '2026-09-09T02:00:00Z', last_failure_at: '2026-09-09T00:59:00Z',
      last_success_at: null, updated_at: '2026-09-09T00:59:00Z',
    },
  ];

  const summary = summarizeCircuits(rows, now);
  assert.equal(summary.rows.length, 3, 'non-inference circuits stay out of the AI control tower');
  assert.equal(summary.open, 1);
  assert.equal(summary.impaired, 1);
  assert.equal(summary.healthy, 1);
  assert.equal(summary.rows[0].status, 'open');
  assert.equal(summary.rows[1].status, 'impaired');
  assert.equal(summary.rows[2].status, 'healthy');
});

test('Vercel deployment reliability counts only terminal production results', () => {
  const summary = summarizeVercelDeployments([
    { uid: 'd1', state: 'READY', created: 3, url: 'one.vercel.app', meta: { githubCommitSha: 'abc1234', githubCommitMessage: 'good' } },
    { uid: 'd2', state: 'ERROR', created: 2, url: 'two.vercel.app', meta: { githubCommitSha: 'def5678', githubCommitMessage: 'bad' } },
    { uid: 'd3', state: 'BUILDING', created: 1, url: 'three.vercel.app', meta: {} },
  ]);

  assert.equal(summary.current?.id, 'd1');
  assert.equal(summary.finishedDeployments, 2);
  assert.equal(summary.readyDeployments, 1);
  assert.equal(summary.failedDeployments, 1);
  assert.equal(summary.successRate, 50);
  assert.equal(summary.recent.length, 3);
});
