import { applyCors, clientIp, isRateLimited } from "./_lib/rate-limit.js";
import { requireActiveSession } from "./_lib/authz.js";
import { getSessionUser } from "./_lib/session.js";
import { recordProductEvent, recordSuggestionEvent } from "./_lib/store.js";
import { getRequestGeo } from "./_lib/geo.js";

const ALLOWED_EVENTS = new Set(["preview_opened", "publish_completed"]);
const SUGGESTION_ACTIONS = new Set(["shown", "accepted", "dismissed"]);

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  if (isRateLimited(`product-event:${clientIp(req)}`, 120, 60_000)) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }

  // Acceptance-Rate tracking (Roadmap 9.1). Proactive suggestions fire during a
  // conversation that may be anonymous, so this path does NOT require an active
  // session — it records the signal against the session user if there is one,
  // else anonymously. It carries no prompt/response text, only surface + action.
  if (req.body?.eventType === "suggestion") {
    const action = String(req.body?.action || "");
    if (!SUGGESTION_ACTIONS.has(action)) {
      return res.status(400).json({ error: "Invalid suggestion action." });
    }
    const surface = String(req.body?.surface || "").slice(0, 60) || "unknown";
    const su = getSessionUser(req);
    recordSuggestionEvent({ userSub: su?.sub ?? null, surface, action: action as any });
    return res.status(202).json({ recorded: true });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;

  const { eventType, metadata } = req.body || {};
  if (!ALLOWED_EVENTS.has(eventType)) {
    return res.status(400).json({ error: "Invalid eventType." });
  }

  const geo = getRequestGeo(req);
  const baseMeta = metadata && typeof metadata === "object" ? metadata : {};

  recordProductEvent({
    userSub: sessionUser.sub,
    eventType,
    metadata: geo
      ? { ...baseMeta, country_code: geo.countryCode, region: geo.region, city: geo.city }
      : baseMeta,
  });

  return res.status(202).json({ recorded: true });
}
