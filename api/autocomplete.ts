import { GoogleGenAI } from "@google/genai";
import { applyCors, clientIp, isRateLimited, isRateLimitedDurable } from './_lib/rate-limit.js';
import { getSessionUser } from './_lib/session.js';

const MAX_CODE_CONTEXT_CHARS = 50_000;
const REQUESTS_PER_MINUTE = 30;

export async function fetchApiGatewayKey(providerName: string): Promise<string | null> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) return null;
    
    const res = await fetch(`${supabaseUrl}/rest/v1/api_gateway_keys?provider=eq.${providerName}&select=api_key`, {
       headers: {
         'apikey': supabaseKey,
         'Authorization': `Bearer ${supabaseKey}`
       }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) return data[0].api_key;
    return null;
  } catch(e) {
    console.error("Failed to fetch API key from Supabase Gateway:", e);
    return null;
  }
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Sign in to use autocomplete.' });

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
    
    const apiKey = process.env.GEMINI_API_KEY || await fetchApiGatewayKey('GEMINI');
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
