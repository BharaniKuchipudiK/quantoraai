import { GoogleGenAI } from "@google/genai";
import { applyCors, clientIp, isRateLimited, isRateLimitedDurable } from './_lib/rate-limit.js';
import { requireActiveSession } from "./_lib/authz.js";
import { fetchGatewayCredential, resolveCapabilityCredential } from './_lib/credential-broker.js';

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
  if (durable.limited) return res.status(429).json({ error: 'Too many autocomplete requests. Please wait a minute.' });

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
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });

    return res.status(200).json({ completion: response.text });
  } catch (error: any) {
    console.error("Autocomplete API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate completion." });
  }
}
