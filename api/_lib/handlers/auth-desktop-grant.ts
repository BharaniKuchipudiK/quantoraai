import { applyCors, clientIp, isRateLimited } from "../rate-limit.js";
import { getSessionUser } from "../session.js";
import { readStoredUser } from "../store.js";
import { oauthOrigin } from "../app-origin.js";
import { createDesktopGrantCode } from "../desktop-auth.js";
import {
  DESKTOP_AUTH_QUERY,
  buildDesktopCallbackUrl,
  isValidDesktopAuthState,
  isValidPkceChallenge,
} from "../../../shared/desktop-contract.js";

/*
 * Step 1 of a desktop sign-in (docs/architecture/desktop-client-v1.md §4).
 *
 * The desktop opens this URL in the system browser with a PKCE challenge and
 * an opaque state. Two outcomes:
 *
 *   signed in (cookie present)  → mint a grant code bound to the challenge and
 *                                 hand it back on the quantora:// deep link.
 *   not signed in               → bounce to the web app with the same params;
 *                                 the app signs the user in with any existing
 *                                 provider and returns here (desktop-auth-handoff.js).
 *
 * The response is a tiny HTML page rather than a bare 302: browsers prompt
 * before following a redirect into a custom scheme, and the user needs a
 * visible "return to the app" link when the prompt is dismissed. No inline
 * script — the page must satisfy the app CSP as served by vercel.json.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function returnPage(callbackUrl: string): string {
  const href = escapeHtml(callbackUrl);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${href}">
<title>Return to Quantora Desktop</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  main{max-width:28rem;padding:2rem;text-align:center}
  a{display:inline-block;margin-top:1.25rem;padding:.75rem 1.25rem;border-radius:.5rem;background:#f97316;color:#fff;text-decoration:none;font-weight:600}
  p{color:#a3a3a3;line-height:1.5}
</style>
</head>
<body>
<main>
  <h1>Signed in</h1>
  <p>You can return to Quantora Desktop. If it did not open on its own, use the button below, then close this tab.</p>
  <a href="${href}" data-quantora-desktop-return="true">Open Quantora Desktop</a>
</main>
</body>
</html>`;
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Cache-Control", "no-store");

  const challenge = String(req.query?.[DESKTOP_AUTH_QUERY.challenge] || "");
  const state = String(req.query?.[DESKTOP_AUTH_QUERY.state] || "");
  if (!isValidPkceChallenge(challenge) || !isValidDesktopAuthState(state)) {
    return res.status(400).json({ error: "Malformed desktop sign-in request. Start again from the desktop app." });
  }

  if (isRateLimited(`desktop-grant:${clientIp(req)}`, 20, 60_000)) {
    return res.status(429).json({ error: "Too many sign-in attempts. Please wait a minute." });
  }

  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    const params = new URLSearchParams({
      [DESKTOP_AUTH_QUERY.flag]: "1",
      [DESKTOP_AUTH_QUERY.challenge]: challenge,
      [DESKTOP_AUTH_QUERY.state]: state,
    });
    return res.redirect(302, `${oauthOrigin(req)}/?${params.toString()}`);
  }

  const stored = await readStoredUser(sessionUser.sub);
  if (stored?.blocked_at) {
    return res.status(403).json({ error: stored.blocked_reason || "This account has been suspended." });
  }

  const code = createDesktopGrantCode(sessionUser, challenge);
  if (!code) {
    return res.status(503).json({ error: "Sign-in is not configured on this deployment." });
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).end(returnPage(buildDesktopCallbackUrl({ code, state })));
}
