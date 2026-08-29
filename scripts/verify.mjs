#!/usr/bin/env node
/**
 * Run exactly what CI's first job runs, read FROM the workflow.
 *
 * WHY THIS EXISTS
 *
 * For a whole session I ran `npm run lint` and `npm run test:all` after every
 * change and called it verification. CI's job runs four more things, one of
 * which is `lint:undef` — the only eslint step. tsc does not check no-undef in
 * a .js file, so a call to a function I had deleted passed every check I ran
 * and failed the first one I did not.
 *
 * The fix is not remembering harder. The steps are PARSED out of ci.yml, so a
 * step added there is a step run here, and the two cannot drift. If this file
 * and CI ever disagree, this file is wrong by construction and says so.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

/*
 * Only the first job. The browser gates below it need a built preview server
 * and a matching Playwright build, which a dev box may not have — including
 * them would make this fail for reasons that are not the code's fault, and a
 * check people learn to ignore protects nothing.
 */
const lines = workflow.split('\n');
const jobsAt = lines.findIndex((line) => line.trimEnd() === 'jobs:');
if (jobsAt < 0) {
  console.error('verify: no jobs: block in ci.yml — refusing to report a pass.');
  process.exit(1);
}
// Job keys are the only two-space-indented keys under jobs:. Take the first
// job's lines, stopping at the second.
const isJobKey = (line) => /^ {2}[A-Za-z0-9_-]+:\s*$/.test(line);
const firstJobAt = lines.findIndex((line, i) => i > jobsAt && isJobKey(line));
const nextJobAt = lines.findIndex((line, i) => i > firstJobAt && isJobKey(line));
const job = lines.slice(firstJobAt, nextJobAt < 0 ? lines.length : nextJobAt).join('\n');

const steps = [...job.matchAll(/^\s*run:\s*(npm run [\w:-]+|node scripts\/[\w./-]+)\s*$/gm)]
  .map((m) => m[1])
  .filter((cmd) => cmd !== 'npm ci');

if (!steps.length) {
  console.error('verify: could not read any steps from .github/workflows/ci.yml — refusing to report a pass.');
  process.exit(1);
}

console.log(`Running ${steps.length} step(s), read from ci.yml:\n`);
let failed = 0;
for (const cmd of steps) {
  process.stdout.write(`  ${cmd} ... `);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'pipe' });
    console.log('ok');
  } catch (error) {
    failed += 1;
    console.log('FAILED');
    const out = `${error.stdout || ''}${error.stderr || ''}`.trim().split('\n').slice(-25);
    console.log(out.map((line) => `      ${line}`).join('\n'));
  }
}
console.log(failed ? `\n${failed} step(s) failed.` : '\nAll steps passed.');
process.exit(failed ? 1 : 0);
