import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveStudyTutorBrief, gradeStudyCheck, studyCheckOutcomeFact } from './study-tutor-brief.js';
import {
  STUDY_CHECK_PASSED_PREFIX,
  STUDY_EVIDENCE_VERIFIED_PREFIX,
  STUDY_FIGURE_URL_PREFIX,
  STUDY_FLASHCARD_PREFIX,
  STUDY_FOUNDATION_PREFIX,
  STUDY_NODE_FACT_PREFIX,
  STUDY_SYLLABUS_FACT_PREFIX,
  mergeStudySyllabusFromText,
} from './study-syllabus-overlay.js';

test('empty Study asks what to strengthen, and does not invent a score', () => {
  const brief = deriveStudyTutorBrief({ messages: [] });
  assert.equal(brief.check, null);
  assert.equal(brief.active, false);
  assert.equal(brief.figureUrl, '');
  assert.match(brief.next, /stronger/i);
  assert.match(brief.progress.caption, /No fake score/);
});

test('the board names the idea the student asked to learn, without a canned check bank', () => {
  const brief = deriveStudyTutorBrief({
    messages: [{ sender: 'user', text: 'Teach me circuit theorems and give me one useful video lesson' }],
  });
  assert.equal(brief.label, 'circuit theorems');
  assert.equal(brief.active, true);
  assert.equal(brief.flashcards.length, 0);
  assert.match(brief.encouragement.text, /One idea/i);
  assert.ok(brief.check);
  assert.match(brief.check.prompt, /circuit theorems/i);
  assert.doesNotMatch(JSON.stringify(brief.check), /wall pushes back/i);
  assert.doesNotMatch(JSON.stringify(brief.check), /Newton/i);
});

test('struggle in this thread changes encouragement, not the chapter menu', () => {
  const brief = deriveStudyTutorBrief({
    messages: [
      { sender: 'user', text: 'Teach me organic reaction mechanisms' },
      { sender: 'ai', text: 'Write your attempt. I will wait.' },
      { sender: 'user', text: 'I got this wrong and I am stuck' },
    ],
  });
  assert.equal(brief.label, 'organic reaction mechanisms');
  assert.equal(brief.signals.struggle, true);
  assert.match(brief.encouragement.text, /Tough beat/i);
  assert.ok(brief.check);
});

test('a named exam plus Algebra does not invent a physics probe', () => {
  const context = mergeStudySyllabusFromText({}, 'What is Algebra? I am doing JEE.', 'education');
  const brief = deriveStudyTutorBrief({
    conversationContext: context,
    messages: [{ sender: 'user', text: 'What is Algebra? I am doing JEE.' }],
  });
  assert.equal(brief.label, 'Algebra');
  assert.match(brief.check.prompt, /Algebra/i);
  assert.doesNotMatch(JSON.stringify(brief.check), /projectile|Newton|wall pushes/i);
  assert.match(brief.overlay?.label || '', /JEE/i);
  assert.equal(brief.competencies.length, 0);
  assert.ok(brief.gaps.some((row) => row.status === 'unverified' && /algebra/i.test(row.node)));
});

test('session flashcards become the board check before the honesty probe', () => {
  const brief = deriveStudyTutorBrief({
    conversationContext: {
      facts: [
        `${STUDY_NODE_FACT_PREFIX} Wave optics`,
        `${STUDY_FLASHCARD_PREFIX} What is superposition? | Overlap of waves at a point`,
      ],
    },
    messages: [{ sender: 'user', text: 'Teach me wave optics' }],
  });
  assert.match(brief.check.prompt, /superposition/i);
  assert.equal(brief.check.options[0].text, 'Overlap of waves at a point');
});

test('syllabus nodes the learner pasted become the gap list, never fake mastery', () => {
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
  assert.equal(brief.gaps.some((row) => row.status === 'missing'), false);
});

test('session figure URLs and flashcards render only when facts provide them', () => {
  const brief = deriveStudyTutorBrief({
    conversationContext: {
      facts: [
        `${STUDY_NODE_FACT_PREFIX} Wave optics`,
        `${STUDY_FIGURE_URL_PREFIX} https://cdn.example.test/wave-optics.png`,
        `${STUDY_FLASHCARD_PREFIX} What is superposition? | Overlap of waves at a point`,
        `${STUDY_FOUNDATION_PREFIX} Superposition of waves`,
      ],
    },
    messages: [{ sender: 'user', text: 'Teach me wave optics' }],
  });
  assert.equal(brief.figureUrl, 'https://cdn.example.test/wave-optics.png');
  assert.equal(brief.flashcards.length, 1);
  assert.match(brief.foundation, /Superposition/);
});

test('only verified evidence changes progress, and browser checks stay unverified', () => {
  const brief = deriveStudyTutorBrief({
    conversationContext: {
      facts: [
        `${STUDY_NODE_FACT_PREFIX} Wave optics`,
        `${STUDY_CHECK_PASSED_PREFIX} Legacy browser self-report`,
        `${STUDY_EVIDENCE_VERIFIED_PREFIX} Wave optics`,
      ],
    },
    messages: [{ sender: 'user', text: 'Teach me wave optics' }],
  });
  assert.equal(brief.gaps.length, 0);
  assert.equal(brief.nodeStates[0].status, 'checked');
  assert.match(brief.progress.caption, /checked this session/i);
  assert.match(brief.progress.caption, /not an exam rank/i);
  assert.equal(studyCheckOutcomeFact('Wave optics', true), '');

  const probe = {
    prompt: 'Say the idea.',
    options: [
      { id: 'a', text: 'Right', correct: true },
      { id: 'b', text: 'Wrong', correct: false },
    ],
    ifRight: 'That check held.',
    ifWrong: 'Gap found.',
  };
  assert.equal(gradeStudyCheck(probe, 'a').correct, true);
  assert.equal(gradeStudyCheck(probe, 'a').verified, false);
  assert.equal(gradeStudyCheck(probe, 'b').correct, false);
});

test('an honesty check records self-confidence but never creates a passed fact', () => {
  const brief = deriveStudyTutorBrief({
    messages: [{ sender: 'user', text: 'Teach me wave optics' }],
  });
  const graded = gradeStudyCheck(brief.check, 'hold');
  assert.equal(graded.correct, true);
  assert.equal(graded.verified, false);
  assert.deepEqual(graded.evidence, { kind: 'self_confidence', selfConfidence: 1 });
  assert.equal(studyCheckOutcomeFact('Wave optics', graded.correct), '');
});
