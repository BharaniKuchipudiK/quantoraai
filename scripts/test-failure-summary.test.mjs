/**
 * The summary exists so a failure is readable from the TAIL of a log.
 *
 * That is the property under test, not "the parser works". On 2026-09-07 one
 * test of 1630 failed in CI and could not be identified through any available
 * route, because its name was nine thousand lines above the end and the log API
 * serves only the last five thousand. A parser that extracts failures but does
 * not put them where they can be reached would pass every obvious test and fix
 * nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LISTED_FAILURES,
  createTapFailureCollector,
  formatTapFailureSummary,
} from './lib/test-failure-summary.mjs';

function collect(lines) {
  const collector = createTapFailureCollector();
  for (const line of lines) collector.line(line);
  return collector.failures();
}

const FAILURE_BLOCK = [
  'not ok 917 - the desk kept the file it was told to delete',
  '  ---',
  '  duration_ms: 1.2',
  '  type: \'test\'',
  '  location: \'/repo/src/lib/thing.test.js:12:1\'',
  '  failureType: \'testCodeFailure\'',
  '  error: |-',
  '    the file survived the delete',
  '    + actual - expected',
  '  code: \'ERR_ASSERTION\'',
  '  ...',
];

test('a failing test is captured with the sentence that explains it', () => {
  const failures = collect(FAILURE_BLOCK);
  assert.equal(failures.length, 1);
  assert.match(failures[0].title, /not ok 917 - the desk kept the file/);
  assert.ok(
    failures[0].detail.some((line) => /the file survived the delete/.test(line)),
    `the assertion message must survive; got ${JSON.stringify(failures[0].detail)}`,
  );
});

test('bookkeeping keys are dropped, because they are the same on every failure', () => {
  const detail = collect(FAILURE_BLOCK)[0].detail.join('\n');
  assert.doesNotMatch(detail, /duration_ms/);
  assert.doesNotMatch(detail, /failureType/);
  assert.doesNotMatch(detail, /^error: \|-$/m, 'the YAML fence is not the message');
});

/*
 * Six runner frames per failure is enough to push the test's NAME out of the
 * window a person reads first, which defeats the entire purpose.
 */
test('the runner\'s own stack frames are dropped and the project frame is kept', () => {
  const failures = collect([
    'not ok 1 - something broke',
    '  ---',
    '  error: |-',
    '    boom',
    '    TestContext.<anonymous> (file:///repo/src/lib/thing.test.js:4:41)',
    '    Test.runInAsyncScope (node:async_hooks:214:14)',
    '    Test.run (node:internal/test_runner/test:1047:25)',
    '    Test.processPendingSubtests (node:internal/test_runner/test:744:18)',
    '    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)',
    '  ...',
  ]);
  const detail = failures[0].detail.join('\n');
  assert.match(detail, /thing\.test\.js:4:41/, 'the frame naming the test file is the one worth keeping');
  assert.doesNotMatch(detail, /node:internal/);
  assert.doesNotMatch(detail, /async_hooks/);
});

test('several failures are each kept, in the order they happened', () => {
  const failures = collect([
    'not ok 1 - first thing',
    '  ---',
    '  error: |-',
    '    one',
    '  ...',
    'ok 2 - something that passed',
    'not ok 3 - second thing',
    '  ---',
    '  error: |-',
    '    two',
    '  ...',
  ]);
  assert.equal(failures.length, 2);
  assert.match(failures[0].title, /first thing/);
  assert.match(failures[1].title, /second thing/);
  assert.ok(failures[0].detail.some((l) => l === 'one'));
  assert.ok(failures[1].detail.some((l) => l === 'two'));
});

/*
 * A summary that announces itself on a green run trains people to skip it, and
 * then it is not read on the run that matters.
 */
test('a green run prints nothing at all', () => {
  assert.equal(collect(['ok 1 - fine', 'ok 2 - also fine', '# pass 2', '# fail 0']).length, 0);
  assert.equal(formatTapFailureSummary([]), '');
  assert.equal(formatTapFailureSummary(null), '');
});

test('a flood of failures is capped, and says how many it did not list', () => {
  const many = Array.from({ length: MAX_LISTED_FAILURES + 7 }, (_, i) => ({
    title: `not ok ${i} - failure ${i}`,
    detail: ['because'],
  }));
  const summary = formatTapFailureSummary(many, { label: 'node' });
  assert.match(summary, new RegExp(`FAILING TESTS \\(node\\): ${many.length}`), 'the count must be the true count');
  assert.match(summary, /and 7 more failure\(s\) above in the log/);
  assert.doesNotMatch(summary, /failure 30/, 'past the cap the log itself is the record');
});

/*
 * THE PROPERTY THE INCIDENT WAS ABOUT.
 *
 * A failure early in a very long run must be readable from the last handful of
 * lines. If the summary is ever moved back inline, or emitted before the run
 * finishes, this is what catches it.
 */
test('a failure buried thousands of lines deep is readable from the tail', () => {
  const collector = createTapFailureCollector();
  collector.line('not ok 12 - THE ONE THAT BROKE');
  collector.line('  ---');
  collector.line('  error: |-');
  collector.line('    the registration number was truncated');
  collector.line('  ...');
  for (let i = 0; i < 6000; i += 1) collector.line(`ok ${i + 13} - filler ${i}`);
  collector.line('1..6013');
  collector.line('# fail 1');

  const log = `${'filler\n'.repeat(6000)}${formatTapFailureSummary(collector.failures(), { label: 'TypeScript' })}`;
  const tail = log.split('\n').slice(-12).join('\n');

  assert.match(tail, /THE ONE THAT BROKE/, 'the failing test must be nameable from the tail alone');
  assert.match(tail, /registration number was truncated/, 'and so must the reason');
});

test('a run that ends mid-block still reports the failure it was describing', () => {
  const collector = createTapFailureCollector();
  collector.line('not ok 4 - killed before it finished');
  collector.line('  ---');
  collector.line('  error: |-');
  collector.line('    the process died here');
  // No closing '...': the runner was terminated.
  const failures = collector.failures();
  assert.equal(failures.length, 1, 'a crash mid-failure must not swallow the failure');
  assert.ok(failures[0].detail.some((l) => /process died here/.test(l)));
});

/*
 * FROM REVIEW OF #592: forwarding output through a pipe can lose it.
 *
 * The original runners inherited file descriptors, which could not drop a byte.
 * Piping to forward it introduces backpressure -- when stdout is a CI collector
 * or a redirect, `write` returns false once its buffer fills. Ignoring that
 * would truncate the log, and writing the summary before stdout finished
 * draining would put it somewhere other than the tail. Either defeats the only
 * reason this change exists.
 *
 * A NOTE ON THESE TWO TESTS.
 *
 * They were written once already and caught neither bug: a fake stream that
 * records every chunk loses nothing whether or not the child is paused, and a
 * stream that accepts instantly makes an awaited flush indistinguishable from a
 * missing one. Both passed against the broken code. They are rewritten here to
 * turn on the one thing each fix actually changes -- whether the child is made
 * to WAIT, and whether the flush COMPLETES before the summary is written.
 */
import { runTestsWithFailureSummary } from './lib/run-tests-with-summary.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('a consumer that stops accepting stalls the run instead of losing its output', async () => {
  const drainWaiters = [];
  let accepted = 0;
  const out = {
    write(chunk, cb) {
      accepted += 1;
      if (cb) cb();
      // Full after the first chunk, and never drains until told.
      return accepted < 1;
    },
    once(event, fn) { if (event === 'drain') drainWaiters.push(fn); },
  };
  const quiet = { write(_c, cb) { if (cb) cb(); return true; }, once() {} };

  // Enough output that the child fills the pipe and blocks while paused.
  const run = runTestsWithFailureSummary(
    process.execPath,
    ['-e', 'for (let i = 0; i < 20000; i += 1) console.log(`line ${i} ${"x".repeat(80)}`);'],
    'backpressure',
    { out, err: quiet },
  );

  const raced = await Promise.race([run.then(() => 'finished'), sleep(400).then(() => 'still-running')]);
  assert.equal(
    raced,
    'still-running',
    'the run finished while the consumer was refusing writes, which means output was read and dropped rather than held',
  );
  assert.ok(drainWaiters.length > 0, 'the forwarder must be waiting on drain, not spinning');

  // Let it complete so the test does not leave a child behind.
  const pump = setInterval(() => { for (const fn of drainWaiters.splice(0)) fn(); }, 1);
  await run;
  clearInterval(pump);
});

test('the summary is written only after the forwarded output has finished flushing', async () => {
  const order = [];
  let flushCompleted = false;
  const out = {
    write(chunk, cb) {
      const text = String(chunk);
      if (text === '') {
        // The zero-length flush probe: its callback is what "flushed" awaits.
        setTimeout(() => { flushCompleted = true; order.push('out:flush-complete'); if (cb) cb(); }, 20);
        return true;
      }
      order.push('out:data');
      if (cb) cb();
      return true;
    },
    once() {},
  };
  const err = {
    write(_chunk, cb) { order.push(flushCompleted ? 'err:summary-after-flush' : 'err:summary-too-early'); if (cb) cb(); return true; },
    once() {},
  };

  await runTestsWithFailureSummary(
    process.execPath,
    ['-e', 'console.log("not ok 1 - it broke"); console.log("  ---"); console.log("  error: |-"); console.log("    reason"); console.log("  ..."); process.exit(1);'],
    'ordering',
    { out, err },
  );

  assert.ok(order.includes('err:summary-after-flush'), `the summary must wait for stdout to drain; order was ${order.join(' > ')}`);
  assert.ok(!order.includes('err:summary-too-early'), 'a summary written before the output flushed is not at the tail');
  assert.ok(
    order.indexOf('out:flush-complete') < order.indexOf('err:summary-after-flush'),
    'the flush has to complete first, not merely be started',
  );
});

test('the exit code of the run is passed through untouched', async () => {
  const quiet = { write(_c, cb) { if (cb) cb(); return true; }, once() {} };
  const failed = await runTestsWithFailureSummary(process.execPath, ['-e', 'process.exit(3)'], 'code', { out: quiet, err: quiet });
  assert.equal(failed, 3, 'a summary must never change what the suite reported');
  const passed = await runTestsWithFailureSummary(process.execPath, ['-e', ''], 'code', { out: quiet, err: quiet });
  assert.equal(passed, 0);
});
