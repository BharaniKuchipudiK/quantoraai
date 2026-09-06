import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOORS,
  JOURNEYS,
  claimedGates,
  commandsToScripts,
  enforcedOutcomeIds,
  floorProblems,
  journeyStatus,
  mutedButUnenforcedSteps,
  parseWorkflowSteps,
  renderInventoryMarkdown,
  runnerRoots,
  scriptImports,
  summarizeJourneys,
  validateInventoryShape,
  wiringOf,
} from './journey-gate-inventory.js';

const row = (id, gates = {}, extra = {}) => ({
  id,
  kind: 'user',
  area: 'test',
  name: id,
  entry: 'src/x.js',
  note: '',
  parked: false,
  ...extra,
  gates: { deterministic: [], browser: [], deployed: [], ...gates },
});

test('a journey is proven only by a browser or deployed gate; tests alone are helpers', () => {
  assert.equal(journeyStatus(row('a', { deterministic: ['src/lib/a.test.js'] })), 'helpers');
  assert.equal(journeyStatus(row('b', { browser: ['scripts/b-gate.mjs'] })), 'proven');
  assert.equal(journeyStatus(row('c', { deployed: ['golden:c'] })), 'proven');
  assert.equal(journeyStatus(row('d')), 'nothing');
});

test('the summary counts user journeys only and names the unproven ones', () => {
  const summary = summarizeJourneys([
    row('proven', { browser: ['scripts/x-gate.mjs'], deployed: ['golden:x'] }),
    row('helpers', { deterministic: ['src/lib/x.test.js'] }),
    row('nothing'),
    row('platform', { deterministic: ['scripts/y-gate.mjs'] }, { kind: 'platform' }),
  ]);
  assert.deepEqual(
    { total: summary.total, proven: summary.proven, helpers: summary.helpers, nothing: summary.nothing, deployed: summary.deployed, platform: summary.platform, pct: summary.provenPercent },
    { total: 3, proven: 1, helpers: 1, nothing: 1, deployed: 1, platform: 1, pct: 33 },
  );
  assert.deepEqual(summary.unguarded, ['nothing']);
  assert.deepEqual(summary.helpersOnly, ['helpers']);
});

test('a parked journey is counted apart: not in the total, not among the unproven, and it must say why', () => {
  const summary = summarizeJourneys([
    row('proven', { browser: ['scripts/x-gate.mjs'] }),
    row('nothing'),
    row('parked-one', {}, { parked: true, note: 'Parked: behind VITE_QUANTORA_EXPLORATORY_SURFACES=on.' }),
    row('parked-two', { deterministic: ['src/lib/x.test.js'] }, { parked: true, note: 'Parked too.' }),
  ]);
  assert.deepEqual(
    { total: summary.total, proven: summary.proven, nothing: summary.nothing, helpers: summary.helpers, parked: summary.parked, pct: summary.provenPercent },
    { total: 2, proven: 1, nothing: 1, helpers: 0, parked: 2, pct: 50 },
  );
  assert.deepEqual(summary.parkedIds, ['parked-one', 'parked-two']);
  assert.deepEqual(summary.unguarded, ['nothing']);
  const problems = validateInventoryShape([
    row('silent', {}, { parked: true }),
    row('wrong', {}, { parked: 'yes' }),
    row('platform', { deterministic: ['scripts/y-gate.mjs'] }, { kind: 'platform', parked: true, note: 'no' }),
  ]);
  assert.ok(problems.some((problem) => /"silent" is parked without a note/.test(problem)), problems.join('\n'));
  assert.ok(problems.some((problem) => /"wrong" has parked "yes"/.test(problem)), problems.join('\n'));
  assert.ok(problems.some((problem) => /"platform" is a platform invariant and cannot be parked/.test(problem)), problems.join('\n'));
  const doc = renderInventoryMarkdown([
    row('proven', { browser: ['scripts/x-gate.mjs'] }),
    row('parked-one', {}, { parked: true, note: 'Parked: behind a flag.' }),
  ], { proven: 1, deployed: 0 });
  assert.match(doc, /### Parked \(1\)/);
  assert.match(doc, /\| `parked-one` \| parked-one \| no \| — \| — \| — \| parked \|/);
  assert.match(doc, /1 more are parked/);
});

test('a drop below the floor and a stale floor both fail, so the floor is the count', () => {
  assert.deepEqual(floorProblems({ proven: 5, deployed: 2 }, { proven: 5, deployed: 2 }), []);
  const drop = floorProblems({ proven: 4, deployed: 2 }, { proven: 5, deployed: 2 });
  assert.equal(drop.length, 1);
  assert.match(drop[0], /fell to 4, below the floor of 5/);
  const stale = floorProblems({ proven: 6, deployed: 3 }, { proven: 5, deployed: 2 });
  assert.equal(stale.length, 2);
  assert.match(stale[0], /raise FLOORS\.proven .* to 6/);
  assert.match(stale[1], /raise FLOORS\.deployed .* to 3/);
});

const WORKFLOW = `
name: fixture
on: [push]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Check out
        uses: actions/checkout@v7
      - name: Umbrella
        run: npm run test:all
      - name: Muted and read
        id: read_gate
        continue-on-error: true
        env:
          X: 1
        run: node scripts/read-gate.mjs
      - name: Muted and forgotten
        id: forgotten_gate
        continue-on-error: true
        run: node scripts/forgotten-gate.mjs
      - name: Muted with no id
        continue-on-error: true
        run: node scripts/anonymous-gate.mjs
      - name: Block run
        run: |
          echo hello
          xvfb-run -a node scripts/desktop-gate.mjs
      - name: Enforce
        if: always()
        env:
          READ: \${{ steps.read_gate.outcome }}
        run: test "$READ" = success
  other:
    runs-on: ubuntu-latest
    steps:
      - name: Direct
        run: tsx scripts/typed-gate.mjs
`;

test('the workflow reader sees every step, its id, its mute, and its run — inline or block', () => {
  const steps = parseWorkflowSteps(WORKFLOW);
  assert.deepEqual(steps.map((step) => step.name), ['Check out', 'Umbrella', 'Muted and read', 'Muted and forgotten', 'Muted with no id', 'Block run', 'Enforce', 'Direct']);
  assert.deepEqual(steps.map((step) => step.job), ['verify', 'verify', 'verify', 'verify', 'verify', 'verify', 'verify', 'other']);
  const read = steps.find((step) => step.id === 'read_gate');
  assert.equal(read.continueOnError, true);
  assert.equal(read.run, 'node scripts/read-gate.mjs');
  const block = steps.find((step) => step.name === 'Block run');
  assert.match(block.run, /xvfb-run -a node scripts\/desktop-gate\.mjs/);
  assert.equal(block.continueOnError, false);
  assert.equal(steps[0].uses, 'actions/checkout@v7');
});

test('a muted step nobody reads is named; a muted step whose outcome is enforced is not', () => {
  const steps = parseWorkflowSteps(WORKFLOW);
  const muted = mutedButUnenforcedSteps(steps, enforcedOutcomeIds(WORKFLOW));
  assert.deepEqual(muted.map((step) => step.name), ['Muted and forgotten', 'Muted with no id']);
});

test('commands resolve to scripts through npm run chains, xvfb-run and tsx, and a cycle ends', () => {
  const scripts = {
    'test:all': 'npm run test:a && npm run test:b && npm run test:all',
    'test:a': 'node scripts/a-gate.mjs',
    'test:b': 'tsx scripts/b-gate.mjs && npx tsx --test api/_lib/b.test.ts',
  };
  assert.deepEqual(commandsToScripts('npm run test:all', scripts).sort(), ['api/_lib/b.test.ts', 'scripts/a-gate.mjs', 'scripts/b-gate.mjs']);
  assert.deepEqual(commandsToScripts('xvfb-run -a node scripts/desktop-gate.mjs', scripts), ['scripts/desktop-gate.mjs']);
  assert.deepEqual(commandsToScripts('npm ci', scripts), []);
  assert.deepEqual(commandsToScripts('node --stack_size=8192 ./node_modules/typescript/bin/tsc --noEmit', scripts), []);
});

test('a gate run only by import from a wired gate is wired; an unimported, unrun one is not', () => {
  const runBy = new Map([['scripts/outer-gate.mjs', 'ci.yml › browser › Outer']]);
  const importers = new Map([
    ['scripts/inner-gate.mjs', ['scripts/outer-gate.mjs']],
    ['scripts/loop-a.mjs', ['scripts/loop-b.mjs']],
    ['scripts/loop-b.mjs', ['scripts/loop-a.mjs']],
  ]);
  assert.equal(wiringOf('scripts/outer-gate.mjs', runBy, importers), 'ci.yml › browser › Outer');
  assert.equal(wiringOf('scripts/inner-gate.mjs', runBy, importers), 'ci.yml › browser › Outer (imported by scripts/outer-gate.mjs)');
  assert.equal(wiringOf('scripts/orphan-gate.mjs', runBy, importers), null);
  assert.equal(wiringOf('scripts/loop-a.mjs', runBy, importers), null);
  assert.deepEqual(scriptImports("import { x } from './a.mjs';\nawait import('./b.mjs');\nimport y from 'playwright';"), ['./a.mjs', './b.mjs']);
  assert.deepEqual(runnerRoots("const ROOTS = ['api', 'src'];"), ['api', 'src']);
  assert.deepEqual(runnerRoots('nothing here'), []);
});

test('the ledger is well-formed: unique ids, real kinds, paths or golden names', () => {
  assert.deepEqual(validateInventoryShape(JOURNEYS), []);
  const bad = validateInventoryShape([
    row('dup'),
    row('dup'),
    row('golden-misfiled', { browser: ['golden:calculator'] }),
    row('not-a-path', { deterministic: ['calculator'] }),
    row('wrong-kind', {}, { kind: 'other' }),
  ]);
  assert.equal(bad.length, 4, bad.join('\n'));
  assert.match(bad[0], /listed twice/);
  assert.match(bad[1], /golden transaction is a deployed gate/);
  assert.match(bad[2], /not a repo-relative path/);
  assert.match(bad[3], /kind "other"/);
});

test('the rendered ledger carries the number and names every unproven journey', () => {
  const journeys = [
    row('proven', { browser: ['scripts/x-gate.mjs'] }),
    row('lonely', {}, { name: 'Do the lonely thing', note: 'nobody has ever clicked it' }),
    row('helped', { deterministic: ['src/lib/h.test.js'] }, { name: 'Do the helped thing' }),
  ];
  const doc = renderInventoryMarkdown(journeys, { proven: 1, deployed: 0 });
  assert.match(doc, /\*\*1 of 3 user journeys are proven \(33%\)\*\*/);
  assert.match(doc, /### Nothing \(1\)\n\n- \*\*Do the lonely thing\*\* \(`lonely`, test\) — nobody has ever clicked it/);
  assert.match(doc, /### Helpers only \(1\)\n\n- \*\*Do the helped thing\*\*/);
  assert.match(doc, /\| `proven` \| proven \| no \| — \| `x-gate\.mjs` \| — \| proven \|/);
  assert.match(doc, /Do not edit by hand/);
});

test('the floor in the file is the count in the file', () => {
  const summary = summarizeJourneys(JOURNEYS);
  assert.equal(FLOORS.proven, summary.proven, `FLOORS.proven is ${FLOORS.proven}; the ledger proves ${summary.proven}`);
  assert.equal(FLOORS.deployed, summary.deployed, `FLOORS.deployed is ${FLOORS.deployed}; the ledger proves ${summary.deployed} on the deployment`);
});

test('the incident that motivated the ledger is a proven row: attachments, in a browser and on a deployment', () => {
  const attachments = JOURNEYS.find((candidate) => candidate.id === 'chat-attachments');
  assert.ok(attachments, 'the attachments journey is listed');
  assert.ok(attachments.gates.browser.includes('scripts/attachments-browser-gate.mjs'));
  assert.ok(attachments.gates.deployed.includes('golden:document-grounded'));
  const { golden } = claimedGates(JOURNEYS);
  assert.ok(golden.get('document-grounded').includes('chat-attachments'));
});
