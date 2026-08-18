#!/usr/bin/env node

const API_BASE = process.env.QUANTORA_SYNTHETIC_BASE_URL || 'https://quantoraai.app';
const endpoint = `${API_BASE.replace(/\/$/, '')}/api/generate-office`;

async function post(body) {
  const started = Date.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: API_BASE,
      Referer: `${API_BASE.replace(/\/$/, '')}/`,
      'User-Agent': 'Quantora-Office-Synthetic/1.0',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`HTTP ${response.status} returned non-JSON: ${text.slice(0, 300)}`); }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${data.error || 'Office synthetic failed'}${data.stage ? ` [${data.stage}]` : ''}${data.detail ? ` — ${data.detail}` : ''}`);
  return { data, latencyMs: Date.now() - started };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyEnvelope(data, expectedOperation) {
  assert(data?.success === true, 'success=true missing');
  assert(data?.kind === 'powerpoint', `unexpected kind: ${data?.kind}`);
  assert(data?.verification?.passed === true, `verification failed: ${(data?.verification?.issues || []).join(' ')}`);
  assert(typeof data?.verification?.previewFingerprint === 'string' && data.verification.previewFingerprint.length >= 8, 'preview fingerprint missing');
  assert(typeof data?.data === 'string' && data.data.length > 1000, 'PPTX binary payload missing');
  assert(String(data?.fileName || '').toLowerCase().endsWith('.pptx'), 'PPTX filename missing');
  assert(Array.isArray(data?.spec?.slides) && data.spec.slides.length >= 5, `expected >=5 slides, got ${data?.spec?.slides?.length || 0}`);
  assert(data?.revision?.operation === expectedOperation, `expected revision operation ${expectedOperation}, got ${data?.revision?.operation}`);
  assert(typeof data?.htmlPreview === 'string' && data.htmlPreview.includes('quantora-office-manifest'), 'verified Office manifest missing from preview');
}

console.log(`Quantora live Office synthetic target: ${endpoint}`);

const create = await post({
  prompt: 'Create a concise 5-slide executive PowerPoint on cloud modernization for a CIO. Include an executive summary, comparison of rehost/replatform/refactor, key risks, a 90-day roadmap, and a decision ask. Use qualitative evidence only and do not invent numeric data.',
  format: 'powerpoint',
  operation: 'create',
  history: [],
  sessionContext: {
    goal: 'Synthetic Office reliability check',
    facts: ['CIO audience', 'Qualitative evidence only', 'No invented numeric data'],
  },
});
verifyEnvelope(create.data, 'create');
console.log(`✔ CREATE verified in ${create.latencyMs}ms — ${create.data.fileName}`);

const firstFingerprint = create.data.verification.previewFingerprint;
const refine = await post({
  prompt: 'Refine the active presentation: make every slide title more concise and executive while preserving the storyline, facts, slide count, risk content, comparison, and roadmap. Do not invent numeric data.',
  format: 'powerpoint',
  operation: 'refine',
  baseSpec: create.data.spec,
  baseFingerprint: firstFingerprint,
  history: [],
  sessionContext: { goal: 'Synthetic Office refinement reliability check', facts: ['Preserve slide count and evidence boundaries'] },
});
verifyEnvelope(refine.data, 'refine');
assert(refine.data.revision.basedOnFingerprint === firstFingerprint, 'refinement lineage does not point to the created artifact');
assert(refine.data.verification.previewFingerprint !== firstFingerprint, 'refinement did not produce a new preview fingerprint');
assert(refine.data.spec.slides.length === create.data.spec.slides.length, 'refinement unexpectedly changed slide count');
console.log(`✔ REFINE verified in ${refine.latencyMs}ms — ${refine.data.revision.resultFingerprint}`);

const recompile = await post({
  prompt: '',
  format: 'powerpoint',
  operation: 'create',
  spec: refine.data.spec,
  compileOnly: true,
  history: [],
});
verifyEnvelope(recompile.data, 'recompile');
assert(recompile.data.verification.previewFingerprint === refine.data.verification.previewFingerprint, 'deterministic recompile fingerprint drifted from refined artifact');
console.log(`✔ RECOMPILE verified in ${recompile.latencyMs}ms — fingerprint stable`);

console.log('Live Office synthetic transaction PASSED: create → refine → deterministic recompile.');
