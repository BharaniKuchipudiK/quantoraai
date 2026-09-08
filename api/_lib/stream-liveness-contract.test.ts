import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * ---------------------------------------------------------------------------
 * EVERY STREAM READ IS BOUNDED BY CONTENT, NOT BY BYTES.
 *
 * A build turn burned 176 seconds and returned nothing. One attempt ran 89.7s
 * against a 90s budget on a route that had a 20-second idle guard the whole
 * time, because the guard measured the wrong thing:
 *
 *   if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
 *
 * OpenRouter keeps a queued request warm with ": OPENROUTER PROCESSING"
 * comments. The parser skips them — but they arrive as BYTES, and a byte-based
 * idle timer treats them as life. A route producing nothing looks continuously
 * healthy until the budget runs out.
 *
 * THIS TEST EXISTS BECAUSE THE FIRST FIX ONLY FIXED HALF OF THEM.
 *
 * chat-handler.ts has FOUR stream read sites, not two. The production trace
 * pointed at the first two, so those got nextReadBudgetMs and the other two
 * were never looked at — the Gemini tool-calling turn and the OpenRouter
 * refine pass kept the original bare-constant idle, and kept the identical
 * `startsWith('data: ')` skip beside it. The commit that shipped that fix said
 * "Gemini carried the identical guard one function away and is fixed with it —
 * repairing only the gateway that happened to fail is how this returns wearing
 * another name." It then did exactly that, one scope further down the file.
 *
 * Reading one trace and fixing what it names is how a class stays open. This
 * counts the sites instead, so a fifth one cannot be added bare and a repaired
 * one cannot quietly regress.
 *
 * PRECISE (§5): it fails on one unambiguous thing — an idle budget that is not
 * derived from nextReadBudgetMs, which is the only function that knows when
 * content last arrived. It says nothing about how long any budget should be.
 * ---------------------------------------------------------------------------
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "chat-handler.ts"), "utf8");

/** The two ways this handler waits on a provider stream. */
const READERS = ["readWithIdleTimeout", "nextAsyncIteratorWithIdleTimeout"];

/** Call sites of `name(`, with their argument text, ignoring the definition. */
function callSites(source: string, name: string) {
  const sites: Array<{ line: number; args: string }> = [];
  const re = new RegExp(`(?<!function\\s)\\b${name}\\s*\\(`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    // Skip the declaration itself.
    const before = source.slice(Math.max(0, match.index - 40), match.index);
    if (/\b(async\s+)?function\s+$/.test(before)) continue;

    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < source.length && depth > 0; i += 1) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") depth -= 1;
    }
    sites.push({
      line: source.slice(0, match.index).split("\n").length,
      args: source.slice(match.index + match[0].length, i - 1),
    });
  }
  return sites;
}

test("every provider stream read is bounded by time since the last CONTENT token", () => {
  const bare: string[] = [];
  let total = 0;

  for (const reader of READERS) {
    for (const site of callSites(SOURCE, reader)) {
      total += 1;
      if (!/nextReadBudgetMs\s*\(/.test(site.args)) {
        bare.push(
          `  api/_lib/chat-handler.ts:${site.line}  ${reader}(...) waits on a budget that `
          + `does not come from nextReadBudgetMs — it cannot tell a queued route from a `
          + `live one, so provider keepalives read as progress.`,
        );
      }
    }
  }

  assert.ok(total >= 4, `expected to find the stream read sites; found ${total}`);
  assert.deepEqual(
    bare,
    [],
    `\n${bare.join("\n")}\n\n  Pass nextReadBudgetMs({ now, lastContentAt, attemptStartedAt,\n`
    + "  attemptBudgetMs, idleMs }) and set lastContentAt = Date.now() only where a\n"
    + "  token is actually appended to the reply.\n",
  );
});

test("every content budget reads a timestamp that something actually advances", () => {
  /*
   * nextReadBudgetMs is only honest if something moves the timestamp it reads.
   * A budget computed from a value nobody updates is a fixed deadline wearing
   * the name of a liveness check — it would abandon a HEALTHY stream mid-answer
   * exactly NO_CONTENT_MS after it started, however well it was answering.
   *
   * The four loops are in four scopes and so use four different variables;
   * naming them all `lastContentAt` would shadow, not share. So this follows
   * each budget to the variable IT reads, and asks whether that one is ever
   * advanced — which is the property, where a name match is only a proxy for it.
   */
  const budgets = [...SOURCE.matchAll(/nextReadBudgetMs\s*\(\s*\{([^}]*)\}/g)];
  assert.ok(budgets.length >= 4, `expected every stream read to be content-bounded; found ${budgets.length}`);

  const unmoved: string[] = [];
  const seen = new Set<string>();
  for (const budget of budgets) {
    /* Both spellings: `lastContentAt: toolLastContentAt` and the ES6 shorthand
     * `lastContentAt`, which the first two loops use. */
    const named = /\blastContentAt\s*(?::\s*([A-Za-z_$][\w$]*))?\s*[,}]/.exec(`${budget[1]}}`);
    assert.ok(named, `a nextReadBudgetMs call passes no lastContentAt:\n${budget[1]}`);
    const variable = named![1] || "lastContentAt";
    if (seen.has(variable)) continue;
    seen.add(variable);
    const advanced = new RegExp(`\\b${variable}\\s*=\\s*Date\\.now\\(\\)`).test(SOURCE);
    if (!advanced) unmoved.push(`  ${variable} is read as a content clock but never advanced.`);
  }

  assert.deepEqual(
    unmoved,
    [],
    `\n${unmoved.join("\n")}\n\n  Set it to Date.now() where a token is appended to the reply —\n`
    + "  and only there. Advancing it on any received chunk restores the exact\n"
    + "  byte-counting bug this bound replaced.\n",
  );
});

test("every bounded read converts its own expiry instead of stopping the ladder", () => {
  /*
   * THE ASSERTION THIS FILE WAS MISSING, AND THE BUG IT LET THROUGH.
   *
   * Bounding a read by the no-content window means the WINDOW is what usually
   * expires — and readWithIdleTimeout / nextAsyncIteratorWithIdleTimeout reject
   * with a plain Error: no status, and the word "idle".
   * shouldFallbackBeforeStreaming tests status against a list of codes and the
   * message against a list of words that includes "timeout" but not "idle", so
   * it returns false: the outer handler calls it a non-retryable 500, the
   * client never retries, and the upstream stream is left open.
   *
   * Codex caught this on the streaming pair. I fixed it there and then shipped
   * it again in the tool-calling and refine loops, in the same change that
   * claimed to close the class — because the two tests above ask only whether
   * the budget is content-derived and whether its clock moves. Neither asks
   * what happens when the read they bound actually expires. Tightening a
   * deadline without handling the deadline is a net loss: the repair for a
   * 90-second silence becomes a turn that gives up entirely.
   *
   * So: every read site must sit in a try whose catch cancels the stream and
   * converts the rejection to a typed timeout.
   */
  /* `} catch (` — a catch BLOCK, never a promise's .catch() method. */
  const CATCH_BLOCK = /\}\s*catch\s*\(/;
  const unhandled: string[] = [];

  for (const reader of READERS) {
    for (const site of callSites(SOURCE, reader)) {
      const at = SOURCE.split("\n").slice(0, site.line).join("\n").length;
      const before = SOURCE.slice(Math.max(0, at - 3000), at);
      const after = SOURCE.slice(at, at + 2500);

      /*
       * Inside a try, checked properly rather than by proximity. The first cut
       * looked for `try {` within 400 characters and reported the OpenRouter
       * streaming loop as unguarded — its try sits behind a long comment and
       * the pre-read stop check. The code was right and the test was wrong,
       * which is the §3 mistake in miniature. Now: find the LAST `try {`
       * before the call, and require no `catch (` between it and the call,
       * which is what "still inside that try" actually means.
       */
      const openedTry = before.lastIndexOf("try {");
      /*
       * A real catch block follows a closing brace: `} catch (`. Matching
       * /\bcatch\s*\(/ instead also matched `.catch(() => {})` — the
       * reader-cancel on the line above — because \b matches after a dot, so
       * the guarded loop read as unguarded. The test was wrong twice about
       * the same site before it was right about the two that were.
       */
      const guarded = openedTry >= 0 && !CATCH_BLOCK.test(before.slice(openedTry));
      const catches = CATCH_BLOCK.test(after);
      const converts = /inferenceNoContent\s*\(/.test(after);
      const cleansUp = /\.cancel\(\)|\.return\?\.\(/.test(after);

      if (!(guarded && catches && converts && cleansUp)) {
        unhandled.push(
          `  api/_lib/chat-handler.ts:${site.line}  ${reader}(...) `
          + `[try:${guarded ? "y" : "N"} catch:${catches ? "y" : "N"} `
          + `convert:${converts ? "y" : "N"} cleanup:${cleansUp ? "y" : "N"}]`,
        );
      }
    }
  }

  assert.deepEqual(
    unhandled,
    [],
    `\n${unhandled.join("\n")}\n\n  A bounded read that rejects bare is read as a 500 the client will not\n`
    + "  retry, and its stream stays open. Wrap the read: cancel the reader or\n"
    + "  return the iterator, then throw inferenceNoContent (504) when the\n"
    + "  content window expired, or inferenceAttemptTimeout when the budget did.\n",
  );
});
