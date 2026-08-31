import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Playwright is pinned in three places: package.json, and a PLAYWRIGHT_VERSION
 * env in each workflow that runs browser gates. The env is only a cache key —
 * the version that actually gets installed comes from the lockfile — so a stale
 * one does not fail loudly. It restores a cache built for a different browser
 * build and wastes the download it was meant to save.
 *
 * Worse is the shape this replaced. Both workflows used to run
 *
 *   npm install --no-save --package-lock=false playwright@<version>
 *
 * after `npm ci`, which silently downgrades whatever the lockfile installed and
 * keeps Playwright out of package.json, and so out of `npm audit`. That is how
 * CI ran for months against GHSA-7mvr-c777-76hp without the audit gate seeing
 * it — and when the pattern was removed from ci.yml, the identical line in
 * deployed-golden-transactions.yml was missed until review caught it. One file
 * fixed is not the same as the practice ended.
 */

const WORKFLOWS = '.github/workflows';

const workflowFiles = () => readdirSync(WORKFLOWS)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .map((name) => [name, readFileSync(join(WORKFLOWS, name), 'utf8')]);

// Comments may name a version while explaining the history; only real commands count.
const code = (source) => source.replace(/^\s*#.*$/gm, '');

test('no workflow installs Playwright at a version of its own', () => {
  const offenders = workflowFiles()
    .filter(([, source]) => /npm\s+(install|i)\b[^\n]*\bplaywright@/.test(code(source)))
    .map(([name]) => name);

  assert.deepEqual(offenders, [], `these reinstall Playwright over the lockfile:\n${offenders.join('\n')}`);
});

test('every PLAYWRIGHT_VERSION cache key matches the pinned dependency', () => {
  const pinned = JSON.parse(readFileSync('package.json', 'utf8')).devDependencies?.playwright;
  assert.ok(pinned, 'playwright must stay a devDependency so npm audit can see it');
  assert.match(pinned, /^\d+\.\d+\.\d+$/, `playwright must be pinned exactly, found "${pinned}"`);

  const mismatched = workflowFiles()
    .map(([name, source]) => [name, /PLAYWRIGHT_VERSION:\s*([^\s#]+)/.exec(source)?.[1]])
    .filter(([, version]) => version && version !== pinned);

  assert.deepEqual(
    mismatched.map(([name, version]) => `${name}: ${version} (package.json: ${pinned})`),
    [],
  );
});
