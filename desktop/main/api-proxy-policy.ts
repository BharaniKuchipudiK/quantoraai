/*
 * Pure policy for the /api proxy: which request headers cross to the API,
 * which response headers come back, and where a path goes. Electron-free so
 * the root test runner covers it.
 *
 * Why a proxy at all: the renderer keeps calling relative `/api/...` exactly
 * as the web app does, so no call site changes, the dead-control gate keeps
 * seeing every path, and the bearer token never enters the renderer — the
 * main process attaches it here. CORS is not involved: main-process fetches
 * are not browser requests.
 */

export const API_PATH_PREFIX = "/api/";

const REQUEST_HEADER_ALLOWLIST = new Set([
  "content-type",
  "accept",
  "accept-language",
  "x-quantora-correlation-id",
  "x-quantora-golden-canary",
  "x-quantora-gemini-key",
  "x-quantora-openrouter-key",
  "x-quantora-anthropic-key",
]);

/*
 * Dropped on the way back: cookies (the desktop never uses the cookie
 * carrier; a stray Set-Cookie would land in a jar nothing reads), hop-by-hop
 * and encoding headers (the body is already decoded by the time we see it)
 * and CORS headers (meaningless on a same-origin custom scheme).
 */
const RESPONSE_HEADER_DENYLIST = new Set([
  "set-cookie",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "strict-transport-security",
]);

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith(API_PATH_PREFIX);
}

export function upstreamUrl(apiOrigin: string, requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${apiOrigin.replace(/\/+$/, "")}${url.pathname}${url.search}`;
}

/** Headers to send upstream: the allowlist from the renderer, plus the bearer. */
export function upstreamHeaders(
  incoming: Iterable<[string, string]>,
  token: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of incoming) {
    const key = name.toLowerCase();
    if (REQUEST_HEADER_ALLOWLIST.has(key)) out[key] = value;
  }
  if (token) out.authorization = `Bearer ${token}`;
  return out;
}

export function downstreamHeaders(incoming: Iterable<[string, string]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of incoming) {
    const key = name.toLowerCase();
    if (!RESPONSE_HEADER_DENYLIST.has(key)) out[key] = value;
  }
  return out;
}

export function methodHasBody(method: string): boolean {
  const upper = method.toUpperCase();
  return upper !== "GET" && upper !== "HEAD";
}
