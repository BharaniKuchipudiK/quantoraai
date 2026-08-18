const slideTypes = [
  'cover', 'section', 'executive_summary', 'kpi_strip', 'timeline', 'comparison',
  'status_dashboard', 'roadmap', 'risk_matrix', 'financial_case', 'chart_insight',
  'framework', 'two_column', 'evidence', 'bullets', 'quote', 'appendix',
];

const statuses = ['green', 'amber', 'red', 'neutral'];
const archetypes = ['qbr', 'business_case', 'project_status', 'executive_briefing', 'academic_research', 'strategy', 'proposal', 'general'];
const standards = ['executive', 'consulting', 'operational', 'technical', 'academic', 'analytical', 'general'];

const transportItem = {
  type: 'object',
  properties: {
    primary: { type: 'string' },
    secondary: { type: 'string' },
    tertiary: { type: 'string' },
    value: { type: 'string' },
    number: { type: 'number' },
    number2: { type: 'number' },
    status: { type: 'string', enum: statuses },
    bulletsA: { type: 'array', items: { type: 'string' } },
    bulletsB: { type: 'array', items: { type: 'string' } },
    flag: { type: 'boolean' },
  },
  required: ['primary', 'secondary', 'tertiary', 'value', 'number', 'number2', 'status', 'bulletsA', 'bulletsB', 'flag'],
  additionalProperties: false,
};

const transportImage = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    caption: { type: 'string' },
    altText: { type: 'string' },
  },
  required: ['url', 'caption', 'altText'],
  additionalProperties: false,
};

const transportSlide = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: slideTypes },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    kicker: { type: 'string' },
    insight: { type: 'string' },
    recommendation: { type: 'string' },
    source: { type: 'string' },
    speakerNotes: { type: 'string' },
    bullets: { type: 'array', items: { type: 'string' } },
    chartType: { type: 'string', enum: ['bar', 'line', 'column'] },
    items: { type: 'array', items: transportItem },
    images: { type: 'array', items: transportImage },
    quote: { type: 'string' },
    author: { type: 'string' },
  },
  required: [
    'type', 'title', 'subtitle', 'kicker', 'insight', 'recommendation', 'source', 'speakerNotes',
    'bullets', 'chartType', 'items', 'images', 'quote', 'author',
  ],
  additionalProperties: false,
};

export const PRESENTATION_TRANSPORT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    version: { type: 'integer' },
    title: { type: 'string' },
    archetype: { type: 'string', enum: archetypes },
    audience: { type: 'string' },
    purpose: { type: 'string' },
    decisionAsk: { type: 'string' },
    period: { type: 'string' },
    communicationStandard: { type: 'string', enum: standards },
    sourceNotes: { type: 'array', items: { type: 'string' } },
    slides: { type: 'array', items: transportSlide },
  },
  required: ['version', 'title', 'archetype', 'audience', 'purpose', 'decisionAsk', 'period', 'communicationStandard', 'sourceNotes', 'slides'],
  additionalProperties: false,
});

export const PRESENTATION_TRANSPORT_SCHEMA_TEXT = `
POWERPOINT TRANSPORT CONTRACT
Return one JSON object with version=2 and deck metadata plus slides.
Each slide has the common narrative fields plus one compact "items" array. Quantora deterministically converts items into the full editable Presentation V2 schema before the hard quality gate.

For every structured composition below, provide AT LEAST TWO meaningful items unless the user explicitly requested fewer and the composition still makes sense:
- kpi_strip: primary=label, value=value, tertiary=delta, status=RAG, secondary=note.
- timeline: value=date/time, primary=label, secondary=detail, status=RAG.
- comparison: primary=option name, secondary=summary, bulletsA=pros, bulletsB=cons, tertiary=score, flag=recommended.
- status_dashboard: primary=label, status=RAG, value=metric, secondary=detail.
- roadmap: primary=action title, value=owner, tertiary=timing, status=RAG, secondary=detail.
- risk_matrix: primary=risk, number=likelihood 1-5, number2=impact 1-5, secondary=mitigation, value=owner, status=RAG.
- financial_case: primary=label, value=value, secondary=note, status=RAG. Never invent financial values.
- chart_insight: primary=data label, number=factual numeric value. Never invent numeric data.
- framework: primary=heading, secondary=detail, value=metric, status=RAG.
- two_column: primary=column heading, bulletsA=column bullets.

For cover, section, executive_summary, evidence, bullets, quote and appendix, items may be empty; use bullets/images/quote as appropriate.
Unused item fields MUST be the neutral empty value required by the schema: empty string, 0, false, empty array, and status="neutral".
Choose a semantic slide type only when you can populate the corresponding evidence structure. If evidence is unavailable, use a truthful text composition rather than fabricating numbers or facts.
`;

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function status(value) {
  const normalized = text(value).toLowerCase();
  return statuses.includes(normalized) ? normalized : 'neutral';
}

function baseTransportItem(overrides = {}) {
  return {
    primary: '', secondary: '', tertiary: '', value: '', number: 0, number2: 0,
    status: 'neutral', bulletsA: [], bulletsB: [], flag: false,
    ...overrides,
  };
}

export function materializePresentationTransportSpec(input = {}) {
  return {
    version: 2,
    title: text(input.title),
    archetype: text(input.archetype) || 'general',
    audience: text(input.audience),
    purpose: text(input.purpose),
    decisionAsk: text(input.decisionAsk),
    period: text(input.period),
    communicationStandard: text(input.communicationStandard) || 'general',
    sourceNotes: list(input.sourceNotes).map(text).filter(Boolean),
    slides: list(input.slides).map((rawSlide) => {
      const slide = rawSlide && typeof rawSlide === 'object' ? rawSlide : {};
      const type = slideTypes.includes(text(slide.type)) ? text(slide.type) : 'bullets';
      const items = list(slide.items);
      const materialized = {
        type,
        title: text(slide.title),
        subtitle: text(slide.subtitle),
        kicker: text(slide.kicker),
        insight: text(slide.insight),
        recommendation: text(slide.recommendation),
        source: text(slide.source),
        speakerNotes: text(slide.speakerNotes),
        bullets: list(slide.bullets).map(text).filter(Boolean),
        kpis: [],
        data: [],
        chartType: ['bar', 'line', 'column'].includes(text(slide.chartType)) ? text(slide.chartType) : 'bar',
        timeline: [],
        columns: [],
        options: [],
        statuses: [],
        risks: [],
        actions: [],
        financials: [],
        framework: [],
        images: list(slide.images).map((image) => ({
          url: text(image?.url), caption: text(image?.caption), altText: text(image?.altText),
        })).filter((image) => image.url),
        quote: text(slide.quote),
        author: text(slide.author),
      };

      if (type === 'kpi_strip') {
        materialized.kpis = items.map((item) => ({
          label: text(item?.primary), value: text(item?.value), delta: text(item?.tertiary),
          status: status(item?.status), note: text(item?.secondary),
        })).filter((item) => item.label && item.value);
      } else if (type === 'timeline') {
        materialized.timeline = items.map((item) => ({
          date: text(item?.value), label: text(item?.primary), detail: text(item?.secondary), status: status(item?.status),
        })).filter((item) => item.label);
      } else if (type === 'comparison') {
        materialized.options = items.map((item) => ({
          name: text(item?.primary), summary: text(item?.secondary),
          pros: list(item?.bulletsA).map(text).filter(Boolean), cons: list(item?.bulletsB).map(text).filter(Boolean),
          score: text(item?.tertiary), recommended: item?.flag === true,
        })).filter((item) => item.name);
      } else if (type === 'status_dashboard') {
        materialized.statuses = items.map((item) => ({
          label: text(item?.primary), status: status(item?.status), metric: text(item?.value), detail: text(item?.secondary),
        })).filter((item) => item.label);
      } else if (type === 'roadmap') {
        materialized.actions = items.map((item) => ({
          title: text(item?.primary), owner: text(item?.value), timing: text(item?.tertiary),
          status: status(item?.status), detail: text(item?.secondary),
        })).filter((item) => item.title);
      } else if (type === 'risk_matrix') {
        materialized.risks = items.map((item) => ({
          risk: text(item?.primary), likelihood: number(item?.number), impact: number(item?.number2),
          mitigation: text(item?.secondary), owner: text(item?.value), status: status(item?.status),
        })).filter((item) => item.risk);
      } else if (type === 'financial_case') {
        materialized.financials = items.map((item) => ({
          label: text(item?.primary), value: text(item?.value), note: text(item?.secondary), status: status(item?.status),
        })).filter((item) => item.label && item.value);
      } else if (type === 'chart_insight') {
        materialized.data = items.map((item) => ({ label: text(item?.primary), value: number(item?.number) }))
          .filter((item) => item.label && Number.isFinite(item.value));
      } else if (type === 'framework') {
        materialized.framework = items.map((item) => ({
          heading: text(item?.primary), detail: text(item?.secondary), metric: text(item?.value), status: status(item?.status),
        })).filter((item) => item.heading);
      } else if (type === 'two_column') {
        materialized.columns = items.map((item) => ({
          heading: text(item?.primary), bullets: list(item?.bulletsA).map(text).filter(Boolean),
        })).filter((item) => item.heading || item.bullets.length);
      }

      return materialized;
    }),
  };
}

export function presentationSpecToTransport(spec = {}) {
  return {
    version: 2,
    title: text(spec.title),
    archetype: text(spec.archetype) || 'general',
    audience: text(spec.audience),
    purpose: text(spec.purpose),
    decisionAsk: text(spec.decisionAsk),
    period: text(spec.period),
    communicationStandard: text(spec.communicationStandard) || 'general',
    sourceNotes: list(spec.sourceNotes).map(text).filter(Boolean),
    slides: list(spec.slides).map((slide) => {
      const type = slideTypes.includes(text(slide?.type)) ? text(slide.type) : 'bullets';
      let items = [];

      if (type === 'kpi_strip') {
        items = list(slide.kpis).map((item) => baseTransportItem({
          primary: text(item?.label), value: text(item?.value), tertiary: text(item?.delta), status: status(item?.status), secondary: text(item?.note),
        }));
      } else if (type === 'timeline') {
        items = list(slide.timeline).map((item) => baseTransportItem({
          value: text(item?.date), primary: text(item?.label), secondary: text(item?.detail), status: status(item?.status),
        }));
      } else if (type === 'comparison') {
        items = list(slide.options).map((item) => baseTransportItem({
          primary: text(item?.name), secondary: text(item?.summary), tertiary: text(item?.score),
          bulletsA: list(item?.pros).map(text).filter(Boolean), bulletsB: list(item?.cons).map(text).filter(Boolean), flag: item?.recommended === true,
        }));
      } else if (type === 'status_dashboard') {
        items = list(slide.statuses).map((item) => baseTransportItem({
          primary: text(item?.label), status: status(item?.status), value: text(item?.metric), secondary: text(item?.detail),
        }));
      } else if (type === 'roadmap') {
        items = list(slide.actions).map((item) => baseTransportItem({
          primary: text(item?.title), value: text(item?.owner), tertiary: text(item?.timing), status: status(item?.status), secondary: text(item?.detail),
        }));
      } else if (type === 'risk_matrix') {
        items = list(slide.risks).map((item) => baseTransportItem({
          primary: text(item?.risk), number: number(item?.likelihood), number2: number(item?.impact),
          secondary: text(item?.mitigation), value: text(item?.owner), status: status(item?.status),
        }));
      } else if (type === 'financial_case') {
        items = list(slide.financials).map((item) => baseTransportItem({
          primary: text(item?.label), value: text(item?.value), secondary: text(item?.note), status: status(item?.status),
        }));
      } else if (type === 'chart_insight') {
        items = list(slide.data).map((item) => baseTransportItem({ primary: text(item?.label), number: number(item?.value) }));
      } else if (type === 'framework') {
        items = list(slide.framework).map((item) => baseTransportItem({
          primary: text(item?.heading), secondary: text(item?.detail), value: text(item?.metric), status: status(item?.status),
        }));
      } else if (type === 'two_column') {
        items = list(slide.columns).map((item) => baseTransportItem({
          primary: text(item?.heading), bulletsA: list(item?.bullets).map(text).filter(Boolean),
        }));
      }

      return {
        type,
        title: text(slide?.title),
        subtitle: text(slide?.subtitle),
        kicker: text(slide?.kicker),
        insight: text(slide?.insight),
        recommendation: text(slide?.recommendation),
        source: text(slide?.source),
        speakerNotes: text(slide?.speakerNotes),
        bullets: list(slide?.bullets).map(text).filter(Boolean),
        chartType: ['bar', 'line', 'column'].includes(text(slide?.chartType)) ? text(slide.chartType) : 'bar',
        items,
        images: list(slide?.images).map((image) => ({
          url: text(image?.url), caption: text(image?.caption), altText: text(image?.altText),
        })).filter((image) => image.url),
        quote: text(slide?.quote),
        author: text(slide?.author),
      };
    }),
  };
}
