import test from "node:test";
import assert from "node:assert/strict";
import { appendSetCookie, cookieAttributes, oauthStateCookie } from "./session.ts";

test("production cookies are HttpOnly, SameSite=Lax, and Secure", () => {
  const prevNode = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;
  process.env.NODE_ENV = "production";
  delete process.env.VERCEL;
  try {
    const flags = cookieAttributes(600);
    assert.match(flags, /HttpOnly/);
    assert.match(flags, /SameSite=Lax/);
    assert.match(flags, /Secure/);
    assert.match(oauthStateCookie("abc"), /Secure/);
  } finally {
    process.env.NODE_ENV = prevNode;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  }
});

test("appendSetCookie keeps the OAuth state cookie next to the session cookie", () => {
  const headers = {};
  const res = {
    getHeader(name) {
      return headers[name];
    },
    setHeader(name, value) {
      headers[name] = value;
    },
  };
  appendSetCookie(res, "a=1");
  appendSetCookie(res, "b=2");
  assert.deepEqual(headers["Set-Cookie"], ["a=1", "b=2"]);
});
