#!/usr/bin/env node
/**
 * Every GitHub mutation must pass through the authorization seam, and be
 * covered by a behavioral test that proves it refuses.
 *
 * WHY A STATIC GATE ON TOP OF A BEHAVIORAL TEST
 *
 * The authorization tests prove the write operations that exist today refuse
 * a principal without push access. They cannot say anything about the next
 * write somebody adds unless this static scan names it.
 *
 * So this gate asks:
 *   1. Which functions in api/ send a mutating request to api.github.com?
 *   2. Does each of them call authorizeWrite() or an equivalent GitHub-backed
 *      authorization seam before the mutation?
 *   3. Is each of them named in one of the fixed authorization test files?
 *
 * Dedicated tests are allowed, but only from the explicit list below. This is
 * not a glob over every test in the repository: a function name appearing in
 * an unrelated snapshot or documentation test must never satisfy a security
 * proof. `github-push-from-base.test.ts` is listed because that helper has a
 * distinct two-direction contract (read-only refusal + branch-from-base write)
 * that is clearer beside the helper than inside the already-large general
 * authorization suite.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import process from 'node:process';

const ROOTS = ['api'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const CODE = new Set(['.ts', '.js', '.mjs']);
const TEST_FILES = [
  'api/_lib/github-write-authorization.test.ts',
  'api/_lib/github-push-from-base.test.ts',
];

/*
 * Three authorizers, because there are two genuinely different questions.
 *
 * `authorizeWrite` / `assertRepositoryPermission` ask what a user may do to a
 * repository that EXISTS. Creating a repository has none to ask about, so those
 * calls cannot apply.
 */
const AUTHORIZERS = [
  'authorizeWrite(',
  'assertRepositoryPermission(',
  'assertRepositoryCreationAllowed(',
];
const MUTATING_METHODS = ['"POST"', '"PUT"', '"PATCH"', '"DELETE"', "'POST'", "'PUT'", "'PATCH'", "'DELETE'"];

/**
 * Precision matters here more than reach. Ask whether this individual call is
 * bound for GitHub, rather than treating every POST in a function that also
 * reads api.github.com as a repository mutation.
 */
const CALL_OPENERS = ['githubRequest(', 'fetch('];

function collect(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(join(dir, entry.name), out);
    } else if (CODE.has(extname(entry.name)) && !/\.test\.[a-z]+$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/** Split source into top-level named function bodies. */
function functionBlocks(source) {
  const blocks = [];
  const signature = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g;
  let match;
  while ((match = signature.exec(source)) !== null) {
    let index = match.index + match[0].length;
    let parens = 1;
    while (index < source.length && parens > 0) {
      if (source[index] === '(') parens += 1;
      else if (source[index] === ')') parens -= 1;
      index += 1;
    }
    if (parens !== 0) continue;

    let angles = 0;
    let open = -1;
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (char === '<') angles += 1;
      else if (char === '>') angles = Math.max(0, angles - 1);
      else if (char === '{' && angles === 0) { open = index; break; }
      else if (char === ';' && angles === 0) break;
    }
    if (open === -1) continue;

    let depth = 0;
    let end = -1;
    for (let scan = open; scan < source.length; scan += 1) {
      const char = source[scan];
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) { end = scan; break; }
      }
    }
    if (end === -1) continue;

    blocks.push({
      name: match[1],
      body: source.slice(open, end + 1),
      line: source.slice(0, match.index).split('\n').length,
    });
  }
  return blocks;
}

function githubApiMutation(body) {
  for (const marker of MUTATING_METHODS) {
    const needle = `method: ${marker}`;
    let index = body.indexOf(needle);
    while (index !== -1) {
      const openerIndex = Math.max(...CALL_OPENERS.map((opener) => body.lastIndexOf(opener, index)));
      if (openerIndex !== -1) {
        const opener = CALL_OPENERS.find((candidate) => body.startsWith(candidate, openerIndex));
        const callText = body.slice(openerIndex, index);
        if (opener === 'githubRequest(' || callText.includes('api.github.com')) {
          return marker.replace(/['"]/g, '');
        }
      }
      index = body.indexOf(needle, index + 1);
    }
  }
  return null;
}

function isGithubHost(body) {
  return body.includes('api.github.com') || body.includes('githubRequest(');
}

const files = ROOTS.flatMap((root) => {
  try { return statSync(root).isDirectory() ? collect(root) : []; } catch { return []; }
});

const writeSites = [];
const failures = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (!isGithubHost(source)) continue;

  for (const block of functionBlocks(source)) {
    const method = githubApiMutation(block.body);
    if (!method) continue;

    writeSites.push({ file, name: block.name, line: block.line, method });

    if (!AUTHORIZERS.some((call) => block.body.includes(call))) {
      failures.push({
        file,
        name: block.name,
        line: block.line,
        method,
        reason: 'sends a mutating GitHub request without calling authorizeWrite() or another approved GitHub-backed authorizer',
      });
    }
  }
}

if (writeSites.length === 0) {
  console.error(`
GitHub write seam gate FAILED — it found zero GitHub write sites.

That is not a clean run. api/_lib/github-actions.ts is supposed to contain
them, so either the modules moved, githubRequest was renamed, or the way a
mutating call is spelled has changed. Update this gate before trusting it.
`);
  process.exit(1);
}

let testSource = '';
for (const testFile of TEST_FILES) {
  try {
    testSource += `\n/* ${testFile} */\n${readFileSync(testFile, 'utf8')}\n`;
  } catch {
    console.error(`\nGitHub write seam gate FAILED — ${testFile} is missing.\n\nThat file is part of the fixed authorization proof set. Without it, a GitHub mutation may have no behavioral refusal test.\n`);
    process.exit(1);
  }
}

for (const site of writeSites) {
  if (!testSource.includes(site.name)) {
    failures.push({
      ...site,
      reason: `is not exercised by the fixed GitHub write authorization test set (${TEST_FILES.join(', ')})`,
    });
  }
}

if (failures.length) {
  console.error(`\nGitHub write seam gate FAILED — ${failures.length} problem(s):\n`);
  for (const failure of failures) {
    console.error(`  ${failure.file}:${failure.line}  ${failure.name}() [${failure.method}]`);
    console.error(`    ${failure.reason}\n`);
  }
  console.error(`Quantora acts as the signed-in user on GitHub. A mutation that does not ask
GitHub whether THIS user may perform it on THIS repository is authorized by
nothing but the existence of a session.

Fix by calling an approved GitHub-backed authorizer before the first mutation,
and add both refusal and allowed-path coverage to one of the fixed authorization
test files above. A refused write must send zero mutating requests.
`);
  process.exit(1);
}

console.log(`GitHub write seam gate passed — ${writeSites.length} GitHub write site(s), each authorized and covered:`);
for (const site of writeSites) console.log(`  ${site.name}() [${site.method}] in ${site.file}`);
