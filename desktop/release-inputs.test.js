import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * Every file the release workflow needs must be IN THE REPOSITORY.
 *
 * THE INCIDENT THIS EXISTS FOR
 *
 * `.gitignore` line 3 is a bare `build/`. A bare directory pattern matches at
 * every depth, so it silently swallowed `desktop/build/` — the directory
 * holding electron-builder's configuration and the macOS entitlements. Both
 * files existed on the machine of whoever wrote them and on no other machine
 * in the world. `git ls-tree -r origin/main` under desktop/build listed
 * nothing.
 *
 * Meanwhile desktop-release.yml runs
 *   npx electron-builder --config build/<config>
 * so the very first `desktop-v*` tag would have checked out a tree without
 * that file and died before packaging anything. Nothing caught it, because
 * every other gate runs against a working tree where the files are present:
 * the smoke gate builds and launches the app without ever consulting the
 * packaging config, and typecheck does not read it either. The one question
 * nobody asked was whether the file is committed.
 *
 * This is the "green locally, broken elsewhere" class of CLAUDE.md §10, with
 * git rather than a runtime as the thing that disagrees. So the check is
 * `git ls-files`, not `existsSync` — a file on disk proves nothing here, and
 * an existsSync version of this test would have passed while the bug was
 * present, which per §4 makes it worse than no test.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function isTracked(repoPath) {
  const listed = execFileSync('git', ['ls-files', '--', repoPath], { cwd: ROOT, encoding: 'utf8' });
  return listed.trim() !== '';
}

const workflow = readFileSync(new URL('../.github/workflows/desktop-release.yml', import.meta.url), 'utf8');

test('the electron-builder config the release workflow names is committed', () => {
  const match = /electron-builder\s+--config\s+(\S+)/.exec(workflow);
  assert.ok(match, 'desktop-release.yml must invoke electron-builder with an explicit --config');
  // The workflow runs with working-directory: desktop, so its path is
  // relative to desktop/.
  const configPath = `desktop/${match[1]}`;
  assert.ok(
    isTracked(configPath),
    `${configPath} is not tracked by git. The release job checks out a fresh tree and will not find it. `
    + 'Check .gitignore — a bare `build/` rule matches desktop/build/ at any depth.',
  );
});

test('every asset that config points at is committed too', () => {
  // Read the config's own text rather than importing it, so this test states
  // which paths it checked even if the module later fails to load.
  const source = readFileSync(new URL('build/signing-policy.cjs', import.meta.url), 'utf8');
  const referenced = [...source.matchAll(/'(build\/[^']+)'/g)].map((m) => `desktop/${m[1]}`);
  const unique = [...new Set(referenced)];

  assert.ok(unique.length >= 2, `expected the config to reference build assets, found ${unique.length}`);
  for (const asset of unique) {
    assert.ok(isTracked(asset), `${asset} is referenced by the packaging config but is not tracked by git`);
  }
});

test('build output stays out of the repository', () => {
  // The counterweight: fixing the ignore rule must not start committing
  // packaged installers, which are hundreds of megabytes.
  for (const output of ['desktop/release', 'desktop/dist']) {
    assert.equal(isTracked(output), false, `${output} is build output and must not be tracked`);
  }
});
