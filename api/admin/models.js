import { applyCors, clientIp, isRateLimited } from '../_lib/rate-limit.js';
import { authenticateAdminRequest } from '../_lib/admin-auth.js';
import {
  CURATED_MODELS,
  DIRECT_MODELS,
  buildInternetCatalogEntries,
  fetchGeminiCatalog,
  fetchOpenRouterCatalog,
} from '../_lib/model-catalog.js';
import { runAndStoreModelSmokeTest, updateModelApproval } from '../_lib/model-qualification.js';
import { buildAdminModelLists } from '../_lib/model-lifecycle.js';
import { scanModelCatalog } from '../_lib/model-scanner.js';
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
    kind: smoke.kind || null,
  };
}

async function loadAdminLists() {
  const [storedRows, openRouter, gemini] = await Promise.all([
    readModelRegistry(),
    fetchOpenRouterCatalog(),
    fetchGeminiCatalog(),
  ]);

  const internetEntries = buildInternetCatalogEntries({ openRouter, gemini });
  const lists = buildAdminModelLists({
    registryRows: storedRows,
    featuredModels: [...DIRECT_MODELS, ...CURATED_MODELS],
    internetEntries,
  });

  // Queue = newly added models still awaiting Active (compat for older UI clients).
  const queue = lists.newlyAdded.filter((model) => !model.approved || model.status !== 'available');

  return {
    ...lists,
    models: queue,
    fetchedAt: new Date().toISOString(),
    catalogs: {
      openRouter: Boolean(openRouter),
      gemini: Boolean(gemini),
      internetEntryCount: internetEntries.length,
    },
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
    const payload = await loadAdminLists();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  }

  if (req.method === 'POST') {
    const { modelId, action } = req.body || {};
    if (!action || !['approve', 'reject', 'testing', 'smoke-test', 'discover', 'run-discovery'].includes(action)) {
      return res.status(400).json({
        error: 'action (approve|reject|testing|smoke-test|discover) is required; modelId required except for discover',
      });
    }

    const sessionUser = getSessionUser(req);
    const adminSub = sessionUser?.sub || 'api-key';

    if (action === 'discover' || action === 'run-discovery') {
      if (isRateLimited(`admin-discover:${clientIp(req)}`, 2, 60_000)) {
        return res.status(429).json({ error: 'Discovery rate limit reached. Wait a minute and try again.' });
      }

      const result = await scanModelCatalog({
        runCanaries: true,
        actor: `admin:${adminSub}`,
      });
      if (result.status !== 200) {
        return res.status(result.status).json(result.body);
      }

      const lists = await loadAdminLists();
      return res.status(200).json({
        ok: true,
        discovery: result.body,
        ...lists,
      });
    }

    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required for this action' });
    }

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
