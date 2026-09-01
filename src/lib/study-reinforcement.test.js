import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStudyReinforcement } from './study-reinforcement.js';

test('reinforcement ignores ordinary correctness and all failures', () => {
  assert.equal(deriveStudyReinforcement(null), null);
  assert.equal(deriveStudyReinforcement({ correct: false, evidenceKind: 'assessment_item' }), null);
  assert.equal(deriveStudyReinforcement({ correct: true, evidenceKind: 'assessment_item', learnerModel: { misconception: { lastResolvedCode: null } } }), null);
  assert.equal(deriveStudyReinforcement({ correct: true, duplicate: true, evidenceKind: 'transfer' }), null);
});

test('reinforcement recognizes misconception repair, retention and transfer only from verified grade shape', () => {
  assert.equal(
    deriveStudyReinforcement({ correct: true, evidenceKind: 'assessment_item', learnerModel: { misconception: { lastResolvedCode: 'sign_direction' } } })?.kind,
    'repair',
  );
  const retention = deriveStudyReinforcement({ correct: true, evidenceKind: 'retention_probe', delayDays: 7 });
  assert.equal(retention?.kind, 'return');
  assert.match(retention?.detail || '', /7 delayed days/);
  assert.equal(deriveStudyReinforcement({ correct: true, evidenceKind: 'transfer' })?.kind, 'transfer');
});
