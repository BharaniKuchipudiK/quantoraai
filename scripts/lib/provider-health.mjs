/*
 * ONE VERDICT ON THE PROVIDERS, FROM THE DEPLOYMENT'S OWN PROBES.
 *
 * 2026-09-06: Gemini's project spend cap was hit at some point in the night,
 * and the platform answered every turn with "no healthy AI route" until a
 * screenshot arrived in the morning. Self-healing triggers on an error inside
 * a turn; nothing watched the providers between turns. This is that watch:
 * the deployment's readiness snapshot, its live Gemini probe and its free
 * OpenRouter credential probe, read every half hour, judged here without a
 * network so the judgement can be tested, and printed as one line whose
 * first word is OK or FAILED.
 *
 * Precise on purpose (§5): a provider that is missing, refused, capped,
 * exhausted or unreachable fails; a slow one, or a note, never does.
 */

/** HTTP statuses that mean the credential or the account is refused, not the code. */
export const PROVIDER_REFUSAL_STATUSES = Object.freeze([401, 402, 403, 429]);

const money = (value) => (Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : 'unknown');
const short = (value, limit = 90) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

function refusalWord(status) {
  const code = Number(status);
  if (code === 429 || code === 402) return 'CAPPED';
  if (code === 401 || code === 403) return 'REFUSED';
  return 'FAILED';
}

/**
 * @param {{ health: {status: number|null, body: any}, gemini: {status: number|null, body: any}, openrouter: {status: number|null, body: any} }} reads
 * @returns {{ ok: boolean, failures: string[], notes: string[], verdict: string }}
 */
export function assessProviderHealth({ health, gemini, openrouter } = {}) {
  const failures = [];
  const notes = [];
  const snapshot = health?.body && typeof health.body === 'object' ? health.body : null;

  // The deployment itself.
  if (!snapshot || health?.status !== 200) {
    failures.push(`deployment=UNREACHABLE(HTTP ${health?.status ?? 'none'})`);
  } else if (snapshot.ready !== true) {
    failures.push(`deployment=NOT READY(${short(snapshot.reason || snapshot.error || JSON.stringify(snapshot).slice(0, 80))})`);
  } else if (Number(snapshot.routeCount) === 0) {
    failures.push('routes=0 (ready, but the planner offers no route a turn could take)');
  } else {
    notes.push(`routes=${Number(snapshot.routeCount) || 0}`);
  }

  // Gemini: the live probe's own word.
  if (snapshot && snapshot.geminiConfigured !== true) {
    failures.push('gemini=MISSING KEY');
  } else if (!gemini?.body || gemini.status !== 200) {
    failures.push(`gemini=UNREACHABLE(HTTP ${gemini?.status ?? 'none'})`);
  } else {
    const generate = gemini.body.generate || {};
    const list = gemini.body.list || {};
    if (generate.ok === true) {
      notes.push(`gemini=ok(${generate.model || 'gemini'}${Number.isFinite(generate.ms) ? ` ${generate.ms}ms` : ''})`);
    } else {
      const status = generate.status ?? list.status ?? null;
      const refused = PROVIDER_REFUSAL_STATUSES.includes(Number(status));
      failures.push(`gemini=${refused ? refusalWord(status) : 'FAILED'}(${status ?? 'no status'}: ${short(generate.error || list.error || gemini.body.verdict || 'no answer')})`);
    }
  }

  // OpenRouter: the credential and the balance, for free.
  if (snapshot && snapshot.openRouterConfigured !== true) {
    failures.push('openrouter=MISSING KEY');
  } else if (snapshot && snapshot.openRouterCredentialRefused === true) {
    failures.push('openrouter=REFUSED(the gateway refused the credential)');
  } else if (!openrouter?.body || openrouter.status !== 200) {
    failures.push(`openrouter=UNREACHABLE(HTTP ${openrouter?.status ?? 'none'})`);
  } else {
    const auth = openrouter.body.auth || {};
    if (auth.ok === true) {
      if (auth.remaining !== null && auth.remaining !== undefined && Number(auth.remaining) <= 0) {
        failures.push(`openrouter=EXHAUSTED(${money(auth.usage)} of ${money(auth.limit)} used)`);
      } else {
        notes.push(`openrouter=ok(${auth.limit === null || auth.limit === undefined ? 'no account limit' : `${money(auth.remaining)} left of ${money(auth.limit)}`})`);
      }
    } else {
      const refused = PROVIDER_REFUSAL_STATUSES.includes(Number(auth.status));
      failures.push(`openrouter=${refused ? refusalWord(auth.status) : 'FAILED'}(${auth.status ?? 'no status'}: ${short(auth.error || openrouter.body.verdict || 'no answer')})`);
    }
  }

  // The platform's own spend ceiling on paid routes.
  const spend = snapshot?.spend && typeof snapshot.spend === 'object' ? snapshot.spend : null;
  if (spend) {
    if (spend.paidRoutesAllowed === false) {
      failures.push(`spend=CEILING(${short(spend.reason || 'paid routes are closed', 120)})`);
    } else {
      notes.push(`spend=${money(spend.spentUsd)}${spend.limitUsd === null || spend.limitUsd === undefined ? ' (no ceiling)' : ` of ${money(spend.limitUsd)}`}`);
    }
  }

  const ok = failures.length === 0;
  const verdict = ok
    ? `PROVIDER HEALTH | OK | ${notes.join(' ')}`
    : `PROVIDER HEALTH | FAILED | ${failures.join(' ')}${notes.length ? ` | ${notes.join(' ')}` : ''}`;
  return { ok, failures, notes, verdict };
}
