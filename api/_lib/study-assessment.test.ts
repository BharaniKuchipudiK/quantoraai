import assert from "node:assert/strict";
import test from "node:test";
import { createSessionToken } from "./session.js";
import studyAssessmentHandler, { normalizeStudyAssessmentRequest } from "./study-assessment.js";

process.env.SESSION_SECRET = "12345678901234567890123456789012";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const CONCEPT_ID = "22222222-2222-4222-8222-222222222222";
const OBSERVED_AT = "2026-08-26T00:00:00.000Z";

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
  const token = createSessionToken({ sub: "learner-1", email: "learner@example.com", name: "Learner", picture: "" });
  return { method: "POST", headers: { cookie: `quantora_session=${token}` }, socket: {}, body };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function submittedAttempt(correct = true) {
  return {
    id: ATTEMPT_ID,
    concept_id: CONCEPT_ID,
    item_key: "motion-graphs-velocity-slope",
    item_version: "1",
    submitted_option_id: correct ? "c" : "a",
    submitted_at: OBSERVED_AT,
    correct,
    score: correct ? 1 : 0,
  };
}

test("assessment request normalization accepts only server-supported identifiers", () => {
  assert.deepEqual(normalizeStudyAssessmentRequest({
    action: "issue", conceptKey: "Physics.Kinematics.Motion-Graphs", conceptLabel: "Motion graphs%",
    sessionId: "session-1", userSub: "forged-user",
  }), {
    action: "issue", conceptKey: "physics.kinematics.motion-graphs", conceptLabel: "Motion graphs", sessionId: "session-1",
  });
  assert.equal(normalizeStudyAssessmentRequest({ action: "issue", sessionId: "../escape" }), null);
  assert.equal(normalizeStudyAssessmentRequest({ action: "grade", attemptId: "not-a-uuid", optionId: "a" }), null);
  assert.equal(normalizeStudyAssessmentRequest({ action: "grade", attemptId: ATTEMPT_ID, optionId: "a b" }), null);
});

test("issue stores the answer server-side but returns only the public item", async () => {
  const originalFetch = global.fetch;
  let storedAttempt: any = null;
  global.fetch = async (url: any, init: any = {}) => {
    const target = String(url);
    if (target.includes("/rest/v1/users?select=")) return json([{ google_sub: "learner-1", email: "learner@example.com", blocked_at: null }]);
    if (target.includes("/rest/v1/study_concepts?") && target.includes("canonical_key=eq.physics.kinematics.motion-graphs")) {
      return json([{ id: CONCEPT_ID, canonical_key: "physics.kinematics.motion-graphs", label: "Motion graphs" }]);
    }
    if (target.includes("/rest/v1/study_mastery_events?")) return json([]);
    if (target.endsWith("/rest/v1/study_assessment_attempts") && init.method === "POST") {
      storedAttempt = JSON.parse(init.body)[0];
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    const { state, res } = responseHarness();
    await studyAssessmentHandler(authenticatedRequest({ action: "issue", conceptKey: "physics.kinematics.motion-graphs", conceptLabel: "Motion graphs", sessionId: "session-1" }), res);
    assert.equal(state.status, 201);
    assert.equal(storedAttempt.correct_option_id, "c");
    assert.equal(state.body.item.options.length, 4);
    for (const hidden of ["correctOptionId", "explanation", "misconceptionByOptionId", "reviewStatus", "releaseMode"]) assert.equal(hidden in state.body.item, false);
    assert.equal(JSON.stringify(state.body).includes("The slope is change"), false);
    assert.equal(JSON.stringify(state.body).includes("representation_misread"), false);
  } finally { global.fetch = originalFetch; }
});

test("grade requires authoritative submitted-attempt validation before evidence changes mastery", async () => {
  const originalFetch = global.fetch;
  let savedEstimate: any = null;
  let evidenceRequestUrl = "";
  global.fetch = async (url: any, init: any = {}) => {
    const target = String(url);
    if (target.includes("/rest/v1/users?select=")) return json([{ google_sub: "learner-1", email: "learner@example.com", blocked_at: null }]);
    if (target.endsWith("/rest/v1/rpc/complete_study_assessment_attempt")) {
      return json([{ result_status: "graded", result_correct: true, result_score: 1, result_concept_id: CONCEPT_ID,
        result_item_key: "motion-graphs-velocity-slope", result_item_version: "1", result_misconception: false }]);
    }
    if (target.includes("/rest/v1/study_mastery_events?")) {
      evidenceRequestUrl = target;
      return json([{ event_key: `study.assessment.${ATTEMPT_ID}`, event_kind: "assessment_item", correct: true, score: 1,
        difficulty: 0.35, hints_used: 0, independent: true, misconception_signal: false, provenance: "quantora_authored",
        source_ref: "quantora:study-assessment-bank", assessment_ref: `attempt:${ATTEMPT_ID}`,
        item_ref: "motion-graphs-velocity-slope@1", observed_at: OBSERVED_AT }]);
    }
    if (target.includes("/rest/v1/study_assessment_attempts?")) return json([submittedAttempt(true)]);
    if (target.includes("/rest/v1/study_mastery_estimates?on_conflict=")) {
      savedEstimate = JSON.parse(init.body)[0];
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    const { state, res } = responseHarness();
    await studyAssessmentHandler(authenticatedRequest({ action: "grade", attemptId: ATTEMPT_ID, optionId: "c", correct: false, score: 0, userSub: "forged-user" }), res);
    assert.equal(state.status, 200);
    assert.equal(state.body.correct, true);
    assert.equal(state.body.mastery.status, "provisional");
    assert.equal(state.body.mastery.learningState, "emerging_understanding");
    assert.equal(state.body.mastery.evidenceCount, 1);
    assert.equal(state.body.learnerModel.understanding.evidenceCount, 1);
    assert.equal(state.body.learnerModel.misconception.code, null);
    assert.equal(state.body.learnerModel.nextLearningMove.type, "vary_evidence");
    assert.equal(savedEstimate.evidence_count, 1);
    assert.match(evidenceRequestUrl, /order=observed_at\.desc/);
  } finally { global.fetch = originalFetch; }
});

test("assessment-shaped rows without a matching submitted attempt cannot change mastery", async () => {
  const originalFetch = global.fetch;
  let savedEstimate: any = null;
  global.fetch = async (url: any, init: any = {}) => {
    const target = String(url);
    if (target.includes("/rest/v1/users?select=")) return json([{ google_sub: "learner-1", email: "learner@example.com", blocked_at: null }]);
    if (target.endsWith("/rest/v1/rpc/complete_study_assessment_attempt")) {
      return json([{ result_status: "graded", result_correct: true, result_score: 1, result_concept_id: CONCEPT_ID,
        result_item_key: "motion-graphs-velocity-slope", result_item_version: "1", result_misconception: false }]);
    }
    if (target.includes("/rest/v1/study_mastery_events?")) {
      return json([{ event_key: `study.assessment.${ATTEMPT_ID}`, event_kind: "assessment_item", correct: true, score: 1,
        difficulty: 0.35, hints_used: 0, independent: true, misconception_signal: false, provenance: "quantora_authored",
        source_ref: "quantora:study-assessment-bank", assessment_ref: `attempt:${ATTEMPT_ID}`,
        item_ref: "motion-graphs-velocity-slope@1", observed_at: OBSERVED_AT }]);
    }
    if (target.includes("/rest/v1/study_assessment_attempts?")) return json([]);
    if (target.includes("/rest/v1/study_mastery_estimates?on_conflict=")) {
      savedEstimate = JSON.parse(init.body)[0];
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    const { state, res } = responseHarness();
    await studyAssessmentHandler(authenticatedRequest({ action: "grade", attemptId: ATTEMPT_ID, optionId: "c" }), res);
    assert.equal(state.status, 200);
    assert.equal(state.body.mastery.status, "insufficient_evidence");
    assert.equal(state.body.mastery.learningState, "unverified");
    assert.equal(state.body.mastery.evidenceCount, 0);
    assert.equal(state.body.learnerModel.understanding.state, "unverified");
    assert.equal(state.body.learnerModel.misconception.code, null);
    assert.equal(savedEstimate.evidence_count, 0);
  } finally { global.fetch = originalFetch; }
});
