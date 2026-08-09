import { applyCors, clientIp, isRateLimited } from "./_lib/rate-limit.js";
import { getSessionUser } from "./_lib/session.js";

const RATE_LIMIT_PER_MINUTE = 15;

export default async function handler(req: any, res: any) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionUser = getSessionUser(req);
  const limitKey = sessionUser ? `pipeline:user:${sessionUser.sub}` : `pipeline:ip:${clientIp(req)}`;
  if (isRateLimited(limitKey, RATE_LIMIT_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  try {
    const { node, targetStage } = req.body || {};
    
    // Auth Check
    const mayUseServerKeys = Boolean(sessionUser);
    const effectiveOpenRouterKey = mayUseServerKeys ? process.env.OPENROUTER_API_KEY : undefined;

    if (!effectiveOpenRouterKey && !sessionUser) {
      return res.status(401).json({ error: "Please sign in to use Quantora's AI execution pipeline." });
    }

    let systemPrompt = "";
    let userPrompt = "";
    let modelId = "google/gemma-2-9b-it"; // Default fast model

    if (targetStage === 'idea') {
      modelId = "google/gemma-2-9b-it";
      systemPrompt = `You are an elite Solutions Architect. 
Your job is to take a raw user dream/prompt and output a strict JSON Architecture Spec.
You MUST output ONLY valid JSON, no markdown formatting blocks, no explanations.
Schema:
{
  "title": "App Name",
  "techStack": ["React", "Vite", "etc"],
  "keyFeatures": ["feature 1", "feature 2"],
  "dataModels": [{"name": "User", "fields": ["id", "name"]}]
}`;
      userPrompt = `Raw Dream: ${node.dreamText}`;
    } else if (targetStage === 'thought') {
      modelId = "qwen/qwen-2.5-coder-32b-instruct";
      systemPrompt = `You are an elite Senior React Developer. 
Your job is to take an Architecture Spec (JSON) and write the core React Component Code for it.
Do not write out setup instructions. Just write the raw, beautiful, glassmorphic React code. 
Return ONLY code inside a single \`\`\`jsx block.`;
      userPrompt = `Architecture Spec: ${JSON.stringify(node.ideaSpec)}`;
    } else {
      return res.status(400).json({ error: "Invalid target stage" });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${effectiveOpenRouterKey}`,
        "HTTP-Referer": process.env.APP_URL || "https://quantoraai.app",
        "X-Title": "Quantora Pipeline",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API failed: ${response.status} ${errText}`);
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content || "";

    // Clean up output depending on stage
    if (targetStage === 'idea') {
      // Strip markdown if AI misbehaves
      reply = reply.replace(/```json/g, '').replace(/```/g, '').trim();
      let parsedJson;
      try {
        parsedJson = JSON.parse(reply);
      } catch(e) {
        // Fallback fake json if parsing fails
        parsedJson = { title: "Generated Idea", error: "Failed to parse AI output as JSON", raw: reply };
      }
      return res.status(200).json({ ideaSpec: parsedJson });
    } else if (targetStage === 'thought') {
      return res.status(200).json({ thoughtCode: reply });
    }

  } catch (err: any) {
    console.error("Error in /api/pipeline:", err);
    return res.status(500).json({
      error: err.message || "Failed to execute pipeline step."
    });
  }
}
