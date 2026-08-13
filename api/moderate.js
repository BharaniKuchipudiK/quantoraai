import { applyCors, clientIp, isRateLimited } from './_lib/rate-limit.js';
import { evaluateSafetyText } from './_lib/safety-policy.js';

const MAX_PROMPT_CHARS = 50_000;

export default function handler(req, res) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (isRateLimited(`moderate:${clientIp(req)}`, 120, 60_000)) {
    return res.status(429).json({ error: 'Too many moderation requests. Please wait a minute.' });
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Invalid prompt provided.' });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return res.status(413).json({ error: 'Prompt is too long to evaluate.' });
  }

  const result = evaluateSafetyText(prompt);
  return res.status(200).json({
    flagged: result.action !== 'allow',
    action: result.action,
    category: result.category,
    severity: result.severity,
    reasonCode: result.reasonCode,
    policyVersion: result.policyVersion,
    reason: result.userMessage || null,
  });
}
