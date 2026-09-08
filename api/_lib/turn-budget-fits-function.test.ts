/**
 * THE TURN MUST FIT INSIDE THE FUNCTION THAT ACTUALLY RUNS IT.
 *
 * chat-handler plans a turn of TOTAL_CHAT_BUDGET_MS and spends it across
 * engine attempts, fallbacks, and a final catch that records what happened.
 * The ceiling on that time is set in vercel.json, and nothing connected the
 * two numbers.
 *
 * THE FUNCTION IS NOT THE ROUTE. /api/chat is a rewrite to
 * /api/pipeline?route=chat, so the file that runs a chat turn is pipeline.ts
 * and there is no api/chat.ts at all. The first version of this gate was
 * written against api/chat.ts, asserted its maxDuration was a number, and
 * PASSED -- because the same change had just added that key to vercel.json.
 * It validated a pin on a file that does not exist, which Vercel rejects
 * outright, and the deployment failed. A gate that never asks whether the
 * thing it is measuring exists will happily confirm an invention.
 *
 * So this resolves the rewrite the way the platform does, and requires the
 * destination to be a real file on disk before it will believe any number
 * attached to it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repo = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const vercel = JSON.parse(readFileSync(repo("vercel.json"), "utf8"));
const handler = readFileSync(repo("api/_lib/chat-handler.ts"), "utf8");

/** Follow /api/chat through the rewrites to the function file that serves it. */
function functionServingChat(): string {
  const rewrite = (vercel.rewrites || []).find((r: any) => r?.source === "/api/chat");
  assert.ok(rewrite, "no rewrite for /api/chat — routing changed; update this gate rather than deleting it");
  const dest = String(rewrite.destination || "").split("?")[0].replace(/^\//, "");
  for (const ext of [".ts", ".js", ".mjs"]) {
    if (existsSync(repo(dest + ext))) return dest + ext;
  }
  assert.fail(`/api/chat rewrites to ${dest}, but no such function file exists`);
}

function plannedTurnMs(): number {
  const match = /const TOTAL_CHAT_BUDGET_MS = ([\d_]+);/.exec(handler);
  assert.ok(match, "could not read TOTAL_CHAT_BUDGET_MS out of chat-handler — the shape changed; update this gate");
  return Number(match[1].replace(/_/g, ""));
}

test("[was-red] every pinned function is a file that exists", () => {
  /*
   * The rule that would have caught the broken deployment. Vercel refuses a
   * functions pattern matching nothing, so a typo or a rewritten route takes
   * the whole site down at build time -- and nothing in this repo noticed,
   * because the pin was checked and the file never was.
   */
  for (const path of Object.keys(vercel.functions || {})) {
    assert.ok(existsSync(repo(path)), `vercel.json pins "${path}", which does not exist — Vercel rejects the deployment`);
  }
});

test("[was-red] the function serving a chat turn is allowed more time than the turn plans", () => {
  const file = functionServingChat();
  const planned = plannedTurnMs() / 1000;
  const pinned = vercel?.functions?.[file]?.maxDuration;

  assert.equal(typeof pinned, "number",
    `${file} serves /api/chat and must pin maxDuration — an unpinned function takes a platform default `
    + "stated nowhere in this repository");

  assert.ok(pinned >= planned,
    `the turn plans ${planned}s but ${file} is capped at ${pinned}s: the process dies mid-turn and the catch `
    + "that records the failure never runs, so the turn is invisible to every gate that reads failures");

  /*
   * Margin, not a bare fit. The planned turn is what the handler spends on
   * ENGINE work; the request still has to arrive, resolve a session, read a
   * budget and write its terminal trace around that. At 180s the margin was
   * 15 seconds for all of it, and the record of what went wrong is written
   * last -- exactly when a turn that overran has least room left.
   */
  assert.ok(pinned >= planned + 60,
    `only ${pinned - planned}s of margin around a ${planned}s turn in ${file} — the terminal trace is written `
    + "after the engine work, so a turn that overruns dies unrecorded");
});
