type OriginRequest = {
  headers?: Record<string, string | string[] | undefined>;
};

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return typeof value === "string" ? value.trim() : "";
}

function hostFromOrigin(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return "";
  }
}

function configuredOrigin(): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    return `https://${production.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

function originFromRequest(req?: OriginRequest): string | null {
  const host = headerValue(req?.headers?.["x-forwarded-host"]) || headerValue(req?.headers?.host);
  if (!host || /^localhost(:\d+)?$/i.test(host) || host === "127.0.0.1") return null;
  const proto = headerValue(req?.headers?.["x-forwarded-proto"]) || (process.env.VERCEL ? "https" : "http");
  return `${proto}://${host.replace(/\/+$/, "")}`;
}

function isAllowedOAuthHost(origin: string): boolean {
  const host = hostFromOrigin(origin);
  if (!host) return false;
  if (host === "quantoraai.app" || host === "www.quantoraai.app") return true;
  if (host.endsWith(".vercel.app")) return true;
  return host === hostFromOrigin(configuredOrigin());
}

/**
 * Canonical site origin for password-reset links and other emailed URLs.
 * Never derived from unvalidated request headers.
 */
export function appOrigin(): string {
  return configuredOrigin();
}

/**
 * Origin for OAuth redirects/callbacks. Prefer the live request host when it
 * matches an allowlisted Quantora domain so quantoraai.app works even if
 * APP_URL still points at an old Vercel default domain.
 */
export function oauthOrigin(req?: OriginRequest): string {
  const fromRequest = originFromRequest(req);
  if (fromRequest && isAllowedOAuthHost(fromRequest)) return fromRequest;
  return configuredOrigin();
}
