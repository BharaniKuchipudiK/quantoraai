import { protocol } from "electron";
import { DESKTOP_APP_ORIGIN, DESKTOP_DEEP_LINK_SCHEME } from "../../shared/desktop-contract.js";
import { isApiPath } from "./api-proxy-policy.js";
import { proxyApiRequest } from "./api-proxy.js";
import { createStaticServer } from "./static-server.js";

/*
 * quantora:// — one scheme, two jobs:
 *
 *   quantora://app/api/*   → proxied to the API with the bearer token
 *   quantora://app/*       → the bundled web app under the vercel.json policy
 *   quantora://auth/*      → deep links; handled by the OS → app, never fetched
 *
 * `standard` gives the origin real URL semantics (localStorage, relative
 * URLs); `secure` makes it a secure context (crypto.subtle, clipboard);
 * `supportFetchAPI` lets the renderer's fetch() reach this handler;
 * `stream` lets SSE bodies flow through unbuffered.
 */

const APP_HOST = new URL(DESKTOP_APP_ORIGIN).host;

/** Must run before app.whenReady(). */
export function registerQuantoraScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: DESKTOP_DEEP_LINK_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: false,
        allowServiceWorkers: false,
        bypassCSP: false,
      },
    },
  ]);
}

export function installQuantoraProtocol(options: { apiOrigin: string; distDir: string; vercelConfigFile: string }): void {
  const serveStatic = createStaticServer(options.distDir, options.vercelConfigFile);

  protocol.handle(DESKTOP_DEEP_LINK_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response("Not found", { status: 404 });
    if (isApiPath(url.pathname)) return proxyApiRequest(request, options.apiOrigin);
    return serveStatic(request);
  });
}
