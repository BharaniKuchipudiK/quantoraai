/**
 * A TURN NOBODY IS WAITING FOR MUST STOP.
 *
 * The client aborts its fetch when its own attempt times out, then starts a
 * new request. Aborting a fetch does NOT stop a serverless function, and
 * nothing here ever asked whether the browser was still there — so the
 * handler kept climbing its engine ladder for a connection that was gone.
 *
 * Production, 2026-09-08. One reference id, two turns:
 *
 *   +0.0s    Quantora received the request.        <- request 1
 *   +62.0s   Quantora received the request.        <- request 2, 1 still running
 *   +114.3s  gemini failed        (request 1)
 *   +131.1s  sonnet-5 failed      (request 2)
 *   +165.6s  opus-5 failed        (request 2)
 *   +166.0s  the server ended the turn             <- request 2
 *   +175.7s  the server ended the turn             <- request 1
 *
 * Two ladders, four paid engine calls, one person waiting 176 seconds, and a
 * bill for both. Every client retry spawned another orphan that ran to
 * completion — which is why adding retries made this worse, not better.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const handler = readFileSync(new URL("./chat-handler.ts", import.meta.url), "utf8");
const writer = readFileSync(new URL("./sse-writer.ts", import.meta.url), "utf8");

test("[was-red] the writer can tell when the browser is gone", () => {
  /* The capability existed the whole time. Nothing asked it. */
  assert.match(writer, /get isFinished\(\) \{[\s\S]*writableEnded === true \|\| this\.res\.destroyed === true/,
    "isFinished must reflect a destroyed or ended response, not just an internal flag");
});

test("[was-red] no further engine is called once the client has gone", () => {
  assert.match(handler, /if \(sse\.isFinished && index > 0\) \{/,
    "the attempt ladder must check for a dead connection before starting another engine");

  /*
   * `index > 0` is deliberate, and the reason is worth keeping. The FIRST
   * attempt runs before anything is written, so isFinished is meaningless
   * there; guarding it would abort every turn before it began.
   */
  assert.doesNotMatch(handler, /if \(sse\.isFinished\) \{\s*\n\s*trace\(\{/,
    "an unguarded check would abort the first attempt of every turn");

  assert.match(handler, /code: 'CLIENT_GONE'/, "and it must be a named outcome, not a generic failure");
  assert.match(handler, /status: 499/, "499 — the client closed the request, which is not a server fault");
});

test("the abandonment is recorded, so it can be counted rather than guessed at", () => {
  /*
   * Without a row for this, an orphan turn is invisible: it never reaches the
   * user, so it produces no complaint, and the money is spent silently. It is
   * traced as 'abandoned' rather than 'failed' because nothing was wrong with
   * the engine — the audience left.
   */
  const start = handler.indexOf("if (sse.isFinished && index > 0) {");
  const block = handler.slice(start, start + 800);
  assert.match(block, /state: 'abandoned'/, "an abandoned attempt is not a failed one");
  assert.match(block, /detailCode: 'client-gone'/, "and the reason is named");
});

test("[was-red] a turn that is already streaming is NOT cut off", () => {
  /*
   * The regression this could cause. A turn that has produced tokens may
   * finish even if the socket looks unhealthy — the desk can still use what
   * came back. The check sits between ATTEMPTS, never inside the stream loop.
   */
  const readLoop = handler.slice(handler.indexOf("const reader = response.body.getReader()"));
  assert.doesNotMatch(readLoop.slice(0, 3_000), /if \(sse\.isFinished && index > 0\)/,
    "the disconnect check must not appear inside the streaming read loop");
});
