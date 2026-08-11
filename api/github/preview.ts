import { applyCors, clientIp, isRateLimited } from "../_lib/rate-limit.js";
import { buildRepositoryPreview } from "../_lib/repository-preview.js";

const RATE_LIMIT_PER_MINUTE = 10;

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (isRateLimited(`github-preview:${clientIp(req)}`, RATE_LIMIT_PER_MINUTE, 60_000)) {
    return res.status(429).json({ error: "Too many repository previews. Please wait a minute and try again." });
  }

  try {
    const { repoUrl, task } = req.body || {};
    if (typeof repoUrl !== "string") return res.status(400).json({ error: "GitHub repository URL is required." });
    // Public repositories only for the MVP. A shared server token must never
    // grant one user access to private repositories owned by another user.
    const preview = await buildRepositoryPreview(repoUrl, task);
    return res.status(200).json(preview);
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Could not prepare the repository preview." });
  }
}
