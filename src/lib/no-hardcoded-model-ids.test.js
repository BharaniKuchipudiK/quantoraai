import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * INVARIANT: no Anthropic model id is written into the source.
 *
 * Why this guard exists. A hardcoded `anthropic/claude-3.5-sonnet` was carried in
 * three separate places (the API catalogue, the UI's fallback model list, and the
 * server approval set). The id had been retired by the provider, so:
 *   - the picker offered a model marked available:true that no longer existed;
 *   - the router selected it, the provider rejected the unknown id, and the turn
 *     silently degraded to a cheap coder that truncated the build.
 * The failure was invisible from the app: it looked like bad output, not a bad id.
 *
 * Anthropic ids move (claude-3.5-sonnet -> claude-sonnet-4.x -> claude-sonnet-5),
 * so ANY id written here is a future outage with a delay fuse. Anthropic routes
 * are discovered from the live provider catalogue at run time
 * (discoverAnthropicFlagships) — there is nothing to hardcode.
 *
 * This is a repo-wide grep, not a per-file assertion, precisely because the last
 * one hid in a file nobody thought to look at.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SCAN_DIRS = ['src', 'api', 'shared'];
const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

/** A vendor-namespaced Anthropic id, e.g. anthropic/claude-sonnet-5. */
const ANTHROPIC_MODEL_ID = /anthropic\/claude[\w.-]*/gi;

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
    // Tests may name ids freely — they assert behaviour against fixtures and
    // never reach a provider.
    if (/\.test\.[cm]?[jt]sx?$/.test(entry)) continue;
    if (!SCAN_EXTENSIONS.has(path.extname(entry))) continue;
    found.push(full);
  }
  return found;
}

test('INVARIANT: no Anthropic model id is hardcoded anywhere in the source', () => {
  const offenders = [];
  for (const file of SCAN_DIRS.flatMap((dir) => sourceFiles(path.join(REPO_ROOT, dir)))) {
    const source = readFileSync(file, 'utf8');
    source.split('\n').forEach((line, index) => {
      // A comment explaining why we do NOT hardcode may name the id.
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      const matches = line.match(ANTHROPIC_MODEL_ID);
      if (matches) {
        offenders.push(`${path.relative(REPO_ROOT, file)}:${index + 1}  ${matches.join(', ')}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    'Anthropic model ids must be discovered from the live provider catalogue '
    + '(discoverAnthropicFlagships), never written into the source — a retired id '
    + 'becomes a route the provider rejects, and the turn silently degrades to a '
    + `weaker model. Remove:\n  ${offenders.join('\n  ')}`,
  );
});
