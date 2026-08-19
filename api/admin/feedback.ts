import { applyCors, clientIp, isRateLimited } from '../_lib/rate-limit.js';
import { authenticateAdminRequest } from '../_lib/admin-auth.js';
import { FEEDBACK_STATUSES, isFeedbackStatus, listUserFeedback, updateUserFeedbackStatus } from '../_lib/feedback-store.js';

function parseBody(req: any) {
  if (!req?.body) return {};
  if (typeof req.body !== 'string') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function summarize(items: any[]) {
  const result: Record<string, number> = {
    total: items.length,
    new: 0,
    reviewed: 0,
    planned: 0,
    done: 0,
    closed: 0,
    feedback: 0,
    suggestion: 0,
  };
  for (const item of items) {
    if (Object.prototype.hasOwnProperty.call(result, item.status)) result[item.status] += 1;
    if (Object.prototype.hasOwnProperty.call(result, item.feedbackType)) result[item.feedbackType] += 1;
  }
  return result;
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'GET,PATCH,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'PATCH'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });

  if (isRateLimited(`admin-feedback:${clientIp(req)}`, 120, 60_000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  const authFailure = await authenticateAdminRequest(req);
  if (authFailure) return res.status(authFailure.status).json({ error: authFailure.error });

  if (req.method === 'GET') {
    const requestedLimit = Number(req.query?.limit ?? 250);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(500, Math.floor(requestedLimit))) : 250;
    const items = await listUserFeedback(limit);
    if (items === null) return res.status(503).json({ error: 'Feedback store is not available.' });
    return res.status(200).json({ items, summary: summarize(items), statuses: FEEDBACK_STATUSES, timestamp: Date.now() });
  }

  const body = parseBody(req);
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!id || !isFeedbackStatus(body?.status)) {
    return res.status(400).json({ error: 'A valid feedback id and status are required.' });
  }

  const item = await updateUserFeedbackStatus(id, body.status);
  if (!item) return res.status(404).json({ error: 'Feedback item could not be updated.' });
  return res.status(200).json({ item });
}
