import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESENTATION_V2_VERSION,
  buildPresentationPreviewHtml,
  classifyPresentationSlide,
  normalizePresentationSpec,
  validatePresentationSpec,
} from './presentation-v2.js';

const baseCover = { type: 'cover', title: 'Q3 service performance requires targeted recovery action', subtitle: 'Quarterly Business Review' };

test('normalizes legacy chart and matrix types into V2 semantic compositions', () => {
  assert.equal(classifyPresentationSlide({ type: 'data_viz', data: [{ label: 'Q1', value: 1 }] }, 1), 'chart_insight');
  assert.equal(classifyPresentationSlide({ type: 'matrix', bullets: ['A', 'B'] }, 1), 'framework');
});

test('normalization preserves briefing metadata and semantic payloads', () => {
  const spec = normalizePresentationSpec({
    title: 'Q3 QBR',
    archetype: 'qbr',
    audience: 'Client CIO and executive leadership',
    purpose: 'Review outcomes and agree Q4 recovery priorities',
    period: 'Q3 FY27',
    communicationStandard: 'executive',
    sourceNotes: ['ServiceNow KPI extract'],
    slides: [
      baseCover,
      {
        type: 'executive_summary',
        title: 'Delivery remained stable, but availability needs executive attention',
        kpis: [
          { label: 'SLA', value: '99.1%', delta: '-0.7pp vs target', status: 'amber' },
          { label: 'P1 incidents', value: '4', status: 'red' },
        ],
        insight: 'Prioritize resilience remediation in Q4.',
      },
    ],
  });
  assert.equal(spec.version, PRESENTATION_V2_VERSION);
  assert.equal(spec.archetype, 'qbr');
  assert.equal(spec.audience, 'Client CIO and executive leadership');
  assert.equal(spec.slides[1].kpis.length, 2);
  assert.equal(spec.slides[1].kpis[0].status, 'amber');
});

test('rejects a seven-slide deck that repeats an elementary body composition', () => {
  const slides = [baseCover];
  for (let i = 0; i < 6; i += 1) {
    slides.push({
      type: 'bullets',
      title: `Takeaway ${i + 1}: delivery action is required`,
      bullets: ['Evidence-backed point one', 'Evidence-backed point two'],
    });
  }
  const result = validatePresentationSpec({ title: 'Weak deck', archetype: 'general', slides });
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => /repeat the same bullets composition/i.test(issue)));
  const shipped = validatePresentationSpec({ title: 'Weak deck', archetype: 'general', slides }, { consultingGate: 'soft' });
  assert.equal(shipped.valid, true);
  assert.ok(shipped.warnings.some((issue) => /repeat the same bullets composition/i.test(issue)));
});

test('accepts a context-appropriate QBR with diverse semantic compositions', () => {
  const result = validatePresentationSpec({
    title: 'Q3 QBR',
    archetype: 'qbr',
    audience: 'CIO and client leadership',
    purpose: 'Review outcomes and agree Q4 priorities',
    slides: [
      baseCover,
      {
        type: 'executive_summary',
        title: 'Core delivery commitments were met, while resilience remains the main Q4 concern',
        kpis: [
          { label: 'Milestones', value: '11/12', status: 'green' },
          { label: 'SLA', value: '99.1%', status: 'amber' },
          { label: 'P1', value: '4', status: 'red' },
        ],
        insight: 'Recovery actions should focus on platform resilience rather than broad delivery intervention.',
      },
      {
        type: 'chart_insight',
        title: 'Availability declined for the second consecutive quarter',
        data: [{ label: 'Q1', value: 99.8 }, { label: 'Q2', value: 99.5 }, { label: 'Q3', value: 99.1 }],
        insight: 'The deterioration is concentrated in two platform services.',
      },
      {
        type: 'status_dashboard',
        title: 'Schedule and scope remain controlled; platform quality is amber',
        statuses: [
          { label: 'Scope', status: 'green', metric: 'On plan', detail: 'No material scope variance' },
          { label: 'Schedule', status: 'green', metric: '11/12', detail: 'One milestone moved' },
          { label: 'Quality', status: 'amber', metric: '4 P1s', detail: 'Resilience issue under action' },
        ],
      },
      {
        type: 'risk_matrix',
        title: 'Two dependencies account for most Q4 delivery exposure',
        risks: [
          { risk: 'Vendor interface readiness', likelihood: 4, impact: 5, mitigation: 'Daily integration war room', owner: 'Integration Lead', status: 'red' },
          { risk: 'Environment capacity', likelihood: 3, impact: 4, mitigation: 'Capacity uplift approved', owner: 'Platform', status: 'amber' },
        ],
      },
      {
        type: 'roadmap',
        title: 'Q4 priorities concentrate investment on resilience and dependency closure',
        actions: [
          { title: 'Complete resilience test', owner: 'Platform', timing: '30 days', status: 'amber', detail: 'Close recovery evidence gap' },
          { title: 'Close vendor interface', owner: 'Integration', timing: '45 days', status: 'amber', detail: 'Remove critical-path dependency' },
          { title: 'Stabilize operations', owner: 'Service Mgmt', timing: 'Quarter', status: 'green', detail: 'Reduce repeat incidents' },
        ],
      },
      {
        type: 'appendix',
        title: 'Source data and definitions',
        bullets: ['ServiceNow operational KPI extract', 'Approved integrated project plan'],
      },
    ],
  });
  assert.equal(result.valid, true, result.issues.join('\n'));
  assert.ok(new Set(result.spec.slides.map((slide) => slide.type)).size >= 5);
});

test('preview is generated from the same semantic spec and carries the executive visual regions', () => {
  const html = buildPresentationPreviewHtml({
    title: 'CIO business case',
    archetype: 'business_case',
    audience: 'CIO',
    decisionAsk: 'Approve phase-one funding',
    slides: [
      { type: 'cover', title: 'A focused resilience investment reduces the largest operational exposure' },
      {
        type: 'executive_summary',
        title: 'A targeted investment closes the two material resilience gaps',
        kpis: [
          { label: 'Investment', value: '$2.4M', status: 'neutral' },
          { label: 'Risk reduction', value: 'High', status: 'green' },
        ],
        insight: 'Approve phase-one funding to address the highest-severity gaps first.',
      },
      {
        type: 'comparison',
        title: 'Option B provides the best balance of control and speed',
        options: [
          { name: 'Option A', summary: 'Minimal change', pros: ['Lower cost'], cons: ['Residual risk'] },
          { name: 'Option B', summary: 'Targeted remediation', pros: ['Faster risk reduction'], cons: ['Moderate investment'], recommended: true },
        ],
      },
      {
        type: 'roadmap',
        title: 'The investment can be mobilized in three controlled waves',
        actions: [
          { title: 'Mobilize', timing: '0–30 days', status: 'green' },
          { title: 'Remediate', timing: '31–60 days', status: 'amber' },
        ],
      },
      {
        type: 'financial_case',
        title: 'The requested investment is concentrated in the highest-value controls',
        financials: [{ label: 'Investment', value: '$2.4M' }, { label: 'Contingency', value: '$0.2M' }],
        recommendation: 'Approve phase-one funding.',
      },
    ],
  });
  assert.match(html, /class="kpis"/);
  assert.match(html, /class="compare"/);
  assert.match(html, /class="roadmap(?: roadmap-track)?"/);
  assert.match(html, /data-visual-system="consulting-v3"/);
  assert.match(html, /Approve phase-one funding/);
});