/**
 * Bring-your-own-key credentials must travel in headers, not JSON bodies.
 * Bodies are routinely logged by proxies, APM, and support tooling.
 */

export const BYOK_HEADER_GEMINI = "x-quantora-gemini-key";
export const BYOK_HEADER_OPENROUTER = "x-quantora-openrouter-key";
export const BYOK_HEADER_ANTHROPIC = "x-quantora-anthropic-key";

export const BYOK_CORS_HEADERS = [
  BYOK_HEADER_GEMINI,
  BYOK_HEADER_OPENROUTER,
  BYOK_HEADER_ANTHROPIC,
].join(", ");

function firstHeader(
  value: unknown,
): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
    return value[0].trim();
  }
  return undefined;
}

function headerOf(req: { headers?: Record<string, unknown> }, name: string): string | undefined {
  const headers = req.headers || {};
  const wanted = name.toLowerCase();
  const direct = firstHeader(headers[name]) || firstHeader(headers[wanted]);
  if (direct) return direct;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) {
      const found = firstHeader(value);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Resolve BYOK from request headers only.
 * Legacy body fields (userKey / openRouterKey / anthropicKey) are ignored so
 * keys do not re-enter loggable payloads after clients migrate.
 */
export function readByokCredentials(req: {
  headers?: Record<string, unknown>;
  body?: Record<string, unknown> | null;
}): {
  gemini?: string;
  openRouter?: string;
  anthropic?: string;
} {
  const gemini = headerOf(req, BYOK_HEADER_GEMINI);
  const openRouter = headerOf(req, BYOK_HEADER_OPENROUTER);
  const anthropic = headerOf(req, BYOK_HEADER_ANTHROPIC);
  return {
    ...(gemini ? { gemini } : {}),
    ...(openRouter ? { openRouter } : {}),
    ...(anthropic ? { anthropic } : {}),
  };
}
