import { applyCors, isRateLimited } from './rate-limit.js';
import { requireActiveSession } from './authz.js';
import { readStudySupabaseRows, studySupabaseRequest } from './study-supabase.js';

const BLOCK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BLOCK_SELECT = 'id,subject,topic,title,starts_at,ends_at,kind,status,notes,created_at,updated_at';
const VALID_KINDS = new Set(['study', 'exam', 'deadline']);
const VALID_STATUSES = new Set(['planned', 'completed', 'skipped']);
export const STUDY_SCHEDULE_MAX_WINDOW_DAYS = 31;
export const STUDY_SCHEDULE_MAX_BLOCKS = 300;

type StudyScheduleBlock = {
  id: string;
  subject: string;
  topic: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  kind: 'study' | 'exam' | 'deadline';
  status: 'planned' | 'completed' | 'skipped';
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type ScheduleBlockInput = Omit<StudyScheduleBlock, 'id' | 'createdAt' | 'updatedAt'>;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function boundedNotes(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 2_000) : '';
}

function isoInstant(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

export function normalizeStudyScheduleBlockInput(value: unknown): ScheduleBlockInput | null {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const subject = text(input.subject, 100);
  const topicValue = text(input.topic, 200);
  const title = text(input.title, 200);
  const startsAt = isoInstant(input.startsAt);
  const endsAt = isoInstant(input.endsAt);
  const kindValue = text(input.kind, 20) || 'study';
  const statusValue = text(input.status, 20) || 'planned';
  const notes = boundedNotes(input.notes);
  if (!subject || !title || !startsAt || !endsAt) return null;
  if (!VALID_KINDS.has(kindValue) || !VALID_STATUSES.has(statusValue)) return null;
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!(end > start) || end - start > 24 * 60 * 60 * 1000) return null;
  return {
    subject,
    topic: topicValue || null,
    title,
    startsAt,
    endsAt,
    kind: kindValue as ScheduleBlockInput['kind'],
    status: statusValue as ScheduleBlockInput['status'],
    notes,
  };
}

export function normalizeStudyScheduleWindow(fromValue: unknown, toValue: unknown): { from: string; to: string } | null {
  const from = isoInstant(fromValue);
  const to = isoInstant(toValue);
  if (!from || !to) return null;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!(toMs > fromMs)) return null;
  if (toMs - fromMs > STUDY_SCHEDULE_MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000) return null;
  return { from, to };
}

function publicBlock(row: Record<string, unknown>): StudyScheduleBlock | null {
  const id = text(row.id, 64).toLowerCase();
  const subject = text(row.subject, 100);
  const topic = text(row.topic, 200) || null;
  const title = text(row.title, 200);
  const startsAt = isoInstant(row.starts_at);
  const endsAt = isoInstant(row.ends_at);
  const kind = text(row.kind, 20);
  const status = text(row.status, 20);
  const notes = typeof row.notes === 'string' ? row.notes.slice(0, 2_000) : '';
  const createdAt = isoInstant(row.created_at);
  const updatedAt = isoInstant(row.updated_at);
  if (!BLOCK_ID.test(id) || !subject || !title || !startsAt || !endsAt || !VALID_KINDS.has(kind) || !VALID_STATUSES.has(status) || !createdAt || !updatedAt) {
    return null;
  }
  return {
    id,
    subject,
    topic,
    title,
    startsAt,
    endsAt,
    kind: kind as StudyScheduleBlock['kind'],
    status: status as StudyScheduleBlock['status'],
    notes,
    createdAt,
    updatedAt,
  };
}

function publicBlocks(rows: unknown[]): StudyScheduleBlock[] {
  return rows
    .map((row) => publicBlock(row && typeof row === 'object' ? row as Record<string, unknown> : {}))
    .filter((block): block is StudyScheduleBlock => Boolean(block));
}

async function parseRows(response: Response | null): Promise<any[] | null> {
  if (!response?.ok) return null;
  try {
    const value = await response.json();
    return Array.isArray(value) ? value : [];
  } catch {
    return null;
  }
}

export async function readStudyScheduleBlocks(userSub: string, from: string, to: string): Promise<StudyScheduleBlock[] | null> {
  const rows = await readStudySupabaseRows(
    `study_schedule_blocks?select=${BLOCK_SELECT}&user_sub=eq.${encodeURIComponent(userSub)}&starts_at=lt.${encodeURIComponent(to)}&ends_at=gt.${encodeURIComponent(from)}&order=starts_at.asc,id.asc&limit=${STUDY_SCHEDULE_MAX_BLOCKS}`,
    { operation: 'study_schedule_list' },
  );
  return rows === null ? null : publicBlocks(rows);
}

async function createStudyScheduleBlock(userSub: string, input: ScheduleBlockInput): Promise<StudyScheduleBlock | null> {
  const response = await studySupabaseRequest(
    `study_schedule_blocks?select=${BLOCK_SELECT}`,
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_sub: userSub,
        subject: input.subject,
        topic: input.topic,
        title: input.title,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        kind: input.kind,
        status: input.status,
        notes: input.notes,
      }),
    },
    { operation: 'study_schedule_create' },
  );
  const rows = await parseRows(response);
  return rows ? publicBlocks(rows)[0] || null : null;
}

async function updateStudyScheduleBlock(userSub: string, id: string, input: ScheduleBlockInput): Promise<StudyScheduleBlock | 'not_found' | null> {
  const response = await studySupabaseRequest(
    `study_schedule_blocks?id=eq.${encodeURIComponent(id)}&user_sub=eq.${encodeURIComponent(userSub)}&select=${BLOCK_SELECT}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        subject: input.subject,
        topic: input.topic,
        title: input.title,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        kind: input.kind,
        status: input.status,
        notes: input.notes,
        updated_at: new Date().toISOString(),
      }),
    },
    { operation: 'study_schedule_update' },
  );
  const rows = await parseRows(response);
  if (rows === null) return null;
  return publicBlocks(rows)[0] || 'not_found';
}

async function deleteStudyScheduleBlock(userSub: string, id: string): Promise<'deleted' | 'not_found' | null> {
  const response = await studySupabaseRequest(
    `study_schedule_blocks?id=eq.${encodeURIComponent(id)}&user_sub=eq.${encodeURIComponent(userSub)}&select=id`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    },
    { operation: 'study_schedule_delete' },
  );
  const rows = await parseRows(response);
  if (rows === null) return null;
  return rows.length > 0 ? 'deleted' : 'not_found';
}

export default async function studyScheduleHandler(req: any, res: any) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const userSub = auth.value.sessionUser?.sub;
  if (!userSub) return res.status(401).json({ error: 'Sign in to use your Study schedule.', requiresAuth: true });

  if (req.method === 'GET') {
    if (isRateLimited(`study-schedule:list:${userSub}`, 90, 60_000)) {
      return res.status(429).json({ error: 'Too many schedule refreshes. Please wait a moment.' });
    }
    const window = normalizeStudyScheduleWindow(req.query?.from, req.query?.to);
    if (!window) return res.status(400).json({ error: `Choose a schedule window up to ${STUDY_SCHEDULE_MAX_WINDOW_DAYS} days.` });
    const blocks = await readStudyScheduleBlocks(userSub, window.from, window.to);
    if (blocks === null) return res.status(503).json({ error: 'Your Study schedule is temporarily unavailable.' });
    return res.status(200).json({ blocks, from: window.from, to: window.to });
  }

  if (isRateLimited(`study-schedule:write:${userSub}`, 120, 60_000)) {
    return res.status(429).json({ error: 'Too many schedule changes. Please wait a moment.' });
  }

  if (req.method === 'POST') {
    const input = normalizeStudyScheduleBlockInput(req.body);
    if (!input) return res.status(400).json({ error: 'A valid subject, title, start time and end time are required.' });
    const block = await createStudyScheduleBlock(userSub, input);
    if (!block) return res.status(503).json({ error: 'Your study block could not be created right now.' });
    return res.status(201).json({ block });
  }

  const id = text(req.body?.id, 64).toLowerCase();
  if (!BLOCK_ID.test(id)) return res.status(400).json({ error: 'Invalid study block.' });

  if (req.method === 'PATCH') {
    const input = normalizeStudyScheduleBlockInput(req.body);
    if (!input) return res.status(400).json({ error: 'A valid subject, title, start time and end time are required.' });
    const block = await updateStudyScheduleBlock(userSub, id, input);
    if (block === null) return res.status(503).json({ error: 'Your study block could not be saved right now.' });
    if (block === 'not_found') return res.status(404).json({ error: 'Study block not found.' });
    return res.status(200).json({ block });
  }

  const deleted = await deleteStudyScheduleBlock(userSub, id);
  if (deleted === null) return res.status(503).json({ error: 'Your study block could not be deleted right now.' });
  if (deleted === 'not_found') return res.status(404).json({ error: 'Study block not found.' });
  return res.status(200).json({ deleted: true });
}
