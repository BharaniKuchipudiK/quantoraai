/*
 * CAPABILITIES NOBODY ASKS.
 *
 * Every defect found on 2026-09-08 was the same shape, and none of them was a
 * missing feature:
 *
 *   SseWriter.isFinished            could always tell a dead client. Nothing asked.
 *   deskCommitRegressesPreview      could always judge a page. Only the build path asked.
 *   hit_rate_limit's resets_at      always returned. The verdict threw it away.
 *   readBoundaryEvents              only ever read under one reference id.
 *
 * test:wiring already catches the blunt case — an export literally nobody
 * calls. It cannot catch the expensive one: a capability wired into ONE path
 * while its sibling makes the same decision by hand, or not at all.
 *
 * A single-caller export is not a bug. It is the population those bugs live
 * in, and it was never once looked at. This prints that population, ranked, so
 * the question "who else should be asking this?" gets asked deliberately
 * instead of after a screenshot.
 *
 * Deliberately a REPORT and not a blocking gate. A rule that fails on
 * single-caller exports would fire on hundreds of legitimate ones, and a gate
 * that cries wolf gets muted by the next person under pressure — which is the
 * failure this repository has already paid for.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['api', 'src', 'shared'];
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage']);
const CODE = /\.(ts|tsx|js|jsx|mjs)$/;
const isTest = (path) => /\.test\.|__tests__|\/tests?\//.test(path);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (CODE.test(entry.name)) out.push(join(dir, entry.name));
  }
  return out;
}

const files = ROOTS.flatMap((root) => { try { statSync(root); return walk(root); } catch { return []; } });
const sources = new Map(files.map((path) => [path, readFileSync(path, 'utf8')]));

/* Exported functions, by the name a caller would use. */
const exported = new Map();
for (const [path, text] of sources) {
  if (isTest(path)) continue;
  for (const match of text.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    exported.set(match[1], path);
  }
}

/* Who calls each one, excluding its own file and every test. A test proves a
 * capability works; it never proves anyone uses it. */
const rows = [];
for (const [name, home] of exported) {
  const callers = new Set();
  const call = new RegExp(`\\b${name}\\s*\\(`);
  for (const [path, text] of sources) {
    if (path === home || isTest(path)) continue;
    if (call.test(text)) callers.add(path);
  }
  rows.push({ name, home, callers: [...callers] });
}

const orphans = rows.filter((row) => row.callers.length === 0);
const lonely = rows.filter((row) => row.callers.length === 1);

console.log(`Lonely capability audit — ${exported.size} exported function(s) across ${ROOTS.join(', ')}\n`);
console.log(`  called by nothing outside its own file : ${orphans.length}`);
console.log(`  called from exactly one place          : ${lonely.length}`);
console.log(`  (test files never count as a caller)\n`);

/* Guards and decisions first: these are the ones whose whole purpose is to be
 * consulted, so a single caller is the strongest signal in the list. */
const DECIDER = /^(is|has|can|should|may|must|decide|describe|resolve|check|verify|guard|assert|detect|classify)/;
const suspicious = lonely.filter((row) => DECIDER.test(row.name));

if (suspicious.length) {
  console.log('Decisions and guards wired into exactly one place — ask who else should be consulting them:\n');
  for (const row of suspicious.sort((a, b) => a.home.localeCompare(b.home))) {
    console.log(`  ${row.name}`);
    console.log(`      defined  ${row.home}`);
    console.log(`      called   ${row.callers[0]}`);
  }
  console.log('');
}

console.log('This is a report, not a gate. A single caller is normal; the question is whether');
console.log('a SECOND path is making the same decision by hand, or not making it at all.');
