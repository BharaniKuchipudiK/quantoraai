import { applyCors, clientIp, isRateLimited } from "./_lib/rate-limit.js";
import { fetchWithTimeout } from "./_lib/fetch-timeout.js";
import { isAllowedPreviewImageUrl } from "../src/lib/preview-images.js";

const MAX_BYTES = 1_500_000;

function targetUrl(req: { query?: Record<string, unknown>; url?: string }) {
  const fromQuery = req.query?.u;
  if (typeof fromQuery === "string" && fromQuery.trim()) return fromQuery.trim();
  try {
    const parsed = new URL(String(req.url || ""), "http://127.0.0.1");
    return parsed.searchParams.get("u") || "";
  } catch {
    return "";
  }
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
