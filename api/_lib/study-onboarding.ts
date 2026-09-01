import { applyCors, isRateLimited } from './rate-limit.js';
import { requireActiveSession } from './authz.js';
import { readStudySupabaseRows, studySupabaseRequest } from './study-supabase.js';

const CONTEXTS = new Set(['school', 'university', 'professional', 'personal']);
const GOALS = new Set(['understand', 'exam', 'grades', 'assignment', 'revise', 'explore']);
const MODALITIES = new Set(['balanced', 'visual', 'examples', 'concise', 'step_by_step']);
const SELECT = 'study_context,curriculum,level_label,subjects,goal,target_exam,exam_date,weekly_minutes,preferred_modality,diagnostic_opt_in,skipped,completed_at,updated_at';

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function optionalDate(value: unknown): string | null {
  const text = clean(value, 10);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export type StudyOnboardingProfile = {
  studyContext: string | null;
  curriculum: string | null;
  level: string | null;
  subjects: string[];
  goal: string | null;
  targetExam: string | null;
  examDate: string | null;
  weeklyMinutes: number | null;
  preferredModality: string | null;
  diagnosticOptIn: boolean;
  skipped: boolean;
  completedAt: string | null;
  updatedAt: string;
};

type OnboardingInput = {
  study_context: string | null;
  curriculum: string | null;
  level_label: string | null;
  subjects: string[];
  goal: string | null;
  target_exam: string | null;
  exam_date: string | null;
  weekly_minutes: number | null;
  preferred_modality: string | null;
  diagnostic_opt_in: boolean;
  skipped: boolean;
  completed_at: string;
  updated_at: string;
};

export function normalizeStudyOnboardingInput(value: unknown): OnboardingInput | null {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const studyContext = clean(input.studyContext, 40).toLowerCase();
  const goal = clean(input.goal, 40).toLowerCase();
  const preferredModality = clean(input.preferredModality, 40).toLowerCase();
  const weeklyRaw = Number(input.weeklyMinutes);
  const subjects = Array.isArray(input.subjects)
    ? [...new Set(input.subjects.map((item) => clean(item, 80)).filter(Boolean))].slice(0, 12)
    : [];
  const skipped = input.skipped === true;
  const weeklyMinutes = Number.isFinite(weeklyRaw) ? Math.round(weeklyRaw) : null;
  if (studyContext && !CONTEXTS.has(studyContext)) return null;
  if (goal && !GOALS.has(goal)) return null;
  if (preferredModality && !MODALITIES.has(preferredModality)) return null;
  if (weeklyMinutes !== null && (weeklyMinutes < 0 || weeklyMinutes > 10080)) return null;
  const now = new Date().toISOString();
  return {
    study_context: studyContext || null,
    curriculum: clean(input.curriculum, 120) || null,
    level_label: clean(input.level, 120) || null,
    subjects,
    goal: goal || null,
    target_exam: clean(input.targetExam, 160) || null,
    exam_date: optionalDate(input.examDate),
    weekly_minutes: weeklyMinutes,
    preferred_modality: preferredModality || null,
    diagnostic_opt_in: input.diagnosticOptIn === true,
    skipped,
    completed_at: now,
    updated_at: now,
  };
}

function publicProfile(row: Record<string, unknown>): StudyOnboardingProfile | null {
  const updatedAt = clean(row.updated_at, 80);
  if (!updatedAt) return null;
  return {
    studyContext: clean(row.study_context, 40) || null,
    curriculum: clean(row.curriculum, 120) || null,
    level: clean(row.level_label, 120) || null,
    subjects: Array.isArray(row.subjects) ? row.subjects.map((item) => clean(item, 80)).filter(Boolean).slice(0, 12) : [],
    goal: clean(row.goal, 40) || null,
    targetExam: clean(row.target_exam, 160) || null,
    examDate: clean(row.exam_date, 10) || null,
    weeklyMinutes: Number.isFinite(Number(row.weekly_minutes)) ? Number(row.weekly_minutes) : null,
    preferredModality: clean(row.preferred_modality, 40) || null,
    diagnosticOptIn: row.diagnostic_opt_in === true,
    skipped: row.skipped === true,
    completedAt: clean(row.completed_at, 80) || null,
    updatedAt,
  };
}

export async function readStudyOnboardingProfile(userSub: string): Promise<StudyOnboardingProfile | null | 'unavailable'> {
  const rows = await readStudySupabaseRows(
    `study_onboarding_profiles?select=${SELECT}&user_sub=eq.${encodeURIComponent(userSub)}&limit=1`,
    { operation: 'study_onboarding_read' },
  );
  if (rows === null) return 'unavailable';
  if (rows.length === 0) return null;
  return publicProfile(rows[0] as Record<string, unknown>);
}

async function saveStudyOnboardingProfile(userSub: string, input: OnboardingInput): Promise<StudyOnboardingProfile | null> {
  const response = await studySupabaseRequest(
    `study_onboarding_profiles?on_conflict=user_sub&select=${SELECT}`,
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ user_sub: userSub, ...input }),
    },
    { operation: 'study_onboarding_save' },
  );
  if (!response?.ok) return null;
  try {
    const rows = await response.json();
    return Array.isArray(rows) && rows[0] ? publicProfile(rows[0]) : null;
  } catch {
    return null;
  }
}

export default async function studyOnboardingHandler(req: any, res: any) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const userSub = auth.value.sessionUser?.sub;
  if (!userSub) return res.status(401).json({ error: 'Sign in to personalize Study.', requiresAuth: true });

  if (req.method === 'GET') {
    if (isRateLimited(`study-onboarding:read:${userSub}`, 30, 60_000)) {
      return res.status(429).json({ error: 'Too many Study profile refreshes. Please wait a moment.' });
    }
    const profile = await readStudyOnboardingProfile(userSub);
    if (profile === 'unavailable') return res.status(503).json({ error: 'Study personalization is temporarily unavailable.' });
    return res.status(200).json({ profile, needsOnboarding: profile === null });
  }

  if (isRateLimited(`study-onboarding:write:${userSub}`, 12, 60_000)) {
    return res.status(429).json({ error: 'Too many Study profile changes. Please wait a moment.' });
  }
  const input = normalizeStudyOnboardingInput(req.body);
  if (!input) return res.status(400).json({ error: 'Invalid Study onboarding profile.' });
  const profile = await saveStudyOnboardingProfile(userSub, input);
  if (!profile) return res.status(503).json({ error: 'Your Study preferences could not be saved right now.' });
  return res.status(200).json({ profile });
}
