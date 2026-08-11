import { GoogleGenAI } from "@google/genai";
import { applyCors, clientIp, isRateLimited } from "./_lib/rate-limit.js";
import { fetchApiGatewayKey } from "./autocomplete.js";

const SYSTEM_INSTRUCTION = `You are Quantora's Prompt Engineer. Improve the user's prompt so an AI produces a better result — WITHOUT inflating it. Match your effort to the prompt; a simple ask must stay simple.

Pick exactly ONE tier and apply only that much:
- "Polish": the prompt is already clear, or is a small/simple ask. Fix wording, tighten it, add at most one or two concrete specifics. Keep it to a sentence or two. Never expand a simple prompt into a spec.
- "Enrich": the prompt is a bit vague but still simple. Add the few details that materially help (audience, key features, style, platform) in a short paragraph — no headings, no requirement lists.
- "Blueprint": ONLY for a genuinely complex, under-specified build. Produce a fuller, structured brief.

Rules:
- Preserve the user's intent, scope, voice and language. Never turn what they asked for into something bigger than they wanted.
- Add only what materially improves the outcome. When unsure, do less.
- Do NOT ask clarifying questions and do NOT add a "Clarifying Questions" section. Make one sensible assumption and keep going.
- If a depth hint is provided: "lighter" = go one tier shallower (do less); "deeper" = go one tier richer (do more).
- Output STRICT JSON and nothing else — no markdown, no code fences: {"tier":"Polish"|"Enrich"|"Blueprint","prompt":"the improved prompt"}.`;

// Pull the {tier, prompt} object out of the model's reply, tolerating stray
// prose or code fences. Falls back to treating the whole reply as the prompt.
function parseEnhancement(raw: string): { tier: string; prompt: string } {
  const text = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const obj = JSON.parse(text.slice(start, end + 1));
      const tier = ["Polish", "Enrich", "Blueprint"].includes(obj.tier) ? obj.tier : "Enrich";
      if (obj.prompt && typeof obj.prompt === "string") return { tier, prompt: obj.prompt.trim() };
    }
  } catch { /* fall through */ }
  let prompt = text;
  if (prompt.startsWith('"') && prompt.endsWith('"')) prompt = prompt.slice(1, -1);
  return { tier: "Enrich", prompt };
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: 30 requests per minute per IP
  if (isRateLimited(`enhance:${clientIp(req)}`, 30, 60_000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }

  try {
    const { prompt, depth } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid prompt in request body' });
    }

    const apiKey = await fetchApiGatewayKey('GEMINI') || process.env.GEMINI_API_KEY;

    if (!apiKey) {
       return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server or Supabase API Gateway.' });
    }

    const depthHint = depth === 'lighter' || depth === 'deeper'
      ? `\n\n[Depth hint: ${depth} — ${depth === 'lighter' ? 'do less than you normally would' : 'do a bit more than you normally would'}.]`
      : '';

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { role: "user", parts: [{ text: prompt + depthHint }] }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.5,
      }
    });

    const { tier, prompt: enhancedPrompt } = parseEnhancement(response.text || "");
    return res.status(200).json({ enhancedPrompt, tier });

  } catch (error: any) {
    console.error("Enhance API Error:", error);
    return res.status(500).json({ error: error.message || 'Failed to enhance prompt' });
  }
}
