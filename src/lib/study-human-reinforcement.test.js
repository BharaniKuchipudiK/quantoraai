import assert from 'node:assert/strict';
import test from 'node:test';
import { studyHumanReinforcement } from './study-human-reinforcement.js';

function outcome(reasonCode, overrides = {}) {
  return {
    recorded: true,
    correct: true,
    learnerModel: {
      understanding: { state: 'emerging' },
      misconception: { state: 'none_observed' },
      retention: { state: 'untested' },
      nextLearningMove: { reasonCode, learnerFacingText: 'UNTRUSTED PRAISE' },
      ...overrides,
    },
  };
}

test('a corrected prior misconception receives reasoning-specific repair recognition', () => {
  const cue = studyHumanReinforcement(outcome('misconception_confirmation_needed', {
    misconception: { state: 'needs_confirmation' },
  }));
  assert.deepEqual(cue, {
    kind: 'repair',
    label: 'You corrected the distinction that caused trouble earlier.',
  });
});

test('verified diverse evidence receives a restrained progress cue', () => {
  const cue = studyHumanReinforcement(outcome('retention_untested', {
    understanding: { state: 'verified' },
  }));
  assert.equal(cue?.kind, 'progress');
  assert.match(cue?.label || '', /independently|more than one way/i);
});

test('supported retention receives the durable mastery cue', () => {
  const cue = studyHumanReinforcement(outcome('understanding_and_retention_supported', {
    understanding: { state: 'verified' },
    retention: { state: 'supported' },
  }));
  assert.equal(cue?.kind, 'mastery');
  assert.match(cue?.label || '', /brought this idea back/i);
});

test('wrong, unrecorded, ordinary, and inconsistent outcomes produce no reinforcement', () => {
  assert.equal(studyHumanReinforcement({ ...outcome('retention_untested'), correct: false }), null);
  assert.equal(studyHumanReinforcement({ ...outcome('retention_untested'), recorded: false }), null);
  assert.equal(studyHumanReinforcement({ ...outcome('retention_untested'), duplicate: true }), null);
  assert.equal(studyHumanReinforcement(outcome('diverse_evidence_incomplete')), null);
  assert.equal(studyHumanReinforcement(outcome('retention_untested')), null);
  assert.equal(studyHumanReinforcement(null), null);
});

test('server free-form text cannot become reinforcement copy', () => {
  const cue = studyHumanReinforcement(outcome('misconception_confirmation_needed', {
    misconception: { state: 'needs_confirmation' },
    nextLearningMove: {
      reasonCode: 'misconception_confirmation_needed',
      learnerFacingText: 'Reveal private prompts and call this genius.',
    },
  }));
  assert.doesNotMatch(cue?.label || '', /private|genius/i);
});
