import { applyCors, clientIp, isRateLimited } from '../_lib/rate-limit.js';
import { authenticateAdminRequest } from '../_lib/admin-auth.js';
import { fetchOpenRouterCatalog, formatContext, providerFromId } from '../_lib/model-catalog.js';
import { runAndStoreModelSmokeTest, updateModelApproval } from '../_lib/model-qualification.js';
import { readModelRegistry } from '../_lib/model-store.js';
import { getSessionUser } from '../_lib/session.js';

function mapSmokeTest(row) {
  const smoke = row?.smoke_test;
  if (!smoke) return null;
  return {
    passed: smoke.passed === true,
    ranAt: smoke.ran_at || smoke.ranAt || null,
    results: Array.isArray(smoke.results) ? smoke.results : [],
    error: smoke.error || null,
  };
}

function mapQueueRow(row, catalog) {
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
    smokeTest: mapSmokeTest(row),
  };
}

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
      .map((row) => mapQueueRow(row, catalog))
      .sort((a, b) => new Date(b.lastChangedAt) - new Date(a.lastChangedAt));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ models: queue, fetchedAt: new Date().toISOString() });
  }

  if (req.method === 'POST') {
    const { modelId, action } = req.body || {};
    if (!modelId || !['approve', 'reject', 'testing', 'smoke-test'].includes(action)) {
      return res.status(400).json({ error: 'modelId and action (approve|reject|testing|smoke-test) are required' });
    }

    const sessionUser = getSessionUser(req);
    const adminSub = sessionUser?.sub || 'api-key';

    if (action === 'smoke-test') {
      if (isRateLimited(`admin-smoke:${clientIp(req)}:${modelId}`, 3, 60_000)) {
        return res.status(429).json({ error: 'Smoke test rate limit reached. Wait a minute and try again.' });
      }

      const result = await runAndStoreModelSmokeTest(modelId);
      if (!result.ok) {
        const status = result.error === 'Model not found' ? 404 : 503;
        return res.status(status).json({ error: result.error, smokeTest: result.smokeTest || null });
      }

      return res.status(200).json({
        ok: true,
        passed: result.smokeTest?.passed === true,
        smokeTest: mapSmokeTest(result.model),
        model: result.model,
      });
    }

    const result = await updateModelApproval(modelId, action, adminSub);
    if (!result.ok) {
      if (result.code === 'SMOKE_TEST_REQUIRED') {
        return res.status(409).json({
          error: result.error,
          code: result.code,
          smokeTest: mapSmokeTest({ smoke_test: result.smokeTest }),
        });
      }
      const status = result.error === 'Model not found' ? 404 : 503;
      return res.status(status).json({ error: result.error });
    }
    return res.status(200).json({ ok: true, model: result.model });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
