import { GoogleGenAI } from "@google/genai";
import { applyCors, isRateLimited, isRateLimitedDurable } from "./_lib/rate-limit.js";
import { fetchApiGatewayKey } from "./autocomplete.js";
import { requireActiveSession } from "./_lib/authz.js";
import { buildPromptEnhancementInput, resolvePromptEnhancerModel } from "./_lib/prompt-enhancement.js";

const MAX_PROMPT_CHARS = 20_000;

const SYSTEM_INSTRUCTION = `You are Quantora's Prompt Engineer. Improve ONLY the user's current draft so another AI produces a better result. Give it a slight professional edge without inflating the user's request.

Choose exactly one depth:
- "Polish": DEFAULT for normal questions, writing, research, analysis, follow-ups, corrections, and already-clear requests. Fix wording and intent, preserve scope, and add at most one or two genuinely useful specifics. Usually one or two sentences.
- "Enrich": use when the user's objective is clear but a few missing details would materially improve the result. Keep it compact; do not turn it into a requirements document.
- "Blueprint": ONLY when the user explicitly wants to build or design a website, app, software product, workflow, or similarly complex artifact and the draft is materially under-specified. Add useful product intent, primary users, core features/flows, UX direction, and suitable platform/technology choices when they help execution. Do not invent integrations, business rules, data sources, or features that the user did not imply.

Continuation rules:
- Recent conversation and Project/Session context are provided only to resolve references such as “it”, “this”, “same”, “cleaner”, or “continue”.
- Rewrite the CURRENT USER DRAFT, not the conversation history.
- Preserve decisions and constraints already established in context; do not restart or re-scope the work.

General rules:
- Preserve the user's intent, objective, scope, voice, and language.
- When unsure, do less.
- Do not add ceremonial phrases, generic best practices, or unnecessary headings.
- Do not ask clarifying questions. Make only low-risk assumptions that are necessary to make the prompt usable.
- A depth hint of "lighter" means one step less; "deeper" means one step more, but never beyond the user's actual scope.
- Output STRICT JSON only: {"tier":"Polish"|"Enrich"|"Blueprint","prompt":"the improved current prompt"}.`;

function parseEnhancement(raw: string): { tier: string; prompt: string } {
  const text = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const obj = JSON.parse(text.slice(start, end + 1));
      const tier = ["Polish", "Enrich", "Blueprint"].includes(obj.tier) ? obj.tier : "Polish";
      if (obj.prompt && typeof obj.prompt === "string") return { tier, prompt: obj.prompt.trim() };
    }
  } catch { /* fall through */ }
  let prompt = text;
  if (prompt.startsWith('"') && prompt.endsWith('"')) prompt = prompt.slice(1, -1);
  return { tier: "Polish", prompt };
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;
  const limitKey = `enhance:user:${sessionUser.sub}`;
  if (isRateLimited(limitKey, 30, 60_000)) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  const durable = await isRateLimitedDurable(limitKey, 30, 60);
  if (durable.limited) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });

  try {
    const { prompt, depth = 'auto', history = [], sessionContext = null } = req.body || {};
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Missing or invalid prompt in request body' });
    if (prompt.length > MAX_PROMPT_CHARS) return res.status(413).json({ error: 'Prompt is too long to enhance.' });

    const apiKey = await fetchApiGatewayKey('GEMINI') || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server or Supabase API Gateway.' });

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: resolvePromptEnhancerModel(),
      contents: [{ role: "user", parts: [{ text: buildPromptEnhancementInput({ prompt, depth, history, sessionContext }) }] }],
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.25 },
    });

    const { tier, prompt: enhancedPrompt } = parseEnhancement(response.text || "");
    return res.status(200).json({ enhancedPrompt, tier });
  } catch (error: any) {
    console.error("Enhance API Error:", error);
    return res.status(500).json({ error: error.message || 'Failed to enhance prompt' });
  }
}
