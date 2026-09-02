import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, getSessionUser } from "./session.ts";

/*
 * Two carriers, one token. The desktop client cannot hold the cookie, so the
 * same HMAC session travels as `Authorization: Bearer`. These tests pin the
 * property the design depends on: both carriers resolve to the same user,
 * and neither carrier loosens verification.
 */

const SECRET = "session-bearer-test-secret-that-is-long-enough-00";
const USER = { sub: "sub-1", email: "one@example.com", name: "One", picture: "" };

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

test("cookie and bearer carriers resolve to the same user", () => {
  withSecret(() => {
    const token = createSessionToken(USER)!;
    const viaCookie = getSessionUser({ headers: { cookie: `quantora_session=${token}` } });
    const viaBearer = getSessionUser({ headers: { authorization: `Bearer ${token}` } });
    assert.deepEqual(viaCookie, USER);
    assert.deepEqual(viaBearer, USER);
  });
});

test("a tampered bearer token is rejected exactly like a tampered cookie", () => {
  withSecret(() => {
    const token = createSessionToken(USER)!;
    const [body, sig] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), sub: "sub-2" })).toString("base64url");
    const forged = `${forgedBody}.${sig}`;
    assert.equal(getSessionUser({ headers: { authorization: `Bearer ${forged}` } }), null);
    assert.equal(getSessionUser({ headers: { cookie: `quantora_session=${forged}` } }), null);
  });
});

test("a valid cookie wins over a bad bearer header, and a bad cookie falls through to a good bearer", () => {
  withSecret(() => {
    const token = createSessionToken(USER)!;
    const both = getSessionUser({ headers: { cookie: `quantora_session=${token}`, authorization: "Bearer nonsense" } });
    assert.deepEqual(both, USER);
    const fallthrough = getSessionUser({ headers: { cookie: "quantora_session=stale.value", authorization: `Bearer ${token}` } });
    assert.deepEqual(fallthrough, USER);
  });
});

test("non-Bearer authorization schemes and malformed headers are ignored", () => {
  withSecret(() => {
    const token = createSessionToken(USER)!;
    assert.equal(getSessionUser({ headers: { authorization: `Basic ${token}` } }), null);
    assert.equal(getSessionUser({ headers: { authorization: `Bearer ${token} extra` } }), null);
    assert.equal(getSessionUser({ headers: { authorization: "Bearer" } }), null);
    assert.equal(getSessionUser({ headers: {} }), null);
  });
});
