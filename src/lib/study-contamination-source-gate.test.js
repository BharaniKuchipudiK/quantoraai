import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const RUNTIME_ROOTS = ['src', 'api', 'shared', 'scripts'];
const SOURCE_EXTENSIONS = /\.(?:js|jsx|mjs|cjs|ts|tsx)$/i;
const forbiddenRepositoryPhrase = [
  'scan through the github',
  ' public repositories',
].join('');

function sourceFiles(root) {
  const out = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...sourceFiles(path));
    else if (SOURCE_EXTENSIONS.test(entry)) out.push(path);
  }
  return out;
}

test('legacy repository-scan poison is absent from runtime source', () => {
  const hits = [];
  for (const root of RUNTIME_ROOTS) {
    for (const path of sourceFiles(root)) {
      const source = readFileSync(path, 'utf8').toLowerCase();
      if (source.includes(forbiddenRepositoryPhrase)) hits.push(path);
    }
  }
  assert.deepEqual(hits, [], `legacy Study contamination phrase remains in runtime source: ${hits.join(', ')}`);
});
