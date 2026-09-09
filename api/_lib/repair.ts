import { GoogleGenAI } from "@google/genai";
import { listGeminiModelIds, withNewestGeminiFlash, UserFacingError } from "./gemini-flash.js";
import { formatJobCardForRepair } from "../../src/lib/studio-job-card.js";
import { formatAttemptMemory } from "../../shared/refinement-loop.js";
import { fetchWithTimeout } from "./fetch-timeout.js";
import { tokenizeDataUris, restoreDataUris } from "./model-payload.js";

/*
 * Self-heal core for the live preview's verification loop.
 *
 * Lives in _lib (a shared module, NOT a serverless function) so it adds zero to
 * the platform's function count — it is invoked from the existing /api/chat
 * handler via a `task: "repair"` branch. Given a generated artifact and the
 * runtime error it produced, a model returns the corrected artifact and nothing
 * else, so the preview can swap it in and re-run.
 */

export const MAX_REPAIR_CODE_LENGTH = 200_000;

// Stable, broadly-available coding model. Overridable per call.
const DEFAULT_REPAIR_MODEL = "deepseek/deepseek-chat";

export function buildRepairPrompt(code: string, error: string, framework: string, job?: unknown, attempts?: unknown) {
  const kind = framework === "react" ? "React component (a single /App.js module)" : "self-contained HTML document";
  const jobBlock = formatJobCardForRepair(job);
  const system =
    `You are a precise code-repair engine. You are given a ${kind} that failed at runtime and the error it produced. ` +
    `Return the COMPLETE corrected ${framework === "react" ? "module" : "document"} and NOTHING else — no explanation, no commentary, no markdown code fences. ` +
    `Preserve the original design, content and intent EXACTLY; change only the single thing that causes the error. ` +
    `Do NOT simplify, restyle, or "clean up" the code. Keep every <style> block, inline style, CSS class, layout, color, font and image byte-for-byte unless it is the direct cause of the error. ` +
    `The corrected output must be at least as long as the input. ` +
    (jobBlock ? `Honor the JOB below. Never turn this into a different product. If the JOB requires real product photos and the page uses SVG or empty frames, replace those frames with https://images.unsplash.com/ <img> photos. That is the fix. ` : "") +
    (framework === "react"
      ? `The module must default-export a React component and must not import anything that is not available.`
      : `The document must remain fully self-contained: all CSS and JS inline, no external build step, no bare module imports.`);
  /*
   * What earlier rounds already tried. Without it every round re-reads the
   * same page and the same complaint, so the model proposes the same fix and
   * the user pays again for the same result — which is why repeated repair
   * used to be worse than a single attempt.
   */
  const memoryBlock = formatAttemptMemory(Array.isArray(attempts) ? attempts : []);
  const user = `${jobBlock ? `${jobBlock}\n\n` : ""}${memoryBlock ? `${memoryBlock}\n\n` : ""}RUNTIME ERROR:\n${error}\n\nCURRENT CODE:\n${code}`;
  return { system, user };
}

// Strip accidental markdown fences the model may wrap the answer in.
function stripFences(text: string): string {
  const trimmed = (text || "").trim();
  const fenced = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1].trim();
  return trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
}

async function repairWithOpenRouter(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const resp = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.APP_URL || "https://quantoraai.app",
      "X-Title": "Quantora AI",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      stream: false,
    }),
    /*
     * 12s killed every real repair: regenerating a full 30KB+ document is a
     * long non-streaming completion, so the Apply step of the artifact loop
     * died as "DOMException [TimeoutError]" 12 times in 2 hours on 2026-09-01
     * while the chat claimed fixes were applied. /api/chat's own budget is
     * 165s; 90s here leaves room for the verify round-trip after it.
     */
  }, 90_000);

  if (!resp.ok) {
    const errText = await resp.text();
    let detail = "";
    try { detail = JSON.parse(errText)?.error?.message || ""; } catch { detail = errText?.slice(0, 200) || ""; }
    throw new UserFacingError(`Repair model request failed (${resp.status})${detail ? `: ${detail}` : ""}`);
  }
  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new UserFacingError("Repair model returned an empty response.");
  return stripFences(content);
}

async function repairWithGemini(apiKey: string, system: string, user: string): Promise<string> {
  const client = new GoogleGenAI({ apiKey });
  let models: string[] = [];
  try {
    models = await listGeminiModelIds(client);
  } catch (err: any) {
    // Never embed err.message: the Gemini SDK's message is the raw JSON
    // response body, and this string reaches the client via the route catch.
    console.warn("Gemini model listing failed for repair:", err?.message || err);
    throw new UserFacingError("The Gemini key was rejected while listing models.");
  }
  // A listed id can be retired for serving (see gemini-flash.ts); advance
  // past retired candidates instead of failing on the first.
  const res = await withNewestGeminiFlash(models, (model) => client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: user }] }],
    config: {
      systemInstruction: system,
      temperature: 0.1,
      // The same 90s this file already gives its OpenRouter repair call.
      abortSignal: AbortSignal.timeout(90_000),
    },
  }));
  const text = (res as any)?.text;
  if (!text) throw new UserFacingError("Gemini returned an empty response.");
  return stripFences(text);
}

export async function repairArtifact(opts: {
  code: string;
  error: string;
  framework?: string;
  job?: unknown;
  openRouterKey?: string;
  geminiKey?: string;
  model?: string;
  /** Verification results so far, oldest first — see shared/refinement-loop.js */
  attempts?: Array<{ score?: number; passed?: boolean; issues?: string[] }>;
}): Promise<{ code: string; unchanged: boolean }> {
  const { code, error, job, openRouterKey, geminiKey, model } = opts;
  const framework = opts.framework === "react" ? "react" : "html";

  if (!code || typeof code !== "string" || !code.trim()) {
    throw new UserFacingError("No code provided to repair.");
  }
  if (code.length > MAX_REPAIR_CODE_LENGTH) {
    throw new UserFacingError("Code is too large to auto-repair.");
  }
  if (!openRouterKey && !geminiKey) {
    throw new UserFacingError("No API key available for auto-repair.");
  }

  const errText = typeof error === "string" && error.trim() ? error.trim().slice(0, 4000) : "Unknown runtime error.";

  // Replace embedded base64 images/fonts with short tokens before sending: they
  // can dominate the payload (cost + latency) yet never help diagnose a runtime
  // error, and the model is told to preserve images — a token is far easier to
  // return intact than a 100KB blob. We restore the originals from the result.
  const { tokenized, assets } = tokenizeDataUris(code);
  const { system, user } = buildRepairPrompt(tokenized, errText, framework, job, opts.attempts);

  const fixed = openRouterKey
    ? await repairWithOpenRouter(openRouterKey, model || DEFAULT_REPAIR_MODEL, system, user)
    : await repairWithGemini(geminiKey as string, system, user);

  if (!fixed || !fixed.trim()) throw new UserFacingError("The repair model returned nothing usable.");

  const restored = restoreDataUris(fixed, assets);
  return { code: restored, unchanged: restored.trim() === code.trim() };
}
