/*
 * Deterministic, app-owned slide-deck rendering (Roadmap: MS Office integration).
 *
 * The generation pipeline asks the model to emit a complete self-contained HTML
 * slide viewer, but weaker/streaming models routinely fall short: they leak a
 * slide-DATA array into chat, use a blocked CDN, truncate, or return a fragment.
 * When that happens the preview blob-renders garbage and shows a broken box.
 *
 * This module removes that dependency for presentations: whatever shape the
 * model produced, we extract the slide CONTENT and render it ourselves with a
 * fixed, inline-styled (no external CDN) 16:9 template that is guaranteed to
 * render in the CSP-safe preview iframe AND to export cleanly (each slide is a
 * <section class="slide"> that office-export reads).
 */

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Does this text already contain a usable, slide-structured HTML document? */
export function hasSlideHtml(html) {
  if (!html || !/<html[\s>]|<!doctype/i.test(html)) return false;
  return /class\s*=\s*["'][^"']*\bslide\b|<section[\s>]/i.test(html);
}

/** Pull the first full ```html fenced document, or null. */
export function extractHtmlDoc(text) {
  if (!text) return null;
  const fenced = text.match(/```html\s*\n([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  if (/<html[\s>]|<!doctype html/i.test(body)) return body.trim();
  return null;
}

/**
 * Extract structured slides from arbitrary model output. Handles, in order:
 *  1. A JSON-ish array of slide objects (what the model leaks most often),
 *     e.g. [{ num, title, desc|subtitle|body, bullets|points:[...] }, ...]
 *  2. Markdown: each `#`/`##` heading starts a slide; `-`/`*`/`1.` become bullets.
 * @returns {Array<{title:string, subtitle?:string, bullets:string[]}>}
 */
export function extractSlides(text) {
  if (!text) return [];
  return extractFromObjectArray(text) || extractFromMarkdown(text) || [];
}

function coerceSlideObject(o) {
  if (!o || typeof o !== 'object') return null;
  const title = clean(o.title || o.heading || o.name || o.header);
  const subtitle = clean(o.subtitle || o.desc || o.description || o.summary || o.body || o.content);
  let bullets = o.bullets || o.points || o.items || o.content_points || o.lines;
  if (typeof bullets === 'string') bullets = bullets.split(/\n|•|;|·/);
  bullets = Array.isArray(bullets) ? bullets.map(clean).filter(Boolean) : [];
  if (!title && !subtitle && !bullets.length) return null;
  return { title: title || 'Slide', subtitle: subtitle && subtitle !== title ? subtitle : '', bullets };
}

// Tolerantly find a [ ... ] array of slide-like objects and parse it, even when
// it is embedded in prose or a JS code fence (`const slides = [ ... ]`).
function extractFromObjectArray(text) {
  const candidates = [];
  const re = /\[\s*\{[\s\S]*?\}\s*,?\s*\]/g; // allow a trailing comma before ]
  let m;
  while ((m = re.exec(text)) && candidates.length < 5) candidates.push(m[0]);
  for (const raw of candidates) {
    const parsed = tryParseLooseArray(raw);
    if (parsed && parsed.length) {
      const slides = parsed.map(coerceSlideObject).filter(Boolean);
      // Only accept if it really looks like slides (has titles/bullets).
      if (slides.length >= 1 && slides.some((s) => s.title !== 'Slide' || s.bullets.length)) return slides;
    }
  }
  return null;
}

function tryParseLooseArray(raw) {
  try { return JSON.parse(raw); } catch { /* fall through */ }
  // Loose JS object literals: quote unquoted keys, normalise quotes, drop trailing commas.
  try {
    const normalised = raw
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(normalised);
  } catch { return null; }
}

function extractFromMarkdown(text) {
  // Strip code fences so we don't parse code as content.
  const prose = text.replace(/```[\s\S]*?```/g, '').trim();
  const lines = prose.split('\n');
  const slides = [];
  let cur = null;
  const push = () => { if (cur && (cur.title || cur.bullets.length)) slides.push(cur); };
  for (const line of lines) {
    const h = line.match(/^\s{0,3}(#{1,3})\s+(.*)$/);
    const b = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (h) { push(); cur = { title: clean(h[2]), subtitle: '', bullets: [] }; }
    else if (b && cur) { cur.bullets.push(clean(b[1])); }
    else if (b && !cur) { cur = { title: 'Overview', subtitle: '', bullets: [clean(b[1])] }; }
  }
  push();
  return slides.length ? slides : null;
}

/** Render slides into a self-contained, CDN-free 16:9 deck (preview + export safe). */
export function renderDeckHtml(slides, { title = 'Presentation' } = {}) {
  const safeSlides = (Array.isArray(slides) ? slides : []).filter(Boolean);
  if (!safeSlides.length) return null;

  const slideMarkup = safeSlides.map((s, i) => {
    const bullets = (s.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join('');
    return `
    <section class="slide" aria-label="Slide ${i + 1}">
      <div class="slide-inner">
        <div class="slide-num">${String(i + 1).padStart(2, '0')} / ${String(safeSlides.length).padStart(2, '0')}</div>
        <h1>${escapeHtml(s.title || `Slide ${i + 1}`)}</h1>
        ${s.subtitle ? `<p class="subtitle">${escapeHtml(s.subtitle)}</p>` : ''}
        ${bullets ? `<ul>${bullets}</ul>` : ''}
        <div class="slide-footer"><span>${escapeHtml(title)}</span></div>
      </div>
    </section>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #0f172a; }
  .deck { display: flex; flex-direction: column; align-items: center; gap: 28px; padding: 32px 16px 64px; }
  .slide { width: 100%; max-width: 960px; aspect-ratio: 16 / 9; background: #ffffff; border-radius: 14px;
           box-shadow: 0 20px 50px rgba(0,0,0,.35); overflow: hidden; position: relative; scroll-snap-align: center; }
  .slide-inner { position: absolute; inset: 0; padding: 56px 64px; display: flex; flex-direction: column; }
  .slide-num { position: absolute; top: 28px; right: 40px; font-size: 13px; letter-spacing: .12em; color: #94a3b8; font-weight: 700; }
  .slide h1 { font-size: clamp(24px, 3.4vw, 40px); line-height: 1.12; color: #0b1220; font-weight: 800; max-width: 88%;
              border-left: 6px solid #f97316; padding-left: 18px; }
  .slide .subtitle { margin-top: 14px; font-size: clamp(14px, 1.7vw, 20px); color: #475569; max-width: 82%; }
  .slide ul { margin-top: 26px; padding-left: 8px; list-style: none; display: flex; flex-direction: column; gap: 12px; }
  .slide li { position: relative; padding-left: 26px; font-size: clamp(13px, 1.55vw, 18px); color: #1f2937; line-height: 1.4; }
  .slide li::before { content: ""; position: absolute; left: 4px; top: .55em; width: 8px; height: 8px; border-radius: 50%; background: #f97316; }
  .slide-footer { margin-top: auto; padding-top: 18px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <main class="deck">${slideMarkup}
  </main>
</body>
</html>`;
}

/**
 * Turn any model response for a presentation into renderable, exportable deck
 * HTML. Uses the model's own HTML when it's genuinely slide-structured;
 * otherwise deterministically rebuilds from extracted slide content.
 * @returns {string|null} deck HTML, or null if no slide content could be found.
 */
export function normalizeDeck(modelText, { title } = {}) {
  // Prefer a deterministic rebuild whenever the model gave us real slide DATA
  // (the common failure: a leaked {num,title,desc} array). This guarantees a
  // renderable, CDN-free, exportable deck regardless of model fidelity.
  const slides = extractSlides(modelText);
  if (slides.length) {
    const built = renderDeckHtml(slides, { title });
    if (built) return built;
  }
  // Otherwise honour a genuine, slide-structured HTML document from the model.
  const html = extractHtmlDoc(modelText);
  if (html && hasSlideHtml(html)) return html;
  return null;
}
