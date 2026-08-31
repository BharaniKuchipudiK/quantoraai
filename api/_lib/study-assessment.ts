import { applyCors, isRateLimited } from "./rate-limit.js";
import { requireActiveSession } from "./authz.js";
import {
  completeStudyAssessmentAttempt,
  issueStudyAssessmentAttempt,
  resolveActiveStudyConcept,
  saveStudyMasteryEstimate,
} from "./store.js";
import {
  findStudyAssessmentItem,
  publicStudyAssessmentItem,
  studyAssessmentItemsForConcept,
} from "./study-assessment-items.js";
import { verifyStudyAssessmentRelease } from './study-assessment-governance.js';
import { readVerifiedStudyMasteryEvidence } from './study-evidence-loader.js';
import { estimateStudyMastery } from "./study-mastery-estimator.js";
import { buildStudyLearnerModel, type StudyLearnerModel } from "./study-learner-model.js";

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPTION_ID = /^[a-z0-9][a-z0-9._:-]*$/i;
const ATTEMPT_TTL_MS = 15 * 60 * 1000;

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export type StudyAssessmentIssueRequest = {
  action: "issue";
  conceptKey: string;
  conceptLabel: string;
  sessionId: string;
};

export type StudyAssessmentGradeRequest = {
  action: "grade";
  attemptId: string;
  optionId: string;
};

export function normalizeStudyAssessmentRequest(
  value: unknown,
): StudyAssessmentIssueRequest | StudyAssessmentGradeRequest | null {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (input.action === "issue") {
    const conceptKey = clean(input.conceptKey, 160).toLowerCase();
    const conceptLabel = clean(input.conceptLabel, 300).replace(/[%*]/g, "");
    const sessionId = clean(input.sessionId, 128);
    if (!conceptKey || !conceptLabel || !SESSION_ID.test(sessionId)) return null;
    return { action: "issue", conceptKey, conceptLabel, sessionId };
  }
  if (input.action === "grade") {
    const attemptId = clean(input.attemptId, 64).toLowerCase();
    const optionId = clean(input.optionId, 40).toLowerCase();
    if (!ATTEMPT_ID.test(attemptId) || !OPTION_ID.test(optionId)) return null;
    return { action: "grade", attemptId, optionId };
  }
  return null;
}

function learningState(model: StudyLearnerModel | null): string {
  if (!model || model.understanding.state === "unverified") return "unverified";
  if (model.misconception.state === "signal_observed") return "misconception_detected";
  if (model.understanding.state === "verified") return "verified_understanding";
  return "emerging_understanding";
}

export default async function studyAssessmentHandler(req: any, res: any) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const userSub = auth.value.sessionUser?.sub;
  if (!userSub) return res.status(401).json({ error: "Sign in to continue.", requiresAuth: true });

  const request = normalizeStudyAssessmentRequest(req.body);
  if (!request) return res.status(400).json({ error: "Invalid Study assessment request." });

  if (request.action === "issue") {
    if (isRateLimited(`study-assessment:issue:${userSub}`, 20, 60_000)) {
      return res.status(429).json({ error: "Too many Study checks. Please wait a minute and try again." });
    }
    const concept = await resolveActiveStudyConcept(request);
    if (concept === "unavailable") {
      return res.status(503).json({ error: "Verified Study checks are temporarily unavailable." });
    }
    if (!concept) {
      return res.status(422).json({
        error: "This topic is not mapped to a reviewed assessment yet.",
        code: "verified_assessment_unavailable",
        fallbackAllowed: true,
      });
    }
    const item = studyAssessmentItemsForConcept(concept.canonicalKey)[0];
    if (!item) {
      return res.status(422).json({
        error: "This mapped topic does not have a released assessment item yet.",
        code: "verified_assessment_unavailable",
        fallbackAllowed: true,
      });
    }
    const release = verifyStudyAssessmentRelease(item);
    if (!release.canIssueVerifiedAttempt) {
      console.warn("Study assessment release blocked by governance", {
        itemRef: release.itemRef,
        releaseMode: release.releaseMode,
        reasonCodes: release.reasonCodes,
      });
      return res.status(422).json({
        error: "This assessment is not approved for verified learning.",
        code: "verified_assessment_unavailable",
        fallbackAllowed: true,
      });
    }
    const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS).toISOString();
    const issued = await issueStudyAssessmentAttempt({
      userSub,
      sessionId: request.sessionId,
      conceptId: concept.id,
      itemKey: item.key,
      itemVersion: item.version,
      optionIds: item.options.map((option) => option.id),
      correctOptionId: item.correctOptionId,
      misconceptionOptionIds: item.misconceptionOptionIds,
      difficulty: item.difficulty,
      expiresAt,
    });
    if (issued.status !== "issued") {
      return res.status(503).json({ error: "Verified Study checks are temporarily unavailable." });
    }
    return res.status(201).json({
      attemptId: issued.attemptId,
      expiresAt,
      concept: { key: concept.canonicalKey, label: concept.label },
      item: publicStudyAssessmentItem(item),
    });
  }

  if (isRateLimited(`study-assessment:grade:${userSub}`, 60, 60_000)) {
    return res.status(429).json({ error: "Too many Study answers. Please wait a minute and try again." });
  }
  const observedAt = new Date().toISOString();
  const grade = await completeStudyAssessmentAttempt({
    userSub,
    attemptId: request.attemptId,
    optionId: request.optionId,
    observedAt,
  });
  if (grade === "unavailable") {
    return res.status(503).json({ error: "Your answer could not be graded right now. It has not been counted." });
  }
  if (grade.status === "not_found") return res.status(404).json({ error: "Assessment attempt not found." });
  if (grade.status === "expired") return res.status(410).json({ error: "This assessment expired. Request a new check." });
  if (grade.status === "invalid_option") return res.status(400).json({ error: "That answer option is invalid." });
  if (!grade.conceptId || !grade.itemKey || !grade.itemVersion || grade.correct == null) {
    return res.status(503).json({ error: "The graded result was incomplete. It has not changed mastery." });
  }

  const item = findStudyAssessmentItem(grade.itemKey, grade.itemVersion);
  if (!item) return res.status(503).json({ error: "The assessment version is no longer available." });
  const evidence = await readVerifiedStudyMasteryEvidence(userSub, grade.conceptId, item.conceptKey);
  const estimate = evidence ? estimateStudyMastery(evidence) : null;
  const masteryUpdated = estimate
    ? await saveStudyMasteryEstimate({ userSub, conceptId: grade.conceptId, estimate })
    : false;
  const learnerModel = estimate && evidence
    ? buildStudyLearnerModel({
        conceptId: grade.conceptId,
        conceptKey: item.conceptKey,
        evidence,
        estimate,
      })
    : null;

  return res.status(200).json({
    recorded: true,
    duplicate: grade.status === "already_submitted",
    correct: grade.correct,
    score: grade.score,
    misconceptionSignal: grade.misconception === true,
    explanation: item.explanation,
    evidenceKind: "assessment_item",
    masteryUpdated,
    mastery: estimate ? {
      status: estimate.status,
      learningState: learningState(learnerModel),
      evidenceCount: estimate.evidenceCount,
      // The UI receives one evidence-backed state, not a grade-local shadow state.
    } : null,
    learnerModel,
  });
}
