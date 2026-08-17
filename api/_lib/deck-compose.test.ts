import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileOfficeArtifact, composePresentation } from '../generate-office.js';
import { normalizeOfficeSpec, verifyCompiledOfficeArtifact } from './office-artifact.js';
import { normalizePresentationSpec, validatePresentationSpec } from './presentation-v2.js';

const require = createRequire(import.meta.url);
const pptxgenModule: any = require('pptxgenjs');
const PptxGenJS: any = pptxgenModule.default || pptxgenModule;
const jimpModule: any = require('jimp');
const Jimp: any = jimpModule.Jimp || jimpModule;
const JIMP_PNG: string = jimpModule.MIME_PNG ?? Jimp.MIME_PNG ?? 'image/png';

async function tinyPngDataUrl() {
  let img: any;
  if (jimpModule.Jimp) {
    img = new Jimp({ width: 40, height: 30, color: 0x22aa55ff });
  } else {
    img = await new Promise((resolve, reject) => {
      new Jimp(40, 30, 0x22aa55ff, (error: Error | null, image: any) => {
        if (error) reject(error);
        else resolve(image);
      });
    });
  }

  const buf = typeof img.getBufferAsync === 'function'
    ? await img.getBufferAsync(JIMP_PNG)
    : await img.getBuffer('image/png');
  return 'data:image/png;base64,' + Buffer.from(buf).toString('base64');
}

async function sampleSpec() {
  return {
    title: 'Quantora Strategy Review',
    slides: [
      { type: 'cover', title: 'Quantora Strategy Review', subtitle: 'FY26 outlook', author: 'Strategy Team' },
      { type: 'section', title: 'Where we stand' },
      { type: 'bullets', title: 'Momentum', subtitle: 'Three signals', bullets: ['Signups up 40%', 'Churn down', 'NPS 62'] },
      { type: 'bullets', title: 'Product', bullets: ['Decks ship', 'Preview parity'], images: [{ url: await tinyPngDataUrl(), caption: 'demo' }] },
      { type: 'data_viz', title: 'Revenue by quarter', data: [{ label: 'Q1', value: 50 }, { label: 'Q2', value: 75 }, { label: 'Q3', value: 110 }] },
      { type: 'matrix', title: 'Priorities', bullets: ['Now: reliability', 'Next: growth', 'Later: platform', 'Never: scope creep'] },
      { type: 'quote', quote: 'Ship the thing that actually works.', author: 'The team' },
    ],
  };
}

async function semanticV2Spec() {
  return normalizePresentationSpec({
    version: 2,
    title: 'Q3 Technology Services QBR',
    archetype: 'qbr',
    audience: 'Client CIO and executive leadership',
    purpose: 'Review Q3 outcomes and agree Q4 recovery priorities',
    period: 'Q3 FY27',
    communicationStandard: 'executive',
    sourceNotes: ['ServiceNow KPI extract', 'Approved integrated project plan'],
    slides: [
      {
        type: 'cover',
        title: 'Q3 delivery remained controlled while resilience became the primary Q4 concern',
        subtitle: 'Technology Services Quarterly Business Review',
        author: 'Engagement Leadership',
      },
      {
        type: 'executive_summary',
        title: 'Core commitments were met, but resilience now requires executive attention',
        kpis: [
          { label: 'Milestones', value: '11/12', delta: 'One moved to Q4', status: 'green' },
          { label: 'Availability', value: '99.1%', delta: '-0.7pp vs target', status: 'amber' },
          { label: 'P1 incidents', value: '4', delta: '+2 QoQ', status: 'red' },
          { label: 'CSAT', value: '4.5/5', delta: 'Stable', status: 'green' },
        ],
        bullets: ['Scope remained stable', 'Eleven of twelve milestones landed', 'Two platform services drove repeat incidents'],
        insight: 'Focus Q4 intervention on platform resilience and the remaining critical dependency rather than broad delivery reset.',
        source: 'Q3 service review pack',
      },
      {
        type: 'chart_insight',
        title: 'Availability declined for a second quarter and is now below the agreed target',
        chartType: 'line',
        data: [{ label: 'Q1', value: 99.8 }, { label: 'Q2', value: 99.5 }, { label: 'Q3', value: 99.1 }],
        insight: 'The trend is concentrated in two services and should be addressed through targeted resilience work.',
        source: 'ServiceNow availability KPI extract',
      },
      {
        type: 'status_dashboard',
        title: 'Schedule and scope remain controlled; platform quality is amber',
        statuses: [
          { label: 'Scope', status: 'green', metric: 'On plan', detail: 'No material scope variance' },
          { label: 'Schedule', status: 'green', metric: '11/12', detail: 'One milestone moved to Q4' },
          { label: 'Quality', status: 'amber', metric: '4 P1s', detail: 'Resilience action in progress' },
          { label: 'Commercial', status: 'green', metric: 'On plan', detail: 'No material variance' },
          { label: 'People', status: 'green', metric: 'Stable', detail: 'Critical roles covered' },
          { label: 'Dependencies', status: 'amber', metric: '1 critical', detail: 'Vendor interface remains open' },
        ],
        columns: [
          { heading: 'Delivered', bullets: ['Release 3.2 completed', 'DR design approved'] },
          { heading: 'Attention', bullets: ['Platform resilience', 'Vendor interface'] },
          { heading: 'Decisions', bullets: ['Confirm Q4 recovery priority'] },
        ],
      },
      {
        type: 'timeline',
        title: 'The critical path is recoverable if the vendor interface closes in the next 30 days',
        timeline: [
          { date: 'Jul', label: 'Design approved', detail: 'Architecture sign-off', status: 'green' },
          { date: 'Aug', label: 'Build complete', detail: 'Core platform changes', status: 'green' },
          { date: 'Sep', label: 'Integration delayed', detail: 'Vendor interface open', status: 'amber' },
          { date: 'Oct', label: 'Recovery test', detail: 'Planned after interface closure', status: 'neutral' },
        ],
        insight: 'A 30-day closure window protects the Q4 recovery test without moving the broader programme date.',
      },
      {
        type: 'risk_matrix',
        title: 'Two dependencies account for most of the remaining Q4 delivery exposure',
        risks: [
          { risk: 'Vendor interface readiness', likelihood: 4, impact: 5, mitigation: 'Daily integration war room', owner: 'Integration Lead', status: 'red' },
          { risk: 'Environment capacity', likelihood: 3, impact: 4, mitigation: 'Capacity uplift approved', owner: 'Platform', status: 'amber' },
          { risk: 'Test data quality', likelihood: 2, impact: 3, mitigation: 'Data rehearsal added', owner: 'Test Lead', status: 'green' },
        ],
      },
      {
        type: 'comparison',
        title: 'Targeted remediation provides the best balance of risk reduction and delivery continuity',
        options: [
          { name: 'Hold course', summary: 'Continue current remediation', pros: ['Lowest near-term cost'], cons: ['Residual P1 risk remains'], score: 'Low control' },
          { name: 'Targeted remediation', summary: 'Fund resilience + dependency closure', pros: ['Highest risk reduction', 'Protects delivery date'], cons: ['Focused Q4 investment'], score: 'Best balance', recommended: true },
          { name: 'Broad reset', summary: 'Re-plan the full programme', pros: ['Maximum redesign freedom'], cons: ['High disruption', 'Unnecessary scope churn'], score: 'High disruption' },
        ],
      },
      {
        type: 'financial_case',
        title: 'The Q4 investment is concentrated in the controls that address the material exposure',
        financials: [
          { label: 'Resilience work', value: '$0.8M', note: 'Q4', status: 'neutral' },
          { label: 'Integration closure', value: '$0.3M', note: 'Q4', status: 'neutral' },
          { label: 'Contingency', value: '$0.1M', note: 'Reserved', status: 'neutral' },
        ],
        data: [{ label: 'Resilience', value: 0.8 }, { label: 'Integration', value: 0.3 }, { label: 'Contingency', value: 0.1 }],
        recommendation: 'Approve the focused Q4 investment rather than broad programme re-planning.',
        source: 'Approved Q4 estimate',
      },
      {
        type: 'framework',
        title: 'The recovery plan addresses technology, process and governance as one operating system',
        framework: [
          { heading: 'Technology', detail: 'Resilience controls and capacity uplift', metric: '2 workstreams', status: 'amber' },
          { heading: 'Process', detail: 'Recovery rehearsal and incident learning', metric: '2 controls', status: 'green' },
          { heading: 'Governance', detail: 'Daily dependency closure and weekly executive review', metric: '2 cadences', status: 'green' },
        ],
      },
      {
        type: 'roadmap',
        title: 'Three sequenced actions close the material gaps within the next 90 days',
        actions: [
          { title: 'Close vendor interface', owner: 'Integration', timing: '0–30 days', status: 'amber', detail: 'Remove critical-path dependency' },
          { title: 'Complete resilience test', owner: 'Platform', timing: '31–60 days', status: 'amber', detail: 'Prove recovery controls' },
          { title: 'Stabilize operations', owner: 'Service Mgmt', timing: '61–90 days', status: 'green', detail: 'Reduce repeat P1 incidents' },
        ],
        recommendation: 'Maintain weekly executive oversight until the two amber controls are green.',
      },
      {
        type: 'evidence',
        title: 'The supplied service evidence supports a targeted rather than programme-wide intervention',
        images: [{ url: await tinyPngDataUrl(), caption: 'Illustrative supplied evidence', altText: 'Small test evidence image' }],
        insight: 'The evidence is used to support the management implication, not as decorative filler.',
      },
      {
        type: 'appendix',
        title: 'Source data and definitions',
        bullets: ['ServiceNow KPI extract', 'Approved integrated project plan', 'Approved Q4 estimate'],
      },
    ],
  });
}

test('composePresentation renders every legacy slide type into a valid .pptx', async () => {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  const spec = await sampleSpec();

  const { slideImages, imageCount } = await composePresentation(pptx, spec);

  assert.equal(slideImages.length, spec.slides.length, 'one image-list per slide');
  assert.equal(imageCount, 1, 'the one embedded image is counted');
  assert.equal(slideImages[3].length, 1, 'the image slide carries its resolved data URL');

  const buffer: any = await pptx.write({ outputType: 'nodebuffer' });
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  assert.ok(buf.length > 5000, 'produced a non-trivial file');
  assert.equal(buf.subarray(0, 2).toString('latin1'), 'PK', 'output is a zip container');
});

test('legacy composePresentation tolerates a minimal / under-specified spec', async () => {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  const { slideImages, imageCount } = await composePresentation(pptx, { title: 'Bare', slides: [{ title: 'Just a title' }] });
  assert.equal(imageCount, 0);
  assert.equal(slideImages.length, 1);
  const buffer: any = await pptx.write({ outputType: 'nodebuffer' });
  assert.ok((Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)).length > 1000);
});

test('V2 semantic PowerPoint compiler creates a real editable OOXML deck across executive layouts', async () => {
  const spec = await semanticV2Spec();
  const semanticValidation = validatePresentationSpec(spec);
  assert.equal(semanticValidation.valid, true, semanticValidation.issues.join('; '));

  const compiled = await compileOfficeArtifact('powerpoint', spec);
  const verification = verifyCompiledOfficeArtifact('powerpoint', {
    buffer: compiled.buffer,
    spec,
    htmlPreview: compiled.htmlPreview,
  });

  assert.equal(verification.passed, true, verification.issues.join('; '));
  assert.equal((compiled.htmlPreview.match(/<section\b/gi) || []).length, spec.slides.length);
  assert.match(compiled.htmlPreview, /class="status-grid"/);
  assert.match(compiled.htmlPreview, /class="risk-matrix"/);
  assert.match(compiled.htmlPreview, /class="compare"/);
  assert.match(compiled.htmlPreview, /class="roadmap"/);
  assert.ok(compiled.buffer.length > 20_000, 'semantic deck should be a substantive OOXML package');
  assert.equal(compiled.imageCount, 1, 'evidence image is embedded through the production compiler');
});

test('canonical PowerPoint compiler keeps legacy V1 specs compilable through the V2 renderer', async () => {
  const spec = normalizeOfficeSpec('powerpoint', await sampleSpec());
  const compiled = await compileOfficeArtifact('powerpoint', spec);
  const verification = verifyCompiledOfficeArtifact('powerpoint', {
    buffer: compiled.buffer,
    spec,
    htmlPreview: compiled.htmlPreview,
  });
  assert.equal(verification.passed, true, verification.issues.join('; '));
  assert.equal((compiled.htmlPreview.match(/<section\b/gi) || []).length, spec.slides.length);
  assert.ok(compiled.buffer.length > 5000);
});

test('canonical Word compiler creates a real OOXML document and preview with matching sections', async () => {
  const spec = normalizeOfficeSpec('word', {
    title: 'Operating Model Review',
    sections: [
      { heading: 'Executive summary', paragraphs: ['Quantora should use one canonical artifact contract.'], bullets: ['Verified before download', 'Human review remains explicit'] },
      { heading: 'Controls', paragraphs: ['Compilation failures fail closed rather than degrading output.'] },
    ],
  });
  const compiled = await compileOfficeArtifact('word', spec);
  const verification = verifyCompiledOfficeArtifact('word', {
    buffer: compiled.buffer,
    spec,
    htmlPreview: compiled.htmlPreview,
  });
  assert.equal(verification.passed, true, verification.issues.join('; '));
  assert.equal((compiled.htmlPreview.match(/<h2\b/gi) || []).length, 2);
  assert.equal(compiled.buffer.subarray(0, 2).toString('latin1'), 'PK');
});

test('canonical Excel compiler preserves every worksheet and passes workbook verification', async () => {
  const spec = normalizeOfficeSpec('excel', {
    filename: 'Reliability_Model',
    sheets: [
      {
        name: 'Summary',
        data: [
          [{ value: 'Metric', fontWeight: 'bold' }, { value: 'Value', fontWeight: 'bold' }],
          ['Preview parity', { value: 100, type: 'Number', format: '0%' }],
        ],
      },
      {
        name: 'Controls',
        data: [
          ['Control', 'Status'],
          ['OOXML verification', 'Required'],
          ['Human approval', 'Required'],
        ],
      },
    ],
  });
  const compiled = await compileOfficeArtifact('excel', spec);
  const verification = verifyCompiledOfficeArtifact('excel', {
    buffer: compiled.buffer,
    spec,
    htmlPreview: compiled.htmlPreview,
  });
  assert.equal(verification.passed, true, verification.issues.join('; '));
  assert.equal((compiled.htmlPreview.match(/data-sheet-name=/gi) || []).length, 2, 'both worksheets are represented in preview');
  assert.equal(compiled.buffer.subarray(0, 2).toString('latin1'), 'PK');
});
