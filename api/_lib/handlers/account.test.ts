import test from "node:test";
import assert from "node:assert/strict";
import handler, { type AccountHandlerDeps } from "./account.js";

/**
 * ---------------------------------------------------------------------------
 * DELETING A PERSON'S ACCOUNT, WITH NOBODY WATCHING.
 *
 * Until this file, the journey ledger's row for account-export-delete carried
 * `gates: {}` and this note, verbatim:
 *
 *   "No test opens the account handler. A deletion that fails silently, or
 *    lands on the wrong account, would be found by a user."
 *
 * That is the most destructive operation the platform offers, on the personal
 * data of ten students, guarded by four one-line properties that nothing
 * checked:
 *
 *   - the sub deleted comes from the SESSION, never from the request body
 *   - `confirm: true` is required
 *   - a failed delete says so, and never reports success
 *   - a successful delete ends the session
 *
 * Each test below is one of those lines, and each names the harm if it goes.
 * None of them needs Postgres or a real OAuth round trip — the handler takes
 * its dependencies, which is the only reason this file can exist.
 * ---------------------------------------------------------------------------
 */

const SESSION_SUB = "google-oauth2|the-signed-in-student";
const ATTACKER_SUB = "google-oauth2|somebody-else";

function makeRes() {
  const sent: any = { status: 0, body: null, headers: {} as Record<string, string>, ended: false };
  const res: any = {
    status(code: number) { sent.status = code; return res; },
    json(body: unknown) { sent.body = body; return res; },
    end() { sent.ended = true; return res; },
    setHeader(key: string, value: string) { sent.headers[String(key).toLowerCase()] = value; },
  };
  return { res, sent };
}

/** Every dependency records what it was asked, and nothing touches a network. */
function makeDeps(over: Partial<AccountHandlerDeps> = {}) {
  const calls = {
    deleted: [] as string[],
    exported: [] as string[],
    exportedProjects: [] as string[],
    sessionsCleared: 0,
  };
  const deps: AccountHandlerDeps = {
    cors: () => {},
    rateLimited: () => false,
    requireSession: (async () => ({
      ok: true as const,
      value: { sessionUser: { sub: SESSION_SUB, email: "student@example.edu" } },
    })) as unknown as AccountHandlerDeps["requireSession"],
    storeConfigured: () => true,
    exportUser: (async (sub: string) => { calls.exported.push(sub); return { usage: [] }; }) as AccountHandlerDeps["exportUser"],
    exportProjects: (async (sub: string) => { calls.exportedProjects.push(sub); return { projects: [] }; }) as unknown as AccountHandlerDeps["exportProjects"],
    deleteUser: (async (sub: string) => { calls.deleted.push(sub); return true; }) as AccountHandlerDeps["deleteUser"],
    clearSession: (() => { calls.sessionsCleared += 1; }) as AccountHandlerDeps["clearSession"],
    ...over,
  };
  return { deps, calls };
}

const post = (body: unknown) => ({ method: "POST", body, headers: {}, socket: {} });

test("deletion targets the signed-in account, never a sub supplied by the caller", async () => {
  /*
   * THE ONE THAT MATTERS MOST. If a future change reads the sub from the body
   * — for an admin tool, a support flow, anything — one authenticated student
   * could erase another. The handler must never learn a sub from input.
   */
  const { res } = makeRes();
  const { deps, calls } = makeDeps();
  await handler(post({ action: "delete", confirm: true, sub: ATTACKER_SUB, userSub: ATTACKER_SUB }), res, deps);

  assert.deepEqual(calls.deleted, [SESSION_SUB]);
  assert.ok(!calls.deleted.includes(ATTACKER_SUB), "a sub from the request body reached the delete");
});

test("an unconfirmed delete refuses and erases nothing", async () => {
  // The guard against a one-click wipe. Refusing is not enough — it must also
  // not have deleted anything on the way to refusing.
  for (const body of [
    { action: "delete" },
    { action: "delete", confirm: false },
    { action: "delete", confirm: "true" },
    { action: "delete", confirm: 1 },
  ]) {
    const { res, sent } = makeRes();
    const { deps, calls } = makeDeps();
    await handler(post(body), res, deps);
    assert.equal(sent.status, 400, `confirm=${JSON.stringify((body as any).confirm)} was accepted`);
    assert.deepEqual(calls.deleted, [], `confirm=${JSON.stringify((body as any).confirm)} still deleted`);
  }
});

test("a delete that fails says so, keeps the session, and never reports success", async () => {
  /*
   * The privacy lie. If the store fails and we answer 200 { deleted: true },
   * the student is told their data is gone while it is still there — worse
   * than an error, because they stop asking.
   */
  const { res, sent } = makeRes();
  const { deps, calls } = makeDeps({ deleteUser: (async () => false) as AccountHandlerDeps["deleteUser"] });
  await handler(post({ action: "delete", confirm: true }), res, deps);

  assert.equal(sent.status, 503);
  assert.notEqual((sent.body as any)?.deleted, true);
  assert.match(String((sent.body as any)?.error), /nothing was changed/i);
  assert.equal(calls.sessionsCleared, 0, "the session was ended for a deletion that did not happen");
});

test("a successful delete ends the session", async () => {
  // The account is gone; a live cookie would keep authenticating against it.
  const { res, sent } = makeRes();
  const { deps, calls } = makeDeps();
  await handler(post({ action: "delete", confirm: true }), res, deps);

  assert.equal(sent.status, 200);
  assert.equal((sent.body as any)?.deleted, true);
  assert.equal(calls.sessionsCleared, 1);
});

test("export reads only the signed-in account, from both stores", async () => {
  // Same wrong-account risk as delete, and it leaks rather than destroys.
  const { res, sent } = makeRes();
  const { deps, calls } = makeDeps();
  await handler(post({ action: "export", sub: ATTACKER_SUB }), res, deps);

  assert.equal(sent.status, 200);
  assert.deepEqual(calls.exported, [SESSION_SUB]);
  assert.deepEqual(calls.exportedProjects, [SESSION_SUB]);
  assert.match(String(sent.headers["content-disposition"]), /quantora-my-data\.json/);
});

test("a half-assembled export is refused rather than handed over incomplete", async () => {
  // An export missing a store is a person believing they have all their data.
  for (const over of [
    { exportUser: (async () => null) as AccountHandlerDeps["exportUser"] },
    { exportProjects: (async () => null) as unknown as AccountHandlerDeps["exportProjects"] },
  ]) {
    const { res, sent } = makeRes();
    const { deps } = makeDeps(over);
    await handler(post({ action: "export" }), res, deps);
    assert.equal(sent.status, 503);
    assert.equal(sent.headers["content-disposition"], undefined, "a failed export still offered a download");
  }
});

test("an unusable store refuses both actions instead of quietly doing nothing", async () => {
  /*
   * §5, applied to privacy: a no-op that answers 200 is the failure mode this
   * handler's own comment warns about — "a privacy action that silently
   * no-ops is worse than an honest error".
   */
  for (const body of [{ action: "delete", confirm: true }, { action: "export" }]) {
    const { res, sent } = makeRes();
    const { deps, calls } = makeDeps({ storeConfigured: () => false });
    await handler(post(body), res, deps);
    assert.equal(sent.status, 503);
    assert.deepEqual(calls.deleted, []);
    assert.deepEqual(calls.exported, []);
  }
});

test("no session means no store call at all", async () => {
  // requireActiveSession answers the request itself; the handler must stop.
  const { res } = makeRes();
  const { deps, calls } = makeDeps({
    requireSession: (async () => ({ ok: false as const, responseSent: true as const })) as unknown as AccountHandlerDeps["requireSession"],
  });
  await handler(post({ action: "delete", confirm: true }), res, deps);

  assert.deepEqual(calls.deleted, []);
  assert.deepEqual(calls.exported, []);
});

test("a rate-limited caller is turned away before the session is even read", async () => {
  const { res, sent } = makeRes();
  let sessionRead = 0;
  const { deps, calls } = makeDeps({
    rateLimited: () => true,
    requireSession: (async () => {
      sessionRead += 1;
      return { ok: true as const, value: { sessionUser: { sub: SESSION_SUB } } };
    }) as unknown as AccountHandlerDeps["requireSession"],
  });
  await handler(post({ action: "delete", confirm: true }), res, deps);

  assert.equal(sent.status, 429);
  assert.equal(sessionRead, 0);
  assert.deepEqual(calls.deleted, []);
});

test("an unknown or missing action deletes nothing", async () => {
  // "" must not fall through to a destructive branch.
  for (const body of [{}, { action: "" }, { action: "DELETE" }, { action: "remove" }, { action: "delete-all" }]) {
    const { res, sent } = makeRes();
    const { deps, calls } = makeDeps();
    await handler(post(body), res, deps);
    assert.equal(sent.status, 400, `${JSON.stringify(body)} was not refused`);
    assert.deepEqual(calls.deleted, [], `${JSON.stringify(body)} reached the delete`);
  }
});

test("only POST can act; OPTIONS preflights and other verbs are refused", async () => {
  const preflight = makeRes();
  const { deps: d1, calls: c1 } = makeDeps();
  await handler({ method: "OPTIONS", body: {}, headers: {}, socket: {} }, preflight.res, d1);
  assert.equal(preflight.sent.status, 200);
  assert.deepEqual(c1.deleted, []);

  for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
    const { res, sent } = makeRes();
    const { deps, calls } = makeDeps();
    await handler({ method, body: { action: "delete", confirm: true }, headers: {}, socket: {} }, res, deps);
    assert.equal(sent.status, 405, `${method} was allowed`);
    assert.deepEqual(calls.deleted, [], `${method} reached the delete`);
  }
});
