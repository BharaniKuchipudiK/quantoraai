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

const ROOTS = ['api', 'shared'];
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

if (failures.length) {
  console.error(`\nRuntime import gate FAILED — ${failures.length} import(s) that cannot resolve in production:\n`);
  for (const f of failures) {
    console.error(`  ${f.file}:${f.line}  '${f.specifier}'`);
    console.error(`      ${f.why}\n`);
  }
  console.error("These pass typecheck, build and tests, and fail only in production.");
  console.error("Fix: give each specifier its runtime extension (usually '.js').\n");
  process.exit(1);
}

console.log(`Runtime import gate passed — ${files.length} shipped file(s), every relative import resolvable.`);
