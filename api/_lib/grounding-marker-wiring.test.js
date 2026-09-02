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
import { readFileSync, readdirSync } from 'node:fs';
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

test('chat-handler emits the block through the shared builder', () => {
  const emitted = [...source.matchAll(/buildGroundedSourceBlock\(/g)];
  assert.ok(emitted.length >= 2, `expected both append sites to use the builder, found ${emitted.length}`);
});

/**
 * THE CLASS, not the instance.
 *
 * The first version of this test policed chat-handler alone, because that was
 * where the two append sites lived. api/_lib/research-deep-dive.ts also emitted
 * a Sources block — hand-rolled, and its own comment described it as
 * "byte-identical in shape to chat-handler's", which is drift with a docstring.
 *
 * When the server started marking blocks it stands behind, chat-handler was
 * updated and the deep dive was not. Every deep-dive answer silently stopped
 * counting as grounded on the board: no crash, no failing gate here, just a
 * feature quietly losing its evidence. A gate scoped to one file could not see
 * it, and the only reason it surfaced at all is that main's own deep-dive tests
 * happened to assert the brief afterwards.
 *
 * So the rule is now about the format, wherever it is written: any shipped
 * source file that writes a `**Sources**` heading into a string must be the
 * shared builder itself, or must call it.
 */
const ROOTS = ['api', 'src', 'shared'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

function collectSources(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectSources(full, out);
    } else if (/\.(ts|js|jsx|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
}

test('EVERY emitter of a Sources block goes through the shared builder', () => {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const files = [];
  for (const root of ROOTS) collectSources(join(repo, root), files);
  assert.ok(files.length > 100, `expected to scan the repo, found ${files.length} files — the scan broke`);

  const offenders = [];
  for (const file of files) {
    /*
     * Comments are stripped first. Without that this fired on
     * src/lib/research-brief.js — the PARSER, whose JSDoc writes `**Sources**`
     * as a markdown code span to describe the format it reads. A gate that
     * fails on correct code is the same defect as one that cannot fail (§4),
     * and reading its output rather than its exit status is what told them
     * apart (§8).
     */
    const text = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
    // A string literal that WRITES the heading, now that prose is gone.
    if (!/`[^`]*\*\*Sources\*\*[^`]*`|'[^']*\*\*Sources\*\*[^']*'|"[^"]*\*\*Sources\*\*[^"]*"/.test(text)) continue;
    const rel = file.slice(repo.length + 1);
    // The builder itself is allowed to write the format; everyone else calls it.
    if (rel === join('shared', 'research', 'grounding-marker.js')) continue;
    if (/buildGroundedSourceBlock/.test(text)) continue;
    offenders.push(rel);
  }

  assert.deepEqual(
    offenders,
    [],
    `these files write a **Sources** block without the shared builder, so the server's marker will be missing and the board will not count their sources:\n  ${offenders.join('\n  ')}\nUse buildGroundedSourceBlock from shared/research/grounding-marker.js.`,
  );
});
