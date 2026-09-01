/*
 * Run every Study server-side *.test.ts through tsx --test.
 *
 * The old test:study-assessment command maintained a manual file list and had
 * already drifted behind V7. For the focused Study gate, a Study test file on
 * disk is now its own registration, matching the repository-wide test:ts rule.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = join(process.cwd(), 'api', '_lib');
const files = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^study-.*\.test\.ts$/.test(entry.name))
  .map((entry) => join(ROOT, entry.name))
  .sort();

if (!files.length) {
  console.error('run-study-ts-tests: found no Study *.test.ts files — that cannot be right.');
  process.exit(1);
}

console.log(`run-study-ts-tests: ${files.length} test file(s)`);
const result = spawnSync('npx', ['tsx', '--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
