/**
 * The golden canary may be exactly one synthetic user, and never anyone else.
 *
 * WHY THIS IDENTITY EXISTS. The durable journal requires a real signed session,
 * so CI could never write to it on a deployment — leaving Phase 2's exit
 * criterion ("prove a run survives worker termination and browser refresh")
 * demonstrable only against a synthetic store. It is also why the deployed
 * golden chat logs five console 401s per run.
 *
 * WHY IT IS SAFE. The store partitions every row by user_sub, so a canary
 * pinned to one fixed sub can reach that sub's Runs and nothing else. A leaked
 * CI token therefore cannot touch a customer's data. These cases are the proof
 * of that claim — the alternative designs (a service-role key in CI, or a real
 * account's credentials) were rejected on exactly this axis.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { GOLDEN_CANARY_SUB, requireActiveSession } from "./authz.js";

const TOKEN = "canary-token-for-tests-only-32-chars-long";

function res() {
  const sent: { status?: number; body?: any } = {};
  return {
    sent,
    status(code: number) { sent.status = code; return this; },
    json(body: any) { sent.body = body; return this; },
  };
}

function withToken(value: string | undefined, run: () => Promise<void>) {
  const previous = process.env.QUANTORA_GOLDEN_CANARY_TOKEN;
  if (value === undefined) delete process.env.QUANTORA_GOLDEN_CANARY_TOKEN;
  else process.env.QUANTORA_GOLDEN_CANARY_TOKEN = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env.QUANTORA_GOLDEN_CANARY_TOKEN;
    else process.env.QUANTORA_GOLDEN_CANARY_TOKEN = previous;
  });
}

const req = (headers: Record<string, string> = {}) => ({ headers });

test("[was-red] a correct canary token authenticates as the synthetic user", async () => {
  await withToken(TOKEN, async () => {
    const auth = await requireActiveSession(req({ "x-quantora-golden-canary": TOKEN }), res());
    assert.equal(auth.ok, true, "CI must be able to reach the durable journal");
    assert.equal((auth as any).value.sessionUser.sub, GOLDEN_CANARY_SUB);
  });
});

test("[was-red] the canary CANNOT choose who it is", async () => {
  /*
   * THE PROPERTY THAT MAKES THIS SAFE. If any part of the request could steer
   * the identity, the canary would be an impersonation primitive rather than a
   * fixed test account — and a leaked CI token would reach every user's Runs.
   */
  await withToken(TOKEN, async () => {
    const hostile = req({
      "x-quantora-golden-canary": TOKEN,
      "x-quantora-sub": "109876543210987654321",
      "x-user-sub": "109876543210987654321",
      sub: "109876543210987654321",
      authorization: "Bearer 109876543210987654321",
    });
    const auth = await requireActiveSession({ ...hostile, query: { sub: "victim" }, body: { sub: "victim", userSub: "victim" } }, res());
    assert.equal(auth.ok, true);
    assert.equal(
      (auth as any).value.sessionUser.sub,
      GOLDEN_CANARY_SUB,
      "the identity must be a constant, not anything the caller supplied",
    );
  });
});

test("[was-red] no token, a wrong token, and an unconfigured deployment all refuse", async () => {
  await withToken(TOKEN, async () => {
    for (const headers of [{}, { "x-quantora-golden-canary": "wrong-token-of-the-same-length!!" }]) {
      const response = res();
      const auth = await requireActiveSession(req(headers), response);
      assert.equal(auth.ok, false, `${JSON.stringify(headers)} must not authenticate`);
      assert.equal(response.sent.status, 401);
    }
  });

  /*
   * A deployment with no canary configured must not be canary-authenticatable
   * at all — otherwise an empty expected value could be matched by an empty
   * supplied one.
   */
  await withToken(undefined, async () => {
    const response = res();
    const auth = await requireActiveSession(req({ "x-quantora-golden-canary": "" }), response);
    assert.equal(auth.ok, false, "an unconfigured deployment has no canary identity to offer");
    assert.equal(response.sent.status, 401);
  });
});

test("the synthetic sub can never collide with a real one", async () => {
  /*
   * Real subs are Google's numeric ids. A non-numeric, namespaced constant
   * cannot be minted by the identity provider, so this row can never sit in the
   * same partition as a customer's.
   */
  assert.match(GOLDEN_CANARY_SUB, /^quantora-/, "the sub must be namespaced");
  assert.equal(/^\d+$/.test(GOLDEN_CANARY_SUB), false, "and must not look like a Google sub");
});

test("[was-red] a real session always wins over the canary", async () => {
  /*
   * The canary is a fallback, never an override. If it could displace a signed-in
   * user, a CI token would silently redirect that user's writes into the canary's
   * partition — losing their data rather than exposing it, but losing it all the same.
   */
  const source = await import("node:fs").then((fs) => fs.readFileSync(new URL("./authz.ts", import.meta.url), "utf8"));
  assert.match(
    source,
    /getSessionUser\(req\) \|\| goldenCanarySession\(req\)/,
    "the real session must be evaluated first, and the canary only when there is none",
  );
});
