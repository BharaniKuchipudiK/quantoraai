const ARCHETYPES = Object.freeze([
  'strategy',
  'executive_briefing',
  'business_case',
  'qbr',
  'project_status',
  'proposal',
  'academic_research',
  'general',
]);

const EXECUTIVE_TERMS = /\b(board|ceo|cfo|cio|cto|c-suite|executive|steerco|steering committee|leadership|management committee|investment committee)\b/i;
const STRATEGY_TERMS = /\b(strategy|strategic|transformation|target operating model|operating model|roadmap|north star|future state|vision|market entry|growth strategy)\b/i;
const BUSINESS_CASE_TERMS = /\b(business case|investment|roi|return on investment|npv|irr|payback|cost benefit|funding|budget approval|capex|opex)\b/i;
const QBR_TERMS = /\b(qbr|quarterly business review|quarterly review|business review|quarter performance|quarterly performance)\b/i;
const STATUS_TERMS = /\b(project status|program status|programme status|weekly status|status update|rag|raid|milestone|dependency|escalation)\b/i;
const PROPOSAL_TERMS = /\b(proposal|pitch|client proposal|sales deck|solution proposal|rfp|tender|bid)\b/i;
const RESEARCH_TERMS = /\b(research|literature review|methodology|hypothesis|academic|study findings|experiment|thesis|dissertation)\b/i;
const DECISION_TERMS = /\b(decide|decision|approve|approval|recommend|recommendation|choose|select|go\/no-go|authorize|authorise|fund|endorse)\b/i;
const FINANCIAL_TERMS = /\b(revenue|margin|ebit|ebitda|cost|savings|benefit|investment|roi|npv|irr|budget|forecast|financial|business case)\b/i;
const TECHNICAL_TERMS = /\b(architecture|technology|cloud|platform|integration|api|cyber|security|data architecture|application|infrastructure|servicenow|oracle|sap)\b/i;
const REGULATED_TERMS = /\b(regulatory|regulator|audit|compliance|risk committee|bank|banking|insurance|healthcare|government|public sector)\b/i;
const SOURCE_TERMS = /\b(source|sources|evidence|data|attachment|attached|report|study|survey|benchmark|research|analysis)\b/i;
const MULTI_OPTION_TERMS = /\b(option|options|alternative|alternatives|scenario|scenarios|trade-off|tradeoff|compare|comparison)\b/i;

function clean(value, max = 12_000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function historyText(history = []) {
  return (Array.isArray(history) ? history : [])
    .slice(-12)
    .map((message) => clean(message?.text ?? message?.content, 2_000))
    .filter(Boolean)
    .join(' ');
}

function sessionText(sessionContext = null) {
  if (!sessionContext || typeof sessionContext !== 'object') return '';
  const values = [sessionContext.goal, sessionContext.understanding, ...(Array.isArray(sessionContext.facts) ? sessionContext.facts : [])];
  return values.map((value) => clean(value, 1_200)).filter(Boolean).join(' ');
}

function inferArchetype(text) {
  if (QBR_TERMS.test(text)) return 'qbr';
  if (STATUS_TERMS.test(text)) return 'project_status';
  if (BUSINESS_CASE_TERMS.test(text)) return 'business_case';
  if (RESEARCH_TERMS.test(text)) return 'academic_research';
  if (PROPOSAL_TERMS.test(text)) return 'proposal';
  if (STRATEGY_TERMS.test(text)) return 'strategy';
  if (EXECUTIVE_TERMS.test(text)) return 'executive_briefing';
  return 'general';
}

function inferAudience(text) {
  const ordered = [
    [/\binvestment committee\b/i, 'Investment Committee'],
    [/\bboard\b/i, 'Board / Board-level audience'],
    [/\bceo\b/i, 'CEO / executive leadership'],
    [/\bcfo\b/i, 'CFO / finance leadership'],
    [/\bcio\b/i, 'CIO / technology leadership'],
    [/\bcto\b/i, 'CTO / technology leadership'],
    [/\bsteerco|steering committee\b/i, 'Steering Committee'],
    [/\bexecutive|c-suite|leadership|management committee\b/i, 'Executive leadership'],
    [/\bclient\b/i, 'Client stakeholders'],
  ];
  for (const [pattern, audience] of ordered) if (pattern.test(text)) return audience;
  return 'Not explicitly stated — preserve the user wording and avoid inventing seniority';
}

function inferPurpose(archetype, text) {
  if (DECISION_TERMS.test(text)) return 'Enable a clear management decision or approval using evidence, trade-offs and an explicit recommendation.';
  if (archetype === 'qbr') return 'Explain performance versus commitments, surface management issues and align next-quarter priorities.';
  if (archetype === 'project_status') return 'Communicate delivery truth, risks, dependencies, decisions and near-term actions.';
  if (archetype === 'business_case') return 'Establish the case for investment, compare alternatives and make the approval path explicit.';
  if (archetype === 'strategy') return 'Frame the strategic problem, choices, implications and executable path forward.';
  if (archetype === 'proposal') return 'Demonstrate client relevance, solution fit, value and a credible path to action.';
  if (archetype === 'academic_research') return 'Present the research question, evidence, findings, interpretation, limitations and sources.';
  return 'Convert the user request into a coherent, professional narrative with a clear takeaway on every slide.';
}

function scoreComplexity(text, archetype) {
  let score = 1;
  const reasons = [];

  const add = (points, reason) => {
    score += points;
    reasons.push(reason);
  };

  if (EXECUTIVE_TERMS.test(text)) add(2, 'senior/executive audience');
  if (DECISION_TERMS.test(text)) add(2, 'decision or approval required');
  if (FINANCIAL_TERMS.test(text)) add(1, 'financial/economic reasoning');
  if (MULTI_OPTION_TERMS.test(text)) add(1, 'alternatives/trade-offs');
  if (REGULATED_TERMS.test(text)) add(1, 'regulated or high-governance context');
  if (TECHNICAL_TERMS.test(text) && (EXECUTIVE_TERMS.test(text) || STRATEGY_TERMS.test(text))) add(1, 'technical-to-executive translation');
  if (SOURCE_TERMS.test(text)) add(1, 'source/evidence synthesis');
  if (text.length > 3_500) add(1, 'large briefing/context');
  if (['strategy', 'business_case', 'executive_briefing'].includes(archetype)) add(1, `${archetype.replace('_', ' ')} narrative`);

  return { score: Math.max(1, Math.min(10, score)), reasons: [...new Set(reasons)] };
}

function tierFor(score) {
  if (score >= 8) return 'frontier';
  if (score >= 5) return 'balanced';
  return 'economy';
}

const NON_CLAUDE_MODEL_POLICY = Object.freeze({
  economy: [
    { adapter: 'gemini', model: 'gemini-3.6-flash', role: 'draft-and-structure' },
  ],
  balanced: [
    { adapter: 'openrouter', model: 'openai/gpt-5.6-terra', role: 'primary-director' },
    { adapter: 'gemini', model: 'gemini-3.6-flash', role: 'fallback' },
  ],
  frontier: [
    { adapter: 'openrouter', model: 'openai/gpt-5.6-sol', role: 'primary-director' },
    { adapter: 'openrouter', model: 'openai/gpt-5.6-terra', role: 'fallback' },
    { adapter: 'gemini', model: 'gemini-3.6-flash', role: 'fallback' },
  ],
});

const CLAUDE_OPTIONAL_POLICY = Object.freeze({
  frontier: { adapter: 'anthropic', model: 'claude-sonnet-5', role: 'optional-frontier-director' },
});

function candidateModels(tier, { allowAnthropic = false, freeFirst = false } = {}) {
  if (freeFirst) {
    return [{ adapter: 'gemini', model: 'gemini-3.6-flash', role: 'free-tier-first' }];
  }
  const candidates = [...NON_CLAUDE_MODEL_POLICY[tier]];
  if (allowAnthropic && tier === 'frontier') candidates.push(CLAUDE_OPTIONAL_POLICY.frontier);
  return candidates;
}

function storylineRules(archetype) {
  const common = [
    'Answer first: every body slide title must state the takeaway, not merely name the topic.',
    'One governing message per slide; use evidence, implications and action rather than decorative filler.',
    'Preserve evidence boundaries and never invent numbers, dates, benchmarks or citations.',
    'Use the Presentation V2 semantic composition that best communicates the point; avoid repeated box/card layouts.',
  ];

  const specific = {
    strategy: [
      'Open with the strategic tension and management implication.',
      'Make choices and trade-offs explicit before recommending a path.',
      'Translate the recommendation into sequenced execution with ownership and risks.',
    ],
    executive_briefing: [
      'Lead with the decision or management implication.',
      'Minimize background; prioritize facts, implications, decisions and actions.',
    ],
    business_case: [
      'Separate strategic rationale, economics, options, risks and decision ask.',
      'Do not fabricate ROI/NPV/payback; label missing economics as evidence gaps.',
    ],
    qbr: [
      'Show outcomes versus commitments, trends, delivery/commercial health, risks and next-quarter priorities.',
    ],
    project_status: [
      'Prioritize RAG health, milestone movement, RAID, decisions/escalations and next-period actions.',
    ],
    proposal: [
      'Connect client context to differentiated solution, value, proof and mobilization path.',
    ],
    academic_research: [
      'Separate research question, methodology, findings, interpretation, limitations and sources.',
    ],
    general: [],
  };
  return [...common, ...(specific[archetype] || [])];
}

export function buildPclPresentationDirectorPlan({
  prompt = '',
  sessionContext = null,
  history = [],
  allowAnthropic = false,
  freeFirst = false,
} = {}) {
  const current = clean(prompt);
  const context = clean(`${sessionText(sessionContext)} ${historyText(history)}`, 20_000);
  const combined = clean(`${current} ${context}`, 24_000);
  const archetype = inferArchetype(combined);
  const complexity = scoreComplexity(combined, archetype);
  const tier = tierFor(complexity.score);
  const audience = inferAudience(combined);
  const purpose = inferPurpose(archetype, combined);
  const decisionOriented = DECISION_TERMS.test(combined) || ['strategy', 'business_case', 'executive_briefing'].includes(archetype);

  return {
    version: 1,
    archetype,
    audience,
    purpose,
    decisionOriented,
    complexityScore: complexity.score,
    complexityReasons: complexity.reasons,
    modelTier: tier,
    modelCandidates: candidateModels(tier, { allowAnthropic, freeFirst }),
    communicationStandard: archetype === 'academic_research' ? 'academic' : (EXECUTIVE_TERMS.test(combined) || decisionOriented ? 'consulting' : 'general'),
    storylineRules: storylineRules(archetype),
  };
}

export function compilePclPresentationBrief(input = {}) {
  const plan = buildPclPresentationDirectorPlan(input);
  const facts = Array.isArray(input?.sessionContext?.facts)
    ? input.sessionContext.facts.map((fact) => clean(fact, 600)).filter(Boolean).slice(-12)
    : [];

  return {
    plan,
    text: [
      'PCL PRESENTATION DIRECTOR — COMPILED BRIEF',
      `Archetype: ${plan.archetype}`,
      `Audience: ${plan.audience}`,
      `Purpose: ${plan.purpose}`,
      `Communication standard: ${plan.communicationStandard}`,
      `Decision-oriented: ${plan.decisionOriented ? 'yes' : 'no'}`,
      `Complexity: ${plan.complexityScore}/10 (${plan.modelTier})`,
      plan.complexityReasons.length ? `Complexity drivers: ${plan.complexityReasons.join('; ')}` : 'Complexity drivers: routine presentation task',
      'Storyline requirements:',
      ...plan.storylineRules.map((rule) => `- ${rule}`),
      facts.length ? 'Established user/context facts:' : '',
      ...facts.map((fact) => `- ${fact}`),
      'Do not invent missing facts. Where the brief is incomplete, preserve the gap explicitly rather than making up precision.',
    ].filter(Boolean).join('\n'),
  };
}

export { ARCHETYPES, NON_CLAUDE_MODEL_POLICY };
