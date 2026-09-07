/*
 * Run every *.test.ts in the repo through tsx --test.
 *
 * test:ts used to be a hand-maintained list of 114 paths in package.json;
 * a forgotten append meant a test silently never ran — thirteen of them had
 * accumulated by the time the list was replaced with this scan. A test file
 * on disk IS the registration; there is nothing to keep in sync.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runTestsWithFailureSummary } from './lib/run-tests-with-summary.mjs';

const ROOTS = ['api', 'src', 'shared', 'desktop'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

function collect(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(join(dir, entry.name), out);
    } else if (entry.name.endsWith('.test.ts')) {
      out.push(join(dir, entry.name));
    }
  }
}

const files = [];
for (const root of ROOTS) collect(root, files);
files.sort();

if (!files.length) {
  console.error('run-ts-tests: found no *.test.ts files — that cannot be right.');
  process.exit(1);
}

console.log(`run-ts-tests: ${files.length} test file(s)`);
process.exit(await runTestsWithFailureSummary('npx', ['tsx', '--test', ...files], 'TypeScript'));
