/*
 * Run a test command, stream it through untouched, and name the failures at the end.
 *
 * The live output is forwarded byte for byte as it arrives, so scrollback, TAP
 * counters and anything else reading this stream see exactly what they saw
 * before. The only difference is a block appended after the run naming what
 * failed -- see test-failure-summary.mjs for the incident that made it
 * necessary.
 *
 * WHY THE SUMMARY GOES TO STDERR
 *
 * It has to survive whatever the caller does with stdout. `npm run test:ts >
 * file` and the pipelines in test:all both redirect stdout; a summary that went
 * there would be swallowed by the exact redirection someone uses when a run is
 * too long to watch, which is precisely when the summary is needed. GitHub
 * Actions interleaves both streams in the job log, so it still lands at the end
 * where it belongs.
 *
 * WHY BACKPRESSURE IS HANDLED RATHER THAN IGNORED
 *
 * The original runners used spawnSync with inherited file descriptors, which
 * could not lose output: the child wrote to the same fd this process did.
 * Piping to forward it introduces two failures that inheriting never had, and
 * review of #592 caught both.
 *
 * When stdout is a pipe -- a CI log collector, a redirect to a file -- writes
 * are asynchronous and `write` returns false once its buffer is full. Ignoring
 * that and calling process.exit on close discards whatever is still queued, so
 * the fix meant to make failures readable would instead truncate the log. And
 * because the summary is written the moment the child closes, it could appear
 * BEFORE the tail of a still-draining stdout in the combined log, putting the
 * summary somewhere other than the end -- defeating its only purpose.
 *
 * So the child is paused until stdout drains, stdout is flushed before the
 * summary is written, and the callers set process.exitCode rather than calling
 * process.exit, which lets Node flush both streams on its own terms.
 */
import { spawn } from 'node:child_process';
import { createTapFailureCollector, formatTapFailureSummary } from './test-failure-summary.mjs';

/** Resolves once the stream has accepted everything written so far. */
function flushed(stream) {
  return new Promise((resolve) => {
    // A zero-length write's callback fires after the queue ahead of it drains.
    if (!stream || typeof stream.write !== 'function') resolve();
    else stream.write('', () => resolve());
  });
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} label  Named in the summary so a run of several suites says which one.
 * @param {{out?: NodeJS.WritableStream, err?: NodeJS.WritableStream}} [streams]  Injectable for tests.
 * @returns {Promise<number>} the child's exit code, unchanged.
 */
export async function runTestsWithFailureSummary(command, args, label = '', streams = {}) {
  const out = streams.out || process.stdout;
  const err = streams.err || process.stderr;
  const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'inherit'] });
  const collector = createTapFailureCollector();
  let pending = '';

  child.stdout.on('data', (chunk) => {
    // Forwarded first and unmodified: whatever this summary does or fails to
    // do, it must never come at the cost of the output that already worked.
    const accepted = out.write(chunk);
    if (accepted === false) {
      // Stop reading until the consumer catches up, rather than queueing output
      // that process exit would then discard.
      child.stdout.pause();
      out.once('drain', () => child.stdout.resume());
    }
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
  // Everything the run printed reaches the log before anything is appended to
  // it, so the summary is at the tail rather than merely written last.
  await flushed(out);
  const summary = formatTapFailureSummary(collector.failures(), { label });
  if (summary) {
    err.write(`${summary}\n`);
    await flushed(err);
  }
  return status;
}
