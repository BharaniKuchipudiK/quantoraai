/*
 * Run every *.test.js and *.test.mjs in the repo through `node --test`.
 *
 * WHY THIS EXISTS
 *
 * The TypeScript side learned this lesson already: test:ts used to be a
 * hand-maintained list of 114 paths, thirteen of them had silently stopped
 * running, and scripts/run-ts-tests.mjs replaced the list with a scan.
 *
 * The plain-Node side kept the old shape — a row of globs in package.json,
 * one per directory someone had happened to put a test in:
 *
 *   api/_lib/*.test.js src/lib/*.test.js src/lib/quantum/*.test.js
 *   src/hooks/*.test.js scripts/*.test.mjs
 *
 * A glob list enumerates DIRECTORIES, so it is silent about the only case
 * that matters: a test in a directory nobody thought of. shared/travel/ was
 * such a directory. A refusal-copy test written there passed locally, was
 * committed, and ran in exactly zero CI jobs — CLAUDE.md §7 names this
 * failure ("a test that ran nowhere") and it recurred anyway, because the fix
 * recorded there closed the TypeScript half and left this half open.
 *
 * A test that runs nowhere is worse than no test: it reports confidence to
 * its author and buys nothing (§4). So the registration is now the file's
 * existence, and there is no list to forget to update.
 *
 * The .test.ts files are deliberately NOT collected here — they need tsx for
 * type stripping and have their own runner. Splitting by runtime, not muting
 * one side, is §5.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOTS = ['api', 'src', 'shared', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);
const TEST_SUFFIXES = ['.test.js', '.test.mjs'];

function collect(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // a root that does not exist yet is not a failure
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(join(dir, entry.name), out);
    } else if (TEST_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
      out.push(join(dir, entry.name));
    }
  }
}

const files = [];
for (const root of ROOTS) collect(root, files);
files.sort();

/*
 * Zero files means the scan broke, not that the repo has no tests. Reporting a
 * clean run over nothing is the exact failure mode §4 is about, so this is
 * fatal and says which roots were searched.
 */
if (!files.length) {
  console.error(`run-node-tests: found no *.test.js or *.test.mjs under ${ROOTS.join(', ')} — that cannot be right.`);
  process.exit(1);
}

console.log(`run-node-tests: ${files.length} test file(s)`);
const result = spawnSync('node', ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
