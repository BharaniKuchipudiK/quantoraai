import { applyCors, clientIp, isRateLimited } from './_lib/rate-limit.js';
import { requireActiveSession } from './_lib/authz.js';
import { executeToolCall } from './_lib/agent-tools.js';
import { parseTravelSearchRequest } from './_lib/travel-search-request.js';

/**
 * Live Travel search for the trip board. Search only — never book.
 */
export default async function handler(req: any, res: any) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (isRateLimited(`travel-search:${clientIp(req)}`, 20, 60_000)) {
    return res.status(429).json({ error: 'Too many travel searches. Please wait a minute.' });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;

  const parsed = parseTravelSearchRequest(req.body || {});
  if (parsed.ok === false) return res.status(400).json({ error: parsed.error });

  const result = await executeToolCall(parsed.tool, parsed.args);
  return res.status(200).json({
    kind: parsed.tool === 'search_flights' ? 'flights' : 'hotels',
    result,
  });
}
