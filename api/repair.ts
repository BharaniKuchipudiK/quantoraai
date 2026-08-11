import { GoogleGenAI } from "@google/genai";
import { applyCors, clientIp, isRateLimited } from "./_lib/rate-limit.js";
import { getSessionUser } from "./_lib/session.js";
import { fetchApiGatewayKey } from "./autocomplete.js";

/*
 * Self-heal endpoint for the live preview's verification loop.
 *
 * The preview renders a generated, self-contained HTML document in a sandboxed
 * iframe. When that document throws at runtime, the client sends the code and
 * the captured error here; we ask a model to return the corrected document and
 * nothing else, so the preview can swap it in and re-run. This is the
 * "verification" rung: the system reads its own failure and fixes it instead of
 * handing the user a broken artifact.
 */

const MAX_CODE_LENGTH = 200_000;
const RATE_LIMIT_PER_MINUTE = 20;

// Stable, broadly-available coding model. Overridable per request.
const DEFAULT_REPAIR_MODEL = "deepseek/deepseek-chat";

function buildRepairPrompt(code: string, error: string, framework: string) {
  const kind = framework === "react" ? "React component (a single /App.js module)" : "self-contained HTML document";
  const system =
    `You are a precise code-repair engine. You are given a ${kind} that failed at runtime and the error it produced. ` +
    `Return the COMPLETE corrected ${framework === "react" ? "module" : "document"} and NOTHING else — no explanation, no commentary, no markdown code fences. ` +
    `Preserve the original design, content and intent; change only what is necessary to fix the error. ` +
    (framework === "react"
      ? `The module must default-export a React component and must not import anything that is not available.`
      : `The document must remain fully self-contained: all CSS and JS inline, no external build step, no bare module imports.`);
  const user = `RUNTIME ERROR:\n${error}\n\nCURRENT CODE:\n${code}`;
  return { system, user };
}

// Strip accidental markdown fences the model may wrap the answer in.
function stripFences(text: string): string {
  const trimmed = (text || "").trim();
  const fence = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fence) return fence[1].trim();
  // Handle a leading fence without a matching trailing one.
  return trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
}

async function repairWithOpenRouter(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
  });

  if (!resp.ok) {
    const errText = await resp.text();
    let detail = "";
    try { detail = JSON.parse(errText)?.error?.message || ""; } catch { detail = errText?.slice(0, 200) || ""; }
    throw new Error(`Repair model request failed (${resp.status})${detail ? `: ${detail}` : ""}`);
  }
  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("Repair model returned an empty response.");
  return stripFences(content);
}

async function repairWithGemini(apiKey: string, system: string, user: string): Promise<string> {
  const client = new GoogleGenAI({ apiKey });
  // Discover an available flash model rather than hardcoding a version.
  let models: string[] = [];
  try {
    const list = await client.models.list();
    for await (const m of list) if (m?.name) models.push(m.name.replace(/^models\//, ""));
  } catch (err: any) {
    throw new Error(`Gemini key rejected: ${err?.message || err}`);
  }
  const flash = models.filter((m) => m.includes("gemini") && m.includes("flash"));
  const pick = (flash[0] || models[0]);
  if (!pick) throw new Error("No Gemini model available for this key.");
  const res = await client.models.generateContent({
    model: pick,
    contents: [{ role: "user", parts: [{ text: user }] }],
    config: { systemInstruction: system, temperature: 0.1 },
  });
  const text = (res as any)?.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return stripFences(text);
}

export default async function handler(req: any, res: any) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const sessionUser = getSessionUser(req);
  const limitKey = sessionUser ? `repair:user:${sessionUser.sub}` : `repair:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, RATE_LIMIT_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: "Too many repair attempts. Please wait a moment." });
  }

  try {
    const { code, error, framework, openRouterKey, userKey, repairModel } = req.body || {};

    if (!code || typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ error: "No code provided to repair." });
    }
    if (code.length > MAX_CODE_LENGTH) {
      return res.status(400).json({ error: "Code is too large to auto-repair." });
    }
    const errText = typeof error === "string" && error.trim() ? error.trim().slice(0, 4000) : "Unknown runtime error.";
    const fw = framework === "react" ? "react" : "html";

    // Same key policy as /api/chat: server keys are for signed-in users only;
    // bring-your-own keys work for anyone and cost the deployment nothing.
    const mayUseServerKeys = Boolean(sessionUser);
    const effectiveOpenRouterKey =
      openRouterKey || (mayUseServerKeys ? process.env.OPENROUTER_API_KEY || (await fetchApiGatewayKey("OPENROUTER")) : undefined);
    const effectiveGeminiKey =
      userKey || (mayUseServerKeys ? process.env.GEMINI_API_KEY || (await fetchApiGatewayKey("GEMINI")) : undefined);

    if (!effectiveOpenRouterKey && !effectiveGeminiKey) {
      return res.status(401).json({
        error: "Sign in or add an API key to enable auto-repair.",
        requiresAuth: true,
      });
    }

    const { system, user } = buildRepairPrompt(code, errText, fw);

    let fixed = "";
    if (effectiveOpenRouterKey) {
      fixed = await repairWithOpenRouter(effectiveOpenRouterKey, repairModel || DEFAULT_REPAIR_MODEL, system, user);
    } else {
      fixed = await repairWithGemini(effectiveGeminiKey as string, system, user);
    }

    if (!fixed || !fixed.trim()) {
      return res.status(502).json({ error: "The repair model returned nothing usable." });
    }
    // If the model handed back an identical document, tell the client so it can
    // stop looping instead of re-rendering the same failing code.
    const unchanged = fixed.trim() === code.trim();

    return res.status(200).json({ code: fixed, unchanged });
  } catch (err: any) {
    console.error("Error in /api/repair:", err);
    return res.status(500).json({ error: err?.message || "Auto-repair failed." });
  }
}
