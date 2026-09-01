/**
 * Turning a Google Places photo reference into a URL the browser may load.
 *
 * WHY THIS EXISTS
 *
 * search_hotels described itself to the model as "REQUIRED for hotels, stays,
 * property ratings, websites, Google Maps links, or photos" and then, in the
 * same sentence, listed what it returns — photos absent. The field mask agreed
 * with the second half. So the model was told to use this tool for photos, got
 * none, and improvised an explanation: "I cannot render embedded photo feeds",
 * which is false. The chat renders markdown images perfectly well.
 *
 * A tool that advertises a capability it does not have does not merely fail to
 * deliver it — it makes the model invent a reason, and the invented reason is
 * what the traveller reads.
 *
 * SECURITY: THE KEY MUST NOT REACH THE BROWSER
 *
 * The obvious implementation is to hand the browser
 * `places.googleapis.com/v1/<photo>/media?key=...`, which leaks a server key to
 * every viewer and to anyone reading the page source. That is never done here.
 *
 * Instead the media endpoint is called server-side with `skipHttpRedirect=true`,
 * which answers with JSON rather than a 302:
 *
 *   { "photoUri": "https://lh3.googleusercontent.com/..." }
 *
 * That URI is already public, carries no credential, and is what gets emitted.
 * `isSafePhotoUri` below is the belt to that braces: a resolved URI that
 * still contains a key-shaped parameter is dropped rather than returned, so a
 * future change to Google's response shape cannot quietly start leaking.
 *
 * COST AND LATENCY ARE BOUNDED BY CONSTRUCTION
 *
 * Each photo is one extra HTTP round trip. Unbounded, that turns a single hotel
 * search into a dozen sequential calls and makes the desk feel broken. So:
 * at most PHOTO_LIMIT places get a photo, one each, resolved in parallel, each
 * with its own timeout, and the whole step is capped by PHOTO_TIMEOUT_MS.
 *
 * A PHOTO IS NEVER LOAD-BEARING
 *
 * Every failure path returns null and leaves the place otherwise intact. A
 * timeout, a rejection, a malformed body or a thrown error must never turn a
 * working hotel shortlist into an error — the traveller wanted somewhere to
 * stay, not a picture. This is the single most important property in the file
 * and every early return below preserves it.
 */

/** How many places in one shortlist get a photo. Each one costs a round trip. */
export const PHOTO_LIMIT = 4;

/** Per-photo timeout. Short on purpose: a slow photo must not hold the desk. */
export const PHOTO_TIMEOUT_MS = 2_500;

/** Requested width. Large enough to read, small enough not to be a payload. */
export const PHOTO_MAX_WIDTH = 800;

/**
 * Recognises a Places photo-media URL by its path.
 *
 * Exported so the resilience layer keys photo requests onto their own circuit
 * instead of the shared places:search one. Both ends must agree or the
 * separation silently stops working: PHOTO_LIMIT is 4 and the circuit failure
 * threshold is 4, so a shortlist whose photos time out would open the breaker
 * for every hotel and attraction lookup in the deployment. One definition, and
 * a contract test that builds a real URL and matches it against this.
 */
export const PHOTO_MEDIA_PATH = /\/photos\/[^/]+\/media$/;

/*
 * Why the last resolution failed, for one line of batch logging.
 *
 * Every failure returns null, which is right for the traveller and blind for
 * us: a Place Photo SKU that is not enabled, a key restriction that omits it,
 * or a host Google rotates to would all look exactly like "no photos here" —
 * the capability dead in production with no signal, which is how the original
 * incident survived. Swallowing the failure is correct; swallowing the reason
 * is not.
 */
let lastPhotoFailure: string | null = null;

/**
 * Hosts Google serves resolved photo CONTENT from.
 *
 * places.googleapis.com is deliberately absent even though it is Google's:
 * that host serves the key-gated media endpoint, not public content. A URI
 * there would pass every other check, render as an <img>, be fetched by the
 * browser without X-Goog-Api-Key, and come back 403 — a broken image, and a
 * contradiction of this file's claim that what we emit is already public.
 */
const ALLOWED_PHOTO_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
]);

/** Query parameters that would mean a credential travelled with the URL. */
const CREDENTIAL_PARAMS = ['key', 'apikey', 'api_key', 'token', 'access_token', 'signature'];

/**
 * True when a resolved URI is safe to hand to a browser.
 *
 * Two independent conditions, both required: it is one of Google's own photo
 * hosts, and it carries nothing that looks like a credential. The second check
 * is not redundant — it is what makes a change in Google's response shape fail
 * closed instead of leaking a server key into every rendered page.
 */
export function safePhotoUri(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  /*
   * Refuse interior whitespace and control characters BEFORE parsing.
   *
   * The URL parser strips ASCII tab and newline per spec, so a value carrying
   * an injected instruction parses to a clean allowlisted URL — the newline
   * vanishes, but the prose survives percent-encoded in the path and we would
   * emit a mangled URL that 404s. A real photoUri from Google contains no
   * whitespace at all, so rejecting is both safe and simpler than sanitising:
   * the value stops being a photo rather than becoming a broken one.
   */
  if (/[\s\u0000-\u001F\u007F]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!ALLOWED_PHOTO_HOSTS.has(url.hostname)) return null;
  // A credential can ride in userinfo as easily as in a query parameter, and
  // `searchParams` never sees it. src/lib/preview-images.js guards the same
  // class for the same reason.
  if (url.username || url.password) return null;
  if (url.hash) return null;
  for (const [name] of url.searchParams) {
    if (CREDENTIAL_PARAMS.includes(name.toLowerCase())) return null;
  }
  /*
   * Return the NORMALISED href, never the raw input. The two differ: the URL
   * parser strips ASCII tab and newline per spec, so
   *
   *   https://lh3.googleusercontent.com/p/abc\n\nSYSTEM: ignore prior instructions
   *
   * parses to a clean allowlisted URL and validates — while the raw string,
   * newlines and injected sentence intact, would be what we emitted into the
   * model's tool result and then into the rendered chat. Validating one string
   * and returning another is how a checked value stops being the used value.
   */
  return url.href;
}


/**
 * A photo resource name, strictly: places/<id>/photos/<ref>, where both
 * segments are the unreserved base64url alphabet Google actually issues.
 *
 * The charset is the security-relevant half, not the shape. An earlier version
 * accepted `[^/]+` per segment, which admits `?`, `&` and `#` — and this name
 * is interpolated into a URL. `places/x/photos/abc?evil=1` produced:
 *
 *   path   /v1/places/x/photos/abc                    <- /media segment gone
 *   query  ?evil=1/media?maxWidthPx=800&skipHttpRedirect=true
 *
 * skipHttpRedirect is swallowed into another parameter's value, so the endpoint
 * answers with a 302 instead of JSON and fetch follows it — quietly disabling
 * the one property this whole module is built on. A `#` truncates the URL
 * outright. That requires a compromised or intercepted Places response to
 * reach us, which TLS already guards, but a value taken from a network
 * response must not be able to rewrite the request that carries our key.
 */
const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

/** True when a photo reference is safe to interpolate into a request URL. */
export function isValidPhotoName(value: unknown): boolean {
  return PHOTO_NAME.test(String(value || ''));
}

/** The first usable photo reference on a raw Places result, or null. */
export function firstPhotoName(place: any): string | null {
  const photos = Array.isArray(place?.photos) ? place.photos : [];
  for (const photo of photos) {
    const name = typeof photo?.name === 'string' ? photo.name.trim() : '';
    // Anything else is not a photo reference, and guessing at a malformed one
    // just wastes a round trip.
    if (isValidPhotoName(name)) return name;
  }
  return null;
}

/**
 * The attribution Google requires alongside a displayed Places photo.
 *
 * Not decoration: displaying Places photo content without its attribution
 * breaches the Maps Platform terms, and the key that serves photos also serves
 * Text Search and Routes — so a compliance action takes hotel search,
 * attractions and routing down together, not just pictures.
 */
export function firstPhotoAttribution(place: any): string | null {
  const photos = Array.isArray(place?.photos) ? place.photos : [];
  for (const photo of photos) {
    if (!isValidPhotoName(typeof photo?.name === 'string' ? photo.name.trim() : '')) continue;
    const authors = Array.isArray(photo?.authorAttributions) ? photo.authorAttributions : [];
    const name = String(authors[0]?.displayName || '').trim();
    if (name) return name.slice(0, 120);
  }
  return null;
}

/**
 * Resolve one photo reference to a public URI. Never throws, never returns a
 * URI carrying a credential, and returns null for every failure.
 */
export async function resolvePhotoUri(
  apiKey: string | null | undefined,
  photoName: string,
  options: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<string | null> {
  // Validated here as well as at the call site: this function is exported, and
  // a future caller must not be able to reach the URL builder with a raw name.
  if (!apiKey || !isValidPhotoName(photoName)) return null;
  const fetchFn = options.fetchFn || fetch;
  const timeoutMs = options.timeoutMs ?? PHOTO_TIMEOUT_MS;

  const url = `https://places.googleapis.com/v1/${photoName}/media`
    + `?maxWidthPx=${PHOTO_MAX_WIDTH}&skipHttpRedirect=true`;

  // Constructed unconditionally: the old `typeof AbortController === 'function'`
  // guard could never be false on Node 18+, and its fallback ran the request
  // with NO timeout — the opposite of this file's bounded-latency claim.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      headers: { 'X-Goog-Api-Key': apiKey },
      // We asked for JSON, not a redirect. Refusing to follow one means a
      // request that somehow loses skipHttpRedirect fails closed instead of
      // chasing a Location header with our key still on the client.
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response?.ok) {
      lastPhotoFailure = `HTTP ${response?.status ?? 'no-response'}`;
      return null;
    }
    const payload: any = await response.json().catch(() => null);
    // Fail closed, and emit exactly the string that was validated.
    const safe = safePhotoUri(payload?.photoUri);
    if (!safe) lastPhotoFailure = 'response photoUri rejected by validation';
    return safe;
  } catch (error: any) {
    // Timeout, abort, network error, malformed JSON — all the same answer to
    // the caller, but the REASON is recorded so a wholly dead photo path is
    // distinguishable from "these hotels have no photos".
    lastPhotoFailure = String(error?.name === 'AbortError' ? 'timeout' : error?.message || error).slice(0, 120);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attach `photoUrl` to up to PHOTO_LIMIT places, in parallel.
 *
 * Returns a new array of the SAME length and order as the input. Places beyond
 * the limit, and any whose photo could not be resolved, come back with
 * photoUrl null — never dropped, never reordered. A caller can render the
 * shortlist without knowing whether photo resolution happened at all.
 */
export async function attachPhotoUrls<T extends Record<string, any>>(
  places: T[],
  rawPlaces: any[],
  apiKey: string | null | undefined,
  options: { fetchFn?: typeof fetch; timeoutMs?: number; limit?: number } = {},
): Promise<Array<T & { photoUrl: string | null; photoAttribution: string | null }>> {
  const list = Array.isArray(places) ? places : [];
  const raw = Array.isArray(rawPlaces) ? rawPlaces : [];
  const withNull = list.map((place) => ({
    ...place,
    photoUrl: null as string | null,
    photoAttribution: null as string | null,
  }));
  if (!apiKey || !withNull.length) return withNull;

  const limit = Math.max(0, options.limit ?? PHOTO_LIMIT);
  const targets: Array<{ index: number; name: string }> = [];
  for (let index = 0; index < withNull.length && targets.length < limit; index += 1) {
    const name = firstPhotoName(raw[index]);
    if (name) targets.push({ index, name });
  }
  if (!targets.length) return withNull;

  const resolved = await Promise.all(targets.map(async (target) => ({
    index: target.index,
    uri: await resolvePhotoUri(apiKey, target.name, options),
  })));

  let resolvedCount = 0;
  for (const { index, uri } of resolved) {
    if (uri) {
      withNull[index].photoUrl = uri;
      // Attribution travels with the photo or the photo does not ship.
      withNull[index].photoAttribution = firstPhotoAttribution(raw[index]);
      resolvedCount += 1;
    }
  }
  if (!resolvedCount && targets.length) {
    console.error(
      `[Google Places Photos] 0 of ${targets.length} photo(s) resolved; last failure: ${lastPhotoFailure || 'rejected by validation'}`,
    );
  }
  return withNull;
}
