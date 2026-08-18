import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGeneratedPresentationSpec, verifyPresentationReadability } from './presentation-generation-gate.js';

function deck(overrides = {}) {
  return {
    version: 2,
    title: 'Cloud Modernization Strategic Path Forward',
    archetype: 'strategy',
    audience: 'CIO and executive technology leadership',
    purpose: 'Choose the modernization path and authorize mobilization',
    decisionAsk: 'Approve the replatforming-led path and Phase 1 mobilization',
    period: 'Current Quarter',
    communicationStandard: 'consulting',
    sourceNotes: ['Qualitative decision framing; no fabricated quantitative evidence.'],
    slides: [
      {
        type: 'cover',
        title: 'Cloud Modernization Strategic Path Forward',
        subtitle: 'CIO decision briefing', kicker: '', insight: '', recommendation: '', source: '', speakerNotes: '',
        bullets: [], kpis: [], data: [], chartType: 'bar', timeline: [], columns: [], options: [], statuses: [], risks: [], actions: [], financials: [], framework: [], images: [], quote: '', author: '',
      },
      {
        type: 'executive_summary',
        title: 'Modernization now reduces risk and unlocks strategic agility',
        subtitle: '', kicker: 'Executive summary', insight: 'A phased replatforming path balances modernization value with delivery risk.', recommendation: 'Authorize Phase 1 mobilization.', source: '', speakerNotes: '',
        bullets: ['Current-state constraints limit agility.', 'Three paths carry different delivery trade-offs.', 'Phased replatforming provides the balanced path.'],
        kpis: [], data: [], chartType: 'bar', timeline: [], columns: [], options: [], statuses: [], risks: [], actions: [], financials: [], framework: [], images: [], quote: '', author: '',
      },
      {
        type: 'comparison',
        title: 'Why Replatform Wins the Trade-Off',
        subtitle: '', kicker: 'Options', insight: 'Replatforming provides the strongest balance of value, risk and pace.', recommendation: 'Select replatforming as the primary path.', source: '', speakerNotes: '', bullets: [], kpis: [], data: [], chartType: 'bar', timeline: [], columns: [],
        options: [
          { name: 'Rehost', summary: 'Fast migration with limited transformation.', pros: ['Lower near-term disruption'], cons: ['Technical debt remains'], score: 'Medium', recommended: false },
          { name: 'Replatform', summary: 'Selective modernization of priority workloads.', pros: ['Balanced value and delivery risk'], cons: ['Requires more planning'], score: 'High', recommended: true },
        ],
        statuses: [], risks: [], actions: [], financials: [], framework: [], images: [], quote: '', author: '',
      },
      {
        type: 'risk_matrix',
        title: 'Phased controls keep the highest migration risks manageable',
        subtitle: '', kicker: 'Risks', insight: 'Business continuity and skills risks can be reduced through phased delivery.', recommendation: '', source: '', speakerNotes: '', bullets: [], kpis: [], data: [], chartType: 'bar', timeline: [], columns: [], options: [], statuses: [],
        risks: [
          { risk: 'Business disruption', likelihood: 3, impact: 5, mitigation: 'Pilot with rollback plans', owner: 'Program Lead', status: 'amber' },
          { risk: 'Skills gap', likelihood: 4, impact: 4, mitigation: 'Upskill and augment', owner: 'CIO', status: 'amber' },
        ],
        actions: [], financials: [], framework: [], images: [], quote: '', author: '',
      },
      {
        type: 'roadmap',
        title: 'The first ninety days de-risk delivery before migration scales',
        subtitle: '', kicker: 'Execution', insight: 'Assessment and governance precede pilot migration.', recommendation: 'Begin Phase 1 after approval.', source: '', speakerNotes: '', bullets: [], kpis: [], data: [], chartType: 'bar', timeline: [], columns: [], options: [], statuses: [], risks: [],
        actions: [
          { title: 'Baseline workloads and business case', owner: 'CIO', timing: 'Days 1-30', status: 'green', detail: 'Confirm scope and evidence.' },
          { title: 'Establish governance and landing zone', owner: 'Cloud Lead', timing: 'Days 31-60', status: 'neutral', detail: 'Stand up guardrails.' },
        ],
        financials: [], framework: [], images: [], quote: '', author: '',
      },
    ],
    ...overrides,
  };
}

function repairedDeck() {
  const candidate = deck();
  candidate.slides[2].title = 'Replatforming balances modernization value with manageable delivery risk';
  return candidate;
}

test('generation gate rejects a structurally valid deck with a question-style executive headline', () => {
  const result = validateGeneratedPresentationSpec(deck());
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => /assertion-led executive headline/i.test(issue)));
});

test('generation gate accepts the same deck after the communication defect is repaired', () => {
  const result = validateGeneratedPresentationSpec(repairedDeck());
  assert.equal(result.valid, true, result.issues?.join('\n'));
});

test('readability gate rejects an executive summary that is likely to overflow', () => {
  const candidate = repairedDeck();
  candidate.slides[1].bullets = [
    'The current environment contains multiple legacy constraints that slow delivery, increase operational complexity, create dependency risk, and require substantial manual intervention across several teams.',
    'The modernization program needs governance, landing-zone controls, security architecture, operating-model changes, skills development, workload discovery, sequencing, and executive sponsorship before broad migration begins.',
    'Three migration paths have materially different trade-offs across speed, technical-debt reduction, delivery risk, organizational readiness, change impact, and the amount of redesign required before value is realized.',
    'A phased replatforming approach creates a balanced transition path while allowing the organization to validate assumptions, establish evidence, control risk, and preserve flexibility before scaling migration waves.',
  ];
  const result = verifyPresentationReadability(candidate);
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /bullet region is too dense|bullet 1 is too long/i.test(issue)));
});

test('readability gate rejects duplicated visible copy within a slide', () => {
  const candidate = repairedDeck();
  candidate.slides[1].subtitle = 'A phased replatforming path balances modernization value with delivery risk';
  candidate.slides[1].insight = 'A phased replatforming path balances modernization value with delivery risk';
  const result = verifyPresentationReadability(candidate);
  assert.equal(result.passed, false);
  assert.ok(result.issues.some((issue) => /repeats the same visible message/i.test(issue)));
});

test('readability gate accepts concise consulting-grade slide copy', () => {
  const result = verifyPresentationReadability(repairedDeck());
  assert.equal(result.passed, true, result.issues?.join('\n'));
});
