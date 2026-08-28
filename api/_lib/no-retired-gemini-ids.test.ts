import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * INVARIANT: no pinned Gemini version id anywhere in served code.
 *
 * `gemini-1.5-flash` sat in api/autocomplete.ts and api/domains.ts long after
 * Google stopped serving it. The production key's catalogue lists 53 Gemini
 * models and that is not among them, so every call from those two endpoints was
 * a 404 — and a 404 on a model id is indistinguishable, from the outside, from
 * a broken key. It contributed weeks to a diagnosis that was already lost.
 *
 * The rule: reach Gemini through an alias Google maintains (gemini-flash-latest,
 * gemini-pro-latest) or through an id resolved from the live catalogue. A pinned
 * version is a dated assumption that fails silently the day it expires, and this
 * codebase has now been bitten by three of them.
 *
 * Deliberately a source scan rather than a behavioural test: the defect is the
 * literal existing at all, and no runtime path can assert its absence.
 */

const ROOT = path.join(import.meta.dirname, '..', '..');
// A version-pinned id: gemini-<number>… . The maintained aliases carry no
// version, which is exactly what makes them safe.
const PINNED = /["'`]gemini-\d[\w.]*-[\w-]+["'`]/g;

const SEARCH_DIRS = ['api', 'src'];
const SKIP = /\.test\.[jt]sx?$|node_modules|\/dist\//;
const CODE = /\.(ts|tsx|js|jsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (SKIP.test(full)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (CODE.test(entry.name)) out.push(full);
  }
  return out;
}

test('INVARIANT: no served code pins a Gemini version id', () => {
  const offenders: string[] = [];
  for (const dir of SEARCH_DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.match(PINNED) || []) {
        offenders.push(`${path.relative(ROOT, file)}: ${match}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'reach Gemini through a maintained alias or the live catalogue, never a pinned version:\n  ' + offenders.join('\n  '),
  );
});
