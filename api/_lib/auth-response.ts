import { createSessionToken, setSessionCookie, isSessionConfigured } from "./session.js";
import { isAdminUser, recordSignIn, type StoredUser } from "./store.js";

export type AuthIdentity = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  authProvider: string;
  geo?: { countryCode: string; region?: string | null; city?: string | null } | null;
};

export function formatClientUser(input: {
  name: string;
  email: string;
  picture?: string;
  authProvider: string;
  isAdmin?: boolean;
}) {
  return {
    name: input.name || "Creator",
    email: input.email,
    avatar: input.picture
      || `https://ui-avatars.com/api/?name=${encodeURIComponent(input.name || "Creator")}&background=f97316&color=ffffff&bold=true`,
    authProvider: input.authProvider,
    tier: "Indie Creator ($0 / mo)",
    joinedDate: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    isAdmin: input.isAdmin === true,
  };
}

export async function issueSessionResponse(
  res: any,
  identity: AuthIdentity,
  reqGeo?: AuthIdentity["geo"],
): Promise<{ ok: true; body: ReturnType<typeof formatClientUser> } | { ok: false; status: number; error: string }> {
  if (!isSessionConfigured()) {
    return { ok: false, status: 503, error: "Sign-in is not configured on this deployment." };
  }

  const stored: StoredUser | null = await recordSignIn({
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    picture: identity.picture || "",
    geo: reqGeo || identity.geo || null,
  });

  if (stored?.blocked_at) {
    return {
      ok: false,
      status: 403,
      error: stored.blocked_reason || "This account has been suspended.",
    };
  }

  const token = createSessionToken({
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    picture: identity.picture || "",
  });
  if (!token) {
    return { ok: false, status: 503, error: "Sign-in is not configured on this deployment." };
  }

  setSessionCookie(res, token);
  const isAdmin = await isAdminUser(identity.sub);
  return {
    ok: true,
    body: formatClientUser({
      name: identity.name,
      email: identity.email,
      picture: identity.picture,
      authProvider: identity.authProvider,
      isAdmin: isAdmin === true,
    }),
  };
}
