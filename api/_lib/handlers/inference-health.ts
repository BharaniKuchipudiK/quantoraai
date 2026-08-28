import { applyCors, clientIp, isRateLimited } from '../rate-limit.js';
import { summarizeInferenceReadiness } from '../inference-control-plane.js';
import { getProviderCircuitStoreHealth, providerCircuitStore } from '../provider-circuit-store.js';
import { openRouterEnvPublicHint, resolveOpenRouterEnvKey } from '../openrouter-key.js';
import { fetchApiGatewayKey } from '../../autocomplete.js';
import { authenticateAdminRequest } from '../admin-auth.js';
import { probeGemini } from '../gemini-probe.js';

/**
 * Resolve the Gemini credential the way the chat path does — environment
 * first, then the Supabase gateway.
 *
 * The readiness summary below used to consider only `process.env`, so a
 * deployment holding its key in the gateway reported Gemini as unconfigured
 * and the router planned around a provider that was in fact available.
 */
async function resolveGeminiKey(): Promise<{ key: string | null; source: string | null }> {
  const fromEnv = process.env.GEMINI_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: 'env:GEMINI_API_KEY' };
  try {
    const fromGateway = await fetchApiGatewayKey('GEMINI');
    if (fromGateway) return { key: String(fromGateway).trim(), source: 'supabase-api-gateway' };
  } catch {
    // The gateway being unreachable is not the same as there being no key, but
    // from here they are indistinguishable and both mean "nothing to use".
  }
  return { key: null, source: null };
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ready: false });
  if (isRateLimited(`inference-health:${clientIp(req)}`, 30, 60_000)) {
    return res.status(429).json({ ready: false, reason: 'rate_limited' });
  }

  const gemini = await resolveGeminiKey();
  const geminiConfigured = Boolean(gemini.key);

  /*
   * The live probe.
   *
   * WHY IT LIVES BEHIND THIS ENDPOINT AND NOT IN A SCRIPT
   *
   * The Google key is Production-only and marked Sensitive, so `vercel env
   * pull` hands out a redaction placeholder and every local test of Gemini has
   * been a test of that placeholder. The key is only real where the code
   * already runs, so the diagnostic has to run there too.
   *
   * Admin-gated because it spends a token and reports a key's shape. The rest
   * of this endpoint stays public: readiness carries no secret and the app
   * itself reads it.
   */
  if (String(req.query?.probe || '') === 'gemini') {
    const failure = await authenticateAdminRequest(req);
    if (failure) return res.status(failure.status).json({ ok: false, error: failure.error });

    const report = await probeGemini({
      key: gemini.key,
      source: gemini.source,
      model: typeof req.query?.model === 'string' && req.query.model ? req.query.model : null,
      // ?generate=0 answers the credential question for free, spending nothing.
      generate: String(req.query?.generate ?? '1') !== '0',
    });
    // Always 200: the report itself carries the verdict, and a non-2xx would
    // make a curl pipeline discard the only useful part of the answer.
    return res.status(200).json({ probe: 'gemini', ...report });
  }

  const openRouterHint = openRouterEnvPublicHint();
  const openRouterEnv = resolveOpenRouterEnvKey();
  let openRouterViaGateway = false;
  let openRouterAvailable = Boolean(openRouterEnv);
  if (!openRouterAvailable) {
    try {
      openRouterViaGateway = Boolean(await fetchApiGatewayKey('OPENROUTER'));
      openRouterAvailable = openRouterViaGateway;
    } catch {
      openRouterViaGateway = false;
    }
  }
  const summary = await summarizeInferenceReadiness({
    geminiAvailable: geminiConfigured,
    openRouterAvailable,
    circuitStore: providerCircuitStore,
  });
  const circuitStore = getProviderCircuitStoreHealth();

  return res.status(summary.ready ? 200 : 503).json({
    ready: summary.ready,
    geminiConfigured: summary.geminiConfigured,
    geminiVia: gemini.source,
    openRouterConfigured: summary.openRouterConfigured,
    openRouterEnvShape: openRouterHint.shape,
    openRouterEnvHint: openRouterHint.hint,
    openRouterViaGateway,
    placesConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY),
    routeCount: summary.routeCount,
    usedLastResort: summary.usedLastResort,
    circuitStore,
  });
}
