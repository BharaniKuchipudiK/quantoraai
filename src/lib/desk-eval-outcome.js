/**
 * WHAT COUNTS AS A FAILURE WHEN A MODEL IS IN THE LOOP.
 *
 * A gate that fires on ambiguous evidence gets muted by the next person under
 * pressure, and then it protects nothing (§5). A model-driven eval is the
 * hardest case for that rule: the same prompt can produce a different page
 * twice, so "the button was not where I expected" is not, on its own, a
 * platform failure.
 *
 * So this file draws one line and holds it:
 *
 *   BLOCKING — the platform did not do its job. No reply, an error, a build
 *   that produced nothing runnable, a desk that crashed, a turn that never
 *   came back, or one message that became a ladder of requests. These are
 *   faults regardless of what the model wrote, and they fail the run.
 *
 *   SCORED — the platform worked and the answer was wrong. The page rendered
 *   but the thing asked for was not in it. That is a real defect and the one
 *   the owner keeps finding in screenshots, but it is also the number that
 *   moves when a provider changes a model. It is counted, not thrown, and it
 *   is guarded by a FLOOR that may only rise — the same shape as the travel
 *   comprehension gate, for the same reason: a correctness number bought by
 *   loosening the check shows up immediately as a drop somewhere else.
 *
 * The distinction is what makes this suite survivable. A run that fails on
 * every model wobble is one nobody runs twice.
 */

export const OUTCOME = Object.freeze({
  PASS: 'pass',
  BEHAVIOR_MISS: 'behavior-miss',
  NO_PREVIEW: 'no-preview',
  NO_REPLY: 'no-reply',
  TURN_ERROR: 'turn-error',
  DESK_CRASH: 'desk-crash',
  TIMEOUT: 'timeout',
  REQUEST_STORM: 'request-storm',
});

/** Platform faults. A model cannot cause these by writing a different page. */
const BLOCKING = Object.freeze(new Set([
  OUTCOME.NO_PREVIEW,
  OUTCOME.NO_REPLY,
  OUTCOME.TURN_ERROR,
  OUTCOME.DESK_CRASH,
  OUTCOME.TIMEOUT,
  OUTCOME.REQUEST_STORM,
]));

export function isBlocking(outcome) {
  return BLOCKING.has(String(outcome || ''));
}

export function scoreRun(results = []) {
  const list = Array.isArray(results) ? results : [];
  const counts = {};
  for (const row of list) {
    const outcome = String(row?.outcome || '');
    counts[outcome] = (counts[outcome] || 0) + 1;
  }
  const blocking = list.filter((row) => isBlocking(row?.outcome));
  const passed = counts[OUTCOME.PASS] || 0;
  // Answered = the platform did its job, whether or not the answer was right.
  // Scoring against this rather than against the total keeps a platform outage
  // from also reading as a comprehension collapse — two faults, two numbers.
  const answered = passed + (counts[OUTCOME.BEHAVIOR_MISS] || 0);
  return {
    total: list.length,
    passed,
    answered,
    blocking: blocking.length,
    counts,
    // Null, not 1, when nothing was answered: a run where the platform died
    // has NO comprehension measurement, and reporting a perfect score there
    // would be the exact "green check over a red log" this repo exists to stop.
    correctness: answered > 0 ? Number((passed / answered).toFixed(3)) : null,
  };
}

/**
 * The run's verdict.
 *
 * `floor` is the correctness ratio the desk has already proven it can hold.
 * It may only be raised, and never by loosening a case — a floor that moves
 * down is a decision, and a decision belongs in a commit message, not in a
 * quietly edited constant.
 */
export function verdictFor(results = [], { floor = 0 } = {}) {
  const score = scoreRun(results);
  const reasons = [];

  for (const row of Array.isArray(results) ? results : []) {
    if (isBlocking(row?.outcome)) {
      reasons.push(`${row.id}: ${row.outcome}${row.detail ? ` — ${row.detail}` : ''}`);
    }
  }
  if (score.correctness !== null && score.correctness < floor) {
    reasons.push(`correctness ${score.correctness} is below the floor ${floor}`);
  }
  return { ok: reasons.length === 0, score, reasons };
}

const LABEL = Object.freeze({
  [OUTCOME.PASS]: 'passed',
  [OUTCOME.BEHAVIOR_MISS]: 'answered, but not what was asked',
  [OUTCOME.NO_PREVIEW]: 'a build produced nothing runnable',
  [OUTCOME.NO_REPLY]: 'the turn ended with no reply',
  [OUTCOME.TURN_ERROR]: 'the desk reported an error',
  [OUTCOME.DESK_CRASH]: 'the desk itself failed',
  [OUTCOME.TIMEOUT]: 'the turn never came back',
  [OUTCOME.REQUEST_STORM]: 'one message became many requests',
});

export function describeOutcome(outcome) {
  return LABEL[String(outcome || '')] || String(outcome || 'unknown');
}

/**
 * The report a person reads.
 *
 * Failures first and in full, because a report whose findings are below a wall
 * of passes is one that gets skimmed. The score prints last, the way the
 * journey ledger prints its number last, so the thing you remember is the
 * thing that was measured.
 */
export function renderReport(results = [], meta = {}) {
  const list = Array.isArray(results) ? results : [];
  const { ok, score, reasons } = verdictFor(list, { floor: meta.floor || 0 });
  const lines = [];

  lines.push(`# Desk eval — ${meta.tier || 'unknown'} tier`);
  lines.push('');
  lines.push(`- target: ${meta.target || '(unset)'}`);
  lines.push(`- ran: ${meta.ranAt || new Date().toISOString()}`);
  lines.push(`- model turns spent: ${meta.turns ?? '?'}`);
  lines.push('');

  const failures = list.filter((row) => row.outcome !== OUTCOME.PASS);
  if (failures.length) {
    lines.push('## What failed');
    lines.push('');
    for (const row of failures) {
      lines.push(`### ${row.id} — ${describeOutcome(row.outcome)}`);
      lines.push('');
      lines.push(`**Asked:** ${row.prompt || '(multi-turn)'}`);
      if (row.detail) lines.push(`**What happened:** ${row.detail}`);
      if (row.incident) lines.push(`**Known incident:** ${row.incident}`);
      if (row.evidence) lines.push(`**Evidence:** ${row.evidence}`);
      if (row.screenshot) lines.push(`**Screenshot:** \`${row.screenshot}\``);
      lines.push('');
    }
  } else {
    lines.push('## What failed');
    lines.push('');
    lines.push('Nothing.');
    lines.push('');
  }

  lines.push('## Every case');
  lines.push('');
  lines.push('| case | tier | outcome | seconds |');
  lines.push('| --- | --- | --- | --- |');
  for (const row of list) {
    lines.push(`| ${row.id} | ${row.tier || ''} | ${row.outcome} | ${row.seconds ?? ''} |`);
  }
  lines.push('');

  if (reasons.length) {
    lines.push('## Blocking');
    lines.push('');
    for (const reason of reasons) lines.push(`- ${reason}`);
    lines.push('');
  }

  /*
   * THREE WORDS, NOT TWO.
   *
   * The first version printed PASS whenever nothing BLOCKING happened — so a
   * run that listed "never showed Goodbye" under "What failed" still headlined
   * PASS. That is a green check over a red log (§1), written by the suite
   * built to stop exactly that. A wrong answer is not a blocking fault and
   * must not redden CI, but it is also not a pass, and the word has to say so.
   */
  const headline = !ok ? 'FAIL' : (score.passed === score.total ? 'PASS' : 'FINDINGS');
  lines.push(
    `DESK EVAL | ${headline} | ${score.passed}/${score.total} passed`
    + ` | answered ${score.answered} | blocking ${score.blocking}`
    + ` | correctness ${score.correctness === null ? 'n/a' : score.correctness}`
    + ` | floor ${meta.floor ?? 0}`,
  );
  return lines.join('\n');
}
