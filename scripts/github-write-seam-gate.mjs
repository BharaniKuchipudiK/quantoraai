#!/usr/bin/env node
/**
 * Every GitHub mutation must pass through the authorization seam, and be
 * covered by the test that proves it refuses.
 *
 * WHY A STATIC GATE ON TOP OF A BEHAVIORAL TEST
 *
 * `api/_lib/github-write-authorization.test.ts` proves the three write
 * operations that exist today refuse a principal without push access. It
 * cannot say anything about the fourth one somebody adds next month.
 *
 * That fourth one is the dangerous case, and it fails silently: whoever writes
 * `requestReviewers()` or `closeIssue()` has push access to the repository they
 * test against, so the missing authorization call is invisible to them. It
 * becomes a confused deputy only for other people — exactly the shape of
 * security issue #452, re-entering through a different door.
 *
 * So this gate asks a structural question no test can:
 *
 *   1. Which functions in api/ send a mutating request to api.github.com?
 *   2. Does each of them call authorizeWrite() or assertRepositoryPermission()?
 *   3. Is each of them named in the write-authorization test file?
 *
 * WHAT IT DOES WHEN THE BUG IS PRESENT (CLAUDE.md §4, §8)
 *
 * Verified by deleting the authorization call from commentOnPullRequest and
 * running it: the gate names the file, the function, the mutating call it
 * found, and the two ways to fix it. Verified in the other direction too — it
 * passes on the correct tree, so it is not merely a red light.
 *
 * FAILING ON AN EMPTY SCAN IS DELIBERATE. If a refactor renames githubRequest
 * or moves these modules, a gate that reported "0 write sites, all authorized"
 * would be a green check over nothing — the exact failure this repository has
 * already paid for twice.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import process from 'node:process';

const ROOTS = ['api'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const CODE = new Set(['.ts', '.js', '.mjs']);
const TEST_FILE = 'api/_lib/github-write-authorization.test.ts';

/*
 * Three authorizers, because there are two genuinely different questions.
 *
 * `authorizeWrite` / `assertRepositoryPermission` ask what a user may do to a
 * repository that EXISTS. Creating a repository has none to ask about, so those
 * calls cannot apply — and this is exactly the moment a gate gets quietly
 * widened into uselessness, by whoever needs to ship the create button today.
 *
 * `assertRepositoryCreationAllowed` is admitted here because it is the same
 * kind of thing, not an exemption from it: it asks GitHub, before any write,
 * whether THIS principal may create a repository under THIS owner — resolving
 * the viewer, then the org membership and that org's own
 * members_can_create_repositories setting, and failing closed when GitHub does
 * not say yes. A helper that merely proves a session exists must never be added
 * to this list; the test is whether GitHub was asked about the acting user.
 */
const AUTHORIZERS = [
  'authorizeWrite(',
  'assertRepositoryPermission(',
  'assertRepositoryCreationAllowed(',
];
const MUTATING_METHODS = ['"POST"', '"PUT"', '"PATCH"', '"DELETE"', "'POST'", "'PUT'", "'PATCH'", "'DELETE'"];

/**
 * Precision matters here more than reach (CLAUDE.md §5). A gate that fires on
 * ambiguous evidence is a gate the next person mutes under pressure, and then
 * it protects nothing.
 *
 * So the question is asked of the INDIVIDUAL CALL, not of the enclosing
 * function: is *this* mutating request bound for api.github.com? The first
 * draft of this gate asked it of the whole function body and immediately
 * flagged the OAuth callback, which POSTs to github.com/login/oauth to mint a
 * token and separately GETs api.github.com/user. That POST acts on no
 * repository, so there are no permissions to check before it — reporting it
 * would have been the gate's first false positive and its last credible one.
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

/**
 * Split a source file into top-level function bodies with their names.
 *
 * Finding the body brace is the fiddly part, and getting it wrong is silent.
 * The first draft took the first `{` after the signature, which in TypeScript
 * is routinely part of the signature itself — an inline parameter type
 * (`request: { number: number }`) or a return type (`Promise<{ sha: string }>`).
 * Brace-matching from there closed on the type and produced a "body" of a few
 * characters, so every real write in github-actions.ts went unseen and the gate
 * reported zero write sites. It failed loudly (that is what the empty-scan
 * check is for) rather than passing over nothing — which is the only reason
 * this was caught rather than shipped.
 *
 * So: walk past the parameter list on paren depth, then take the first `{` that
 * is not nested inside angle brackets.
 */
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
      // A ';' outside any type is an overload signature, which has no body.
      // Inside one it is just a member separator: Promise<{ a: string; b: number }>.
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
        reason: 'sends a mutating GitHub request without calling authorizeWrite() or assertRepositoryPermission()',
      });
    }
  }
}

if (writeSites.length === 0) {
  console.error(`
GitHub write seam gate FAILED — it found zero GitHub write sites.

That is not a clean run. api/_lib/github-actions.ts is supposed to contain
them, so either the modules moved, githubRequest was renamed, or the way a
mutating call is spelled has changed. A gate that scans nothing reports a pass
over nothing, which is the false confidence CLAUDE.md §4 exists to forbid.

Update the detection in scripts/github-write-seam-gate.mjs to match how writes
are written now, and confirm it still fails when you delete an authorization
call.
`);
  process.exit(1);
}

let testSource = '';
try {
  testSource = readFileSync(TEST_FILE, 'utf8');
} catch {
  console.error(`\nGitHub write seam gate FAILED — ${TEST_FILE} is missing.\n\nThat file is the proof each write refuses an unauthorized principal. Without\nit, this gate can only check that an authorization call is present, not that\nit works.\n`);
  process.exit(1);
}

for (const site of writeSites) {
  if (!testSource.includes(site.name)) {
    failures.push({
      ...site,
      reason: `is not exercised by ${TEST_FILE}, so nothing proves it refuses a principal without push access`,
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
nothing but the existence of a session — which is security issue #452.

Fix either by:
  1. calling authorizeWrite(context, "write") at the top of the function, before
     any argument parsing and before any request leaves — or, for a write that
     acts on an account rather than an existing repository,
     assertRepositoryCreationAllowed({ principal, owner }); or
  2. adding the operation to ${TEST_FILE}
     with both directions covered: refused without push access (and zero
     mutating calls sent), allowed with it.
`);
  process.exit(1);
}

console.log(`GitHub write seam gate passed — ${writeSites.length} GitHub write site(s), each authorized and covered:`);
for (const site of writeSites) console.log(`  ${site.name}() [${site.method}] in ${site.file}`);
