import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceBuildJob,
  briefNeedsJob,
  buildJobIsComplete,
  buildJobOutcome,
  completedCount,
  createBuildJob,
  deskFingerprint,
  describeBuildJob,
  nextStep,
  nextStepBrief,
  readPlanMarker,
  stepIsProved,
  stripPlanMarker,
} from './build-job.js';

const SCHEDULER = {
  goal: 'A shift scheduler for a coffee roastery',
  steps: [
    { title: 'Roster data and seed', produces: ['src/data/roster.js'] },
    { title: 'Week grid with drag-to-assign', produces: ['src/components/WeekGrid.jsx', 'src/styles/grid.css'] },
    { title: 'Hours and overtime summary', produces: ['src/components/Summary.jsx'] },
  ],
};
const file = (content = 'real content') => ({ content });

/*
 * THE RULE THAT MAKES THIS DIFFERENT FROM A PROGRESS BAR.
 *
 * A progress indicator that advances because a reply asserted progress is the
 * most expensive lie available here: the user watches every step go green and
 * ends up with four files.
 */
test('a step is done when its files exist, never because a turn said so', () => {
  const job = createBuildJob(SCHEDULER);
  const claimed = advanceBuildJob(job, {});
  assert.equal(completedCount(claimed), 0, 'an empty desk completes nothing, whatever was claimed');

  const partial = advanceBuildJob(job, { 'src/data/roster.js': file() });
  assert.equal(completedCount(partial), 1);
  assert.equal(partial.steps[0].done, true);
  assert.equal(partial.steps[1].done, false);
});

test('a step needing two files is not done on one', () => {
  const job = advanceBuildJob(createBuildJob(SCHEDULER), {
    'src/data/roster.js': file(),
    'src/components/WeekGrid.jsx': file(),
  });
  assert.equal(job.steps[1].done, false, 'grid.css is still missing');
  assert.deepEqual(job.steps[1].missing, ['src/styles/grid.css']);
});

test('an empty file does not count as a delivered file', () => {
  const job = advanceBuildJob(createBuildJob(SCHEDULER), { 'src/data/roster.js': { content: '   \n' } });
  assert.equal(job.steps[0].done, false, 'a blank file is not the work');
});

test('a step goes BACK to not-done if its file is later emptied', () => {
  // The job describes the desk that exists, not the history of what was claimed.
  const done = advanceBuildJob(createBuildJob(SCHEDULER), { 'src/data/roster.js': file() });
  assert.equal(done.steps[0].done, true);
  const undone = advanceBuildJob(done, { 'src/data/roster.js': { content: '' } });
  assert.equal(undone.steps[0].done, false);
});

test('a step naming no file is dropped, not tracked', () => {
  const job = createBuildJob({
    goal: 'x',
    steps: [
      { title: 'Build the grid', produces: ['src/Grid.jsx'] },
      { title: 'Polish the design' },
      { title: 'Make it feel premium', produces: [] },
    ],
  });
  assert.equal(job.steps.length, 1, 'a step that can never be shown done would only inflate the denominator');
});

test('a plan with no usable step is no plan at all', () => {
  assert.equal(createBuildJob({ goal: 'x', steps: [{ title: 'Polish' }] }), null);
  assert.equal(createBuildJob({ goal: 'x', steps: [] }), null);
  assert.equal(createBuildJob({}), null);
});

test('what it reports is checkable against the FILES pane', () => {
  const job = advanceBuildJob(createBuildJob(SCHEDULER), { 'src/data/roster.js': file() });
  const note = describeBuildJob(job);
  assert.match(note, /\*\*1 of 3 steps done\*\*/);
  assert.match(note, /judged by the files on the desk, not by what any turn claimed/);
  assert.match(note, /- \[x\] Roster data and seed/);
  assert.match(note, /waiting on src\/components\/WeekGrid\.jsx, src\/styles\/grid\.css/);
});

test('no resume is promised, because none is performed', () => {
  // capability-doors carries the scar of copy that promised a resume nothing
  // performed. The job offers the next step; the person presses it.
  const note = describeBuildJob(advanceBuildJob(createBuildJob(SCHEDULER), {}));
  assert.match(note, /Say \*\*continue\*\*/);
  assert.doesNotMatch(note, /pick this up|automatically|you won't have to/i);
});

test('the next step names falsifiable files', () => {
  const job = advanceBuildJob(createBuildJob(SCHEDULER), { 'src/data/roster.js': file() });
  assert.equal(nextStep(job).title, 'Week grid with drag-to-assign');
  const brief = nextStepBrief(job);
  assert.match(brief, /A shift scheduler for a coffee roastery/, 'a later turn no longer has the opening brief');
  assert.match(brief, /src\/components\/WeekGrid\.jsx, src\/styles\/grid\.css/);
  assert.match(brief, /Do not restate the whole project/);
});

test('a finished job says so and stops offering steps', () => {
  const job = advanceBuildJob(createBuildJob(SCHEDULER), {
    'src/data/roster.js': file(),
    'src/components/WeekGrid.jsx': file(),
    'src/styles/grid.css': file(),
    'src/components/Summary.jsx': file(),
  });
  assert.equal(buildJobIsComplete(job), true);
  assert.equal(nextStep(job), null);
  assert.doesNotMatch(describeBuildJob(job), /Say \*\*continue\*\*/);
});

test('the plan marker is read defensively and never shown', () => {
  const reply = 'I will build this in three steps.\n\n<!-- quantora-plan: {"goal":"A scheduler","steps":[{"title":"Data","produces":["src/data.js"]}]} -->';
  const job = readPlanMarker(reply);
  assert.equal(job.goal, 'A scheduler');
  assert.equal(job.steps.length, 1);
  assert.equal(stripPlanMarker(reply), 'I will build this in three steps.');

  assert.equal(readPlanMarker('no marker here'), null);
  assert.equal(readPlanMarker('<!-- quantora-plan: {not json} -->'), null, 'malformed is no plan, not a broken one');
  assert.equal(readPlanMarker('<!-- quantora-plan: {"goal":"x","steps":"nope"} -->'), null);
});

test('only genuinely large asks become jobs', () => {
  // A spurious plan costs six round trips for a page; a missed one costs one
  // long turn. So this leans conservative on purpose.
  assert.equal(briefNeedsJob('build me a calculator'), false);
  assert.equal(briefNeedsJob('make the header sticky and the footer dark'), false);
  assert.equal(
    briefNeedsJob('Build a staff scheduling dashboard with a week grid, drag-to-assign shifts, and then an overtime summary page'),
    true,
  );
  assert.equal(
    briefNeedsJob('Build an inventory tracker\n- stock levels\n- reorder alerts\n- supplier list\n- a CSV export'),
    true,
  );
});

test('a plan is capped so it cannot become a to-do list', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ title: `Step ${i}`, produces: [`src/f${i}.js`] }));
  assert.equal(createBuildJob({ goal: 'x', steps: many }).steps.length, 12);
});

test('stepIsProved refuses a step with nothing to prove', () => {
  assert.equal(stepIsProved({ produces: [] }, {}), false);
  assert.equal(stepIsProved(null, {}), false);
});

/*
 * AUTO-ADVANCE: THE STOP CONDITIONS ARE THE FEATURE.
 *
 * Turning one 175-second shot into several short ones is the point. A loop that
 * cannot stop is worse than no loop — it spends real money producing nothing,
 * on a platform running against a $100 float.
 */
const twoStep = () => createBuildJob({
  goal: 'A scheduler',
  steps: [
    { title: 'Data', produces: ['src/data.js'] },
    { title: 'Grid', produces: ['src/Grid.jsx'] },
  ],
});

/* ------------------------------------------------------------------ *
 * QIR PHASE 5 — the files existing is not the app working.
 *
 * buildJobIsComplete answers whether every promised file is on the desk, and
 * the module note above is right that this is a deliberately falsifiable floor.
 * The defect was elsewhere: the desk painted that count GREEN, the user read it
 * as "my app works", and verifyBuild's `passed` — which had already run — was
 * consulted by nothing here. A calculator with four files present and its
 * buttons wired to nothing scored 4 of 4 in green.
 * ------------------------------------------------------------------ */

const provedJob = (vfs) => advanceBuildJob(
  createBuildJob({ goal: 'A calculator', steps: [{ title: 'App', produces: ['src/App.jsx'] }] }),
  vfs,
);
const deskVfs = { 'src/App.jsx': 'export default function App() { return <button /> }' };

test('the file floor is unchanged: outcome is incomplete while a file is missing', () => {
  const job = provedJob({});
  assert.equal(buildJobIsComplete(job), false);
  assert.equal(buildJobOutcome(job, {}, { passed: true, desk: deskFingerprint({}) }), 'incomplete');
  // Even a passing verdict cannot make a job with missing files read as done.
});

test('all files present with no verdict is UNVERIFIED, never done', () => {
  const job = provedJob(deskVfs);
  assert.equal(buildJobIsComplete(job), true, 'the files are all there');
  assert.equal(buildJobOutcome(job, deskVfs, null), 'unverified');
  assert.match(describeBuildJob(job, { vfs: deskVfs }), /Nothing has checked this build yet/);
});

test('a failing verdict for THIS desk reads as failed, and names why', () => {
  const job = provedJob(deskVfs);
  const verdict = { passed: false, desk: deskFingerprint(deskVfs), issues: ['Buttons are not wired to any handler'] };
  assert.equal(buildJobOutcome(job, deskVfs, verdict), 'failed');
  const text = describeBuildJob(job, { vfs: deskVfs, verdict });
  assert.match(text, /did not pass/);
  assert.match(text, /Buttons are not wired/, 'a failure the user cannot act on is a failure they will ignore');
});

test('a passing verdict for THIS desk is the only thing that proves it', () => {
  const job = provedJob(deskVfs);
  const verdict = { passed: true, desk: deskFingerprint(deskVfs) };
  assert.equal(buildJobOutcome(job, deskVfs, verdict), 'proved');
  assert.match(describeBuildJob(job, { vfs: deskVfs, verdict }), /passed its check/);
});

test('a verdict earned by a DIFFERENT desk proves nothing', () => {
  /*
   * The calculator passes, the user asks for a bakery, every bakery file lands.
   * Without this the stale pass would paint the bakery green — the artifact-level
   * version of the stale locator that kept the deployed golden red for weeks
   * while looking like a flake.
   */
  const bakery = { 'src/App.jsx': 'export default function App() { return <main>Sunrise Bakery</main> }' };
  const job = provedJob(bakery);
  const calculatorPass = { passed: true, desk: deskFingerprint(deskVfs) };
  assert.notEqual(deskFingerprint(bakery), deskFingerprint(deskVfs), 'two different desks must fingerprint differently');
  assert.equal(buildJobOutcome(job, bakery, calculatorPass), 'unverified');
});

test('a verdict that cannot say which desk it judged counts as no verdict', () => {
  // Strict on purpose: such a verdict is either stale or from a caller that
  // does not know what it measured, and both are worse than "not yet checked".
  const job = provedJob(deskVfs);
  assert.equal(buildJobOutcome(job, deskVfs, { passed: true }), 'unverified');
  assert.equal(buildJobOutcome(job, deskVfs, { passed: true, desk: '' }), 'unverified');
  assert.equal(buildJobOutcome(job, deskVfs, { passed: 'yes', desk: deskFingerprint(deskVfs) }), 'unverified');
});

test('the fingerprint reads content, not just the shape of the desk', () => {
  /*
   * A size-only fingerprint would call these the same desk, and a rename that
   * preserves lengths is exactly the edit that would slip through it.
   */
  const a = { 'src/App.jsx': 'const NAME = "aaaa";' };
  const b = { 'src/App.jsx': 'const NAME = "bbbb";' };
  assert.equal(a['src/App.jsx'].length, b['src/App.jsx'].length, 'the fixture only tests what it claims if the lengths match');
  assert.notEqual(deskFingerprint(a), deskFingerprint(b));
  // And a path change is a different desk even at identical content.
  assert.notEqual(deskFingerprint(a), deskFingerprint({ 'src/Main.jsx': a['src/App.jsx'] }));
  // The empty desk has no fingerprint to compare against, so nothing proves it.
  assert.equal(deskFingerprint({}), '');
});

test('the desk renders the outcome, and green is reserved for proved', async () => {
  /*
   * The wiring, not the arithmetic. This repository keeps growing functions
   * that are written, tested and called by nothing, so the seam is asserted:
   * the studio must ASK for the outcome and colour on it, and the canvas must
   * send the fingerprint the outcome needs.
   */
  const { readFile } = await import('node:fs/promises');
  const studio = await readFile(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  assert.match(studio, /buildJobOutcome\(buildJob, vfs, deskVerdict\)/, 'the desk must ask for the outcome');
  assert.match(studio, /data-quantora-build-outcome=\{outcome\}/, 'the outcome must be observable');
  assert.match(studio, /outcome === 'proved'\s*\?\s*'#4ade80'/, "green must be reserved for 'proved'");
  assert.doesNotMatch(
    studio,
    /color: buildJobIsComplete\(buildJob\) \? '#4ade80'/,
    'the desk is colouring "done" by file presence again',
  );
  assert.match(studio, /describeBuildJob\(buildJob, \{ vfs, verdict: deskVerdict \}\)/);

  const canvas = await readFile(new URL('../components/LivePreviewCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /desk: deskFingerprint\(vfsRef\.current\)/, 'a verdict with no fingerprint proves nothing');
});
