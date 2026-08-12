import { applyCors, clientIp, isRateLimited } from "./_lib/rate-limit.js";
import { getSessionUser } from "./_lib/session.js";
import { recordProductEvent } from "./_lib/store.js";
import { getRequestGeo } from "./_lib/geo.js";

const ALLOWED_EVENTS = new Set(["preview_opened", "publish_completed"]);

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  if (isRateLimited(`product-event:${clientIp(req)}`, 120, 60_000)) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }

  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    return res.status(401).json({ error: "Sign in to track product events." });
  }

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
