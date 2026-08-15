import { GoogleGenAI } from "@google/genai";
import { applyCors, clientIp, isRateLimited, isRateLimitedDurable } from './_lib/rate-limit.js';
import { requireActiveSession } from "./_lib/authz.js";
import { fetchApiGatewayKey } from "./autocomplete.js";

const REQUESTS_PER_MINUTE = 60;

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;

  const limitKey = `classify:user:${sessionUser.sub}`;
  if (isRateLimited(limitKey, REQUESTS_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: 'Too many requests.' });
  }

  try {
    const { prompt } = req.body || {};
    if (typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt must be text.' });
    }
    
    // Check local or gateway API Key
    const apiKey = process.env.GEMINI_API_KEY || await fetchApiGatewayKey('GEMINI');
    if (!apiKey) return res.status(401).json({ error: "No API key available for Classification." });
    
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: `You are an Intent Router. Analyze the user's prompt and determine if they are asking a deterministic, utility question (e.g. "give me a checklist", "fix this error", "what is X?") or a subjective, creative question (e.g. "design a UI", "write a poem"). 
      Return ONLY a JSON object: {"intent": "deterministic" | "subjective"}. 
      Prompt: "${prompt}"`,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    });

    const outputText = response.text || '{"intent":"subjective"}';
    const parsed = JSON.parse(outputText);
    return res.status(200).json(parsed);

  } catch (err: any) {
    console.error("Intent classification failed:", err);
    // Fail open by defaulting to subjective
    return res.status(200).json({ intent: 'subjective', error: err.message });
  }
}
