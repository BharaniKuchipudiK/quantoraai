import { applyCors, clientIp, isRateLimited } from '../_lib/rate-limit.js';
import { authenticateAdminRequest } from '../_lib/admin-auth.js';
import { fetchOpenRouterCatalog, formatContext, providerFromId } from '../_lib/model-catalog.js';
import { updateModelApproval } from '../_lib/model-qualification.js';
import { readModelRegistry } from '../_lib/model-store.js';
import { getSessionUser } from '../_lib/session.js';

export default async function handler(req, res) {
  applyCors(req, res, 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (isRateLimited(`admin-models:${clientIp(req)}`, 60, 60_000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const authFailure = await authenticateAdminRequest(req);
  if (authFailure) {
    return res.status(authFailure.status).json({ error: authFailure.error });
  }

  if (req.method === 'GET') {
    const [storedRows, catalog] = await Promise.all([
      readModelRegistry(),
      fetchOpenRouterCatalog(),
    ]);

    const queue = storedRows
      .filter((row) => !row.approved && ['discovered', 'testing'].includes(row.lifecycle))
      .map((row) => {
        const live = catalog?.get(row.id);
        return {
          id: row.id,
          name: live?.name || row.name,
          provider: row.provider || providerFromId(row.id),
          description: live?.description || row.description || 'New free model discovered through OpenRouter.',
          contextWindow: live?.context_length ? formatContext(live.context_length) : formatContext(row.context_length),
          pricingKind: 'free',
          status: row.lifecycle === 'testing' ? 'testing' : 'discovered',
          health: live ? 'listed' : 'unlisted',
          event: row.last_event,
          isNew: row.last_event === 'discovered' || row.last_event === 'restored',
          isUpdated: row.last_event === 'updated',
          approved: false,
          firstSeenAt: row.first_seen_at,
          lastChangedAt: row.last_changed_at,
          selectable: false,
          category: 'candidate',
        };
      })
      .sort((a, b) => new Date(b.lastChangedAt) - new Date(a.lastChangedAt));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ models: queue, fetchedAt: new Date().toISOString() });
  }

  if (req.method === 'POST') {
    const { modelId, action } = req.body || {};
    if (!modelId || !['approve', 'reject', 'testing'].includes(action)) {
      return res.status(400).json({ error: 'modelId and action (approve|reject|testing) are required' });
    }

    const sessionUser = getSessionUser(req);
    const adminSub = sessionUser?.sub || 'api-key';
    const result = await updateModelApproval(modelId, action, adminSub);
    if (!result.ok) {
      const status = result.error === 'Model not found' ? 404 : 503;
      return res.status(status).json({ error: result.error });
    }
    return res.status(200).json({ ok: true, model: result.model });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
