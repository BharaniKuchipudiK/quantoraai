import { applyCors, isRateLimited } from './rate-limit.js';
import { requireActiveSession } from './authz.js';
import { readStudySupabaseRows, studySupabaseRequest } from './study-supabase.js';

const NOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOTE_SELECT = 'id,subject,topic,title,body,created_at,updated_at';
const NOTE_LIMIT = 200;

export type StudyNotebookNote = {
  id: string;
  subject: string;
  topic: string | null;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type NoteInput = {
  subject: string;
  topic: string | null;
  title: string;
  body: string;
};

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function noteBody(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 20_000) : '';
}

export function normalizeStudyNotebookNoteInput(value: unknown): NoteInput | null {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const subject = text(input.subject, 100);
  const topicValue = text(input.topic, 200);
  const title = text(input.title, 200);
  const body = noteBody(input.body);
  if (!subject || !title) return null;
  return {
    subject,
    topic: topicValue || null,
    title,
    body,
  };
}

function publicNote(row: Record<string, unknown>): StudyNotebookNote | null {
  const id = text(row.id, 64).toLowerCase();
  const subject = text(row.subject, 100);
  const topic = text(row.topic, 200) || null;
  const title = text(row.title, 200);
  const body = typeof row.body === 'string' ? row.body.slice(0, 20_000) : '';
  const createdAt = text(row.created_at, 80);
  const updatedAt = text(row.updated_at, 80);
  if (!NOTE_ID.test(id) || !subject || !title || !createdAt || !updatedAt) return null;
  return { id, subject, topic, title, body, createdAt, updatedAt };
}

function publicNotes(rows: unknown[]): StudyNotebookNote[] {
  return rows
    .map((row) => publicNote(row && typeof row === 'object' ? row as Record<string, unknown> : {}))
    .filter((note): note is StudyNotebookNote => Boolean(note));
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

export async function readStudyNotebookNotes(userSub: string): Promise<StudyNotebookNote[] | null> {
  const rows = await readStudySupabaseRows(
    `study_notebook_notes?select=${NOTE_SELECT}&user_sub=eq.${encodeURIComponent(userSub)}&order=updated_at.desc,id.desc&limit=${NOTE_LIMIT}`,
    { operation: 'study_notebook_list' },
  );
  return rows === null ? null : publicNotes(rows);
}

async function createStudyNotebookNote(userSub: string, input: NoteInput): Promise<StudyNotebookNote | null> {
  const response = await studySupabaseRequest(
    `study_notebook_notes?select=${NOTE_SELECT}`,
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_sub: userSub,
        subject: input.subject,
        topic: input.topic,
        title: input.title,
        body: input.body,
      }),
    },
    { operation: 'study_notebook_create' },
  );
  const rows = await parseRows(response);
  return rows ? publicNotes(rows)[0] || null : null;
}

async function updateStudyNotebookNote(userSub: string, id: string, input: NoteInput): Promise<StudyNotebookNote | 'not_found' | null> {
  const now = new Date().toISOString();
  const response = await studySupabaseRequest(
    `study_notebook_notes?id=eq.${encodeURIComponent(id)}&user_sub=eq.${encodeURIComponent(userSub)}&select=${NOTE_SELECT}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        subject: input.subject,
        topic: input.topic,
        title: input.title,
        body: input.body,
        updated_at: now,
      }),
    },
    { operation: 'study_notebook_update' },
  );
  const rows = await parseRows(response);
  if (rows === null) return null;
  const note = publicNotes(rows)[0];
  return note || 'not_found';
}

async function deleteStudyNotebookNote(userSub: string, id: string): Promise<'deleted' | 'not_found' | null> {
  const response = await studySupabaseRequest(
    `study_notebook_notes?id=eq.${encodeURIComponent(id)}&user_sub=eq.${encodeURIComponent(userSub)}&select=id`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    },
    { operation: 'study_notebook_delete' },
  );
  const rows = await parseRows(response);
  if (rows === null) return null;
  return rows.length > 0 ? 'deleted' : 'not_found';
}

export default async function studyNotebookHandler(req: any, res: any) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const userSub = auth.value.sessionUser?.sub;
  if (!userSub) return res.status(401).json({ error: 'Sign in to use your Study notebook.', requiresAuth: true });

  if (req.method === 'GET') {
    if (isRateLimited(`study-notebook:list:${userSub}`, 60, 60_000)) {
      return res.status(429).json({ error: 'Too many Notebook refreshes. Please wait a moment.' });
    }
    const notes = await readStudyNotebookNotes(userSub);
    if (notes === null) return res.status(503).json({ error: 'Your Study notebook is temporarily unavailable.' });
    return res.status(200).json({ notes });
  }

  if (isRateLimited(`study-notebook:write:${userSub}`, 120, 60_000)) {
    return res.status(429).json({ error: 'Too many Notebook changes. Please wait a moment.' });
  }

  if (req.method === 'POST') {
    const input = normalizeStudyNotebookNoteInput(req.body);
    if (!input) return res.status(400).json({ error: 'A subject and note title are required.' });
    const note = await createStudyNotebookNote(userSub, input);
    if (!note) return res.status(503).json({ error: 'Your note could not be created right now.' });
    return res.status(201).json({ note });
  }

  const id = text(req.body?.id, 64).toLowerCase();
  if (!NOTE_ID.test(id)) return res.status(400).json({ error: 'Invalid note.' });

  if (req.method === 'PATCH') {
    const input = normalizeStudyNotebookNoteInput(req.body);
    if (!input) return res.status(400).json({ error: 'A subject and note title are required.' });
    const note = await updateStudyNotebookNote(userSub, id, input);
    if (note === null) return res.status(503).json({ error: 'Your note could not be saved right now.' });
    if (note === 'not_found') return res.status(404).json({ error: 'Note not found.' });
    return res.status(200).json({ note });
  }

  const deleted = await deleteStudyNotebookNote(userSub, id);
  if (deleted === null) return res.status(503).json({ error: 'Your note could not be deleted right now.' });
  if (deleted === 'not_found') return res.status(404).json({ error: 'Note not found.' });
  return res.status(200).json({ deleted: true });
}
