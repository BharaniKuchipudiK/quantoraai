import { applyCors } from "../rate-limit.js";
import { issueSessionResponse } from "../auth-response.js";
import { getRequestGeo } from "../geo.js";
import { appOrigin } from "../app-origin.js";
import { normalizeAuthEmail } from "../auth-privacy.js";
import { resolveGithubOAuthClientId, resolveGithubOAuthClientSecret } from "../auth-env.js";
import { appendSetCookie, clearOAuthStateCookie, OAUTH_STATE_COOKIE } from "../session.js";

function parseCookies(header: unknown): Record<string, string> {
  if (typeof header !== "string") return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

async function exchangeCode(code: string) {
  const clientId = resolveGithubOAuthClientId();
  const clientSecret = resolveGithubOAuthClientSecret();
  if (!clientId || !clientSecret) return null;

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${appOrigin()}/api/auth/github/callback`,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!tokenRes.ok) return null;
  const tokenJson = await tokenRes.json();
  if (!tokenJson?.access_token) return null;

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Quantora-Auth",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();

  const emailsRes = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Quantora-Auth",
    },
    signal: AbortSignal.timeout(8_000),
  });

  let email = "";
  if (emailsRes.ok) {
    const emails = await emailsRes.json();
    const verified = Array.isArray(emails)
      ? emails.filter((entry: any) => entry?.verified && entry?.email)
      : [];
    const primary = verified.find((entry: any) => entry.primary) || verified[0];
    email = normalizeAuthEmail(primary?.email || "");
  }

  if (!user?.id || !email) return null;
  return {
    sub: `github:${user.id}`,
    email,
    name: user.name || user.login || email.split("@")[0],
    picture: user.avatar_url || "",
  };
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const code = String(req.query?.code || "");
  const state = String(req.query?.state || "");
  const cookies = parseCookies(req?.headers?.cookie);
  const expectedState = cookies[OAUTH_STATE_COOKIE];

  appendSetCookie(res, clearOAuthStateCookie());

  if (!code || !state || !expectedState || state !== expectedState) {
    return res.redirect(302, `${appOrigin()}/?auth=error&message=${encodeURIComponent("GitHub sign-in was cancelled.")}`);
  }

  try {
    const identity = await exchangeCode(code);
    if (!identity) {
      return res.redirect(302, `${appOrigin()}/?auth=error&message=${encodeURIComponent("GitHub sign-in failed.")}`);
    }

    const session = await issueSessionResponse(res, {
      sub: identity.sub,
      email: identity.email,
      name: identity.name,
      picture: identity.picture,
      authProvider: "GitHub",
      geo: getRequestGeo(req),
    });
    if (session.ok === false) {
      return res.redirect(302, `${appOrigin()}/?auth=error&message=${encodeURIComponent(session.error)}`);
    }

    return res.redirect(302, `${appOrigin()}/?auth=success`);
  } catch (err: any) {
    console.error("GitHub OAuth callback failed:", err?.message || err);
    return res.redirect(302, `${appOrigin()}/?auth=error&message=${encodeURIComponent("GitHub sign-in failed.")}`);
  }
}
