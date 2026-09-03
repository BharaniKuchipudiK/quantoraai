import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { mimeTypeFor, routeStaticPath } from "./static-policy.js";

/*
 * Serve the desktop renderer on quantora://app.
 *
 * The policy is the desktop's own, and strict: scripts and styles only from
 * the app itself (Monaco and xterm need inline styles and blob workers),
 * connections only to the app origin — every API call goes through the
 * host's proxy, never straight to the network — and no frames at all.
 */
export const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export type StaticServer = (request: Request) => Response;

export function createStaticServer(distDir: string): StaticServer {
  const indexPath = path.join(distDir, "index.html");

  const exists = (relativePath: string) => {
    const full = path.join(distDir, relativePath);
    if (!full.startsWith(distDir)) return false;
    return existsSync(full) && statSync(full).isFile();
  };

  return (request: Request) => {
    const url = new URL(request.url);
    const route = routeStaticPath(url.pathname, exists);
    if (route.kind === "forbidden") return new Response("Not found", { status: 404 });

    const filePath = route.kind === "index" ? indexPath : path.join(distDir, route.relativePath);
    const headers: Record<string, string> = {
      "content-security-policy": RENDERER_CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cross-origin-opener-policy": "same-origin",
      "content-type": route.kind === "index" ? "text/html; charset=utf-8" : mimeTypeFor(route.relativePath),
      "cache-control": route.kind === "index" ? "no-store" : "public, max-age=3600",
    };

    let body: Buffer;
    try {
      body = readFileSync(filePath);
    } catch {
      return new Response("Not found", { status: 404 });
    }
    return new Response(body, { status: 200, headers });
  };
}
