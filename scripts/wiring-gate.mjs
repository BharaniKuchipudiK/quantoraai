#!/usr/bin/env node
/**
 * Fails when a NEW exported symbol is tested but called by no production code.
 *
 * A ratchet against src/lib/wiring-baseline.json. Run with --update after
 * deliberately wiring or deleting something, and commit the smaller baseline.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { compareToBaseline, findOrphanExports, orphanKey } from '../src/lib/wiring-audit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'src', 'lib', 'wiring-baseline.json');
const SOURCE_DIRS = ['src', 'shared', 'api', 'scripts'];
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

const orphans = findOrphanExports(files);

if (process.argv.includes('--update')) {
  const keys = orphans.map(orphanKey);
  writeFileSync(BASELINE, `${JSON.stringify(keys, null, 2)}\n`);
  console.log(`Wiring baseline updated: ${keys.length} orphaned export(s) recorded.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const { added, removed, ok, total } = compareToBaseline(orphans, baseline);

if (removed.length) {
  console.log(`Wiring improved — ${removed.length} export(s) no longer orphaned:`);
  for (const key of removed) console.log(`  - ${key}`);
  console.log('Run "npm run test:wiring -- --update" and commit the smaller baseline.\n');
}

if (ok) {
  console.log(`Wiring gate passed: ${total} known orphan(s), 0 new.`);
  process.exit(0);
}

console.error(`\nWiring gate FAILED — ${added.length} export(s) are tested but called by nothing:\n`);
for (const key of added) console.error(`  ${key}`);
console.error(`
A passing test on a disconnected wire is worse than no test: it asserts a
feature works while nothing can reach it. shouldStartGuidedBuild sat like this
for months, so the platform never asked an intake question and built a 970-line
storefront under an invented brand name instead.

Either call it from production code, or delete it and its tests. If it is
genuinely meant to be reachable only from tests (a reset or cache-clear hook),
run "npm run test:wiring -- --update" and commit the baseline with that reason
in the commit message.
`);
process.exit(1);
