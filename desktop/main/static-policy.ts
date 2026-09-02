import path from "node:path";

/*
 * Pure routing for the bundled web app, mirroring vercel.json's SPA rewrite:
 *
 *   /((?!api/.*|preview/.*|monaco/.*|robots.txt|sitemap.xml).*)  →  /index.html
 *
 * Everything under /preview/ and /monaco/ is a real file or a 404. Anything
 * else that does not exist on disk is the SPA shell. Path traversal is
 * rejected here, before any filesystem call.
 */

export type StaticRoute =
  | { kind: "file"; relativePath: string }
  | { kind: "index" }
  | { kind: "forbidden" };

const NEVER_FALLBACK = [/^\/preview\//, /^\/monaco\//, /^\/robots\.txt$/, /^\/sitemap\.xml$/];

export function routeStaticPath(pathname: string, exists: (relativePath: string) => boolean): StaticRoute {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { kind: "forbidden" };
  }
  if (decoded.includes("\0")) return { kind: "forbidden" };
  // Checked on the raw path: normalize() would silently clamp "/../x" to "/x",
  // and a request that tried to climb out is refused, not repaired.
  if (decoded.split("/").includes("..")) return { kind: "forbidden" };

  const normalized = path.posix.normalize(decoded);
  if (!normalized.startsWith("/")) return { kind: "forbidden" };

  if (normalized === "/" || normalized === "/index.html") return { kind: "index" };

  const relativePath = normalized.slice(1);
  if (exists(relativePath)) return { kind: "file", relativePath };
  if (NEVER_FALLBACK.some((pattern) => pattern.test(normalized))) return { kind: "forbidden" };
  return { kind: "index" };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};

export function mimeTypeFor(relativePath: string): string {
  return MIME[path.posix.extname(relativePath).toLowerCase()] || "application/octet-stream";
}

/**
 * Headers vercel.json would serve for this path, minus the ones that only
 * mean something over https. Everything CSP/COOP/COEP stays, so the desktop
 * renderer runs under exactly the production policy.
 */
export function rendererHeaders(resolved: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolved)) {
    if (key === "strict-transport-security") continue;
    out[key] = value;
  }
  return out;
}
