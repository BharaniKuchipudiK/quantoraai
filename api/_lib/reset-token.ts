import { createHmac, timingSafeEqual } from "node:crypto";

const RESET_TTL_SECONDS = 60 * 60; // 1 hour

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function getSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

function sign(data: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(data).digest());
}

export function createPasswordResetToken(email: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payload = {
    purpose: "password-reset",
    email: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + RESET_TTL_SECONDS,
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

export function readPasswordResetToken(token: string | null | undefined): { email: string } | null {
  const secret = getSecret();
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, presentedSig] = parts;
  const expectedSig = sign(body, secret);
  const a = Buffer.from(presentedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromBase64url(body).toString("utf8"));
    if (payload?.purpose !== "password-reset") return null;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.email || typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
