import { GoogleGenAI } from "@google/genai";
import { applyCors, clientIp, isRateLimited } from "./_lib/rate-limit.js";
import { getSessionUser } from "./_lib/session.js";
import { fetchApiGatewayKey } from "./autocomplete.js";

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
    const effectiveGeminiKey = mayUseServerKeys ? await fetchApiGatewayKey('GEMINI') || process.env.GEMINI_API_KEY : undefined;

    if (!effectiveGeminiKey && !sessionUser) {
      return res.status(401).json({ error: "Please sign in to use Quantora's AI execution pipeline." });
    }

    if (!effectiveGeminiKey) {
      return res.status(500).json({ error: "Server is missing Gemini API Key configuration." });
    }

    let systemPrompt = "";
    let userPrompt = "";

    if (targetStage === 'idea') {
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
      userPrompt = `Raw Dream: ${node.dreamText || node.sourceText}`;
    } else if (targetStage === 'thought') {
      systemPrompt = `You are an elite Senior React Developer. 
Your job is to take an Architecture Spec (JSON) and write the core React Component Code for it.
Do not write out setup instructions. Just write the raw, beautiful, glassmorphic React code. 
Return ONLY code inside a single \`\`\`jsx block.`;
      userPrompt = `Architecture Spec: ${JSON.stringify(node.ideaSpec)}`;
    } else if (targetStage === 'action') {
      systemPrompt = `You are a DevOps and Deployment Expert. 
Your job is to take a React Component Code block and output a deployment JSON spec.
You MUST output ONLY valid JSON, no markdown formatting blocks, no explanations.
Schema:
{
  "platform": "Vercel | Netlify | Cloudflare",
  "buildCmd": "Build command to use",
  "envVars": ["Array of required env var names"],
  "summary": "Short deployment summary"
}`;
      userPrompt = `React Code:\n${node.thoughtCode}`;
    } else {
      return res.status(400).json({ error: "Invalid target stage" });
    }

    const client = new GoogleGenAI({ apiKey: effectiveGeminiKey });
    
    // Use gemini-3.5-flash as the fast, reliable model for pipeline tasks
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
      },
    });

    let reply = response.text || "";

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
    } else if (targetStage === 'action') {
      reply = reply.replace(/```json/g, '').replace(/```/g, '').trim();
      let parsedAction;
      try {
        parsedAction = JSON.parse(reply);
      } catch(e) {
        parsedAction = { platform: "Unknown", error: "Failed to parse action output as JSON", raw: reply };
      }
      return res.status(200).json({ actionSpec: parsedAction });
    }

  } catch (err: any) {
    console.error("Error in /api/pipeline:", err);
    return res.status(500).json({
      error: err.message || "Failed to execute pipeline step."
    });
  }
}
