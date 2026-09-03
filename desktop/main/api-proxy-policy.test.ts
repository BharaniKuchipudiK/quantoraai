import test from "node:test";
import assert from "node:assert/strict";
import { downstreamHeaders, isApiPath, methodHasBody, upstreamHeaders, upstreamUrl } from "./api-proxy-policy.ts";

test("only /api paths are proxied", () => {
  assert.equal(isApiPath("/api"), true);
  assert.equal(isApiPath("/api/chat"), true);
  assert.equal(isApiPath("/apis"), false);
  assert.equal(isApiPath("/assets/api.js"), false);
  assert.equal(isApiPath("/"), false);
});

test("the upstream URL keeps path and query and swaps only the origin", () => {
  assert.equal(
    upstreamUrl("https://quantoraai.app/", "quantora://app/api/chat?stream=1"),
    "https://quantoraai.app/api/chat?stream=1",
  );
});

test("request headers cross only from the allowlist, and the bearer is attached by the host", () => {
  const out = upstreamHeaders(
    [
      ["Content-Type", "application/json"],
      ["X-Quantora-Gemini-Key", "byok"],
      ["Cookie", "quantora_session=stolen"],
      ["Authorization", "Bearer from-the-page"],
      ["Origin", "quantora://app"],
    ],
    "host-token",
  );
  assert.deepEqual(out, {
    "content-type": "application/json",
    "x-quantora-gemini-key": "byok",
    authorization: "Bearer host-token",
  });
  assert.equal("cookie" in out, false, "a page cannot smuggle a cookie");
});

test("without a stored token no Authorization header is sent at all", () => {
  assert.deepEqual(upstreamHeaders([["Authorization", "Bearer page"]], null), {});
});

test("response headers drop cookies, encodings and CORS but keep content-type and SSE cache hints", () => {
  const out = downstreamHeaders([
    ["Content-Type", "text/event-stream"],
    ["Cache-Control", "no-cache"],
    ["Set-Cookie", "quantora_session=x; HttpOnly"],
    ["Content-Encoding", "br"],
    ["Content-Length", "123"],
    ["Access-Control-Allow-Origin", "https://quantoraai.app"],
    ["Strict-Transport-Security", "max-age=1"],
    ["X-Quantora-Correlation-Id", "abc"],
  ]);
  assert.deepEqual(out, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "x-quantora-correlation-id": "abc",
  });
});

test("GET and HEAD carry no body; everything else does", () => {
  assert.equal(methodHasBody("GET"), false);
  assert.equal(methodHasBody("head"), false);
  assert.equal(methodHasBody("POST"), true);
  assert.equal(methodHasBody("DELETE"), true);
});
