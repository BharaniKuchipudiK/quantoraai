import { applyCors, isRateLimited } from "./rate-limit.js";
import { requireActiveSession } from "./authz.js";
import {
  resolveActiveStudyConcept,
  saveStudyMasteryEstimate,
} from "./store.js";
import {
  completeStudyEvidenceAttempt,
  issueStudyEvidenceAttempt,
  readStudyUsedAssessmentItemRefs,
  type StudyAssessmentEvidenceKind,
} from './study-assessment-evidence-runtime.js';
import {
  findStudyAssessmentItem,
  publicStudyAssessmentItem,
  studyAssessmentItemsForConcept,
  type StudyAssessmentItem,
} from "./study-assessment-items.js";
import { verifyStudyAssessmentRelease } from './study-assessment-governance.js';
import {
  selectStudyAssessmentItem,
  studyEvidenceKindForAssessmentItem,
} from './study-assessment-selector.js';
import { readVerifiedStudyMasteryEvidence } from './study-evidence-loader.js';
import { estimateStudyMastery } from "./study-mastery-estimator.js";
import { buildStudyLearnerModel, type StudyLearnerModel } from "./study-learner-model.js";
import { readActiveStudyConceptById } from './study-concept-runtime.js';
import { resolveStudyTransferAttempt } from './study-transfer-intelligence.js';

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPTION_ID = /^[a-z0-9][a-z0-9._:-]*$/i;
const ITEM_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]*@[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const MAX_SESSION_EXCLUSIONS = 20;
const ATTEMPT_TTL_MS = 15 * 60 * 1000;

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeExcludedItemRefs(value: unknown): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_SESSION_EXCLUSIONS) return null;
  const refs: string[] = [];
  for (const raw of value) {
    const ref = clean(raw, 220);
    if (!ITEM_REF.test(ref)) return null;
    if (!refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

export type StudyAssessmentIssueRequest = {
  action: "issue";
  conceptKey: string;
  conceptLabel: string;
  sessionId: string;
  /**
   * Session-local reservation only. The browser may ask the server to skip
   * already-issued item/version refs, but it can never make an unreleased or
   * previously-submitted item eligible. Server governance and freshness remain
   * authoritative.
   */
  excludeItemRefs?: string[];
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
    const excludeItemRefs = normalizeExcludedItemRefs(input.excludeItemRefs);
    if (!conceptKey || !conceptLabel || !SESSION_ID.test(sessionId) || excludeItemRefs === null) return null;
    const request: StudyAssessmentIssueRequest = { action: "issue", conceptKey, conceptLabel, sessionId };
    if (excludeItemRefs.length) request.excludeItemRefs = excludeItemRefs;
    return request;
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

function noFreshItemResponse(
  res: any,
  candidates: StudyAssessmentItem[],
  learnerModel: StudyLearnerModel | null,
) {
  const hasReleasedCandidate = candidates.some((candidate) => verifyStudyAssessmentRelease(candidate).canIssueVerifiedAttempt);
  const activeDiagnosis = learnerModel?.misconception.code || null;
  if (activeDiagnosis) {
    return res.status(422).json({
      error: "A fresh reviewed confirmation check for this misconception is not available yet.",
      code: "verified_misconception_confirmation_unavailable",
      fallbackAllowed: true,
    });
  }
  if (learnerModel?.nextLearningMove.type === 'retention_probe') {
    return res.status(422).json({
      error: "A fresh reviewed item is not available for this delayed retention check yet.",
      code: "verified_retention_probe_unavailable",
      fallbackAllowed: true,
    });
  }
  if (hasReleasedCandidate) {
    return res.status(422).json({
      error: "No fresh reviewed assessment item remains for this topic yet.",
      code: "verified_assessment_bank_exhausted",
      fallbackAllowed: true,
    });
  }
  return res.status(422).json({
    error: "This mapped topic does not have a released assessment item yet.",
    code: "verified_assessment_unavailable",
    fallbackAllowed: true,
  });
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

    const candidates = studyAssessmentItemsForConcept(concept.canonicalKey);
    let priorEvidence = await readVerifiedStudyMasteryEvidence(userSub, concept.id, concept.canonicalKey);
    let priorLearnerModel: StudyLearnerModel | null = null;
    if (priorEvidence) {
      const priorEstimate = estimateStudyMastery(priorEvidence);
      priorLearnerModel = buildStudyLearnerModel({
        conceptId: concept.id,
        conceptKey: concept.canonicalKey,
        evidence: priorEvidence,
        estimate: priorEstimate,
      });
    } else {
      // Do not invent a learner state when validation storage is unavailable.
      // Any accidental repeat is still non-independent at the grading boundary.
      priorEvidence = [];
    }

    let item: StudyAssessmentItem | null = null;
    let attemptConcept = concept;
    let evidenceKind: StudyAssessmentEvidenceKind = 'assessment_item';
    let evidenceConceptId: string | null = null;
    let retentionAnchorAt: string | null = null;
    let transferSource: { key: string; label: string } | null = null;

    if (priorLearnerModel?.nextLearningMove.type === 'transfer_task') {
      const transfer = await resolveStudyTransferAttempt({
        userSub,
        sourceConcept: concept,
      });
      if (transfer.status === 'unavailable') {
        return res.status(503).json({ error: "Verified transfer checks are temporarily unavailable." });
      }
      if (transfer.status === 'none') {
        return res.status(422).json({
          error: "A governed novel-context transfer check is not available for this topic yet.",
          code: "verified_transfer_unavailable",
          fallbackAllowed: true,
          nextRetentionAt: priorLearnerModel.retention.dueAt || null,
        });
      }
      item = transfer.plan.item;
      if (request.excludeItemRefs?.includes(`${item.key}@${item.version}`)) {
        return res.status(422).json({
          error: "No additional fresh governed transfer item is available for this assessment session.",
          code: "verified_transfer_unavailable",
          fallbackAllowed: true,
        });
      }
      attemptConcept = transfer.plan.targetConcept;
      evidenceKind = 'transfer';
      evidenceConceptId = concept.id;
      transferSource = { key: concept.canonicalKey, label: concept.label };
    } else {
      if (priorLearnerModel?.nextLearningMove.type === 'retention_probe') {
        if (priorLearnerModel.retention.due !== true) {
          return res.status(422).json({
            error: "This retention check is not due yet. Waiting is part of the evidence.",
            code: "verified_retention_probe_not_due",
            retryAt: priorLearnerModel.retention.dueAt || null,
            fallbackAllowed: false,
          });
        }
        if (!priorLearnerModel.retention.anchorAt) {
          return res.status(503).json({ error: "The retention evidence anchor is unavailable." });
        }
        evidenceKind = 'retention_probe';
        retentionAnchorAt = priorLearnerModel.retention.anchorAt;
      }

      // The V7 grading RPC treats one learner + item/version as the independence
      // boundary across all evidence kinds and concepts. Ask only about the
      // governed candidates we might issue; this stays exact without a history
      // scan or a correctness-breaking pagination cap. Session-local exclusions
      // can only remove candidates; they can never make an unsafe item eligible.
      const usedItemRefs = await readStudyUsedAssessmentItemRefs(
        userSub,
        candidates.map((candidate) => `${candidate.key}@${candidate.version}`),
      );
      if (usedItemRefs === null) {
        return res.status(503).json({ error: "Verified Study item freshness could not be checked right now." });
      }
      for (const itemRef of request.excludeItemRefs || []) usedItemRefs.add(itemRef);

      item = selectStudyAssessmentItem({
        items: candidates,
        evidence: priorEvidence,
        learnerModel: priorLearnerModel,
        usedItemRefs,
      });
      if (!item) return noFreshItemResponse(res, candidates, priorLearnerModel);

      if (priorLearnerModel?.nextLearningMove.type === 'vary_evidence') {
        evidenceKind = studyEvidenceKindForAssessmentItem(item);
      }
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
    const issued = await issueStudyEvidenceAttempt({
      userSub,
      sessionId: request.sessionId,
      conceptId: attemptConcept.id,
      itemKey: item.key,
      itemVersion: item.version,
      optionIds: item.options.map((option) => option.id),
      correctOptionId: item.correctOptionId,
      misconceptionOptionIds: item.misconceptionOptionIds,
      difficulty: item.difficulty,
      expiresAt,
      evidenceKind,
      evidenceConceptId,
      retentionAnchorAt,
    });
    if (issued.status === 'conflict') {
      return res.status(409).json({
        error: issued.reason === 'already_active'
          ? "This reviewed check is already active from another request. Request the check again after it expires or complete the active one."
          : "This reviewed item was completed by another request before issuance finished. Request a new check.",
        code: 'verified_assessment_freshness_changed',
        reason: issued.reason,
        retryable: true,
      });
    }
    if (issued.status !== "issued") {
      const migrationNeeded = evidenceKind === 'retention_probe' || evidenceKind === 'transfer';
      return res.status(503).json({
        error: migrationNeeded
          ? "This verified evidence mode is not available until the Study V7 data migration is active."
          : "Verified Study checks are temporarily unavailable.",
        code: migrationNeeded ? 'study_v7_migration_required' : undefined,
      });
    }

    return res.status(201).json({
      attemptId: issued.attemptId,
      expiresAt,
      concept: { key: attemptConcept.canonicalKey, label: attemptConcept.label },
      evidenceKind: issued.evidenceKind,
      evidenceFor: transferSource || { key: concept.canonicalKey, label: concept.label },
      item: publicStudyAssessmentItem(item),
    });
  }

  if (isRateLimited(`study-assessment:grade:${userSub}`, 60, 60_000)) {
    return res.status(429).json({ error: "Too many Study answers. Please wait a minute and try again." });
  }
  const observedAt = new Date().toISOString();
  const grade = await completeStudyEvidenceAttempt({
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

  const evidenceConceptId = grade.evidenceConceptId || grade.conceptId;
  let evidenceConcept: { id: string; canonicalKey: string; label: string } | null = null;
  if (evidenceConceptId === grade.conceptId) {
    evidenceConcept = { id: evidenceConceptId, canonicalKey: item.conceptKey, label: item.conceptKey };
  } else {
    const resolved = await readActiveStudyConceptById(evidenceConceptId);
    if (resolved && resolved !== 'unavailable') evidenceConcept = resolved;
  }

  const evidence = evidenceConcept
    ? await readVerifiedStudyMasteryEvidence(userSub, evidenceConcept.id, evidenceConcept.canonicalKey)
    : null;
  const estimate = evidence ? estimateStudyMastery(evidence) : null;
  const masteryUpdated = estimate && evidenceConcept
    ? await saveStudyMasteryEstimate({ userSub, conceptId: evidenceConcept.id, estimate })
    : false;
  const learnerModel = estimate && evidence && evidenceConcept
    ? buildStudyLearnerModel({
        conceptId: evidenceConcept.id,
        conceptKey: evidenceConcept.canonicalKey,
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
    evidenceKind: grade.evidenceKind,
    delayDays: grade.delayDays,
    evidenceConcept: evidenceConcept ? {
      key: evidenceConcept.canonicalKey,
      label: evidenceConcept.label,
    } : null,
    transferTarget: grade.evidenceKind === 'transfer' ? item.conceptKey : null,
    masteryUpdated,
    mastery: estimate ? {
      status: estimate.status,
      learningState: learningState(learnerModel),
      evidenceCount: estimate.evidenceCount,
    } : null,
    learnerModel,
  });
}
