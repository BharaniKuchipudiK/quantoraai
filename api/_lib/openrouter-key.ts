/**
 * OpenRouter keys are `sk-or-v1-…`. A non-empty Vercel env var with any other
 * shape (e.g. Stripe `sk_live_…`) still makes openRouterConfigured=true and
 * blocks the Supabase gateway fallback — while OpenRouter "Last Used" stays
 * Never on the key the operator thinks they pasted.
 */

export type OpenRouterKeyShape = 'openrouter' | 'stripe-like' | 'other' | 'missing';

export function openRouterKeyShape(value: unknown): OpenRouterKeyShape {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key) return 'missing';
  if (/^sk-or-v1-/i.test(key)) return 'openrouter';
  if (/^sk_live_/i.test(key)) return 'stripe-like';
  return 'other';
}

export function isOpenRouterApiKey(value: unknown): boolean {
  return openRouterKeyShape(value) === 'openrouter';
}

/** Prefer a real OpenRouter key; ignore impostors so gateway/BYOK can take over. */
export function resolveOpenRouterEnvKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = typeof env.OPENROUTER_API_KEY === 'string' ? env.OPENROUTER_API_KEY.trim() : '';
  if (!raw) return undefined;
  return isOpenRouterApiKey(raw) ? raw : undefined;
}

/**
 * Safe for public health: family + last 3 chars when it is an OpenRouter key.
 * Never returns the full secret.
 */
export function openRouterEnvPublicHint(env: NodeJS.ProcessEnv = process.env): {
  shape: OpenRouterKeyShape;
  hint: string | null;
} {
  const raw = typeof env.OPENROUTER_API_KEY === 'string' ? env.OPENROUTER_API_KEY.trim() : '';
  const shape = openRouterKeyShape(raw);
  if (shape === 'missing') return { shape, hint: null };
  if (shape === 'openrouter' && raw.length >= 10) {
    return { shape, hint: `sk-or-v1-...${raw.slice(-3)}` };
  }
  if (shape === 'stripe-like') return { shape, hint: 'sk_live_… (not OpenRouter)' };
  return { shape, hint: `${raw.slice(0, Math.min(6, raw.length))}… (unexpected)` };
}
