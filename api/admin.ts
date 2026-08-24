import feedback from "./_lib/handlers/admin-feedback.js";
import metrics from "./_lib/handlers/admin-metrics.js";
import models from "./_lib/handlers/admin-models.js";

/**
 * Single admin entrypoint for Vercel Hobby function budget.
 * Rewrites map /api/admin/{feedback,metrics,models} → /api/admin?route=…
 */
export default async function handler(req: any, res: any) {
  const route = String(req.query?.route || "").trim();
  if (route === "feedback") return feedback(req, res);
  if (route === "metrics") return metrics(req, res);
  if (route === "models") return models(req, res);
  return res.status(404).json({ error: "Unknown admin route." });
}
