/*
 * Run a test command, stream it through untouched, and name the failures at the end.
 *
 * The live output is forwarded byte for byte as it arrives, so scrollback, TAP
 * counters and anything else reading this stream see exactly what they saw
 * before. The only difference is a block appended after the run naming what
 * failed — see test-failure-summary.mjs for the incident that made it
 * necessary.
 *
 * WHY THE SUMMARY GOES TO STDERR
 *
 * It has to survive whatever the caller does with stdout. `npm run test:ts >
 * file` and the pipelines in test:all both redirect stdout; a summary that went
 * there would be swallowed by the exact redirection someone uses when a run is
 * too long to watch, which is precisely when the summary is needed. GitHub
 * Actions interleaves both streams in the job log, so it still lands at the
 * end where it belongs.
 */
import { spawn } from 'node:child_process';
import { createTapFailureCollector, formatTapFailureSummary } from './test-failure-summary.mjs';

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} label  Named in the summary so a run of several suites says which one.
 * @returns {Promise<number>} the child's exit code, unchanged.
 */
export async function runTestsWithFailureSummary(command, args, label = '') {
  const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'inherit'] });
  const collector = createTapFailureCollector();
  let pending = '';

  child.stdout.on('data', (chunk) => {
    // Forwarded first and unmodified: whatever this summary does or fails to
    // do, it must never come at the cost of the output that already worked.
    process.stdout.write(chunk);
    pending += chunk.toString('utf8');
    const lines = pending.split('\n');
    // The last element is an unterminated line; hold it for the next chunk so a
    // failure split across a buffer boundary is not missed.
    pending = lines.pop() ?? '';
    for (const line of lines) collector.line(line);
  });

  const status = await new Promise((resolve) => {
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });

  if (pending) collector.line(pending);
  const summary = formatTapFailureSummary(collector.failures(), { label });
  if (summary) process.stderr.write(`${summary}\n`);
  return status;
}
