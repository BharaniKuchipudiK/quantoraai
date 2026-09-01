import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateStudyEvidenceAdmission,
  studyAssessmentReceiptForAttestedEvidence,
} from './study-evidence-admission.js';
import { readVerifiedStudyMasteryEvidence } from './study-evidence-loader.js';

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_KEY = 'physics.kinematics.motion-graphs';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function eventRow(kind: 'retention_probe' | 'transfer', itemRef: string, delayDays: number | null) {
  return {
    event_key: `study.assessment.${ATTEMPT_ID}`,
    event_kind: kind,
    correct: true,
    score: 1,
    difficulty: 0.5,
    hints_used: 0,
    independent: true,
    misconception_signal: false,
    delay_days: delayDays,
    provenance: 'quantora_authored',
    source_ref: 'quantora:study-assessment-bank',
    assessment_ref: `attempt:${ATTEMPT_ID}`,
    item_ref: itemRef,
    observed_at: '2026-08-31T00:00:00.000Z',
  };
}

test('loader recomputes retention delay from the richer authoritative receipt', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url: any) => {
    const target = String(url);
    if (target.includes('/rest/v1/study_mastery_events?')) {
      return json([eventRow('retention_probe', 'motion-graphs-velocity-slope@1', 7)]);
    }
    if (target.includes('/rest/v1/study_assessment_attempts?')) {
      assert.match(target, /evidence_concept_id,evidence_kind,retention_anchor_at/);
      return json([{
        id: ATTEMPT_ID,
        concept_id: SOURCE_ID,
        evidence_concept_id: null,
        evidence_kind: 'retention_probe',
        retention_anchor_at: '2026-08-24T00:00:00.000Z',
        item_key: 'motion-graphs-velocity-slope',
        item_version: '1',
        submitted_option_id: 'c',
        submitted_at: '2026-08-31T00:00:00.000Z',
        correct: true,
        score: 1,
      }]);
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    const rows = await readVerifiedStudyMasteryEvidence('learner-v7', SOURCE_ID, SOURCE_KEY);
    assert.ok(rows);
    assert.equal(evaluateStudyEvidenceAdmission(rows[0]).admitted, true);
    assert.equal(studyAssessmentReceiptForAttestedEvidence(rows[0])?.delayDays, 7);
  } finally {
    global.fetch = originalFetch;
  }
});

test('loader rejects forged retention delay and transfer without the canonical edge', async () => {
  const originalFetch = global.fetch;
  let mode: 'retention' | 'transfer' = 'retention';
  global.fetch = async (url: any) => {
    const target = String(url);
    if (target.includes('/rest/v1/study_mastery_events?')) {
      return mode === 'retention'
        ? json([eventRow('retention_probe', 'motion-graphs-velocity-slope@1', 30)])
        : json([eventRow('transfer', 'vector-resultant-perpendicular@1', null)]);
    }
    if (target.includes('/rest/v1/study_assessment_attempts?')) {
      return mode === 'retention'
        ? json([{
            id: ATTEMPT_ID,
            concept_id: SOURCE_ID,
            evidence_concept_id: null,
            evidence_kind: 'retention_probe',
            retention_anchor_at: '2026-08-24T00:00:00.000Z',
            item_key: 'motion-graphs-velocity-slope',
            item_version: '1',
            submitted_option_id: 'c',
            submitted_at: '2026-08-31T00:00:00.000Z',
            correct: true,
            score: 1,
          }])
        : json([{
            id: ATTEMPT_ID,
            concept_id: TARGET_ID,
            evidence_concept_id: SOURCE_ID,
            evidence_kind: 'transfer',
            retention_anchor_at: null,
            item_key: 'vector-resultant-perpendicular',
            item_version: '1',
            submitted_option_id: 'b',
            submitted_at: '2026-08-31T00:00:00.000Z',
            correct: true,
            score: 1,
          }]);
    }
    if (target.includes('/rest/v1/study_concept_edges?')) return json([]);
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    const retention = await readVerifiedStudyMasteryEvidence('learner-v7', SOURCE_ID, SOURCE_KEY);
    assert.ok(retention);
    assert.equal(evaluateStudyEvidenceAdmission(retention[0]).admitted, false);

    mode = 'transfer';
    const transfer = await readVerifiedStudyMasteryEvidence('learner-v7', SOURCE_ID, SOURCE_KEY);
    assert.ok(transfer);
    assert.equal(evaluateStudyEvidenceAdmission(transfer[0]).admitted, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('loader admits transfer only for a receipt-backed application across a governed edge', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url: any) => {
    const target = String(url);
    if (target.includes('/rest/v1/study_mastery_events?')) {
      return json([eventRow('transfer', 'vector-resultant-perpendicular@1', null)]);
    }
    if (target.includes('/rest/v1/study_assessment_attempts?')) {
      return json([{
        id: ATTEMPT_ID,
        concept_id: TARGET_ID,
        evidence_concept_id: SOURCE_ID,
        evidence_kind: 'transfer',
        retention_anchor_at: null,
        item_key: 'vector-resultant-perpendicular',
        item_version: '1',
        submitted_option_id: 'b',
        submitted_at: '2026-08-31T00:00:00.000Z',
        correct: true,
        score: 1,
      }]);
    }
    if (target.includes('/rest/v1/study_concept_edges?')) {
      assert.match(target, /relation=eq\.supports_transfer_to/);
      return json([{ target_concept_id: TARGET_ID, confidence: 0.9 }]);
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    const rows = await readVerifiedStudyMasteryEvidence('learner-v7', SOURCE_ID, SOURCE_KEY);
    assert.ok(rows);
    assert.equal(evaluateStudyEvidenceAdmission(rows[0]).admitted, true);
    const receipt = studyAssessmentReceiptForAttestedEvidence(rows[0]);
    assert.equal(receipt?.evidenceConceptId, SOURCE_ID);
    assert.equal(receipt?.itemConceptId, TARGET_ID);
  } finally {
    global.fetch = originalFetch;
  }
});
