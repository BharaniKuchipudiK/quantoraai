import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { resolveSignInAccount } from "./auth-response.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => fs.readFileSync(path.join(here, relative), "utf8");

/*
 * THE LOCKOUT OF 2026-09-03.
 *
 * The owner's account was created with Google. The Google OAuth client was
 * later deleted in the Cloud Console, so `401: deleted_client` met every
 * Google sign-in. Every other door then refused too, and each one pointed at
 * the door that was broken:
 *
 *   GitHub          -> 409 "Sign in with Google instead" (sub was github:<id>)
 *   Create account  -> 409 email already exists
 *   Email + password-> no password hash on a provider account
 *   Forgot password -> provider notice, never a reset link
 *
 * Four controls, one reachable outcome: nobody could open their own account.
 * A provider outage must not be a total account lockout, so a provider-VERIFIED
 * email now opens the account it already owns.
 */

const GOOGLE_ACCOUNT = {
  google_sub: "104455566677788899900",
  auth_provider: "google",
  blocked_at: null,
  blocked_reason: null,
} as const;

test("a first-time email signs in as itself", () => {
  const decision = resolveSignInAccount({
    existing: null,
    identity: { sub: "github:12345", emailVerified: true },
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.ok && decision.accountSub, "github:12345");
  assert.equal(decision.ok && decision.linked, false);
});

test("the same provider returning is not a link", () => {
  const decision = resolveSignInAccount({
    existing: GOOGLE_ACCOUNT,
    identity: { sub: GOOGLE_ACCOUNT.google_sub, emailVerified: true },
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.ok && decision.accountSub, GOOGLE_ACCOUNT.google_sub);
  assert.equal(decision.ok && decision.linked, false);
});

test("GitHub opens a Google-created account when GitHub verified the email", () => {
  const decision = resolveSignInAccount({
    existing: GOOGLE_ACCOUNT,
    identity: { sub: "github:987654", emailVerified: true },
  });
  assert.equal(decision.ok, true, "a verified email must not be locked out by a dead provider");
  assert.equal(decision.ok && decision.linked, true);
  /*
   * The session is issued for the EXISTING sub, not the GitHub one. Everything
   * a person owns — published_sites, usage, outcome_states, product_events —
   * is keyed by that sub, so linking to a fresh sub would hand them an empty
   * account that merely looked like a successful sign-in.
   */
  assert.equal(
    decision.ok && decision.accountSub,
    GOOGLE_ACCOUNT.google_sub,
    "must resolve to the stored account so its history stays attached",
  );
});

test("an unverified email may not claim an existing account", () => {
  for (const emailVerified of [undefined, false]) {
    const decision = resolveSignInAccount({
      existing: GOOGLE_ACCOUNT,
      identity: { sub: "github:987654", emailVerified },
    });
    assert.equal(decision.ok, false, `emailVerified=${String(emailVerified)} must be refused`);
    assert.equal(decision.ok === false && decision.status, 409);
    assert.match(decision.ok === false ? decision.error : "", /Google/i);
  }
});

test("a suspended account is refused even with a verified email", () => {
  const decision = resolveSignInAccount({
    existing: { ...GOOGLE_ACCOUNT, blocked_at: "2026-09-01T00:00:00Z", blocked_reason: "Abuse" },
    identity: { sub: "github:987654", emailVerified: true },
  });
  assert.equal(decision.ok, false, "linking must never launder a suspension");
  assert.equal(decision.ok === false && decision.status, 403);
  assert.equal(decision.ok === false && decision.error, "Abuse");
});

/*
 * The rule above is only load-bearing if the OAuth handlers actually say the
 * email was verified. If a handler drops that field, every cross-provider
 * sign-in silently returns to 409 and the lockout is back — with all of the
 * unit tests above still green. So the handlers are part of the contract.
 */
test("both OAuth handlers declare their email verified, and only after checking", () => {
  const google = read("handlers/auth-verify.ts");
  assert.match(google, /emailVerified:\s*true/, "Google sign-in must declare verification");
  assert.match(
    google,
    /email_verified === false/,
    "Google may only declare it because it rejects unverified addresses first",
  );

  const github = read("handlers/auth-github-callback.ts");
  assert.match(github, /emailVerified:\s*true/, "GitHub sign-in must declare verification");
  assert.match(
    github,
    /entry\?\.verified/,
    "GitHub may only declare it because it keeps verified addresses only",
  );
});

test("password paths never declare a provider-verified email", () => {
  /*
   * Email/password callers pass the account's own stored sub, so they never
   * need linking. Declaring verification there would let a signup form claim
   * an address the person cannot prove they own.
   */
  for (const file of ["handlers/auth-login.ts", "handlers/auth-signup.ts", "handlers/auth-password-reset-confirm.ts"]) {
    assert.doesNotMatch(read(file), /emailVerified/, `${file} must not declare provider verification`);
  }
});
