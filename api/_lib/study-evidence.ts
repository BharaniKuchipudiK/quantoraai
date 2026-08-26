import { applyCors, isRateLimited } from './rate-limit.js';
import { requireActiveSession } from './authz.js';
import { recordStudySelfConfidenceEvent } from './store.js';

const EVENT_KEY = /^[a-z0-9][a-z0-9._:-]*$/;
const CONCEPT_KEY = /^[a-z0-9][a-z0-9._:-]*$/;
const SESSION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export type StudySelfConfidenceRequest = {
  eventKey: string;
  conceptKey: string;
  conceptLabel: string;
  sessionId: string;
  selfConfidence: number;
};

export function normalizeStudySelfConfidenceRequest(value: unknown): StudySelfConfidenceRequest | null {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (input.kind !== 'self_confidence') return null;
  const eventKey = clean(input.eventKey, 200).toLowerCase();
  const conceptKey = clean(input.conceptKey, 160).toLowerCase();
  const conceptLabel = clean(input.conceptLabel, 300).replace(/[%*]/g, '');
  const sessionId = clean(input.sessionId, 128);
  const selfConfidence = typeof input.selfConfidence === 'number' ? input.selfConfidence : Number.NaN;

  if (!EVENT_KEY.test(eventKey)) return null;
  if (!CONCEPT_KEY.test(conceptKey)) return null;
  if (!conceptLabel) return null;
  if (!SESSION_ID.test(sessionId)) return null;
  if (!Number.isFinite(selfConfidence) || selfConfidence < 0 || selfConfidence > 1) return null;
  return { eventKey, conceptKey, conceptLabel, sessionId, selfConfidence };
}

export default async function studyEvidenceHandler(req: any, res: any) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const userSub = auth.value.sessionUser?.sub;
  if (!userSub) return res.status(401).json({ error: 'Sign in to continue.', requiresAuth: true });
  if (isRateLimited(`study-evidence:user:${userSub}`, 60, 60_000)) {
    return res.status(429).json({ error: 'Too many Study updates. Please wait a minute and try again.' });
  }

  const event = normalizeStudySelfConfidenceRequest(req.body);
  if (!event) return res.status(400).json({ error: 'Invalid Study self-confidence evidence.' });

  const result = await recordStudySelfConfidenceEvent({
    userSub,
    ...event,
    observedAt: new Date().toISOString(),
  });
  if (result.status === 'unavailable') {
    return res.status(503).json({ error: 'Study evidence storage is temporarily unavailable.' });
  }
  if (result.status === 'unmapped') {
    // The learner signal is honest but cannot enter mastery calculations until
    // the topic is mapped to the canonical truth graph.
    return res.status(202).json({ recorded: false, mapped: false, masteryChanged: false });
  }
  return res.status(result.status === 'duplicate' ? 200 : 201).json({
    recorded: true,
    duplicate: result.status === 'duplicate',
    mapped: true,
    masteryChanged: false,
    evidenceKind: 'self_confidence',
  });
}
