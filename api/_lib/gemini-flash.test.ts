import assert from "node:assert/strict";
import test from "node:test";
import {
  rankGeminiFlashIds,
  isRetiredModelError,
  withNewestGeminiFlash,
  UserFacingError,
} from "./gemini-flash.js";
import { runResearchDeepDive } from "./research-deep-dive.js";

/**
 * The 2026-09-02 incident, verbatim: the model list still returned
 * gemini-2.5-flash while generateContent rejected it with this body — and
 * the @google/genai SDK surfaces that raw body as `err.message`, which a
 * catch-all `err?.message` then printed on the Research board.
 */
const RETIRED_BODY = JSON.stringify({
  error: {
    code: 404,
    message:
      "This model models/gemini-2.5-flash is no longer available to new users. " +
      "Please update your code to use models/gemini-3.6-flash.",
    status: "NOT_FOUND",
  },
});

function retiredError(): Error {
  const err = new Error(RETIRED_BODY);
  (err as any).status = 404;
  return err;
}

test("flash candidates rank newest first; non-flash and non-gemini ids are excluded", () => {
  const ranked = rankGeminiFlashIds([
    "gemini-1.5-flash",
    "gemini-2.5-pro",
    "gemini-3.6-flash",
    "text-embedding-004",
    "gemini-2.5-flash",
    "claude-flash-oddity",
  ]);
  assert.deepEqual(ranked, ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-1.5-flash"]);
});

test("a retired/not-found rejection is recognized; quota and auth are not", () => {
  assert.equal(isRetiredModelError(retiredError()), true);
  assert.equal(isRetiredModelError(new Error("no longer available to new users")), true);
  const quota = new Error("Resource exhausted");
  (quota as any).status = 429;
  assert.equal(isRetiredModelError(quota), false);
  assert.equal(isRetiredModelError(new Error("API key not valid")), false);
});

test("LISTED IS NOT SERVABLE: a retired top candidate is advanced past, not surfaced", async () => {
  const attempted: string[] = [];
  const result = await withNewestGeminiFlash(
    ["gemini-2.5-flash", "gemini-3.6-flash"],
    async (model) => {
      attempted.push(model);
      if (model === "gemini-3.6-flash") throw retiredError();
      return `answered by ${model}`;
    },
  );
  // 3.6 ranks first, gets rejected as retired, and 2.5 answers — the caller
  // never sees the rejection.
  assert.deepEqual(attempted, ["gemini-3.6-flash", "gemini-2.5-flash"]);
  assert.equal(result, "answered by gemini-2.5-flash");
});

test("a whole retired tier is walked past — beyond three candidates — to reach a servable id", async () => {
  // A family ships several same-version flash variants, so one retirement
  // wave can cover the top of the ranking; an unversioned maintained alias
  // ranks last. Capping the attempts would report "no servable model" with
  // a servable one still untried.
  const attempted: string[] = [];
  const result = await withNewestGeminiFlash(
    ["gemini-flash-latest", "gemini-3.6-flash-preview", "gemini-3.6-flash", "gemini-3.6-flash-lite"],
    async (model) => {
      attempted.push(model);
      if (model !== "gemini-flash-latest") throw retiredError();
      return `answered by ${model}`;
    },
  );
  assert.equal(result, "answered by gemini-flash-latest");
  assert.equal(attempted.length, 4);
});

test("a real error (quota/auth) propagates immediately instead of burning candidates", async () => {
  const attempted: string[] = [];
  const quota = new Error("Resource exhausted");
  (quota as any).status = 429;
  await assert.rejects(
    withNewestGeminiFlash(["gemini-3.6-flash", "gemini-2.5-flash"], async (model) => {
      attempted.push(model);
      throw quota;
    }),
    quota,
  );
  assert.deepEqual(attempted, ["gemini-3.6-flash"]);
});

test("every candidate retired, or none listed, fails with a plain user-facing sentence", async () => {
  await assert.rejects(
    withNewestGeminiFlash(["gemini-3.6-flash", "gemini-2.5-flash"], async () => {
      throw retiredError();
    }),
    (err: unknown) => {
      assert.ok(err instanceof UserFacingError);
      assert.doesNotMatch((err as Error).message, /[{}]/);
      return true;
    },
  );
  await assert.rejects(
    withNewestGeminiFlash(["gemini-2.5-pro"], async () => "never called"),
    (err: unknown) => err instanceof UserFacingError,
  );
});

test("LEAK REGRESSION: a provider error body never reaches the deep dive's user error", async () => {
  const result = await runResearchDeepDive({
    question: "What changed in the EU AI Act enforcement timeline?",
    decompose: async () => {
      throw retiredError(); // .message IS the raw JSON body, as the SDK throws it
    },
    groundedAnswer: async () => ({ answer: "unused", sources: [] }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.error);
  assert.doesNotMatch(result.error || "", /[{}]/);
  assert.doesNotMatch(result.error || "", /NOT_FOUND|no longer available|gemini/i);
});

test("a sentence written for the user passes through the deep dive unchanged", async () => {
  const result = await runResearchDeepDive({
    question: "What changed in the EU AI Act enforcement timeline?",
    decompose: async () => {
      throw new UserFacingError("No currently servable Gemini flash model was found.");
    },
    groundedAnswer: async () => ({ answer: "unused", sources: [] }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "No currently servable Gemini flash model was found.");
});
