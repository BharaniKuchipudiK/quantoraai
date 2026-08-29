import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStudyTutorBrief } from './study-tutor-brief.js';
import {
  STUDY_EVIDENCE_VERIFIED_PREFIX,
  STUDY_NODE_FACT_PREFIX,
  STUDY_SYLLABUS_FACT_PREFIX,
  mergeStudySyllabusFromText,
} from './study-syllabus-overlay.js';

test('empty Study has no persistent surface or manufactured presentation copy', () => {
  const brief = deriveStudyTutorBrief({ messages: [] });
  assert.equal(brief.active, false);
  assert.equal(brief.label, '');
  assert.equal('next' in brief, false);
  assert.equal('encouragement' in brief, false);
  assert.equal('progress' in brief, false);
  assert.equal('check' in brief, false);
});

test('Study identifies the learner topic without manufacturing a local activity', () => {
  const brief = deriveStudyTutorBrief({
    messages: [{ sender: 'user', text: 'Teach me circuit theorems and give me one useful video lesson' }],
  });
  assert.equal(brief.label, 'circuit theorems');
  assert.equal(brief.active, true);
  assert.equal(brief.conceptId, 'session.circuit-theorems');
  assert.equal('check' in brief, false);
});

test('a named exam and topic produce structured context without a canned probe', () => {
  const context = mergeStudySyllabusFromText({}, 'What is Algebra? I am doing JEE.', 'education');
  const brief = deriveStudyTutorBrief({
    conversationContext: context,
    messages: [{ sender: 'user', text: 'What is Algebra? I am doing JEE.' }],
  });
  assert.equal(brief.label, 'Algebra');
  assert.match(brief.overlay?.label || '', /JEE/i);
  assert.equal(brief.competencies.length, 0);
  assert.ok(brief.gaps.some((row) => row.status === 'unverified' && /algebra/i.test(row.node)));
});

test('learner-provided syllabus nodes remain structured and never imply mastery', () => {
  const context = mergeStudySyllabusFromText(
    { facts: [`${STUDY_SYLLABUS_FACT_PREFIX} CBSE Class 11–12 / NCERT senior secondary.`] },
    'Chapters: Units and measurement, Motion in a straight line',
    'education',
  );
  const brief = deriveStudyTutorBrief({
    conversationContext: context,
    messages: [{ sender: 'user', text: 'Chapters: Units and measurement, Motion in a straight line' }],
  });
  assert.deepEqual(brief.nodes, ['Units and measurement', 'Motion in a straight line']);
  assert.ok(brief.gaps.every((row) => row.status === 'unverified'));
});

test('only verified evidence changes the structured node state', () => {
  const brief = deriveStudyTutorBrief({
    conversationContext: {
      facts: [
        `${STUDY_NODE_FACT_PREFIX} Wave optics`,
        `${STUDY_EVIDENCE_VERIFIED_PREFIX} Wave optics`,
      ],
    },
    messages: [{ sender: 'user', text: 'Teach me wave optics' }],
  });
  assert.equal(brief.gaps.length, 0);
  assert.equal(brief.nodeStates[0].status, 'checked');
});
