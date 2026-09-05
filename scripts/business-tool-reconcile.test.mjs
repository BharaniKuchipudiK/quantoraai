import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { reconcilePipeline } from './lib/business-tool-reconcile.mjs';

/**
 * ---------------------------------------------------------------------------
 * THE GATE, RUN WITH THE BUG PRESENT.
 *
 * The deployed golden's first three transactions ask whether something
 * RENDERED. This one asks whether a number is TRUE, and that is a different
 * kind of question — a dashboard of invented figures renders perfectly.
 *
 * Every fixture below is a build that would pass a "did it render?" check and
 * a screenshot, and is wrong anyway. If this file cannot fail on them, the
 * transaction is decorative and costs a live model turn per run to prove
 * nothing (§4).
 * ---------------------------------------------------------------------------
 */

/** A tool that genuinely derives its total. 120000 + 60000, then + 280000. */
const HONEST = {
  seededRows: 2, seededSum: 180000, seededTotal: 180000,
  afterRows: 3, afterSum: 460000, afterTotal: 460000,
  addedValue: 280000,
};

test('a tool that derives its total passes', () => {
  assert.deepEqual(reconcilePipeline(HONEST), { ok: true });
});

test('a HARDCODED total is caught — the case a predicted number would miss', () => {
  /*
   * The whole reason the total is compared to the rows rather than to a value
   * this gate predicts. Here the build printed a constant 180000 that happens
   * to be right for the seed data and never recomputes. Asserting "the total
   * shows 180000" would have called this a pass.
   */
  const result = reconcilePipeline({ ...HONEST, afterTotal: 180000 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'total_stopped_matching_rows');
  assert.match(result.message, /hardcoded-total case/);
  assert.match(result.message, /shows 180000, rows sum to 460000/, 'the message must carry both numbers');
});

test('a total that is decorative from the start is caught before any interaction', () => {
  // Rows say 180000, the headline says 250000. Nothing was ever computed.
  const result = reconcilePipeline({ ...HONEST, seededTotal: 250000, afterTotal: 250000 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'seed_total_mismatch');
  assert.match(result.message, /before any interaction/);
});

test('a form that does nothing is caught', () => {
  // The row never appears: submit is wired to nothing, or to a handler that throws.
  const result = reconcilePipeline({ ...HONEST, afterRows: 2, afterSum: 180000, afterTotal: 180000 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'row_not_added');
  assert.match(result.message, /dead-control class/);
});

test('a total that recomputes but ignores what the user typed is caught', () => {
  /*
   * The subtle one, and the reason check 3 exists. The tool DID add a row and
   * DID re-derive the total from its rows — so checks 1 and 2 both pass — but
   * it stored a default instead of the 280000 that was entered. Internally
   * consistent, and wrong.
   */
  const result = reconcilePipeline({ ...HONEST, afterSum: 280000, afterTotal: 280000 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'delta_wrong');
  assert.match(result.message, /not with what the user actually entered/);
});

test('an unreadable number is a failure, never a pass', () => {
  // A total rendered as "—" or "$NaN" parses to NaN, and NaN !== NaN would
  // otherwise slip through every equality check below it as a false PASS.
  for (const field of ['seededTotal', 'afterTotal', 'afterSum', 'seededSum', 'addedValue']) {
    const result = reconcilePipeline({ ...HONEST, [field]: Number.NaN });
    assert.equal(result.ok, false, `${field} = NaN must not pass`);
    assert.equal(result.code, 'unreadable_number');
  }
});

test('too few seeded rows is caught rather than silently reconciling zero against zero', () => {
  const result = reconcilePipeline({
    seededRows: 0, seededSum: 0, seededTotal: 0,
    afterRows: 1, afterSum: 280000, afterTotal: 280000,
    addedValue: 280000,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'too_few_rows');
});

test('the golden actually calls this, rather than keeping its own arithmetic', async () => {
  /*
   * §4 again. A judge nobody consults is worse than no judge: this suite would
   * report a clean run while the transaction went on deciding by other means.
   */
  const gate = await readFile(new URL('./deployed-golden-transactions.mjs', import.meta.url), 'utf8');
  assert.match(gate, /reconcilePipeline\(/, 'the business-tool transaction must judge with the tested function');
  assert.match(gate, /business-tool-reconcile\.mjs/, 'and import it rather than re-implementing the comparison');
});
