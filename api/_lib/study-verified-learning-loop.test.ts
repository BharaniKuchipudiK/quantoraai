import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from './session.js';
import studyAssessmentHandler from './study-assessment.js';

process.env.SESSION_SECRET = '12345678901234567890123456789012';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

const CONCEPT_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_KEY = 'motion-graphs-velocity-slope';
const ITEM_VERSION = '1';

function responseHarness() {
  const state: { status?: number; body?: any; headers: Record<string, string> } = { headers: {} };
  const res = {
    setHeader(name: string, value: string) { state.headers[name] = value; },
    status(code: number) { state.status = code; return this; },
    json(body: any) { state.body = body; return this; },
    end() { return this; },
  };
  return { state, res };
}

function authenticatedRequest(body: any) {
  const token = createSessionToken({
    sub: 'learner-1',
    email: 'learner@example.com',
    name: 'Learner',
    picture: '',
  });
  return { method: 'POST', headers: { cookie: `quantora_session=${token}` }, socket: {}, body };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

test('reviewed assessment flows atomically into admitted evidence, mastery, diagnosis, and repeat protection', async () => {
  const originalFetch = global.fetch;
  const attempts = new Map<string, any>();
  const evidenceRows: any[] = [];
  const savedEstimates: any[] = [];

  global.fetch = async (url: any, init: any = {}) => {
    const target = String(url);

    if (target.includes('/rest/v1/users?select=')) {
      return json([{ google_sub: 'learner-1', email: 'learner@example.com', blocked_at: null }]);
    }

    if (target.includes('/rest/v1/study_concepts?') && target.includes('canonical_key=eq.physics.kinematics.motion-graphs')) {
      return json([{ id: CONCEPT_ID, canonical_key: 'physics.kinematics.motion-graphs', label: 'Motion graphs' }]);
    }

    if (target.endsWith('/rest/v1/study_assessment_attempts') && init.method === 'POST') {
      const row = JSON.parse(init.body)[0];
      attempts.set(row.id, { ...row, submitted_at: null, submitted_option_id: null, correct: null, score: null });
      return new Response(null, { status: 201 });
    }

    if (target.endsWith('/rest/v1/rpc/complete_study_assessment_attempt') && init.method === 'POST') {
      const body = JSON.parse(init.body);
      const attempt = attempts.get(body.p_attempt_id);
      if (!attempt) {
        return json([{
          result_status: 'not_found', result_correct: null, result_score: null,
          result_concept_id: null, result_item_key: null, result_item_version: null,
          result_misconception: null,
        }]);
      }

      if (attempt.submitted_at) {
        return json([{
          result_status: 'already_submitted',
          result_correct: attempt.correct,
          result_score: attempt.score,
          result_concept_id: attempt.concept_id,
          result_item_key: attempt.item_key,
          result_item_version: attempt.item_version,
          result_misconception: attempt.misconception,
        }]);
      }

      if (!attempt.option_ids.includes(body.p_option_id)) {
        return json([{
          result_status: 'invalid_option', result_correct: null, result_score: null,
          result_concept_id: attempt.concept_id, result_item_key: attempt.item_key,
          result_item_version: attempt.item_version, result_misconception: null,
        }]);
      }

      const correct = body.p_option_id === attempt.correct_option_id;
      const misconception = !correct && attempt.misconception_option_ids.includes(body.p_option_id);
      const itemRef = `${attempt.item_key}@${attempt.item_version}`;
      const independent = !evidenceRows.some((row) =>
        row.event_kind === 'assessment_item' && row.item_ref === itemRef && row.independent === true,
      );

      attempt.submitted_at = body.p_observed_at;
      attempt.submitted_option_id = body.p_option_id;
      attempt.correct = correct;
      attempt.score = correct ? 1 : 0;
      attempt.misconception = misconception;

      evidenceRows.push({
        event_key: `study.assessment.${attempt.id}`,
        event_kind: 'assessment_item',
        correct,
        score: correct ? 1 : 0,
        difficulty: attempt.difficulty,
        hints_used: 0,
        response_ms: null,
        self_confidence: null,
        independent,
        misconception_signal: misconception,
        delay_days: null,
        provenance: 'quantora_authored',
        source_ref: 'quantora:study-assessment-bank',
        assessment_ref: `attempt:${attempt.id}`,
        item_ref: itemRef,
        observed_at: body.p_observed_at,
      });

      return json([{
        result_status: 'graded',
        result_correct: correct,
        result_score: correct ? 1 : 0,
        result_concept_id: attempt.concept_id,
        result_item_key: attempt.item_key,
        result_item_version: attempt.item_version,
        result_misconception: misconception,
      }]);
    }

    if (target.includes('/rest/v1/study_mastery_events?')) {
      const descending = [...evidenceRows]
        .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at));
      return json(descending);
    }

    if (target.includes('/rest/v1/study_mastery_estimates?on_conflict=')) {
      savedEstimates.push(JSON.parse(init.body)[0]);
      return new Response(null, { status: 201 });
    }

    throw new Error(`Unexpected fetch: ${target}`);
  };

  try {
    const issueOne = responseHarness();
    await studyAssessmentHandler(authenticatedRequest({
      action: 'issue',
      conceptKey: 'physics.kinematics.motion-graphs',
      conceptLabel: 'Motion graphs',
      sessionId: 'session-1',
    }), issueOne.res);

    assert.equal(issueOne.state.status, 201);
    assert.equal(issueOne.state.body.item.itemKey, ITEM_KEY);
    assert.equal(issueOne.state.body.item.itemVersion, ITEM_VERSION);
    const firstAttemptId = issueOne.state.body.attemptId;
    assert.ok(attempts.has(firstAttemptId));

    const firstGrade = responseHarness();
    await studyAssessmentHandler(authenticatedRequest({
      action: 'grade',
      attemptId: firstAttemptId,
      optionId: 'a',
    }), firstGrade.res);

    assert.equal(firstGrade.state.status, 200);
    assert.equal(firstGrade.state.body.correct, false);
    assert.equal(firstGrade.state.body.misconceptionSignal, true);
    assert.equal(firstGrade.state.body.mastery.status, 'provisional');
    assert.equal(firstGrade.state.body.mastery.learningState, 'misconception_detected');
    assert.equal(firstGrade.state.body.mastery.evidenceCount, 1);
    assert.equal(firstGrade.state.body.learnerModel.understanding.evidenceCount, 1);
    assert.equal(firstGrade.state.body.learnerModel.misconception.state, 'signal_observed');
    assert.equal(firstGrade.state.body.learnerModel.nextLearningMove.type, 'diagnose_misconception');
    assert.equal(evidenceRows.length, 1);
    assert.equal(evidenceRows[0].independent, true);
    assert.equal(evidenceRows[0].source_ref, 'quantora:study-assessment-bank');
    assert.equal(evidenceRows[0].assessment_ref, `attempt:${firstAttemptId}`);
    assert.equal(evidenceRows[0].item_ref, `${ITEM_KEY}@${ITEM_VERSION}`);

    const duplicateGrade = responseHarness();
    await studyAssessmentHandler(authenticatedRequest({
      action: 'grade',
      attemptId: firstAttemptId,
      optionId: 'c',
    }), duplicateGrade.res);

    assert.equal(duplicateGrade.state.status, 200);
    assert.equal(duplicateGrade.state.body.duplicate, true);
    assert.equal(duplicateGrade.state.body.correct, false);
    assert.equal(duplicateGrade.state.body.mastery.learningState, 'misconception_detected');
    assert.equal(duplicateGrade.state.body.mastery.evidenceCount, 1);
    assert.equal(duplicateGrade.state.body.learnerModel.nextLearningMove.type, 'diagnose_misconception');
    assert.equal(evidenceRows.length, 1, 'regrading one attempt must not append evidence');

    const issueTwo = responseHarness();
    await studyAssessmentHandler(authenticatedRequest({
      action: 'issue',
      conceptKey: 'physics.kinematics.motion-graphs',
      conceptLabel: 'Motion graphs',
      sessionId: 'session-1',
    }), issueTwo.res);
    assert.equal(issueTwo.state.status, 201);
    const secondAttemptId = issueTwo.state.body.attemptId;
    assert.notEqual(secondAttemptId, firstAttemptId);

    const repeatedItemGrade = responseHarness();
    await studyAssessmentHandler(authenticatedRequest({
      action: 'grade',
      attemptId: secondAttemptId,
      optionId: 'c',
    }), repeatedItemGrade.res);

    assert.equal(repeatedItemGrade.state.status, 200);
    assert.equal(repeatedItemGrade.state.body.correct, true);
    assert.equal(evidenceRows.length, 2);
    assert.equal(evidenceRows[1].independent, false, 'a repeated version cannot manufacture fresh independent evidence');
    assert.equal(repeatedItemGrade.state.body.mastery.learningState, 'misconception_detected');
    assert.equal(repeatedItemGrade.state.body.mastery.evidenceCount, 1);
    assert.equal(repeatedItemGrade.state.body.learnerModel.understanding.evidenceCount, 1);
    assert.equal(repeatedItemGrade.state.body.learnerModel.misconception.state, 'signal_observed');
    assert.equal(repeatedItemGrade.state.body.learnerModel.nextLearningMove.type, 'diagnose_misconception');
    assert.equal(savedEstimates.at(-1).evidence_count, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
