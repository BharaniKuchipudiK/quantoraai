import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { classifyFinish, finishFromGemini, finishFromOpenRouter, truncatedArtifactError } from './stream-finish.js';

/**
 * ---------------------------------------------------------------------------
 * THE LIVE TURN MUST KNOW WHY THE MODEL STOPPED.
 *
 * Measured 2026-09-05, before this file existed:
 *
 *   api/_lib/chat-handler.ts       finish-reason reads: 0
 *   api/_lib/openrouter-probe.ts   finish-reason reads: 6   (the health probe)
 *
 * A reply cut off at the output budget was accepted, recorded as a success,
 * and delivered as if complete. In JSON it broke loudly ("Unterminated string"
 * on the deployed golden's intake modal). In prose it was silent. This file
 * holds two things: that the classifier reads the providers correctly, and —
 * the §4 half — that every stream consumer on the live path actually consults
 * it, because a helper nobody calls is the defect this file exists to remove.
 * ---------------------------------------------------------------------------
 */

test('the provider words map to the right kind, and nothing unfamiliar maps to complete', () => {
  // OpenRouter / OpenAI-shaped
  assert.equal(classifyFinish('stop').kind, 'complete');
  assert.equal(classifyFinish('tool_calls').kind, 'complete');
  assert.equal(classifyFinish('length').kind, 'truncated');
  assert.equal(classifyFinish('content_filter').kind, 'blocked');
  // Gemini
  assert.equal(classifyFinish('STOP').kind, 'complete');
  assert.equal(classifyFinish('MAX_TOKENS').kind, 'truncated');
  assert.equal(classifyFinish('SAFETY').kind, 'blocked');
  assert.equal(classifyFinish('RECITATION').kind, 'blocked');
  // The absence is the probe's "connection closed before the model finished".
  assert.equal(classifyFinish(null).kind, 'unknown');
  assert.equal(classifyFinish(undefined).kind, 'unknown');
  assert.equal(classifyFinish('').kind, 'unknown');
  // Conservative by construction: a word we have never seen is not consent.
  assert.equal(classifyFinish('SOMETHING_NEW').kind, 'unknown');
  assert.equal(classifyFinish('SOMETHING_NEW').reason, 'SOMETHING_NEW', 'the provider word travels verbatim');
});

test('vocabularies are kept apart — a Gemini word is not read through the OpenRouter list', () => {
  // "STOP" in lower case is not an OpenAI value and must not be promoted to complete by accident.
  assert.equal(classifyFinish('Stop').kind, 'unknown');
  assert.equal(classifyFinish('Length').kind, 'unknown');
});

test('the readers find the reason where each provider actually puts it', () => {
  assert.equal(finishFromOpenRouter({ choices: [{ delta: { content: 'x' }, finish_reason: 'length' }] }), 'length');
  assert.equal(finishFromOpenRouter({ choices: [{ delta: { content: 'x' } }] }), null, 'a mid-stream chunk carries none');
  assert.equal(finishFromOpenRouter({ choices: [] }), null);
  assert.equal(finishFromOpenRouter(null), null);

  assert.equal(finishFromGemini({ candidates: [{ finishReason: 'MAX_TOKENS' }] }), 'MAX_TOKENS');
  assert.equal(finishFromGemini({ candidates: [{ content: {} }] }), null, 'Gemini leaves it empty until the model stops');
  assert.equal(finishFromGemini({}), null);
});

test('a truncated build is a retryable rung failure with a name, never a silent success', () => {
  const error = truncatedArtifactError('OpenRouter', 'length') as any;
  assert.equal(error.status, 502, 'retryable, so the ladder moves to another engine');
  assert.equal(error.detailCode, 'reply-truncated');
  assert.match(error.message, /output budget/);
  assert.match(error.message, /finish_reason length/, 'the provider word is in the message the log will show');
  assert.match(truncatedArtifactError('Gemini', null).message, /finish_reason missing/);
});

test('every stream consumer on the live path reads the finish reason (§4)', async () => {
  /*
   * The half that matters. chat-handler.ts consumes provider streams in four
   * places — Gemini primary, OpenRouter primary, Gemini legacy, OpenRouter
   * refine — and each accumulates text with `attemptReply +=` or `fullReply +=`.
   * If any of them stops reading finish, a truncated reply is silently
   * accepted on that path again while this suite reports a clean run.
   *
   * Anchored on the accumulation sites, which are the durable fact about a
   * consumer (it is where the text goes), and asserts a finish read within
   * the same loop body — bounded lines, both directions.
   */
  const source = await readFile(new URL('./chat-handler.ts', import.meta.url), 'utf8');
  const lines = source.split('\n');
  const consumers = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /\b(attemptReply|fullReply) \+= (chunk\.text|token)\b/.test(line));
  assert.ok(consumers.length >= 4, `expected the four stream consumers, found ${consumers.length} — this gate has stopped reading the file`);

  for (const { index } of consumers) {
    const window = lines.slice(Math.max(0, index - 25), index + 6).join('\n');
    assert.ok(
      /finishFrom(?:OpenRouter|Gemini)\(/.test(window),
      `the stream consumer at chat-handler.ts:${index + 1} accumulates text without reading why the model stopped — `
      + 'a reply cut off at the output budget is accepted silently on this path',
    );
  }
});

test('the live path never records a truncated build as delivered', async () => {
  // The acceptance points must consult the finish before `fullReply = attemptReply`.
  const source = await readFile(new URL('./chat-handler.ts', import.meta.url), 'utf8');
  assert.match(source, /truncatedArtifactError\(/, 'a truncated build must be refused by name, not passed to the artifact contract and hoped for');
  const accept = source.indexOf('fullReply = attemptReply;');
  assert.ok(accept > 0, 'the acceptance point moved — re-anchor this gate');
  const before = source.slice(Math.max(0, accept - 2500), accept);
  assert.match(before, /truncatedArtifactError\(/, 'the truncation check must sit BEFORE the reply is accepted, or it guards nothing');
});
