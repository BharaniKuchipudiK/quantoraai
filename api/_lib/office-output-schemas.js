const status = { type: 'string', enum: ['green', 'amber', 'red', 'neutral'] };

const image = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    caption: { type: 'string' },
    altText: { type: 'string' },
  },
  required: ['url', 'caption', 'altText'],
  additionalProperties: false,
};

const presentationSlide = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: [
        'cover', 'section', 'executive_summary', 'kpi_strip', 'timeline', 'comparison',
        'status_dashboard', 'roadmap', 'risk_matrix', 'financial_case', 'chart_insight',
        'framework', 'two_column', 'evidence', 'bullets', 'quote', 'appendix',
      ],
      description: 'Choose a semantic composition only when its matching structured payload below can be populated.',
    },
    title: { type: 'string', description: 'Assertion-led takeaway headline. Use an empty string only when genuinely inapplicable.' },
    subtitle: { type: 'string' },
    kicker: { type: 'string' },
    insight: { type: 'string' },
    recommendation: { type: 'string' },
    source: { type: 'string' },
    speakerNotes: { type: 'string' },
    bullets: { type: 'array', items: { type: 'string' } },
    kpis: {
      type: 'array',
      description: 'For kpi_strip provide at least two evidence-backed KPI items; otherwise use an empty array.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' }, value: { type: 'string' }, delta: { type: 'string' }, status, note: { type: 'string' },
        },
        required: ['label', 'value', 'delta', 'status', 'note'],
        additionalProperties: false,
      },
    },
    data: {
      type: 'array',
      description: 'For chart_insight provide at least two factual numeric points; never invent numbers. Otherwise use an empty array.',
      items: {
        type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' } },
        required: ['label', 'value'], additionalProperties: false,
      },
    },
    chartType: { type: 'string', enum: ['bar', 'line', 'column'] },
    timeline: {
      type: 'array',
      description: 'For timeline provide at least two events; otherwise use an empty array.',
      items: {
        type: 'object',
        properties: { date: { type: 'string' }, label: { type: 'string' }, detail: { type: 'string' }, status },
        required: ['date', 'label', 'detail', 'status'], additionalProperties: false,
      },
    },
    columns: {
      type: 'array',
      description: 'For two_column provide at least two columns; otherwise use an empty array.',
      items: {
        type: 'object', properties: { heading: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } } },
        required: ['heading', 'bullets'], additionalProperties: false,
      },
    },
    options: {
      type: 'array',
      description: 'For comparison provide at least two options with real trade-offs; otherwise use an empty array.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' }, summary: { type: 'string' }, pros: { type: 'array', items: { type: 'string' } },
          cons: { type: 'array', items: { type: 'string' } }, score: { type: 'string' }, recommended: { type: 'boolean' },
        },
        required: ['name', 'summary', 'pros', 'cons', 'score', 'recommended'], additionalProperties: false,
      },
    },
    statuses: {
      type: 'array',
      description: 'For status_dashboard provide at least two statuses; otherwise use an empty array.',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, status, metric: { type: 'string' }, detail: { type: 'string' } },
        required: ['label', 'status', 'metric', 'detail'], additionalProperties: false,
      },
    },
    risks: {
      type: 'array',
      description: 'For risk_matrix provide at least two genuine risks; otherwise use an empty array.',
      items: {
        type: 'object',
        properties: {
          risk: { type: 'string' }, likelihood: { type: 'integer' }, impact: { type: 'integer' }, mitigation: { type: 'string' },
          owner: { type: 'string' }, status,
        },
        required: ['risk', 'likelihood', 'impact', 'mitigation', 'owner', 'status'], additionalProperties: false,
      },
    },
    actions: {
      type: 'array',
      description: 'For roadmap provide at least two concrete actions; otherwise use an empty array.',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, owner: { type: 'string' }, timing: { type: 'string' }, status, detail: { type: 'string' } },
        required: ['title', 'owner', 'timing', 'status', 'detail'], additionalProperties: false,
      },
    },
    financials: {
      type: 'array',
      description: 'For financial_case provide at least two supplied/attributable financial items, or use factual data points; otherwise empty.',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, value: { type: 'string' }, note: { type: 'string' }, status },
        required: ['label', 'value', 'note', 'status'], additionalProperties: false,
      },
    },
    framework: {
      type: 'array',
      description: 'For framework provide at least two components, or use at least two bullets; otherwise empty.',
      items: {
        type: 'object',
        properties: { heading: { type: 'string' }, detail: { type: 'string' }, metric: { type: 'string' }, status },
        required: ['heading', 'detail', 'metric', 'status'], additionalProperties: false,
      },
    },
    images: { type: 'array', items: image },
    quote: { type: 'string' },
    author: { type: 'string' },
  },
  required: [
    'type', 'title', 'subtitle', 'kicker', 'insight', 'recommendation', 'source', 'speakerNotes', 'bullets',
    'kpis', 'data', 'chartType', 'timeline', 'columns', 'options', 'statuses', 'risks', 'actions', 'financials',
    'framework', 'images', 'quote', 'author',
  ],
  additionalProperties: false,
};

const powerpoint = {
  type: 'object',
  properties: {
    version: { type: 'integer', enum: [2] },
    title: { type: 'string' },
    archetype: { type: 'string', enum: ['qbr', 'business_case', 'project_status', 'executive_briefing', 'academic_research', 'strategy', 'proposal', 'general'] },
    audience: { type: 'string' },
    purpose: { type: 'string' },
    decisionAsk: { type: 'string' },
    period: { type: 'string' },
    communicationStandard: { type: 'string', enum: ['executive', 'consulting', 'operational', 'technical', 'academic', 'analytical', 'general'] },
    sourceNotes: { type: 'array', items: { type: 'string' } },
    slides: { type: 'array', items: presentationSlide },
  },
  required: ['version', 'title', 'archetype', 'audience', 'purpose', 'decisionAsk', 'period', 'communicationStandard', 'sourceNotes', 'slides'],
  additionalProperties: false,
};

const word = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
          bullets: { type: 'array', items: { type: 'string' } },
          images: { type: 'array', items: image },
        },
        required: ['heading', 'paragraphs', 'bullets', 'images'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'sections'],
  additionalProperties: false,
};

const excelCell = {
  type: 'object',
  properties: {
    value: { anyOf: [{ type: 'string' }, { type: 'number' }] },
    type: { type: 'string', enum: ['String', 'Number'] },
    fontWeight: { type: 'string', enum: ['', 'bold'] },
    format: { type: 'string' },
    backgroundColor: { type: 'string' },
    color: { type: 'string' },
    align: { type: 'string', enum: ['', 'left', 'center', 'right'] },
    wrap: { type: 'boolean' },
    fontSize: { type: 'number' },
  },
  required: ['value', 'type', 'fontWeight', 'format', 'backgroundColor', 'color', 'align', 'wrap', 'fontSize'],
  additionalProperties: false,
};

const excel = {
  type: 'object',
  properties: {
    filename: { type: 'string' },
    sheets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          data: { type: 'array', items: { type: 'array', items: excelCell } },
        },
        required: ['name', 'data'],
        additionalProperties: false,
      },
    },
  },
  required: ['filename', 'sheets'],
  additionalProperties: false,
};

export const OFFICE_OUTPUT_JSON_SCHEMAS = Object.freeze({ powerpoint, word, excel });
