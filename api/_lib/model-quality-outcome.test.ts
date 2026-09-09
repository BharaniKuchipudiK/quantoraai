import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ledgerOutcomeFor } from './model-quality-outcome.js';

/*
 * ---------------------------------------------------------------------------
 * QIR PHASE 6 — THE LEDGER RECORDS WHAT WAS MEASURED.
 *
 * Measured 2026-09-05, before this file existed: chat-handler.ts wrote
 * `outcome: 'success'` at three sites, each reached by any stream that did not
 * throw — a reply cut at the provider's output budget counted as a success,
 * and the outcome router (a ±30 swing on route score, and the finish-
 * reliability that orders coding-desk failovers) learned from it.
 *
 * Two halves, as with stream-finish.test.ts: the mapping is right, and — the
 * §4 half — every success-path write in the live handler actually consults it.
 * ---------------------------------------------------------------------------
 */

test('the provider\'s finish decides the ledger row, and only a finished reply is a success', () => {
  assert.equal(ledgerOutcomeFor({ kind: 'complete', reason: 'stop' }), 'success');
  assert.equal(ledgerOutcomeFor({ kind: 'complete', reason: 'STOP' }), 'success');
  assert.equal(ledgerOutcomeFor({ kind: 'truncated', reason: 'length' }), 'failure', 'cut at the output budget is not delivery');
  assert.equal(ledgerOutcomeFor({ kind: 'truncated', reason: 'MAX_TOKENS' }), 'failure');
  assert.equal(ledgerOutcomeFor({ kind: 'blocked', reason: 'SAFETY' }), 'failure');
});

test('an absent terminal word is unmeasured — neither rewarded nor blamed', () => {
  // The probe's "connection closed before the model finished", and what an
  // unfamiliar provider word classifies to. Writing success keeps the poison;
  // writing failure invents the opposite one on no evidence.
  assert.equal(ledgerOutcomeFor({ kind: 'unknown', reason: null }), null);
  assert.equal(ledgerOutcomeFor({ kind: 'unknown', reason: 'SOMETHING_NEW' }), null);
  assert.equal(ledgerOutcomeFor(null), null);
  assert.equal(ledgerOutcomeFor(undefined), null);
});

test('every success-path ledger write in the live handler is measured (§4)', async () => {
  /*
   * Anchored on the ledger calls themselves, which are the durable fact about
   * a write site. A `success` literal anywhere is the defect this file exists
   * to remove; a success-path call that does not consult ledgerOutcomeFor is
   * the same defect wearing a variable.
   */
  const source = await readFile(new URL('./chat-handler.ts', import.meta.url), 'utf8');
  // Code only: a comment that mentions the old literal must not trip the gate,
  // and a literal in code must — so comments are stripped before the match.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(
    code,
    /outcome:\s*['"]success['"]/,
    'chat-handler writes outcome:"success" as a literal — a reply the provider cut off is being recorded as delivered',
  );
  const lines = source.split('\n');
  const sites = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /recordModelQualityEvent\(/.test(line) && !/^\s*import\b/.test(line));
  assert.ok(sites.length >= 5, `expected the five ledger call sites, found ${sites.length} — this gate has stopped reading the file`);

  let measured = 0;
  for (const { index } of sites) {
    const window = lines.slice(Math.max(0, index - 12), index + 8).join('\n');
    const isFailurePath = /outcome:\s*['"]failure['"]/.test(window);
    const isFeedbackVote = /outcome\s*\}\)/.test(window) || /outcome:\s*outcome\b/.test(window);
    if (isFailurePath || isFeedbackVote) continue;
    assert.ok(
      /ledgerOutcomeFor\(/.test(window),
      `the ledger write at chat-handler.ts:${index + 1} is on a success path and does not consult ledgerOutcomeFor — `
      + 'it records whatever did not throw as a success',
    );
    measured += 1;
  }
  assert.ok(measured >= 3, `expected the three success-path writes to be measured, found ${measured}`);
});

test('[was-red] failed attempts teach routing about the engine that actually ran, not Auto', async () => {
  const source = await readFile(new URL('./chat-handler.ts', import.meta.url), 'utf8');
  assert.match(
    source,
    /modelId: route\.id,[^]*?outcome: 'failure'[^]*?latencyMs: Date\.now\(\) - attemptStartedAt/,
    'each failed provider attempt must be attributed to its real route',
  );
  assert.match(
    source,
    /spentEngineIds\.size === 0[^]*?req\.body\.modelId !== 'auto'/,
    'the outer catch must not duplicate a real route failure or create an unusable Auto row',
  );
});
