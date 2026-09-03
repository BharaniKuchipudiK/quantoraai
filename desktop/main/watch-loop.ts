import { Notification, app, net } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DESKTOP_APP_ORIGIN } from "../../shared/desktop-contract.js";
import { apiOrigin } from "./config.js";
import { readSessionToken } from "./session-store.js";
import { focusMainWindow, getMainWindow } from "./window.js";
import {
  DEFAULT_RESTRAINT,
  WATCH_POLL_INTERVAL_MS,
  newlyChangedWatches,
  pruneNotified,
  restraintVerdict,
  watchNotificationText,
  type WatchSummary,
} from "./watch-policy.js";

/*
 * The persistent host's first loop (design §7, ROADMAP 3.2 / 6.3).
 *
 * The server sweeps research watches daily and flags `changed`. The website
 * can only show that flag when the person opens the desk; the desktop can
 * tell them. This loop asks the existing `research-watch list` task on a
 * bounded cadence, raises at most one notification per flagged question
 * until it is acknowledged on the desk, and obeys the restraint policy.
 * Nothing here acts on the person's behalf — a notification opens the desk.
 */

type PersistedState = { notified: string[]; sent: number[] };

export type PollOutcome = {
  ok: boolean;
  status: number | null;
  reason?: "signed-out" | "unavailable" | "network" | "unsupported";
  watches: number;
  newlyChanged: number;
  notified: number;
  suppressed?: "quiet-hours" | "budget";
};

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

function stateFile(): string {
  return path.join(app.getPath("userData"), "watch-state.json");
}

function readState(): PersistedState {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), "utf8"));
    return {
      notified: Array.isArray(parsed?.notified) ? parsed.notified.filter((q: unknown) => typeof q === "string") : [],
      sent: Array.isArray(parsed?.sent) ? parsed.sent.filter((t: unknown) => typeof t === "number") : [],
    };
  } catch {
    return { notified: [], sent: [] };
  }
}

function writeState(state: PersistedState): void {
  try {
    writeFileSync(stateFile(), JSON.stringify(state));
  } catch {
    /* a lost dedupe file means at worst one repeated notification */
  }
}

export function notificationsSupported(): boolean {
  try {
    return Notification.isSupported();
  } catch {
    return false;
  }
}

async function fetchWatches(token: string): Promise<{ status: number; watches: WatchSummary[] | null }> {
  const response = await net.fetch(`${apiOrigin()}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ task: "research-watch", studioDomain: "research", op: "list" }),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data?.watches)) return { status: response.status, watches: null };
  return {
    status: response.status,
    watches: data.watches
      .filter((w: any) => typeof w?.question === "string")
      .map((w: any) => ({ question: w.question, changed: w.changed === true })),
  };
}

function openResearchDesk(): void {
  focusMainWindow();
  const win = getMainWindow();
  if (win) void win.loadURL(`${DESKTOP_APP_ORIGIN}/?tab=studio`);
}

/** One pass. Exported so the smoke gate can drive it deterministically. */
export async function pollWatches(now: number = Date.now()): Promise<PollOutcome> {
  const token = readSessionToken();
  if (!token) return { ok: false, status: null, reason: "signed-out", watches: 0, newlyChanged: 0, notified: 0 };

  let fetched: { status: number; watches: WatchSummary[] | null };
  try {
    fetched = await fetchWatches(token);
  } catch {
    return { ok: false, status: null, reason: "network", watches: 0, newlyChanged: 0, notified: 0 };
  }
  if (!fetched.watches) {
    return { ok: false, status: fetched.status, reason: "unavailable", watches: 0, newlyChanged: 0, notified: 0 };
  }

  const state = readState();
  const notifiedSet = pruneNotified(fetched.watches, new Set(state.notified));
  const fresh = newlyChangedWatches(fetched.watches, notifiedSet);
  const outcome: PollOutcome = { ok: true, status: fetched.status, watches: fetched.watches.length, newlyChanged: fresh.length, notified: 0 };

  if (fresh.length && !notificationsSupported()) {
    outcome.reason = "unsupported";
  }

  for (const question of fresh) {
    if (outcome.reason === "unsupported") break;
    const verdict = restraintVerdict(DEFAULT_RESTRAINT, now, state.sent);
    if (verdict.allow === false) {
      outcome.suppressed = verdict.reason;
      break; // the question stays un-notified and is retried next pass
    }
    const text = watchNotificationText(question);
    const notification = new Notification({ title: text.title, body: text.body, silent: false });
    notification.on("click", openResearchDesk);
    notification.show();
    state.sent.push(now);
    notifiedSet.add(question);
    outcome.notified += 1;
  }

  state.notified = [...notifiedSet];
  state.sent = state.sent.filter((t) => t > now - 2 * 60 * 60 * 1000);
  writeState(state);
  return outcome;
}

export function startWatchLoop(): void {
  if (timer) return;
  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      await pollWatches();
    } finally {
      inFlight = false;
    }
  };
  timer = setInterval(() => { void tick(); }, WATCH_POLL_INTERVAL_MS);
  // Do not block startup on the first pass, but do run it soon.
  setTimeout(() => { void tick(); }, 15_000).unref();
}

export function stopWatchLoop(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function watchLoopRunning(): boolean {
  return timer !== null;
}
