/*
 * Shared deck design system.
 *
 * Content ⟂ design: the model returns a structured slide spec; this module owns
 * how that spec looks. Both renderers consume it — the server-side PPTX compiler
 * (api/generate-office.ts) reads the tokens/classification, and the HTML preview
 * is produced here directly — so "preview before download" stays faithful to the
 * downloaded file by construction instead of drifting from a second hand-built
 * approximation.
 */

/** Consulting-grade palette + type scale. Hex WITHOUT '#': pptxgenjs wants bare
 *  hex; the preview prefixes '#'. */
export const DECK_THEME = {
  color: {
    ink: '0F172A',        // primary heading text
    body: '334155',       // body text
    muted: '64748B',      // secondary / captions
    accent: '4F46E5',     // indigo-600 — bars, rules, chart series
    accentDark: '3730A3',
    accentSoft: 'EEF2FF',
    line: 'E2E8F0',
    bg: 'FFFFFF',
    surface: 'F8FAFC',
    coverBg: '0F172A',
    coverText: 'FFFFFF',
    coverMuted: '94A3B8',
  },
  font: { heading: 'Segoe UI', body: 'Segoe UI' },
  // 16:9 canvas is 10in x 5.625in.
  layout: { w: 10, h: 5.625, margin: 0.6, contentW: 8.8 },
};

const ALLOWED_TYPES = ['cover', 'section', 'bullets', 'data_viz', 'matrix', 'quote'];

/**
 * Resolve a slide's layout type. Honours an explicit `type`, otherwise infers a
 * sensible one from the fields present (first slide → cover, has data → chart,
 * etc.) so an under-specified spec still renders as something deliberate rather
 * than a blank title.
 */
export function classifySlide(slide = {}, index = 0) {
  const raw = String(slide?.type || '').toLowerCase().trim();
  if (ALLOWED_TYPES.includes(raw)) return raw;
  if (index === 0) return 'cover';
  if (Array.isArray(slide?.data) && slide.data.length > 0) return 'data_viz';
  if (typeof slide?.quote === 'string' && slide.quote.trim()) return 'quote';
  if (Array.isArray(slide?.bullets) && slide.bullets.length > 0) return 'bullets';
  return 'section';
}

/** Coerce the model's data rows to {label, value:number}, dropping junk. */
export function normalizeChartData(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map((d) => ({
      label: String(d?.label ?? '').trim(),
      value: Number(d?.value),
    }))
    .filter((d) => d.label && Number.isFinite(d.value));
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const c = (name) => '#' + DECK_THEME.color[name];

/**
 * Render one slide as a 16:9 HTML card that mirrors its PPTX layout.
 * `images` is an array of resolved data URLs (already downscaled).
 */
export function renderPreviewSlide(slide = {}, index = 0, total = 1, images = []) {
  const type = classifySlide(slide, index);
  const shell = (inner, bg = c('bg'), extra = '') =>
    `<section style="position:relative;width:100%;aspect-ratio:16/9;background:${bg};border:1px solid ${c('line')};border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);${extra}">${inner}</section>`;

  const notes = slide.speakerNotes
    ? `<div style="position:absolute;left:0;right:0;bottom:0;padding:6px 14px;background:${c('surface')};border-top:1px solid ${c('line')};font-size:11px;color:${c('muted')};">🎤 ${esc(slide.speakerNotes)}</div>`
    : '';
  const pageNum = `<div style="position:absolute;right:16px;bottom:8px;font-size:11px;color:${c('muted')};">${index + 1} / ${total}</div>`;

  if (type === 'cover') {
    return shell(
      `<div style="padding:8% 9%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;color:${c('coverText')};">
        <div style="width:56px;height:5px;background:${c('accent')};border-radius:3px;margin-bottom:22px;"></div>
        <h1 style="margin:0;font:700 32px/1.15 ${DECK_THEME.font.heading},sans-serif;">${esc(slide.title || 'Presentation')}</h1>
        ${slide.subtitle ? `<p style="margin:14px 0 0;font:400 17px/1.4 ${DECK_THEME.font.body},sans-serif;color:${c('coverMuted')};">${esc(slide.subtitle)}</p>` : ''}
        ${slide.author ? `<p style="margin:26px 0 0;font-size:13px;color:${c('coverMuted')};">${esc(slide.author)}</p>` : ''}
      </div>`,
      c('coverBg'),
    );
  }

  if (type === 'section') {
    return shell(
      `<div style="padding:0 9%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;">
        <div style="font:700 15px/1 ${DECK_THEME.font.heading},sans-serif;color:${c('accent')};letter-spacing:.14em;">SECTION ${String(index + 1).padStart(2, '0')}</div>
        <h2 style="margin:10px 0 0;font:600 30px/1.2 ${DECK_THEME.font.heading},sans-serif;color:${c('ink')};">${esc(slide.title || '')}</h2>
        ${slide.subtitle ? `<p style="margin:12px 0 0;font-size:16px;color:${c('muted')};max-width:70%;">${esc(slide.subtitle)}</p>` : ''}
        <div style="width:64px;height:4px;background:${c('accent')};border-radius:3px;margin-top:22px;"></div>
      </div>`,
      c('accentSoft'),
    );
  }

  if (type === 'quote') {
    return shell(
      `<div style="padding:9%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;">
        <div style="font:700 64px/0.6 Georgia,serif;color:${c('accent')};">&ldquo;</div>
        <blockquote style="margin:6px 0 0;font:600 24px/1.4 Georgia,serif;color:${c('ink')};">${esc(slide.quote || slide.title || '')}</blockquote>
        ${slide.author ? `<p style="margin:20px 0 0;font-size:15px;color:${c('muted')};">— ${esc(slide.author)}</p>` : ''}
      </div>`,
      c('surface'),
    );
  }

  const header = `
    <div style="padding:26px 34px 0;">
      <h2 style="margin:0;font:600 24px/1.25 ${DECK_THEME.font.heading},sans-serif;color:${c('ink')};">${esc(slide.title || 'Slide ' + (index + 1))}</h2>
      ${slide.subtitle ? `<p style="margin:6px 0 0;font-size:15px;color:${c('muted')};">${esc(slide.subtitle)}</p>` : ''}
      <div style="width:44px;height:3px;background:${c('accent')};border-radius:2px;margin-top:12px;"></div>
    </div>`;

  if (type === 'data_viz') {
    const rows = normalizeChartData(slide.data);
    const max = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;
    const bars = rows
      .map(
        (r) => `
        <div style="display:flex;align-items:center;gap:10px;margin:8px 0;">
          <div style="width:26%;font-size:13px;color:${c('body')};text-align:right;">${esc(r.label)}</div>
          <div style="flex:1;background:${c('line')};border-radius:4px;height:16px;">
            <div style="width:${Math.max(3, (r.value / max) * 100)}%;height:100%;background:${c('accent')};border-radius:4px;"></div>
          </div>
          <div style="width:70px;font-size:13px;color:${c('ink')};font-weight:600;">${esc(r.value.toLocaleString())}</div>
        </div>`,
      )
      .join('');
    return shell(`${header}<div style="padding:16px 34px;">${bars || `<p style="color:${c('muted')};">No data.</p>`}</div>${pageNum}${notes}`);
  }

  if (type === 'matrix') {
    const cells = (slide.bullets || [])
      .slice(0, 4)
      .map(
        (b) => `<div style="background:${c('surface')};border:1px solid ${c('line')};border-left:4px solid ${c('accent')};border-radius:8px;padding:14px 16px;font-size:14px;color:${c('body')};">${esc(b)}</div>`,
      )
      .join('');
    return shell(`${header}<div style="padding:16px 34px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">${cells}</div>${pageNum}${notes}`);
  }

  // bullets (default content)
  const bullets = (slide.bullets || [])
    .map((b) => `<li style="margin:7px 0;font-size:15px;line-height:1.4;color:${c('body')};">${esc(b)}</li>`)
    .join('');
  const imgs = (images || [])
    .slice(0, 2)
    .map((src) => `<img src="${src}" style="width:100%;border-radius:6px;box-shadow:0 2px 6px rgba(15,23,42,.12);" />`)
    .join('');
  const hasImg = imgs.length > 0;
  return shell(
    `${header}
     <div style="padding:14px 34px;display:flex;gap:24px;">
       <ul style="margin:0;padding-left:20px;flex:1;">${bullets}</ul>
       ${hasImg ? `<div style="width:38%;display:flex;flex-direction:column;gap:10px;justify-content:center;">${imgs}</div>` : ''}
     </div>${pageNum}${notes}`,
  );
}

/** Full standalone preview document for the whole deck. */
export function buildDeckPreviewHtml(spec = {}, slideImages = []) {
  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  const cards = slides
    .map((s, i) => renderPreviewSlide(s, i, slides.length, slideImages[i] || []))
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
    <body style="margin:0;padding:28px;background:${c('surface')};font-family:${DECK_THEME.font.body},system-ui,sans-serif;">
      <div style="max-width:900px;margin:0 auto;">
        <h1 style="font:700 22px/1.3 ${DECK_THEME.font.heading},sans-serif;color:${c('ink')};margin:0 0 20px;">${esc(spec.title || 'Presentation')}</h1>
        <div style="display:flex;flex-direction:column;gap:22px;">${cards}</div>
      </div>
    </body></html>`;
}
