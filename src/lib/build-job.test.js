import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceBuildJob,
  briefNeedsJob,
  buildJobIsComplete,
  completedCount,
  createBuildJob,
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
