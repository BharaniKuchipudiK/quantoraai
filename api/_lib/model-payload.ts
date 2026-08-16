/*
 * Trimming model payloads (Roadmap 0.3 — efficiency).
 *
 * Generated artifacts embed images/fonts as base64 `data:` URIs — often tens or
 * hundreds of KB each. Shipping those bytes to a model on repair/verify wastes
 * tokens (cost + latency) and crowds real code out of the context window. The
 * bytes never help the model reason about the code.
 *
 * Two modes, by whether the model returns the code back:
 *   - stripDataUris:  one-way elision. Use when the model returns something
 *     OTHER than the code (e.g. a verification critique). Structure is kept
 *     (the `data:<mime>;base64,` prefix stays) so an <img> still reads as an
 *     image — only the payload is dropped.
 *   - tokenize/restore: round-trip. Use when the model MUST return the code
 *     (e.g. repair). Each data-URI becomes a short inert token before sending
 *     and is restored afterwards, so images survive without ever being re-sent.
 */

// Base64 data-URI: `data:<mime>;base64,<payload>`. The payload charset excludes
// quotes, whitespace, parens, `<`/`>`, so the match stops cleanly at the end of
// an HTML attribute or a CSS url(...).
const DATA_URI_RE = /data:[^;,"'\s]+;base64,[A-Za-z0-9+/=]+/g;

const ASSET_TOKEN_PREFIX = "data:quantora/asset;id=";
const ASSET_TOKEN_RE = /data:quantora\/asset;id=(\d+)/g;

/** Elide base64 payloads, keeping the mime prefix. One-way (no restore). */
export function stripDataUris(code: string): string {
  return String(code || "").replace(DATA_URI_RE, (m) => {
    const cut = m.indexOf("base64,") + "base64,".length;
    return m.slice(0, cut) + "…"; // "…" — payload elided
  });
}

/**
 * Replace each base64 data-URI with a short opaque token and return the map to
 * restore them later. The token is itself a valid-looking `data:` URI, so a
 * model instructed to preserve images keeps it intact.
 */
export function tokenizeDataUris(code: string): { tokenized: string; assets: string[] } {
  const assets: string[] = [];
  const tokenized = String(code || "").replace(DATA_URI_RE, (m) => {
    const id = assets.length;
    assets.push(m);
    return `${ASSET_TOKEN_PREFIX}${id}`;
  });
  return { tokenized, assets };
}

/** Reverse tokenizeDataUris. Unknown/dropped tokens are left as-is. */
export function restoreDataUris(code: string, assets: string[]): string {
  if (!assets || assets.length === 0) return String(code || "");
  return String(code || "").replace(ASSET_TOKEN_RE, (m, id) => {
    const i = Number(id);
    return Number.isInteger(i) && i >= 0 && i < assets.length ? assets[i] : m;
  });
}
