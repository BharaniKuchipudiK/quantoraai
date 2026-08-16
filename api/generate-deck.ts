/*
 * Dedicated presentation generator (Roadmap: MS Office integration).
 *
 * The architectural fix for the deck pipeline: presentations are NOT generated
 * through the conversational chat stream (which emits prose/markdown/HTML and
 * has to be reverse-engineered). Here the model runs in strict JSON mode with a
 * response schema and produces ONLY a structured deck spec — content, not
 * design. The client renders that spec with the deterministic consulting
 * renderer. Content ⟂ design.
 *
 * This endpoint ALWAYS returns JSON (even on failure) so the client never tries
 * to JSON.parse a platform 500 page ("Unexpected token 'A', 'A server e'...").
 */
import { GoogleGenAI } from "@google/genai";
import { applyCors, isRateLimited } from './_lib/rate-limit.js';
import { requireActiveSession } from "./_lib/authz.js";
import { fetchApiGatewayKey } from "./autocomplete.js";

const REQUESTS_PER_MINUTE = 20;

// Strict response schema — the model physically cannot return prose or code.
const DECK_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          layout: { type: "string", enum: ["cover", "section", "bullets", "two-column", "stat", "chart", "quote", "close"] },
          title: { type: "string" },
          subtitle: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          columns: {
            type: "array",
            items: { type: "object", properties: { heading: { type: "string" }, bullets: { type: "array", items: { type: "string" } } } },
          },
          stats: {
            type: "array",
            items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" } } },
          },
          chart: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["bar", "line", "donut"] },
              caption: { type: "string" },
              data: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "number" } } } },
            },
          },
          quote: { type: "string" },
          attribution: { type: "string" },
        },
        required: ["layout", "title"],
      },
    },
  },
  required: ["title", "slides"],
};

const SYSTEM = `You are a senior management consultant (McKinsey/BCG/EY) building an executive slide deck. You output CONTENT ONLY as a structured deck — the rendering system owns all visual design. Never write HTML, CSS, markdown, or code.

Rules for a consulting-grade deck:
- 8–14 slides: a "cover" opener, "section" dividers between parts, content slides, and a "close" with recommended next steps.
- ACTION TITLES: every title states the insight ("Value concentrates in three sectors"), not a topic label ("Sectors").
- Pyramid/MECE structure. Quantify claims with specific, realistic figures.
- Use "stat" slides for headline metrics and "chart" slides (bar/line/donut) for trends and splits — always include a short Source caption on charts.
- 3–5 SHORT bullet phrases per content slide — never sentences or paragraphs. Vary layouts; do not put bullets on every slide.
- Use "two-column" for before/after or comparisons; "quote" for a memorable framing line.
Produce the complete deck for the user's topic now.`;

function validSpec(spec: any): boolean {
  return Boolean(spec && typeof spec.title === 'string' && Array.isArray(spec.slides) && spec.slides.length >= 3
    && spec.slides.every((s: any) => s && typeof s.layout === 'string' && typeof s.title === 'string'));
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    const auth = await requireActiveSession(req, res);
    if (!auth.ok) return; // requireActiveSession already responded
    const { sessionUser } = auth.value;

    if (isRateLimited(`deck:user:${sessionUser.sub}`, REQUESTS_PER_MINUTE, 60_000)) {
      return res.status(429).json({ ok: false, error: 'Too many requests — give it a moment.' });
    }

    const { prompt, userKey } = req.body || {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ ok: false, error: 'A topic prompt is required.' });
    }

    const apiKey = userKey || process.env.GEMINI_API_KEY || await fetchApiGatewayKey('GEMINI');
    if (!apiKey) return res.status(200).json({ ok: false, error: 'No model API key is configured.' });

    const ai = new GoogleGenAI({ apiKey });
    const contents = `${SYSTEM}\n\nTOPIC: ${prompt.trim()}`;

    // Two attempts: JSON mode makes prose impossible, but a model can still
    // occasionally emit a thin/invalid object. Retry once, then give up cleanly.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents,
          config: { temperature: attempt === 0 ? 0.6 : 0.4, responseMimeType: "application/json", responseSchema: DECK_SCHEMA as any },
        });
        const text = response.text || '';
        let spec: any = null;
        try { spec = JSON.parse(text); } catch { spec = null; }
        if (validSpec(spec)) {
          return res.status(200).json({ ok: true, spec });
        }
        console.error(`generate-deck: invalid spec on attempt ${attempt + 1}`, text.slice(0, 200));
      } catch (inner: any) {
        console.error(`generate-deck: model error on attempt ${attempt + 1}:`, inner?.message);
      }
    }
    // Never crash the client — return a clean, JSON failure it can act on.
    return res.status(200).json({ ok: false, error: 'The deck could not be generated cleanly. Please try again.' });
  } catch (err: any) {
    console.error("generate-deck fatal:", err?.message);
    return res.status(200).json({ ok: false, error: 'Deck generation failed. Please try again.' });
  }
}
