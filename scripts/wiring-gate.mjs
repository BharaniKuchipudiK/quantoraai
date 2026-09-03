#!/usr/bin/env node
/**
 * Fails when a NEW wire is dead: an exported symbol that is tested but called by
 * no production code, or a component under src/components/ that nothing renders.
 *
 * A ratchet against src/lib/wiring-baseline.json. Run with --update after
 * deliberately wiring or deleting something, and commit the smaller baseline.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { compareToBaseline, findOrphanComponents, findOrphanExports, orphanKey } from '../src/lib/wiring-audit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'src', 'lib', 'wiring-baseline.json');
const SOURCE_DIRS = ['src', 'shared', 'api', 'scripts', 'desktop'];
/*
 * Root config files count as production code.
 *
 * vite.config.ts imports crossOriginHeadersForPath to set the COEP headers
 * Preview depends on, and the gate could not see it — so vercel-headers was
 * reported orphaned and I very nearly deleted it during a sweep. Typecheck
 * caught that one; the next might not be typed. A dead-code check that cannot
 * see the build config is one file away from breaking the build.
 */
const ROOT_FILES = ['vite.config.ts', 'vite.config.js', 'vitest.config.ts', 'playwright.config.ts', 'eslint.config.js'];
// .mjs matters: every browser gate in scripts/ is one, so omitting it made
// anything called only from a script look like it had no caller at all.
const CODE = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git'].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (CODE.has(extname(path))) out.push(path);
  }
  return out;
}

const files = {};
for (const dir of SOURCE_DIRS) {
  for (const path of walk(join(ROOT, dir))) {
    files[path.slice(ROOT.length + 1)] = readFileSync(path, 'utf8');
  }
}
for (const name of ROOT_FILES) {
  const path = join(ROOT, name);
  if (existsSync(path)) files[name] = readFileSync(path, 'utf8');
}

// Two questions, one baseline: a symbol nobody calls, and a component nobody
// renders. TravelTripBoard was the second kind and no gate here could see it.
const orphans = [...findOrphanExports(files), ...findOrphanComponents(files)]
  .sort((left, right) => left.file.localeCompare(right.file) || left.name.localeCompare(right.name));

if (process.argv.includes('--update')) {
  const keys = orphans.map(orphanKey);
  writeFileSync(BASELINE, `${JSON.stringify(keys, null, 2)}\n`);
  console.log(`Wiring baseline updated: ${keys.length} dead wire(s) recorded.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const { added, removed, ok, total } = compareToBaseline(orphans, baseline);

if (removed.length) {
  console.log(`Wiring improved — ${removed.length} wire(s) no longer orphaned:`);
  for (const key of removed) console.log(`  - ${key}`);
  console.log('Run "npm run test:wiring -- --update" and commit the smaller baseline.\n');
}

if (ok) {
  console.log(`Wiring gate passed: ${total} known orphan(s), 0 new.`);
  process.exit(0);
}

console.error(`\nWiring gate FAILED — ${added.length} new dead wire(s):\n`);
for (const key of added) console.error(`  ${key}`);
console.error(`
A passing test on a disconnected wire is worse than no test: it asserts a
feature works while nothing can reach it. shouldStartGuidedBuild sat like this
for months, so the platform never asked an intake question and built a 970-line
storefront under an invented brand name instead.

A component under src/components/ that nothing imports is the same failure
wearing a bigger coat. TravelTripBoard was a finished trip board — live flight
and hotel search — that AiStudio never rendered, and it was the only caller of
/api/travel-search, so that endpoint was unreachable from the running product.

Either call it from production code (render the component), or delete it and
its tests. If it is genuinely meant to be reachable only from tests (a reset or
cache-clear hook), run "npm run test:wiring -- --update" and commit the baseline
with that reason in the commit message.
`);
process.exit(1);
