import { requireActiveSession } from './_lib/authz.js';
import { applyCors, isRateLimited } from './_lib/rate-limit.js';
import {
  buildStudyLearningCompass,
  normalizeStudyLearningCompassRequest,
} from './_lib/study-learning-compass.js';

export default async function studyLearningCompassHandler(req: any, res: any) {
  applyCors(req, res);
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