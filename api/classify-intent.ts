import { GoogleGenAI } from "@google/genai";
import { applyCors, isRateLimited } from './_lib/rate-limit.js';
import { requireActiveSession } from "./_lib/authz.js";
import { fetchApiGatewayKey } from "./autocomplete.js";

const REQUESTS_PER_MINUTE = 60;
const OFFICE_KINDS = new Set(['powerpoint', 'word', 'excel']);
const OFFICE_ACTIONS = new Set(['create', 'refine', 'discuss', 'none']);

function cleanOfficeDecision(value: any) {
  const action = OFFICE_ACTIONS.has(String(value?.action || '')) ? String(value.action) : 'none';
  const kind = OFFICE_KINDS.has(String(value?.kind || '')) ? String(value.kind) : null;
  const confidenceRaw = Number(value?.confidence);
  return {
    action,
    kind,
    skipBriefing: value?.skipBriefing === true,
    confidence: Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0,
  };
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;

  const limitKey = `classify:user:${sessionUser.sub}`;
  if (isRateLimited(limitKey, REQUESTS_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: 'Too many requests.' });
  }

  try {
    const {
      prompt,
      history = [],
      activeOfficeArtifact = null,
      activeOfficeBriefing = null,
      requestedOfficeKind = null,
    } = req.body || {};
    if (typeof prompt !== 'string') return res.status(400).json({ error: 'Prompt must be text.' });

    const apiKey = process.env.GEMINI_API_KEY || await fetchApiGatewayKey('GEMINI');
    if (!apiKey) return res.status(401).json({ error: 'No API key available for Classification.' });

    const recentHistory = (Array.isArray(history) ? history : []).slice(-10).map((message: any) => ({
      role: message?.sender === 'user' ? 'user' : 'assistant',
      text: String(message?.text || '').slice(0, 1800),
    }));

    const routingContext = {
      currentRequest: prompt,
      recentHistory,
      activeOfficeArtifact: activeOfficeArtifact && typeof activeOfficeArtifact === 'object'
        ? {
          kind: activeOfficeArtifact.kind || null,
          fileName: String(activeOfficeArtifact.fileName || '').slice(0, 240),
          title: String(activeOfficeArtifact.title || '').slice(0, 300),
          previewFingerprint: String(activeOfficeArtifact.previewFingerprint || '').slice(0, 80),
        }
        : null,
      activeOfficeBriefing: activeOfficeBriefing && typeof activeOfficeBriefing === 'object'
        ? { kind: activeOfficeBriefing.kind || null }
        : null,
      requestedOfficeKind: OFFICE_KINDS.has(String(requestedOfficeKind || '')) ? requestedOfficeKind : null,
    };

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.INTENT_ROUTER_MODEL || 'gemini-flash-latest',
      contents: `You are Quantora's semantic turn interpreter. Read the current request together with conversation and artifact state. Do not classify by matching magic words; infer the user's actual goal in context.\n\nReturn ONLY JSON with this shape:\n{"intent":"deterministic"|"subjective","office":{"action":"create"|"refine"|"discuss"|"none","kind":"powerpoint"|"word"|"excel"|null,"skipBriefing":boolean,"confidence":number}}\n\nOffice rules:\n- If a verified Office artifact is active and the user wants any change to that artifact (rewrite, correct, shorten, expand, restyle, reorder, update a slide/section/sheet, or otherwise modify it), action=refine and inherit its kind even when the user does not repeat the file type.\n- If an active artifact exists but the user is only asking a question, requesting explanation, critique, or discussion without asking to change it, action=discuss.\n- For a new Office artifact request, action=create and infer its kind. Normally skipBriefing=false so Quantora can establish a useful brief. Set skipBriefing=true only when the user's meaning clearly says to build immediately without discovery/clarification.\n- Unrelated requests use action=none.\n- A current correction overrides older context.\n- Never reinterpret a request to not create/edit something as create/refine.\n\nGeneral intent: deterministic means an execution/factual/utility task with a reasonably checkable outcome; subjective means open-ended creative/advisory conversation.\n\nCONTEXT:\n${JSON.stringify(routingContext)}`,
      config: {
        temperature: 0.05,
        responseMimeType: 'application/json',
      },
    });

    const outputText = String(response.text || '').trim();
    const parsed = JSON.parse(outputText || '{}');
    const intent = parsed?.intent === 'deterministic' ? 'deterministic' : 'subjective';
    return res.status(200).json({
      intent,
      office: cleanOfficeDecision(parsed?.office),
    });
  } catch (err: any) {
    console.error('Intent classification failed:', err);
    return res.status(200).json({
      intent: 'subjective',
      office: { action: 'none', kind: null, skipBriefing: false, confidence: 0 },
      error: err?.message || 'Intent classification failed',
    });
  }
}
