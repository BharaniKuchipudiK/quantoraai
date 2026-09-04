import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { openRouterPublicHint, openRouterEnvPublicHint } from "./openrouter-key.js";

/**
 * ---------------------------------------------------------------------------
 * "DID MY PASTE TAKE EFFECT?" MUST BE ANSWERABLE FROM THE PLATFORM.
 *
 * An OpenRouter key can come from two stores — the OPENROUTER_API_KEY env var,
 * or the OPENROUTER row in api_gateway_keys — and the env one silently wins.
 *
 * On 2026-09-04 an operator created a key, pasted it into the gateway row, and
 * asked whether it had taken effect. Nothing could answer. openRouterEnvHint
 * describes the ENV var, a store they had not touched; openRouterViaGateway
 * says the row was reached but never which key it holds. Two valid keys, three
 * characters apart, and the deployment could not tell them apart — so the only
 * evidence available was an OpenRouter dashboard's "Last Used" column, which
 * says nothing while no traffic has run.
 *
 * That is this repository's recurring shape one more time: the information
 * existed, no boundary carried it, and a human guessed.
 * ---------------------------------------------------------------------------
 */

test("a hint names the key it was given, not the environment", () => {
  // The whole point: callable on the gateway key, not only on process.env.
  assert.deepEqual(
    openRouterPublicHint("sk-or-v1-a36000000000000000b2a"),
    { shape: "openrouter", hint: "sk-or-v1-...b2a" },
  );
  assert.deepEqual(
    openRouterPublicHint("sk-or-v1-f84000000000000000635"),
    { shape: "openrouter", hint: "sk-or-v1-...635" },
  );
  // Two keys that differ only at the end must not read the same, or the hint
  // answers nothing for the operator holding exactly that pair.
  assert.notEqual(
    openRouterPublicHint("sk-or-v1-a36000000000000000b2a").hint,
    openRouterPublicHint("sk-or-v1-f84000000000000000635").hint,
  );
});

test("no unknown secret is ever echoed", () => {
  /*
   * This is a PUBLIC endpoint. Last three characters of a key already known to
   * be an OpenRouter key is the deliberate limit; anything else is described by
   * family alone. A Stripe key pasted in by mistake must be recognisable
   * WITHOUT any of its characters leaving the deployment.
   */
  const stripe = openRouterPublicHint("sk_live_51ABCDEFGHIJKLMNOP");
  assert.equal(stripe.shape, "stripe-like");
  assert.equal(stripe.hint, "sk_live_... (not OpenRouter)");
  assert.doesNotMatch(String(stripe.hint), /NOP|51AB/);

  const unknown = openRouterPublicHint("hunter2-totally-secret-value");
  assert.equal(unknown.shape, "other");
  assert.doesNotMatch(String(unknown.hint), /hunter2|secret|alue/);

  assert.deepEqual(openRouterPublicHint(""), { shape: "missing", hint: null });
  assert.deepEqual(openRouterPublicHint(undefined), { shape: "missing", hint: null });
  assert.deepEqual(openRouterPublicHint(null), { shape: "missing", hint: null });
});

test("the env hint is the same function, so the two cannot drift apart", () => {
  // It was a second copy of the same logic. Two copies of a redaction rule is
  // one copy that will eventually leak.
  assert.deepEqual(
    openRouterEnvPublicHint({ OPENROUTER_API_KEY: "sk-or-v1-f84000000000000000635" } as any),
    openRouterPublicHint("sk-or-v1-f84000000000000000635"),
  );
  assert.deepEqual(openRouterEnvPublicHint({} as any), { shape: "missing", hint: null });
});

/* ------------------------------------------------------------------ *
 * The endpoint must report the key that SERVES, not the one it can see.
 * ------------------------------------------------------------------ */

const HEALTH = readFileSync(
  path.join(import.meta.dirname, "handlers", "inference-health.ts"),
  "utf8",
);

test("health names the store the live key came from", () => {
  assert.match(HEALTH, /openRouterKeySource,/, "the response must say which store served the key");
  assert.match(
    HEALTH,
    /const openRouterKeySource = openRouterEnv \? 'env' : \(openRouterViaGateway \? 'gateway' : null\)/,
    "the source must follow the same precedence the chat path uses, not a separate opinion",
  );
});

test("the reported hint is built from the key that would be charged", () => {
  /*
   * The failure this prevents: hinting the ENV key while the GATEWAY key is
   * serving. That is not a missing feature, it is a wrong answer — the operator
   * reads a key they did not paste and concludes their paste failed, or worse,
   * that it worked.
   *
   * spendKey is already resolved by the same rule as the chat path, so the hint
   * is bound to it rather than to either store directly.
   */
  assert.match(
    HEALTH,
    /const openRouterActive = openRouterPublicHint\(spendKey\)/,
    "the hint must describe spendKey — the key a turn would actually charge",
  );
  assert.match(HEALTH, /openRouterKeyHint: openRouterActive\.hint/);
  assert.match(HEALTH, /openRouterKeyShape: openRouterActive\.shape/);
  assert.doesNotMatch(
    HEALTH,
    /openRouterKeyHint: openRouterHint\.hint/,
    "the live-key hint is describing the env var again, which is the defect this closes",
  );
});
