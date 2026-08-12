/*
 * Coarse geo from the edge — no browser geolocation API, no raw IP stored.
 *
 * On Vercel, country/region/city come from request headers derived at the
 * edge. Locally these are usually absent, which is fine (nulls in the DB).
 */

export type RequestGeo = {
  countryCode: string;
  region: string | null;
  city: string | null;
};

function headerValue(headers: Record<string, unknown>, ...names: string[]): string | null {
  for (const name of names) {
    const raw = headers[name] ?? headers[name.toLowerCase()];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].trim()) return raw[0].trim();
  }
  return null;
}

function sanitizeCountry(code: string | null): string | null {
  if (!code) return null;
  const upper = code.toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(upper)) return null;
  if (upper === "XX" || upper === "T1") return null;
  return upper;
}

function sanitizeRegion(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 32);
}

function sanitizeCity(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value).slice(0, 64);
  } catch {
    return value.slice(0, 64);
  }
}

/** Returns geo when edge headers are present; otherwise null. */
export function getRequestGeo(req: any): RequestGeo | null {
  const headers = req?.headers || {};
  const countryCode = sanitizeCountry(headerValue(
    headers,
    "x-vercel-ip-country",
    "cf-ipcountry",
    "x-country-code",
  ));
  if (!countryCode) return null;

  return {
    countryCode,
    region: sanitizeRegion(headerValue(headers, "x-vercel-ip-country-region", "x-region-code")),
    city: sanitizeCity(headerValue(headers, "x-vercel-ip-city", "x-city")),
  };
}
