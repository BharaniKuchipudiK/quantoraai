/*
 * Consulting-grade deck renderer (Roadmap: MS Office integration).
 *
 * Turns a normalized deck spec into ONE self-contained, CDN-free, export-safe
 * HTML deck with a real design system, a varied layout library, and inline-SVG
 * data visualisation. The app owns the design, so quality no longer depends on
 * the model emitting good HTML — it just supplies structured content.
 *
 * Every slide is a <section class="slide"> (16:9) so office-export reads it and
 * PDF export captures it pixel-for-pixel.
 */

import { escapeHtml, mdInline, extractHtmlDoc, hasSlideHtml, looksLikeClarifyingReply, extractSlides } from './deck-builder.js';
import { SLIDE_LAYOUT, parseDeckSpec, specFromSlides, normalizeSpec } from './deck-spec.js';

const CHART_COLORS = ['#f97316', '#0ea5e9', '#22c55e', '#a855f7', '#eab308', '#ef4444'];

/* ── inline SVG charts ──────────────────────────────────────────────────── */
function barChart(data) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const W = 720, H = 300, pad = 40, gap = 24;
  const bw = (W - pad * 2 - gap * (data.length - 1)) / data.length;
  const bars = data.map((d, i) => {
    const h = Math.max(2, ((H - pad * 2) * d.value) / max);
    const x = pad + i * (bw + gap);
    const y = H - pad - h;
    const c = CHART_COLORS[i % CHART_COLORS.length];
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${c}"/>
      <text x="${(x + bw / 2).toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle" class="cv">${escapeHtml(String(d.value))}</text>
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - pad + 22}" text-anchor="middle" class="cl">${escapeHtml(d.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" class="axis"/>${bars}</svg>`;
}

function donutChart(data) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = 150, cy = 150, r = 110, sw = 46, C = 2 * Math.PI * r;
  let offset = 0;
  const segs = data.map((d, i) => {
    const frac = d.value / total;
    const dash = `${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CHART_COLORS[i % CHART_COLORS.length]}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset * C).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += frac;
    return seg;
  }).join('');
  const legend = data.map((d, i) =>
    `<div class="lg"><span class="sw" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>${escapeHtml(d.label)} <b>${escapeHtml(String(d.value))}</b></div>`).join('');
  return `<div class="donut-wrap"><svg viewBox="0 0 300 300" class="chart donut">${segs}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="dt">${escapeHtml(String(total))}</text>
    <text x="${cx}" y="${cy + 22}" text-anchor="middle" class="dl">Total</text></svg><div class="legend">${legend}</div></div>`;
}

function lineChart(data) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const W = 720, H = 300, pad = 44;
  const step = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((d, i) => {
    const x = pad + i * step;
    const y = H - pad - ((H - pad * 2) * d.value) / max;
    return { x, y, d };
  });
  const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dots = pts.map((p) =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="#f97316"/>
     <text x="${p.x.toFixed(1)}" y="${(p.y - 14).toFixed(1)}" text-anchor="middle" class="cv">${escapeHtml(String(p.d.value))}</text>
     <text x="${p.x.toFixed(1)}" y="${H - pad + 22}" text-anchor="middle" class="cl">${escapeHtml(p.d.label)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" class="axis"/>
    <polyline points="${poly}" fill="none" stroke="#f97316" stroke-width="3"/>${dots}</svg>`;
}

function renderChart(chart) {
  if (!chart) return '';
  const svg = chart.type === 'donut' ? donutChart(chart.data)
    : chart.type === 'line' ? lineChart(chart.data)
    : barChart(chart.data);
  return `<div class="chartbox">${svg}${chart.caption ? `<p class="cap">${escapeHtml(chart.caption)}</p>` : ''}</div>`;
}

/* ── slide layouts ──────────────────────────────────────────────────────── */
const bulletList = (bullets) => bullets.length
  ? `<ul>${bullets.map((b) => `<li>${mdInline(b)}</li>`).join('')}</ul>` : '';

function renderSlide(s, i, total, deckTitle) {
  const num = `${String(i + 1).padStart(2, '0')}`;
  const kicker = s.subtitle ? `<div class="kicker">${mdInline(s.subtitle)}</div>` : '';
  const footer = `<div class="foot"><span>${escapeHtml(deckTitle)}</span><span>${num} / ${String(total).padStart(2, '0')}</span></div>`;

  let body = '';
  let cls = 'slide';
  switch (s.layout) {
    case SLIDE_LAYOUT.COVER:
      cls += ' dark cover';
      body = `<div class="cover-in"><div class="brandbar"></div>
        <h1 class="cover-h">${mdInline(s.title || deckTitle)}</h1>
        ${s.subtitle ? `<p class="cover-sub">${mdInline(s.subtitle)}</p>` : ''}
        ${bulletList(s.bullets)}</div>`;
      return `<section class="${cls}" aria-label="Slide ${i + 1}"><div class="slide-inner">${body}</div></section>`;
    case SLIDE_LAYOUT.SECTION:
      cls += ' dark section';
      body = `<div class="sec-in"><div class="sec-num">${num}</div>
        <h1 class="sec-h">${mdInline(s.title)}</h1>
        ${s.subtitle ? `<p class="sec-sub">${mdInline(s.subtitle)}</p>` : ''}</div>`;
      return `<section class="${cls}" aria-label="Slide ${i + 1}"><div class="slide-inner">${body}</div></section>`;
    case SLIDE_LAYOUT.STAT:
      body = `<h2>${mdInline(s.title)}</h2>${kicker}
        <div class="stats">${s.stats.map((st) => `<div class="stat"><div class="stat-v">${mdInline(st.value)}</div><div class="stat-l">${mdInline(st.label)}</div></div>`).join('')}</div>
        ${bulletList(s.bullets)}`;
      break;
    case SLIDE_LAYOUT.CHART:
      body = `<h2>${mdInline(s.title)}</h2>${kicker}<div class="chart-row"><div class="chart-col">${renderChart(s.chart)}</div>${s.bullets.length ? `<div class="chart-notes">${bulletList(s.bullets)}</div>` : ''}</div>`;
      break;
    case SLIDE_LAYOUT.TWO_COLUMN: {
      const cols = (s.columns.length ? s.columns : [{ heading: '', bullets: s.bullets.slice(0, Math.ceil(s.bullets.length / 2)) }, { heading: '', bullets: s.bullets.slice(Math.ceil(s.bullets.length / 2)) }]);
      body = `<h2>${mdInline(s.title)}</h2>${kicker}<div class="cols">${cols.map((c) => `<div class="col">${c.heading ? `<h3>${mdInline(c.heading)}</h3>` : ''}${c.body ? `<p>${mdInline(c.body)}</p>` : ''}${bulletList(c.bullets || [])}</div>`).join('')}</div>`;
      break;
    }
    case SLIDE_LAYOUT.QUOTE:
      cls += ' dark quote';
      body = `<div class="quote-in"><div class="qmark">&ldquo;</div><blockquote>${mdInline(s.quote || s.title)}</blockquote>${s.attribution ? `<div class="attr">— ${mdInline(s.attribution)}</div>` : ''}</div>`;
      return `<section class="${cls}" aria-label="Slide ${i + 1}"><div class="slide-inner">${body}</div></section>`;
    case SLIDE_LAYOUT.CLOSE:
      cls += ' dark close';
      body = `<div class="cover-in"><div class="brandbar"></div><h1 class="cover-h">${mdInline(s.title || 'Thank you')}</h1>${s.subtitle ? `<p class="cover-sub">${mdInline(s.subtitle)}</p>` : ''}${bulletList(s.bullets)}</div>`;
      return `<section class="${cls}" aria-label="Slide ${i + 1}"><div class="slide-inner">${body}</div></section>`;
    default: // BULLETS
      body = `<h2>${mdInline(s.title)}</h2>${kicker}${bulletList(s.bullets)}`;
  }
  return `<section class="${cls}" aria-label="Slide ${i + 1}"><div class="slide-inner">${body}${footer}</div></section>`;
}

/**
 * Single entry point: turn any model response for a presentation into a
 * consulting-grade, export-safe HTML deck — or null if there is no deck to build.
 * Priority: (1) the model's own self-contained slide HTML, (2) a structured deck
 * spec → consulting renderer, (3) markdown/data slides → consulting renderer.
 * A "let me outline this / which style?" reply yields null (never scraped).
 */
export function buildDeck(modelText, { title = 'Presentation' } = {}) {
  const html = extractHtmlDoc(modelText);
  if (html && hasSlideHtml(html)) return html;
  if (looksLikeClarifyingReply(modelText)) return null;

  const spec = parseDeckSpec(modelText, title);
  if (spec) {
    const out = renderConsultingDeck(spec);
    if (out) return out;
  }
  const fallbackSpec = specFromSlides(extractSlides(modelText), title);
  if (fallbackSpec) {
    const out = renderConsultingDeck(fallbackSpec);
    if (out) return out;
  }
  return null;
}

/** Render a deck spec into a full self-contained consulting deck. */
export function renderConsultingDeck(rawSpec) {
  // Normalize defensively so a partial/hand-built spec can't throw (every slide
  // gets array fields + a valid layout).
  const spec = normalizeSpec(rawSpec, rawSpec?.title);
  if (!spec || !spec.slides.length) return null;
  const deckTitle = spec.title || 'Presentation';
  const slides = spec.slides.map((s, i) => renderSlide(s, i, spec.slides.length, deckTitle)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(deckTitle)}</title>
<style>
  :root{
    --navy:#0b1f38; --navy2:#123253; --ink:#0f172a; --slate:#475569; --muted:#8aa0b6;
    --line:#e6ebf1; --accent:#f97316; --paper:#ffffff; --paper2:#f7f9fc;
    --sans:"Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);background:#0a1626;color:var(--ink)}
  .deck{display:flex;flex-direction:column;align-items:center;gap:30px;padding:34px 16px 72px}
  .slide{width:100%;max-width:1000px;aspect-ratio:16/9;background:var(--paper);border-radius:16px;
    overflow:hidden;position:relative;box-shadow:0 24px 60px rgba(2,8,20,.45);scroll-snap-align:center}
  .slide.dark{background:linear-gradient(135deg,var(--navy) 0%,var(--navy2) 100%);color:#fff}
  .slide-inner{position:absolute;inset:0;padding:clamp(28px,5%,64px);display:flex;flex-direction:column;
    animation:rise .5s cubic-bezier(.2,.7,.2,1) both}
  @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}

  h2{font-size:clamp(22px,3.2vw,38px);font-weight:800;color:var(--ink);line-height:1.1;
    padding-left:18px;border-left:6px solid var(--accent);max-width:90%}
  .kicker{margin:14px 0 6px;color:var(--accent);font-weight:700;font-size:13px;letter-spacing:.14em;text-transform:uppercase}
  ul{margin-top:22px;list-style:none;display:flex;flex-direction:column;gap:13px}
  li{position:relative;padding-left:28px;font-size:clamp(13px,1.5vw,18px);color:#243244;line-height:1.45}
  li::before{content:"";position:absolute;left:2px;top:.5em;width:9px;height:9px;border-radius:50%;
    background:var(--accent);box-shadow:0 0 0 4px rgba(249,115,22,.15)}
  .foot{margin-top:auto;padding-top:16px;display:flex;justify-content:space-between;font-size:12px;
    color:var(--muted);border-top:1px solid var(--line);letter-spacing:.04em}

  /* cover / close */
  .cover-in,.sec-in,.quote-in{position:absolute;inset:0;padding:clamp(40px,7%,84px);display:flex;flex-direction:column;justify-content:center}
  .brandbar{width:72px;height:6px;background:var(--accent);border-radius:3px;margin-bottom:26px}
  .cover-h{font-size:clamp(30px,5.2vw,60px);font-weight:800;line-height:1.05;letter-spacing:-.01em;max-width:15ch}
  .cover-sub{margin-top:20px;font-size:clamp(15px,2vw,22px);color:#cfe0f0;max-width:46ch;line-height:1.5}
  .cover .foot,.close .foot{display:none}
  .cover ul,.close ul{margin-top:26px}
  .cover li,.close li{color:#dbe7f3}.cover li::before,.close li::before{box-shadow:none}

  /* section divider */
  .sec-num{font-size:clamp(48px,9vw,120px);font-weight:800;color:rgba(249,115,22,.35);line-height:1}
  .sec-h{font-size:clamp(28px,4.6vw,52px);font-weight:800;margin-top:6px;max-width:16ch}
  .sec-sub{margin-top:16px;color:#cfe0f0;font-size:clamp(14px,1.8vw,20px);max-width:48ch}

  /* stats */
  .stats{margin-top:30px;display:flex;gap:clamp(16px,4%,52px);flex-wrap:wrap}
  .stat-v{font-size:clamp(34px,6vw,68px);font-weight:800;color:var(--accent);line-height:1}
  .stat-l{margin-top:8px;color:var(--slate);font-size:clamp(12px,1.3vw,16px);max-width:22ch}

  /* two column */
  .cols{margin-top:26px;display:grid;grid-template-columns:1fr 1fr;gap:clamp(20px,5%,54px)}
  .col h3{font-size:clamp(15px,1.7vw,20px);color:var(--navy);font-weight:700;margin-bottom:6px}
  .col p{color:#243244;font-size:clamp(13px,1.4vw,17px);line-height:1.5}
  .col ul{margin-top:10px}

  /* chart */
  .chart-row{margin-top:22px;display:grid;grid-template-columns:1.4fr 1fr;gap:32px;align-items:center}
  .chart-row .chart-notes ul{margin-top:0}
  .chartbox{width:100%}
  .chart{width:100%;height:auto}
  .chart .axis{stroke:var(--line);stroke-width:2}
  .chart .cv{fill:var(--ink);font:700 15px var(--sans)}
  .chart .cl{fill:var(--slate);font:600 13px var(--sans)}
  .donut-wrap{display:flex;align-items:center;gap:28px;flex-wrap:wrap}
  .donut{max-width:280px}
  .donut .dt{fill:var(--ink);font:800 34px var(--sans)}.donut .dl{fill:var(--muted);font:600 13px var(--sans)}
  .legend{display:flex;flex-direction:column;gap:10px}
  .lg{display:flex;align-items:center;gap:10px;font-size:15px;color:#243244}
  .lg .sw{width:14px;height:14px;border-radius:4px;display:inline-block}
  .cap{margin-top:12px;color:var(--muted);font-size:13px;font-style:italic}

  /* quote */
  .qmark{font-size:120px;line-height:.6;color:rgba(249,115,22,.6);font-family:Georgia,serif}
  blockquote{font-size:clamp(22px,3.4vw,40px);font-weight:600;line-height:1.3;max-width:22ch;margin-top:6px}
  .attr{margin-top:22px;color:#cfe0f0;font-size:clamp(14px,1.6vw,18px);font-weight:600}
</style>
</head>
<body>
  <main class="deck">
${slides}
  </main>
</body>
</html>`;
}
