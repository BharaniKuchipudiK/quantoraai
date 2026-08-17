import { GoogleGenAI } from "@google/genai";
import { createRequire } from "node:module";
import { OFFICE_SCHEMAS, OFFICE_GENERATION_DIRECTIVE } from './_lib/conversation-policy.js';
import { resizeImageForEmbed } from './_lib/office-images.js';

// Vercel's Node runtime executes this function as CommonJS. Use Node's
// require-condition so dual-published Office libraries load their CJS builds.
const require = createRequire(import.meta.url);

// A full-deck LLM call + server-side file compilation takes ~15–30s. Without an
// explicit budget, Vercel kills the function at its short default limit and
// returns a raw "A server error" page (which the client then fails to JSON-parse
// → "Unexpected token 'A'"). Give it real headroom.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, format, history = [], userKey, openRouterKey, imageAttachments = [] } = req.body;

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

    if ((format === 'word' || format === 'powerpoint') && Array.isArray(imageAttachments) && imageAttachments.length > 0) {
      const attachedImages = imageAttachments.filter((image) => /^data:image\//i.test(String(image?.dataUrl || ''))).slice(0, 6).map((image) => ({ url: image.dataUrl, caption: image.name || 'Attached image', altText: image.name || 'Attached image' }));
      if (attachedImages.length > 0) {
        if (format === 'word') {
          const firstSection = validJson.sections?.[0] || { heading: 'Figures', paragraphs: [], bullets: [] };
          firstSection.images = [...(firstSection.images || []), ...attachedImages];
          validJson.sections = validJson.sections?.length ? [firstSection, ...validJson.sections.slice(1)] : [firstSection];
        } else if (format === 'powerpoint') {
          const firstSlide = validJson.slides?.[0] || { title: 'Figures', bullets: [] };
          firstSlide.images = [...(firstSlide.images || []), ...attachedImages];
          validJson.slides = validJson.slides?.length ? [firstSlide, ...validJson.slides.slice(1)] : [firstSlide];
        }
      }
    }

    // 2. SERVER-SIDE COMPILATION
    let base64Data = '';
    let mimeType = '';
    let fileName = '';
    let imageCount = 0;
    let htmlPreview = '';

    if (format === 'powerpoint') {
      const pptxgenModule: any = require('pptxgenjs');
      const PptxGenJS: any = pptxgenModule.default || pptxgenModule;
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';
      const slides = validJson.slides || [];
      
      htmlPreview = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px;">
        <h1 style="text-align:center;margin-bottom:40px;">${escapeHtml(validJson.title || 'Presentation')}</h1>
        <div style="display:flex;flex-direction:column;gap:30px;align-items:center;">`;

      for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        const slide = pptx.addSlide();
        if (s.speakerNotes) slide.addNotes(s.speakerNotes);
        slide.addText(s.title || "Slide", { x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 24, bold: true, color: '0F172A' });
        if (s.subtitle) slide.addText(s.subtitle, { x: 0.5, y: 1.2, w: 9, h: 0.5, fontSize: 14, color: '64748B' });
        
        let slideHtml = `<div style="width:100%;max-width:800px;border:1px solid #ccc;border-radius:8px;padding:30px;box-shadow:0 4px 6px rgba(0,0,0,0.1);background:#fff;">
          <h2 style="margin-top:0;">${escapeHtml(s.title || 'Slide ' + (i+1))}</h2>
          ${s.subtitle ? `<h3 style="color:#666;font-weight:normal;margin-top:0;">${escapeHtml(s.subtitle)}</h3>` : ''}`;

        if (s.bullets && s.bullets.length > 0) {
           const bulletPoints = s.bullets.map(b => ({ text: b, options: { bullet: true } }));
           slide.addText(bulletPoints, { x: 0.5, y: 2, w: 9, h: 3, fontSize: 16, color: '0F172A' });
           
           slideHtml += `<ul>${s.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
        }

        if (Array.isArray(s.images) && s.images.length > 0) {
           // Stack up to 2 images down the right column (x 5.0–9.5) in equal,
           // non-overlapping vertical slots. Each image is fit inside its slot
           // preserving aspect ratio, so two images never collide.
           const candidates = s.images.slice(0, 2);
           const resolved = [];
           for (const image of candidates) {
              const imgData = await imageToDataUrl(image?.url);
              if (imgData && imgData.dataUrl) resolved.push(imgData);
           }
           const colX = 5.0;
           const colW = 4.5;
           const colTop = 1.5;
           const colBottom = 5.4;
           const gap = 0.2;
           const slotH = resolved.length > 0
              ? (colBottom - colTop - gap * (resolved.length - 1)) / resolved.length
              : 0;
           resolved.forEach((imgData, idx) => {
              imageCount += 1;
              const aspect = imgData.width && imgData.height ? imgData.height / imgData.width : 0.66;
              // Fit within the slot: cap by width, then by slot height.
              let w = colW;
              let h = w * aspect;
              if (h > slotH) { h = slotH; w = h / aspect; }
              const slotTop = colTop + idx * (slotH + gap);
              const x = colX + (colW - w) / 2; // centre horizontally in the column
              const y = slotTop + (slotH - h) / 2; // centre vertically in the slot
              slide.addImage({ data: imgData.dataUrl, x, y, w, h });
              slideHtml += `<div style="margin-top:20px;text-align:center;"><img src="${imgData.dataUrl}" style="max-width:100%;height:auto;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,0.1);" /></div>`;
           });
        }
        
        if (s.speakerNotes) {
           slideHtml += `<div style="margin-top:20px;padding:10px;background:#f8f9fa;border-left:4px solid #0ea5e9;font-size:0.9em;"><strong>Speaker Notes:</strong><br/>${escapeHtml(s.speakerNotes)}</div>`;
        }
        slideHtml += `</div>`;
        htmlPreview += slideHtml;
      }
      htmlPreview += `</div></body></html>`;
      
      const buffer = await pptx.write({ outputType: 'nodebuffer' });
      base64Data = (await toNodeBuffer(buffer)).toString('base64');
      mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      fileName = sanitizeFilename(validJson.title || 'Presentation') + '.pptx';

    } else if (format === 'word') {
      const docxModule: any = require('html-docx-js-typescript');
      const asBlob = docxModule.asBlob || docxModule.default?.asBlob;
      if (typeof asBlob !== 'function') throw new Error('Word exporter unavailable.');

      const parseInline = (txt) => {
         let safe = escapeHtml(txt);
         safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" style="color:blue;text-decoration:underline;">$1</a>');
         safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
         return safe;
      };

      let htmlString = '<!DOCTYPE html><html><body><h1>' + parseInline(validJson.title || 'Document') + '</h1>';
      for (const sec of (validJson.sections || [])) {
         htmlString += '<h2>' + parseInline(sec.heading || '') + '</h2>';
         for (const paragraph of (sec.paragraphs || [])) htmlString += '<p>' + parseInline(paragraph) + '</p>';
         if (Array.isArray(sec.bullets) && sec.bullets.length > 0) {
            htmlString += '<ul>';
            for (const bullet of sec.bullets) htmlString += '<li>' + parseInline(bullet) + '</li>';
            htmlString += '</ul>';
         }
         if (Array.isArray(sec.images) && sec.images.length > 0) {
           for (const image of sec.images.slice(0, 4)) {
             const imgData = await imageToDataUrl(image?.url);
             const caption = image?.caption || image?.altText || 'Figure';
             if (imgData && imgData.dataUrl) {
               imageCount += 1;
               // Fix for MS Word image sizing: calculate exact proportional height based on a target width
               const targetWidth = 600;
               const targetHeight = imgData.width && imgData.height ? Math.round((imgData.height / imgData.width) * targetWidth) : 'auto';
               htmlString += '<figure style="margin:16px 0;text-align:center;"><img src="' + imgData.dataUrl + '" alt="' + escapeHtml(image?.altText || caption) + '" width="' + targetWidth + '" height="' + targetHeight + '" /><figcaption>' + escapeHtml(caption) + '</figcaption></figure>';
             } else if (image?.url) {
               htmlString += '<p><em>Figure: ' + escapeHtml(caption) + ' (' + escapeHtml(image.url) + ')</em></p>';
             }
           }
         }
      }
      htmlString += '</body></html>';
      htmlPreview = htmlString; // Forward HTML preview to frontend for rendering

      const blob: any = await asBlob(htmlString);
      const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(await blob.arrayBuffer());
      base64Data = (await toNodeBuffer(buffer)).toString('base64');
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      fileName = sanitizeFilename(validJson.title || 'Document') + '.docx';

    } else if (format === 'excel') {
      const writeXlsxModule: any = require('write-excel-file/node');
      const writeXlsxFile: any = writeXlsxModule.default || writeXlsxModule;

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
      
      // The Node exporter returns a writer object; materialize it before encoding.
      const xlsxResult: any = (writeXlsxFile as any)(
        formattedData.length > 0 ? formattedData : [[{ value: 'Empty Data', type: String }]],
        { buffer: true }
      );
      
      htmlPreview = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px;">
        <h1 style="text-align:center;margin-bottom:30px;">${escapeHtml(validJson.filename || 'Spreadsheet')}</h1>
        <table style="width:100%;border-collapse:collapse;margin:0 auto;max-width:1000px;font-size:14px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tbody>
            ${formattedData.map((row, rIdx) => `
              <tr style="${rIdx === 0 ? 'background-color:#f1f5f9;font-weight:bold;border-bottom:2px solid #cbd5e1;' : 'border-bottom:1px solid #e2e8f0;'}">
                ${row.map(cell => `<td style="padding:12px;text-align:${cell.type === Number ? 'right' : 'left'};">${escapeHtml(cell.value)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table></body></html>`;

      const buffer: any = xlsxResult && typeof xlsxResult.toBuffer === 'function'
        ? await xlsxResult.toBuffer()
        : await xlsxResult;
      base64Data = (await toNodeBuffer(buffer)).toString('base64');
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      fileName = sanitizeFilename(validJson.filename || 'Spreadsheet') + '.xlsx';
    }

    // Return the cleanly packaged binary
    res.status(200).json({
      success: true,
      fileName,
      mimeType,
      data: base64Data,
      spec: validJson,
      htmlPreview,
      imageCount
    });

  } catch (err) {
    console.error("Office Compilation Error:", err);
    res.status(500).json({ error: err.message });
  }
}

// Helpers

// Office libraries return different binary types across Node and bundlers.
// Normalize them before base64 encoding so downloads are real Office files.
async function toNodeBuffer(value: any): Promise<Buffer> {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  if (value?.buffer instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength));
  }
  if (typeof value?.arrayBuffer === 'function') {
    return Buffer.from(await value.arrayBuffer());
  }
  return Buffer.from(value);
}

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
   const priorContext = buildOfficeHistoryContext(history);
   const promptWithContext = priorContext ? priorContext + '\n\nCURRENT REQUEST:\n' + prompt : prompt;

   const systemPrompt = OFFICE_GENERATION_DIRECTIVE + `\n\nSCHEMA:\n` + OFFICE_SCHEMAS[format] +
        (lastError ? `\n\nCRITICAL FIX REQUIRED: Your last attempt failed validation with this error: ${lastError}. You MUST fix this syntax or structure error.` : "");

   if (apiKey) {
      try {
        const client = new GoogleGenAI({ apiKey });
        const response = await client.models.generateContent({
           model: process.env.GEMINI_OFFICE_MODEL || 'gemini-flash-latest',
           contents: [{ role: 'user', parts: [{ text: promptWithContext }] }],
           config: {
              systemInstruction: systemPrompt,
              responseMimeType: "application/json"
           }
        });
        let text = response.text;
        // Strip markdown code blocks if the model ignored the directive
        if (text.startsWith('\`\`\`')) {
           text = text.replace(/^\`\`\`(?:json)?\\n/, '').replace(/\\n\`\`\`$/, '');
        }
        return text;
      } catch (err: any) {
        const errorText = String(err?.message || err);
        const fallbackKey = openRouterKey || process.env.OPENROUTER_API_KEY;
        const canFallback = Boolean(fallbackKey) &&
          /(429|quota|rate.?limit|not found|no longer available|not available)/i.test(errorText);
        if (!canFallback) throw err;
        console.warn("Gemini Office generation unavailable; falling back to OpenRouter:", errorText);
      }
   }

   const key = openRouterKey || process.env.OPENROUTER_API_KEY;
   if (key) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
         method: "POST",
         headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
         },
         body: JSON.stringify({
            model: process.env.OPENROUTER_OFFICE_MODEL || "google/gemini-2.5-flash",
            messages: [
               { role: "system", content: systemPrompt },
               { role: "user", content: promptWithContext }
            ],
            response_format: { type: "json_object" }
         })
      });
      
      const text = await response.text();
      let data;
      try {
         data = JSON.parse(text);
      } catch (err) {
         throw new Error(`API Gateway Error (${response.status}): ${text.substring(0, 100)}`);
      }
      
      if (!response.ok || data.error) {
         throw new Error(data.error?.message || `HTTP ${response.status}`);
      }
      
      let content = data.choices[0].message.content;
      if (content.startsWith('```')) {
         content = content.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
      }
      return content;
   }
   throw new Error("No available API credentials");
}
function buildOfficeHistoryContext(history = []) {
  const entries = (Array.isArray(history) ? history : []).slice(-10).map((message) => {
    const role = message?.sender === 'user' ? 'USER' : 'ASSISTANT';
    const text = String(message?.text || '').slice(0, 5000);
    const spec = message?.officeAttachment?.spec ? '\nPREVIOUS OFFICE SPECIFICATION:\n' + JSON.stringify(message.officeAttachment.spec).slice(0, 14000) : '';
    return role + ': ' + text + spec;
  }).filter(Boolean);
  return entries.length ? 'PRIOR CONVERSATION AND DOCUMENT STATE:\n' + entries.join('\n\n') : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function imageToDataUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  const trimmed = url.trim();
  
  try {
    let bytes;
    // The real MIME of the source bytes, so the fallback path can label the
    // data URL honestly instead of guessing 'image/png' for every image.
    let sourceMime = 'image/png';

    if (/^data:image\//i.test(trimmed)) {
       const header = trimmed.slice(5, trimmed.indexOf(','));
       sourceMime = header.split(';')[0] || 'image/png';
       const b64 = trimmed.split(',')[1];
       if (!b64) return null;
       bytes = Buffer.from(b64, 'base64');
    } else {
       if (!/^https?:\/\//i.test(trimmed)) return null;
       const parsed = new URL(trimmed);
       if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) return null;
       const response = await withTimeout(fetch(trimmed, {
         headers: {
           'Accept': 'image/*',
           'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
         }
       }), 8000, 'Image download timed out');
       if (!response.ok) return null;
       const contentType = response.headers.get('content-type') || '';
       if (!/^image\//i.test(contentType)) return null;
       sourceMime = contentType.split(';')[0] || 'image/png';
       bytes = Buffer.from(await response.arrayBuffer());
       if (!bytes.length || bytes.length > 5 * 1024 * 1024) return null;
    }

    // Word renders an embedded image at the payload's native pixel size and
    // ignores HTML width/height, so the only reliable size cap is to physically
    // shrink the pixels before embedding. resizeImageForEmbed does that (and
    // falls back to the original bytes for formats jimp can't decode).
    const { dataUrl, width, height } = await resizeImageForEmbed(bytes, sourceMime);

    return { dataUrl, width, height };
  } catch (error) {
    console.warn('Image could not be embedded or sized:', error?.message || error);
    return null;
  }
}

function sanitizeFilename(name) {
  return String(name || 'document')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50);
}
