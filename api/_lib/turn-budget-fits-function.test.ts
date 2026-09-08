/**
 * THE TURN MUST FIT INSIDE THE FUNCTION THAT RUNS IT.
 *
 * chat-handler plans a turn of TOTAL_CHAT_BUDGET_MS and spends it across
 * engine attempts, fallbacks and a final trace that records what happened.
 * The ceiling on that time is set somewhere else entirely — vercel.json — and
 * until 2026-09-08 nothing connected the two. api/chat.ts was the only
 * long-running function in the file with no maxDuration at all, while
 * generate-office was pinned to 300s and pipeline to 180s.
 *
 * The failure mode is not a slow turn. It is a SILENT one:
 *
 *   +4.4s   · Chose anthropic/claude-opus-5 via openrouter to run it.
 *   +114.7s · anthropic/claude-opus-5 via openrouter failed (HTTP 500).
 *   (nothing after it)
 *
 * chat-handler's catch writes an api.chat failed row on any throw. It never
 * ran, because the process was gone. So the turn the user watched fail left
 * no record that it failed — invisible to the failure digest, invisible to
 * the reference lookup, and reported to the person as "the connection died".
 *
 * A budget larger than its own ceiling cannot be observed from inside the
 * process it kills. Only a check like this one, outside both, can see it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
const handler = readFileSync(new URL("./chat-handler.ts", import.meta.url), "utf8");

function plannedTurnMs(): number {
  const match = /const TOTAL_CHAT_BUDGET_MS = ([\d_]+);/.exec(handler);
  assert.ok(match, "could not read TOTAL_CHAT_BUDGET_MS out of chat-handler — the shape changed; update this gate");
  return Number(match[1].replace(/_/g, ""));
}

test("[was-red] the chat function is allowed at least the turn it plans", () => {
  const planned = plannedTurnMs();
  const pinned = vercel?.functions?.["api/chat.ts"]?.maxDuration;

  assert.equal(typeof pinned, "number",
    "api/chat.ts must pin maxDuration in vercel.json — an unpinned function takes the platform default, "
    + "which is not stated anywhere in this repository and has been below the planned turn");

  const plannedSeconds = planned / 1000;
  assert.ok(pinned >= plannedSeconds,
    `the turn plans ${plannedSeconds}s but the function is capped at ${pinned}s: `
    + "the process dies mid-turn and the catch that records the failure never runs, "
    + "so the turn is invisible to every gate that reads failures");

  /*
   * Margin, not just fit. The planned turn is what the handler spends on
   * ENGINE work; the request still has to arrive, resolve a session, read a
   * budget and write its terminal trace around that. A ceiling equal to the
   * plan leaves nothing for the record of what went wrong, which is the part
   * that matters when it does.
   */
  assert.ok(pinned >= plannedSeconds + 30,
    `only ${pinned - plannedSeconds}s of margin around a ${plannedSeconds}s turn — `
    + "leave room for the terminal trace, or a turn that overruns dies unrecorded");
});

test("every function that plans long work says how long it may take", () => {
  /*
   * api/chat.ts was unpinned while its two long-running siblings were not.
   * The asymmetry is the bug: nothing here forces a new long function to
   * declare itself, so this names the ones we know and requires a number.
   */
  for (const path of ["api/chat.ts", "api/generate-office.ts", "api/pipeline.ts"]) {
    const pinned = vercel?.functions?.[path]?.maxDuration;
    assert.equal(typeof pinned, "number", `${path} runs model work and must pin its own maxDuration`);
    assert.ok(pinned > 0 && pinned <= 300, `${path} maxDuration ${pinned} is outside the plausible range`);
  }
});
