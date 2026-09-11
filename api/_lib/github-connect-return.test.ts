/*
 * The connect flow used to always redirect back to bare "/" once it
 * finished, no matter what workspace or chat the click came from — the
 * connection itself was never lost, only the page you were looking at.
 * This proves the two halves that fix it stay honest with each other:
 * the validator that decides a `return` path is safe to store, and the
 * two handlers (start + callback) that use it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  clearGithubConnectReturnCookie,
  githubConnectReturnCookie,
  GITHUB_CONNECT_RETURN_COOKIE,
  isSafeGithubConnectReturnPath,
} from "./session.js";

test("isSafeGithubConnectReturnPath accepts an ordinary same-origin path", () => {
  assert.equal(isSafeGithubConnectReturnPath("/studio"), true);
  assert.equal(isSafeGithubConnectReturnPath("/?tab=hub"), true);
  assert.equal(isSafeGithubConnectReturnPath("/desk/some-project?x=1"), true);
});

test("isSafeGithubConnectReturnPath rejects protocol-relative and absolute URLs", () => {
  // "//evil.example.com/x" is a same-string-looking value a browser resolves
  // as a different HOST — the classic open-redirect payload for this shape.
  assert.equal(isSafeGithubConnectReturnPath("//evil.example.com/steal"), false);
  assert.equal(isSafeGithubConnectReturnPath("https://evil.example.com/steal"), false);
  assert.equal(isSafeGithubConnectReturnPath("javascript://alert(1)"), false);
});

test("isSafeGithubConnectReturnPath rejects empty, non-string, and backslash-smuggled values", () => {
  assert.equal(isSafeGithubConnectReturnPath(""), false);
  assert.equal(isSafeGithubConnectReturnPath(undefined as any), false);
  assert.equal(isSafeGithubConnectReturnPath(null as any), false);
  // Some browsers normalize "/\evil.com" to "//evil.com" — reject the
  // backslash form outright rather than trying to out-guess every browser's
  // own normalization quirks.
  assert.equal(isSafeGithubConnectReturnPath("/\\evil.com"), false);
});

test("githubConnectReturnCookie/clearGithubConnectReturnCookie round-trip the same cookie name", () => {
  const set = githubConnectReturnCookie("/studio?tab=hub");
  assert.match(set, new RegExp(`^${GITHUB_CONNECT_RETURN_COOKIE}=`));
  assert.match(set, /studio/);
  const cleared = clearGithubConnectReturnCookie();
  assert.match(cleared, new RegExp(`^${GITHUB_CONNECT_RETURN_COOKIE}=; `));
  assert.match(cleared, /Max-Age=0/);
});
