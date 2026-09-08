#!/usr/bin/env node
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
 * test:wiring already catches the blunt case — an export a TEST believes in and
 * no production code calls. It deliberately says nothing about an export no
 * test claims either ("nobody is misled"). Neither catches the expensive one:
 * a capability wired into ONE path while its sibling makes the same decision by
 * hand, or not at all.
 *
 * A single-caller export is not a bug. It is the population those bugs live in,
 * and it was never once looked at. This prints that population so the question
 * "who else should be asking this?" gets asked deliberately instead of after a
 * screenshot.
 *
 * ── ON MEASURING THE SAME THING TWICE ──────────────────────────────────────
 *
 * The first cut of this file re-implemented "who calls what" by hand over
 * ROOTS = ['api', 'src', 'shared'] with a raw regex. Both halves were wrong:
 *
 *   - It could not see scripts/ or desktop/, so every capability whose only
 *     caller is one of the 42 browser gates read as called by NOTHING. It
 *     reported 441 orphans next to the wiring gate's 13 and I nearly acted on
 *     the difference.
 *   - It matched raw text, so a name inside a comment or a string counted as a
 *     caller, and a function used ten times inside its own module counted as
 *     used by no one.
 *
 * Two modules in one repository disagreeing about what "called" means is the
 * §3 defect — a wrong measurement makes a confident wrong claim. So this now
 * reads the SAME directories the wiring gate reads and strips comments and
 * strings with the wiring gate's own stripNonCode. One definition, one answer.
 *
 * Deliberately a REPORT and not a blocking gate: a rule that failed on
 * single-caller exports would fire on hundreds of legitimate ones, and a gate
 * that cries wolf gets muted by the next person under pressure.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { exportedNames, isTestPath, stripNonCode } from '../src/lib/wiring-audit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Callers can live anywhere production code lives. Identical to wiring-gate.mjs
 * — if these two lists ever drift, the two audits start disagreeing again. */
const SOURCE_DIRS = ['src', 'shared', 'api', 'scripts', 'desktop'];
const ROOT_FILES = ['vite.config.ts', 'vite.config.js', 'vitest.config.ts', 'playwright.config.ts', 'eslint.config.js'];
const CODE = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);

/* Capabilities we ask the question ABOUT. desktop/ and scripts/ are read as
 * callers but never audited as subjects: a browser gate's own helpers having
 * one caller is not a finding. */
const SUBJECT_DIRS = ['src/lib/', 'src/hooks/', 'shared/', 'api/_lib/'];

/* Words that make an export a DECISION rather than a fact — the population
 * where "who else should be asking this?" has ever had a real answer. */
const DECISION = /^(is|has|should|can|may|must|will|needs?|allows?|assert|require|verify|validate|check|guard|ensure|detect|decide|classify|resolve|select|choose|pick|rank|score|judge|reject|accept|deny|permit|blocks?|prevents?|describe|explain|diagnose|why)/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', 'coverage'].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (CODE.has(extname(path))) out.push(path);
  }
  return out;
}

const files = {};
for (const dir of SOURCE_DIRS) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const path of walk(abs)) files[path.slice(ROOT.length + 1)] = readFileSync(path, 'utf8');
}
for (const name of ROOT_FILES) {
  const path = join(ROOT, name);
  if (existsSync(path)) files[name] = readFileSync(path, 'utf8');
}

/* Comments and strings are not calls. A name in a banner comment counted as a
 * caller before this line existed. */
const stripped = new Map(Object.keys(files).map((path) => [path, stripNonCode(files[path])]));
const productionPaths = Object.keys(files).filter((path) => !isTestPath(path));

const isSubject = (path) => SUBJECT_DIRS.some((dir) => path.includes(dir));

/*
 * ONE ROW PER (module, name) — not per name.
 *
 * This was `if (!exported.has(name)) exported.set(name, path)`: a Map keyed by
 * name alone, keeping whichever module happened to be walked first. Nineteen
 * exported names in this repository are declared in more than one module —
 * verdictFor is declared in THREE — and for every one of them the map kept one
 * definition, dropped the others' rows entirely, and then counted those other
 * modules' OWN declarations as callers of the survivor. openrouter-probe.ts was
 * reported as a caller of gemini-probe.ts's local helper, and had no row of its
 * own.
 *
 * That is the same confident false wiring claim this file has now produced
 * three ways in one day: blind to scripts/, blind to dependency injection, and
 * blind to its own key collisions. A report that invents a caller is worse than
 * no report, because it is acted on.
 */
const definitionsByName = new Map();
for (const path of productionPaths) {
  if (!isSubject(path)) continue;
  for (const name of exportedNames(stripped.get(path))) {
    if (!definitionsByName.has(name)) definitionsByName.set(name, new Set());
    definitionsByName.get(name).add(path);
  }
}

const rows = [];
for (const [name, homes] of definitionsByName) {
  /* A name declared in several modules cannot be attributed by name alone; the
   * rows are still printed, marked, so nobody reads them as settled. */
  const ambiguous = homes.size > 1;
  for (const home of homes) {
  /*
   * A MENTION IS A WIRE. Not `name(`.
   *
   * The cut before this one asked whether some other file contained
   * `name(` — a literal invocation — and reported 134 uncalled exports
   * against the wiring gate's 13. Every one of the extra hundred-odd was
   * live code, because this codebase injects its dependencies:
   *
   *   persist: BoundaryEventSink | null = recordBoundaryEvent   // a default
   *   count = countPaidCallsSince                               // a default
   *   readMeasuredOutcomes(readModelQualityEvents)              // an argument
   *   const defaultWriters = { writeInstruments, writePrices }  // a literal
   *
   * None of those is ever written `name(` at the call site, and all four
   * are load-bearing in production. Acting on that list would have deleted
   * the trace-persistence sink, the paid-call quota's counter and the whole
   * market-data writer set. §9 exists because this repository has already
   * nearly lost two modules to exactly this reasoning.
   *
   * So: any mention in production code counts as wiring, which is what
   * wiring-audit.js has always done. `name(` is kept only to distinguish a
   * direct invocation from a handoff, never to decide whether it is dead.
   */
  const mention = new RegExp(`\\b${name}\\b`);
  const invocation = new RegExp(`\\b${name}\\s*\\(`);
  const callers = [];
  let invoked = false;
  for (const path of productionPaths) {
    if (path === home) continue;
    /* Another module that DECLARES this same name is not calling this one —
     * its mention is its own declaration and self-use. */
    if (homes.has(path)) continue;
    const text = stripped.get(path);
    if (!mention.test(text)) continue;
    callers.push(path);
    if (invocation.test(text)) invoked = true;
  }
  /* Used inside its own module IS wiring — the wiring gate counts it that way
   * and so must this, or a module's own helpers read as abandoned. */
  const selfUses = (stripped.get(home).match(new RegExp(`\\b${name}\\b`, 'g')) || []).length - 1;
  rows.push({ name, home, callers, selfUses, invoked, ambiguous });
  }
}

const orphans = rows.filter((row) => row.callers.length === 0 && row.selfUses <= 0);
const internal = rows.filter((row) => row.callers.length === 0 && row.selfUses > 0);
const lonely = rows.filter((row) => row.callers.length === 1);

const ambiguousNames = [...definitionsByName.values()].filter((homes) => homes.size > 1).length;
console.log(`Lonely capability audit — ${rows.length} exported symbol(s) in ${SUBJECT_DIRS.join(', ')}`);
console.log(`callers read from ${SOURCE_DIRS.join(', ')} (tests never count as a caller)\n`);
console.log(`  no caller anywhere, unused in its own file : ${orphans.length}`);
console.log(`  no caller, but used inside its own file    : ${internal.length}  (exported without need)`);
console.log(`  called from exactly one place              : ${lonely.length}`);
console.log(`  name declared in more than one module      : ${ambiguousNames}  (marked *, callers unattributable by name)\n`);

const decisions = lonely.filter((row) => DECISION.test(row.name)).sort((a, b) => a.home.localeCompare(b.home));
if (decisions.length) {
  console.log(`Decisions and guards wired into exactly one place — ${decisions.length} of them.`);
  console.log('Ask of each: is a SECOND path making this same call by hand, or not at all?\n');
  for (const row of decisions) {
    console.log(`  ${row.name}${row.ambiguous ? '  *' : ''}`);
    console.log(`      defined  ${row.home}`);
    console.log(`      called   ${row.callers[0]}`);
  }
  console.log('');
}

if (process.argv.includes('--orphans')) {
  console.log('Exported, called by nothing, unused at home — delete or wire:\n');
  for (const row of orphans.sort((a, b) => a.home.localeCompare(b.home))) {
    console.log(`  ${row.home}  ${row.name}`);
  }
  console.log('');
  console.log('Exported but only used at home — drop the `export`:\n');
  for (const row of internal.sort((a, b) => a.home.localeCompare(b.home))) {
    console.log(`  ${row.home}  ${row.name}  (${row.selfUses} use${row.selfUses === 1 ? '' : 's'} at home)`);
  }
  console.log('');
}

console.log('This is a report, not a gate. A single caller is normal; the question is whether');
console.log('a SECOND path is making the same decision by hand, or not making it at all.');
console.log('Run with --orphans to list the uncalled and the needlessly exported.');
