/*
 * Deck specification — the structured contract between the model and the
 * consulting-grade renderer (Roadmap: MS Office integration).
 *
 * Instead of trusting a model to emit a perfect self-contained HTML deck, we ask
 * it for STRUCTURED CONTENT (a JSON spec: per-slide layout + content + chart
 * data) and let the app own the design. This module parses/normalizes whatever
 * the model returned into a canonical spec the renderer can trust.
 */

export const SLIDE_LAYOUT = Object.freeze({
  COVER: 'cover',
  SECTION: 'section',
  BULLETS: 'bullets',
  TWO_COLUMN: 'two-column',
  STAT: 'stat',
  CHART: 'chart',
  QUOTE: 'quote',
  CLOSE: 'close',
});

const VALID_LAYOUTS = new Set(Object.values(SLIDE_LAYOUT));
const CHART_TYPES = new Set(['bar', 'donut', 'line']);

const str = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

function normalizeChart(chart) {
  if (!chart || typeof chart !== 'object') return null;
  const type = CHART_TYPES.has(chart.type) ? chart.type : 'bar';
  const data = arr(chart.data)
    .map((d) => ({ label: str(d?.label ?? d?.name), value: Number(d?.value ?? d?.y ?? d?.count) }))
    .filter((d) => d.label && Number.isFinite(d.value));
  if (!data.length) return null;
  return { type, data, caption: str(chart.caption) };
}

function normalizeStats(stats) {
  return arr(stats)
    .map((s) => ({ value: str(s?.value ?? s?.number ?? s?.metric), label: str(s?.label ?? s?.caption ?? s?.description) }))
    .filter((s) => s.value)
    .slice(0, 4);
}

/** Coerce one raw slide object into a valid, renderable slide. */
export function normalizeSlide(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const bullets = arr(raw.bullets ?? raw.points ?? raw.items).map(str).filter(Boolean);
  const chart = normalizeChart(raw.chart);
  const stats = normalizeStats(raw.stats ?? raw.metrics);
  const columns = arr(raw.columns).map((c) => ({
    heading: str(c?.heading ?? c?.title),
    bullets: arr(c?.bullets ?? c?.points).map(str).filter(Boolean),
    body: str(c?.body ?? c?.text),
  })).filter((c) => c.heading || c.bullets.length || c.body);

  const title = str(raw.title ?? raw.heading ?? raw.name);
  const subtitle = str(raw.subtitle ?? raw.desc ?? raw.description ?? raw.summary);

  // Choose a layout: honour an explicit valid one, else infer from content.
  let layout = String(raw.layout || '').toLowerCase();
  if (!VALID_LAYOUTS.has(layout)) {
    if (chart) layout = SLIDE_LAYOUT.CHART;
    else if (stats.length) layout = SLIDE_LAYOUT.STAT;
    else if (columns.length >= 2) layout = SLIDE_LAYOUT.TWO_COLUMN;
    else if (str(raw.quote)) layout = SLIDE_LAYOUT.QUOTE;
    else layout = SLIDE_LAYOUT.BULLETS;
  }

  const slide = { layout, title, subtitle, bullets, columns, stats, chart,
    quote: str(raw.quote), attribution: str(raw.attribution ?? raw.author ?? raw.source),
    note: str(raw.note ?? raw.speakerNote ?? raw.notes) };

  // A slide must carry *something* to render.
  if (!slide.title && !slide.subtitle && !bullets.length && !stats.length && !chart && !columns.length && !slide.quote) {
    return null;
  }
  return slide;
}

/** Normalize a raw spec object into { title, subtitle, slides[] }. */
export function normalizeSpec(raw, fallbackTitle = 'Presentation') {
  if (!raw || typeof raw !== 'object') return null;
  const slides = arr(raw.slides ?? raw.deck ?? raw.pages).map(normalizeSlide).filter(Boolean);
  if (!slides.length) return null;
  return {
    title: str(raw.title) || fallbackTitle,
    subtitle: str(raw.subtitle),
    slides,
  };
}

function tryParse(raw) {
  try { return JSON.parse(raw); } catch { /* fall through */ }
  try {
    const normalised = raw
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":') // quote bare keys
      .replace(/'/g, '"')
      .replace(/,(\s*[}\]])/g, '$1');                          // drop trailing commas
    return JSON.parse(normalised);
  } catch { return null; }
}

/**
 * Extract a deck spec from arbitrary model output: a ```json fence, or the first
 * balanced { ... } object that contains a "slides" array.
 * @returns normalized spec or null.
 */
// Scan for top-level balanced { ... } objects (string-aware, so braces inside
// strings don't confuse the depth count). Robust to nested arrays/objects that
// a regex cannot handle.
function balancedObjects(text, limit = 8) {
  const out = [];
  for (let i = 0; i < text.length && out.length < limit; i++) {
    if (text[i] !== '{') continue;
    let depth = 0, inStr = false, q = '';
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) { if (c === q && text[j - 1] !== '\\') inStr = false; continue; }
      if (c === '"' || c === "'") { inStr = true; q = c; }
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { out.push(text.slice(i, j + 1)); i = j; break; } }
    }
  }
  return out;
}

export function parseDeckSpec(text, fallbackTitle = 'Presentation') {
  if (!text) return null;
  const fenced = text.match(/```json\s*\n([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);
  // Only objects that actually look like a deck spec.
  for (const obj of balancedObjects(text)) {
    if (/slides|deck|pages/.test(obj)) candidates.push(obj);
  }
  for (const raw of candidates) {
    const spec = normalizeSpec(tryParse(raw), fallbackTitle);
    if (spec) return spec;
  }
  return null;
}

/** Build a spec from already-extracted simple slides (markdown/data fallback). */
export function specFromSlides(slides, title = 'Presentation') {
  const norm = arr(slides).map((s, i) => normalizeSlide({
    layout: i === 0 ? SLIDE_LAYOUT.COVER : SLIDE_LAYOUT.BULLETS,
    title: s?.title,
    subtitle: s?.subtitle,
    bullets: s?.bullets,
  })).filter(Boolean);
  if (!norm.length) return null;
  return { title, subtitle: '', slides: norm };
}
