/*
 * places-probe — ask Google Places whether the key works, instead of assuming.
 *
 * WHY THIS EXISTS
 *
 * /api/inference-health reports `placesConfigured` from
 * Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY)
 * — the PRESENCE OF A STRING. A key with Places API (New) never enabled, a key
 * whose restrictions forbid a server-side call, a key on a project with billing
 * off, and a key that works all report `configured: true` identically.
 *
 * That gap cost a real turn. A traveller asked for stays in Uluwatu and was
 * told "Places did not return a list — retry in a moment", while the health
 * endpoint said Places was configured and the operator had no reason to doubt
 * it. Places had refused the request outright; the retry could never have
 * worked, and the sentence blamed the destination for our setup.
 *
 * The same lesson the Gemini and OpenRouter probes were built on: a check on
 * the shape of a credential is not a check on the credential. Only the provider
 * can answer that, so ask it.
 *
 * searchText is the right question because it is the exact call the travel desk
 * makes — same endpoint, same key, same field mask, same enablement. A cheaper
 * endpoint would prove less. It is not free: Places bills text search per
 * request, so this stays admin-gated and asks for a single result.
 */

const PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const PROBE_TIMEOUT_MS = 8_000;

/* The same mask the desk sends. A probe on a narrower one would not prove the
 * desk's own request is accepted, and a bad field mask is a 400 all of its own. */
const PROBE_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
].join(',');

const REDACTION_PLACEHOLDER = /redacted|sensitive|^\[.*\]$|^\*+$|^x{6,}$/i;

/*
 * The sentences Google uses when the key STRING itself is not recognised, as
 * opposed to a key that is real but blocked. It sends these with a 400, so the
 * status alone points at the wrong culprit.
 */
const INVALID_KEY_TEXT = /api\s*key\s*not\s*valid|invalid\s*api\s*key|api\s*key\s*expired|API_KEY_INVALID|keyInvalid/i;

export type PlacesKeyShape = {
  present: boolean;
  source: string | null;
  length: number;
  last4: string;
  matchesKnownKeyFormat: boolean;
  looksRedacted: boolean;
};

export type PlacesSearchResult = {
  attempted: boolean;
  ok: boolean;
  status: number | null;
  places: number;
  query: string | null;
  error: string | null;
  ms: number;
};

export type PlacesProbeReport = {
  key: PlacesKeyShape;
  search: PlacesSearchResult;
  verdict: string;
};

/** Which variable actually supplies the key, so a fix lands on the right one. */
export function resolvePlacesKey(env: NodeJS.ProcessEnv = process.env): { key: string | null; source: string | null } {
  if (env.GOOGLE_MAPS_API_KEY) return { key: env.GOOGLE_MAPS_API_KEY, source: 'GOOGLE_MAPS_API_KEY' };
  if (env.GOOGLE_PLACES_API_KEY) return { key: env.GOOGLE_PLACES_API_KEY, source: 'GOOGLE_PLACES_API_KEY' };
  return { key: null, source: null };
}

/** Describe a key without disclosing it. Last four only, as everywhere else. */
export function describePlacesKey(key: string | null | undefined, source: string | null): PlacesKeyShape {
  const value = typeof key === 'string' ? key.trim() : '';
  return {
    present: value.length > 0,
    source: value ? source : null,
    length: value.length,
    last4: value.length >= 4 ? value.slice(-4) : '',
    /*
     * A HINT, never a verdict — the same line the OpenRouter probe draws.
     * Google decides whether this key is valid; a pattern written from an
     * assumption may not overrule it. It is useful only for telling "the wrong
     * secret is in this variable" from "the right kind of secret is here and
     * Google still says no".
     */
    matchesKnownKeyFormat: /^AIza[\w-]{35}$/.test(value),
    looksRedacted: value.length > 0 && REDACTION_PLACEHOLDER.test(value),
  };
}

function scrub(text: string, key: string): string {
  return (key ? text.split(key).join('[key]') : text).slice(0, 600);
}

async function readErrorDetail(response: any, key: string): Promise<string> {
  const raw = await response.text().catch(() => '');
  if (!raw) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message || parsed?.message;
    if (message) return scrub(String(message), key);
  } catch { /* not JSON; the raw body is still the best we have */ }
  return scrub(raw, key);
}

/** One real text search — the same call, on the same terms, as the travel desk. */
export async function searchPlacesOnce(
  key: string,
  {
    query = 'hotels in Singapore',
    fetchFn = fetch,
    timeoutMs = PROBE_TIMEOUT_MS,
  }: { query?: string; fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<PlacesSearchResult> {
  const started = Date.now();
  const base: PlacesSearchResult = {
    attempted: true, ok: false, status: null, places: 0, query, error: null, ms: 0,
  };
  const finish = (patch: Partial<PlacesSearchResult>): PlacesSearchResult => ({
    ...base, ...patch, ms: Date.now() - started,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(PLACES_TEXT_SEARCH_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': PROBE_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, pageSize: 1 }),
    } as any);

    if (!response.ok) {
      return finish({ status: response.status, error: await readErrorDetail(response, key) });
    }
    const payload: any = await response.json().catch(() => ({}));
    const places = Array.isArray(payload?.places) ? payload.places.length : 0;
    /*
     * A 200 with no places is still a working key. Places omits the array
     * entirely when nothing matches, which is why the desk's own empty-result
     * path exists — that is a fact about the query, not the credential.
     */
    return finish({ ok: true, status: response.status, places });
  } catch (error: any) {
    const aborted = controller.signal.aborted;
    return finish({ error: aborted ? `timed out after ${timeoutMs}ms` : String(error?.message || error) });
  } finally {
    clearTimeout(timer);
  }
}

/** The verdict — one sentence naming what is wrong and what to do about it. */
export function verdictForPlaces(key: PlacesKeyShape, search: PlacesSearchResult): string {
  if (!key.present) {
    return 'No Google Places key is present in this environment, so live stays and attractions cannot be looked up at all. Set GOOGLE_MAPS_API_KEY in Vercel.';
  }
  if (key.looksRedacted) {
    return `The Places key here is a redaction placeholder, not a key (${key.length} chars ending ${key.last4}). Nothing was ever sent.`;
  }
  if (!search.attempted) {
    return `A Places key is present in ${key.source} (${key.length} chars ending ${key.last4}), but it has not been exercised, so nothing is proven about it.`;
  }
  if (!search.ok) {
    /*
     * READ THE MESSAGE BEFORE THE STATUS.
     *
     * Google answers an unrecognised key with HTTP 400 INVALID_ARGUMENT and
     * the text "API key not valid", not the 401 the status alone implies. This
     * probe's first real call hit exactly that and was told "the key is not the
     * suspect — the request body or field mask is", which would have sent
     * somebody hunting through request code that was completely fine.
     *
     * A diagnostic built to stop a failure being mis-described must not
     * mis-describe one itself. The provider's own sentence is the evidence; the
     * status is a hint, and a 400 can still be our malformed request, so this
     * narrows on the text rather than replacing the branch.
     */
    if (INVALID_KEY_TEXT.test(search.error || '')) {
      const shapeHint = key.matchesKnownKeyFormat
        ? 'It is shaped like a Google key, so the likely causes are a key that was deleted or regenerated, or one belonging to a project that no longer exists.'
        : `It does not match the AIza… format either (${key.length} chars ending ${key.last4}), so the wrong secret in the right variable is worth ruling out.`;
      return `Google does not recognise this key (HTTP ${search.status}: ${search.error}). The value in ${key.source} is not a valid API key. ${shapeHint} Replace it with a key from a project that has Places API (New) enabled and billing active — no change to our request can fix this, and every stay lookup fails identically until it is replaced.`;
    }
    if (search.status === 403) {
      return `Places refused the key with HTTP 403: ${search.error}. Either Places API (New) is not enabled on this project, or the key's restrictions do not permit a server-side call. Both are settled per request, so every stay lookup fails identically and no retry can help — which is exactly what a traveller sees as "Places did not return a list".`;
    }
    if (search.status === 401) {
      return `Places rejected the credential outright (HTTP 401: ${search.error}). The value in ${key.source} is not a valid key.`;
    }
    if (search.status === 400) {
      // A 400 that did NOT name the key: a malformed body or field mask, ours.
      return `Places rejected the request as malformed (HTTP 400: ${search.error}). The credential was not named in the refusal, so the request body or field mask is the suspect, which makes this ours to fix.`;
    }
    if (search.status === 429) {
      return `Places is rate limiting or quota-blocking this key (HTTP 429: ${search.error}). This one does clear on its own, unlike a 403.`;
    }
    if (search.status === 402 || /billing/i.test(search.error || '')) {
      return `Places refused the request over billing (HTTP ${search.status}: ${search.error}). Enable billing on the Google Cloud project behind this key.`;
    }
    return `Could not reach Places to check the key: ${search.error || 'unknown failure'}. Unlike a refusal, this is worth retrying.`;
  }
  if (search.places === 0) {
    return `Places accepted the key and answered in ${search.ms}ms, but returned nothing for "${search.query}". The credential is fine; treat an empty stay list as a fact about the query, not a fault.`;
  }
  return `Places works from here: HTTP 200 with ${search.places} result for "${search.query}" in ${search.ms}ms, using the key in ${key.source}. If a travel stay lookup still fails, the fault is ours.`;
}

const NOT_ATTEMPTED: PlacesSearchResult = {
  attempted: false, ok: false, status: null, places: 0, query: null, error: null, ms: 0,
};

/** Run the check and report. */
export async function probePlaces({
  key,
  source = 'env',
  query,
  fetchFn = fetch,
}: {
  key: string | null | undefined;
  source?: string | null;
  query?: string;
  fetchFn?: typeof fetch;
}): Promise<PlacesProbeReport> {
  const shape = describePlacesKey(key, source);
  if (!shape.present || shape.looksRedacted) {
    return { key: shape, search: NOT_ATTEMPTED, verdict: verdictForPlaces(shape, NOT_ATTEMPTED) };
  }
  const search = await searchPlacesOnce(String(key).trim(), { fetchFn, ...(query ? { query } : {}) });
  return { key: shape, search, verdict: verdictForPlaces(shape, search) };
}
