import { applyCors, clientIp, isRateLimited } from './_lib/rate-limit.js';
import { summarizeInferenceReadiness } from './_lib/inference-control-plane.js';
import { providerCircuitStore } from './_lib/provider-circuit-store.js';

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ready: false });
  if (isRateLimited(`inference-health:${clientIp(req)}`, 30, 60_000)) {
    return res.status(429).json({ ready: false, reason: 'rate_limited' });
  }

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const openRouterConfigured = Boolean(process.env.OPENROUTER_API_KEY);
  const summary = await summarizeInferenceReadiness({
    geminiAvailable: geminiConfigured,
    openRouterAvailable: openRouterConfigured,
    circuitStore: providerCircuitStore,
  });

  return res.status(summary.ready ? 200 : 503).json({
    ready: summary.ready,
    geminiConfigured: summary.geminiConfigured,
    openRouterConfigured: summary.openRouterConfigured,
    routeCount: summary.routeCount,
    usedLastResort: summary.usedLastResort,
  });
}
