import { applyCors, clientIp, isRateLimited } from '../rate-limit.js';
import { summarizeInferenceReadiness } from '../inference-control-plane.js';
import { getProviderCircuitStoreHealth, providerCircuitStore } from '../provider-circuit-store.js';
import { openRouterEnvPublicHint, resolveOpenRouterEnvKey } from '../openrouter-key.js';

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ready: false });
  if (isRateLimited(`inference-health:${clientIp(req)}`, 30, 60_000)) {
    return res.status(429).json({ ready: false, reason: 'rate_limited' });
  }

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const openRouterEnv = resolveOpenRouterEnvKey();
  const openRouterHint = openRouterEnvPublicHint();
  const openRouterConfigured = Boolean(openRouterEnv);
  const summary = await summarizeInferenceReadiness({
    geminiAvailable: geminiConfigured,
    openRouterAvailable: openRouterConfigured,
    circuitStore: providerCircuitStore,
  });
  const circuitStore = getProviderCircuitStoreHealth();

  return res.status(summary.ready ? 200 : 503).json({
    ready: summary.ready,
    geminiConfigured: summary.geminiConfigured,
    openRouterConfigured: summary.openRouterConfigured,
    openRouterEnvShape: openRouterHint.shape,
    openRouterEnvHint: openRouterHint.hint,
    placesConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY),
    routeCount: summary.routeCount,
    usedLastResort: summary.usedLastResort,
    circuitStore,
  });
}
