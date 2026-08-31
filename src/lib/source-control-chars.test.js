import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * INVARIANT: no source file carries a raw control character.
 *
 * Why this guard exists. `desk-checkpoints.js` shipped with two raw bytes used as
 * hash field separators — written as the characters themselves rather than as
 * escapes:
 *
 *     mix(path);
 *     mix('<0x00>');
 *     mix(body);
 *     mix('<0x01>');
 *
 * The code was correct and every test passed. The damage was in what the tools
 * around it then did, and the two bytes do different harm:
 *
 *   - The NUL is what git's binary heuristic looks for. With one present, git
 *     stops producing a text diff for the file: `git diff --numstat` reports
 *     `-  -`, GitHub's API returns no `patch`, and the "Files changed" view shows
 *     nothing. A 5.3 KB module went into main with no diff shown to any reviewer,
 *     human or bot. Nobody declined to review it; nobody was shown it. Textual
 *     three-way merge is gone too, so two branches appending to opposite ends of
 *     the file — which git normally resolves silently — hard-conflict.
 *
 *   - The others (0x01 here) leave git's diff alone. They cost the reader
 *     instead: a control character renders as nothing, so `mix('<0x01>')` reads
 *     on screen as `mix('')` — an empty separator that does nothing. Code that
 *     lies about what it does is its own defect.
 *
 * Both are banned, because the fix costs nothing: `'\u0000'` and `'\u0001'` are
 * the same string values, byte-identical in behaviour, and visible on the page.
 *
 * Tests are scanned too — a test file that git cannot diff is as unreviewable as
 * any other, and a separator constant is exactly the kind of thing a fixture
 * carries.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SCAN_DIRS = ['src', 'api', 'shared'];
const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

// Tab, newline and carriage return are how source is written; nothing else
// below 0x20 has a reason to appear as a literal byte.
const ALLOWED = new Set([0x09, 0x0a, 0x0d]);

function sourceFiles(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      sourceFiles(full, found);
      continue;
    }
    if (!SCAN_EXTENSIONS.has(path.extname(entry))) continue;
    found.push(full);
  }
  return found;
}

/** Every raw control character in `source`, located for a reader. */
export function findControlCharacters(source) {
  const found = [];
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i);
    if (code === 0x0a) {
      line += 1;
      lineStart = i + 1;
      continue;
    }
    if (code < 0x20 && !ALLOWED.has(code)) {
      found.push({ code, line, column: i - lineStart + 1 });
    }
  }
  return found;
}

test('INVARIANT: no source file carries a raw control character', () => {
  const offenders = [];
  for (const file of SCAN_DIRS.flatMap((dir) => sourceFiles(path.join(REPO_ROOT, dir)))) {
    // Read as UTF-8 text: an escape like '\u0000' is six ordinary characters and
    // is not a match, which is precisely the form this guard is steering toward.
    for (const hit of findControlCharacters(readFileSync(file, 'utf8'))) {
      const hex = `0x${hit.code.toString(16).padStart(2, '0')}`;
      const note = hit.code === 0 ? ' — this is the one that makes git call the file binary' : '';
      offenders.push(`${path.relative(REPO_ROOT, file)}:${hit.line}:${hit.column}  ${hex}${note}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'Raw control characters must be written as escapes (\'\\u0000\', \'\\u0001\'), '
    + 'which carry the same string value. A NUL makes git treat the file as binary: '
    + 'no diff in review, no textual merge, and the file lands unread. The others '
    + 'render as nothing, so the code reads as an empty string and misleads. '
    + `Fix:\n  ${offenders.join('\n  ')}`,
  );
});

test('the scanner finds each control character and leaves escapes alone', () => {
  // The real shape this guard was written for, as an escape: must not match.
  assert.deepEqual(findControlCharacters("mix('\\u0000');\nmix('\\u0001');"), []);
  // Tab, newline and carriage return are ordinary source, never offenders.
  assert.deepEqual(findControlCharacters('const a = 1;\n\tconst b = 2;\r\n'), []);

  // The literal bytes as they actually shipped, on two separate lines.
  const shipped = `mix('${String.fromCharCode(0)}');\nmix('${String.fromCharCode(1)}');`;
  assert.deepEqual(findControlCharacters(shipped), [
    { code: 0, line: 1, column: 6 },
    { code: 1, line: 2, column: 6 },
  ]);
});
