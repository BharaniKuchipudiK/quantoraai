import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  advanceStudyReinforcement,
  createStudyReinforcementState,
  deriveStudyReinforcement,
  shouldSuppressStudyReinforcement,
} from './study-reinforcement.js';

const conceptKey = 'physics.kinematics.motion-graphs';
const scopeKey = JSON.stringify(['session-a', conceptKey]);
function grade(n = 1, overrides = {}) {
  return {
    recorded: true, duplicate: false, correct: true, evidenceKind: 'assessment_item',
    evidenceConcept: { key: conceptKey },
    learnerModel: {
      concept: { key: conceptKey },
      understanding: { state: 'emerging', evidenceCount: n, observedThrough: `2026-09-10T00:00:${String(n % 60).padStart(2, '0')}.000Z` },
      misconception: { state: 'none_observed', code: null, signalCount: 0, lastResolvedCode: null },
    },
    ...overrides,
  };
}
function event(n = 1, overrides = {}) {
  return { result: grade(n), attemptId: `attempt-${n}`, itemRef: `item-${n}@1`, scopeKey, resultScopeKey: scopeKey, hintDepth: 0, ...overrides };
}
const step = (state, n, overrides) => advanceStudyReinforcement(state, event(n, overrides));
function recognition(result, options = {}) {
  return deriveStudyReinforcement(result, { hintDepth: 0, ...options });
}

test('ordinary correctness is quiet; missing, malformed, failed and replayed grades never earn praise', () => {
  for (const result of [null, {}, grade(), grade(1, { correct: false }), grade(1, { recorded: false }),
    grade(1, { recorded: undefined }), grade(1, { duplicate: true }), grade(1, { duplicate: undefined }),
    grade(1, { evidenceKind: 'prediction' }), grade(1, { evidenceKind: 'self_confidence' }), grade(1, { evidenceConcept: null })]) {
    assert.equal(recognition(result), null);
  }
});

test('fresh retrieval gets restrained, no-hint-specific feedback', () => {
  const result = grade(1, { evidenceKind: 'retrieval' });
  assert.equal(recognition(result)?.kind, 'retrieval');
  for (const hintDepth of [null, undefined, 1, 6, '0', -1, NaN]) {
    assert.equal(deriveStudyReinforcement(result, { hintDepth }), null);
  }
});

test('delayed retention requires a real, bounded delay and no observed hints', () => {
  const result = grade(1, { evidenceKind: 'retention_probe', delayDays: 7 });
  assert.equal(recognition(result)?.kind, 'return');
  assert.match(recognition(result).detail, /7 delayed days/);
  assert.match(recognition({ ...result, delayDays: 1 }).detail, /1 delayed day\./);
  for (const delayDays of [null, undefined, 0, -1, '7', Infinity, 1.5, 36501]) {
    assert.equal(recognition({ ...result, delayDays }), null);
  }
  assert.equal(recognition(result, { hintDepth: 1 }), null);
});

test('transfer recognition requires a distinct server target, not a renamed current topic', () => {
  const result = grade(1, { evidenceKind: 'transfer', transferTarget: 'physics.kinematics.motion-in-plane' });
  assert.equal(recognition(result)?.kind, 'transfer');
  assert.equal(recognition({ ...result, transferTarget: conceptKey }), null);
  assert.equal(recognition({ ...result, transferTarget: null }), null);
  assert.equal(recognition(result, { hintDepth: null }), null);
});

test('a historical resolved misconception code does not celebrate another repair', () => {
  const result = grade();
  result.learnerModel.misconception = { state: 'cleared', code: null, signalCount: 0, lastResolvedCode: 'representation_misread' };
  assert.equal(recognition(result), null);
});

test('only an observed confirmed-to-cleared transition acknowledges misconception correction', () => {
  const before = grade(1, { correct: false });
  before.learnerModel.misconception = { state: 'signal_observed', code: 'representation_misread', signalCount: 2 };
  const state = step(createStudyReinforcementState(scopeKey), 1, { result: before });
  const after = grade(2);
  after.learnerModel.misconception = { state: 'cleared', code: null, signalCount: 0, lastResolvedCode: 'representation_misread' };
  const repaired = step(state, 2, { result: after });
  assert.equal(repaired.feedback?.kind, 'repair');
  const later = grade(3);
  later.learnerModel.misconception = after.learnerModel.misconception;
  assert.equal(step(repaired, 3, { result: later }).feedback, null);
  after.learnerModel.misconception.lastResolvedCode = 'different_code';
  assert.equal(step(state, 2, { result: after }).feedback, null);
});

test('one candidate or same-count replay cannot become a confirmed repair', () => {
  const before = grade(1, { correct: false });
  before.learnerModel.misconception = { state: 'signal_observed', code: 'sign_direction', signalCount: 1 };
  const state = step(createStudyReinforcementState(scopeKey), 1, { result: before });
  const after = grade(2);
  after.learnerModel.misconception = { state: 'cleared', lastResolvedCode: 'sign_direction' };
  assert.equal(step(state, 2, { result: after }).feedback, null);
  before.learnerModel.misconception.signalCount = 2;
  const confirmed = step(createStudyReinforcementState(scopeKey), 1, { result: before });
  after.learnerModel.understanding.evidenceCount = 1;
  assert.equal(step(confirmed, 2, { result: after }).feedback, null);
});

test('verified progress needs a fresh server transition, never first-load mastery or a correct answer alone', () => {
  const initial = step(createStudyReinforcementState(scopeKey), 1);
  const result = grade(2, { masteryUpdated: true, mastery: { status: 'established', learningState: 'verified_understanding' } });
  result.learnerModel.understanding.state = 'verified';
  assert.equal(step(initial, 2, { result }).feedback?.kind, 'understanding');
  assert.equal(recognition(result), null);
  assert.equal(step(initial, 2, { result: { ...result, masteryUpdated: false } }).feedback, null);
  assert.equal(step(initial, 2, { result: { ...result, mastery: { status: 'provisional' } } }).feedback, null);
});

test('three distinct fresh successes create a session continuation acknowledgement, not repeated milestone spam', () => {
  let state = createStudyReinforcementState(scopeKey);
  for (let n = 1; n <= 5; n += 1) {
    state = step(state, n);
    assert.equal(state.feedback?.kind || null, n === 3 ? 'continuation' : null);
  }
  state = step(state, 6, { result: grade(6, { correct: false }) });
  assert.equal(state.correctRun, 0);
  assert.equal(state.feedback, null);
});

test('supported successes do not manufacture an independent run', () => {
  let state = step(createStudyReinforcementState(scopeKey), 1);
  state = step(state, 2, { hintDepth: 3 });
  assert.equal(state.correctRun, 0);
  state = step(state, 3);
  assert.equal(state.correctRun, 1);
  assert.equal(state.feedback, null);
});

test('attempt and item identities each prevent replay, even with fresh object identity', () => {
  const e = event(1, { result: grade(1, { evidenceKind: 'retrieval' }) });
  const state = advanceStudyReinforcement(createStudyReinforcementState(scopeKey), e);
  assert.equal(state.feedback?.kind, 'retrieval');
  assert.equal(advanceStudyReinforcement(state, structuredClone(e)), state);
  const switched = step(state, 2, { itemRef: e.itemRef });
  assert.equal(switched.feedback, null);
  assert.equal(advanceStudyReinforcement(switched, e).feedback, null);
  assert.equal(step(state, 2, { attemptId: e.attemptId }).feedback, null);
  assert.equal(state.correctRun, 1);
});

test('loading a next question clears the display but preserves only bounded comparison state', () => {
  const state = step(createStudyReinforcementState(scopeKey), 1, { result: grade(1, { evidenceKind: 'retrieval' }) });
  const cleared = advanceStudyReinforcement(state, { scopeKey, resultScopeKey: scopeKey, result: null });
  assert.equal(cleared.feedback, null);
  assert.equal(cleared.previous, state.previous);
  assert.equal(cleared.attempts.length, 1);
  assert.equal(step(cleared, 1).feedback, null);
});

test('at-end feedback is consumed without rendering and never reappears on close or summary', () => {
  const e = event(1, { result: grade(1, { evidenceKind: 'retrieval' }), suppressed: true });
  const state = advanceStudyReinforcement(createStudyReinforcementState(scopeKey), e);
  assert.equal(state.feedback, null);
  assert.equal(state.attempts.length, 1);
  assert.equal(advanceStudyReinforcement(state, { ...e, suppressed: false }).feedback, null);
  for (const phase of ['loading', 'running', 'batch']) assert.equal(shouldSuppressStudyReinforcement({ feedback: 'at_end', phase }), true);
  for (const phase of ['setup', 'summary']) assert.equal(shouldSuppressStudyReinforcement({ feedback: 'at_end', phase }), false);
  assert.equal(shouldSuppressStudyReinforcement({ feedback: 'after_each', phase: 'running' }), false);
});

test('session or topic change cannot inherit a run or display the previous scope before reset', () => {
  const state = step(step(createStudyReinforcementState(scopeKey), 1), 2);
  const scopeB = JSON.stringify(['session-b', conceptKey]);
  const stale = step(state, 3, { scopeKey: scopeB });
  assert.equal(stale.correctRun, 0);
  assert.equal(stale.feedback, null);
  assert.equal(stale.attempts.length, 0);
  const fresh = step(stale, 3, { scopeKey: scopeB, resultScopeKey: scopeB });
  assert.equal(fresh.correctRun, 1);
  assert.equal(fresh.feedback, null);
});

test('different evidence concepts do not combine into a streak or verified transition', () => {
  const state = step(step(createStudyReinforcementState(scopeKey), 1), 2);
  const result = grade(3, { evidenceConcept: { key: 'math.linear-functions' } });
  result.learnerModel.concept.key = 'math.linear-functions';
  const next = step(state, 3, { result });
  assert.equal(next.correctRun, 1);
  assert.equal(next.feedback, null);
});

test('out-of-order projections do not rewind the comparison baseline', () => {
  const state = step(createStudyReinforcementState(scopeKey), 3);
  const next = step(state, 4, { result: grade(2, { evidenceKind: 'retrieval' }) });
  assert.equal(next.previous, state.previous);
  assert.equal(next.attempts.length, 1);
  assert.equal(next.feedback, null);
});

test('missing and oversized event identity fails closed', () => {
  for (const overrides of [{ attemptId: '' }, { itemRef: '' }, { attemptId: 'a'.repeat(65) }, { itemRef: 'i'.repeat(221) }, { scopeKey: '' }]) {
    assert.equal(step(createStudyReinforcementState(scopeKey), 1, overrides).feedback, null);
  }
});

test('feedback bookkeeping saturates without unbounded growth or evicting replay protection', () => {
  let state = createStudyReinforcementState(scopeKey);
  for (let n = 1; n <= 140; n += 1) state = step(state, n, { result: grade(n, { learnerModel: null }) });
  assert.equal(state.attempts.length, 128);
  assert.equal(state.items.length, 128);
  const repeated = step(state, 1, { result: grade(1, { evidenceKind: 'retrieval' }) });
  assert.equal(repeated.feedback, null);
});

test('presentation is deterministic, non-mutating, and never retains answer text or a full learner model', () => {
  const e = event(1, { result: { ...grade(), explanation: 'PRIVATE LEARNER ANSWER' } });
  e.result.learnerModel.privateLabel = 'PRIVATE LEARNER LABEL';
  const state = createStudyReinforcementState(scopeKey);
  const saved = structuredClone({ state, e });
  const a = advanceStudyReinforcement(state, e);
  assert.deepEqual(a, advanceStudyReinforcement(state, e));
  assert.deepEqual({ state, e }, saved);
  assert.doesNotMatch(JSON.stringify(a), /PRIVATE LEARNER|learnerModel|explanation/);
});

test('feedback has no network, persistence, model-call or raw-interaction authority', () => {
  const source = readFileSync(new URL('./study-reinforcement.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|localStorage|sessionStorage|supabase|dispatchEvent|recordStudy|Math\.random|Date\.now|setInterval/);
});

test('the existing component owns one cleaned-up timer and immediate scope/identity display guards', () => {
  const source = readFileSync(new URL('../components/StudyReinforcement.jsx', import.meta.url), 'utf8');
  assert.match(source, /window\.clearTimeout\(timer\)/);
  assert.match(source, /\}, \[feedbackKey\]\)/);
  assert.match(source, /state\.scopeKey === scopeKey && resultScopeKey === scopeKey/);
  assert.match(source, /state\.feedback\?\.attemptId === attemptId/);
  assert.match(source, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(source, /aria-label="Dismiss learning feedback"/);
});

test('workspace stamps the grade scope and captured hint depth without changing evidence requests', () => {
  const source = readFileSync(new URL('../components/StudyTutorWorkspace.jsx', import.meta.url), 'utf8');
  assert.match(source, /feedbackScopeKey: reinforcementScope, feedbackHintDepth: hintDepth/);
  assert.match(source, /resultScopeKey=\{assessment\.feedbackScopeKey\}/);
  assert.match(source, /suppressed=\{shouldSuppressStudyReinforcement\(assessmentSession\)\}/);
  assert.match(source, /assessmentGeneration\.current !== generation/);
});

test('motion is finite, opt-in, and disabled for the card and all descendants under reduced motion', () => {
  const css = readFileSync(new URL('../components/study-h1-onboarding.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /study-h1-feedback-mark 360ms ease-out both/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.study-h1-reinforcement \*[\s\S]*animation: none;[\s\S]*transition: none;[\s\S]*transform: none;/);
  assert.doesNotMatch(css, /infinite|confetti/);
});
