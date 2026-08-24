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

test('mini-practice is generated from the session topic, not a canned problem pack', () => {
  const practice = miniPracticeFor('session.thermal-properties', 'thermal properties');
  assert.match(practice.title, /thermal properties/i);
  assert.match(practice.setup, /thermal properties/i);
  const packed = JSON.stringify(practice);
  assert.doesNotMatch(packed, /15 kg/);
  assert.doesNotMatch(packed, /crate/i);
});

test('real-world ask wants a table and then waits', () => {
  assert.match(studyRealWorldAsk('thermal properties'), /two-column Markdown table/i);
  assert.match(studyRealWorldAsk('thermal properties'), /STOP/i);
});

test('mini-practice ask hides the solution and waits', () => {
  const ask = studyMiniPracticeAsk('thermal properties', miniPracticeFor('session.thermal-properties', 'thermal properties'));
  assert.match(ask, /Do NOT show the numerical answers/i);
  assert.match(ask, /I will wait/i);
});

test('debrief is a calm professor, not a rank', () => {
  const ask = studyAnswerDebriefAsk({
    topic: 'thermal properties',
    setup: 'A short numerical on expansion',
    questions: ['what changes?'],
    studentAnswer: 'length increases',
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
    topic: 'thermal properties',
    foundation: 'Temperature and expansion',
    lessonText: 'Heat changes size when the idea applies.',
  });
  assert.match(notes, /thermal properties/);
  assert.match(notes, /not an official IIT/i);
  assert.match(notes, /Heat changes size/);
});
