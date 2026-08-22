import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyStudySyllabusOverlay,
  inferStudySyllabus,
  mergeStudySyllabusFromText,
  shouldShowStudySyllabusChips,
  studySyllabusContinueSet,
  withStudySyllabusAsk,
} from './study-syllabus-overlay.js';

test('infers CBSE 10 from the learner’s own words and then hides the chips', () => {
  const overlay = inferStudySyllabus({ extra: 'Explain thermodynamics for class 10 CBSE' });
  assert.equal(overlay.id, 'cbse-10');
  assert.equal(shouldShowStudySyllabusChips({
    studioDomain: 'education',
    extra: 'Explain thermodynamics for class 10 CBSE',
  }), false);
});

test('does not invent a syllabus when the learner only named a topic', () => {
  assert.equal(inferStudySyllabus({ extra: "Newton's laws of motion" }), null);
  assert.equal(shouldShowStudySyllabusChips({
    studioDomain: 'education',
    extra: "Newton's laws of motion",
  }), true);
});

test('a syllabus chip is stored as a fact and used to cap the plus Explain ask', () => {
  const next = applyStudySyllabusOverlay({ goal: 'Thermodynamics' }, 'cbse-10');
  assert.match(next.facts[0], /CBSE Class 10/);
  const ask = withStudySyllabusAsk('Teach ONE idea about Thermodynamics.', inferStudySyllabus({ conversationContext: next }));
  assert.match(ask, /Class 10/);
  assert.equal(studySyllabusContinueSet('Thermodynamics').items.length, 6);
});

test('typed syllabus on a Study turn is merged without a second chip pick', () => {
  const merged = mergeStudySyllabusFromText({}, 'JEE Main projectile motion', 'education');
  assert.match(merged.facts.join(' '), /JEE Main/);
  assert.equal(mergeStudySyllabusFromText({}, 'Bali hotels', 'travel').facts, undefined);
});
