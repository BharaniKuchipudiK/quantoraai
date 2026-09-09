import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudyWorkingStateSnapshot } from './study-adaptive-learning.js';
import { formatStudyCognitiveDirective, interpretStudyTurn, publicStudyCognitiveMetadata } from './study-cognitive-routing.js';

function working(hintDepth: number): StudyWorkingStateSnapshot {
  return {
    version: 'study-working-state-v1',
    temporary: true,
    conceptKey: 'math.linear-functions',
    conceptLabel: 'Linear functions',
    misconceptionCandidate: 'none',
    hintDependence: hintDepth >= 3 ? 'high' : hintDepth ? 'emerging' : 'none',
    hintDepth,
    representationPreference: null,
    recentPattern: 'neutral',
    scaffoldingNeed: hintDepth ? 'moderate' : 'low',
    observedSignals: hintDepth * 2,
    reasonCodes: [],
  };
}

const history = [{ role: 'user', text: 'We are working on linear functions and slope.' }];

test('a first explicit hint request receives only the first ladder rung', () => {
  const route = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Give me a hint',
    history,
    workingState: working(0),
  });
  assert.equal(route?.hintLadder.level, 1);
  assert.equal(route?.hintLadder.kind, 'attention_cue');
  assert.equal(route?.hintLadder.mayRevealAnswer, false);
  const directive = formatStudyCognitiveDirective(route);
  assert.match(directive, /Adaptive hint ladder: level 1 \(attention_cue\)/);
  assert.match(directive, /Do not state the method, next operation, worked step, or answer/);
});

test('a later hint request advances from bounded temporary depth, not model intuition', () => {
  const route = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Another hint please',
    history,
    workingState: working(2),
  });
  assert.equal(route?.hintLadder.level, 3);
  assert.equal(route?.hintLadder.kind, 'structural_hint');
  assert.equal(publicStudyCognitiveMetadata(route)?.hintLadder.level, 3);
});

test('a verification request cannot smuggle a hint into an independent check', () => {
  const route = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Verify my answer and give me a hint',
    history,
    workingState: working(5),
  });
  assert.equal(route?.intent, 'verify');
  assert.equal(route?.requiresVerification, true);
  assert.equal(route?.hintLadder.allowed, false);
  assert.equal(route?.hintLadder.reasonCode, 'independent_verification_protected');
  assert.match(formatStudyCognitiveDirective(route), /Do not provide a hint or answer during an independent governed verification/);
});

test('public metadata exposes bounded ladder policy but not temporary working state', () => {
  const route = interpretStudyTurn({
    studioDomain: 'education',
    message: 'Give me a clue',
    history,
    workingState: working(1),
  });
  const metadata = publicStudyCognitiveMetadata(route);
  assert.equal(metadata?.hintLadder.level, 2);
  assert.equal(metadata?.hintLadder.kind, 'directional_hint');
  assert.equal('workingState' in (metadata || {}), false);
  assert.equal('instruction' in (metadata?.hintLadder || {}), false);
});
