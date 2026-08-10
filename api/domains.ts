import { GoogleGenAI } from "@google/genai";
import { fetchApiGatewayKey } from './autocomplete';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { context } = req.body;
    
    const apiKey = await fetchApiGatewayKey('GEMINI') || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(401).json({ error: "No API key available for Domains." });
    
    const client = new GoogleGenAI({ apiKey });
    const prompt = `You are an expert branding and domain name generator. Based on the following app context, suggest 5 catchy, short, and highly brandable .com or .app domain names. 
Return ONLY a JSON array of strings, like ["sneakerhub.app", "solevault.com"]. No markdown, no explanation.

CONTEXT:
${context || 'A modern web application'}`;

    const response = await client.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    
    const text = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
    let domains = [];
    try {
       domains = JSON.parse(text);
    } catch(e) {
       domains = ["myapp.app", "myawesomeproject.com"]; // Fallback
    }

    return res.status(200).json({ domains });
  } catch (error: any) {
    console.error("Domains API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate domains." });
  }
}
