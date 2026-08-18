#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  PRESENTATION_TRANSPORT_JSON_SCHEMA,
  materializePresentationTransportSpec,
  presentationSpecToTransport,
} from '../api/_lib/presentation-transport.js';
import { validatePresentationSpec } from '../api/_lib/presentation-v2.js';
import {
  fingerprintOfficePreview,
  injectOfficeManifest,
  verifyCompiledOfficeArtifact,
} from '../api/_lib/office-artifact.js';
import {
  getVerifiedOfficePreviewState,
  validateOfficeArtifactEnvelope,
} from '../src/lib/office-artifact-cache.js';
import {
  inspectProviderSchema,
  runProviderFailover,
} from '../api/_lib/office-provider-contract.js';
import { runOfficeSemanticLoop } from '../api/_lib/office-semantic-loop.js';
import { compileOfficeArtifact } from '../api/generate-office.ts';

const results: { name: string, ok: boolean, detail?: string }[] = [];

function pass(name: string, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✔ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, error: unknown) {
  const detail = String((error as any)?.message || error);
  results.push({ name, ok: false, detail });
  console.error(`✖ ${name} — ${detail}`);
}

async function check(name: string, fn: () => any | Promise<any>) {
  try {
    await fn();
    pass(name);
  } catch (error) {
    fail(name, error);
  }
}

function item(overrides: Record<string, any> = {}) {
  return {
    primary: '', secondary: '', tertiary: '', value: '', number: 0, number2: 0,
    status: 'neutral', bulletsA: [], bulletsB: [], flag: false,
    ...overrides,
  };
}

function slide(type: string, title: string, overrides: Record<string, any> = {}) {
  return {
    type,
    title,
    subtitle: '',
    kicker: '',
    insight: '',
    recommendation: '',
    source: '',
    speakerNotes: '',
    bullets: [],
    chartType: 'bar',
    items: [],
    images: [],
    quote: '',
    author: '',
    ...overrides,
  };
}

function validTransport() {
  return {
    version: 2,
    title: 'Cloud Modernization Strategic Path Forward',
    archetype: 'strategy',
    audience: 'CIO and executive leadership',
    purpose: 'Choose a pragmatic cloud modernization path and mobilize execution',
    decisionAsk: 'Approve the recommended phased modernization path and 90-day mobilization',
    period: '90 days',
    communicationStandard: 'consulting',
    sourceNotes: ['Qualitative strategy only; no invented numeric performance, financial, or benchmark data.'],
    slides: [
      slide('cover', 'Cloud modernization requires a deliberate path to value', {
        subtitle: 'Executive decision deck',
      }),
      slide('executive_summary', 'A phased modernization path balances speed, control, and strategic value', {
        insight: 'Modernize in waves so immediate platform risk reduction does not compromise longer-term architecture outcomes.',
        recommendation: 'Start with foundation and replatforming, then selectively refactor workloads where business value justifies the change.',
        bullets: [
          'Establish a governed cloud foundation before scaling migration activity.',
          'Use workload characteristics to choose rehost, replatform, or refactor deliberately.',
          'Sequence modernization around measurable business outcomes and operational readiness.',
        ],
      }),
      slide('comparison', 'Replatforming provides the strongest balance of speed and modernization depth', {
        insight: 'No single migration pattern fits every workload; the portfolio should use explicit decision criteria.',
        recommendation: 'Use replatforming as the default path while reserving rehost and refactor for clear workload-specific cases.',
        items: [
          item({ primary: 'Rehost', secondary: 'Move quickly with minimal application change.', tertiary: 'Speed-first', bulletsA: ['Fastest transition', 'Lowest application change'], bulletsB: ['Carries technical debt forward', 'Limited cloud-native benefit'] }),
          item({ primary: 'Replatform', secondary: 'Optimize selected platform components while preserving application intent.', tertiary: 'Balanced', bulletsA: ['Improves platform economics', 'Moderate delivery complexity'], bulletsB: ['Requires targeted redesign', 'Needs platform engineering capability'], flag: true }),
          item({ primary: 'Refactor', secondary: 'Redesign applications for deeper cloud-native capability.', tertiary: 'Value-first', bulletsA: ['Highest modernization potential', 'Improves long-term adaptability'], bulletsB: ['Highest change burden', 'Longer path to value'] }),
        ],
      }),
      slide('framework', 'A successful program aligns technology, operating model, governance, and delivery', {
        insight: 'Modernization fails when migration is treated as infrastructure movement rather than an operating-model change.',
        items: [
          item({ primary: 'Technology foundation', secondary: 'Landing zone, identity, connectivity, security, observability, and platform services.' }),
          item({ primary: 'Operating model', secondary: 'Clear product ownership, platform accountability, and cloud engineering practices.' }),
          item({ primary: 'Governance', secondary: 'Architecture guardrails, financial controls, risk management, and exception handling.' }),
          item({ primary: 'Delivery model', secondary: 'Wave planning, workload readiness, migration factories, and benefit tracking.' }),
        ],
      }),
      slide('risk_matrix', 'Execution risk is manageable when dependencies and ownership are addressed early', {
        insight: 'The largest risks are organizational and dependency-driven rather than purely technical.',
        items: [
          item({ primary: 'Application dependency uncertainty', number: 3, number2: 4, secondary: 'Map dependencies before wave commitment and maintain explicit exit criteria.', value: 'Program architecture', status: 'amber' }),
          item({ primary: 'Cloud operating skills gap', number: 3, number2: 4, secondary: 'Pair platform delivery with targeted capability building and role clarity.', value: 'Engineering leadership', status: 'amber' }),
          item({ primary: 'Governance slows delivery', number: 2, number2: 3, secondary: 'Automate guardrails and establish a lightweight exception path.', value: 'Cloud governance', status: 'neutral' }),
        ],
      }),
      slide('roadmap', 'The first 90 days should establish foundations and prove one migration wave', {
        insight: 'Mobilization should produce an executable backlog and a proven delivery pattern, not another strategy document.',
        recommendation: 'Authorize the foundation and pilot wave together so governance and delivery evolve from real execution.',
        items: [
          item({ primary: 'Baseline and mobilize', value: 'Program leadership', tertiary: 'Days 0–30', secondary: 'Confirm workload inventory, dependencies, decision criteria, governance, and target operating model.', status: 'green' }),
          item({ primary: 'Build the foundation', value: 'Platform engineering', tertiary: 'Days 31–60', secondary: 'Implement landing-zone capabilities, controls, observability, and migration tooling.', status: 'neutral' }),
          item({ primary: 'Prove the first wave', value: 'Migration teams', tertiary: 'Days 61–90', secondary: 'Execute representative workloads, capture lessons, and finalize the scaled wave plan.', status: 'neutral' }),
        ],
      }),
      slide('bullets', 'Leadership approval now enables controlled mobilization without locking every future design choice', {
        insight: 'The immediate decision is to mobilize the governed foundation and first wave while preserving workload-level choice.',
        recommendation: 'Approve mobilization, nominate accountable owners, and use the first wave to calibrate the scaled roadmap.',
        bullets: [
          'Approve the phased modernization direction and 90-day mobilization.',
          'Confirm executive ownership for platform, application, security, and financial governance.',
          'Require evidence from the first wave before committing the full migration sequence.',
        ],
      }),
    ],
  };
}

console.log('\n=== Quantora Office synthetic release gate ===\n');

await check('provider contracts are preflight-compatible across Anthropic, Gemini, and OpenRouter', () => {
  for (const provider of ['anthropic', 'gemini', 'openrouter']) {
    for (const format of ['powerpoint', 'word', 'excel']) {
      const result = inspectProviderSchema(provider, format);
      assert.equal(result.valid, true, `${provider}/${format}: ${result.issues.join(' ')}`);
    }
  }
  const ppt = inspectProviderSchema('anthropic', 'powerpoint');
  assert.ok(ppt.stats.bytes < 12_000);
  assert.ok(ppt.stats.propertyCount <= 64);
});

await check('Gemini regression: PowerPoint transport contains no non-string enum', () => {
  const gemini = inspectProviderSchema('gemini', 'powerpoint', PRESENTATION_TRANSPORT_JSON_SCHEMA);
  assert.equal(gemini.valid, true, gemini.issues.join(' '));
});

await check('provider fault injection: Anthropic and Gemini may fail while OpenRouter succeeds', async () => {
  const calls: string[] = [];
  const result = await runProviderFailover({
    providers: ['anthropic', 'gemini', 'openrouter'],
    invoke: async (provider) => {
      calls.push(provider);
      if (provider === 'anthropic') throw new Error('compiled grammar is too large');
      if (provider === 'gemini') throw new Error('INVALID_ARGUMENT response schema');
      return 'openrouter-success';
    },
  });
  assert.equal(result, 'openrouter-success');
  assert.deepEqual(calls, ['anthropic', 'gemini', 'openrouter']);
});

await check('provider fault injection: total provider outage fails closed', async () => {
  await assert.rejects(() => runProviderFailover({
    providers: ['anthropic', 'gemini', 'openrouter'],
    invoke: async (provider) => { throw new Error(`${provider} unavailable`); },
  }), /openrouter unavailable/);
});

await check('semantic repair keeps the same candidate and fixes Gatekeeper failures', async () => {
  const good = validTransport();
  const bad = structuredClone(good);
  bad.slides[2].items = bad.slides[2].items.slice(0, 1);
  bad.slides[5].items = bad.slides[5].items.slice(0, 1);
  let sawRepairCandidate = false;
  const run = await runOfficeSemanticLoop({
    format: 'powerpoint',
    maxAttempts: 3,
    requestCandidate: async ({ repairCandidate }) => {
      if (!repairCandidate) return JSON.stringify(bad);
      sawRepairCandidate = true;
      assert.deepEqual(repairCandidate, bad);
      return JSON.stringify(good);
    },
    materializeCandidate: materializePresentationTransportSpec,
    validateCandidate: validatePresentationSpec,
  });
  assert.equal(sawRepairCandidate, true);
  assert.equal(run.validJson?.slides?.length, 7);
  assert.equal(run.lastStage, 'success');
  assert.equal(run.repaired, true);
});

let createdSpec: any;
let createdCompiled: any;
let createdVerification: any;
let createdManifestHtml = '';

await check('CREATE synthetic transaction: transport → hard gate → PPTX → OOXML verification → manifest', async () => {
  const candidate = materializePresentationTransportSpec(validTransport());
  const validation = validatePresentationSpec(candidate);
  assert.equal(validation.valid, true, validation.issues.join('\n'));
  createdSpec = validation.spec;
  createdCompiled = await compileOfficeArtifact('powerpoint', createdSpec);
  createdVerification = verifyCompiledOfficeArtifact('powerpoint', {
    buffer: createdCompiled.buffer,
    spec: createdSpec,
    htmlPreview: createdCompiled.htmlPreview,
  });
  assert.equal(createdVerification.passed, true, createdVerification.issues.join('\n'));
  assert.equal(createdSpec.slides.length, 7);
  assert.ok(createdCompiled.buffer.length > 1500);
  createdManifestHtml = injectOfficeManifest(createdCompiled.htmlPreview, {
    kind: 'powerpoint',
    spec: createdSpec,
    previewFingerprint: createdVerification.previewFingerprint,
  });
  const previewState = getVerifiedOfficePreviewState(createdManifestHtml, 'powerpoint');
  assert.equal(previewState.verified, true, previewState.reason || 'preview not verified');
});

await check('client envelope rejects mismatched download metadata and accepts the verified artifact', () => {
  const artifact = {
    kind: 'powerpoint',
    fileName: createdCompiled.fileName,
    mimeType: createdCompiled.mimeType,
    data: createdCompiled.buffer.toString('base64'),
    spec: createdSpec,
    htmlPreview: createdManifestHtml,
    verification: createdVerification,
  };
  assert.equal(validateOfficeArtifactEnvelope(artifact, 'powerpoint', createdVerification.previewFingerprint).valid, true);
  assert.equal(validateOfficeArtifactEnvelope({ ...artifact, fileName: 'wrong.docx' }, 'powerpoint').valid, false);
  assert.equal(validateOfficeArtifactEnvelope(artifact, 'powerpoint', 'deadbeef').valid, false);
});

await check('stale preview fingerprint is rejected instead of masquerading as the current artifact', () => {
  const stale = createdManifestHtml.replace('Cloud modernization requires a deliberate path to value', 'STALE CONTENT');
  const state = getVerifiedOfficePreviewState(stale, 'powerpoint');
  assert.equal(state.verified, false);
  assert.equal(state.reason, 'fingerprint-mismatch');
});

await check('REFINE synthetic transaction preserves structure, changes fingerprint, and remains downloadable', async () => {
  const transport = presentationSpecToTransport(createdSpec);
  const revised = structuredClone(transport);
  revised.slides[1].title = 'A phased modernization path improves control while accelerating measurable business value';
  revised.slides[1].bullets[0] = 'Establish a governed cloud foundation and explicit workload decision criteria before scaling migration activity.';
  const candidate = materializePresentationTransportSpec(revised);
  const validation = validatePresentationSpec(candidate);
  assert.equal(validation.valid, true, validation.issues.join('\n'));
  assert.equal(validation.spec.slides.length, createdSpec.slides.length);

  const compiled = await compileOfficeArtifact('powerpoint', validation.spec);
  const verification = verifyCompiledOfficeArtifact('powerpoint', {
    buffer: compiled.buffer,
    spec: validation.spec,
    htmlPreview: compiled.htmlPreview,
  });
  assert.equal(verification.passed, true, verification.issues.join('\n'));
  assert.notEqual(verification.previewFingerprint, createdVerification.previewFingerprint);
});

await check('50 sequential refinement-state round trips remain semantically valid', () => {
  let spec = createdSpec;
  for (let i = 1; i <= 50; i += 1) {
    const transport = presentationSpecToTransport(spec);
    transport.slides[6].speakerNotes = `Synthetic revision ${i}`;
    const candidate = materializePresentationTransportSpec(transport);
    const validation = validatePresentationSpec(candidate);
    assert.equal(validation.valid, true, `revision ${i}: ${validation.issues.join(' ')}`);
    assert.equal(validation.spec.slides.length, 7);
    spec = validation.spec;
  }
});

await check('Word synthetic transaction compiles and verifies', async () => {
  const spec = {
    title: 'Cloud Modernization Decision Note',
    sections: [
      { heading: 'Executive position', paragraphs: ['Adopt a phased modernization path anchored in governance and workload fit.'], bullets: ['Protect evidence integrity.', 'Sequence platform and workload change.'], images: [] },
      { heading: 'Next actions', paragraphs: ['Mobilize the foundation and first migration wave.'], bullets: ['Confirm owners.', 'Baseline dependencies.'], images: [] },
    ],
  };
  const compiled = await compileOfficeArtifact('word', spec);
  const verification = verifyCompiledOfficeArtifact('word', { buffer: compiled.buffer, spec, htmlPreview: compiled.htmlPreview });
  assert.equal(verification.passed, true, verification.issues.join('\n'));
});

await check('Excel synthetic transaction compiles all sheets and verifies', async () => {
  const spec = {
    filename: 'Modernization Tracker',
    sheets: [
      { name: 'Workloads', data: [[{ value: 'Workload', type: 'String' }, { value: 'Path', type: 'String' }], [{ value: 'CRM', type: 'String' }, { value: 'Replatform', type: 'String' }]] },
      { name: 'Actions', data: [[{ value: 'Action', type: 'String' }, { value: 'Owner', type: 'String' }], [{ value: 'Baseline dependencies', type: 'String' }, { value: 'Architecture', type: 'String' }]] },
    ],
  };
  const compiled = await compileOfficeArtifact('excel', spec);
  const verification = verifyCompiledOfficeArtifact('excel', { buffer: compiled.buffer, spec, htmlPreview: compiled.htmlPreview });
  assert.equal(verification.passed, true, verification.issues.join('\n'));
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Office synthetic checks passed.`);
if (failed.length) {
  console.error('\nRelease blocked by Office synthetic transaction failures:');
  failed.forEach((result) => console.error(`- ${result.name}: ${result.detail}`));
  process.exit(1);
}
