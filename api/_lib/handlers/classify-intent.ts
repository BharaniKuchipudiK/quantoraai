import { GoogleGenAI } from "@google/genai";
import { applyCors, isRateLimited } from '../rate-limit.js';
import { requireActiveSession } from "../authz.js";
import { fetchApiGatewayKey } from "../../autocomplete.js";
import { fetchWithTimeout } from "../fetch-timeout.js";

const REQUESTS_PER_MINUTE = 60;
const OFFICE_KINDS = new Set(['powerpoint', 'word', 'excel']);
const OFFICE_ACTIONS = new Set(['create', 'refine', 'discuss', 'none']);

const ROUTER_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['deterministic', 'subjective'] },
    office: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'refine', 'discuss', 'none'] },
        kind: { type: 'string', enum: ['powerpoint', 'word', 'excel', 'none'] },
        skipBriefing: { type: 'boolean' },
        confidence: { type: 'number' },
      },
      required: ['action', 'kind', 'skipBriefing', 'confidence'],
      additionalProperties: false,
    },
  },
  required: ['intent', 'office'],
  additionalProperties: false,
});

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

function routerPrompt(routingContext: any) {
  return `You are Quantora's semantic turn interpreter. Read the current request together with conversation and artifact state. Infer meaning from context; do not classify by matching magic words.\n\nReturn only the requested JSON object. Use office.kind="none" when no Office kind applies.\n\nOffice rules:\n- If a verified Office artifact is active and the user wants any change to that artifact, action=refine and inherit its kind even when the user does not repeat the file type.\n- If an active artifact exists but the user is only asking a question, requesting explanation, critique, or discussion without asking to change it, action=discuss.\n- For a new Office artifact request, action=create and infer its kind. Normally skipBriefing=false so Quantora can establish a useful brief. Set skipBriefing=true only when the user's meaning clearly says to build immediately without discovery/clarification.\n- Unrelated requests use action=none and kind=none.\n- A current correction overrides older context.\n- Never reinterpret a request to not create/edit something as create/refine.\n\nGeneral intent: deterministic means an execution/factual/utility task with a reasonably checkable outcome; subjective means open-ended creative/advisory conversation.\n\nCONTEXT:\n${JSON.stringify(routingContext)}`;
}

function parseJsonText(value: any) {
  let text = String(value || '').trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
  return JSON.parse(text || '{}');
}

async function callAnthropicRouter(prompt: string, apiKey: string) {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_ROUTER_MODEL || process.env.ANTHROPIC_OFFICE_MODEL || 'claude-sonnet-5',
      max_tokens: 700,
      system: 'Return the semantic routing decision as the requested JSON object.',
      messages: [{ role: 'user', content: prompt }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: ROUTER_OUTPUT_SCHEMA,
        },
      },
    }),
  }, 20_000);
  const raw = await response.text();
  const data = parseJsonText(raw);
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `Anthropic router HTTP ${response.status}`);
  const content = Array.isArray(data?.content)
    ? data.content.filter((block: any) => block?.type === 'text').map((block: any) => block.text).join('')
    : '';
  return parseJsonText(content);
}

async function callGeminiRouter(prompt: string, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.INTENT_ROUTER_MODEL || 'gemini-flash-latest',
    contents: prompt,
    config: {
      temperature: 0.05,
      responseMimeType: 'application/json',
      responseSchema: ROUTER_OUTPUT_SCHEMA,
    },
  });
  return parseJsonText(response.text);
}

async function callOpenRouterRouter(prompt: string, apiKey: string) {
  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_ROUTER_MODEL || process.env.OPENROUTER_OFFICE_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Return the semantic routing decision as the requested JSON object.' },
        { role: 'user', content: prompt },
      ],
      provider: { require_parameters: true },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'quantora_semantic_turn',
          strict: true,
          schema: ROUTER_OUTPUT_SCHEMA,
        },
      },
    }),
  }, 20_000);
  const raw = await response.text();
  const data = parseJsonText(raw);
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `OpenRouter router HTTP ${response.status}`);
  return parseJsonText(data?.choices?.[0]?.message?.content);
}

async function routeSemantically(prompt: string, keys: { anthropic?: string | null, gemini?: string | null, openRouter?: string | null }) {
  const providers = [
    ['anthropic', keys.anthropic],
    ['gemini', keys.gemini],
    ['openrouter', keys.openRouter],
  ].filter((entry) => Boolean(entry[1]));

  if (!providers.length) throw new Error('No semantic router provider is configured.');
  let lastError: any = null;
  for (const [provider, key] of providers) {
    try {
      if (provider === 'anthropic') return await callAnthropicRouter(prompt, String(key));
      if (provider === 'gemini') return await callGeminiRouter(prompt, String(key));
      return await callOpenRouterRouter(prompt, String(key));
    } catch (error: any) {
      lastError = error;
      console.warn(`Intent router provider '${provider}' failed:`, String(error?.message || error));
    }
  }
  throw lastError || new Error('All semantic router providers failed.');
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

    const geminiGatewayKey = process.env.GEMINI_API_KEY ? null : await fetchApiGatewayKey('GEMINI').catch(() => null);
    const keys = {
      anthropic: process.env.ANTHROPIC_API_KEY || null,
      gemini: process.env.GEMINI_API_KEY || geminiGatewayKey || null,
      openRouter: process.env.OPENROUTER_API_KEY || null,
    };

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

    const parsed = await routeSemantically(routerPrompt(routingContext), keys);
    const intent = parsed?.intent === 'deterministic' ? 'deterministic' : 'subjective';
    return res.status(200).json({
      intent,
      office: cleanOfficeDecision(parsed?.office),
    });
  } catch (err: any) {
    console.error('Intent classification failed across all providers:', err);
    return res.status(200).json({
      intent: 'subjective',
      office: { action: 'none', kind: null, skipBriefing: false, confidence: 0 },
      error: err?.message || 'Intent classification failed',
    });
  }
}
