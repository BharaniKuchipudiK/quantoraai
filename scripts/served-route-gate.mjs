#!/usr/bin/env node
/**
 * Fails when a serverless route is deployed and NOTHING calls it.
 *
 * WHY THIS EXISTS
 *
 * The QIR Resource Governor is complete — lanes, ledger, debit, capacity
 * resume, its own HTTP route at /api/qir-resources. Nothing in the product ever
 * called it. The Context Manager was in the same state. Both shipped, both
 * deployed, both unreachable, with every gate green.
 *
 * The gate suite could not see it. test:dead-controls checks the other
 * direction — every /api/ path the frontend calls is served — and cannot see a
 * path that is served and called by nobody. test:wiring ratchets orphaned
 * exports and components; an HTTP route is neither.
 *
 * So a complete, typed, tested subsystem could sit unreachable indefinitely,
 * and the only thing that found it was reading every route by hand.
 *
 * A ratchet against src/lib/served-route-baseline.json. Run with --update after
 * deliberately wiring or deleting a route, and commit the smaller baseline.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  compareRoutesToBaseline,
  referencedApiPaths,
  routePathsFrom,
  unreachableRoutes,
} from '../src/lib/route-reachability.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'src', 'lib', 'served-route-baseline.json');
/*
 * THE PRODUCT, and nothing else.
 *
 * The first version of this gate scanned docs/ and scripts/ too, and reported a
 * clean run over zero uncalled routes — because the Phase 0 re-audit MENTIONS
 * /api/qir-resources while describing it as unreachable. A document naming a
 * route is not a caller, and neither is a browser gate that stubs it: a route
 * only a test drives is precisely the "tested and reachable by nothing" class
 * this exists to catch.
 *
 * That first version passed for exactly the defect it was written for (§4). It
 * was caught by reading the output instead of trusting the exit code.
 */
const CALLER_DIRS = ['src', 'shared', 'desktop'];
const CODE = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.html']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (CODE.has(path.extname(entry.name)) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

const routePaths = routePathsFrom(fs.readdirSync(path.join(ROOT, 'api')));

/*
 * api/ is excluded from the caller scan on purpose. One route importing
 * another's module is not a caller — the question this gate asks is whether
 * anything REACHES the endpoint over HTTP. Counting api/ would let two dead
 * routes vouch for each other.
 */
/*
 * The baseline records route paths, lives under src/, and is .json — so the
 * first run scanned it as a caller and every recorded route "gained" one. A
 * ratchet that vouches for its own entries erases itself on the next --update.
 */
const sources = CALLER_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)))
  .filter((file) => file !== BASELINE)
  .map((file) => fs.readFileSync(file, 'utf8'));
const rewrites = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).rewrites || [];

const unreachable = unreachableRoutes({
  routePaths,
  referenced: referencedApiPaths(sources),
  rewrites,
});

if (process.argv.includes('--update')) {
  const existing = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  const next = {};
  for (const route of unreachable) next[route] = existing[route] || 'TODO: say why this route has no in-repo caller';
  fs.writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Served-route baseline updated: ${unreachable.length} uncalled route(s) recorded.`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
const { added, wired, total, ok } = compareRoutesToBaseline(unreachable, baseline);

if (wired.length) {
  console.log(`Reachability improved — ${wired.length} route(s) now have a caller:`);
  for (const route of wired) console.log(`  ${route}`);
  console.log('Run "node scripts/served-route-gate.mjs --update" and commit the smaller baseline.');
}

if (!ok) {
  console.error(`Served-route gate FAILED — ${added.length} route(s) are deployed and called by nothing:`);
  for (const route of added) {
    console.error(`  ${route}  (api${route.slice(4)}.ts is served; no reference in ${CALLER_DIRS.join('/')})`);
  }
  console.error('');
  console.error('Either wire it, delete it, or record it in src/lib/served-route-baseline.json');
  console.error('with the reason it has no in-repo caller (an OAuth callback, a webhook, a cron target).');
  process.exit(1);
}

const unexplained = Object.entries(baseline).filter(([, why]) => !why || /^TODO/.test(String(why)));
if (unexplained.length) {
  console.error(`Served-route gate FAILED — ${unexplained.length} baseline entr(ies) have no stated reason:`);
  for (const [route] of unexplained) console.error(`  ${route}`);
  console.error('A ratchet without reasons becomes a junk drawer. Say why each one has no caller.');
  process.exit(1);
}

console.log(`Served-route gate passed — ${routePaths.length} route(s), ${total} known uncalled, 0 new.`);
