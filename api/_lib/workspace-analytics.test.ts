/**
 * The dashboard's numbers decide where the owner spends attention and money,
 * so the failure that matters is not a crash: it is a confident figure that
 * points at the wrong model, the wrong workspace, or the wrong student.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACTIVE_WINDOW_MINUTES, accountLabel, summarizeWorkspaceUse } from "./workspace-analytics.js";

const NOW = Date.parse("2026-09-08T12:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const turn = (over: Partial<Parameters<typeof summarizeWorkspaceUse>[0][number]> = {}) => ({
  userSub: "u1",
  modelId: "gemini-2.5-flash",
  provider: "gemini",
  studioMode: "build",
  tokensEst: 100,
  usedServerKey: true,
  at: ago(5),
  ...over,
});

test("[was-red] a BYOK turn never lands in the owner's cost figures", () => {
  /*
   * A turn on the user's own key spends the user's money. Counted as spend it
   * inflates every cost number on the screen and can rank a model or a
   * student as expensive when they have cost the owner nothing at all --
   * exactly the signal an owner on borrowed money acts on first.
   */
  const digest = summarizeWorkspaceUse([
    turn({ usedServerKey: true, tokensEst: 500 }),
    turn({ userSub: "byok-user", usedServerKey: false, tokensEst: 9_000 }),
  ], 24, { now: NOW });

  assert.equal(digest.turns, 2, "both turns still happened");
  assert.equal(digest.serverKeyTurns, 1);
  assert.equal(digest.serverKeyTokens, 500, "the 9,000 BYOK tokens are not the owner's spend");
  assert.equal(digest.spendConcentration.length, 1, "and the BYOK account is in no spend ranking");
  assert.equal(digest.spendConcentration[0].sharePercent, 100);
});

test("spend is ranked by tokens, not by how chatty someone is", () => {
  /*
   * A handful of long build turns can outspend a hundred short questions. The
   * question this answers is who is costing the owner money, so ranking by
   * turn count would name the wrong person.
   */
  const rows = [
    ...Array.from({ length: 40 }, () => turn({ userSub: "chatty", tokensEst: 10 })),
    turn({ userSub: "expensive", tokensEst: 5_000 }),
  ];
  const digest = summarizeWorkspaceUse(rows, 24, { now: NOW });
  assert.equal(digest.spendConcentration[0].account, accountLabel("expensive"));
  assert.equal(digest.spendConcentration[1].account, accountLabel("chatty"));
  assert.ok(digest.spendConcentration[0].sharePercent > 90);
});

test("[was-red] recent activity is what the data supports, and is not called concurrency", () => {
  /*
   * Nothing here observes a live session -- no heartbeat, no presence channel
   * -- so a figure labelled "concurrent users" would be invented. This counts
   * distinct accounts with a turn inside the recent window, and the window is
   * reported alongside so the number cannot be read as something stronger.
   */
  const digest = summarizeWorkspaceUse([
    turn({ userSub: "here-now", at: ago(2) }),
    turn({ userSub: "also-here", at: ago(ACTIVE_WINDOW_MINUTES - 1) }),
    turn({ userSub: "long-gone", at: ago(ACTIVE_WINDOW_MINUTES + 60) }),
  ], 24, { now: NOW });

  assert.equal(digest.activeUsers, 3, "all three were active in the window");
  assert.equal(digest.recentlyActiveUsers, 2, "only two recently");
  assert.equal(digest.recentWindowMinutes, ACTIVE_WINDOW_MINUTES, "the window travels with the number");
});

test("models and workspaces are ranked, and each workspace names its own top model", () => {
  const digest = summarizeWorkspaceUse([
    turn({ studioMode: "build", modelId: "claude-sonnet" }),
    turn({ studioMode: "build", modelId: "claude-sonnet" }),
    turn({ studioMode: "build", modelId: "gemini-2.5-flash" }),
    turn({ studioMode: "ask", modelId: "gemini-2.5-flash" }),
  ], 24, { now: NOW });

  assert.equal(digest.models[0].modelId, "claude-sonnet");
  assert.equal(digest.models[0].turns, 2);
  assert.equal(digest.workspaces[0].workspace, "Build");
  assert.equal(digest.workspaces[0].topModel, "claude-sonnet");
  assert.equal(digest.workspaces[1].workspace, "Ask");
  assert.equal(digest.workspaces[1].topModel, "gemini-2.5-flash");
});

test("an account is labelled short enough for a screenshot, and an empty window says so", () => {
  assert.equal(accountLabel("1234567890abcdef"), "12345678…", "the full subject id stays in the database");
  assert.equal(accountLabel(""), "unattributed");
  assert.equal(accountLabel(null), "unattributed");

  const empty = summarizeWorkspaceUse([], 24, { now: NOW });
  assert.equal(empty.turns, 0);
  assert.match(empty.headline, /No turns recorded/);
  assert.equal(empty.truncated, false, "an empty read is not a cut one");
  assert.match(summarizeWorkspaceUse([turn()], 24, { truncated: true, now: NOW }).headline, /floors/);
});

test("[was-red] the analytics are wired to something an operator can read", () => {
  /*
   * A summariser nothing calls is the shape this repo has shipped repeatedly.
   * Every hop, from the query to the rendered panel.
   */
  const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  assert.match(store, /export async function readRecentUsage/);
  const start = store.indexOf("export async function readRecentUsage");
  const body = store.slice(start, store.indexOf("\n}", start));
  assert.match(body, /if \(!response\) return null;/, "an unanswered store must return null, never an empty list that reads as a quiet day");

  const handler = readFileSync(new URL("./handlers/admin-metrics.ts", import.meta.url), "utf8");
  assert.match(handler, /readRecentUsage\(/, "the window must be read");
  assert.match(handler, /summarizeWorkspaceUse\(/, "and summarised");
  assert.match(handler, /workspaceUse: \{ \.\.\.workspaceUse, source: usageSource \}/, "and returned to the dashboard with its provenance");

  const dashboard = readFileSync(new URL("../../src/components/AdminDashboard.jsx", import.meta.url), "utf8");
  assert.match(dashboard, /workspaceUse=\{metrics\.workspaceUse\}/, "the dashboard must hand it to the panel");
  const panel = readFileSync(new URL("../../src/components/TechnicalAnalyticsPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /<WorkspaceUseSection workspaceUse=\{workspaceUse\}/, "and the panel must place it — importing is not rendering");
});
