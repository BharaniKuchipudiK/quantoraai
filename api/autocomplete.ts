import { UNTUNED_GEMINI_CEILING_MS } from './_lib/gemini-call-budget.js';
import { GoogleGenAI } from "@google/genai";
import { applyCors, clientIp, isRateLimited, isRateLimitedDurable, applyDurableCostBearingGuard } from './_lib/rate-limit.js';
import { requireActiveSession } from "./_lib/authz.js";
import { fetchGatewayCredential, resolveCapabilityCredential } from './_lib/credential-broker.js';

/** Google-maintained alias for the current Flash model. A pinned id rots. */
const GEMINI_FLASH = "gemini-flash-latest";

const MAX_CODE_CONTEXT_CHARS = 50_000;
const REQUESTS_PER_MINUTE = 30;

/**
 * Backward-compatible gateway lookup used by existing server handlers.
 * New code should request a capability through credential-broker directly.
 */
export async function fetchApiGatewayKey(providerName: string): Promise<string | null> {
  return fetchGatewayCredential(providerName);
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;

  const limitKey = `autocomplete:user:${sessionUser.sub}`;
  if (isRateLimited(limitKey, REQUESTS_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: 'Too many autocomplete requests. Please wait a minute.' });
  }
  const durable = await isRateLimitedDurable(limitKey, REQUESTS_PER_MINUTE, 60);
  const durableGuard = applyDurableCostBearingGuard(limitKey, REQUESTS_PER_MINUTE, durable);
  if (durableGuard.limited) return res.status(429).json({ error: 'Too many autocomplete requests. Please wait a minute.' });

  try {
    const { prefix, suffix } = req.body || {};
    if (typeof prefix !== 'string' || typeof suffix !== 'string') {
      return res.status(400).json({ error: 'Prefix and suffix must be text.' });
    }
    if (prefix.length + suffix.length > MAX_CODE_CONTEXT_CHARS) {
      return res.status(413).json({ error: 'Autocomplete context is too large.' });
    }

    const apiKey = await resolveCapabilityCredential('model:gemini');
    if (!apiKey) return res.status(401).json({ error: "No API key available for Autocomplete." });

    const client = new GoogleGenAI({ apiKey });
    const prompt = `You are an elite autocomplete engine. The user is writing code. You must output ONLY the exact text that should be inserted between the prefix and suffix. No markdown formatting, no explanations, no backticks.
PREFIX:
${prefix}
SUFFIX:
${suffix}`;

    const response = await client.models.generateContent({
      /*
       * gemini-flash-latest, not a pinned version.
       *
       * This was pinned to Flash 1.5, a model Google no longer serves: the
       * production key's catalogue lists 53 Gemini models and that is not among
       * them, so every call from here has been a 404 dressed up as a generic
       * failure. The alias is the same one the rest of the codebase uses and
       * Google keeps it pointed at a current model, so it cannot rot the way a
       * pinned id does.
       */
      model: GEMINI_FLASH,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { abortSignal: AbortSignal.timeout(UNTUNED_GEMINI_CEILING_MS) },
    });

    return res.status(200).json({ completion: response.text });
  } catch (error: any) {
    console.error("Autocomplete API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate completion." });
  }
}
