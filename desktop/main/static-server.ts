import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { resolveHeadersForPath } from "../../src/lib/vercel-headers.js";
import { mimeTypeFor, rendererHeaders, routeStaticPath } from "./static-policy.js";

/*
 * Serve the bundled `dist/` on quantora://app with the vercel.json header
 * policy. vercel.json is read once at install time from the packaged copy,
 * so the desktop cannot drift from what production serves (design §3, §9).
 */

type HeadersConfig = { headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };

export type StaticServer = (request: Request) => Response;

export function createStaticServer(distDir: string, vercelConfigFile: string): StaticServer {
  const config: HeadersConfig = JSON.parse(readFileSync(vercelConfigFile, "utf8"));
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
    const policyPath = route.kind === "index" ? url.pathname : `/${route.relativePath}`;
    const headers = rendererHeaders(resolveHeadersForPath(config, policyPath) as Record<string, string>);
    headers["content-type"] = route.kind === "index" ? "text/html; charset=utf-8" : mimeTypeFor(route.relativePath);
    headers["cache-control"] = route.kind === "index" ? "no-store" : "public, max-age=3600";

    let body: Buffer;
    try {
      body = readFileSync(filePath);
    } catch {
      return new Response("Not found", { status: 404 });
    }
    return new Response(body, { status: 200, headers });
  };
}
