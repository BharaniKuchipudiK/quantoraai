import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyStudySyllabusOverlay,
  inferStudySyllabus,
  mergeStudySyllabusFromText,
  shouldShowStudySyllabusChips,
  studySyllabusContinueSet,
  studySyllabusHaystack,
  withStudySyllabusAsk,
} from './study-syllabus-overlay.js';

const legacyRepositoryTask = [
  'Scan through the GitHub',
  ' public repositories and find out if we can leverage them.',
].join('');

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

test('generic project goal and understanding never participate in Study syllabus inference', () => {
  const context = {
    goal: `${legacyRepositoryTask} JEE Main`,
    understanding: 'Class 10 coding repository audit',
  };
  assert.equal(studySyllabusHaystack({ conversationContext: context }), '');
  assert.equal(inferStudySyllabus({ conversationContext: context }), null);
});

test('Study action prompts scrub cross-workspace project tasks before interpolation', () => {
  const values = studySyllabusContinueSet(legacyRepositoryTask).items.map((item) => item.value).join('\n');
  assert.doesNotMatch(values, /github|public repositories|scan through/i);
  assert.match(values, /Ask what we should learn/i);
});

test('a syllabus chip is stored as a fact and used to cap the plus Explain ask', () => {
  const next = applyStudySyllabusOverlay({ goal: 'Thermodynamics' }, 'cbse-10');
  assert.match(next.facts[0], /CBSE Class 10/);
  assert.equal(next.goal, undefined);
  const ask = withStudySyllabusAsk('Teach ONE idea about Thermodynamics.', inferStudySyllabus({ conversationContext: next }));
  assert.match(ask, /Class 10/);
  assert.equal(studySyllabusContinueSet('Thermodynamics').items.length, 7);
});

test('typed syllabus on a Study turn is merged without a second chip pick', () => {
  const merged = mergeStudySyllabusFromText({}, 'JEE Main projectile motion', 'education');
  assert.match(merged.facts.join(' '), /JEE Main/);
  assert.equal(mergeStudySyllabusFromText({}, 'Bali hotels', 'travel').facts, undefined);
});

test('entering Study drops generic project goal and understanding even when no syllabus is inferred', () => {
  const merged = mergeStudySyllabusFromText(
    { goal: legacyRepositoryTask, understanding: legacyRepositoryTask },
    'Please continue.',
    'education',
  );
  assert.equal(merged.goal, undefined);
  assert.equal(merged.understanding, undefined);
  assert.doesNotMatch(JSON.stringify(merged), /github|public repositories|scan through/i);
});

test('class plus subjects and a chapter list become stored facts, not a canned TOC', () => {
  const merged = mergeStudySyllabusFromText(
    {},
    'CBSE class 11 Physics. Subjects: Physics, Chemistry. Chapters: Units and measurement, Thermal properties',
    'education',
  );
  assert.match(merged.facts.join(' '), /Class 11–12|Class 11-12/);
  assert.match(merged.facts.join(' '), /Study subject: Physics/i);
  assert.match(merged.facts.join(' '), /Study subject: Chemistry/i);
  assert.equal(merged.facts.some((fact) => /Study subject:.*Chapters/i.test(fact)), false);
  assert.match(merged.facts.join(' '), /Syllabus node: Units and measurement/);
  assert.match(merged.facts.join(' '), /Syllabus node: Thermal properties/);
});

test('competency tags stay empty until the session names how an idea is tested', () => {
  const plain = mergeStudySyllabusFromText({}, 'Teach me thermal properties', 'education');
  assert.equal((plain.facts || []).some((fact) => /Competency tag:/i.test(fact)), false);
  const tagged = mergeStudySyllabusFromText({}, 'JEE paper: competency: numerical, assertion-reason. Teach me thermal properties', 'education');
  assert.match(tagged.facts.join(' '), /Competency tag: numerical/i);
  assert.match(tagged.facts.join(' '), /assertion-reason/i);
});

test('NEET is an exam overlay the learner can name, not a question dump', () => {
  const overlay = inferStudySyllabus({ extra: 'I am preparing for NEET' });
  assert.equal(overlay.id, 'neet');
});
