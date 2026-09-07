import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyStudySchedulePrefill,
  normalizeStudyScheduleDuration,
  studyScheduleDurationOptions,
} from './study-schedule-draft.js';

const BASE = {
  id: null,
  subject: '',
  topic: 'Forces',
  title: '',
  date: '2026-09-08',
  startTime: '10:00',
  duration: 60,
  kind: 'study',
  status: 'planned',
  notes: '',
};

test('Schedule prefill preserves the Compass duration while leaving Schedule-owned date and time alone', () => {
  const draft = applyStudySchedulePrefill(BASE, {
    topic: "Newton's Third Law",
    title: "Repair the foundation: Newton's Third Law",
    duration: 6,
    kind: 'study',
    status: 'planned',
    notes: 'Learning Compass recommendation — repair this first.',
  });

  assert.equal(draft.duration, 6);
  assert.equal(draft.date, BASE.date);
  assert.equal(draft.startTime, BASE.startTime);
  assert.equal(draft.subject, '');
  assert.equal(draft.topic, "Newton's Third Law");
});

test('duration options always include an exact recommendation rather than silently rounding it', () => {
  assert.deepEqual(studyScheduleDurationOptions(6).filter((value) => value <= 20), [5, 6, 10, 15, 20]);
  assert.equal(normalizeStudyScheduleDuration(6), 6);
  assert.equal(normalizeStudyScheduleDuration(0, 20), 20);
  assert.equal(normalizeStudyScheduleDuration(5000), 1440);
});

test('prefill cannot smuggle arbitrary kind/status or overwrite a real subject with blank text', () => {
  const draft = applyStudySchedulePrefill({ ...BASE, subject: 'Physics' }, {
    subject: '   ',
    title: 'Review forces',
    duration: 20,
    kind: 'mastery',
    status: 'verified',
  });
  assert.equal(draft.subject, 'Physics');
  assert.equal(draft.kind, 'study');
  assert.equal(draft.status, 'planned');
});
