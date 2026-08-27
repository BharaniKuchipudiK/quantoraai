import { applyCors } from "../rate-limit.js";
import { authProvidersStatus } from "../auth-env.js";

/**
 * Which sign-in methods are configured on this deployment.
 * Also returns the public Google client id when only GOOGLE_CLIENT_ID is set
 * server-side (Vite bakes VITE_* at build time; this closes that gap).
 */
export default async function handler(req: any, res: any) {
  applyCors(req, res, "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json(authProvidersStatus());
}
