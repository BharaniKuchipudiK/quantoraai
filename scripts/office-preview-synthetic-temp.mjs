#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const API_BASE = process.env.QUANTORA_SYNTHETIC_BASE_URL;
const cookieJar = process.env.QUANTORA_SYNTHETIC_COOKIE_JAR || '/tmp/quantora-vercel-cookies';
if (!API_BASE) throw new Error('QUANTORA_SYNTHETIC_BASE_URL is required');
const endpoint = `${API_BASE.replace(/\/$/, '')}/api/generate-office`;

function post(body) {
  const started = Date.now();
  const requestFile = `/tmp/office-request-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  const responseFile = `${requestFile}.response`;
  fs.writeFileSync(requestFile, JSON.stringify(body));
  const status = execFileSync('curl', [
    '-sS', '-o', responseFile, '-w', '%{http_code}',
    '-b', cookieJar,
    '-H', 'Content-Type: application/json',
    '-H', `Origin: ${API_BASE}`,
    '-H', `Referer: ${API_BASE}/`,
    '-H', 'User-Agent: Quantora-Office-Preview-Synthetic/1.0',
    '--data-binary', `@${requestFile}`,
    endpoint,
  ], { encoding: 'utf8' }).trim();
  const text = fs.readFileSync(responseFile, 'utf8');
  fs.rmSync(requestFile, { force: true });
  fs.rmSync(responseFile, { force: true });
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`HTTP ${status} returned non-JSON: ${text.slice(0, 300)}`); }
  if (Number(status) < 200 || Number(status) >= 300) throw new Error(`HTTP ${status}: ${data.error || 'Office synthetic failed'}${data.stage ? ` [${data.stage}]` : ''}${data.detail ? ` — ${data.detail}` : ''}`);
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

console.log(`Quantora integration preview Office synthetic target: ${endpoint}`);
const create = post({
  prompt: 'Create a concise 7-slide executive PowerPoint on cloud modernization for a CIO. Include an executive summary, current-state constraints, comparison of rehost/replatform/refactor, recommended approach, key risks, a 90-day roadmap, and a decision ask. Keep all visible copy concise, professional, and readable. Use qualitative evidence only and do not invent numeric data.',
  format: 'powerpoint', operation: 'create', history: [],
  sessionContext: { goal: 'Integration Office reliability and quality check', facts: ['CIO audience', 'Qualitative evidence only', 'No invented numeric data', 'Avoid overflow and dense copy'] },
});
verifyEnvelope(create.data, 'create');
assert(create.data?.generation?.provider, 'successful generation provider provenance missing');
assert(create.data?.generation?.model, 'successful generation model provenance missing');
console.log(`✔ CREATE verified in ${create.latencyMs}ms — ${create.data.generation.provider}/${create.data.generation.model} — ${create.data.fileName}`);

const firstFingerprint = create.data.verification.previewFingerprint;
const firstCount = create.data.spec.slides.length;
const refine = post({
  prompt: 'Refine the active presentation for readability: shorten any dense slide copy, remove repeated visible text, preserve the executive storyline and slide count, and keep all evidence boundaries intact. Do not invent numeric data.',
  format: 'powerpoint', operation: 'refine', baseSpec: create.data.spec, baseFingerprint: firstFingerprint, history: [],
  sessionContext: { goal: 'Integration refinement quality check', facts: ['Preserve slide count', 'Preserve evidence boundaries', 'Improve readability'] },
});
verifyEnvelope(refine.data, 'refine');
assert(refine.data?.generation?.provider, 'refinement provider provenance missing');
assert(refine.data?.generation?.model, 'refinement model provenance missing');
assert(refine.data.revision.basedOnFingerprint === firstFingerprint, 'refinement lineage does not point to created artifact');
assert(refine.data.verification.previewFingerprint !== firstFingerprint, 'refinement did not produce a new preview fingerprint');
assert(refine.data.spec.slides.length === firstCount, 'refinement unexpectedly changed slide count');
console.log(`✔ REFINE verified in ${refine.latencyMs}ms — ${refine.data.generation.provider}/${refine.data.generation.model}`);

const recompile = post({ prompt: '', format: 'powerpoint', operation: 'create', spec: refine.data.spec, compileOnly: true, history: [] });
verifyEnvelope(recompile.data, 'recompile');
assert(recompile.data.verification.previewFingerprint === refine.data.verification.previewFingerprint, 'deterministic recompile fingerprint drifted');
console.log(`✔ RECOMPILE verified in ${recompile.latencyMs}ms — fingerprint stable`);
console.log('Integration preview Office synthetic PASSED: create → refine → deterministic recompile.');
