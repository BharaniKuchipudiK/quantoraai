import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function repoFile(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function compact(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function firstExecutableSql(value: string): string {
  return value
    .replace(/^\s*(?:(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/\s*))*/u, '')
    .trimStart();
}

function assertContainsAll(value: string, fragments: string[]) {
  const normalized = compact(value);
  for (const fragment of fragments) {
    assert.ok(
      normalized.includes(compact(fragment)),
      `missing Study V7 production-contract fragment: ${fragment}`,
    );
  }
}

test('V7 migration owns the production evidence schema, race guard, atomic grade RPC, and least-privilege grants', async () => {
  const migration = await repoFile('supabase/migrations/20260831143000_study_retention_transfer_evidence.sql');

  assertContainsAll(migration, [
    "add column if not exists evidence_kind text not null default 'assessment_item'",
    'add column if not exists evidence_concept_id uuid references public.study_concepts(id) on delete restrict',
    'add column if not exists retention_anchor_at timestamptz',
    'study_assessment_attempts_evidence_kind_check',
    'study_assessment_attempts_retention_anchor_check',
    "evidence_kind = 'transfer' and evidence_concept_id is not null and evidence_concept_id <> concept_id",
    "evidence_kind <> 'transfer' and evidence_concept_id is null",
    'study_assessment_attempts_evidence_concept_time_idx',
    'study_assessment_attempts_owner_item_submitted_idx',
    'study_assessment_attempts_owner_item_open_idx',
    'create or replace function public.guard_study_assessment_attempt_issue()',
    "new.user_sub || ':' || new.item_key || '@' || new.item_version",
    'study_assessment_item_already_submitted',
    'study_assessment_item_already_active',
    'before insert on public.study_assessment_attempts',
    'drop function if exists public.complete_study_assessment_attempt(text, uuid, text, timestamptz)',
    'result_evidence_kind text',
    'result_evidence_concept_id uuid',
    'result_delay_days integer',
    'v_event_concept_id := coalesce(v_attempt.evidence_concept_id, v_attempt.concept_id)',
    "p_user_sub || ':' || v_attempt.item_key || '@' || v_attempt.item_version",
    "item_ref = v_attempt.item_key || '@' || v_attempt.item_version",
    "when v_attempt.evidence_kind = 'retention_probe' and v_attempt.retention_anchor_at is not null",
    'insert into public.study_mastery_events',
    'grant execute on function public.guard_study_assessment_attempt_issue() to service_role',
    'grant execute on function public.complete_study_assessment_attempt(text, uuid, text, timestamptz) to service_role',
  ]);

  assert.match(migration, /revoke all on function public\.guard_study_assessment_attempt_issue\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.complete_study_assessment_attempt\(text, uuid, text, timestamptz\)[\s\S]*from public, anon, authenticated/i);
});

test('V7 drift repair cannot regress the non-transfer null-target invariant', async () => {
  const repair = await repoFile('supabase/migrations/20260901034940_study_v7_transfer_constraint_drift.sql');

  assertContainsAll(repair, [
    'drop constraint if exists study_assessment_attempts_transfer_concept_check',
    'add constraint study_assessment_attempts_transfer_concept_check',
    "evidence_kind = 'transfer' and evidence_concept_id is not null and evidence_concept_id <> concept_id",
    "evidence_kind <> 'transfer' and evidence_concept_id is null",
    'not valid',
    'validate constraint study_assessment_attempts_transfer_concept_check',
  ]);
});

test('V7 evidence-concept foreign key keeps a concept-leading support index', async () => {
  const migration = await repoFile('supabase/migrations/20260901075807_study_v7_evidence_concept_fk_index.sql');

  assertContainsAll(migration, [
    'create index if not exists study_assessment_attempts_evidence_concept_idx',
    'on public.study_assessment_attempts (evidence_concept_id)',
    'where evidence_concept_id is not null',
  ]);
});

test('V7 runtime keeps partial-rollout fallback ordinary-only and transfer governance fail-closed', async () => {
  const runtime = await repoFile('api/_lib/study-assessment-evidence-runtime.ts');
  const transfer = await repoFile('api/_lib/study-transfer-intelligence.ts');

  assertContainsAll(runtime, [
    'isMissingStudyV7Schema(response, detail)',
    "entry.evidenceKind !== 'retention_probe'",
    "entry.evidenceKind !== 'transfer'",
    "if (!response) return { status: 'unavailable' }",
  ]);
  assertContainsAll(transfer, [
    'relation=eq.supports_transfer_to',
    'confidence=gte.${MIN_TRANSFER_CONFIDENCE}',
    "candidateItem.cognitiveOperation === 'application'",
    'verifyStudyAssessmentRelease(candidateItem).canIssueVerifiedAttempt',
    'readVerifiedStudyMasteryEvidence',
    'readStudyUsedAssessmentItemRefs',
  ]);
});

test('production canary is rollback-only and proves ordinary, replay, retention, transfer, freshness, and negative constraints', async () => {
  const canary = await repoFile('supabase/canaries/study_v7_production_canary.sql');
  const normalized = compact(canary);
  const executable = firstExecutableSql(canary);

  assert.match(executable, /^begin;/i);
  assert.match(canary.trim(), /rollback;$/i);
  assert.doesNotMatch(canary, /\bcommit\s*;/i);
  assertContainsAll(canary, [
    'study_assessment_item_already_active',
    'study_assessment_item_already_submitted',
    "result_status <> 'graded'",
    "result_status <> 'already_submitted'",
    "result_evidence_kind is distinct from 'retention_probe'",
    'result_delay_days is distinct from 7',
    "event_kind = 'retention_probe'",
    "result_evidence_kind is distinct from 'transfer'",
    "event_kind = 'transfer'",
    'exception when check_violation then null',
  ]);
  assert.ok(normalized.includes("relation = 'supports_transfer_to'"));
  assert.ok(normalized.includes('confidence >= 0.8'));
});
