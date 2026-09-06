/**
 * Whether a refused engine probe should stop the deployed golden before its
 * first turn — or whether the transactions should run anyway, on the engine
 * the deployment would fall back to.
 *
 * The probe (2026-09-05) exists because a preview has ONE engine: Gemini
 * through the Supabase gateway. When that credential is refused (401, 403,
 * 429), every route on it fails the same way, and five browser transactions
 * would only restate the refusal as a mystery in the calculator. Stopping
 * there is right — for a preview.
 *
 * Production is not a preview. It plans a second engine (OpenRouter), and on
 * 2026-09-06 00:23 UTC a production run proved calculator, simple-website and
 * guided-intake on that fallback while Gemini was answering
 * "403: Spend cap breached". Five minutes later the next production run
 * stopped at "engine-probe" and proved nothing — the gate had gone blind to
 * the exact path it exists to watch, on the day that path had just broken
 * (the fallback engine's React 17 mounts, #560). A refusal is fatal only when
 * the deployment has no other engine a turn can reach.
 *
 * "Can reach" is the health handler's word, not ours: openRouterConfigured
 * reports the key's PRESENCE, openRouterCredentialRefused whether the gateway
 * refused it (2026-09-04: a key that exists and answers 401 is not a
 * fallback), and routeCount how many executable routes the planner offers
 * once the paid-route brake has had its say. All three must agree.
 *
 * @param {{ httpStatus?: number|null, ok?: boolean, status?: number|string|null }} engineProbe
 * @param {{ openRouterConfigured?: boolean, openRouterCredentialRefused?: boolean, routeCount?: number }} health
 * @returns {{ refused: boolean, stop: boolean, fallback: string|null, reason: string|null }}
 */
export const REFUSAL_STATUSES = Object.freeze([401, 403, 429]);

export function engineRefusalStopsRun(engineProbe, health) {
  const refused = engineProbe?.httpStatus === 200
    && engineProbe?.ok !== true
    && REFUSAL_STATUSES.includes(Number(engineProbe?.status));
  if (!refused) return { refused: false, stop: false, fallback: null, reason: null };

  const fallbackReachable = health?.openRouterConfigured === true
    && health?.openRouterCredentialRefused !== true
    && Number(health?.routeCount) > 1;
  if (fallbackReachable) {
    return {
      refused: true,
      stop: false,
      fallback: 'openrouter',
      reason: `Gemini refused (${engineProbe.status}), and the deployment plans ${Number(health.routeCount)} routes with `
        + 'a usable OpenRouter credential — the transactions run on the fallback engine, which is the path this run now proves.',
    };
  }
  const why = health?.openRouterConfigured !== true
    ? 'no OpenRouter credential is configured'
    : health?.openRouterCredentialRefused === true
      ? 'the OpenRouter credential is refused by the gateway'
      : `the planner offers ${Number(health?.routeCount) || 0} route(s), none beyond the refused engine`;
  return {
    refused: true,
    stop: true,
    fallback: null,
    reason: `Gemini refused (${engineProbe.status}) and ${why} — no route can answer, so the transactions would only restate the refusal.`,
  };
}
