import {
  dispatchToolCall,
  isToolCallPermitted,
  listRegisteredTools,
  type QuantoraToolContext,
  type QuantoraToolDispatch,
  type QuantoraToolState,
} from './tool-registry.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MAX_STEPS = 5;
const DEFAULT_MODEL_TIMEOUT_MS = 55_000;
const MAX_TOOL_RESULT_CHARS = 40_000;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type DispatchLike = (name: unknown, args: unknown, context: QuantoraToolContext) => Promise<QuantoraToolDispatch>;
type PermitLike = (name: unknown, context: QuantoraToolContext) => boolean;

export type OpenRouterToolAgentResult =
  | {
      status: 'completed';
      text: string;
      finishReason: string | null;
      modelId: string;
      steps: number;
      toolCalls: string[];
      responseBody: any;
    }
  | {
      status: 'paused';
      text: string;
      finishReason: string | null;
      modelId: string;
      steps: number;
      toolCalls: string[];
      toolResult: any;
      responseBody: any;
    };

export function enabledOpenRouterTools(context: QuantoraToolContext): any[] {
  return listRegisteredTools()
    .filter((tool) => tool.isEnabled(context))
    .map((tool) => ({
      type: 'function',
      function: {
        name: String(tool.declaration?.name || tool.name),
        description: String(tool.declaration?.description || ''),
        parameters: tool.declaration?.parameters || { type: 'object', properties: {} },
      },
    }));
}

function safeProviderMessage(value: unknown): string {
  return String(value ?? '')
    .replace(/sk-or-v1-[\w-]+/gi, 'sk-or-v1-[key]')
    .replace(/AIza[\w-]{20,}/g, 'AIza[key]')
    .slice(0, 500);
}

function parseToolArguments(value: unknown): { ok: true; args: Record<string, unknown> } | { ok: false; message: string } {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ok: true, args: value as Record<string, unknown> };
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: true, args: {} };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, message: 'Tool arguments must decode to a JSON object.' };
    }
    return { ok: true, args: parsed };
  } catch {
    return { ok: false, message: 'Tool arguments were not valid JSON.' };
  }
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part: any) => typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function boundedToolResult(value: unknown): string {
  let text = '';
  try {
    text = JSON.stringify(value ?? null);
  } catch {
    text = JSON.stringify({ ok: false, status: 'serialization_failed', error: 'Tool result could not be serialized.' });
  }
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…`;
}

async function openRouterTurn(input: {
  key: string;
  modelId: string;
  messages: any[];
  tools: any[];
  temperature: number;
  grounding?: boolean;
  timeoutMs: number;
  fetchImpl: FetchLike;
}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, input.timeoutMs));
  try {
    const response = await input.fetchImpl(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${input.key}`,
        'HTTP-Referer': process.env.APP_URL || 'https://quantoraai.app',
        'X-Title': 'Quantora AI',
        'X-OpenRouter-Metadata': 'enabled',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.modelId,
        messages: input.messages,
        temperature: input.temperature,
        stream: false,
        tools: input.tools,
        tool_choice: 'auto',
        ...(input.grounding ? { plugins: [{ id: 'web', max_results: 3 }] } : {}),
      }),
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      let detail = raw;
      try {
        const parsed = JSON.parse(raw);
        detail = parsed?.error?.message || parsed?.message || raw;
      } catch { /* plain upstream text */ }
      const error: any = new Error(`OpenRouter tool turn failed (${response.status})${detail ? `: ${safeProviderMessage(detail)}` : ''}`);
      error.status = response.status;
      error.gateway = 'openrouter';
      throw error;
    }
    return await response.json();
  } catch (error: any) {
    if (controller.signal.aborted) {
      const timeout: any = new Error(`OpenRouter tool turn timed out after ${input.timeoutMs}ms.`);
      timeout.status = 504;
      timeout.gateway = 'openrouter';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function runOpenRouterToolAgent(input: {
  key: string;
  modelId: string;
  messages: any[];
  temperature?: number;
  grounding?: boolean;
  toolContext: QuantoraToolContext;
  maxSteps?: number;
  modelDeadlineAt?: number | null;
  fetchImpl?: FetchLike;
  dispatch?: DispatchLike;
  permit?: PermitLike;
  onToolState?: (event: { tool: string; state: 'running' | 'completed' | QuantoraToolState; raw?: any }) => void;
  streamCommitted?: () => boolean;
}): Promise<OpenRouterToolAgentResult> {
  const fetchImpl = input.fetchImpl || (globalThis.fetch as FetchLike);
  const dispatch = input.dispatch || dispatchToolCall;
  const permit = input.permit || isToolCallPermitted;
  const tools = enabledOpenRouterTools(input.toolContext);
  if (!tools.length) throw new Error('OpenRouter tool agent was started without an enabled tool.');

  const messages = [...input.messages];
  const maxSteps = Math.max(1, Math.min(10, Math.floor(Number(input.maxSteps) || DEFAULT_MAX_STEPS)));
  const called: string[] = [];
  let lastBody: any = null;
  let lastFinishReason: string | null = null;

  for (let step = 1; step <= maxSteps; step += 1) {
    const remaining = typeof input.modelDeadlineAt === 'number'
      ? input.modelDeadlineAt - Date.now()
      : DEFAULT_MODEL_TIMEOUT_MS;
    if (remaining <= 0) {
      const error: any = new Error('OpenRouter tool agent exhausted the turn deadline before the next model step.');
      error.status = 504;
      error.gateway = 'openrouter';
      throw error;
    }

    const body = await openRouterTurn({
      key: input.key,
      modelId: input.modelId,
      messages,
      tools,
      temperature: Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 0.2,
      grounding: input.grounding,
      timeoutMs: Math.min(DEFAULT_MODEL_TIMEOUT_MS, remaining),
      fetchImpl,
    });
    lastBody = body;
    const choice = body?.choices?.[0] || {};
    const message = choice?.message || {};
    lastFinishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : lastFinishReason;
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

    if (!toolCalls.length) {
      const text = messageText(message?.content);
      if (!text) {
        const error: any = new Error('OpenRouter tool agent returned neither a tool call nor a final response.');
        error.status = 502;
        error.gateway = 'openrouter';
        throw error;
      }
      return {
        status: 'completed', text, finishReason: lastFinishReason,
        modelId: input.modelId, steps: step, toolCalls: called, responseBody: body,
      };
    }

    // OpenAI/OpenRouter requires the assistant tool-call message to be replayed
    // before the matching role=tool results. Preserve provider-owned ids exactly.
    messages.push({
      role: 'assistant',
      content: message?.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const toolName = String(call?.function?.name || '').trim();
      const toolCallId = String(call?.id || '').trim();
      if (!toolName || !toolCallId) {
        throw Object.assign(new Error('OpenRouter returned a malformed function call without a name or id.'), { status: 502, gateway: 'openrouter' });
      }
      if (!permit(toolName, input.toolContext)) {
        throw Object.assign(new Error(`Blocked unexpected tool call this turn: ${toolName}`), { status: 400, gateway: 'openrouter' });
      }

      const parsed = parseToolArguments(call?.function?.arguments);
      let raw: any;
      let state: QuantoraToolState = 'unavailable';
      if (!parsed.ok) {
        raw = { ok: false, status: 'invalid_arguments', error: parsed.message, note: 'No tool executed. Correct the arguments and try the tool again.' };
      } else {
        input.onToolState?.({ tool: toolName, state: 'running' });
        const result = await dispatch(toolName, parsed.args, input.toolContext);
        if (result.status !== 'ok') {
          throw Object.assign(new Error(`Blocked unexpected tool call this turn: ${toolName}`), { status: 400, gateway: 'openrouter' });
        }
        raw = result.invocation.raw;
        state = result.invocation.classify({ committed: input.streamCommitted?.() === true });
        input.onToolState?.({ tool: toolName, state, raw });
      }
      called.push(toolName);
      messages.push({ role: 'tool', tool_call_id: toolCallId, content: boundedToolResult(raw) });
      input.onToolState?.({ tool: toolName, state: 'completed', raw });

      if (raw?.action === 'PAUSE_AND_ASK') {
        return {
          status: 'paused',
          text: String(raw?.message || 'More information is required before continuing.'),
          finishReason: lastFinishReason,
          modelId: input.modelId,
          steps: step,
          toolCalls: called,
          toolResult: raw,
          responseBody: body,
        };
      }
    }
  }

  const error: any = new Error(`Agent execution exceeded the ${maxSteps}-step safety limit.`);
  error.status = 508;
  error.gateway = 'openrouter';
  error.finishReason = lastFinishReason;
  error.responseBody = lastBody;
  throw error;
}
