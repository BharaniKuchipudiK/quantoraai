import { applyCors, clientIp, isRateLimited } from "./_lib/rate-limit.js";
import { requireActiveSession } from "./_lib/authz.js";
import { clearSessionCookie } from "./_lib/session.js";
import { deleteUserData, exportUserData, isStoreConfigured } from "./_lib/store.js";

/*
 * Account privacy controls (Roadmap 0.2 — "a user can erase their footprint").
 *
 * One serverless function, two actions:
 *   - export: return everything we store keyed to this account, as JSON.
 *   - delete: hard-delete the account footprint (cascades living memory + site
 *     ownership, anonymizes usage). Live published sites are left running.
 *
 * Unlike the fire-and-forget bookkeeping in store.ts, these fail loud: a
 * privacy action that silently no-ops is worse than an honest error.
 */
export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // Tight limit — these are deliberate, low-frequency actions.
  if (isRateLimited(`account:${clientIp(req)}`, 20, 60_000)) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;

  if (!isStoreConfigured()) {
    return res.status(503).json({ error: "Data controls are unavailable right now. Please try again later." });
  }

  const action = String(req.body?.action || "");

  if (action === "export") {
    const data = await exportUserData(sessionUser.sub);
    if (!data) {
      return res.status(503).json({ error: "Could not assemble your data export. Please try again." });
    }
    res.setHeader("Content-Disposition", 'attachment; filename="quantora-my-data.json"');
    return res.status(200).json(data);
  }

  if (action === "delete") {
    // Guard against an accidental one-click wipe: require explicit confirmation.
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: "Deletion must be explicitly confirmed." });
    }
    const ok = await deleteUserData(sessionUser.sub);
    if (!ok) {
      return res.status(503).json({ error: "Could not delete your data. Nothing was changed — please try again." });
    }
    // The account no longer exists; end the session so nothing keeps using it.
    clearSessionCookie(res);
    return res.status(200).json({ deleted: true });
  }

  return res.status(400).json({ error: "Unknown action. Use 'export' or 'delete'." });
}
