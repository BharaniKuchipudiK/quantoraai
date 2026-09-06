import { applyCors, clientIp, isRateLimited } from '../rate-limit.js';
import { isGoldenCanaryRequest } from '../transaction-trace.js';
import { probeQirRunSchema } from '../qir-run-store.js';
import { summarizeInferenceReadiness } from '../inference-control-plane.js';
import { getProviderCircuitStoreHealth, providerCircuitStore } from '../provider-circuit-store.js';
import { openRouterEnvPublicHint, openRouterPublicHint, resolveOpenRouterEnvKey } from '../openrouter-key.js';
import { duffelEnvPublicHint } from '../duffel-key.js';
import { defaultSerpApiKey, isSerpApiConfigured, resolveFlightProvider } from '../serpapi-flights.js';
import { fetchApiGatewayKey } from '../../autocomplete.js';
import { authenticateAdminRequest } from '../admin-auth.js';
import { probeGemini } from '../gemini-probe.js';
import { probeOpenRouter } from '../openrouter-probe.js';
import { probePlaces, resolvePlacesKey } from '../places-probe.js';
import { paidRouteAllowed } from "../paid-route-gate.js";

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
    /*
     * The deployed golden may run this probe too (2026-09-05). Two previews
     * failed their first model turn four hours apart — once as "no healthy AI
     * route", once as a silent turn — and nothing in the verdict could say
     * whether the deployment's only engine had answered at all. The canary
     * already authenticates the golden's model turns on this deployment; the
     * probe report carries no secret (a key's length and last four characters
     * at most), so it may read it.
     */
    if (!isGoldenCanaryRequest(req)) {
      const failure = await authenticateAdminRequest(req);
      if (failure) return res.status(failure.status).json({ ok: false, error: failure.error });
    }

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

  /*
   * The OpenRouter probe.
   *
   * `openRouterConfigured` below is produced by resolveOpenRouterEnvKey, which
   * checks the SHAPE OF A STRING. A revoked key, a key with no credit left, a
   * key from a deleted account and a key that works all report `true`
   * identically — the same defect that was found and fixed for Gemini earlier
   * the same day, left in place for the other provider.
   *
   * /auth/key answers it for real, for free, without spending a token, and
   * returns the account's usage against its limit — so an exhausted balance
   * becomes a fact instead of an inference drawn from a wall of failed turns.
   * Generation is opt-in with ?generate=1&model=<id>, because that one costs
   * money.
   */
  if (String(req.query?.probe || '') === 'openrouter') {
    const generate = String(req.query?.generate ?? '0') === '1';
    /*
     * The scheduled provider probe (scripts/provider-health-probe.mjs) reads
     * this with the golden canary, the way the golden reads the Gemini probe:
     * /auth/key spends nothing and the report carries no secret. Generation
     * costs money and stays admin-only whoever asks.
     */
    if (generate || !isGoldenCanaryRequest(req)) {
      const failure = await authenticateAdminRequest(req);
      if (failure) return res.status(failure.status).json({ ok: false, error: failure.error });
    }

    const envKey = resolveOpenRouterEnvKey();
    let key: string | null = envKey || null;
    let source: string | null = envKey ? 'env:OPENROUTER_API_KEY' : null;
    if (!key) {
      try {
        const viaGateway = await fetchApiGatewayKey('OPENROUTER');
        if (viaGateway) { key = String(viaGateway).trim(); source = 'supabase-api-gateway'; }
      } catch { /* unreachable gateway and no key are the same thing from here */ }
    }

    const report = await probeOpenRouter({
      key,
      source,
      model: typeof req.query?.model === 'string' && req.query.model ? req.query.model : null,
      generate,
    });
    return res.status(200).json({ probe: 'openrouter', ...report });
  }

  /*
   * The Places probe.
   *
   * `placesConfigured` below is key PRESENCE, and that is not the same question
   * as "does Places answer". A key with Places API (New) unenabled, or with
   * restrictions that forbid a server call, reports configured and refuses
   * every request — which reaches a traveller as "Places did not return a
   * list" and reaches the operator as nothing at all.
   *
   * Admin-gated because it reports a key's shape and costs one text search.
   */
  if (String(req.query?.probe || '') === 'places') {
    const failure = await authenticateAdminRequest(req);
    if (failure) return res.status(failure.status).json({ ok: false, error: failure.error });

    const places = resolvePlacesKey();
    const report = await probePlaces({
      key: places.key,
      source: places.source,
      ...(typeof req.query?.q === 'string' && req.query.q ? { query: req.query.q } : {}),
    });
    return res.status(200).json({ probe: 'places', ...report });
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
  /*
   * Spend, where the operator can see it without asking anyone.
   *
   * The meter existed and was read by nothing, so the only way to know what
   * this platform had spent was to log in to OpenRouter. A budget nobody can
   * see is the same as no budget — the figures come from the provider, not
   * from our own arithmetic.
   *
   * READ BEFORE THE SUMMARY, not after. It used to run below, so the route
   * count was computed from key PRESENCE while the answer to "does this key
   * work" was fetched seconds later and used for nothing but display. That is
   * how this endpoint reported openRouterConfigured: true, routeCount: 3 on a
   * deployment where /auth/key answered HTTP 401 for that exact key.
   */
  // The gateway key when the env has none, so the figure reflects the key that
  // would actually be charged.
  const spendKey = openRouterEnv || (openRouterViaGateway ? await fetchApiGatewayKey('OPENROUTER') : null);
  const paid = await paidRouteAllowed(spendKey);
  /*
   * WHICH KEY, FROM WHICH STORE. Reported because presence was never the
   * question an operator actually has.
   *
   * On 2026-09-04 an operator created a new OpenRouter key, pasted it into the
   * Supabase gateway row, and asked whether it had taken effect. Nothing here
   * could answer: openRouterEnvHint describes the ENV var — a store they had
   * not touched — and openRouterViaGateway says only that the row was reached,
   * never which key it holds. Two keys, last three characters apart, and the
   * platform could not tell them apart. They were left comparing an OpenRouter
   * dashboard's "Last Used" column against a guess.
   *
   * The hint is built from spendKey, which is the key the turn would actually
   * charge — so it cannot describe one store while another one serves.
   */
  const openRouterActive = openRouterPublicHint(spendKey);
  const openRouterKeySource = openRouterEnv ? 'env' : (openRouterViaGateway ? 'gateway' : null);

  /*
   * A gateway the provider has REFUSED is not a route, however well-formed its
   * key looks. openRouterConfigured stays true — a key is genuinely present,
   * and saying otherwise would send an operator looking for a missing secret
   * instead of a rejected one — but it stops being counted as somewhere a turn
   * can go.
   *
   * `ready` is deliberately left to fall out of the remaining routes rather
   * than being forced false: Gemini is a separate gateway with its own
   * credential, and failing every deployment over an OpenRouter key that needs
   * rotating is exactly the imprecise blocking gate CLAUDE.md §5 warns about —
   * the kind the next person mutes under pressure. If Gemini is up, this
   * deployment can still serve, and the warning above says what is lost.
   */
  const openRouterRefused = paid.meterFault?.gatewayDead === true;
  const summary = await summarizeInferenceReadiness({
    geminiAvailable: geminiConfigured,
    openRouterAvailable: openRouterAvailable && !openRouterRefused,
    circuitStore: providerCircuitStore,
  });
  const circuitStore = getProviderCircuitStoreHealth();
  const duffel = duffelEnvPublicHint();
  const serpApiConfigured = isSerpApiConfigured(defaultSerpApiKey);
  /*
   * Which provider actually answers, by the same rule the search path uses.
   * Reporting Duffel's mode alone would name a source that no longer serves
   * once SerpApi outranks a sandbox token — a health endpoint promising a
   * source the search does not use is worse than one that says nothing.
   */
  const flightProvider = resolveFlightProvider({
    duffelConnected: duffel.configured,
    duffelMode: duffel.shape,
    serpApiConfigured,
  });

  return res.status(summary.ready ? 200 : 503).json({
    ready: summary.ready,
    /*
     * Whether THIS deployment would honor the golden canary, answered where
     * the env actually lives. On 2026-09-01 the chat golden failed 3/3 on PR
     * previews as "no healthy AI route" + 401s: QUANTORA_GOLDEN_CANARY_TOKEN
     * (like the Gemini key above) was scoped to Production, so goldenCanary
     * was false on previews, mayUseServerKeys was false, and every canary
     * chat turn ran keyless — a config gap misreported as a provider outage,
     * for forty seconds per run instead of one line here. Presence is not a
     * secret; `honored` only says whether the presented header matched.
     */
    /*
     * Does this deployment's database actually have the durable Run schema?
     *
     * Reported here because the readiness gate can only speak HTTP to the
     * deployment — it holds no Supabase credentials — so the deployment has to
     * answer for itself, the same way goldenCanaryHonored does above.
     *
     * `present: null` means NOT KNOWN and never blocks a deploy. Only `false`
     * is a claim, and it is made solely when the store answered and named the
     * relation as absent.
     */
    durableStore: await probeQirRunSchema(),
    goldenCanaryConfigured: Boolean(process.env.QUANTORA_GOLDEN_CANARY_TOKEN),
    goldenCanaryHonored: isGoldenCanaryRequest(req),
    geminiConfigured: summary.geminiConfigured,
    geminiVia: gemini.source,
    /*
     * PRESENCE, deliberately — not summary.openRouterConfigured, which now
     * reflects whether the gateway is USABLE. A key that exists and is refused
     * must not read as "no key configured": that sends an operator hunting for
     * a missing secret when the one they have is the problem. Presence here,
     * validity in spend.meterFault, and routeCount below counts only what a
     * turn can actually reach.
     */
    openRouterConfigured: openRouterAvailable,
    openRouterCredentialRefused: openRouterRefused,
    openRouterEnvShape: openRouterHint.shape,
    openRouterEnvHint: openRouterHint.hint,
    openRouterViaGateway,
    /*
     * The two fields that answer "did my paste take effect?" without anyone
     * having to know the precedence rule. Source names the store; hint names
     * the key, by the same last-three-characters convention as the env hint and
     * with the same refusal to echo an unknown secret.
     */
    openRouterKeySource,
    openRouterKeyShape: openRouterActive.shape,
    openRouterKeyHint: openRouterActive.hint,
    placesConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY),
    /*
     * Flights were the one provider this endpoint could not see. Hotels had
     * placesConfigured; flight search had nothing, so "are these fares real?"
     * could only be answered by running a search and trusting the result — and
     * a Duffel sandbox token returns real-looking offers for fares nobody can
     * buy. Mode, not just presence, is the part worth reporting.
     */
    flightsConfigured: duffel.configured || serpApiConfigured,
    flightsProvider: flightProvider,
    flightsSerpApiConfigured: serpApiConfigured,
    flightsEnvShape: duffel.shape,
    flightsEnvHint: duffel.hint,
    flightsFallbackShape: duffel.fallbackShape,
    flightsMixedModes: duffel.mixedModes,
    routeCount: summary.routeCount,
    usedLastResort: summary.usedLastResort,
    spend: {
      paidRoutesAllowed: paid.allowed,
      reason: paid.reason,
      spentUsd: paid.spentUsd,
      limitUsd: paid.limitUsd,
      remainingUsd: paid.remainingUsd,
      /*
       * WHY THE FAULT IS REPORTED AND NOT JUST THE REFUSAL
       *
       * On 2026-09-04 this endpoint reported, for every deployment:
       *
       *   "paidRoutesAllowed": false,
       *   "reason": "the spend meter could not be read",
       *   "spentUsd": null, "limitUsd": null, "remainingUsd": null
       *
       * A rejected key, an empty balance, a rate limit and a timeout are four
       * different problems with four different remedies, and that payload
       * cannot tell them apart — so the only way to find out was to log in to
       * OpenRouter, which is the exact situation the spend block was added to
       * end. checkOpenRouterKey knew the status and the provider's own words;
       * decidePaidRoute's parameter type dropped both.
       *
       * `gatewayDead` is the one an operator must not miss: it says this fault
       * also stops FREE OpenRouter models, so `openRouterConfigured: true` and
       * the route count above are overstating what can actually run.
       */
      meterFault: paid.meterFault,
    },
    circuitStore,
  });
}
