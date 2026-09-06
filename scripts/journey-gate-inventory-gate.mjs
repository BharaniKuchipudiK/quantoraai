#!/usr/bin/env node
/**
 * The journey-versus-gate ledger is true, and the number it prints is real.
 *
 * src/lib/journey-gate-inventory.js names every user journey and the gates
 * that exercise it. A ledger nobody checks drifts into fiction within a week
 * — a gate renamed, a test deleted, a step muted — so this proves, on every
 * run:
 *
 *   1. every gate a journey names exists on disk;
 *   2. every browser and deployed gate it names is RUN by a workflow, by name
 *      or by import, and a muted step (continue-on-error) has its outcome
 *      read by an enforcing step — the 2026-08-31 class, where a muted step
 *      reported success while three production functions were dead;
 *   3. every deterministic test it names is discovered by a runner (a file
 *      the scan cannot see is a test that runs nowhere), and every
 *      deterministic gate script is run by CI;
 *   4. every golden transaction it names is in the deployed roster, and
 *      every roster entry is claimed by a journey;
 *   5. every gate file on disk is claimed by a journey — a gate guarding no
 *      named journey guards an unlisted one, or nothing;
 *   6. the proven count equals the floor, in both directions;
 *   7. docs/engineering/JOURNEY_GATE_INVENTORY.md is what this run would
 *      generate (`--write` regenerates it).
 *
 * The verdict is the LAST line, per CLAUDE.md §8: a number nobody can find
 * in the log is a feeling with extra steps.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  FLOORS,
  GATE_LEVELS,
  JOURNEYS,
  KNOWN_UNCLAIMED_GATES,
  claimedGates,
  commandsToScripts,
  enforcedOutcomeIds,
  floorProblems,
  isGoldenGate,
  mutedButUnenforcedSteps,
  parseWorkflowSteps,
  renderInventoryMarkdown,
  runnerRoots,
  scriptImports,
  summarizeJourneys,
  validateInventoryShape,
  wiringOf,
} from '../src/lib/journey-gate-inventory.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = 'docs/engineering/JOURNEY_GATE_INVENTORY.md';
const WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/deployed-golden-transactions.yml', '.github/workflows/provider-health.yml'];
const GOLDEN = 'scripts/deployed-golden-transactions.mjs';
const NODE_RUNNER = 'scripts/run-node-tests.mjs';
const TS_RUNNER = 'scripts/run-ts-tests.mjs';
const write = process.argv.includes('--write');

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));
const problems = [];
const fail = (message) => problems.push(message);

/* 0. The ledger itself is well-formed. */
for (const problem of validateInventoryShape(JOURNEYS)) fail(problem);
if (!JOURNEYS.length) fail('the ledger lists no journeys — this gate is reading the wrong file');

/* Workflows: which scripts run, under which step, and whether muted steps are read. */
const packageScripts = JSON.parse(read('package.json')).scripts || {};
const runBy = new Map();
let stepsSeen = 0;
for (const workflow of WORKFLOWS) {
  const text = read(workflow);
  const steps = parseWorkflowSteps(text);
  stepsSeen += steps.length;
  const enforced = enforcedOutcomeIds(text);
  for (const step of mutedButUnenforcedSteps(steps, enforced)) {
    fail(`${workflow}: step "${step.name || step.run.split('\n')[0]}" (job ${step.job}) is continue-on-error and no later step reads steps.${step.id || '<no id>'}.outcome — it reports success whatever happens. Give it an id and read it in the enforcing step, or drop the mute.`);
  }
  for (const step of steps) {
    if (!step.run) continue;
    for (const script of commandsToScripts(step.run, packageScripts)) {
      if (!runBy.has(script)) runBy.set(script, `${path.basename(workflow)} › ${step.job} › ${step.name || step.run.split('\n')[0]}`);
    }
  }
}
if (!stepsSeen) fail('read zero steps out of the workflows — refusing to report a pass over nothing (§4)');

/* Scripts importing scripts, so a gate run only by import still counts as wired. */
const importers = new Map();
const scriptFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'fixtures', 'lib', 'judgment'].includes(entry.name)) walk(relative);
    } else if (entry.name.endsWith('.mjs')) {
      scriptFiles.push(relative);
    }
  }
}('scripts'));
for (const script of scriptFiles) {
  for (const spec of scriptImports(read(script))) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(script), spec));
    if (!importers.has(target)) importers.set(target, []);
    importers.get(target).push(script);
  }
}

/* Runners: a test file is registered by being where the scan looks. */
const nodeRoots = runnerRoots(read(NODE_RUNNER));
const tsRoots = runnerRoots(read(TS_RUNNER));
if (!nodeRoots.length || !tsRoots.length) fail(`could not read ROOTS out of ${NODE_RUNNER} / ${TS_RUNNER} — the runner shape changed; update runnerRoots()`);
const discoveredBy = (file) => {
  const root = file.split('/')[0];
  if ((file.endsWith('.test.js') || file.endsWith('.test.mjs')) && nodeRoots.includes(root)) return NODE_RUNNER;
  if (file.endsWith('.test.ts') && tsRoots.includes(root)) return TS_RUNNER;
  return null;
};
const isTestFile = (file) => /\.test\.(?:js|mjs|ts)$/.test(file);

/* The deployed roster. */
const goldenSource = read(GOLDEN);
const rosterText = (goldenSource.match(/const EXPECTED_TRANSACTIONS = \[([^\]]*)\]/) || [])[1];
const roster = rosterText ? [...rosterText.matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
if (!roster.length) fail(`could not read EXPECTED_TRANSACTIONS out of ${GOLDEN} — the roster shape changed; update this gate`);

/* 1–4. Every named gate exists, runs, and is read. */
const { files: claimedFiles, golden: claimedGolden } = claimedGates(JOURNEYS);
for (const row of JOURNEYS) {
  for (const level of GATE_LEVELS) {
    for (const name of row.gates[level]) {
      if (isGoldenGate(name)) {
        const transaction = name.slice('golden:'.length);
        if (!roster.includes(transaction)) fail(`journey "${row.id}" names ${name}, and EXPECTED_TRANSACTIONS in ${GOLDEN} has no "${transaction}" (roster: ${roster.join(', ')})`);
        continue;
      }
      if (!exists(name)) {
        fail(`journey "${row.id}" names ${name} under ${level}, and no such file exists. Renamed or deleted? Point the journey at what guards it now, or admit the journey lost its gate.`);
        continue;
      }
      if (isTestFile(name)) {
        if (!discoveredBy(name)) fail(`journey "${row.id}" names ${name}, which no test runner discovers (roots: node ${nodeRoots.join(',')}; ts ${tsRoots.join(',')}). A test the scan cannot see runs nowhere.`);
        continue;
      }
      const wiring = wiringOf(name, runBy, importers);
      if (!wiring) fail(`journey "${row.id}" names ${name} under ${level}, and no workflow step runs it — by name, through an npm script, or by import from a wired script. It guards nothing until a step runs it.`);
    }
  }
}

/* 4b. Every roster entry is somebody's proof. */
for (const transaction of roster) {
  if (!claimedGolden.has(transaction)) fail(`golden transaction "${transaction}" runs on every deployment and no journey claims it — say which journey it proves.`);
}

/* 5. Every gate on disk guards a named journey. */
const mustBeClaimed = scriptFiles.filter((file) => file.endsWith('-gate.mjs'));
if (exists('scripts/stress/pipeline-stress.mjs')) mustBeClaimed.push('scripts/stress/pipeline-stress.mjs');
const knownUnclaimed = new Map(KNOWN_UNCLAIMED_GATES.map((entry) => [entry.file, entry.reason]));
for (const file of mustBeClaimed) {
  if (claimedFiles.has(file) || knownUnclaimed.has(file)) continue;
  fail(`${file} is a gate on disk that no journey claims. Name it on the journey it guards in src/lib/journey-gate-inventory.js — if it guards a journey the ledger does not list, add the journey.`);
}
for (const [file, reason] of knownUnclaimed) {
  if (claimedFiles.has(file)) fail(`${file} is in KNOWN_UNCLAIMED_GATES ("${reason}") and is now claimed — remove the entry.`);
  if (!exists(file)) fail(`${file} is in KNOWN_UNCLAIMED_GATES and no longer exists — remove the entry.`);
}

/* 6. The number is the floor. */
const summary = summarizeJourneys(JOURNEYS);
for (const problem of floorProblems(summary, FLOORS)) fail(problem);

/* 7. What a human reads is what this run counted. */
const rendered = renderInventoryMarkdown(JOURNEYS, FLOORS);
if (write) {
  fs.writeFileSync(path.join(ROOT, DOC), rendered);
  console.log(`wrote ${DOC}`);
} else if (!exists(DOC)) {
  fail(`${DOC} is missing — run \`node scripts/journey-gate-inventory-gate.mjs --write\` and commit it.`);
} else if (read(DOC) !== rendered) {
  fail(`${DOC} is stale — run \`node scripts/journey-gate-inventory-gate.mjs --write\` and commit the result, so what a reader sees is what was counted.`);
}

/* The verdict, last. */
const digest = `proven ${summary.proven}/${summary.total} (${summary.provenPercent}%) | helpers only ${summary.helpers} | nothing ${summary.nothing} | on the deployment ${summary.deployed}`;
if (problems.length) {
  console.error(`\nJourney-gate inventory FAILED — ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  console.error(`JOURNEY COVERAGE | FAILED (${problems.length} problem(s)) | ${digest}`);
  process.exit(1);
}
console.log(`Journey-gate inventory passed — ${JOURNEYS.length} rows (${summary.total} user journeys, ${summary.platform} platform invariants), ${claimedFiles.size} gate files and ${roster.length} golden transactions all exist, run, and are claimed.`);
if (summary.unguarded.length) console.log(`  nothing:      ${summary.unguarded.join(', ')}`);
if (summary.helpersOnly.length) console.log(`  helpers only: ${summary.helpersOnly.join(', ')}`);
console.log(`JOURNEY COVERAGE | ${digest}`);
