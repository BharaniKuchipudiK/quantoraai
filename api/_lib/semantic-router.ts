/*
 * ONE SEMANTIC ROUTER, MANY DECISIONS (Phase 7).
 *
 * The Office turn interpreter carried its own copies of the three provider
 * callers — Anthropic, Gemini, OpenRouter — each asking for one fixed JSON
 * schema. The turn planner needs the same callers with a different schema.
 * This module holds them once: a prompt, a JSON schema and the configured keys
 * in; the first provider that answers, out; every provider tried in order and
 * the last error thrown when none does.
 */
import { GoogleGenAI } from "@google/genai";
import { fetchWithTimeout } from "./fetch-timeout.js";

export type RouterKeys = { anthropic?: string | null; gemini?: string | null; openRouter?: string | null };
export type RouteJsonOptions = { system: string; schemaName: string };

function parseJsonText(value: any) {
  let text = String(value || '').trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
  return JSON.parse(text || '{}');
}

async function callAnthropicRouter(prompt: string, apiKey: string, schema: object, options: RouteJsonOptions) {
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
      system: options.system,
      messages: [{ role: 'user', content: prompt }],
      output_config: {
        format: {
          type: 'json_schema',
          schema,
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

async function callGeminiRouter(prompt: string, apiKey: string, schema: object) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.INTENT_ROUTER_MODEL || 'gemini-flash-latest',
    contents: prompt,
    config: {
      temperature: 0.05,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  });
  return parseJsonText(response.text);
}

async function callOpenRouterRouter(prompt: string, apiKey: string, schema: object, options: RouteJsonOptions) {
  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_ROUTER_MODEL || process.env.OPENROUTER_OFFICE_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: prompt },
      ],
      provider: { require_parameters: true },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: options.schemaName,
          strict: true,
          schema,
        },
      },
    }),
  }, 20_000);
  const raw = await response.text();
  const data = parseJsonText(raw);
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `OpenRouter router HTTP ${response.status}`);
  return parseJsonText(data?.choices?.[0]?.message?.content);
}

export async function routeJson(prompt: string, schema: object, keys: RouterKeys, options: Partial<RouteJsonOptions> = {}) {
  const resolved: RouteJsonOptions = { system: options.system || 'Return the semantic routing decision as the requested JSON object.', schemaName: options.schemaName || 'quantora_semantic_turn' };
  const providers = [
    ['anthropic', keys.anthropic],
    ['gemini', keys.gemini],
    ['openrouter', keys.openRouter],
  ].filter((entry) => Boolean(entry[1]));

  if (!providers.length) throw new Error('No semantic router provider is configured.');
  let lastError: any = null;
  for (const [provider, key] of providers) {
    try {
      if (provider === 'anthropic') return await callAnthropicRouter(prompt, String(key), schema, resolved);
      if (provider === 'gemini') return await callGeminiRouter(prompt, String(key), schema);
      return await callOpenRouterRouter(prompt, String(key), schema, resolved);
    } catch (error: any) {
      lastError = error;
      console.warn(`Intent router provider '${provider}' failed:`, String(error?.message || error));
    }
  }
  throw lastError || new Error('All semantic router providers failed.');
}

