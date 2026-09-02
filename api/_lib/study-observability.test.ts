import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentStudyTraceId,
  emitStudyTelemetry,
  noteStudyDbCall,
  withStudyTelemetryScope,
} from './study-observability.js';
import { evaluateStudyProjectionSlo, STUDY_PROJECTION_SLO } from './study-slos.js';

test('H3.4 Study telemetry correlates nested work and exposes only bounded safe fields', async () => {
  const captured: unknown[][] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => captured.push(args);
  try {
    let outerTrace = '';
    await withStudyTelemetryScope('adaptive_learner_model', async () => {
      outerTrace = currentStudyTraceId() || '';
      assert.match(outerTrace, /^[0-9a-f-]{36}$/i);
      noteStudyDbCall();
      noteStudyDbCall();
      await withStudyTelemetryScope('learner_projection_load', async () => {
        assert.equal(currentStudyTraceId(), outerTrace, 'nested Study work must retain one correlation id');
      });
      emitStudyTelemetry({
        event: 'projection_load',
        operation: 'learner_projection_load',
        status: 'success',
        source: 'checkpoint_delta',
        fallbackReason: 'checkpoint_miss',
        durationMs: 10,
        dbCalls: 2,
      });
    });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(captured.length, 2, 'one projection record and one outer scope record are expected');
  const projection = captured[0][1] as Record<string, unknown>;
  assert.deepEqual(Object.keys(projection).sort(), [
    'dbCalls',
    'durationMs',
    'event',
    'fallbackReason',
    'operation',
    'sloStatus',
    'sloVersion',
    'source',
    'status',
    'traceId',
    'version',
  ].sort());
  assert.equal(projection.traceId, outerTrace);
  assert.equal(projection.dbCalls, 2);
  assert.equal(projection.sloStatus, 'within_budget');
  assert.equal('userSub' in projection, false);
  assert.equal('path' in projection, false);
  assert.equal('query' in projection, false);
  assert.equal('prompt' in projection, false);
  assert.equal('answerKey' in projection, false);
  assert.equal('body' in projection, false);
});

test('H3.4 projection SLO classifier reports latency and DB-call regressions independently', () => {
  assert.equal(evaluateStudyProjectionSlo({ source: 'checkpoint_delta', durationMs: 10, dbCalls: 1 }), 'within_budget');
  assert.equal(evaluateStudyProjectionSlo({
    source: 'checkpoint_delta',
    durationMs: STUDY_PROJECTION_SLO.checkpoint_delta.p95LatencyMs + 1,
    dbCalls: 1,
  }), 'latency_breach');
  assert.equal(evaluateStudyProjectionSlo({
    source: 'full_replay',
    durationMs: 10,
    dbCalls: STUDY_PROJECTION_SLO.full_replay.dbCallsPerProjection + 1,
  }), 'db_call_breach');
  assert.equal(evaluateStudyProjectionSlo({
    source: 'full_replay',
    durationMs: STUDY_PROJECTION_SLO.full_replay.p95LatencyMs + 1,
    dbCalls: STUDY_PROJECTION_SLO.full_replay.dbCallsPerProjection + 1,
  }), 'latency_and_db_breach');
});
