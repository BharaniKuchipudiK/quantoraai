import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createStudyAdaptiveMissionState, transitionStudyAdaptiveMission } from './study-adaptive-mission.js';
import { makeStudyContinuityCheckpoint, studyContinuityResumeEvents } from './study-session-continuity.js';

const now = Date.parse('2026-09-10T11:00:00Z');
const scope = { sessionId: 'continuity-chat', topic: "Newton's third law", now };
for (const phase of ['explain', 'guided_practice', 'verified_check', 'review']) {
  test(`the actual mission reducer restores ${phase} without accepting cached evidence`, () => {
    const saved = makeStudyContinuityCheckpoint({
      sessionId: scope.sessionId, now,
      mission: { status: 'active', phase, source: 'compass', label: scope.topic, topicAligned: true, conceptId: 'untrusted-id', conceptKey: 'different.concept', verifiedOutcome: 'correct', verifiedAttemptId: 'old-grade' },
    });
    // This was the pre-PR12 remount behavior: all mission position is lost.
    assert.equal(createStudyAdaptiveMissionState().phase, 'idle');
    const resumed = studyContinuityResumeEvents(saved, scope).reduce(transitionStudyAdaptiveMission, createStudyAdaptiveMissionState());
    assert.equal(resumed.phase, phase === 'review' ? 'verified_check' : phase);
    assert.equal(resumed.status, 'active');
    assert.equal(resumed.label, scope.topic);
    assert.equal(resumed.verifiedOutcome, null);
    assert.equal(resumed.verifiedAttemptId, '');
    assert.equal(resumed.conceptKey, '');
    assert.equal(resumed.repairRequired, false);
    assert.notEqual(transitionStudyAdaptiveMission(resumed, { type: 'REVIEW_SENT' }).status, 'completed');
  });
}

test('session identity reaches the mounted shell and both resume controls are wired', () => {
  const workspace = fs.readFileSync(new URL('../components/StudyTutorWorkspace.jsx', import.meta.url), 'utf8');
  const shell = fs.readFileSync(new URL('../components/StudyTutorShell.jsx', import.meta.url), 'utf8');
  const hook = fs.readFileSync(new URL('../hooks/useStudySessionContinuity.js', import.meta.url), 'utf8');
  assert.match(workspace, /<StudyTutorShell\s+sessionId=\{activeSessionId\}/);
  assert.match(shell, /useStudySessionContinuity\(\{ sessionId, topic, mission, dispatchMission \}\)/);
  assert.match(shell, /onClick=\{continuity.resume\}/);
  assert.match(shell, /onClick=\{continuity.discard\}/);
  assert.match(hook, /identity.scopeId !== scopeId/);
  assert.match(hook, /currentMission.current\?\.status !== 'idle'/);
  assert.match(hook, /active = false; controller.abort\(\)/);
  assert.doesNotMatch(hook, /\/api\/chat|\/api\/study-assessment|onSend|onAsk|VERIFIED_RESULT/);
});
