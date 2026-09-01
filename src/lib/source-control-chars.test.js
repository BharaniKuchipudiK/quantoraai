import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * INVARIANT: no tracked text file carries a raw control character.
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
 * Why this asks git for the file list rather than naming directories. The first
 * version of this guard walked a hand-listed set of roots and extensions,
 * borrowed from no-hardcoded-model-ids.test.js. That narrowing is right there — a
 * model id can only do harm in source that reaches a provider — and wrong here.
 * The harm is git's diff, so the scope is whatever git versions: a NUL in
 * `vite.config.ts`, `scripts/wiring-gate.mjs` or a `.css` file is exactly as
 * unreviewable, and all three slipped past the hand-listed version while git
 * reported `-  -` for every one of them. Asking git removes the judgement call:
 * coverage is the repository, and a new directory or file type is covered the
 * day it is added rather than the day someone remembers this list.
 *
 * The only exclusions are genuinely binary assets. That list was measured, not
 * guessed: of 856 tracked files, exactly two extensions carry control characters
 * — .jpg (15 files) and .png (5). The rest of the denylist is the neighbouring
 * asset formats a repo like this tends to gain. Anything binary and NOT on it
 * fails loudly and gets added, which is the safe direction: a guard that errs
 * toward asking is recoverable, one that errs toward silence is how the original
 * defect reached main.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

/** Genuinely binary assets — the only files exempt from being readable text. */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico', '.icns',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.zip', '.gz', '.tgz', '.br',
  '.mp3', '.mp4', '.wav', '.webm', '.mov', '.ogg',
]);

// Tab, newline and carriage return are how text is written; nothing else below
// 0x20 has a reason to appear as a literal byte.
const ALLOWED = new Set([0x09, 0x0a, 0x0d]);

/**
 * Every raw control character in `input`, located for a reader.
 *
 * A Buffer is decoded latin1 so each byte maps to exactly one character: the
 * scan is then a byte scan, which is what git's own heuristic operates on. UTF-8
 * continuation bytes are all >= 0x80 and never collide with this range, so a
 * multi-byte character can never be mistaken for a control byte.
 */
export function findControlCharacters(input) {
  const source = Buffer.isBuffer(input) ? input.toString('latin1') : input;
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

/** Every path git tracks. Throws rather than returning nothing to scan. */
function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
  });
  const files = out.toString('utf8').split('\0').filter(Boolean);
  // A silent empty list would make this invariant vacuously true, which is the
  // failure mode the guard exists to prevent.
  assert.ok(files.length > 0, 'git ls-files returned nothing — the guard would pass vacuously');
  return files;
}

test('INVARIANT: no tracked text file carries a raw control character', () => {
  const offenders = [];
  for (const file of trackedFiles()) {
    if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    let bytes;
    try {
      bytes = readFileSync(path.join(REPO_ROOT, file));
    } catch {
      continue; // tracked but not in the worktree (a deletion not yet committed)
    }
    for (const hit of findControlCharacters(bytes)) {
      const hex = `0x${hit.code.toString(16).padStart(2, '0')}`;
      const note = hit.code === 0 ? ' — this is the one that makes git call the file binary' : '';
      offenders.push(`${file}:${hit.line}:${hit.column}  ${hex}${note}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'Raw control characters must be written as escapes (\'\\u0000\', \'\\u0001\'), '
    + 'which carry the same string value. A NUL makes git treat the file as binary: '
    + 'no diff in review, no textual merge, and the file lands unread. The others '
    + 'render as nothing, so the code reads as an empty string and misleads. If one '
    + 'of these is a new kind of binary asset, add its extension to '
    + `BINARY_EXTENSIONS instead. Fix:\n  ${offenders.join('\n  ')}`,
  );
});

test('the scanner finds each control character and leaves ordinary text alone', () => {
  // The real shape this guard was written for, as an escape: must not match.
  assert.deepEqual(findControlCharacters("mix('\\u0000');\nmix('\\u0001');"), []);
  // Tab, newline and carriage return are ordinary text, never offenders.
  assert.deepEqual(findControlCharacters('const a = 1;\n\tconst b = 2;\r\n'), []);
  // A multi-byte character must not be mistaken for a control byte.
  assert.deepEqual(findControlCharacters(Buffer.from('const label = "café ☕";', 'utf8')), []);

  // The literal bytes as they actually shipped, on two separate lines.
  const shipped = `mix('${String.fromCharCode(0)}');\nmix('${String.fromCharCode(1)}');`;
  assert.deepEqual(findControlCharacters(shipped), [
    { code: 0, line: 1, column: 6 },
    { code: 1, line: 2, column: 6 },
  ]);
});

test('the tracked-file list reaches past src — config, scripts and stylesheets', () => {
  const tracked = new Set(trackedFiles());
  // The three shapes that slipped past the hand-listed version of this guard.
  assert.ok(tracked.has('vite.config.ts'), 'repo-root config is in scope');
  assert.ok(
    [...tracked].some((f) => f.startsWith('scripts/') && f.endsWith('.mjs')),
    'scripts/*.mjs is in scope',
  );
  assert.ok([...tracked].some((f) => f.endsWith('.css')), 'stylesheets are in scope');
});
