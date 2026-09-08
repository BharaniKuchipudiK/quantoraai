import { applyCors, clientIp, isRateLimited } from "../rate-limit.js";
import { requireActiveSession } from "../authz.js";
import { clearSessionCookie } from "../session.js";
import { deleteUserData, exportUserData, isStoreConfigured } from "../store.js";
import { exportProjectData } from "../project-store.js";

/*
 * Account privacy controls (Roadmap 0.2 — "a user can erase their footprint").
 *
 * One serverless function, two actions:
 *   - export: return everything we store keyed to this account, as JSON.
 *   - delete: hard-delete the account footprint (cascades living memory + site
 *     ownership + Projects, anonymizes usage). Live published sites are left running.
 *
 * Unlike the fire-and-forget bookkeeping in store.ts, these fail loud: a
 * privacy action that silently no-ops is worse than an honest error.
 */
/*
 * The dependencies, injectable — the same shape transaction-trace.ts and
 * user-paid-quota.ts already use for their store calls.
 *
 * Not a testing affectation. Until this existed, the ledger's own note on this
 * journey read: "No test opens the account handler. A deletion that fails
 * silently, or lands on the wrong account, would be found by a user." Every
 * safety property below is one line of code, and every one of them was
 * unguarded: the session-scoped sub, the confirm, the loud failure, the
 * cleared cookie. A handler that cannot be called without a live Postgres and
 * a real OAuth session is a handler nobody tests.
 */
export type AccountHandlerDeps = {
  requireSession: typeof requireActiveSession;
  storeConfigured: typeof isStoreConfigured;
  exportUser: typeof exportUserData;
  exportProjects: typeof exportProjectData;
  deleteUser: typeof deleteUserData;
  clearSession: typeof clearSessionCookie;
  rateLimited: typeof isRateLimited;
  cors: typeof applyCors;
};

const LIVE: AccountHandlerDeps = {
  requireSession: requireActiveSession,
  storeConfigured: isStoreConfigured,
  exportUser: exportUserData,
  exportProjects: exportProjectData,
  deleteUser: deleteUserData,
  clearSession: clearSessionCookie,
  rateLimited: isRateLimited,
  cors: applyCors,
};

export default async function handler(req: any, res: any, deps: AccountHandlerDeps = LIVE) {
  deps.cors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // Tight limit — these are deliberate, low-frequency actions.
  if (deps.rateLimited(`account:${clientIp(req)}`, 20, 60_000)) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }

  const auth = await deps.requireSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;

  if (!deps.storeConfigured()) {
    return res.status(503).json({ error: "Data controls are unavailable right now. Please try again later." });
  }

  const action = String(req.body?.action || "");

  if (action === "export") {
    const [data, projectData] = await Promise.all([
      deps.exportUser(sessionUser.sub),
      deps.exportProjects(sessionUser.sub),
    ]);
    if (!data || !projectData) {
      return res.status(503).json({ error: "Could not assemble your data export. Please try again." });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="quantora-my-data.json"');
    return res.status(200).json({ ...data, ...projectData });
  }

  if (action === "delete") {
    // Guard against an accidental one-click wipe: require explicit confirmation.
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: "Deletion must be explicitly confirmed." });
    }
    const ok = await deps.deleteUser(sessionUser.sub);
    if (!ok) {
      return res.status(503).json({ error: "Could not delete your data. Nothing was changed — please try again." });
    }
    // The account no longer exists; end the session so nothing keeps using it.
    deps.clearSession(res);
    return res.status(200).json({ deleted: true });
  }

  return res.status(400).json({ error: "Unknown action. Use 'export' or 'delete'." });
}
