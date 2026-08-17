import { GoogleGenAI } from "@google/genai";
import { createRequire } from "node:module";
import { OFFICE_SCHEMAS, OFFICE_GENERATION_DIRECTIVE } from './_lib/conversation-policy.js';
import { resizeImageForEmbed } from './_lib/office-images.js';
import { DECK_THEME, classifySlide, normalizeChartData, buildDeckPreviewHtml } from './_lib/deck-theme.js';
import {
  OFFICE_ARTIFACT_VERSION,
  OFFICE_META,
  injectOfficeManifest,
  normalizeOfficeSpec,
  validateOfficeSpec,
  verifyCompiledOfficeArtifact,
} from './_lib/office-artifact.js';

const require = createRequire(import.meta.url);

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    prompt = '',
    format,
    history = [],
    userKey,
    openRouterKey,
    imageAttachments = [],
    spec: suppliedSpec = null,
    compileOnly = false,
  } = req.body || {};

  if (!['powerpoint', 'word', 'excel'].includes(format)) {
    return res.status(400).json({ error: 'Invalid format requested' });
  }

  const apiKey = userKey || process.env.GEMINI_API_KEY;
  const hasOpenRouter = Boolean(openRouterKey || process.env.OPENROUTER_API_KEY);
  const isCompileRequest = Boolean(compileOnly || suppliedSpec);
  if (!isCompileRequest && !apiKey && !hasOpenRouter) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    let validJson;
    let generationAttempts = 0;
    const generationWarnings = [];

    if (isCompileRequest) {
      const validation = validateOfficeSpec(format, suppliedSpec);
      if (!validation.valid) {
        return res.status(422).json({
          error: `Office specification failed validation: ${validation.issues.join(' ')}`,
          issues: validation.issues,
          warnings: validation.warnings,
        });
      }
      validJson = validation.spec;
      generationWarnings.push(...validation.warnings);
    } else {
      const maxAttempts = 2;
      let lastError = '';

      while (generationAttempts < maxAttempts && !validJson) {
        generationAttempts += 1;
        try {
          const preferOpenRouter = generationAttempts > 1 && hasOpenRouter;
          const rawResponse = await withTimeout(
            generateJsonSchema(prompt, format, history, apiKey, openRouterKey, lastError, preferOpenRouter),
            110_000,
            'The AI model took too long to respond',
          );
          const parsed = JSON.parse(rawResponse);
          const validation = validateOfficeSpec(format, parsed);
          if (!validation.valid) throw new Error(validation.issues.join(' '));
          validJson = validation.spec;
          generationWarnings.push(...validation.warnings);
        } catch (error) {
          lastError = String(error?.message || error);
          console.warn(`Office gatekeeper failed (attempt ${generationAttempts}):`, lastError);
          validJson = null;
        }
      }

      if (!validJson) {
        return res.status(502).json({
          error: `Gatekeeper failed to produce a valid ${format} specification after ${generationAttempts} attempts.`,
        });
      }
    }

    validJson = attachUserImages(format, validJson, imageAttachments);
    validJson = normalizeOfficeSpec(format, validJson);
    const finalSpecValidation = validateOfficeSpec(format, validJson);
    if (!finalSpecValidation.valid) {
      return res.status(422).json({
        error: `Office specification could not be repaired safely: ${finalSpecValidation.issues.join(' ')}`,
        issues: finalSpecValidation.issues,
        warnings: finalSpecValidation.warnings,
      });
    }
    validJson = finalSpecValidation.spec;
    generationWarnings.push(...finalSpecValidation.warnings);

    const compiled = await compileOfficeArtifact(format, validJson);
    const verification = verifyCompiledOfficeArtifact(format, {
      buffer: compiled.buffer,
      spec: validJson,
      htmlPreview: compiled.htmlPreview,
    });
    verification.warnings = [...new Set([...generationWarnings, ...(verification.warnings || [])])];

    if (!verification.passed) {
      console.error('Office verification rejected artifact:', verification.issues);
      return res.status(422).json({
        error: `Generated ${format} failed the Office verification gate. No degraded file was returned.`,
        issues: verification.issues,
        warnings: verification.warnings,
        verification,
      });
    }

    const htmlPreview = injectOfficeManifest(compiled.htmlPreview, {
      kind: format,
      spec: validJson,
      previewFingerprint: verification.previewFingerprint,
    });

    return res.status(200).json({
      success: true,
      artifactVersion: OFFICE_ARTIFACT_VERSION,
      source: 'server-compiled',
      kind: format,
      fileName: compiled.fileName,
      mimeType: compiled.mimeType,
      data: compiled.buffer.toString('base64'),
      spec: validJson,
      htmlPreview,
      imageCount: compiled.imageCount,
      verification,
      generation: {
        mode: isCompileRequest ? 'deterministic-recompile' : 'ai-generate-and-compile',
        attempts: generationAttempts,
      },
    });
  } catch (error) {
    console.error('Office Compilation Error:', error);
    return res.status(500).json({ error: error?.message || 'Office compilation failed' });
  }
}

function attachUserImages(format, inputSpec, imageAttachments) {
  const spec = structuredClone(inputSpec || {});
  if (!['word', 'powerpoint'].includes(format) || !Array.isArray(imageAttachments) || !imageAttachments.length) return spec;

  const attachedImages = imageAttachments
    .filter((image) => /^data:image\//i.test(String(image?.dataUrl || '')))
    .slice(0, 6)
    .map((image) => ({
      url: image.dataUrl,
      caption: image.name || 'Attached image',
      altText: image.name || 'Attached image',
    }));
  if (!attachedImages.length) return spec;

  if (format === 'word') {
    const sections = Array.isArray(spec.sections) ? spec.sections : [];
    const first = sections[0] || { heading: 'Figures', paragraphs: [], bullets: [] };
    first.images = [...(Array.isArray(first.images) ? first.images : []), ...attachedImages];
    spec.sections = sections.length ? [first, ...sections.slice(1)] : [first];
    return spec;
  }

  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  let target = slides.find((slide, index) => classifySlide(slide, index) === 'bullets');
  if (!target) {
    target = { type: 'bullets', title: 'Figures', bullets: [] };
    const insertAt = slides.length && classifySlide(slides[0], 0) === 'cover' ? 1 : 0;
    slides.splice(insertAt, 0, target);
  }
  target.images = [...(Array.isArray(target.images) ? target.images : []), ...attachedImages];
  spec.slides = slides;
  return spec;
}

export async function compileOfficeArtifact(format, spec) {
  if (format === 'powerpoint') return compilePowerPoint(spec);
  if (format === 'word') return compileWord(spec);
  if (format === 'excel') return compileExcel(spec);
  throw new Error(`Unsupported Office format: ${format}`);
}

async function compilePowerPoint(spec) {
  const pptxgenModule: any = require('pptxgenjs');
  const PptxGenJS: any = pptxgenModule.default || pptxgenModule;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Quantora';
  pptx.subject = String(spec.title || 'Presentation');
  pptx.title = String(spec.title || 'Presentation');
  pptx.company = 'Quantora';
  pptx.lang = 'en-US';

  const composed = await composePresentation(pptx, spec);
  const htmlPreview = buildDeckPreviewHtml(spec, composed.slideImages);
  const raw = await pptx.write({ outputType: 'nodebuffer' });
  const buffer = await toNodeBuffer(raw);

  return {
    buffer,
    mimeType: OFFICE_META.powerpoint.mimeType,
    fileName: sanitizeFilename(spec.title || 'Presentation') + '.pptx',
    imageCount: composed.imageCount,
    htmlPreview,
  };
}

function parseInlineMarkdown(text) {
  let safe = escapeHtml(text);
  safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" style="color:#2563eb;text-decoration:underline;">$1</a>');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return safe;
}

async function compileWord(spec) {
  const docxModule: any = require('html-docx-js-typescript');
  const asBlob = docxModule.asBlob || docxModule.default?.asBlob;
  if (typeof asBlob !== 'function') throw new Error('Word exporter unavailable.');

  let imageCount = 0;
  let body = `<h1>${parseInlineMarkdown(spec.title || 'Document')}</h1>`;
  for (const section of spec.sections || []) {
    body += `<section><h2>${parseInlineMarkdown(section.heading || '')}</h2>`;
    for (const paragraph of section.paragraphs || []) body += `<p>${parseInlineMarkdown(paragraph)}</p>`;
    if (Array.isArray(section.bullets) && section.bullets.length) {
      body += '<ul>';
      for (const bullet of section.bullets) body += `<li>${parseInlineMarkdown(bullet)}</li>`;
      body += '</ul>';
    }
    for (const image of (section.images || []).slice(0, 4)) {
      const resolved = await imageToDataUrl(image?.url);
      const caption = image?.caption || image?.altText || 'Figure';
      if (resolved?.dataUrl) {
        imageCount += 1;
        const targetWidth = Math.min(560, resolved.width || 560);
        const targetHeight = resolved.width && resolved.height
          ? Math.max(1, Math.round((resolved.height / resolved.width) * targetWidth))
          : 360;
        body += `<figure><img src="${resolved.dataUrl}" alt="${escapeHtml(image?.altText || caption)}" width="${targetWidth}" height="${targetHeight}"/><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
      } else if (image?.url) {
        body += `<p class="figure-fallback"><em>Figure unavailable during compilation: ${escapeHtml(caption)}</em></p>`;
      }
    }
    body += '</section>';
  }

  const htmlPreview = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    @page { size: A4; margin: 0.72in; }
    body { font-family: Aptos, "Segoe UI", Arial, sans-serif; color:#334155; font-size:11pt; line-height:1.5; margin:0; padding:42px 54px; background:#fff; }
    h1 { color:#0f172a; font-size:27pt; line-height:1.12; margin:0 0 24px; padding-bottom:12px; border-bottom:4px solid #4f46e5; }
    h2 { color:#0f172a; font-size:17pt; line-height:1.2; margin:26px 0 10px; }
    p { margin:0 0 11px; }
    ul { margin:7px 0 15px 22px; padding:0; }
    li { margin:0 0 6px; }
    figure { margin:18px 0; text-align:center; page-break-inside:avoid; }
    figure img { max-width:100%; height:auto; }
    figcaption { color:#64748b; font-size:9pt; margin-top:6px; }
    .figure-fallback { color:#64748b; }
  </style></head><body>${body}</body></html>`;

  const blob: any = await asBlob(htmlPreview);
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(await blob.arrayBuffer());
  return {
    buffer: await toNodeBuffer(buffer),
    mimeType: OFFICE_META.word.mimeType,
    fileName: sanitizeFilename(spec.title || 'Document') + '.docx',
    imageCount,
    htmlPreview,
  };
}

function toExcelLibraryCell(cell) {
  const isNumber = cell?.type === 'Number' && Number.isFinite(Number(cell.value));
  const out: any = {
    value: isNumber ? Number(cell.value) : String(cell?.value ?? ''),
    type: isNumber ? Number : String,
  };
  if (cell?.fontWeight === 'bold') out.fontWeight = 'bold';
  if (cell?.format) out.format = cell.format;
  if (cell?.backgroundColor) out.backgroundColor = `#${String(cell.backgroundColor).replace('#', '')}`;
  if (cell?.color) out.textColor = `#${String(cell.color).replace('#', '')}`;
  if (cell?.align) out.align = cell.align;
  if (typeof cell?.wrap === 'boolean') out.wrap = cell.wrap;
  if (cell?.fontSize) out.fontSize = cell.fontSize;
  return out;
}

function buildExcelPreview(spec, formattedSheets) {
  const sections = (spec.sheets || []).map((sheet, sheetIndex) => {
    const rows = formattedSheets[sheetIndex] || [];
    const previewRows = rows.slice(0, 250);
    const table = previewRows.map((row, rowIndex) => `
      <tr class="${rowIndex === 0 ? 'header-row' : ''}">
        ${row.map((cell) => `<td class="${cell.type === Number ? 'number' : ''}">${escapeHtml(cell.value)}</td>`).join('')}
      </tr>`).join('');
    const truncated = rows.length > previewRows.length
      ? `<p class="preview-note">Preview shows the first ${previewRows.length} of ${rows.length} rows. The downloaded workbook contains all rows.</p>`
      : '';
    return `<section class="excel-sheet" data-sheet-name="${escapeHtml(sheet.name)}"><h2>${escapeHtml(sheet.name)}</h2>${truncated}<div class="table-wrap"><table><tbody>${table}</tbody></table></div></section>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    body { margin:0; padding:24px; background:#f8fafc; font-family:Aptos,"Segoe UI",Arial,sans-serif; color:#1f2937; }
    h1 { margin:0 0 18px; color:#0f172a; font-size:24px; }
    .excel-sheet { background:#fff; border:1px solid #dbe2ea; border-radius:10px; padding:18px; margin:0 0 22px; box-shadow:0 2px 8px rgba(15,23,42,.06); }
    h2 { margin:0 0 12px; color:#107c41; font-size:17px; }
    .table-wrap { overflow:auto; }
    table { border-collapse:collapse; min-width:100%; font-size:13px; }
    td { border:1px solid #d4d4d8; padding:7px 9px; white-space:nowrap; }
    .header-row td { font-weight:700; background:#f1f5f9; border-bottom:2px solid #94a3b8; }
    td.number { text-align:right; }
    .preview-note { margin:0 0 10px; color:#64748b; font-size:12px; }
  </style></head><body><h1>${escapeHtml(spec.filename || 'Spreadsheet')}</h1>${sections}</body></html>`;
}

async function compileExcel(spec) {
  const writeXlsxModule: any = require('write-excel-file/node');
  const writeXlsxFile: any = writeXlsxModule.default || writeXlsxModule;

  const sheets = Array.isArray(spec.sheets) && spec.sheets.length
    ? spec.sheets
    : [{ name: 'Sheet1', data: [[{ value: 'Empty Data', type: 'String' }]] }];
  const formattedSheets = sheets.map((sheet) => {
    const rows = Array.isArray(sheet.data) && sheet.data.length ? sheet.data : [[{ value: '', type: 'String' }]];
    return rows.map((row) => (Array.isArray(row) ? row : []).map(toExcelLibraryCell));
  });

  // write-excel-file v4 uses one object per worksheet. Keeping each sheet's
  // data and options together prevents the old first-sheet-only failure mode.
  const workbookSheets = sheets.map((sheet, index) => ({
    data: formattedSheets[index],
    sheet: sheet.name,
    stickyRowsCount: formattedSheets[index]?.length > 1 ? 1 : 0,
  }));
  const writer: any = writeXlsxFile(workbookSheets, {
    fontFamily: 'Aptos',
    fontSize: 11,
  });
  if (!writer || typeof writer.toBuffer !== 'function') {
    throw new Error('Excel writer did not expose a buffer output method.');
  }
  const buffer = await toNodeBuffer(await writer.toBuffer());

  return {
    buffer,
    mimeType: OFFICE_META.excel.mimeType,
    fileName: sanitizeFilename(spec.filename || 'Spreadsheet') + '.xlsx',
    imageCount: 0,
    htmlPreview: buildExcelPreview(spec, formattedSheets),
  };
}

async function toNodeBuffer(value: any): Promise<Buffer> {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  if (value?.buffer instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength));
  }
  if (typeof value?.arrayBuffer === 'function') return Buffer.from(await value.arrayBuffer());
  return Buffer.from(value);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: any;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} (>${Math.round(ms / 1000)}s)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function isTransientModelError(text = '') {
  return /\b(429|500|502|503|504)\b|unavailable|overload|high demand|try again|resource.?exhausted|quota|rate.?limit|deadline|timeout|not found|no longer available|not available/i.test(String(text || ''));
}

async function callOpenRouter(systemPrompt, promptWithContext, openRouterKey) {
  const key = openRouterKey || process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OpenRouter credential unavailable');
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_OFFICE_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: promptWithContext },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`OpenRouter returned unreadable JSON (${response.status})`);
  }
  if (!response.ok || data.error) throw new Error(data.error?.message || `HTTP ${response.status}`);
  let content = String(data.choices?.[0]?.message?.content || '');
  if (content.startsWith('```')) content = content.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
  return content;
}

async function generateJsonSchema(prompt, format, history, apiKey, openRouterKey, lastError, preferOpenRouter = false) {
  const priorContext = buildOfficeHistoryContext(history);
  const promptWithContext = priorContext ? `${priorContext}\n\nCURRENT REQUEST:\n${prompt}` : prompt;
  const systemPrompt = OFFICE_GENERATION_DIRECTIVE + `\n\nSCHEMA:\n${OFFICE_SCHEMAS[format]}` +
    (lastError ? `\n\nCRITICAL FIX REQUIRED: Your last attempt failed validation with this error: ${lastError}. Correct the structure and preserve the user's requested content.` : '');

  if (preferOpenRouter && (openRouterKey || process.env.OPENROUTER_API_KEY)) {
    return callOpenRouter(systemPrompt, promptWithContext, openRouterKey);
  }

  if (apiKey) {
    const client = new GoogleGenAI({ apiKey });
    let geminiError: any = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await client.models.generateContent({
          model: process.env.GEMINI_OFFICE_MODEL || 'gemini-flash-latest',
          contents: [{ role: 'user', parts: [{ text: promptWithContext }] }],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
          },
        });
        let text = String(response.text || '');
        if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
        return text;
      } catch (error: any) {
        geminiError = error;
        const errorText = String(error?.message || error);
        if (isTransientModelError(errorText) && attempt < 2) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        break;
      }
    }

    const errorText = String(geminiError?.message || geminiError);
    if (!(openRouterKey || process.env.OPENROUTER_API_KEY) || !isTransientModelError(errorText)) throw geminiError;
    console.warn('Gemini Office generation unavailable; falling back to OpenRouter:', errorText);
  }

  return callOpenRouter(systemPrompt, promptWithContext, openRouterKey);
}

function buildOfficeHistoryContext(history = []) {
  const entries = (Array.isArray(history) ? history : []).slice(-10).map((message) => {
    const role = message?.sender === 'user' ? 'USER' : 'ASSISTANT';
    const text = String(message?.text || '').slice(0, 5000);
    const priorSpec = message?.officeAttachment?.spec
      ? `\nPREVIOUS OFFICE SPECIFICATION:\n${JSON.stringify(message.officeAttachment.spec).slice(0, 14000)}`
      : '';
    return `${role}: ${text}${priorSpec}`;
  }).filter(Boolean);
  return entries.length ? `PRIOR CONVERSATION AND DOCUMENT STATE:\n${entries.join('\n\n')}` : '';
}

const T = DECK_THEME.color;
const F = DECK_THEME.font;
const MARGIN = DECK_THEME.layout.margin;
const CONTENT_W = DECK_THEME.layout.contentW;

function defineDeckMasters(pptx) {
  pptx.defineSlideMaster({
    title: 'COVER',
    background: { color: T.coverBg },
    objects: [{ rect: { x: MARGIN, y: 1.55, w: 0.8, h: 0.08, fill: { color: T.accent } } }],
  });
  pptx.defineSlideMaster({ title: 'SECTION', background: { color: T.accentSoft } });
  pptx.defineSlideMaster({
    title: 'CONTENT',
    background: { color: T.bg },
    objects: [{ rect: { x: 0, y: 0, w: '100%', h: 0.12, fill: { color: T.accent } } }],
  });
}

function addContentHeader(slide, s, index) {
  slide.addText(String(s.title || `Slide ${index + 1}`), {
    x: MARGIN, y: 0.55, w: CONTENT_W, h: 0.7, fontSize: 26, bold: true, color: T.ink, fontFace: F.heading,
    margin: 0,
  });
  if (s.subtitle) {
    slide.addText(String(s.subtitle), {
      x: MARGIN, y: 1.25, w: CONTENT_W, h: 0.45, fontSize: 14, color: T.muted, fontFace: F.body, margin: 0,
    });
  }
  slide.addShape('rect', { x: MARGIN, y: s.subtitle ? 1.72 : 1.32, w: 0.6, h: 0.045, fill: { color: T.accent }, line: { color: T.accent } });
}

function addFooter(slide, deckTitle, page, total) {
  slide.addText(String(deckTitle || ''), {
    x: MARGIN, y: 5.25, w: CONTENT_W - 1, h: 0.3, fontSize: 9, color: T.muted, fontFace: F.body, margin: 0,
  });
  slide.addText(`${page} / ${total}`, {
    x: DECK_THEME.layout.w - 1.4, y: 5.25, w: 0.8, h: 0.3, fontSize: 9, color: T.muted, align: 'right', margin: 0,
  });
}

function addBullets(slide, bullets, x, y, w) {
  const items = bullets.map((bullet) => ({ text: String(bullet), options: { bullet: { indent: 18 }, breakLine: true } }));
  slide.addText(items, {
    x, y, w, h: 5.1 - y, fontSize: 16, color: T.body, fontFace: F.body, valign: 'top', lineSpacingMultiple: 1.15, paraSpaceAfter: 6,
    margin: 0.04,
  });
}

function placeImages(slide, resolved, top) {
  const colX = 5.0;
  const colW = 4.5;
  const bottom = 5.1;
  const gap = 0.2;
  const slotH = resolved.length ? (bottom - top - gap * (resolved.length - 1)) / resolved.length : 0;
  resolved.forEach((image, index) => {
    const aspect = image.width && image.height ? image.height / image.width : 0.66;
    let w = colW;
    let h = w * aspect;
    if (h > slotH) { h = slotH; w = h / aspect; }
    const slotTop = top + index * (slotH + gap);
    slide.addImage({
      data: image.dataUrl,
      x: colX + (colW - w) / 2,
      y: slotTop + (slotH - h) / 2,
      w,
      h,
    });
  });
  return resolved.length;
}

export async function composePresentation(pptx, spec) {
  defineDeckMasters(pptx);
  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  const slideImages: string[][] = [];
  let imageCount = 0;

  for (let i = 0; i < slides.length; i += 1) {
    const s = slides[i] || {};
    const type = classifySlide(s, i);
    const resolvedUrls: string[] = [];

    if (type === 'cover') {
      const slide = pptx.addSlide({ masterName: 'COVER' });
      slide.addText(String(s.title || spec.title || 'Presentation'), {
        x: MARGIN, y: 1.9, w: CONTENT_W, h: 1.5, fontSize: 40, bold: true, color: T.coverText, fontFace: F.heading, valign: 'top', margin: 0,
      });
      if (s.subtitle) slide.addText(String(s.subtitle), { x: MARGIN, y: 3.45, w: CONTENT_W, h: 0.8, fontSize: 18, color: T.coverMuted, fontFace: F.body, margin: 0 });
      if (s.author) slide.addText(String(s.author), { x: MARGIN, y: 4.7, w: CONTENT_W, h: 0.4, fontSize: 13, color: T.coverMuted, margin: 0 });
      if (s.speakerNotes) slide.addNotes(String(s.speakerNotes));
    } else if (type === 'section') {
      const slide = pptx.addSlide({ masterName: 'SECTION' });
      slide.addText(`SECTION ${String(i + 1).padStart(2, '0')}`, { x: MARGIN, y: 1.9, w: CONTENT_W, h: 0.4, fontSize: 14, bold: true, color: T.accent, charSpacing: 3, fontFace: F.heading, margin: 0 });
      slide.addText(String(s.title || ''), { x: MARGIN, y: 2.35, w: CONTENT_W, h: 1.1, fontSize: 30, bold: true, color: T.ink, fontFace: F.heading, margin: 0 });
      slide.addShape('rect', { x: MARGIN, y: 3.5, w: 0.9, h: 0.05, fill: { color: T.accent }, line: { color: T.accent } });
      if (s.subtitle) slide.addText(String(s.subtitle), { x: MARGIN, y: 3.7, w: CONTENT_W * 0.7, h: 0.8, fontSize: 16, color: T.muted, fontFace: F.body, margin: 0 });
      if (s.speakerNotes) slide.addNotes(String(s.speakerNotes));
    } else if (type === 'quote') {
      const slide = pptx.addSlide({ masterName: 'SECTION' });
      slide.addText('“', { x: MARGIN - 0.05, y: 0.7, w: 2, h: 1.5, fontSize: 96, bold: true, color: T.accent, fontFace: 'Georgia', margin: 0 });
      slide.addText(String(s.quote || s.title || ''), { x: MARGIN, y: 2.0, w: CONTENT_W, h: 2.2, fontSize: 26, bold: true, italic: true, color: T.ink, fontFace: 'Georgia', valign: 'top', margin: 0 });
      if (s.author) slide.addText(`— ${String(s.author)}`, { x: MARGIN, y: 4.35, w: CONTENT_W, h: 0.5, fontSize: 15, color: T.muted, fontFace: F.body, margin: 0 });
      if (s.speakerNotes) slide.addNotes(String(s.speakerNotes));
    } else {
      const slide = pptx.addSlide({ masterName: 'CONTENT' });
      addContentHeader(slide, s, i);
      addFooter(slide, spec.title, i + 1, slides.length);
      const bodyTop = s.subtitle ? 2.0 : 1.6;

      if (type === 'data_viz') {
        const rows = normalizeChartData(s.data);
        if (rows.length) {
          slide.addChart('bar', [{ name: 'Value', labels: rows.map((row) => row.label), values: rows.map((row) => row.value) }], {
            x: MARGIN, y: bodyTop, w: CONTENT_W, h: 5.0 - bodyTop,
            barDir: 'bar', chartColors: [T.accent], showValue: true, showLegend: false,
            catAxisLabelColor: T.body, valAxisLabelColor: T.muted, dataLabelColor: T.ink, dataLabelFontSize: 11,
            showTitle: false,
          });
        } else if (s.bullets?.length) {
          addBullets(slide, s.bullets, MARGIN, bodyTop, CONTENT_W);
        }
      } else if (type === 'matrix') {
        const cells = (Array.isArray(s.bullets) ? s.bullets : []).slice(0, 4);
        const gx = 0.25;
        const gy = 0.25;
        const cellW = (CONTENT_W - gx) / 2;
        const rowsN = Math.ceil(cells.length / 2) || 1;
        const cellH = (5.0 - bodyTop - gy * (rowsN - 1)) / rowsN;
        cells.forEach((bullet, index) => {
          const col = index % 2;
          const row = Math.floor(index / 2);
          const x = MARGIN + col * (cellW + gx);
          const y = bodyTop + row * (cellH + gy);
          slide.addShape('roundRect', { x, y, w: cellW, h: cellH, fill: { color: T.surface }, line: { color: T.line, width: 1 }, radius: 0.08 });
          slide.addShape('rect', { x, y, w: 0.07, h: cellH, fill: { color: T.accent }, line: { color: T.accent } });
          slide.addText(String(bullet), { x: x + 0.28, y, w: cellW - 0.45, h: cellH, fontSize: 15, color: T.body, valign: 'middle', fontFace: F.body, margin: 0.04 });
        });
      } else {
        const hasImages = Array.isArray(s.images) && s.images.length > 0;
        const bodyW = hasImages ? 4.0 : CONTENT_W;
        if (s.bullets?.length) addBullets(slide, s.bullets, MARGIN, bodyTop, bodyW);
        if (hasImages) {
          const resolved = [];
          for (const image of s.images.slice(0, 2)) {
            const data = await imageToDataUrl(image?.url);
            if (data?.dataUrl) {
              resolved.push(data);
              resolvedUrls.push(data.dataUrl);
            }
          }
          imageCount += placeImages(slide, resolved, bodyTop);
        }
      }
      if (s.speakerNotes) slide.addNotes(String(s.speakerNotes));
    }

    slideImages.push(resolvedUrls);
  }

  return { slideImages, imageCount };
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
    let sourceMime = 'image/png';

    if (/^data:image\//i.test(trimmed)) {
      const comma = trimmed.indexOf(',');
      if (comma < 0) return null;
      const header = trimmed.slice(5, comma);
      sourceMime = header.split(';')[0] || 'image/png';
      const b64 = trimmed.slice(comma + 1);
      if (!b64) return null;
      bytes = Buffer.from(b64, 'base64');
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) return null;
    } else {
      if (!/^https?:\/\//i.test(trimmed)) return null;
      const parsed = new URL(trimmed);
      if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) return null;
      const response = await withTimeout(fetch(trimmed, {
        headers: { Accept: 'image/*', 'User-Agent': 'Quantora Office Renderer/1.0' },
      }), 8000, 'Image download timed out');
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') || '';
      if (!/^image\//i.test(contentType)) return null;
      sourceMime = contentType.split(';')[0] || 'image/png';
      bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) return null;
    }

    const { dataUrl, width, height } = await resizeImageForEmbed(bytes, sourceMime, 560);
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
    .slice(0, 50) || 'document';
}
