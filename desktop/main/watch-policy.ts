/*
 * Pure decisions for the persistent host (design §7, ROADMAP 6.3):
 *
 *   diffWatches     — which research watches newly report a change
 *   restraint       — whether the host may raise a notification right now
 *
 * Proactive, never noisy: quiet hours, a per-hour budget, and one
 * notification per question until the person acknowledges it on the desk.
 * Electron-free so the root test runner covers every branch.
 */

export type WatchSummary = { question: string; changed: boolean };

export type RestraintPolicy = {
  /** Local-time hours [start, end) during which nothing is raised. Wraps midnight. */
  quietHours: { start: number; end: number } | null;
  /** Maximum notifications inside any rolling hour. */
  perHour: number;
};

export const DEFAULT_RESTRAINT: RestraintPolicy = {
  quietHours: { start: 22, end: 8 },
  perHour: 3,
};

/** Poll cadence for the watch loop while the app runs. The server sweeps daily; hourly is plenty. */
export const WATCH_POLL_INTERVAL_MS = 60 * 60 * 1000;

/** Questions that are flagged now and were not flagged (or not known) before, and not yet notified. */
export function newlyChangedWatches(
  current: WatchSummary[],
  notified: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const watch of current) {
    if (!watch.changed) continue;
    if (notified.has(watch.question)) continue;
    out.push(watch.question);
  }
  return out;
}

/** Once a watch stops being flagged (acknowledged on the desk), it may notify again next time. */
export function pruneNotified(current: WatchSummary[], notified: ReadonlySet<string>): Set<string> {
  const stillFlagged = new Set(current.filter((w) => w.changed).map((w) => w.question));
  return new Set([...notified].filter((question) => stillFlagged.has(question)));
}

export function inQuietHours(policy: RestraintPolicy, localHour: number): boolean {
  const quiet = policy.quietHours;
  if (!quiet) return false;
  if (quiet.start === quiet.end) return false;
  if (quiet.start < quiet.end) return localHour >= quiet.start && localHour < quiet.end;
  return localHour >= quiet.start || localHour < quiet.end; // wraps midnight
}

export type RestraintVerdict = { allow: true } | { allow: false; reason: "quiet-hours" | "budget" };

/**
 * May one more notification go out now? `recentTimestamps` are the send
 * times (ms) of notifications already raised; only the last hour counts.
 */
export function restraintVerdict(
  policy: RestraintPolicy,
  now: number,
  recentTimestamps: readonly number[],
  localHour: number = new Date(now).getHours(),
): RestraintVerdict {
  if (inQuietHours(policy, localHour)) return { allow: false, reason: "quiet-hours" };
  const hourAgo = now - 60 * 60 * 1000;
  const inWindow = recentTimestamps.filter((t) => t > hourAgo).length;
  if (inWindow >= policy.perHour) return { allow: false, reason: "budget" };
  return { allow: true };
}

/** Notification copy: says what changed, never what to conclude. */
export function watchNotificationText(question: string): { title: string; body: string } {
  return {
    title: "Evidence changed on a question you watch",
    body: question.length > 120 ? `${question.slice(0, 117)}…` : question,
  };
}
