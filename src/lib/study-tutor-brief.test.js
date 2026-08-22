import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStudyTutorBrief, gradeStudyCheck } from './study-tutor-brief.js';

test('empty Study asks what to strengthen, and does not invent a score', () => {
  const brief = deriveStudyTutorBrief({ messages: [] });
  assert.equal(brief.check, null);
  assert.match(brief.next, /stronger/i);
});

test('projectile motion opens a real check on the foundation path', () => {
  const brief = deriveStudyTutorBrief({
    messages: [{ sender: 'user', text: 'I keep missing projectile motion on JEE practice' }],
  });
  assert.equal(brief.label, 'Projectile motion');
  assert.match(brief.foundation, /vector/i);
  const wrong = gradeStudyCheck(brief.check, 'b');
  assert.equal(wrong.correct, false);
  assert.match(wrong.message, /vector/i);
  const right = gradeStudyCheck(brief.check, 'a');
  assert.equal(right.correct, true);
});
