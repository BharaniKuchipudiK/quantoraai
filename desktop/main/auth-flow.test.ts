import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  PENDING_SIGN_IN_TTL_MS,
  createPendingSignIn,
  deepLinkFromArgv,
  grantUrlFor,
  matchDeepLink,
} from "./auth-flow.ts";
import { isValidPkceChallenge, isValidPkceVerifier } from "../../shared/desktop-contract.js";

test("a pending sign-in carries RFC 7636 material and its challenge is the S256 of its verifier", () => {
  const pending = createPendingSignIn(1000);
  assert.equal(isValidPkceVerifier(pending.verifier), true);
  assert.equal(isValidPkceChallenge(pending.challenge), true);
  const expected = createHash("sha256").update(pending.verifier, "ascii").digest("base64url");
  assert.equal(pending.challenge, expected);
  assert.notEqual(createPendingSignIn().state, pending.state, "state is fresh per attempt");
});

test("the grant URL targets the API origin's grant route with exactly challenge and state", () => {
  const pending = createPendingSignIn();
  const url = new URL(grantUrlFor("https://quantoraai.app/", pending));
  assert.equal(url.origin, "https://quantoraai.app");
  assert.equal(url.pathname, "/api/auth/desktop/grant");
  assert.deepEqual([...url.searchParams.keys()].sort(), ["challenge", "state"]);
  assert.equal(url.searchParams.get("challenge"), pending.challenge);
  assert.equal(url.searchParams.get("state"), pending.state);
});

test("only the callback with the matching state completes the pending attempt", () => {
  const pending = createPendingSignIn(1000);
  const good = `quantora://auth/callback?code=dg.a.b&state=${pending.state}`;
  assert.deepEqual(matchDeepLink(good, pending, 2000), { ok: true, code: "dg.a.b" });

  assert.deepEqual(matchDeepLink(`quantora://auth/callback?code=dg.a.b&state=someone-elses-state`, pending, 2000), { ok: false, reason: "state-mismatch" });
  assert.deepEqual(matchDeepLink(good, null, 2000), { ok: false, reason: "no-pending" });
  assert.deepEqual(matchDeepLink(good, pending, 1000 + PENDING_SIGN_IN_TTL_MS + 1), { ok: false, reason: "expired" });
  assert.deepEqual(matchDeepLink(`quantora://auth/callback?state=${pending.state}`, pending, 2000), { ok: false, reason: "malformed" });
  assert.deepEqual(matchDeepLink("quantora://app/?code=x&state=y", pending, 2000), { ok: false, reason: "not-callback" });
  assert.deepEqual(matchDeepLink("https://evil.example/auth/callback?code=x&state=y", pending, 2000), { ok: false, reason: "not-callback" });
  assert.deepEqual(matchDeepLink("::not a url::", pending, 2000), { ok: false, reason: "malformed" });
});

test("a deep link is picked out of argv and anything else is ignored", () => {
  assert.equal(deepLinkFromArgv(["/usr/bin/quantora", "--flag", "quantora://auth/callback?code=x&state=y"]), "quantora://auth/callback?code=x&state=y");
  assert.equal(deepLinkFromArgv(["/usr/bin/quantora", "https://quantoraai.app"]), null);
  assert.equal(deepLinkFromArgv([]), null);
});
