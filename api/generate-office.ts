import { GoogleGenAI } from "@google/genai";
import pptxgen from "pptxgenjs";
import writeXlsxFile from 'write-excel-file/node';
import { asBlob } from 'html-docx-js-typescript';
import { OFFICE_SCHEMAS, OFFICE_GENERATION_DIRECTIVE } from './_lib/conversation-policy.js';

// A full-deck LLM call + server-side file compilation takes ~15–30s. Without an
// explicit budget, Vercel kills the function at its short default limit and
// returns a raw "A server error" page (which the client then fails to JSON-parse
// → "Unexpected token 'A'"). Give it real headroom.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, format, history = [], userKey, openRouterKey } = req.body;

  if (!['powerpoint', 'word', 'excel'].includes(format)) {
    return res.status(400).json({ error: 'Invalid format requested' });
  }

  // Choose the best key available (Gemini preferred, or OpenRouter)
  const apiKey = userKey || process.env.GEMINI_API_KEY;
  if (!apiKey && !openRouterKey && !process.env.OPENROUTER_API_KEY) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    // 1. GATEKEEPER: GENERATE & VALIDATE WITH RETRY LOOP
    let validJson = null;
    let attempts = 0;
    const maxAttempts = 2; // bound total time so we stay within maxDuration
    let lastError = '';

    while (attempts < maxAttempts && !validJson) {
      attempts++;
      try {
        // Bound each attempt (25s) so 2 attempts stay within the 60s function
        // budget. A hang now surfaces as a real error, not a Vercel hard-kill.
        const rawResponse = await withTimeout(
          generateJsonSchema(prompt, format, history, apiKey, openRouterKey, lastError),
          25000,
          'The AI model took too long to respond',
        );
        validJson = JSON.parse(rawResponse);
        
        // Basic validation: must have the core structures
        if (format === 'powerpoint' && (!validJson.slides || !Array.isArray(validJson.slides))) {
           throw new Error("Missing 'slides' array in PowerPoint schema");
        }
        if (format === 'word' && (!validJson.sections || !Array.isArray(validJson.sections))) {
           throw new Error("Missing 'sections' array in Word schema");
        }
        if (format === 'excel' && (!validJson.sheets || !Array.isArray(validJson.sheets))) {
           throw new Error("Missing 'sheets' array in Excel schema");
        }
      } catch (err) {
        console.warn(`Gatekeeper validation failed (attempt ${attempts}):`, err.message);
        lastError = err.message;
        validJson = null;
      }
    }

    if (!validJson) {
      return res.status(500).json({ error: `Gatekeeper failed to produce valid ${format} schema after ${maxAttempts} attempts. Last error: ${lastError}` });
    }

    // 2. SERVER-SIDE COMPILATION
    let base64Data = '';
    let mimeType = '';
    let fileName = '';

    if (format === 'powerpoint') {
      const PptxGenJS: any = (pptxgen as any).default || pptxgen;
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';
      const slides = validJson.slides || [];
      
      slides.forEach((s) => {
        const slide = pptx.addSlide();
        if (s.speakerNotes) slide.addNotes(s.speakerNotes);
        slide.addText(s.title || "Slide", { x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 24, bold: true, color: '0F172A' });
        if (s.subtitle) slide.addText(s.subtitle, { x: 0.5, y: 1.2, w: 9, h: 0.5, fontSize: 14, color: '64748B' });
        if (s.bullets && s.bullets.length > 0) {
           const bulletPoints = s.bullets.map(b => ({ text: b, options: { bullet: true } }));
           slide.addText(bulletPoints, { x: 0.5, y: 2, w: 9, h: 3, fontSize: 16, color: '0F172A' });
        }
      });
      
      const buffer = await pptx.write({ outputType: 'nodebuffer' });
      base64Data = buffer.toString('base64');
      mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      fileName = sanitizeFilename(validJson.title || 'Presentation') + '.pptx';

    } else if (format === 'word') {
      let htmlString = `<!DOCTYPE html><html><body><h1>${validJson.title || 'Document'}</h1>`;
      (validJson.sections || []).forEach(sec => {
         htmlString += `<h2>${sec.heading || ''}</h2>`;
         (sec.paragraphs || []).forEach(p => { htmlString += `<p>${p}</p>`; });
         if (sec.bullets && sec.bullets.length > 0) {
            htmlString += '<ul>';
            sec.bullets.forEach(b => { htmlString += `<li>${b}</li>`; });
            htmlString += '</ul>';
         }
      });
      htmlString += '</body></html>';
      
      const blob: any = await asBlob(htmlString);
      const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(await blob.arrayBuffer());
      base64Data = buffer.toString('base64');
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      fileName = sanitizeFilename(validJson.title || 'Document') + '.docx';

    } else if (format === 'excel') {
      // Need to convert JSON "rows" to write-excel-file schema
      const sheetsData = validJson.sheets && validJson.sheets.length > 0 ? validJson.sheets : [{name: 'Sheet1', data: []}];
      // We take the first sheet to compile (write-excel-file supports multiple sheets if passed as an object, but we keep it simple)
      const excelRows = sheetsData[0].data || [];
      // Flatten out if they are raw arrays, otherwise try to pass directly
      
      // write-excel-file expects rows of objects {value: x, type: String}
      const formattedData = excelRows.map(row => {
          return row.map(cell => {
             if (typeof cell === 'string') return { value: cell, type: String };
             if (typeof cell === 'number') return { value: cell, type: Number };
             return { value: cell.value || '', type: cell.type === 'Number' ? Number : String, fontWeight: cell.fontWeight };
          });
      });
      
      const buffer: any = await (writeXlsxFile as any)(formattedData.length > 0 ? formattedData : [[{ value: 'Empty Data', type: String }]], { buffer: true });
      base64Data = buffer.toString('base64');
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      fileName = sanitizeFilename(validJson.filename || 'Spreadsheet') + '.xlsx';
    }

    // Return the cleanly packaged binary
    res.status(200).json({
      success: true,
      fileName,
      mimeType,
      data: base64Data
    });

  } catch (err) {
    console.error("Office Compilation Error:", err);
    res.status(500).json({ error: err.message });
  }
}

// Helpers

// Reject a promise if it doesn't settle within `ms`, so a slow/hung upstream
// call becomes a clean, diagnosable error inside our own try/catch instead of a
// Vercel function timeout (which returns an opaque raw 500 HTML page).
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: any;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} (>${Math.round(ms / 1000)}s)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

async function generateJsonSchema(prompt, format, history, apiKey, openRouterKey, lastError) {
   const systemPrompt = OFFICE_GENERATION_DIRECTIVE + `\n\nSCHEMA:\n` + OFFICE_SCHEMAS[format] +
        (lastError ? `\n\nCRITICAL FIX REQUIRED: Your last attempt failed validation with this error: ${lastError}. You MUST fix this syntax or structure error.` : "");

   if (apiKey) {
      const client = new GoogleGenAI({ apiKey });
      const response = await client.models.generateContent({
         model: 'gemini-2.5-flash',
         contents: [{ role: 'user', parts: [{ text: prompt }] }],
         config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json"
         }
      });
      return response.text;
   } else if (openRouterKey || process.env.OPENROUTER_API_KEY) {
      const key = openRouterKey || process.env.OPENROUTER_API_KEY;
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
         method: "POST",
         headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
         },
         body: JSON.stringify({
            model: "anthropic/claude-3.5-sonnet",
            messages: [
               { role: "system", content: systemPrompt },
               { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
         })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      return data.choices[0].message.content;
   }
   throw new Error("No available API credentials");
}

function sanitizeFilename(name) {
  return String(name || 'document')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50);
}
