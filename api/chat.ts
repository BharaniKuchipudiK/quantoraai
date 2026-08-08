import { GoogleGenAI } from "@google/genai";

function buildGeminiContents(history: any[], currentMessage: string) {
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  if (Array.isArray(history)) {
    for (const msg of history) {
      if (!msg || !msg.text || typeof msg.text !== "string" || !msg.text.trim()) continue;

      const role: "user" | "model" =
        msg.sender === "ai" || msg.role === "model" || msg.role === "assistant" ? "model" : "user";

      if (contents.length === 0) {
        if (role === "user") {
          contents.push({ role: "user", parts: [{ text: msg.text }] });
        }
      } else {
        const lastIndex = contents.length - 1;
        if (contents[lastIndex].role === role) {
          contents[lastIndex].parts[0].text += `\n\n${msg.text}`;
        } else {
          contents.push({ role, parts: [{ text: msg.text }] });
        }
      }
    }
  }

  if (contents.length > 0 && contents[contents.length - 1].role === "user") {
    contents[contents.length - 1].parts[0].text += `\n\n${currentMessage}`;
  } else {
    contents.push({ role: "user", parts: [{ text: currentMessage }] });
  }

  return contents;
}

async function generateGeminiContent(apiKey: string, contents: any[], systemInstruction: string) {
  const client = new GoogleGenAI({ apiKey });
  const fallbackModels = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-flash-latest",
    "gemma-4-26b-a4b-it",
    "gemma-4-31b-it"
  ];

  let lastError: any = null;
  for (const m of fallbackModels) {
    try {
      const response = await client.models.generateContent({
        model: m,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        },
      });
      if (response && response.text) {
        return { text: response.text, usedModel: m };
      }
    } catch (err: any) {
      console.warn(`Gemini model ${m} failed:`, err.message || err);
      lastError = err;
    }
  }
  throw lastError || new Error("All Gemini fallback models failed.");
}


// Background telemetry logging to Supabase
function logTelemetry(modelId: string, latencyMs: number, textLength: number, provider: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  
  // Estimate tokens (roughly 4 chars per token)
  const tokens = Math.ceil(textLength / 4);
  
  fetch(`${supabaseUrl}/rest/v1/telemetry`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      model_id: modelId,
      latency_ms: latencyMs,
      tokens_generated: tokens,
      provider: provider
    })
  }).catch(err => console.error("Telemetry error:", err));
}

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    const { message, modelId, modelName, history, userKey, openRouterKey } = req.body || {};

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message string is required" });
    }

    const effectiveOpenRouterKey = openRouterKey || process.env.OPENROUTER_API_KEY;
    const effectiveGeminiKey = userKey || process.env.GEMINI_API_KEY;

    // 1. If OpenRouter Key is available and non-Gemini model requested
    if (modelId && !modelId.startsWith("gemini") && effectiveOpenRouterKey) {
      try {
        const formattedHistory = (history || []).map((m: any) => ({
          role: m.role === "model" || m.role === "assistant" || m.sender === "ai" ? "assistant" : "user",
          content: m.text || m.content || "",
        }));
        formattedHistory.push({ role: "user", content: message });

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${effectiveOpenRouterKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId,
            messages: formattedHistory,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const reply = data.choices?.[0]?.message?.content;
          if (reply) {
            const latencyMs = Date.now() - startTime;
            logTelemetry(modelId, latencyMs, reply.length, "OpenRouter");
            return res.status(200).json({
              text: reply,
              provider: `OpenRouter (${modelName || modelId})`,
              latencyMs,
              modelId: modelId,
              liveConnected: true
            });
          }
        }
      } catch (orErr) {
        console.warn("OpenRouter request failed:", orErr);
      }
    }

    // 2. Gemini fallback
    if (effectiveGeminiKey) {
      try {
        const contents = buildGeminiContents(history, message);
        const isCustomModel = modelId && !modelId.startsWith("gemini");
        const systemInstruction = isCustomModel
          ? `You are Quantora AI, an advanced AI Engine powering Quantora.app. You are currently functioning as "${modelName || modelId}". Respond accurately, intelligently, and comprehensively in Markdown formatted text, preserving the expertise and personality of ${modelName || modelId}.`
          : `You are Quantora AI, an advanced AI Assistant powering Quantora.app. You are currently functioning as "${modelName || "Gemini 3.6 Flash"}". Provide intelligent, highly accurate, and comprehensive responses formatted in clean Markdown.`;

        const result = await generateGeminiContent(effectiveGeminiKey, contents, systemInstruction);
        const latencyMs = Date.now() - startTime;
        logTelemetry(result.usedModel, latencyMs, result.text.length, "Gemini");

        return res.status(200).json({
          text: result.text,
          provider: isCustomModel ? `Quantora AI Engine (${modelName || modelId})` : `Google Gemini (${modelName || "Gemini 3.6 Flash"})`,
          latencyMs,
          modelId: result.usedModel,
          liveConnected: true
        });
      } catch (geminiErr: any) {
        console.error("Gemini API call failed:", geminiErr);
        throw geminiErr;
      }
    }

    return res.status(400).json({
      error: "No AI service key configured. Please enter an API key in the Privacy Vault.",
      requiresKey: "gemini"
    });

  } catch (err: any) {
    console.error("Error in /api/chat:", err);
    return res.status(500).json({
      error: err.message || "Failed to communicate with AI model.",
      modelName: req.body?.modelName || req.body?.modelId
    });
  }
}
