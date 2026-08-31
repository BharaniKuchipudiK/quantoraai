import { applyCors, clientIp, isRateLimited } from '../rate-limit.js';
import { requireActiveSession } from '../authz.js';
import { executeToolCall } from '../agent-tools.js';
import { parseTravelSearchRequest } from '../travel-search-request.js';
import { duffelEnvPublicHint, servingDuffelMode } from '../duffel-key.js';

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
  const flights = parsed.tool === 'search_flights';
  /*
   * The board cannot tell live fares from sandbox ones by looking at them —
   * both carry real carrier names and plausible prices — so the mode has to
   * travel with the results. Without it the board called Duffel's sandbox
   * "Live from Duffel", which is the one thing this desk must never say.
   * The mode is not a secret; the token is, and it stays here.
   */
  return res.status(200).json({
    kind: flights ? 'flights' : 'hotels',
    result,
    ...(flights
      ? { providerMode: servingDuffelMode(duffelEnvPublicHint(), { fallbackUsed: Boolean(result?.fallbackUsed) }) }
      : {}),
  });
}
