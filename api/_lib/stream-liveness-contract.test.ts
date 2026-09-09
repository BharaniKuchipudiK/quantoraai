import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { stripNonCode } from "../../src/lib/wiring-audit.js";

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

/*
 * RAW is what a human reads; SOURCE is what this test reasons about.
 *
 * Everything below walks braces and matches identifiers. Doing that on raw
 * text means a `{` inside a string, a template literal, a regex or one of this
 * file's long block comments moves the walker, and a name mentioned in a
 * comment counts as code. stripNonCode is the repository's own answer to that
 * — the same function the wiring gate uses, and the one that fixed
 * audit:lonely this morning when it was counting comments as callers.
 *
 * It blanks what it removes rather than deleting it, so every index in SOURCE
 * is the same index in RAW. It does NOT preserve newlines inside block
 * comments, so LINE NUMBERS must be counted in RAW. The assertion below pins
 * the offset property, because everything here is wrong by exactly one
 * comment if it ever stops holding.
 */
const RAW = readFileSync(join(HERE, "chat-handler.ts"), "utf8");
const SOURCE = stripNonCode(RAW);
assert.equal(SOURCE.length, RAW.length, "stripNonCode must blank in place, or every index below is wrong");

/** The 1-based line of an index, counted in the text a human would read. */
const lineOf = (index: number) => RAW.slice(0, index).split("\n").length;

/** The two ways this handler waits on a provider stream. */
const READERS = ["readWithIdleTimeout", "nextAsyncIteratorWithIdleTimeout"];

/** Call sites of `name(`, with their argument text, ignoring the definition. */
function callSites(source: string, name: string) {
  const sites: Array<{ line: number; index: number; args: string }> = [];
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
      line: lineOf(match.index),
      index: match.index,
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

/** The body of the block starting at `open` (the index of its `{`). */
function blockBody(source: string, open: number) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return "";
}

/** The catch block belonging to the try that encloses `index`, or null. */
function enclosingCatch(source: string, index: number) {
  const before = source.slice(0, index);
  const openedTry = before.lastIndexOf("try {");
  if (openedTry < 0) return null;
  /* A catch between that try and the read means the try already closed. */
  if (/\}\s*catch\s*\(/.test(before.slice(openedTry))) return null;

  const brace = source.indexOf("{", openedTry);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        const after = source.slice(i, i + 200);
        const m = /^\}\s*catch\s*\([^)]*\)\s*\{/.exec(after);
        if (!m) return null;
        return blockBody(source, i + m[0].length - 1);
      }
    }
  }
  return null;
}

test("every bounded read converts AND cleans up in the catch that encloses it", () => {
  /*
   * THE ASSERTION THIS FILE WAS MISSING, AND THEN GOT WRONG.
   *
   * Bounding a read by the no-content window makes the window the thing that
   * usually expires — and the helpers reject with a plain Error: no status,
   * and the word "idle". shouldFallbackBeforeStreaming matches neither, so the
   * outer handler calls it a non-retryable 500 and the client never retries,
   * with the upstream stream left open.
   *
   * The first cut of this test searched a 2,500-character window after each
   * read for a catch, a conversion and a cleanup — INDEPENDENTLY. Codex found
   * what that lets through: at the Gemini streaming read, the catch that
   * actually handled an idle expiry converted it and threw WITHOUT returning
   * the iterator, and the only `iterator.return()` nearby belonged to a
   * separate attempt-budget branch that this path never takes. Three unrelated
   * places answered three unrelated questions and the site read as protected
   * while it leaked its iterator on the commonest abandonment path there is.
   *
   * A window is not a scope. This walks braces from the try that encloses the
   * read to its matching catch, and asks for both properties INSIDE THAT
   * BLOCK — which is the only place that runs when this read throws.
   */
  const unhandled: string[] = [];

  for (const reader of READERS) {
    for (const site of callSites(SOURCE, reader)) {
      const body = enclosingCatch(SOURCE, site.index);
      if (body === null) {
        unhandled.push(`  api/_lib/chat-handler.ts:${site.line}  ${reader}(...) is not inside a try/catch at all.`);
        continue;
      }
      const converts = /inferenceNoContent\s*\(/.test(body);
      const cleansUp = /\.cancel\(\)|\.return\?\.\(/.test(body);
      if (!converts || !cleansUp) {
        unhandled.push(
          `  api/_lib/chat-handler.ts:${site.line}  ${reader}(...) `
          + `its own catch [convert:${converts ? "y" : "N"} cleanup:${cleansUp ? "y" : "N"}]`,
        );
      }
    }
  }

  assert.deepEqual(
    unhandled,
    [],
    `\n${unhandled.join("\n")}\n\n  The catch that encloses the read must do BOTH, because it is the only\n`
    + "  code that runs when that read throws: cancel the reader or return the\n"
    + "  iterator, and throw inferenceNoContent (504) so the ladder falls back\n"
    + "  instead of stopping on a statusless error.\n",
  );
});


test("EVERY opener is bounded by the content window, counted not sampled", () => {
  /*
   * THIS ASSERTION WAS ITSELF THE BUG, AND THAT IS THE WHOLE LESSON.
   *
   * The first version ran .exec() for one openRemainingMs and asserted that it
   * existed. .exec() returns the FIRST match. chat-handler.ts has THREE
   * openGeminiStream call sites; exactly one carried the deadline, so the test
   * found that one and went green while the other two — the entire tool-calling
   * path, which is the common path — opened Gemini with no signal at all.
   *
   * A user's trace on 2026-09-09 measured what that cost: one of those openers
   * held for 69.4 SECONDS against a 25-second content window, while the
   * OpenRouter attempt beside it in the same turn stopped at 25.3s exactly. The
   * contrast between those two numbers in one trace is what finally named it.
   *
   * Same class, third occurrence, and the reason it survived twice is that the
   * gate proved a bound EXISTED instead of proving every call site HAD one.
   * That is CLAUDE.md §4 — a check that cannot fail — written by the person who
   * had just quoted §4 while writing it.
   *
   * So this enumerates. It walks every opener, and it fails when it finds none,
   * because a parse that matches nothing must never read as a clean run.
   */
  const unbounded: string[] = [];

  /*
   * Gemini's opener can only be interrupted through the signal it is handed, so
   * the property must be present AND the controller behind it must be armed by
   * a timer derived from NO_CONTENT_MS. A signal nothing fires bounds nothing.
   */
  const geminiSites = callSites(SOURCE, "openGeminiStream");
  assert.ok(
    geminiSites.length > 0,
    "found no openGeminiStream call sites — the parse broke, and a gate that matches nothing is not a clean run",
  );

  for (const site of geminiSites) {
    const signal = /signal:\s*([A-Za-z0-9_.]+)/.exec(site.args);
    if (!signal) {
      unbounded.push(
        `  line ${site.line}: openGeminiStream is called with no signal, so nothing can `
        + `interrupt it. This is the exact shape that held a route for 69.4s.`,
      );
      continue;
    }

    // Follow the signal to its controller, and the controller to its timer.
    const controller = signal[1].replace(/\.signal$/, "");
    const armed = new RegExp(
      `setTimeout\\(\\s*\\(\\)\\s*=>\\s*${controller}\\.abort\\(\\)\\s*,\\s*([A-Za-z0-9_]+)`,
    ).exec(SOURCE);
    if (!armed) {
      unbounded.push(
        `  line ${site.line}: its signal comes from ${controller}, which nothing aborts on a `
        + `timer. An AbortSignal that never fires is decoration.`,
      );
      continue;
    }

    const deadline = new RegExp(`const\\s+${armed[1]}\\s*=\\s*([\\s\\S]{0,220}?);`).exec(SOURCE);
    if (!deadline || !/NO_CONTENT_MS/.test(deadline[1])) {
      unbounded.push(
        `  line ${site.line}: its deadline ${armed[1]} is not derived from NO_CONTENT_MS, so a `
        + `route that never returns a stream holds far more than the content window.`,
      );
    }
  }

  // OpenRouter: the timeout handed to its opener, which the helper otherwise clamps to 55s.
  let openRouterBounds = 0;
  for (const match of SOURCE.matchAll(/timeoutMs:\s*([^,\n]+)/g)) {
    openRouterBounds += 1;
    if (!/NO_CONTENT_MS/.test(match[1])) {
      unbounded.push(
        `  openOpenRouterResponse is given timeoutMs: ${match[1].trim()} — not the content `
        + "window, so its helper clamps it to as much as 55s of silence.",
      );
    }
  }
  assert.ok(
    openRouterBounds > 0,
    "found no timeoutMs handed to the OpenRouter opener — the parse broke",
  );

  assert.deepEqual(
    unbounded,
    [],
    `\n${unbounded.join("\n")}\n\n  ${geminiSites.length} Gemini openers and ${openRouterBounds} OpenRouter `
    + "openers were checked. Bound the OPEN with Math.min(NO_CONTENT_MS, remaining\n"
    + "  budget) at EVERY one of them. A route that has not produced a stream inside\n"
    + "  the content window is dead by the same definition as one that stopped\n"
    + "  producing tokens.\n",
  );
});
