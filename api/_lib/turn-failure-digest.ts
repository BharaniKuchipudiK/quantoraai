/*
 * WHAT YOUR USERS ACTUALLY HIT, WITHOUT WAITING FOR A SCREENSHOT.
 *
 * Every failed turn is already recorded. `transaction_boundary_events` carries
 * the boundary, the state, the status, the engine and the reason for each one,
 * and has since the trace store was wired.
 *
 * Nothing could list them. `readBoundaryEvents(correlationId)` is the only
 * reader, so a failure is legible ONLY to someone who already holds its
 * reference id — which they learn from a person sending them a screenshot of
 * it. On 2026-09-08 that was literally the operating model: three real defects
 * that day reached the platform's owner as images, one at a time, hours after
 * the users hit them.
 *
 * The telemetry worked. Looking at it was the missing half.
 *
 * PRIVACY IS INHERITED, NOT ADDED. The boundary schema is already operational
 * fields only — "no prompt, no reply, no key" — so a digest over it cannot leak
 * user content however it is summarised. Nothing here reads a message body,
 * because nothing here has access to one. User subs are counted, never listed:
 * how many distinct people a fault touched is the number that decides urgency,
 * and naming them adds nothing an operator can act on.
 */

export const FAILURE_WINDOW_HOURS = 24;

export type FailureRow = {
  correlationId?: string | null;
  boundary?: string | null;
  state?: string | null;
  statusCode?: number | null;
  detailCode?: string | null;
  modelId?: string | null;
  gateway?: string | null;
  userSub?: string | null;
  at?: string | null;
};

/*
 * A refusal is not an outage, and a digest that mixes them teaches its reader
 * to ignore it. `rate-limited` and `turn-budget` are Quantora declining on
 * purpose — expected, self-clearing, and load-bearing evidence that the
 * budgets work. They are counted separately so a busy day of honest refusals
 * never buries one dead provider.
 */
const REFUSAL_DETAIL = new Set(["rate-limited", "turn-budget", "platform-budget"]);

/** Plain words for an operator. An unmapped code prints as itself, never as "". */
const REASON_WORDS: Record<string, string> = {
  "rate-limited": "asked again too quickly",
  "turn-budget": "their daily turn budget was spent",
  "platform-budget": "the shared daily ceiling was spent",
  "quota-exhausted": "the engine's quota ran out",
  "provider-failure": "the engine returned an error",
  "attempt-timeout": "the engine did not answer in time",
  "route-not-found": "the engine route does not exist",
  "chat-failure": "the turn failed on the server",
  "silent-turn": "the desk received no reply",
  "stream-truncated": "the reply was cut off",
  "compile-failed": "the preview could not compile",
  "iframe-failed": "the preview failed while running",
};

export function reasonWords(detailCode?: string | null): string {
  const code = String(detailCode || "").trim();
  if (!code) return "no reason recorded";
  return REASON_WORDS[code] || code;
}

export type FailureGroup = {
  reason: string;
  detailCode: string;
  words: string;
  /**
   * Whether Quantora declined on purpose. Emitted by the server rather than
   * re-derived by each reader: the panel that renders a refusal differently
   * from a fault must not carry its own copy of REFUSAL_DETAIL, or the two
   * ends drift apart in silence and a fault starts reading as a quiet limit.
   */
  kind: "refusal" | "fault";
  count: number;
  users: number;
  statuses: number[];
  engines: string[];
  latestAt: string | null;
  sampleReferences: string[];
};

export type FailureDigest = {
  windowHours: number;
  total: number;
  refusals: number;
  faults: number;
  usersAffected: number;
  groups: FailureGroup[];
  headline: string;
};

/**
 * Group a window of failures into something an operator reads in ten seconds.
 *
 * Faults first and by reach: a reason that touched four people outranks one
 * that fired twenty times for the same person, because the first is a platform
 * problem and the second is one person having a bad afternoon.
 */
export function summarizeTurnFailures(rows: FailureRow[] = [], windowHours = FAILURE_WINDOW_HOURS): FailureDigest {
  const list = Array.isArray(rows) ? rows : [];
  const byReason = new Map<string, {
    users: Set<string>; statuses: Set<number>; engines: Set<string>;
    count: number; latestAt: string | null; refs: string[];
  }>();
  const allUsers = new Set<string>();
  let refusals = 0;

  for (const row of list) {
    const detailCode = String(row?.detailCode || "").trim();
    if (REFUSAL_DETAIL.has(detailCode)) refusals += 1;
    const bucket = byReason.get(detailCode) || {
      users: new Set<string>(), statuses: new Set<number>(), engines: new Set<string>(),
      count: 0, latestAt: null as string | null, refs: [] as string[],
    };
    bucket.count += 1;
    const sub = String(row?.userSub || "").trim();
    if (sub) { bucket.users.add(sub); allUsers.add(sub); }
    const status = Number(row?.statusCode);
    if (Number.isFinite(status) && status > 0) bucket.statuses.add(status);
    const engine = String(row?.modelId || "").trim();
    if (engine) bucket.engines.add(engine);
    const at = String(row?.at || "").trim();
    if (at && (!bucket.latestAt || at > bucket.latestAt)) bucket.latestAt = at;
    // A handful of reference ids per reason: enough to pull the full trace for
    // one, not so many that the digest becomes the log it is summarising.
    const ref = String(row?.correlationId || "").trim();
    if (ref && bucket.refs.length < 3 && !bucket.refs.includes(ref)) bucket.refs.push(ref);
    byReason.set(detailCode, bucket);
  }

  const groups: FailureGroup[] = [...byReason.entries()].map(([detailCode, bucket]) => ({
    reason: detailCode || "(unrecorded)",
    detailCode,
    words: reasonWords(detailCode),
    kind: REFUSAL_DETAIL.has(detailCode) ? "refusal" : "fault",
    count: bucket.count,
    users: bucket.users.size,
    statuses: [...bucket.statuses].sort((a, b) => a - b),
    engines: [...bucket.engines].sort(),
    latestAt: bucket.latestAt,
    sampleReferences: bucket.refs,
  }));

  const isRefusal = (group: FailureGroup) => group.kind === "refusal";
  groups.sort((a, b) => {
    if (isRefusal(a) !== isRefusal(b)) return isRefusal(a) ? 1 : -1;
    if (b.users !== a.users) return b.users - a.users;
    return b.count - a.count;
  });

  const faults = list.length - refusals;
  const worst = groups.find((group) => !isRefusal(group));
  const headline = list.length === 0
    ? `No failed turns in the last ${windowHours}h.`
    : faults === 0
      ? `${refusals} refused turn(s) in ${windowHours}h and no faults — the budgets did their job.`
      : `${faults} fault(s) across ${allUsers.size} user(s) in ${windowHours}h`
        + (worst ? `; worst: ${worst.words} (${worst.count}x, ${worst.users} user(s))` : "")
        + (refusals ? `. ${refusals} refusal(s) counted separately.` : ".");

  return { windowHours, total: list.length, refusals, faults, usersAffected: allUsers.size, groups, headline };
}
