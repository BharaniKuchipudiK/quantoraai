/*
 * Runtime import gate — every relative import that ships must resolve in
 * production Node ESM.
 *
 * THE INCIDENT THIS EXISTS FOR
 *
 * `api/domains.ts` and `api/deploy.ts` imported `'./autocomplete'` with no
 * file extension. Node ESM requires one, so in production every request to
 * those functions died before the handler ran:
 *
 *   ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/api/autocomplete'
 *   imported from /var/task/api/domains.js
 *
 * Nothing in the pipeline could see it. `tsc --noEmit` resolves extensionless
 * specifiers happily. `vite build` never compiles api/. Every unit test runs
 * through tsx, which also resolves them. The suite was green, the build was
 * clean, and two endpoints were dead in production — custom-domain connect,
 * publish, and (once the health probe moved onto that function) the very
 * endpoint that reports whether inference is healthy.
 *
 * This gate closes the gap the same way the wiring gate closes its own: by
 * checking the one property the tests structurally cannot.
 *
 * A THIRD RULE was added after api/deploy-gcp.ts shipped
 *   import archiver from 'archiver'
 * against archiver v8, which is ESM and exports only named classes. Node
 * refuses to link that module — "does not provide an export named 'default'"
 * — so the Cloud Run deploy endpoint answered FUNCTION_INVOCATION_FAILED for
 * every request. `tsc` cannot see it: the shipped types still describe a
 * callable default. So every default import of a package is verified against
 * real Node ESM, in a subprocess, below.
 *
 * (A local gate that merely IMPORTS each function was tried and deliberately
 * rejected: under tsx it resolves extensionless specifiers and interops the
 * archiver default, so it passed while both real bugs were present. A check
 * that cannot fail is worse than no check. Faithful runtime coverage lives in
 * scripts/deployed-readiness-gate.mjs, which runs against the real deployment.)
 *
 * TWO RULES, both about the file that EXISTS AT RUNTIME:
 *   1. A relative import must carry an explicit extension.
 *   2. That extension must not be .ts/.tsx — those are compiled away before
 *      deploy, so `./foo.ts` is as dead as `./foo`. TypeScript sources import
 *      their siblings as `.js`; that is correct and intended.
 *
 * Test files are exempt: they are executed by tsx and never deployed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['api', 'shared', 'desktop'];
const EXTRA_FILES = ['server.ts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const CODE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const isTest = (path) => /\.test\.[a-z]+$/.test(path);

// Static `from '...'` plus dynamic `import('...')`, relative specifiers only.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.[^'"]*)['"]/g;

function collect(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collect(path, out);
    } else if (CODE.has(extname(entry.name)) && !isTest(path)) {
      out.push(path);
    }
  }
}

const files = [];
for (const root of ROOTS) collect(root, files);
for (const file of EXTRA_FILES) {
  try { if (statSync(file).isFile()) files.push(file); } catch { /* absent is fine */ }
}

const failures = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    SPECIFIER.lastIndex = 0;
    let match;
    while ((match = SPECIFIER.exec(line))) {
      const specifier = match[1];
      const ext = extname(specifier);
      if (!ext) {
        failures.push({ file, line: index + 1, specifier, why: 'no file extension — Node ESM cannot resolve it' });
      } else if (ext === '.ts' || ext === '.tsx') {
        failures.push({ file, line: index + 1, specifier, why: `${ext} does not exist at runtime — import the compiled .js` });
      }
    }
  });
}

// ---- Rule 3: a default import must find a real default export -------------
// Verified in real Node ESM, because that is the only thing that agrees with
// production. Only a hard link failure counts, which keeps this unambiguous.
const { execFileSync } = await import('node:child_process');
const defaultImports = new Map(); // specifier -> { file, line }
const DEFAULT_IMPORT = /^\s*import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s+from\s*['"]([^.'"][^'"]*)['"]/;
for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    const match = DEFAULT_IMPORT.exec(line);
    if (!match) return;
    const specifier = match[2];
    if (specifier.startsWith('node:')) return;
    if (!defaultImports.has(specifier)) defaultImports.set(specifier, { file, line: index + 1 });
  });
}

for (const [specifier, site] of defaultImports) {
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', `import d from ${JSON.stringify(specifier)};`], {
      stdio: 'pipe',
      timeout: 20_000,
    });
  } catch (error) {
    const detail = String(error?.stderr || error?.message || '').replace(/\s+/g, ' ');
    if (/does not provide an export named 'default'/.test(detail)) {
      // Same shape as the rules above. A failure that prints "undefined"
      // names neither the package nor the file, and a gate you cannot act on
      // is a gate someone mutes.
      failures.push({
        file: site.file,
        line: site.line,
        specifier,
        why: 'the package provides no default export in Node ESM — import its named exports instead',
      });
    }
    // Anything else (a package that needs config to evaluate, a native build)
    // is not this gate's business; staying narrow is what keeps it trusted.
  }
}

if (failures.length) {
  console.error(`\nRuntime import gate FAILED — ${failures.length} import(s) that cannot resolve in production:\n`);
  for (const f of failures) {
    console.error(`  ${f.file}:${f.line}  '${f.specifier}'`);
    console.error(`      ${f.why}\n`);
  }
  console.error("These pass typecheck, build and tests, and fail only in production.");
  console.error("Fix: give a relative specifier its runtime extension (usually '.js'),");
  console.error("and import named exports from a package that has no default.\n");
  process.exit(1);
}

console.log(`Runtime import gate passed — ${files.length} shipped file(s), every relative import resolvable.`);
