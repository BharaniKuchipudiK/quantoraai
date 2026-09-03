import test from "node:test";
import assert from "node:assert/strict";
import {
  createDesktopGrantCode,
  pkceChallengeFromVerifier,
  verifyDesktopGrantCode,
} from "./desktop-auth.ts";
import { createSessionToken, readSessionToken } from "./session.ts";
import { DESKTOP_GRANT_TTL_SECONDS } from "../../shared/desktop-contract.js";

const SECRET = "desktop-auth-test-secret-that-is-long-enough-000";
const USER = { sub: "google-sub-42", email: "creator@example.com", name: "Creator", picture: "" };
// 64 unreserved characters — a valid RFC 7636 verifier.
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk0123456789abcdefghijk";
const NOW = 1_800_000_000;

function withSecret(fn: () => void) {
  const prev = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = SECRET;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prev;
  }
}

test("a grant code round-trips to the same user when the verifier matches the challenge", () => {
  withSecret(() => {
    const code = createDesktopGrantCode(USER, pkceChallengeFromVerifier(VERIFIER), NOW);
    assert.ok(code, "code minted");
    const result = verifyDesktopGrantCode(code, VERIFIER, NOW + 5);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.user, USER);
  });
});

test("a wrong verifier is rejected even though the code is genuine", () => {
  withSecret(() => {
    const code = createDesktopGrantCode(USER, pkceChallengeFromVerifier(VERIFIER), NOW)!;
    const other = VERIFIER.replace(/k$/, "K");
    const result = verifyDesktopGrantCode(code, other, NOW + 5);
    assert.deepEqual(result, { ok: false, reason: "verifier" });
  });
});

test("a code is single-use inside one process", () => {
  withSecret(() => {
    const code = createDesktopGrantCode(USER, pkceChallengeFromVerifier(VERIFIER), NOW)!;
    assert.equal(verifyDesktopGrantCode(code, VERIFIER, NOW + 1).ok, true);
    assert.deepEqual(verifyDesktopGrantCode(code, VERIFIER, NOW + 2), { ok: false, reason: "used" });
  });
});

test("a code expires after the grant TTL", () => {
  withSecret(() => {
    const code = createDesktopGrantCode(USER, pkceChallengeFromVerifier(VERIFIER), NOW)!;
    const late = verifyDesktopGrantCode(code, VERIFIER, NOW + DESKTOP_GRANT_TTL_SECONDS + 1);
    assert.deepEqual(late, { ok: false, reason: "expired" });
  });
});

test("a tampered payload fails the signature check before anything else", () => {
  withSecret(() => {
    const code = createDesktopGrantCode(USER, pkceChallengeFromVerifier(VERIFIER), NOW)!;
    const [prefix, body, sig] = code.split(".");
    const forged = Buffer.from(JSON.stringify({
      ...JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")),
      email: "admin@example.com",
    })).toString("base64url");
    const result = verifyDesktopGrantCode(`${prefix}.${forged}.${sig}`, VERIFIER, NOW + 1);
    assert.deepEqual(result, { ok: false, reason: "signature" });
  });
});

test("a grant code is never accepted as a session token, and vice versa", () => {
  withSecret(() => {
    const code = createDesktopGrantCode(USER, pkceChallengeFromVerifier(VERIFIER), NOW)!;
    assert.equal(readSessionToken(code), null, "three-part grant code rejected as a session");

    const session = createSessionToken(USER)!;
    const result = verifyDesktopGrantCode(session, VERIFIER, NOW);
    assert.deepEqual(result, { ok: false, reason: "malformed" }, "two-part session rejected as a grant");
  });
});

test("malformed inputs and a short verifier are rejected without throwing", () => {
  withSecret(() => {
    assert.deepEqual(verifyDesktopGrantCode(undefined, VERIFIER, NOW), { ok: false, reason: "malformed" });
    assert.deepEqual(verifyDesktopGrantCode("dg.x", VERIFIER, NOW), { ok: false, reason: "malformed" });
    const code = createDesktopGrantCode(USER, pkceChallengeFromVerifier(VERIFIER), NOW)!;
    assert.deepEqual(verifyDesktopGrantCode(code, "too-short", NOW), { ok: false, reason: "malformed" });
    assert.equal(createDesktopGrantCode(USER, "not-a-challenge", NOW), null);
  });
});

test("everything fails closed when SESSION_SECRET is missing", () => {
  const prev = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  try {
    assert.equal(createDesktopGrantCode(USER, pkceChallengeFromVerifier(VERIFIER), NOW), null);
    assert.deepEqual(verifyDesktopGrantCode("dg.a.b", VERIFIER, NOW), { ok: false, reason: "unconfigured" });
  } finally {
    if (prev !== undefined) process.env.SESSION_SECRET = prev;
  }
});
