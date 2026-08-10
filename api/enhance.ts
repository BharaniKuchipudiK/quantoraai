import { GoogleGenAI } from "@google/genai";
import { applyCors, clientIp, isRateLimited } from "./_lib/rate-limit.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You are an expert product manager and software architect. Your job is to take a user's rough idea or vague prompt and rewrite it into a highly comprehensive, clear, and actionable specification for an AI to build.

Follow these rules:
1. Output ONLY the rewritten prompt. Do not include introductory or concluding conversational text (e.g. "Here is your enhanced prompt").
2. Make intelligent assumptions to fill in the blanks. If the user does not specify a platform (Web, iOS, Android), assume a Modern Web App with responsive design.
3. Include specific recommendations for UI/UX (e.g., clean interface, dark/light mode), core features, and data flow based on the context.
4. Keep the rewritten prompt professional, direct, and concise enough to fit in a text box, but detailed enough to guide a developer perfectly.`;

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
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid prompt in request body' });
    }

    if (!process.env.GEMINI_API_KEY) {
       return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { role: "user", parts: [{ text: prompt }] }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      }
    });

    let enhancedPrompt = response.text || "";
    // Clean up markdown formatting if the model wraps it in quotes or markdown block
    enhancedPrompt = enhancedPrompt.trim();
    if (enhancedPrompt.startsWith('"') && enhancedPrompt.endsWith('"')) {
      enhancedPrompt = enhancedPrompt.slice(1, -1);
    }

    return res.status(200).json({ enhancedPrompt });

  } catch (error: any) {
    console.error("Enhance API Error:", error);
    return res.status(500).json({ error: error.message || 'Failed to enhance prompt' });
  }
}
