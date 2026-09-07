import assert from 'node:assert/strict';
import test from 'node:test';
import {
  studyCompassActionLabel,
  studyCompassExplanation,
  studyCompassSchedulePrefill,
} from './study-compass-schedule.js';

function recommendation(overrides = {}) {
  return {
    conceptId: 'physics.force.newton-3',
    label: "Newton's Third Law",
    recommendedActionType: 'guided_repair',
    suggestedDurationMinutes: 6,
    dataSufficiency: 'sufficient',
    factors: [
      { key: 'masteryGap', contribution: 0.21 },
      { key: 'prerequisiteLeverage', contribution: 0.15 },
      { key: 'availableTimeFit', contribution: 0.08 },
    ],
    ...overrides,
  };
}

test('Compass schedule prefill preserves concept, activity, exact duration, and evidence-backed reason', () => {
  const input = recommendation();
  const draft = studyCompassSchedulePrefill(input);

  assert.equal(studyCompassActionLabel(input), 'Repair the foundation');
  assert.equal(draft.topic, "Newton's Third Law");
  assert.equal(draft.title, "Repair the foundation: Newton's Third Law");
  assert.equal(draft.duration, 6, 'a short Compass fit must not be rounded up to 15 or 30 minutes');
  assert.match(draft.notes, /Learning Compass recommendation/);
  assert.match(draft.notes, /verified gap/i);
  assert.match(draft.notes, /unlock later concepts/i);
});

test('planning prefill deliberately omits time and learner-truth fields', () => {
  const draft = studyCompassSchedulePrefill(recommendation());
  for (const forbidden of ['startsAt', 'endsAt', 'mastery', 'evidence', 'score', 'confidence']) {
    assert.equal(Object.prototype.hasOwnProperty.call(draft, forbidden), false, `${forbidden} must not cross into Schedule planning`);
  }
  assert.equal(draft.subject, '', 'subject is not guessed from a concept label');
  assert.equal(draft.kind, 'study');
  assert.equal(draft.status, 'planned');
});

test('insufficient evidence stays an explicit diagnostic reason', () => {
  const input = recommendation({ dataSufficiency: 'insufficient_evidence', factors: [] });
  assert.match(studyCompassExplanation(input), /more verified evidence/i);
  assert.match(studyCompassSchedulePrefill(input).notes, /short diagnostic/i);
});

test('unknown action types fail to a truthful generic activity and missing concepts do not create drafts', () => {
  assert.equal(studyCompassActionLabel(recommendation({ recommendedActionType: 'future_action' })), 'Strengthen this concept');
  assert.equal(studyCompassSchedulePrefill({ label: '   ' }), null);
});
