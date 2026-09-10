import { requireActiveSession } from './_lib/authz.js';
import { applyCors, isRateLimited } from './_lib/rate-limit.js';
import {
  buildStudyLearningCompass,
  normalizeStudyLearningCompassRequest,
} from './_lib/study-learning-compass.js';
import { studyContinuityCloudOperation } from './_lib/study-continuity-cloud.js';
import { loadStudyReturnContext } from './_lib/study-return-context.js';

export default async function studyLearningCompassHandler(req: any, res: any) {
  applyCors(req, res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const userSub = auth.value.sessionUser?.sub;
  if (!userSub) {
    return res.status(401).json({
      error: 'Sign in to use your Learning Compass.',
      requiresAuth: true,
    });
  }

  const action = req.body?.action;
  if (['continuity-list', 'continuity-read', 'continuity-save', 'continuity-clear', 'continuity-summary'].includes(action)) {
    if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return res.status(415).json({ error: 'Lesson continuity requires JSON.' });
    }
    // The supplied account is an equality precondition only, never a data selector.
    // This rejects queued work after the browser signs in as another account.
    const expected = typeof req.body.accountKey === 'string' ? req.body.accountKey.trim().toLowerCase() : '';
    const actual = String(auth.value.sessionUser?.email || '').trim().toLowerCase();
    if (!['continuity-summary', 'continuity-list'].includes(action) && (!expected || expected !== actual)) {
      return res.status(401).json({ error: 'The active account changed. Reload this lesson.' });
    }
    if (isRateLimited(`study-continuity:${action === 'continuity-summary' ? 'summary' : 'progress'}:${userSub}`, action === 'continuity-summary' ? 12 : 90, 60_000)) {
      return res.status(429).json({ error: 'Too many lesson continuity requests.' });
    }
    if (action === 'continuity-summary') {
      const summary = await loadStudyReturnContext(userSub);
      return summary ? res.status(200).json(summary)
        : res.status(503).json({ error: 'Verified learning history is temporarily unavailable.' });
    }
    const result = await studyContinuityCloudOperation(userSub, req.body);
    return res.status(result.status).json(result.body);
  }

  if (isRateLimited(`study-learning-compass:${userSub}`, 30, 60_000)) {
    return res.status(429).json({ error: 'Too many Learning Compass refreshes. Please wait a moment.' });
  }

  const request = normalizeStudyLearningCompassRequest(req.body);
  if (!request) {
    return res.status(400).json({
      error: 'A valid active Study concept is required.',
    });
  }

  const result = await buildStudyLearningCompass({ userSub, request });
  if (result.status === 'unmapped') {
    return res.status(404).json({
      error: 'This Study topic is not mapped to the reviewed concept graph yet.',
      status: 'unmapped',
    });
  }
  if (result.status === 'unavailable') {
    return res.status(503).json({
      error: 'Your Learning Compass is temporarily unavailable.',
      status: 'unavailable',
      reasonCode: result.reasonCode,
    });
  }

  return res.status(200).json(result);
}
