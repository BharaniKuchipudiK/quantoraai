/**
 * WHAT THE PLATFORM IS ACTUALLY BEING USED FOR, AND WHAT IT COSTS.
 *
 * The usage table has carried model, provider, workspace mode, tokens and
 * whether the deployment's own key paid since migration 0001. The admin screen
 * asked it nothing, so three questions an owner needs daily had no answer:
 * which models people reach for, what each workspace costs, and whether one
 * account is quietly burning the shared key.
 *
 * Two rules run through everything here, both learned the same week:
 *
 *   1. A NUMBER NOBODY CAN ACT ON IS DECORATION. Every figure is grouped by
 *      something an owner can change -- a model they can derank, a workspace
 *      they can cap, an account they can talk to.
 *
 *   2. TOKENS ARE NOT DOLLARS, AND MUST NOT BE DRESSED AS THEM. OpenRouter
 *      exposes one lifetime total for the whole key and Gemini exposes
 *      nothing, so per-model cost in real currency does not exist to be
 *      shown. Server-key tokens are the honest proxy, and the field names say
 *      so rather than implying a precision the data does not have.
 */

/** How recently a turn counts someone as still here. */
export const ACTIVE_WINDOW_MINUTES = 15;

export type UsageFact = {
  userSub?: string | null;
  modelId?: string | null;
  provider?: string | null;
  studioMode?: string | null;
  tokensEst?: number | null;
  latencyMs?: number | null;
  usedServerKey?: boolean;
  at?: string | null;
};

export type ModelUse = {
  modelId: string;
  turns: number;
  /** Turns the deployment's own key paid for — the ones that cost the owner. */
  serverKeyTurns: number;
  /** Estimated tokens on server-key turns only. A proxy for spend, never dollars. */
  serverKeyTokens: number;
  users: number;
  /** Share of all turns in the window, whole percent. */
  sharePercent: number;
};

export type WorkspaceUse = {
  workspace: string;
  turns: number;
  serverKeyTokens: number;
  users: number;
  /** The model reached for most often in this workspace. */
  topModel: string | null;
};

export type SpendConcentration = {
  /** Truncated: enough to spot one account dominating, not a roster to paste. */
  account: string;
  serverKeyTurns: number;
  serverKeyTokens: number;
  /** Share of all server-key tokens in the window, whole percent. */
  sharePercent: number;
};

export type WorkspaceAnalytics = {
  windowHours: number;
  turns: number;
  serverKeyTurns: number;
  serverKeyTokens: number;
  /** Distinct accounts with a turn anywhere in the window. */
  activeUsers: number;
  /**
   * Distinct accounts with a turn in the last ACTIVE_WINDOW_MINUTES.
   *
   * NOT concurrency. Nothing here observes a live session -- there is no
   * heartbeat and no presence channel -- so a number labelled "concurrent
   * users" would be invented. This is what the data can honestly support:
   * how many different people were doing something recently.
   */
  recentlyActiveUsers: number;
  recentWindowMinutes: number;
  models: ModelUse[];
  workspaces: WorkspaceUse[];
  spendConcentration: SpendConcentration[];
  truncated: boolean;
  headline: string;
};

const WORKSPACE_WORDS: Record<string, string> = {
  build: "Build",
  ask: "Ask",
  plan: "Plan",
};

export function workspaceWords(mode: string | null | undefined): string {
  const key = String(mode || "").trim();
  if (!key) return "unrecorded";
  return WORKSPACE_WORDS[key] || key;
}

/**
 * An account label short enough to be safe in a screenshot and long enough to
 * tell two students apart. The full subject id stays in the database: the
 * dashboard's job is to show that spend is concentrated, not to be a roster.
 */
export function accountLabel(sub: string | null | undefined): string {
  const value = String(sub || "").trim();
  if (!value) return "unattributed";
  return value.length <= 8 ? value : `${value.slice(0, 8)}…`;
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function summarizeWorkspaceUse(
  rows: UsageFact[] = [],
  windowHours = 24,
  { truncated = false, now = Date.now() }: { truncated?: boolean; now?: number } = {},
): WorkspaceAnalytics {
  const list = Array.isArray(rows) ? rows : [];
  const recentCutoff = now - ACTIVE_WINDOW_MINUTES * 60_000;

  const byModel = new Map<string, { turns: number; serverTurns: number; serverTokens: number; users: Set<string> }>();
  const byWorkspace = new Map<string, { turns: number; serverTokens: number; users: Set<string>; models: Map<string, number> }>();
  const byAccount = new Map<string, { serverTurns: number; serverTokens: number }>();
  const allUsers = new Set<string>();
  const recentUsers = new Set<string>();

  let serverKeyTurns = 0;
  let serverKeyTokens = 0;

  for (const row of list) {
    const model = String(row?.modelId || "").trim() || "(unrecorded)";
    const workspace = workspaceWords(row?.studioMode);
    const sub = String(row?.userSub || "").trim();
    const onServerKey = row?.usedServerKey === true;
    /* Tokens are only counted where the platform paid. A BYOK turn spends the
     * user's own key and belongs in no cost figure of the owner's. */
    const tokens = onServerKey ? Math.max(0, Number(row?.tokensEst) || 0) : 0;

    if (onServerKey) {
      serverKeyTurns += 1;
      serverKeyTokens += tokens;
    }

    const m = byModel.get(model) || { turns: 0, serverTurns: 0, serverTokens: 0, users: new Set<string>() };
    m.turns += 1;
    if (onServerKey) { m.serverTurns += 1; m.serverTokens += tokens; }
    if (sub) m.users.add(sub);
    byModel.set(model, m);

    const w = byWorkspace.get(workspace) || { turns: 0, serverTokens: 0, users: new Set<string>(), models: new Map<string, number>() };
    w.turns += 1;
    w.serverTokens += tokens;
    if (sub) w.users.add(sub);
    w.models.set(model, (w.models.get(model) || 0) + 1);
    byWorkspace.set(workspace, w);

    if (sub) {
      allUsers.add(sub);
      const at = Date.parse(String(row?.at || ""));
      if (Number.isFinite(at) && at >= recentCutoff) recentUsers.add(sub);
      if (onServerKey) {
        const a = byAccount.get(sub) || { serverTurns: 0, serverTokens: 0 };
        a.serverTurns += 1;
        a.serverTokens += tokens;
        byAccount.set(sub, a);
      }
    }
  }

  const models: ModelUse[] = [...byModel.entries()]
    .map(([modelId, v]) => ({
      modelId,
      turns: v.turns,
      serverKeyTurns: v.serverTurns,
      serverKeyTokens: v.serverTokens,
      users: v.users.size,
      sharePercent: percent(v.turns, list.length),
    }))
    .sort((a, b) => b.turns - a.turns || a.modelId.localeCompare(b.modelId))
    .slice(0, 8);

  const workspaces: WorkspaceUse[] = [...byWorkspace.entries()]
    .map(([workspace, v]) => ({
      workspace,
      turns: v.turns,
      serverKeyTokens: v.serverTokens,
      users: v.users.size,
      topModel: [...v.models.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null,
    }))
    .sort((a, b) => b.turns - a.turns || a.workspace.localeCompare(b.workspace));

  /*
   * Ranked by tokens, not turns: a handful of long build turns can outspend a
   * hundred short questions, and the question this answers is who is costing
   * the owner money -- not who is chattiest.
   */
  const spendConcentration: SpendConcentration[] = [...byAccount.entries()]
    .map(([sub, v]) => ({
      account: accountLabel(sub),
      serverKeyTurns: v.serverTurns,
      serverKeyTokens: v.serverTokens,
      sharePercent: percent(v.serverTokens, serverKeyTokens),
    }))
    .sort((a, b) => b.serverKeyTokens - a.serverKeyTokens || b.serverKeyTurns - a.serverKeyTurns)
    .slice(0, 5);

  const top = models[0];
  const headline = list.length === 0
    ? `No turns recorded in the last ${windowHours}h.`
    : `${list.length} turn(s) from ${allUsers.size} account(s) in ${windowHours}h`
      + (top ? `; most used: ${top.modelId} (${top.sharePercent}%)` : "")
      + (serverKeyTurns ? `. ${serverKeyTurns} on the platform's key.` : ". None on the platform's key.")
      + (truncated ? " Window cut at the row cap — these are floors." : "");

  return {
    windowHours,
    turns: list.length,
    serverKeyTurns,
    serverKeyTokens,
    activeUsers: allUsers.size,
    recentlyActiveUsers: recentUsers.size,
    recentWindowMinutes: ACTIVE_WINDOW_MINUTES,
    models,
    workspaces,
    spendConcentration,
    truncated: Boolean(truncated) && list.length > 0,
    headline,
  };
}
