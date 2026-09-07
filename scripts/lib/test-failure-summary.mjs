/*
 * Which test failed, printed where a CI log can actually be read.
 *
 * THE INCIDENT
 *
 * On 2026-09-07 one test of 1630 failed in CI and could not be identified at
 * all. The TAP reporter prints a failure inline, at the moment it happens, and
 * then ends the run with counters only:
 *
 *     1..1630
 *     # tests 1630
 *     # pass 1629
 *     # fail 1
 *
 * The failing test's name was roughly nine thousand lines earlier. GitHub's
 * job-log API returns approximately the last five thousand lines and nothing
 * before them, at any requested size, and the raw log download is on a host
 * this repository's tooling cannot reach. So the identity of the failure was
 * unreachable through every available route. Forty minutes went into trying,
 * the branch was rebased and re-run to get green, and to this day nobody knows
 * which test it was.
 *
 * That is a direct violation of the first rule this project has: a check is a
 * claim and the log is the evidence. A red check whose evidence cannot be read
 * is worth very little more than a green one that was never opened -- and it is
 * exactly the pressure that gets a "flaky" label applied to a real defect,
 * which is how three production endpoints were lost once already.
 *
 * WHY NOT SIMPLY SWITCH REPORTERS
 *
 * Node's `spec` reporter does print failures at the end, and it also prints a
 * line per passing test with a different shape, which changes every line of a
 * 13,000-line log to solve a problem in ten of them. The live stream is left
 * exactly as it is; a summary is appended after it. Nothing that reads the
 * existing output has to change, and the fix costs no extra volume during the
 * run.
 *
 * WHY IT PARSES INCREMENTALLY
 *
 * Buffering the whole run to search it afterwards would hold megabytes for the
 * sake of a few lines, on a runner that also has to build the app. The state
 * machine below keeps only the failures it has actually seen.
 */

/** Failures listed in full; beyond this the summary says how many it dropped. */
export const MAX_LISTED_FAILURES = 25;

/** Lines of detail kept per failure — enough for the assertion and where it was. */
export const MAX_DETAIL_LINES = 14;

/**
 * Collects `not ok` lines and the indented YAML block that follows each one.
 *
 * TAP shape being read:
 *
 *     not ok 917 - the test that broke
 *       ---
 *       error: |-
 *         AssertionError: ...
 *       ...
 *
 * A nested failure repeats its parent's `not ok`, so the same test can appear
 * twice at different indents. Both are kept: which of them is the real cause is
 * a judgement for the person reading, and dropping one to look tidier is how a
 * summary starts lying about what happened.
 */
export function createTapFailureCollector() {
  const failures = [];
  let current = null;

  const finish = () => {
    if (current) failures.push(current);
    current = null;
  };

  return {
    /** Feed one line of TAP, in order. */
    line(raw) {
      const text = typeof raw === 'string' ? raw.replace(/\s+$/, '') : '';
      if (/^\s*not ok\s/.test(text)) {
        finish();
        current = { title: text.trim(), detail: [] };
        return;
      }
      if (!current) return;
      // The YAML block that belongs to this failure is indented; the next
      // unindented line ends it. `ok`/`not ok` at any indent also ends it,
      // because a passing subtest means the block is over.
      if (/^\s*(not )?ok\s/.test(text) || (text && !/^\s/.test(text))) {
        finish();
        return;
      }
      if (current.detail.length < MAX_DETAIL_LINES) {
        const trimmed = text.trim();
        // The YAML fences and the bare `type:`/`duration_ms:` keys are noise in
        // a summary meant to be read at a glance.
        if (!trimmed || trimmed === '---' || trimmed === '...') return;
        if (/^(duration_ms|type|location|failureType|code|name|stack):/.test(trimmed)) return;
        // `error: |-` is a YAML fence announcing the message on the next line.
        if (/^error:\s*\|-?$/.test(trimmed)) return;
        /*
         * The runner's own frames say nothing about the defect and there are
         * six of them per failure -- enough to push the test's NAME out of the
         * window someone reads first. The frame that names a file in the
         * project is kept, because that is the line worth having.
         */
        if (/^(Test\.|TestContext\.|async |process\.processImmediate|node:)/.test(trimmed)
          && !/\.(test|spec)\.[cm]?[jt]s/.test(trimmed)) return;
        if (/node:(internal|async_hooks)/.test(trimmed)) return;
        current.detail.push(trimmed);
      }
    },
    /** Everything collected so far, closing any block still open. */
    failures() {
      finish();
      return failures;
    },
  };
}

/**
 * The block printed after the run.
 *
 * Returns '' when nothing failed: a summary that announces itself on a green
 * run trains people to skip it, and then it is not read on the run that matters.
 */
export function formatTapFailureSummary(failures, { label = '' } = {}) {
  const list = Array.isArray(failures) ? failures : [];
  if (!list.length) return '';
  const shown = list.slice(0, MAX_LISTED_FAILURES);
  const lines = [
    '',
    '='.repeat(72),
    `FAILING TESTS${label ? ` (${label})` : ''}: ${list.length}`,
    'Printed here because a failure inline in a 13,000-line log cannot be read',
    'from a CI log API that only returns the tail.',
    '='.repeat(72),
  ];
  for (const failure of shown) {
    lines.push('', failure.title);
    for (const detail of failure.detail) lines.push(`    ${detail}`);
  }
  if (list.length > shown.length) {
    lines.push('', `... and ${list.length - shown.length} more failure(s) above in the log.`);
  }
  lines.push('='.repeat(72), '');
  return lines.join('\n');
}
