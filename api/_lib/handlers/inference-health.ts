import { applyCors, clientIp, isRateLimited } from '../rate-limit.js';
import { summarizeInferenceReadiness } from '../inference-control-plane.js';
import { getProviderCircuitStoreHealth, providerCircuitStore } from '../provider-circuit-store.js';
import { openRouterEnvPublicHint, resolveOpenRouterEnvKey } from '../openrouter-key.js';
import { fetchApiGatewayKey } from '../../autocomplete.js';

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ready: false });
  if (isRateLimited(`inference-health:${clientIp(req)}`, 30, 60_000)) {
    return res.status(429).json({ ready: false, reason: 'rate_limited' });
  }

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
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
