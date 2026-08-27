type OriginRequest = {
  headers?: Record<string, string | string[] | undefined>;
};

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return typeof value === "string" ? value.trim() : "";
}

function originFromRequest(req?: OriginRequest): string | null {
  const host = headerValue(req?.headers?.["x-forwarded-host"]) || headerValue(req?.headers?.host);
  if (!host || /^localhost(:\d+)?$/i.test(host) || host === "127.0.0.1") return null;
  const proto = headerValue(req?.headers?.["x-forwarded-proto"]) || (process.env.VERCEL ? "https" : "http");
  return `${proto}://${host.replace(/\/+$/, "")}`;
}

/**
 * Canonical site origin for OAuth redirects and reset links.
 * Prefer the incoming request host so OAuth callbacks match quantoraai.app
 * even when APP_URL still points at an old Vercel default domain.
 */
export function appOrigin(req?: OriginRequest): string {
  const fromRequest = originFromRequest(req);
  if (fromRequest) return fromRequest;

  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}
