import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateModelQuality, applyRecentHealth, classifyRecentModelHealth } from './model-health.js';

test('severe repeated recent failures degrade a model', () => {
  const quality = aggregateModelQuality([{ model_id: 'bad', successful_responses: 0, failed_responses: 9 }]).get('bad');
  assert.equal(quality.sampleSize, 9);
  assert.equal(classifyRecentModelHealth(quality).state, 'degraded');
  assert.equal(applyRecentHealth({ id: 'bad', available: true, selectable: true }, quality).selectable, false);
});

test('one failure never sidelines a model', () => {
  const quality = aggregateModelQuality([{ model_id: 'new', successful_responses: 0, failed_responses: 1 }]).get('new');
  assert.equal(classifyRecentModelHealth(quality).state, 'observing');
  assert.equal(applyRecentHealth({ id: 'new', available: true, selectable: true }, quality).selectable, true);
});

test('strong recent reliability keeps a model healthy', () => {
  const quality = aggregateModelQuality([{ model_id: 'good', successful_responses: 5, failed_responses: 0, avg_latency_ms: 900 }]).get('good');
  assert.equal(classifyRecentModelHealth(quality).state, 'healthy');
});

test('reliable but slow models remain selectable and are marked slow', () => {
  const quality = aggregateModelQuality([{ model_id: 'slow', successful_responses: 8, failed_responses: 0, avg_latency_ms: 20000 }]).get('slow');
  const health = classifyRecentModelHealth(quality);
  assert.equal(health.state, 'slow');
  assert.equal(health.selectable, true);
});

test('rolling recovery naturally re-enables a previously degraded model', () => {
  const recovered = aggregateModelQuality([{ model_id: 'recovered', successful_responses: 9, failed_responses: 1, avg_latency_ms: 1200 }]).get('recovered');
  assert.equal(classifyRecentModelHealth(recovered).state, 'healthy');
  assert.equal(applyRecentHealth({ id: 'recovered', available: true, selectable: true }, recovered).selectable, true);
});
