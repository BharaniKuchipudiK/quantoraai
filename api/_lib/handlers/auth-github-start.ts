import { randomBytes } from "node:crypto";
import { applyCors } from "../rate-limit.js";
import { appOrigin } from "../app-origin.js";

const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";

export default async function handler(req: any, res: any) {
  applyCors(req, res, "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const clientId = process.env.GITHUB_CLIENT_ID || process.env.VITE_GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: "GitHub sign-in is not configured." });
  }

  const state = randomBytes(16).toString("hex");
  const callback = `${appOrigin()}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    scope: "read:user user:email",
    state,
  });

  res.setHeader(
    "Set-Cookie",
    `quantora_github_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
  );
  return res.redirect(302, `${GITHUB_AUTHORIZE}?${params.toString()}`);
}
