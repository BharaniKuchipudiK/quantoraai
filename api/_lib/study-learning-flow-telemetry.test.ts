import assert from 'node:assert/strict';
import test from 'node:test';
import { emitStudyLearningFlowMetric } from './study-learning-flow-telemetry.js';
import { withStudyTelemetryScope } from './study-observability.js';

test('H3.4 learning-flow counters keep one correlation id and a closed privacy-safe field set', async () => {
  const captured: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => captured.push(args);
  try {
    await withStudyTelemetryScope('study_assessment', async () => {
      emitStudyLearningFlowMetric({
        metric: 'evidence_guard',
        outcome: 'duplicate_evidence_blocked',
        evidenceKind: 'assessment_item',
      });
    });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(captured.length, 2, 'one flow metric and one scope completion record are expected');
  const metric = captured[0][1] as Record<string, unknown>;
  assert.deepEqual(Object.keys(metric).sort(), [
    'evidenceKind',
    'metric',
    'outcome',
    'traceId',
    'version',
  ].sort());
  assert.match(String(metric.traceId), /^[0-9a-f-]{36}$/i);
  assert.equal(metric.metric, 'evidence_guard');
  assert.equal(metric.outcome, 'duplicate_evidence_blocked');
  assert.equal('userSub' in metric, false);
  assert.equal('conceptId' in metric, false);
  assert.equal('itemRef' in metric, false);
  assert.equal('assessmentRef' in metric, false);
  assert.equal('prompt' in metric, false);
  assert.equal('answer' in metric, false);
  assert.equal('path' in metric, false);
  assert.equal('query' in metric, false);
});

test('representation coverage may name a renderer family without learner text', async () => {
  const captured: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => captured.push(args);
  try {
    await withStudyTelemetryScope('study_assessment', async () => {
      emitStudyLearningFlowMetric({
        metric: 'representation_coverage',
        outcome: 'renderer_available',
        rendererKind: 'geometry-construction',
      });
    });
  } finally {
    console.info = originalInfo;
  }

  const metric = captured[0][1] as Record<string, unknown>;
  assert.deepEqual(Object.keys(metric).sort(), [
    'metric',
    'outcome',
    'rendererKind',
    'traceId',
    'version',
  ].sort());
  assert.equal(metric.metric, 'representation_coverage');
  assert.equal(metric.outcome, 'renderer_available');
  assert.equal(metric.rendererKind, 'geometry-construction');
  assert.equal('prompt' in metric, false);
  assert.equal('userSub' in metric, false);
});
