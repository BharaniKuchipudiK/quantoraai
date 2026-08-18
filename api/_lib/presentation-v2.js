/*
 * Quantora Presentation Composition Engine V2
 *
 * The AI owns communication intent + evidence. This module owns deterministic
 * geometry, hierarchy and Office-native rendering. The same normalized semantic
 * spec drives both PPTX composition and browser preview so fidelity does not
 * depend on reconstructing a presentation from finished HTML.
 */

import { PRESENTATION_CANVAS } from './presentation-layout.js';

export const PRESENTATION_V2_VERSION = 2;

export const PRESENTATION_V2_TYPES = Object.freeze([
  'cover',
  'section',
  'executive_summary',
  'kpi_strip',
  'timeline',
  'comparison',
  'status_dashboard',
  'roadmap',
  'risk_matrix',
  'financial_case',
  'chart_insight',
  'framework',
  'two_column',
  'evidence',
  'bullets',
  'quote',
  'appendix',
]);

const TYPE_SET = new Set(PRESENTATION_V2_TYPES);
const BODY_TYPES = new Set(PRESENTATION_V2_TYPES.filter((type) => !['cover', 'section', 'quote', 'appendix'].includes(type)));
const STATUS = new Set(['green', 'amber', 'red', 'neutral']);
const ARCHETYPES = new Set(['qbr', 'business_case', 'project_status', 'executive_briefing', 'academic_research', 'strategy', 'proposal', 'general']);
const STANDARDS = new Set(['executive', 'consulting', 'operational', 'technical', 'academic', 'analytical', 'general']);
const GENERIC_HEADLINES = new Set(['overview', 'summary', 'executive summary', 'risks', 'risk', 'timeline', 'roadmap', 'status', 'project status', 'financials', 'recommendation', 'next steps', 'key findings', 'findings']);

export const PRESENTATION_V2_SCHEMA = `
{
  "version": 2,
  "title": "Main deck title",
  "archetype": "qbr | business_case | project_status | executive_briefing | academic_research | strategy | proposal | general",
  "audience": "Who will consume the deck and their seniority/decision authority",
  "purpose": "What this communication must accomplish",
  "decisionAsk": "Explicit decision/action requested, when applicable",
  "period": "Quarter / week / date range, when applicable",
  "communicationStandard": "executive | consulting | operational | technical | academic | analytical | general",
  "sourceNotes": ["Authoritative source or evidence boundary"],
  "slides": [
    {
      "type": "cover | section | executive_summary | kpi_strip | timeline | comparison | status_dashboard | roadmap | risk_matrix | financial_case | chart_insight | framework | two_column | evidence | bullets | quote | appendix",
      "title": "Takeaway headline, not merely a topic label",
      "subtitle": "Optional context line",
      "kicker": "Optional section/category label",
      "insight": "Single governing implication or management takeaway",
      "recommendation": "Recommended action, when relevant",
      "source": "Source / evidence note for this slide",
      "speakerNotes": "Presenter narrative",
      "bullets": ["Concise evidence-backed point"],
      "kpis": [{"label":"Availability","value":"99.1%","delta":"-0.7pp vs target","status":"amber","note":"Q3 actual"}],
      "data": [{"label":"Q1","value":98.8}],
      "chartType": "bar | line | column",
      "timeline": [{"date":"Apr","label":"Design approved","detail":"Architecture Board sign-off","status":"green"}],
      "columns": [{"heading":"Delivered","bullets":["Outcome 1"]}],
      "options": [{"name":"Option A","summary":"Short description","pros":["Benefit"],"cons":["Trade-off"],"score":"High","recommended":true}],
      "statuses": [{"label":"Schedule","status":"amber","metric":"2 weeks","detail":"Critical path impacted"}],
      "risks": [{"risk":"Vendor dependency","likelihood":4,"impact":5,"mitigation":"Dual-track integration","owner":"PMO","status":"amber"}],
      "actions": [{"title":"Complete resilience test","owner":"Platform","timing":"Next 30 days","status":"green","detail":"Close recovery evidence gap"}],
      "financials": [{"label":"Investment","value":"$2.4M","note":"FY27 request","status":"neutral"}],
      "framework": [{"heading":"Technology","detail":"Platform resilience and observability","metric":"4 workstreams","status":"neutral"}],
      "images": [{"url":"https://...","caption":"Figure caption","altText":"Accessible description"}],
      "quote": "Quote text",
      "author": "Attribution"
    }
  ]
}`;

export const PRESENTATION_V2_DIRECTIVE = `PRESENTATION COMPOSITION ENGINE V2
You are in the generation phase AFTER the user briefing. Produce raw JSON only and follow the injected schema exactly.

COMMUNICATION JUDGMENT
- Design the deck for the approved presenter, audience, purpose, cadence and evidence basis. Do not treat “professional” as a visual style flag.
- Write takeaway headlines. A reader should understand the storyline by reading slide titles in sequence.
- Use different semantic compositions only when they improve comprehension; do not repeat the same generic bullet/card layout across the deck.
- Use executive_summary for a decision-oriented opening; status_dashboard for delivery truth; timeline for sequence; comparison for alternatives; roadmap for action; risk_matrix for risk prioritization; financial_case for economics; chart_insight for numeric evidence + implication; framework for operating/architecture models; evidence for source-led analysis.
- For a CIO/business case: emphasize decision, strategic fit, value/economics, options/trade-offs, risks, recommendation and explicit ask.
- For a QBR: emphasize outcomes vs commitments, KPI trends, commercial/delivery health, risks/decisions and next-quarter priorities.
- For weekly project status: emphasize RAG health, milestone movement, RAID/dependencies, escalations/decisions and next-week focus. Avoid decorative filler.
- For academic/research: distinguish research question, methodology/evidence, findings, interpretation, limitations and sources. Avoid executive sales language.

VISUAL EDITING STANDARD
- Design for executive scanability: one dominant message per slide, a clear visual hierarchy, and deliberate whitespace.
- Avoid "box soup". Do not turn every point into an equal-weight rounded card; use rules, bands, sequence, contrast and open space to establish hierarchy.
- Roadmaps must read as a connected progression of stages/waves, not a row of unrelated cards.
- Comparisons should make the recommended option visually obvious without making every option equally loud.
- Use color sparingly: neutral structure first, one primary accent, and semantic RAG colors only when they carry meaning.
- Prefer short labels, large evidence, thin separators and a single governing implication over dense decorative chrome.

EVIDENCE DISCIPLINE
- Never invent quantitative facts, KPIs, financials, dates, research findings or citations. Use only values supplied in the approved context or attributable source material.
- If evidence is missing, state the gap in text rather than fabricating precision. Do not create synthetic numeric chart data merely to make a slide visual.
- Put source/evidence notes on slides that depend on externally supplied numbers or research.

DENSITY + EDITABILITY
- Prefer 3–5 meaningful items per visual region. Keep body copy concise enough for a 16:9 slide.
- Use Office-native text, charts, tables and shapes. Images are supporting evidence, not a substitute for structure.
- For decks of 7+ slides use at least three distinct body composition types unless the artifact archetype genuinely requires a repeated operational format.
- No more than two consecutive generic bullets slides.
- For decision-oriented decks, land an explicit recommendation / decision / action before the close.`;

export const PRESENTATION_THEME = Object.freeze({
  color: {
    navy: '102438',
    ink: '172433',
    body: '3B4652',
    muted: '6B7582',
    line: 'DCE2E8',
    surface: 'F7F9FB',
    surface2: 'EEF2F6',
    white: 'FFFFFF',
    accent: '1F5AA6',
    accentDark: '183B63',
    teal: '0E6F68',
    green: '197443',
    amber: 'A96013',
    red: 'B13A3A',
    softGreen: 'EDF7F1',
    softAmber: 'FBF3E8',
    softRed: 'FBEDEE',
    softBlue: 'F1F5FA',
  },
  font: { heading: 'Aptos Display', body: 'Aptos' },
  layout: { w: PRESENTATION_CANVAS.w, h: PRESENTATION_CANVAS.h, marginX: 0.72, top: 0.5, bottom: 0.34 },
});

const C = PRESENTATION_THEME.color;
const F = PRESENTATION_THEME.font;
const L = PRESENTATION_THEME.layout;

function cleanString(value, max = 5000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function cleanArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanStatus(value) {
  const status = cleanString(value, 20).toLowerCase();
  return STATUS.has(status) ? status : 'neutral';
}

function cleanImage(image) {
  if (!image || typeof image !== 'object') return null;
  const url = cleanString(image.url, 2_000_000);
  if (!url || (!/^https:\/\//i.test(url) && !/^data:image\//i.test(url))) return null;
  return {
    url,
    caption: cleanString(image.caption || image.altText, 500),
    altText: cleanString(image.altText || image.caption, 500),
  };
}

function normalizeKpis(value) {
  return cleanArray(value).slice(0, 5).map((item) => ({
    label: cleanString(item?.label, 80),
    value: cleanString(item?.value, 80),
    delta: cleanString(item?.delta, 100),
    status: cleanStatus(item?.status),
    note: cleanString(item?.note, 120),
  })).filter((item) => item.label && item.value);
}

function normalizeData(value) {
  return cleanArray(value).slice(0, 16).map((item) => ({
    label: cleanString(item?.label, 100),
    value: Number(item?.value),
  })).filter((item) => item.label && Number.isFinite(item.value));
}

function normalizeTimeline(value) {
  return cleanArray(value).slice(0, 6).map((item) => ({
    date: cleanString(item?.date, 40),
    label: cleanString(item?.label, 110),
    detail: cleanString(item?.detail, 220),
    status: cleanStatus(item?.status),
  })).filter((item) => item.label);
}

function normalizeColumns(value) {
  return cleanArray(value).slice(0, 3).map((item) => ({
    heading: cleanString(item?.heading, 100),
    bullets: cleanArray(item?.bullets).slice(0, 5).map((b) => cleanString(b, 220)).filter(Boolean),
  })).filter((item) => item.heading || item.bullets.length);
}

function normalizeOptions(value) {
  return cleanArray(value).slice(0, 3).map((item) => ({
    name: cleanString(item?.name, 80),
    summary: cleanString(item?.summary, 180),
    pros: cleanArray(item?.pros).slice(0, 4).map((v) => cleanString(v, 160)).filter(Boolean),
    cons: cleanArray(item?.cons).slice(0, 4).map((v) => cleanString(v, 160)).filter(Boolean),
    score: cleanString(item?.score, 60),
    recommended: item?.recommended === true,
  })).filter((item) => item.name);
}
function normalizeStatuses(value) {
  return cleanArray(value).slice(0, 6).map((item) => ({
    label: cleanString(item?.label, 90),
    status: cleanStatus(item?.status),
    metric: cleanString(item?.metric, 80),
    detail: cleanString(item?.detail, 180),
  })).filter((item) => item.label);
}

function normalizeRisks(value) {
  return cleanArray(value).slice(0, 8).map((item) => ({
    risk: cleanString(item?.risk, 140),
    likelihood: Math.max(1, Math.min(5, Math.round(Number(item?.likelihood) || 1))),
    impact: Math.max(1, Math.min(5, Math.round(Number(item?.impact) || 1))),
    mitigation: cleanString(item?.mitigation, 220),
    owner: cleanString(item?.owner, 80),
    status: cleanStatus(item?.status),
  })).filter((item) => item.risk);
}

function normalizeActions(value) {
  return cleanArray(value).slice(0, 6).map((item) => ({
    title: cleanString(item?.title, 120),
    owner: cleanString(item?.owner, 80),
    timing: cleanString(item?.timing, 80),
    status: cleanStatus(item?.status),
    detail: cleanString(item?.detail, 180),
  })).filter((item) => item.title);
}

function normalizeFinancials(value) {
  return cleanArray(value).slice(0, 5).map((item) => ({
    label: cleanString(item?.label, 100),
    value: cleanString(item?.value, 100),
    note: cleanString(item?.note, 120),
    status: cleanStatus(item?.status),
  })).filter((item) => item.label && item.value);
}

function normalizeFramework(value) {
  return cleanArray(value).slice(0, 6).map((item) => ({
    heading: cleanString(item?.heading, 90),
    detail: cleanString(item?.detail, 220),
    metric: cleanString(item?.metric, 80),
    status: cleanStatus(item?.status),
  })).filter((item) => item.heading);
}

export function classifyPresentationSlide(slide = {}, index = 0) {
  const raw = cleanString(slide?.type, 40).toLowerCase().replace(/\s+/g, '_');
  if (TYPE_SET.has(raw)) return raw;
  if (raw === 'data_viz') return 'chart_insight';
  if (raw === 'matrix') return 'framework';
  if (index === 0) return 'cover';
  if (cleanArray(slide?.risks).length) return 'risk_matrix';
  if (cleanArray(slide?.actions).length) return 'roadmap';
  if (cleanArray(slide?.statuses).length) return 'status_dashboard';
  if (cleanArray(slide?.options).length) return 'comparison';
  if (cleanArray(slide?.timeline).length) return 'timeline';
  if (cleanArray(slide?.financials).length) return 'financial_case';
  if (cleanArray(slide?.kpis).length >= 3) return 'kpi_strip';
  if (cleanArray(slide?.data).length) return 'chart_insight';
  if (cleanArray(slide?.framework).length) return 'framework';
  if (cleanArray(slide?.columns).length >= 2) return 'two_column';
  if (cleanString(slide?.quote)) return 'quote';
  return 'bullets';
}

export function normalizePresentationSpec(input = {}) {
  const rawSlides = cleanArray(input.slides).slice(0, 40);
  const slides = rawSlides.map((raw, index) => {
    const slide = raw && typeof raw === 'object' ? raw : {};
    const type = classifyPresentationSlide(slide, index);
    const images = cleanArray(slide.images).map(cleanImage).filter(Boolean).slice(0, 2);
    const chartType = ['bar', 'line', 'column'].includes(cleanString(slide.chartType, 20).toLowerCase())
      ? cleanString(slide.chartType, 20).toLowerCase()
      : 'bar';
    return {
      type,
      title: cleanString(slide.title, 220) || (type === 'cover' ? cleanString(input.title, 220) || 'Presentation' : `Slide ${index + 1}`),
      subtitle: cleanString(slide.subtitle, 320),
      kicker: cleanString(slide.kicker, 80),
      insight: cleanString(slide.insight, 420),
      recommendation: cleanString(slide.recommendation, 360),
      source: cleanString(slide.source, 500),
      speakerNotes: cleanString(slide.speakerNotes, 5000),
      bullets: cleanArray(slide.bullets).slice(0, 7).map((b) => cleanString(b, 240)).filter(Boolean),
      kpis: normalizeKpis(slide.kpis),
      data: normalizeData(slide.data),
      chartType,
      timeline: normalizeTimeline(slide.timeline),
      columns: normalizeColumns(slide.columns),
      options: normalizeOptions(slide.options),
      statuses: normalizeStatuses(slide.statuses),
      risks: normalizeRisks(slide.risks),
      actions: normalizeActions(slide.actions),
      financials: normalizeFinancials(slide.financials),
      framework: normalizeFramework(slide.framework),
      ...(images.length ? { images } : {}),
      quote: cleanString(slide.quote, 1200),
      author: cleanString(slide.author, 180),
    };
  });

  const archetypeRaw = cleanString(input.archetype, 40).toLowerCase().replace(/\s+/g, '_');
  const standardRaw = cleanString(input.communicationStandard, 40).toLowerCase();
  return {
    version: PRESENTATION_V2_VERSION,
    title: cleanString(input.title, 220) || slides[0]?.title || 'Presentation',
    archetype: ARCHETYPES.has(archetypeRaw) ? archetypeRaw : 'general',
    audience: cleanString(input.audience, 360),
    purpose: cleanString(input.purpose, 480),
    decisionAsk: cleanString(input.decisionAsk, 360),
    period: cleanString(input.period, 120),
    communicationStandard: STANDARDS.has(standardRaw) ? standardRaw : 'general',
    sourceNotes: cleanArray(input.sourceNotes).slice(0, 12).map((v) => cleanString(v, 400)).filter(Boolean),
    slides,
  };
}

function slideHasContent(slide) {
  return Boolean(
    slide.title || slide.subtitle || slide.insight || slide.recommendation || slide.quote ||
    slide.bullets.length || slide.kpis.length || slide.data.length || slide.timeline.length ||
    slide.columns.length || slide.options.length || slide.statuses.length || slide.risks.length ||
    slide.actions.length || slide.financials.length || slide.framework.length || slide.images?.length,
  );
}

function requireSemanticPayload(slide, index, issues) {
  const number = index + 1;
  const checks = {
    executive_summary: () => slide.kpis.length || slide.bullets.length || slide.insight,
    kpi_strip: () => slide.kpis.length >= 2,
    timeline: () => slide.timeline.length >= 2,
    comparison: () => slide.options.length >= 2,
    status_dashboard: () => slide.statuses.length >= 2,
    roadmap: () => slide.actions.length >= 2,
    risk_matrix: () => slide.risks.length >= 2,
    financial_case: () => slide.financials.length >= 2 || slide.data.length >= 2,
    chart_insight: () => slide.data.length >= 2,
    framework: () => slide.framework.length >= 2 || slide.bullets.length >= 2,
    two_column: () => slide.columns.length >= 2,
    evidence: () => Boolean(slide.images?.length || slide.data.length || slide.bullets.length),
  };
  const check = checks[slide.type];
  if (check && !check()) issues.push(`Slide ${number} (${slide.type}) is missing the structured evidence required by that composition.`);
}

export function validatePresentationSpec(input = {}) {
  const spec = normalizePresentationSpec(input);
  const issues = [];
  const warnings = [];

  if (!spec.slides.length) issues.push('Presentation must contain at least one slide.');
  if (!spec.slides.some(slideHasContent)) issues.push('Presentation contains no meaningful content.');
  if (spec.slides.length && spec.slides[0].type !== 'cover') warnings.push('The first slide is not a cover composition.');
  if (cleanArray(input.slides).length > 40) warnings.push('Deck was capped at 40 slides for reliable generation.');

  spec.slides.forEach((slide, index) => {
    requireSemanticPayload(slide, index, issues);
    const title = slide.title.toLowerCase().replace(/[:–—-].*$/, '').trim();
    if (index > 0 && BODY_TYPES.has(slide.type) && GENERIC_HEADLINES.has(title) && !slide.insight) {
      warnings.push(`Slide ${index + 1} uses a topic-only headline (“${slide.title}”). Prefer a takeaway headline.`);
    }
  });

  let repeated = 1;
  for (let i = 1; i < spec.slides.length; i += 1) {
    if (spec.slides[i].type === spec.slides[i - 1].type && BODY_TYPES.has(spec.slides[i].type)) repeated += 1;
    else repeated = 1;
    if (repeated > 2 && !['status_dashboard'].includes(spec.slides[i].type)) {
      issues.push(`Slides ${i - 1}–${i + 1} repeat the same ${spec.slides[i].type} composition. Use a more purposeful visual grammar.`);
      break;
    }
  }

  if (spec.slides.length >= 7) {
    const bodyTypes = new Set(spec.slides.map((slide) => slide.type).filter((type) => BODY_TYPES.has(type)));
    if (bodyTypes.size < 3 && spec.archetype !== 'project_status') {
      issues.push('Professional decks of seven or more slides must use at least three distinct body composition types.');
    }
  }

  const types = new Set(spec.slides.map((slide) => slide.type));
  if (spec.archetype === 'business_case' && spec.slides.length >= 5) {
    if (!types.has('executive_summary')) issues.push('Business case requires an executive_summary composition.');
    if (!types.has('comparison') && !types.has('financial_case')) issues.push('Business case requires an options comparison or financial/value case.');
    if (!types.has('roadmap') && !spec.slides.some((slide) => slide.recommendation)) warnings.push('Business case should land a recommendation/action path.');
  }
  if (spec.archetype === 'qbr' && spec.slides.length >= 5) {
    if (!types.has('executive_summary') && !types.has('status_dashboard')) issues.push('QBR requires an executive summary or status dashboard.');
    if (!types.has('chart_insight') && !types.has('kpi_strip')) issues.push('QBR requires KPI/trend evidence, not narrative-only slides.');
  }
  if (spec.archetype === 'project_status' && spec.slides.length >= 4) {
    if (!types.has('status_dashboard')) issues.push('Project status deck requires a status_dashboard composition.');
    if (!types.has('roadmap') && !types.has('timeline') && !types.has('risk_matrix')) warnings.push('Project status should show next actions, milestone movement, or prioritized risks.');
  }
  if (['business_case', 'executive_briefing'].includes(spec.archetype) && !spec.decisionAsk && !spec.slides.some((slide) => slide.recommendation)) {
    warnings.push('Decision-oriented deck has no explicit decision ask or recommendation.');
  }

  return { valid: issues.length === 0, issues, warnings, spec };
}

export function presentationSlideAcceptsImages(slide = {}, index = 0) {
  return ['evidence', 'two_column', 'bullets', 'framework'].includes(classifyPresentationSlide(slide, index));
}

function statusColor(status) {
  if (status === 'green') return C.green;
  if (status === 'amber') return C.amber;
  if (status === 'red') return C.red;
  return C.muted;
}

function statusSoft(status) {
  if (status === 'green') return C.softGreen;
  if (status === 'amber') return C.softAmber;
  if (status === 'red') return C.softRed;
  return C.surface;
}

function addText(slide, text, x, y, w, h, options = {}) {
  slide.addText(String(text || ''), {
    x, y, w, h,
    fontFace: options.fontFace || F.body,
    fontSize: options.fontSize || 14,
    color: options.color || C.body,
    bold: options.bold || false,
    italic: options.italic || false,
    align: options.align || 'left',
    valign: options.valign || 'top',
    margin: options.margin ?? 0,
    breakLine: false,
    fit: 'shrink',
    ...options,
  });
}

function addRect(slide, x, y, w, h, fill, line = fill, radius = false) {
  slide.addShape(radius ? 'roundRect' : 'rect', {
    x, y, w, h,
    fill: { color: fill },
    line: { color: line, width: line === fill ? 0.5 : 1 },
    radius: radius ? 0.08 : undefined,
  });
}

function addStatusPill(slide, label, status, x, y, w = 0.9) {
  addRect(slide, x, y, w, 0.28, statusSoft(status), statusSoft(status), true);
  addText(slide, label, x, y + 0.025, w, 0.22, { fontSize: 9.5, bold: true, color: statusColor(status), align: 'center', valign: 'mid' });
}

function addHeader(slide, spec, s, index) {
  const titleY = s.kicker ? 0.68 : 0.48;
  if (s.kicker) addText(slide, s.kicker.toUpperCase(), L.marginX, 0.36, 4.4, 0.22, { fontSize: 8.8, bold: true, color: C.accent, charSpacing: 1.7 });
  addText(slide, s.title, L.marginX, titleY, 11.75, 0.66, { fontFace: F.heading, fontSize: 23, bold: true, color: C.ink, valign: 'mid' });
  if (s.subtitle) addText(slide, s.subtitle, L.marginX, titleY + 0.7, 10.9, 0.3, { fontSize: 10.8, color: C.muted });
  addRect(slide, L.marginX, s.subtitle ? titleY + 1.1 : titleY + 0.86, 0.72, 0.035, C.accent, C.accent);
  if (s.insight && s.insight.length <= 150 && !['executive_summary', 'chart_insight', 'evidence'].includes(s.type)) {
    addText(slide, s.insight, 9.15, 0.35, 3.45, 0.28, { fontSize: 8.8, bold: true, color: C.teal, align: 'right' });
  }
}

function addFooter(slide, spec, s, index, total) {
  const source = s.source || (spec.sourceNotes.length === 1 ? spec.sourceNotes[0] : '');
  if (source) addText(slide, `Source: ${source}`, L.marginX, 7.14, 9.5, 0.18, { fontSize: 7.5, color: C.muted });
  addText(slide, `${index + 1} / ${total}`, 11.9, 7.12, 0.75, 0.18, { fontSize: 8, color: C.muted, align: 'right' });
}

function bulletRuns(items, fontSize = 13.5) {
  return items.map((item) => ({ text: String(item), options: { bullet: { indent: 14 }, hanging: 3, breakLine: true, paraSpaceAfterPt: 7, fontSize } }));
}

function addBullets(slide, items, x, y, w, h, fontSize = 13.5) {
  if (!items?.length) return;
  slide.addText(bulletRuns(items, fontSize), {
    x, y, w, h, fontFace: F.body, fontSize, color: C.body, valign: 'top', margin: 0.03, breakLine: false, fit: 'shrink',
  });
}

function addKpiCards(slide, kpis, y, h = 1.18) {
  const items = kpis.slice(0, 5);
  if (!items.length) return;
  const gap = 0.12;
  const usable = 11.9;
  const cardW = (usable - gap * (items.length - 1)) / items.length;
  items.forEach((kpi, i) => {
    const x = L.marginX + i * (cardW + gap);
    addRect(slide, x, y, cardW, h, C.surface, C.surface, false);
    addRect(slide, x, y, cardW, 0.045, statusColor(kpi.status), statusColor(kpi.status), false);
    addText(slide, kpi.label.toUpperCase(), x + 0.16, y + 0.14, cardW - 0.32, 0.2, { fontSize: 8.5, color: C.muted, bold: true, charSpacing: 0.5 });
    addText(slide, kpi.value, x + 0.16, y + 0.37, cardW - 0.32, 0.4, { fontFace: F.heading, fontSize: 21.5, color: C.ink, bold: true });
    if (kpi.delta) addText(slide, kpi.delta, x + 0.16, y + 0.84, cardW - 0.32, 0.17, { fontSize: 8.5, color: statusColor(kpi.status), bold: kpi.status !== 'neutral' });
    else if (kpi.note) addText(slide, kpi.note, x + 0.16, y + 0.84, cardW - 0.32, 0.17, { fontSize: 8.5, color: C.muted });
  });
}

function addInsightBox(slide, text, x, y, w, h, label = 'MANAGEMENT IMPLICATION') {
  addRect(slide, x, y, w, h, C.surface2, C.surface2, false);
  addRect(slide, x, y, 0.055, h, C.accent, C.accent);
  addText(slide, label, x + 0.2, y + 0.14, w - 0.36, 0.2, { fontSize: 8.2, bold: true, color: C.accent, charSpacing: 1.2 });
  addText(slide, text, x + 0.2, y + 0.43, w - 0.38, h - 0.58, { fontSize: 12.2, bold: true, color: C.ink, valign: 'mid' });
}

function addCover(slide, spec, s) {
  slide.background = { color: C.white };
  addRect(slide, 11.82, 0, 1.513, 7.5, C.navy, C.navy);
  addRect(slide, 11.82, 5.95, 1.513, 1.55, C.teal, C.teal);
  addRect(slide, 0.82, 0.9, 0.72, 0.055, C.accent, C.accent);
  addText(slide, s.kicker || spec.archetype.replace(/_/g, ' ').toUpperCase(), 0.82, 1.14, 5.8, 0.28, { fontSize: 9, bold: true, color: C.accent, charSpacing: 1.7 });
  addText(slide, s.title || spec.title, 0.82, 1.68, 9.95, 2.25, { fontFace: F.heading, fontSize: 30.5, bold: true, color: C.ink, valign: 'mid' });
  if (s.subtitle) addText(slide, s.subtitle, 0.84, 4.15, 8.85, 0.76, { fontSize: 14.2, color: C.body, valign: 'top' });
  const meta = [spec.audience, spec.period].filter(Boolean).join('  •  ');
  if (meta) addText(slide, meta, 0.84, 6.28, 9.6, 0.28, { fontSize: 10, color: C.muted });
  if (s.author) addText(slide, s.author, 0.84, 6.65, 9.6, 0.28, { fontSize: 10, color: C.muted });
  addText(slide, 'QUANTORA', 11.9, 0.74, 1.34, 0.28, { fontSize: 8.8, bold: true, color: C.white, charSpacing: 1.7, align: 'center' });
}

function addSection(slide, s, index) {
  slide.background = { color: C.surface };
  addRect(slide, 0, 0, 0.16, 7.5, C.accent, C.accent);
  addText(slide, String(index).padStart(2, '0'), 0.78, 1.45, 2.2, 1.5, { fontFace: F.heading, fontSize: 68, bold: true, color: 'D9E0E7' });
  addText(slide, s.kicker || 'SECTION', 3.05, 1.54, 3.2, 0.28, { fontSize: 9.2, bold: true, color: C.accent, charSpacing: 1.9 });
  addText(slide, s.title, 3.05, 2.0, 8.8, 1.3, { fontFace: F.heading, fontSize: 29, bold: true, color: C.ink, valign: 'mid' });
  if (s.subtitle) addText(slide, s.subtitle, 3.08, 3.55, 7.8, 0.72, { fontSize: 13.2, color: C.muted });
  addRect(slide, 3.05, 4.58, 0.82, 0.045, C.accent, C.accent);
}

function addExecutiveSummary(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  addKpiCards(slide, s.kpis, 1.84, 1.24);
  const left = 0.68;
  const top = 3.42;
  if (s.bullets.length) {
    addText(slide, 'WHAT MATTERS', left, top, 5.5, 0.24, { fontSize: 9, bold: true, color: C.muted, charSpacing: 1.1 });
    addBullets(slide, s.bullets.slice(0, 5), left + 0.04, top + 0.34, 5.55, 2.65, 13);
  }
  const insight = s.insight || s.recommendation || spec.decisionAsk || s.subtitle;
  if (insight) addInsightBox(slide, insight, 6.55, 3.42, 6.1, 2.35, spec.decisionAsk ? 'DECISION / GOVERNING INSIGHT' : 'GOVERNING INSIGHT');
  if (s.recommendation && s.recommendation !== insight) {
    addText(slide, 'RECOMMENDATION', 6.75, 5.95, 2.2, 0.2, { fontSize: 8.5, bold: true, color: C.teal, charSpacing: 1 });
    addText(slide, s.recommendation, 6.75, 6.18, 5.65, 0.54, { fontSize: 11.5, bold: true, color: C.ink });
  }
}

function addKpiStrip(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  addKpiCards(slide, s.kpis, 1.88, 1.34);
  const insight = s.insight || s.recommendation;
  if (s.bullets.length) addBullets(slide, s.bullets, 0.76, 3.62, 6.15, 2.6, 13.5);
  if (insight) addInsightBox(slide, insight, 7.25, 3.64, 5.4, 2.15);
}

function addTimeline(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  const items = s.timeline.slice(0, 6);
  const x0 = 1.1;
  const x1 = 12.15;
  const y = 3.05;
  slide.addShape('line', { x: x0, y, w: x1 - x0, h: 0, line: { color: C.line, width: 2 } });
  const step = items.length > 1 ? (x1 - x0) / (items.length - 1) : 0;
  items.forEach((item, i) => {
    const x = x0 + step * i;
    slide.addShape('ellipse', { x: x - 0.11, y: y - 0.11, w: 0.22, h: 0.22, fill: { color: statusColor(item.status) }, line: { color: C.white, width: 1 } });
    addText(slide, item.date || `Step ${i + 1}`, x - 0.7, 2.4, 1.4, 0.28, { fontSize: 9.5, bold: true, color: C.muted, align: 'center' });
    const boxW = Math.min(2.05, 10.8 / Math.max(1, items.length));
    const bx = Math.max(0.72, Math.min(12.61 - boxW, x - boxW / 2));
    addRect(slide, bx, 3.42, boxW, 1.7, C.white, C.line, true);
    addText(slide, item.label, bx + 0.14, 3.6, boxW - 0.28, 0.52, { fontSize: 11.2, bold: true, color: C.ink, align: 'center', valign: 'mid' });
    if (item.detail) addText(slide, item.detail, bx + 0.14, 4.24, boxW - 0.28, 0.65, { fontSize: 9.4, color: C.body, align: 'center' });
  });
  if (s.insight) addInsightBox(slide, s.insight, 2.25, 5.58, 8.85, 0.9, 'WHY THIS SEQUENCE MATTERS');
}

function addComparison(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  const options = s.options.slice(0, 3);
  const gap = 0.22;
  const cardW = (11.98 - gap * (options.length - 1)) / Math.max(1, options.length);
  options.forEach((option, i) => {
    const x = L.marginX + i * (cardW + gap);
    const border = option.recommended ? C.accent : C.line;
    addRect(slide, x, 1.86, cardW, 4.72, option.recommended ? C.softBlue : C.white, border, true);
    if (option.recommended) addStatusPill(slide, 'RECOMMENDED', 'green', x + cardW - 1.32, 2.02, 1.12);
    addText(slide, option.name, x + 0.2, 2.0, cardW - 0.4, 0.48, { fontFace: F.heading, fontSize: 18, bold: true, color: C.ink });
    if (option.summary) addText(slide, option.summary, x + 0.2, 2.58, cardW - 0.4, 0.58, { fontSize: 10.5, color: C.body });
    if (option.score) addText(slide, option.score, x + 0.2, 3.28, cardW - 0.4, 0.3, { fontSize: 11, bold: true, color: option.recommended ? C.accent : C.muted });
    addText(slide, 'UPSIDE', x + 0.2, 3.72, cardW - 0.4, 0.2, { fontSize: 8.2, bold: true, color: C.green, charSpacing: 0.8 });
    addBullets(slide, option.pros, x + 0.2, 3.98, cardW - 0.4, 0.98, 10.2);
    addText(slide, 'TRADE-OFFS', x + 0.2, 5.08, cardW - 0.4, 0.2, { fontSize: 8.2, bold: true, color: C.amber, charSpacing: 0.8 });
    addBullets(slide, option.cons, x + 0.2, 5.34, cardW - 0.4, 0.92, 10.2);
  });
}

function addStatusDashboard(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  const statuses = s.statuses.slice(0, 6);
  const cols = Math.min(3, Math.max(2, statuses.length));
  const rows = Math.ceil(statuses.length / cols);
  const gapX = 0.18;
  const gapY = 0.18;
  const cardW = (11.98 - gapX * (cols - 1)) / cols;
  const cardH = Math.min(1.33, (3.08 - gapY * (rows - 1)) / Math.max(1, rows));
  statuses.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = L.marginX + col * (cardW + gapX);
    const y = 1.86 + row * (cardH + gapY);
    addRect(slide, x, y, cardW, cardH, C.white, C.line, true);
    addRect(slide, x, y, 0.06, cardH, statusColor(item.status), statusColor(item.status));
    addText(slide, item.label, x + 0.2, y + 0.16, cardW - 0.4, 0.24, { fontSize: 10, bold: true, color: C.muted });
    if (item.metric) addText(slide, item.metric, x + 0.2, y + 0.47, cardW - 0.4, 0.34, { fontFace: F.heading, fontSize: 18, bold: true, color: C.ink });
    addStatusPill(slide, item.status.toUpperCase(), item.status, x + cardW - 0.93, y + 0.14, 0.72);
    if (item.detail) addText(slide, item.detail, x + 0.2, y + 0.9, cardW - 0.35, 0.3, { fontSize: 9.3, color: C.body });
  });
  const colsData = s.columns.slice(0, 3);
  if (colsData.length) {
    const top = 5.25;
    const colW = (11.98 - 0.4) / Math.min(3, colsData.length);
    colsData.forEach((col, i) => {
      const x = L.marginX + i * (colW + 0.2);
      addText(slide, col.heading.toUpperCase(), x, top, colW, 0.22, { fontSize: 8.5, bold: true, color: C.accent, charSpacing: 0.8 });
      addBullets(slide, col.bullets.slice(0, 3), x, top + 0.3, colW - 0.08, 1.28, 10.2);
    });
  } else if (s.insight) {
    addInsightBox(slide, s.insight, 2.25, 5.25, 8.85, 1.05, 'MANAGEMENT ATTENTION');
  }
}

function addRoadmap(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  const actions = s.actions.slice(0, 6);
  const n = Math.max(1, actions.length);
  const overlap = n > 1 ? 0.14 : 0;
  const usable = 11.9;
  const stageW = (usable + overlap * (n - 1)) / n;
  const step = stageW - overlap;
  const trackY = 2.18;
  const trackH = 1.5;

  addText(slide, 'DELIVERY PATH', L.marginX, 1.78, 2.1, 0.2, { fontSize: 8.2, bold: true, color: C.muted, charSpacing: 1.1 });
  actions.forEach((action, i) => {
    const x = L.marginX + i * step;
    const fill = i % 2 === 0 ? C.surface2 : C.surface;
    slide.addShape('chevron', {
      x, y: trackY, w: stageW, h: trackH,
      fill: { color: fill },
      line: { color: C.white, width: 1.2 },
    });
    addRect(slide, x + 0.13, trackY + 0.1, Math.max(0.35, stageW - 0.42), 0.045, statusColor(action.status), statusColor(action.status));
    addText(slide, action.timing || 'NEXT', x + 0.18, trackY + 0.25, Math.max(0.5, stageW - 0.48), 0.2, { fontSize: 7.9, bold: true, color: C.muted, charSpacing: 0.7 });
    addText(slide, action.title, x + 0.18, trackY + 0.53, Math.max(0.55, stageW - 0.5), 0.58, { fontSize: n >= 5 ? 10.4 : 11.4, bold: true, color: C.ink, valign: 'mid' });
    addText(slide, String(i + 1).padStart(2, '0'), x + 0.18, trackY + 1.13, 0.42, 0.2, { fontFace: F.heading, fontSize: 9, bold: true, color: C.accent });
    if (action.owner) addText(slide, action.owner, x + 0.58, trackY + 1.14, Math.max(0.45, stageW - 0.88), 0.18, { fontSize: 7.8, color: C.muted, bold: true });
    if (action.detail) {
      slide.addShape('line', { x: x + 0.12, y: 4.02, w: Math.max(0.42, stageW - 0.34), h: 0, line: { color: C.line, width: 0.7 } });
      addText(slide, action.detail, x + 0.12, 4.18, Math.max(0.48, stageW - 0.34), 0.9, { fontSize: n >= 5 ? 8.5 : 9.2, color: C.body, valign: 'top' });
    }
  });
  if (s.recommendation) addInsightBox(slide, s.recommendation, 2.15, 5.55, 9.0, 0.96, 'OUTCOME / MANAGEMENT COMMITMENT');
}

function addRiskMatrix(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  const x = 0.95;
  const y = 2.02;
  const size = 4.35;
  const cell = size / 5;
  for (let impact = 1; impact <= 5; impact += 1) {
    for (let likelihood = 1; likelihood <= 5; likelihood += 1) {
      const score = impact * likelihood;
      const fill = score >= 16 ? C.softRed : score >= 9 ? C.softAmber : C.softGreen;
      addRect(slide, x + (likelihood - 1) * cell, y + (5 - impact) * cell, cell, cell, fill, C.white);
    }
  }
  addText(slide, 'LIKELIHOOD →', x + 1.2, y + size + 0.2, 2.2, 0.22, { fontSize: 8.5, bold: true, color: C.muted, align: 'center' });
  addText(slide, 'IMPACT', x - 0.62, y + 1.55, 0.5, 0.9, { fontSize: 8.5, bold: true, color: C.muted, vert: 'vert270', align: 'center' });
  s.risks.slice(0, 8).forEach((risk, i) => {
    const cx = x + (risk.likelihood - 0.5) * cell;
    const cy = y + (5 - risk.impact + 0.5) * cell;
    slide.addShape('ellipse', { x: cx - 0.16, y: cy - 0.16, w: 0.32, h: 0.32, fill: { color: statusColor(risk.status) }, line: { color: C.white, width: 1 } });
    addText(slide, String(i + 1), cx - 0.11, cy - 0.095, 0.22, 0.16, { fontSize: 8, bold: true, color: C.white, align: 'center', valign: 'mid' });
  });
  addText(slide, 'PRIORITIZED RISKS', 5.8, 2.03, 2.5, 0.22, { fontSize: 8.8, bold: true, color: C.muted, charSpacing: 0.9 });
  const list = [...s.risks].sort((a, b) => (b.impact * b.likelihood) - (a.impact * a.likelihood)).slice(0, 5);
  list.forEach((risk, i) => {
    const yy = 2.43 + i * 0.83;
    addText(slide, `${i + 1}`, 5.82, yy, 0.34, 0.3, { fontSize: 10, bold: true, color: C.white, align: 'center', valign: 'mid', fill: { color: statusColor(risk.status) } });
    addText(slide, risk.risk, 6.28, yy - 0.02, 3.75, 0.32, { fontSize: 10.6, bold: true, color: C.ink });
    addText(slide, risk.mitigation || 'Mitigation not yet supplied', 6.28, yy + 0.34, 5.35, 0.3, { fontSize: 8.8, color: C.body });
    if (risk.owner) addText(slide, risk.owner, 11.25, yy, 1.15, 0.22, { fontSize: 8.5, color: C.muted, align: 'right' });
  });
}

function addFinancialCase(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  const metrics = s.financials.slice(0, 5).map((item) => ({ label: item.label, value: item.value, delta: item.note, status: item.status, note: item.note }));
  addKpiCards(slide, metrics, 1.88, 1.25);
  if (s.data.length >= 2) {
    slide.addChart('bar', [{ name: 'Value', labels: s.data.map((d) => d.label), values: s.data.map((d) => d.value) }], {
      x: 0.78, y: 3.55, w: 7.25, h: 2.6,
      barDir: 'col', chartColors: [C.accent], showLegend: false, showTitle: false, showValue: true,
      catAxisLabelFontSize: 9, valAxisLabelFontSize: 8, showCatName: false, showValAxisTitle: false,
      showCatAxisTitle: false, showValue: true, dataLabelColor: C.ink, dataLabelFontSize: 9,
    });
  } else if (s.bullets.length) {
    addBullets(slide, s.bullets, 0.82, 3.55, 6.95, 2.6, 12.4);
  }
  const rec = s.recommendation || s.insight || spec.decisionAsk;
  if (rec) addInsightBox(slide, rec, 8.38, 3.55, 4.25, 2.25, 'VALUE CASE / DECISION');
}

function addChartInsight(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  const rows = s.data;
  const chartType = s.chartType === 'line' ? 'line' : 'bar';
  slide.addChart(chartType, [{ name: 'Value', labels: rows.map((row) => row.label), values: rows.map((row) => row.value) }], {
    x: 0.76, y: 1.92, w: 8.0, h: 4.55,
    ...(chartType === 'bar' ? { barDir: s.chartType === 'column' ? 'col' : 'bar' } : {}),
    chartColors: [C.accent], showLegend: false, showTitle: false, showValue: chartType === 'bar',
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 8, dataLabelFontSize: 8.5, dataLabelColor: C.ink,
    showCatAxisTitle: false, showValAxisTitle: false,
  });
  const insight = s.insight || s.recommendation || 'The evidence supports the management takeaway shown here.';
  addInsightBox(slide, insight, 9.1, 2.0, 3.55, 2.25, 'WHAT THE DATA SAYS');
  if (s.bullets.length) addBullets(slide, s.bullets.slice(0, 4), 9.15, 4.62, 3.45, 1.5, 10.4);
}

function addFramework(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  const items = s.framework.length ? s.framework.slice(0, 6) : s.bullets.slice(0, 6).map((bullet, index) => ({ heading: `Domain ${index + 1}`, detail: bullet, metric: '', status: 'neutral' }));
  const cols = items.length <= 4 ? 2 : 3;
  const rows = Math.ceil(items.length / cols);
  const gap = 0.2;
  const cardW = (11.98 - gap * (cols - 1)) / cols;
  const cardH = (4.65 - gap * (rows - 1)) / rows;
  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = L.marginX + col * (cardW + gap);
    const y = 1.9 + row * (cardH + gap);
    addRect(slide, x, y, cardW, cardH, C.white, C.line, true);
    addRect(slide, x, y, 0.06, cardH, statusColor(item.status), statusColor(item.status));
    addText(slide, item.heading, x + 0.22, y + 0.2, cardW - 0.44, 0.36, { fontSize: 13, bold: true, color: C.ink });
    if (item.metric) addText(slide, item.metric, x + 0.22, y + 0.7, cardW - 0.44, 0.34, { fontFace: F.heading, fontSize: 17, bold: true, color: C.accent });
    addText(slide, item.detail, x + 0.22, y + (item.metric ? 1.2 : 0.75), cardW - 0.44, cardH - (item.metric ? 1.42 : 0.98), { fontSize: 10.5, color: C.body, valign: 'mid' });
  });
}

function addTwoColumn(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  const cols = s.columns.slice(0, 2);
  slide.addShape('line', { x: 6.64, y: 2.02, w: 0, h: 4.12, line: { color: C.line, width: 1 } });
  cols.forEach((col, i) => {
    const x = i === 0 ? 0.78 : 6.95;
    const w = i === 0 ? 5.45 : 5.58;
    addRect(slide, x, 2.02, 0.06, 0.62, i === 0 ? C.accent : C.teal, i === 0 ? C.accent : C.teal);
    addText(slide, col.heading, x + 0.2, 2.08, w - 0.2, 0.5, { fontFace: F.heading, fontSize: 17.5, bold: true, color: C.ink });
    addBullets(slide, col.bullets, x + 0.2, 2.86, w - 0.25, 3.18, 12);
  });
  if (s.insight) addText(slide, s.insight, 2.05, 6.46, 9.2, 0.34, { fontSize: 10.3, bold: true, color: C.teal, align: 'center' });
}

async function addEvidence(slide, spec, s, resolveImage, resolvedUrls) {
  addHeader(slide, spec, s, 0);
  let resolved = null;
  if (s.images?.[0]?.url && typeof resolveImage === 'function') resolved = await resolveImage(s.images[0].url);
  if (resolved?.dataUrl) {
    resolvedUrls.push(resolved.dataUrl);
    const maxW = 6.85;
    const maxH = 4.62;
    const aspect = resolved.width && resolved.height ? resolved.width / resolved.height : 1.5;
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) { h = maxH; w = h * aspect; }
    slide.addImage({ data: resolved.dataUrl, x: 0.74 + (maxW - w) / 2, y: 1.95 + (maxH - h) / 2, w, h });
    if (s.images[0].caption) addText(slide, s.images[0].caption, 0.82, 6.58, 6.5, 0.25, { fontSize: 8.5, color: C.muted, align: 'center' });
  } else if (s.data.length >= 2) {
    slide.addChart('bar', [{ name: 'Value', labels: s.data.map((d) => d.label), values: s.data.map((d) => d.value) }], { x: 0.74, y: 2.0, w: 6.85, h: 4.35, barDir: 'bar', chartColors: [C.accent], showLegend: false, showValue: true, catAxisLabelFontSize: 9, valAxisLabelFontSize: 8, dataLabelFontSize: 8 });
  } else {
    addBullets(slide, s.bullets, 0.84, 2.08, 6.45, 4.1, 12.2);
  }
  const insight = s.insight || s.recommendation || s.subtitle;
  if (insight) addInsightBox(slide, insight, 8.0, 2.0, 4.6, 2.25, 'EVIDENCE → IMPLICATION');
  if (s.recommendation && s.recommendation !== insight) {
    addText(slide, 'NEXT ACTION', 8.18, 4.72, 1.8, 0.2, { fontSize: 8.5, bold: true, color: C.teal, charSpacing: 1 });
    addText(slide, s.recommendation, 8.18, 5.02, 4.15, 1.1, { fontSize: 12, bold: true, color: C.ink });
  }
  return resolved?.dataUrl ? 1 : 0;
}

function addBulletsSlide(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  const items = s.bullets.slice(0, 6);
  const top = 1.98;
  items.forEach((item, i) => {
    const y = top + i * 0.72;
    addText(slide, String(i + 1).padStart(2, '0'), 0.82, y, 0.52, 0.28, { fontFace: F.heading, fontSize: 13, bold: true, color: C.accent });
    addText(slide, item, 1.45, y - 0.05, 10.45, 0.5, { fontSize: 12.5, color: C.body, valign: 'mid' });
    slide.addShape('line', { x: 1.45, y: y + 0.53, w: 10.5, h: 0, line: { color: C.line, width: 0.7 } });
  });
  if (s.insight) addInsightBox(slide, s.insight, 8.3, 5.78, 4.3, 0.95, 'TAKEAWAY');
}

function addQuote(slide, s) {
  slide.background = { color: C.surface };
  addText(slide, '“', 0.8, 0.8, 1.4, 1.15, { fontFace: 'Georgia', fontSize: 70, bold: true, color: C.accent });
  addText(slide, s.quote || s.title, 1.45, 2.0, 10.4, 2.7, { fontFace: 'Georgia', fontSize: 25, bold: true, italic: true, color: C.ink, valign: 'mid' });
  if (s.author) addText(slide, `— ${s.author}`, 1.48, 5.0, 8, 0.4, { fontSize: 13, color: C.muted });
}

function addAppendix(slide, spec, s) {
  addHeader(slide, spec, s, 0);
  addText(slide, s.kicker || 'APPENDIX / SOURCES', 0.78, 1.92, 2.7, 0.24, { fontSize: 8.8, bold: true, color: C.accent, charSpacing: 0.9 });
  addBullets(slide, s.bullets.length ? s.bullets : spec.sourceNotes, 0.82, 2.35, 11.45, 4.35, 10.5);
}
export async function composePresentationV2(pptx, inputSpec, { resolveImage } = {}) {
  const spec = normalizePresentationSpec(inputSpec);
  const slideImages = [];
  let imageCount = 0;
  const total = spec.slides.length;

  for (let index = 0; index < spec.slides.length; index += 1) {
    const s = spec.slides[index];
    const type = s.type;
    const slide = pptx.addSlide();
    const resolvedUrls = [];
    slide.background = { color: C.white };

    if (type === 'cover') addCover(slide, spec, s);
    else if (type === 'section') addSection(slide, s, index + 1);
    else if (type === 'executive_summary') addExecutiveSummary(slide, spec, s);
    else if (type === 'kpi_strip') addKpiStrip(slide, spec, s);
    else if (type === 'timeline') addTimeline(slide, spec, s);
    else if (type === 'comparison') addComparison(slide, spec, s);
    else if (type === 'status_dashboard') addStatusDashboard(slide, spec, s);
    else if (type === 'roadmap') addRoadmap(slide, spec, s);
    else if (type === 'risk_matrix') addRiskMatrix(slide, spec, s);
    else if (type === 'financial_case') addFinancialCase(slide, spec, s);
    else if (type === 'chart_insight') addChartInsight(slide, spec, s);
    else if (type === 'framework') addFramework(slide, spec, s);
    else if (type === 'two_column') addTwoColumn(slide, spec, s);
    else if (type === 'evidence') imageCount += await addEvidence(slide, spec, s, resolveImage, resolvedUrls);
    else if (type === 'quote') addQuote(slide, s);
    else if (type === 'appendix') addAppendix(slide, spec, s);
    else addBulletsSlide(slide, spec, s);

    if (!['cover', 'section', 'quote'].includes(type)) addFooter(slide, spec, s, index, total);
    if (s.speakerNotes) slide.addNotes(String(s.speakerNotes));
    slideImages.push(resolvedUrls);
  }

  return { spec, slideImages, imageCount };
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

function cssStatus(status) {
  return `#${statusColor(status)}`;
}

function previewHeader(s) {
  return `<div class="p-head">${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ''}<h2>${esc(s.title)}</h2>${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ''}</div>`;
}

function previewKpis(kpis) {
  return `<div class="kpis">${kpis.slice(0, 5).map((k) => `<div class="kpi" style="--status:${cssStatus(k.status)}"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div><div class="kpi-delta">${esc(k.delta || k.note)}</div></div>`).join('')}</div>`;
}

function previewInsight(text, label = 'Management implication') {
  if (!text) return '';
  return `<div class="insight"><span>${esc(label)}</span><strong>${esc(text)}</strong></div>`;
}

export function renderPresentationPreviewSlide(inputSlide, index, total, imageUrls = [], specInput = {}) {
  const spec = normalizePresentationSpec({ ...specInput, slides: [inputSlide] });
  const s = spec.slides[0];
  s.type = classifyPresentationSlide(inputSlide, index);
  const footer = !['cover', 'section', 'quote'].includes(s.type) ? `<div class="foot">${s.source ? `<span>Source: ${esc(s.source)}</span>` : '<span></span>'}<span>${index + 1} / ${total}</span></div>` : '';

  if (s.type === 'cover') return `<section class="slide cover"><div class="cover-main"><div class="kicker">${esc(s.kicker || specInput.archetype || 'EXECUTIVE BRIEFING')}</div><h1>${esc(s.title)}</h1>${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ''}<div class="cover-meta">${esc([specInput.audience, specInput.period].filter(Boolean).join(' • '))}</div></div><div class="cover-band"><b>QUANTORA</b></div></section>`;
  if (s.type === 'section') return `<section class="slide section"><div class="section-num">${String(index + 1).padStart(2, '0')}</div><div><div class="kicker">${esc(s.kicker || 'SECTION')}</div><h2>${esc(s.title)}</h2>${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ''}</div></section>`;
  if (s.type === 'quote') return `<section class="slide quote"><div class="quote-mark">“</div><blockquote>${esc(s.quote || s.title)}</blockquote>${s.author ? `<div>— ${esc(s.author)}</div>` : ''}</section>`;

  let body = '';
  if (s.type === 'executive_summary' || s.type === 'kpi_strip') {
    body = `${previewKpis(s.kpis)}<div class="summary-grid"><div><div class="micro">WHAT MATTERS</div><ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>${previewInsight(s.insight || s.recommendation || specInput.decisionAsk, s.type === 'executive_summary' ? 'Governing insight' : 'Management implication')}</div>`;
  } else if (s.type === 'timeline') {
    body = `<div class="timeline">${s.timeline.map((item) => `<div class="time-item"><div class="time-date">${esc(item.date)}</div><div class="dot" style="background:${cssStatus(item.status)}"></div><div class="time-card"><b>${esc(item.label)}</b><p>${esc(item.detail)}</p></div></div>`).join('')}</div>${previewInsight(s.insight, 'Why this sequence matters')}`;
  } else if (s.type === 'comparison') {
    body = `<div class="compare">${s.options.map((option) => `<div class="option ${option.recommended ? 'recommended' : ''}"><div class="option-top"><h3>${esc(option.name)}</h3>${option.recommended ? '<span>RECOMMENDED</span>' : ''}</div><p>${esc(option.summary)}</p>${option.score ? `<strong class="score">${esc(option.score)}</strong>` : ''}<div class="micro good">UPSIDE</div><ul>${option.pros.map((v) => `<li>${esc(v)}</li>`).join('')}</ul><div class="micro trade">TRADE-OFFS</div><ul>${option.cons.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></div>`).join('')}</div>`;
  } else if (s.type === 'status_dashboard') {
    body = `<div class="status-grid">${s.statuses.map((item) => `<div class="status-card" style="--status:${cssStatus(item.status)}"><div><span>${esc(item.label)}</span><b>${esc(item.metric)}</b></div><em>${esc(item.status)}</em><p>${esc(item.detail)}</p></div>`).join('')}</div>${s.columns.length ? `<div class="cols">${s.columns.map((col) => `<div><div class="micro">${esc(col.heading)}</div><ul>${col.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>`).join('')}</div>` : previewInsight(s.insight, 'Management attention')}`;
  } else if (s.type === 'roadmap') {
    body = `<div class="roadmap roadmap-track">${s.actions.map((a, i) => `<div class="action" style="--status:${cssStatus(a.status)}"><div class="micro">${esc(a.timing || 'NEXT')}</div><h3>${esc(a.title)}</h3><div class="action-meta"><b>${String(i + 1).padStart(2, '0')}</b><span>${a.owner ? esc(a.owner) : ''}</span></div><p>${esc(a.detail)}</p></div>`).join('')}</div>${previewInsight(s.recommendation, 'Outcome / management commitment')}`;
  } else if (s.type === 'risk_matrix') {
    body = `<div class="risk-layout"><div class="risk-matrix">${Array.from({length:25}).map((_, i) => { const impact = 5 - Math.floor(i / 5); const likelihood = (i % 5) + 1; const score = impact * likelihood; const cls = score >= 16 ? 'risk-red' : score >= 9 ? 'risk-amber' : 'risk-green'; return `<div class="${cls}"></div>`; }).join('')}${s.risks.map((r, i) => `<span class="risk-dot" style="left:${((r.likelihood - .5) / 5) * 100}%;top:${((5 - r.impact + .5) / 5) * 100}%;background:${cssStatus(r.status)}">${i + 1}</span>`).join('')}</div><div class="risk-list">${[...s.risks].sort((a,b)=>b.impact*b.likelihood-a.impact*a.likelihood).slice(0,5).map((r,i)=>`<div><b>${i+1}. ${esc(r.risk)}</b><p>${esc(r.mitigation)}</p></div>`).join('')}</div></div>`;
  } else if (s.type === 'financial_case') {
    body = `${previewKpis(s.financials.map((f)=>({label:f.label,value:f.value,delta:f.note,status:f.status})))}<div class="financial-body"><div class="bars">${s.data.map((d)=>`<div><span>${esc(d.label)}</span><i style="width:${Math.max(4, Math.min(100, Math.abs(d.value) / Math.max(1,...s.data.map(x=>Math.abs(x.value))) * 100))}%"></i><b>${esc(d.value)}</b></div>`).join('')}</div>${previewInsight(s.recommendation || s.insight || specInput.decisionAsk, 'Value case / decision')}</div>`;
  } else if (s.type === 'chart_insight') {
    const max = Math.max(1, ...s.data.map((d) => Math.abs(d.value)));
    body = `<div class="chart-layout"><div class="bars">${s.data.map((d)=>`<div><span>${esc(d.label)}</span><i style="width:${Math.max(4, Math.abs(d.value)/max*100)}%"></i><b>${esc(d.value)}</b></div>`).join('')}</div>${previewInsight(s.insight || s.recommendation, 'What the data says')}</div>`;
  } else if (s.type === 'framework') {
    const items = s.framework.length ? s.framework : s.bullets.map((b,i)=>({heading:`Domain ${i+1}`,detail:b,metric:'',status:'neutral'}));
    body = `<div class="framework">${items.map((item)=>`<div style="--status:${cssStatus(item.status)}"><h3>${esc(item.heading)}</h3>${item.metric?`<b>${esc(item.metric)}</b>`:''}<p>${esc(item.detail)}</p></div>`).join('')}</div>`;
  } else if (s.type === 'two_column') {
    body = `<div class="two-cols">${s.columns.slice(0,2).map((col)=>`<div><h3>${esc(col.heading)}</h3><ul>${col.bullets.map((b)=>`<li>${esc(b)}</li>`).join('')}</ul></div>`).join('')}</div>`;
  } else if (s.type === 'evidence') {
    const visual = imageUrls[0] ? `<img src="${imageUrls[0]}" alt="${esc(s.images?.[0]?.altText || '')}"/>` : `<ul>${s.bullets.map((b)=>`<li>${esc(b)}</li>`).join('')}</ul>`;
    body = `<div class="evidence-layout"><div class="evidence-visual">${visual}</div>${previewInsight(s.insight || s.recommendation, 'Evidence → implication')}</div>`;
  } else if (s.type === 'appendix') {
    body = `<div class="appendix"><ul>${(s.bullets.length ? s.bullets : specInput.sourceNotes || []).map((b)=>`<li>${esc(b)}</li>`).join('')}</ul></div>`;
  } else {
    body = `<div class="numbered">${s.bullets.map((b,i)=>`<div><span>${String(i+1).padStart(2,'0')}</span><p>${esc(b)}</p></div>`).join('')}</div>${previewInsight(s.insight, 'Takeaway')}`;
  }
  return `<section class="slide content">${previewHeader(s)}<div class="body">${body}</div>${footer}</section>`;
}

export function buildPresentationPreviewHtml(inputSpec = {}, slideImages = []) {
  const spec = normalizePresentationSpec(inputSpec);
  const cards = spec.slides.map((slide, index) => renderPresentationPreviewSlide(slide, index, spec.slides.length, slideImages[index] || [], spec)).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
  *{box-sizing:border-box}body{margin:0;padding:28px;background:#edf1f4;font-family:Aptos,"Segoe UI",Arial,sans-serif;color:#${C.body}}.deck{max-width:1120px;margin:auto;display:flex;flex-direction:column;gap:24px}.slide{position:relative;width:100%;aspect-ratio:16/9;background:#fff;overflow:hidden;box-shadow:0 8px 26px rgba(16,36,56,.09);border:1px solid #${C.line}}.content{padding:30px 50px 28px}.p-head{position:relative;padding-bottom:15px}.p-head:after{content:"";position:absolute;left:0;bottom:0;width:58px;height:3px;background:#${C.accent}}.p-head h2{font:700 27px/1.12 "Aptos Display",Aptos,sans-serif;margin:3px 0 0;color:#${C.ink}}.p-head p{font-size:13px;color:#${C.muted};margin:7px 0 0}.kicker,.micro{text-transform:uppercase;font-size:9px;letter-spacing:1.5px;font-weight:700;color:#${C.accent}}.body{padding-top:20px;height:calc(100% - 95px)}.foot{position:absolute;left:48px;right:48px;bottom:14px;display:flex;justify-content:space-between;font-size:9px;color:#${C.muted}}ul{padding-left:20px;margin:8px 0}li{margin:7px 0;line-height:1.3}.cover{background:#fff;color:#${C.ink}}.cover-main{width:89%;height:100%;padding:74px 68px;display:flex;flex-direction:column;justify-content:center}.cover h1{font:700 42px/1.08 "Aptos Display",Aptos,sans-serif;margin:20px 0;color:#${C.ink};max-width:88%}.cover p{font-size:18px;line-height:1.35;color:#${C.body};max-width:82%}.cover-meta{position:absolute;bottom:42px;color:#${C.muted};font-size:12px}.cover-band{position:absolute;right:0;top:0;width:11%;height:100%;background:linear-gradient(180deg,#${C.navy} 0 79%,#${C.teal} 79%);padding:58px 14px;text-align:center;font-size:9px;letter-spacing:1.5px;color:#fff}.section{background:#${C.surface};display:grid;grid-template-columns:24% 76%;align-items:center;padding:70px;border-left:10px solid #${C.accent}}.section-num{font:700 84px "Aptos Display";color:#d9e0e7}.section h2{font:700 40px/1.1 "Aptos Display";color:#${C.ink};margin:16px 0}.section p{color:#${C.muted};font-size:18px}.quote{background:#${C.surface};padding:80px 100px}.quote-mark{font:700 94px Georgia;color:#${C.accent};height:70px}.quote blockquote{font:700 italic 31px/1.35 Georgia;color:#${C.ink};margin:18px 0 30px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px}.kpi{border:0;border-top:4px solid var(--status);border-radius:0;padding:13px 15px;background:#${C.surface}}.kpi-label{font-size:10px;font-weight:700;color:#${C.muted};text-transform:uppercase}.kpi-value{font:700 25px "Aptos Display";color:#${C.ink};margin:6px 0}.kpi-delta{font-size:10px;color:var(--status)}.summary-grid,.chart-layout,.financial-body,.evidence-layout{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:18px}.insight{background:#${C.surface2};border-left:5px solid #${C.accent};border-radius:0;padding:18px 20px;display:flex;flex-direction:column;justify-content:center;min-height:130px}.insight span{font-size:9px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:#${C.accent};margin-bottom:10px}.insight strong{font-size:17px;line-height:1.28;color:#${C.ink}}.timeline{display:flex;justify-content:space-between;position:relative;margin:40px 10px 20px}.timeline:before{content:"";position:absolute;top:37px;left:3%;right:3%;height:2px;background:#${C.line}}.time-item{width:16%;text-align:center;position:relative}.time-date{font-size:10px;font-weight:700;color:#${C.muted};height:28px}.dot{width:13px;height:13px;border-radius:50%;margin:3px auto 18px;position:relative;z-index:2;border:2px solid #fff}.time-card{border-top:2px solid #${C.line};padding:12px 8px;min-height:110px;background:#fff}.time-card b{font-size:12px;color:#${C.ink}}.time-card p{font-size:10px;color:#${C.body};line-height:1.3}.compare{display:flex;gap:14px;height:88%}.roadmap{display:flex;align-items:stretch;gap:0;margin-top:18px;min-height:235px}.option,.action{flex:1;border:1px solid #${C.line};border-radius:0;padding:18px;background:#fff}.option.recommended{background:#${C.surface2};border-color:#${C.accent};border-top:4px solid #${C.accent}}.option-top{display:flex;justify-content:space-between;gap:8px}.option-top h3{font-size:18px;margin:0;color:#${C.ink}}.action h3{font-size:15px;line-height:1.2;margin:7px 0 10px;color:#${C.ink}}.option-top span{font-size:8px;font-weight:700;color:#${C.green};background:#${C.softGreen};padding:4px 6px;border-radius:10px}.option p{font-size:11px;line-height:1.35;color:#${C.body}}.action p{font-size:10px;line-height:1.35;color:#${C.body};margin:14px 0 0}.score{display:block;color:#${C.accent};margin:12px 0}.good{color:#${C.green};margin-top:14px}.trade{color:#${C.amber};margin-top:14px}.action{position:relative;border:0;border-top:4px solid var(--status);background:#${C.surface};padding:16px 28px 16px 25px;clip-path:polygon(0 0,calc(100% - 18px) 0,100% 50%,calc(100% - 18px) 100%,0 100%,18px 50%);margin-left:-8px;min-width:0}.action:first-child{clip-path:polygon(0 0,calc(100% - 18px) 0,100% 50%,calc(100% - 18px) 100%,0 100%);margin-left:0}.action:nth-child(even){background:#${C.surface2}}.action-num{font:700 26px "Aptos Display";color:#cbd5e1;margin-bottom:10px}.action-meta{display:flex;align-items:center;gap:8px;margin-top:8px}.action-meta b{font:700 11px "Aptos Display";color:#${C.accent}}.action span{font-size:9px;color:#${C.muted};font-weight:700}.roadmap+.insight{margin-top:18px;min-height:92px}.status-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.status-card{border:1px solid #${C.line};border-top:4px solid var(--status);border-radius:0;padding:13px 15px;min-height:95px;background:#fff}.status-card>div{display:flex;justify-content:space-between}.status-card span{font-size:10px;text-transform:uppercase;font-weight:700;color:#${C.muted}}.status-card b{font:700 20px "Aptos Display";color:#${C.ink}}.status-card em{font-size:9px;text-transform:uppercase;color:var(--status);font-style:normal;font-weight:700}.status-card p{font-size:10px;margin:8px 0 0}.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:18px}.cols li{font-size:10px}.risk-layout{display:grid;grid-template-columns:42% 58%;gap:28px;height:90%}.risk-matrix{position:relative;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(5,1fr);border:1px solid #fff}.risk-green{background:#${C.softGreen};border:1px solid #fff}.risk-amber{background:#${C.softAmber};border:1px solid #fff}.risk-red{background:#${C.softRed};border:1px solid #fff}.risk-dot{position:absolute;transform:translate(-50%,-50%);width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:700;border:2px solid #fff}.risk-list>div{border-bottom:1px solid #${C.line};padding:8px 0}.risk-list b{font-size:11px;color:#${C.ink}}.risk-list p{font-size:9px;color:#${C.body};margin:4px 0}.bars{display:flex;flex-direction:column;gap:11px;padding:8px 0}.bars>div{display:grid;grid-template-columns:22% 1fr 12%;align-items:center;gap:8px;font-size:10px}.bars i{height:14px;border-radius:4px;background:#${C.accent};display:block}.bars b{font-size:10px;color:#${C.ink}}.framework{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.framework>div{border:1px solid #${C.line};border-top:4px solid var(--status);border-radius:0;padding:18px;min-height:150px;background:#fff}.framework h3{margin:0 0 10px;color:#${C.ink};font-size:16px}.framework b{color:#${C.accent};font-size:20px}.framework p{font-size:11px;line-height:1.35}.two-cols{display:grid;grid-template-columns:1fr 1fr;gap:20px;height:92%}.two-cols>div{border:0;border-left:5px solid #${C.accent};padding:6px 22px}.two-cols>div:nth-child(2){background:#fff;border-left-color:#${C.teal}}.two-cols h3{font-size:20px;color:#${C.ink};margin:0 0 14px}.evidence-visual{height:270px;display:flex;align-items:center;justify-content:center}.evidence-visual img{max-width:100%;max-height:100%;object-fit:contain}.numbered>div{display:grid;grid-template-columns:50px 1fr;gap:10px;border-bottom:1px solid #${C.line};padding:9px 0}.numbered span{font:700 14px "Aptos Display";color:#${C.accent}}.numbered p{font-size:13px;margin:0;line-height:1.35}.appendix{font-size:11px;line-height:1.35}
  </style></head><body><div class="deck" data-visual-system="consulting-v3">${cards}</div></body></html>`;
}
