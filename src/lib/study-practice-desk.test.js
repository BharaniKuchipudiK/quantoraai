import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStudyNotesFile,
  miniPracticeFor,
  studyAnswerDebriefAsk,
  studyMiniPracticeAsk,
  studyRealWorldAsk,
  studyScheduleAsk,
} from './study-practice-desk.js';

test('mini-practice for Newton is the crate problem with answers not included', () => {
  const practice = miniPracticeFor('physics.mechanics.newton-laws');
  assert.match(practice.title, /crate/i);
  assert.match(practice.setup, /15 kg/);
  const packed = JSON.stringify(practice);
  assert.doesNotMatch(packed, /3 m\/s/);
  assert.doesNotMatch(packed, /12 m\/s/);
});

test('real-world ask wants a table and then waits', () => {
  assert.match(studyRealWorldAsk("Newton's laws"), /two-column Markdown table/i);
  assert.match(studyRealWorldAsk("Newton's laws"), /STOP/i);
});

test('mini-practice ask hides the solution and waits', () => {
  const ask = studyMiniPracticeAsk("Newton's laws", miniPracticeFor('physics.mechanics.newton-laws'));
  assert.match(ask, /Do NOT show the numerical answers/i);
  assert.match(ask, /I will wait/i);
});

test('debrief is a calm professor, not a rank', () => {
  const ask = studyAnswerDebriefAsk({
    topic: "Newton's laws",
    setup: '15 kg crate, 45 N',
    questions: ['acceleration?'],
    studentAnswer: 'a = 3',
  });
  assert.match(ask, /encouragement/i);
  assert.match(ask, /shortest clean method/i);
  assert.match(ask, /IIT\/NEET rank/i);
  assert.match(ask, /never mocking/i);
});

test('schedule asks for real hours and protects sleep', () => {
  assert.match(studyScheduleAsk('JEE physics'), /hours free today/i);
  assert.match(studyScheduleAsk('JEE physics'), /Never invent a 14-hour grind/i);
  assert.match(studyScheduleAsk('JEE physics'), /not an official IIT/i);
});

test('downloaded notes are a file the student can keep, not a fake score', () => {
  const notes = buildStudyNotesFile({
    topic: "Newton's laws",
    foundation: 'Net force',
    lessonText: 'F = ma on one object.',
  });
  assert.match(notes, /Newton's laws/);
  assert.match(notes, /not an official IIT/i);
  assert.match(notes, /F = ma/);
});
