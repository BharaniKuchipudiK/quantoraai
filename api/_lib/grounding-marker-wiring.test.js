/**
 * The marker mechanism has one load-bearing assumption: the model never sees it.
 *
 * shared/research/grounding-marker.test.js proves stripGroundingMarker works.
 * Nothing proved chat-handler CALLS it, and a marker the model can read is a
 * marker it can imitate — assistant turns re-enter context verbatim, which is
 * why the model started writing source blocks in the first place. A strip that
 * is not wired makes the whole thing decorative, and CLAUDE.md §4 rates a check
 * that cannot fail as worse than no check.
 *
 * A full integration test of chat-handler is not practical here, so this reads
 * the source and asserts an unambiguous contract, in the manner of
 * src/lib/tool-claims.js:
 *
 *   1. boundedHistory is built by stripping the marker, and
 *   2. every model-context construction reads boundedHistory — never `history`.
 *
 * Point 2 is the one that matters over time. Adding a fourth inference path
 * that reads raw history would leak the marker while every other test in the
 * repo stayed green.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/*
 * Resolved from this file, not process.cwd(). A cwd-relative path makes a test
 * that passes from the repo root and fails from anywhere else, which reads as
 * a broken gate rather than a broken assumption.
 */
const HANDLER = join(dirname(fileURLToPath(import.meta.url)), 'chat-handler.ts');
const source = readFileSync(HANDLER, 'utf8');

test('boundedHistory is built by stripping the grounding marker', () => {
  const match = source.match(/const boundedHistory\s*=[\s\S]{0,400}?;/);
  assert.ok(match, 'boundedHistory is no longer declared the way this test expects — re-read the wiring');
  assert.match(
    match[0],
    /stripGroundingMarkerFromMessage/,
    'history reaching a model must have the marker removed first',
  );
});

test('the strip is imported from the shared module, not reimplemented', () => {
  assert.match(
    source,
    /import\s*\{[^}]*stripGroundingMarkerFromMessage[^}]*\}\s*from\s*'\.\.\/\.\.\/shared\/research\/grounding-marker\.js'/,
    'one definition of the marker, shared by the emitter, the stripper and the board',
  );
});

test('every model-context construction reads boundedHistory, never raw history', () => {
  /*
   * The two shapes model context is built in today: Gemini contents, and the
   * OpenRouter formattedHistory map. Both must read the stripped list.
   */
  /*
   * `(?<!function )` matters: the declaration is `function buildGeminiContents(
   * history: any[], ...)` and its PARAMETER is named history, so a naive match
   * reports the definition as a leak. The first draft of this test did exactly
   * that and failed on correct code — a gate that cannot pass is the same
   * defect as one that cannot fail (CLAUDE.md §4), and only reading its output
   * rather than its exit code showed which one this was (§8).
   */
  const geminiCalls = [...source.matchAll(/(?<!function )buildGeminiContents\(\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  assert.ok(geminiCalls.length >= 1, 'expected buildGeminiContents call sites; the dispatch shape moved');
  for (const arg of geminiCalls) {
    assert.equal(arg, 'boundedHistory', `buildGeminiContents(${arg}) bypasses the strip`);
  }

  const historyMaps = [...source.matchAll(/\.\.\.\(\s*([A-Za-z_$][\w$]*)\s*\|\|\s*\[\]\)\.map\(/g)].map((m) => m[1]);
  assert.ok(historyMaps.length >= 1, 'expected the formattedHistory map; the dispatch shape moved');
  for (const arg of historyMaps) {
    assert.equal(arg, 'boundedHistory', `history spread from ${arg} bypasses the strip`);
  }
});

test('the source block is emitted by the shared builder, so the marker cannot be forgotten', () => {
  // Two append sites existed and were byte-identical by hand. One builder means
  // a change to the block shape cannot land in one and miss the other.
  assert.ok(
    !/\*\*Sources\*\*\\n`?;/.test(source.replace(/buildGroundedSourceBlock/g, '')),
    'a hand-rolled Sources block is back in chat-handler; use buildGroundedSourceBlock',
  );
  const emitted = [...source.matchAll(/buildGroundedSourceBlock\(/g)];
  assert.ok(emitted.length >= 2, `expected both append sites to use the builder, found ${emitted.length}`);
});
