import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendStudyLearnerModelAccumulator,
  createStudyLearnerModelAccumulator,
} from './study-learner-model.js';
import {
  appendStudyMasteryAccumulator,
  createStudyMasteryAccumulator,
} from './study-mastery-estimator.js';
import type { StudyMasteryEvidenceEvent } from './study-truth-layer.js';

function syntheticEvent(index: number): StudyMasteryEvidenceEvent {
  const observedAt = new Date(Date.UTC(2020, 0, 1) + index * 86_400_000).toISOString();
  const kind = index % 250 === 0
    ? 'transfer'
    : index % 100 === 0
      ? 'retention_probe'
      : index % 3 === 0
        ? 'application'
        : 'retrieval';
  return {
    id: `synthetic-${index}`,
    conceptId: 'concept-load',
    kind,
    correct: index % 7 !== 0,
    score: index % 7 !== 0 ? 1 : 0,
    difficulty: 0.6,
    hintsUsed: 0,
    responseMs: 1200,
    selfConfidence: null,
    independent: true,
    misconceptionSignal: index % 37 === 0,
    delayDays: kind === 'retention_probe' ? 7 : null,
    provenance: 'quantora_authored',
    sourceRef: null,
    assessmentRef: null,
    itemRef: null,
    observedAt,
  };
}

function fold(events: StudyMasteryEvidenceEvent[]) {
  let mastery = createStudyMasteryAccumulator();
  let learner = createStudyLearnerModelAccumulator();
  for (const event of events) {
    mastery = appendStudyMasteryAccumulator(mastery, event);
    learner = appendStudyLearnerModelAccumulator(learner, event);
  }
  return { mastery, learner };
}

test('H3.4 5k-event replay state stays compact and a 500-row bounded delta matches full folding', () => {
  const events = Array.from({ length: 5_000 }, (_, index) => syntheticEvent(index));
  const full = fold(events);
  const checkpoint = fold(events.slice(0, 4_500));

  let mastery = checkpoint.mastery;
  let learner = checkpoint.learner;
  for (const event of events.slice(4_500)) {
    mastery = appendStudyMasteryAccumulator(mastery, event);
    learner = appendStudyLearnerModelAccumulator(learner, event);
  }

  assert.deepEqual(mastery, full.mastery, '500-row delta fold must equal the same 5k full fold');
  assert.deepEqual(learner, full.learner, 'learner replay state must preserve full/delta parity at the delta ceiling');
  assert.equal(full.mastery.evidenceCount, 5_000);
  assert.equal(full.learner.evidenceCount, 5_000);
  assert.equal(full.mastery.observedThrough, events[4_999].observedAt);
  assert.equal(full.learner.observedThrough, events[4_999].observedAt);

  const checkpointBytes = Buffer.byteLength(JSON.stringify(full), 'utf8');
  assert.ok(checkpointBytes < 12_000, `fold state must stay compact; got ${checkpointBytes} bytes`);
  assert.equal(JSON.stringify(full).includes('synthetic-4999'), false, 'derived replay state must not retain raw event ids');
});
