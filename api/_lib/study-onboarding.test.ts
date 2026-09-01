import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  normalizeStudyOnboardingInput,
  readStudyOnboardingProfile,
} from './study-onboarding.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function withSupabaseEnv() {
  const prior = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = 'https://study-onboarding.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key';
  return () => {
    if (prior.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prior.url;
    if (prior.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = prior.key;
  };
}

test('onboarding normalizes bounded self-report without learner-truth fields', () => {
  const normalized = normalizeStudyOnboardingInput({
    studyContext: 'school',
    curriculum: 'CBSE',
    level: 'Grade 11',
    subjects: ['Physics', 'Physics', 'Math'],
    goal: 'exam',
    targetExam: 'JEE',
    examDate: '2027-01-20',
    weeklyMinutes: 600,
    preferredModality: 'step_by_step',
    diagnosticOptIn: true,
  });
  assert.ok(normalized);
  assert.deepEqual(normalized.subjects, ['Physics', 'Math']);
  assert.equal(normalized.study_context, 'school');
  assert.equal(normalized.goal, 'exam');
  assert.equal(normalized.weekly_minutes, 600);
  assert.equal('mastery' in normalized, false);
  assert.equal('understanding' in normalized, false);
  assert.equal(normalizeStudyOnboardingInput({ studyContext: 'invalid' }), null);
  assert.equal(normalizeStudyOnboardingInput({ weeklyMinutes: 10081 }), null);
});

test('onboarding read is learner-scoped and projects no ownership internals', async () => {
  const restore = withSupabaseEnv();
  const originalFetch = global.fetch;
  let requestedUrl = '';
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify([{
      study_context: 'university', curriculum: 'Engineering', level_label: 'Year 2', subjects: ['Math'],
      goal: 'understand', target_exam: null, exam_date: null, weekly_minutes: 300,
      preferred_modality: 'visual', diagnostic_opt_in: false, skipped: false,
      completed_at: '2026-09-01T11:20:00.000Z', updated_at: '2026-09-01T11:20:00.000Z',
      user_sub: 'must-not-return',
    }]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const profile = await readStudyOnboardingProfile('learner:private');
    assert.ok(profile && profile !== 'unavailable');
    assert.equal(profile.studyContext, 'university');
    assert.equal(JSON.stringify(profile).includes('must-not-return'), false);
    assert.match(requestedUrl, /user_sub=eq\.learner%3Aprivate/);
    assert.doesNotMatch(requestedUrl, /study_mastery|assessment|correct_option/);
  } finally {
    global.fetch = originalFetch;
    restore();
  }
});

test('onboarding migration is server-only and explicitly outside mastery truth', () => {
  const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260901111851_study_h1_4_onboarding_context.sql'),
    'utf8',
  );
  assert.match(migration, /create table if not exists public\.study_onboarding_profiles/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.study_onboarding_profiles from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on public\.study_onboarding_profiles to service_role/);
  assert.match(migration, /Self-report is never verified mastery evidence/i);
  assert.doesNotMatch(migration, /study_mastery_events|study_mastery_estimates/);
});
