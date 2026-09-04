import { applyCors, clientIp, isRateLimited } from "../rate-limit.js";
import { fetchWithTimeout } from "../fetch-timeout.js";
import { isAllowedPreviewImageUrl } from "../../../src/lib/preview-images.js";

const MAX_BYTES = 1_500_000;
const PROXY_PATH = "/api/preview-image";

/*
 * CONTRACT: `u` is the LAST query parameter and owns everything after it.
 *
 * The system prompt's own example teaches the model to emit
 * `?u=https://images.unsplash.com/photo-<id>?w=1200&q=80` — UNENCODED. The
 * old implementation read req.query.u, so the platform's query parser split
 * on `&` and silently dropped every parameter after the first one; any image
 * whose required params follow an `&` (full Unsplash URLs carry ixid and
 * signature params) 404'd upstream and rendered as an empty frame (2026-09-01
 * boutique catalog). Exported for its gate, preview-image-url.test.ts.
 */
/*
 * A TARGET THAT IS ITSELF THIS PROXY IS UNWRAPPED, NOT REFUSED.
 *
 * The system prompt tells the model, in bold, that "every product and hero
 * image MUST be a real photograph loaded through Quantora's same-origin proxy:
 * <img src=\"/api/preview-image?u=https://images.unsplash.com/photo-<id>...\">".
 *
 * On a FOLLOW-UP turn the model is looking at markup whose urls were already
 * absolutised to https://<origin>/api/preview-image?u=..., because that is what
 * the preview shell needs. It obeys the instruction again and wraps the wrapped
 * url. absolutizePreviewProxyUrls then percent-encodes the whole thing, and the
 * proxy is asked to fetch <origin> — not a photo host — so it answers 400 and
 * every product frame is empty. Observed in production on 2026-09-04:
 *
 *   ?u=https%3A%2F%2Fquantoraai.app%2Fapi%2Fpreview-image%3Fu%3Dhttps%3A%2F%2F
 *      images.unsplash.com%2Fphoto-1559056199-641a0ac8b55e%3Fw%3D1200%26q%3D80
 *
 * proxyRemoteShopImages and rewritePreviewImageUrls both guard against OUR code
 * wrapping twice. Nothing unwrapped a nesting the MODEL wrote, and refusing it
 * punishes the model for following the brief we gave it — the same shape as the
 * intake modal discarded over a newline.
 *
 * Unwrapping happens HERE, at the proxy, deliberately: it repairs every page
 * already generated, with no rebuild. The loop is bounded because a hostile
 * caller could otherwise nest to exhaust it; four is far past anything the
 * pipeline produces, and what is left after the limit is still put through the
 * allowlist, so nothing escapes that check.
 */
const MAX_PROXY_UNWRAPS = 4;

export function unwrapNestedProxyTarget(value: string): string {
  let current = String(value || "").trim();
  for (let depth = 0; depth < MAX_PROXY_UNWRAPS; depth += 1) {
    const marker = current.indexOf(`${PROXY_PATH}?u=`);
    if (marker === -1) return current;
    const inner = current.slice(marker + `${PROXY_PATH}?u=`.length).trim();
    if (!inner) return current;
    if (/^https?:\/\//i.test(inner)) { current = inner; continue; }
    let decoded = inner;
    try { decoded = decodeURIComponent(inner).trim(); } catch { return current; }
    if (!/^https?:\/\//i.test(decoded)) return current;
    current = decoded;
  }
  return current;
}

export function targetUrl(req: { query?: Record<string, unknown>; url?: string }) {
  try {
    const rawUrl = String(req.url || "");
    const q = rawUrl.indexOf("?");
    if (q !== -1) {
      const match = rawUrl.slice(q + 1).match(/(?:^|&)u=([\s\S]+)$/);
      if (match) {
        const raw = match[1].trim();
        if (/^https?:\/\//i.test(raw)) return unwrapNestedProxyTarget(raw);
        try {
          const decoded = decodeURIComponent(raw).trim();
          if (/^https?:\/\//i.test(decoded)) return unwrapNestedProxyTarget(decoded);
        } catch { /* fall through to the raw value */ }
        return unwrapNestedProxyTarget(raw);
      }
    }
  } catch { /* fall through to the parsed query */ }
  const fromQuery = req.query?.u;
  return typeof fromQuery === "string" ? unwrapNestedProxyTarget(fromQuery.trim()) : "";
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  if (isRateLimited(`preview-image:${clientIp(req)}`, 80, 60_000)) {
    return res.status(429).json({ error: "Too many image requests." });
  }

  const raw = targetUrl(req);
  if (!isAllowedPreviewImageUrl(raw)) {
    return res.status(400).json({ error: "That photo host is not allowed in Preview." });
  }

  try {
    const upstream = await fetchWithTimeout(raw, {
      redirect: "follow",
      headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
    }, 8_000);
    const finalUrl = String(upstream.url || raw);
    if (!isAllowedPreviewImageUrl(finalUrl)) {
      return res.status(400).json({ error: "That photo redirected off an allowed host." });
    }
    const type = String(upstream.headers.get("content-type") || "");
    if (!upstream.ok || !/^image\//i.test(type)) {
      return res.status(upstream.status === 404 ? 404 : 502).json({ error: "Preview could not load that photo." });
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.length > MAX_BYTES) {
      return res.status(413).json({ error: "That photo is too large for Preview." });
    }
    res.setHeader("Content-Type", type.split(";")[0]);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).end(bytes);
  } catch {
    return res.status(502).json({ error: "Preview could not load that photo." });
  }
}
