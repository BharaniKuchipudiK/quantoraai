import assert from 'node:assert/strict';
import test from 'node:test';
import { SILENT_STALL_SEC, describeTurnPhase, stalledTurnActions } from './turn-progress.js';

/*
 * "Building your preview… Hang tight — it appears in Preview when it can run.
 * 2:09" was the same sentence at 5 seconds and at 3 minutes. A person watching
 * it could not tell a healthy turn from one about to die, so the failure was
 * always a surprise.
 */
test('every line is backed by something observed', () => {
  assert.match(describeTurnPhase({ elapsedSec: 3, bytes: 0, modelName: 'Gemini 3 Flash' }).line, /Reaching Gemini 3 Flash/);
  assert.match(describeTurnPhase({ elapsedSec: 12, bytes: 4310, modelName: 'DeepSeek' }).line, /DeepSeek is writing — 4\.2 KB/);
  assert.match(describeTurnPhase({ elapsedSec: 40, bytes: 129000, filePaths: ['index.html', 'products.json'] }).line, /Writing index\.html, products\.json/);
  assert.match(describeTurnPhase({ elapsedSec: 52, filePaths: ['a', 'b'], previewCompiling: true }).line, /Compiling the preview — 2 files/);
  assert.match(describeTurnPhase({ elapsedSec: 61, previewHealing: true }).line, /repairing it/);
});

test('silence is named, not hidden', () => {
  const quiet = describeTurnPhase({ elapsedSec: 25, bytes: 0, modelName: 'Nemotron' });
  assert.match(quiet.line, /nothing received yet/);
  assert.equal(quiet.stalled, false, '25s of quiet is worth saying, not worth panicking about');

  const stalled = describeTurnPhase({ elapsedSec: 70, bytes: 0, modelName: 'Nemotron', budgetSec: 175 });
  assert.match(stalled.line, /No output from Nemotron after 1:10/);
  assert.match(stalled.line, /About 105s left in this turn/);
  assert.equal(stalled.stalled, true);
});

test('later phases outrank earlier ones', () => {
  // What the platform is doing NOW matters more than what it did.
  const compiling = describeTurnPhase({ elapsedSec: 90, bytes: 5000, filePaths: ['index.html'], previewCompiling: true });
  assert.equal(compiling.phase, 'compiling');
  const healing = describeTurnPhase({ elapsedSec: 90, bytes: 5000, filePaths: ['index.html'], previewCompiling: true, previewHealing: true });
  assert.equal(healing.phase, 'healing');
});

test('the clock counts past a minute', () => {
  assert.match(describeTurnPhase({ elapsedSec: 125, bytes: 10 }).line, /\(2:05\)/);
});

test('a long file list is summarised, not dumped', () => {
  const line = describeTurnPhase({ elapsedSec: 30, bytes: 900, filePaths: ['a', 'b', 'c', 'd', 'e'] }).line;
  assert.match(line, /a, b, c \+2 more/);
});

test('a stalled turn offers something to do, not sympathy', () => {
  const actions = stalledTurnActions({ hasPreview: true, isBuild: true });
  assert.ok(actions.length >= 3);
  assert.ok(actions.some((a) => /shorter ask/i.test(a)));
  assert.ok(actions.some((a) => /one file at a time/i.test(a)));
  assert.ok(actions.some((a) => /refine it instead/i.test(a)));
  assert.equal(describeTurnPhase({ elapsedSec: SILENT_STALL_SEC - 1, bytes: 0 }).stalled, false);
});

test('absent or invalid telemetry is unknown, never measured silence', () => {
  for (const bytes of [undefined, null, NaN, Infinity, -1, '0', '1024']) {
    for (const elapsedSec of [3, 31, 70, 175]) {
      const phase = describeTurnPhase({ bytes, elapsedSec });
      assert.equal(phase.phase, 'unknown', `${String(bytes)} at ${elapsedSec}s`);
      assert.equal(phase.stalled, false);
      assert.doesNotMatch(phase.line, /nothing received|No output|writing|0 B/i);
    }
  }
});

test('known files and compilation do not invent missing byte or file counts', () => {
  assert.equal(describeTurnPhase({ filePaths: ['index.html'], elapsedSec: 31 }).line, 'Writing index.html (0:31)');
  assert.equal(describeTurnPhase({ previewCompiling: true, elapsedSec: 31 }).line, 'Compiling the preview (0:31)');
  assert.equal(describeTurnPhase({ bytes: 1024, elapsedSec: 31 }).phase, 'streaming');
  assert.equal(describeTurnPhase({ bytes: 0, elapsedSec: 31 }).phase, 'silent');
});
