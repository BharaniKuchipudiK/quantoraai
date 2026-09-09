import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStudyRequestContext } from './study-adaptive-learning.js';

const WORKING = {
  version: 'study-working-state-v1',
  temporary: true,
  conceptKey: 'math.linear-functions',
  conceptLabel: 'Linear functions',
  misconceptionCandidate: 'possible',
  hintDependence: 'high',
  representationPreference: 'interactive',
  recentPattern: 'struggle',
  scaffoldingNeed: 'high',
  observedSignals: 99,
  reasonCodes: [
    'repeated_incorrect_response',
    'repeated_hint_use',
    'interactive_manipulation_observed',
    'one', 'two', 'three', 'four',
  ],
};

test('server admits a bounded temporary working state only inside Study', () => {
  const normalized = normalizeStudyRequestContext({
    conceptKey: 'MATH.LINEAR-FUNCTIONS',
    conceptLabel: 'Linear functions',
    workingState: WORKING,
  }, 'education');
  assert.equal(normalized?.workingState?.temporary, true);
  assert.equal(normalized?.workingState?.observedSignals, 12);
  assert.equal(normalized?.workingState?.reasonCodes.length, 6);
  assert.equal(normalized?.workingState?.representationPreference, 'interactive');

  for (const domain of [null, 'finance', 'research', 'travel', 'coding', 'general']) {
    assert.equal(normalizeStudyRequestContext({
      conceptKey: 'math.linear-functions',
      conceptLabel: 'Linear functions',
      workingState: WORKING,
    }, domain), null);
  }
});

test('server drops forged, durable-looking, or cross-concept working state', () => {
  const base = { conceptKey: 'math.linear-functions', conceptLabel: 'Linear functions' };
  assert.deepEqual(normalizeStudyRequestContext({
    ...base,
    workingState: { ...WORKING, version: 'study-working-state-v99' },
  }, 'education'), base);
  assert.deepEqual(normalizeStudyRequestContext({
    ...base,
    workingState: { ...WORKING, temporary: false },
  }, 'education'), base);
  assert.deepEqual(normalizeStudyRequestContext({
    ...base,
    workingState: { ...WORKING, conceptKey: 'physics.newton-2' },
  }, 'education'), base);
});

test('working-state enums fail closed to neutral bounded values', () => {
  const normalized = normalizeStudyRequestContext({
    conceptKey: 'math.linear-functions',
    conceptLabel: 'Linear functions',
    workingState: {
      ...WORKING,
      misconceptionCandidate: 'diagnosed_forever',
      hintDependence: 'dependent_forever',
      representationPreference: 'hologram',
      recentPattern: 'hopeless',
      scaffoldingNeed: 'permanent',
      observedSignals: -5,
    },
  }, 'education');
  assert.deepEqual(normalized?.workingState && {
    misconceptionCandidate: normalized.workingState.misconceptionCandidate,
    hintDependence: normalized.workingState.hintDependence,
    representationPreference: normalized.workingState.representationPreference,
    recentPattern: normalized.workingState.recentPattern,
    scaffoldingNeed: normalized.workingState.scaffoldingNeed,
    observedSignals: normalized.workingState.observedSignals,
  }, {
    misconceptionCandidate: 'none',
    hintDependence: 'none',
    representationPreference: null,
    recentPattern: 'neutral',
    scaffoldingNeed: 'low',
    observedSignals: 0,
  });
});
