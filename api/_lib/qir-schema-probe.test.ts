/**
 * The schema the code needs must exist where the code runs.
 *
 * THE INCIDENT. On 2026-09-04 every gate in this repository was green while the
 * production database contained none of the durable Run tables. The migration
 * had landed two days earlier; nothing in CI or the deploy applies migrations;
 * persistence, checkpoints and crash-resume were all no-ops. No gate could see
 * it, because every gate here checks code against code — even the crash-resume
 * proof drives a synthetic store. A user's screenshot found it.
 *
 * THE PROPERTY UNDER TEST. `present: false` is a CLAIM and blocks a deploy, so
 * it may only be made when the store answered and named the relation absent.
 * Every other outcome — unreachable, timed out, key rejected, 5xx, not
 * configured — is `null`, meaning NOT KNOWN, and must never block. A gate that
 * fails a deploy on a network blip is one the next person mutes (§5), and
 * refusing to ship on ignorance is the defect #516 removed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { probeQirRunSchema } from "./qir-run-store.js";

const realFetch = globalThis.fetch;
const realUrl = process.env.SUPABASE_URL;
const realKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function withStore(responder: (url: string) => Promise<Response> | Response) {
  process.env.SUPABASE_URL = "https://probe-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests-only-not-real";
  globalThis.fetch = (async (input: any) => responder(String(input))) as typeof fetch;
}

function restore() {
  globalThis.fetch = realFetch;
  if (realUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = realUrl;
  if (realKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = realKey;
}

const reply = (status: number, body: string) => new Response(body, { status });

test("[was-red] a missing table is reported as definitively absent", async () => {
  withStore(() => reply(404, '{"code":"PGRST205","message":"Could not find the table \'public.qir_runs\' in the schema cache"}'));
  try {
    const probe = await probeQirRunSchema();
    assert.equal(probe.configured, true);
    assert.equal(probe.present, false, "this is the case that must block a deploy");
    assert.match(probe.diagnosis?.cause || "", /not present/);
    assert.match(probe.diagnosis?.remedy || "", /migration/);
  } finally { restore(); }
});

test("[was-red] schema drift also counts as absent", async () => {
  withStore(() => reply(400, '{"code":"PGRST204","message":"Could not find the storage_version column"}'));
  try {
    assert.equal((await probeQirRunSchema()).present, false, "tables without the right columns cannot serve this code");
  } finally { restore(); }
});

test("[was-red] EVERY form of not-knowing resolves to null, never false", async () => {
  /*
   * Each of these is a different way of failing to find out, and not one of
   * them is evidence that the schema is missing. This is the assertion that
   * stops the gate becoming the thing it protects against.
   */
  const unknowns: Array<[string, () => Response | Promise<Response>]> = [
    ["a rejected service key", () => reply(401, '{"message":"Invalid API key"}')],
    ["a forbidden response", () => reply(403, "forbidden")],
    ["the project erroring", () => reply(503, "upstream connect error")],
    ["an unrecognisable 400", () => reply(400, "something ambiguous")],
    ["a network failure", () => { throw new Error("ECONNRESET"); }],
  ];
  for (const [why, responder] of unknowns) {
    withStore(responder as any);
    try {
      const probe = await probeQirRunSchema();
      assert.equal(probe.present, null, `${why} is ignorance, not absence`);
      assert.notEqual(probe.present, false, `${why} must never block a deploy`);
    } finally { restore(); }
  }
});

test("an unconfigured deployment is not a missing schema", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const probe = await probeQirRunSchema();
    assert.equal(probe.configured, false);
    assert.equal(probe.present, null, "no credentials means we cannot know, and must not block");
  } finally { restore(); }
});

test("both tables present reports present", async () => {
  withStore(() => reply(200, "[]"));
  try {
    const probe = await probeQirRunSchema();
    assert.equal(probe.present, true);
    assert.equal(probe.diagnosis, null);
  } finally { restore(); }
});

test("[was-red] the SECOND table is checked too", async () => {
  /*
   * A loop that returns on the first success would prove only qir_runs. The
   * event ledger is half of the journal — a Run that cannot record events is
   * not resumable either.
   */
  const seen: string[] = [];
  withStore((url) => {
    seen.push(url);
    return url.includes("qir_run_events")
      ? reply(404, '{"code":"PGRST205","message":"Could not find the table"}')
      : reply(200, "[]");
  });
  try {
    assert.equal((await probeQirRunSchema()).present, false, "a missing event ledger is a missing schema");
    assert.ok(seen.some((u) => u.includes("qir_runs?")), "qir_runs must be probed");
    assert.ok(seen.some((u) => u.includes("qir_run_events")), "and so must qir_run_events");
  } finally { restore(); }
});

test("the probe reads no rows", async () => {
  /*
   * This runs against a live production database on every readiness check. It
   * asks for the relation's shape and nothing else — it must never pull a
   * user's records.
   */
  const seen: string[] = [];
  withStore((url) => { seen.push(url); return reply(200, "[]"); });
  try {
    await probeQirRunSchema();
    for (const url of seen) assert.match(url, /limit=0/, `${url} must request zero rows`);
  } finally { restore(); }
});

test("[was-red] the readiness gate blocks on false, and ONLY on false", async () => {
  /*
   * The probe is useless if nothing acts on it, and dangerous if something acts
   * on the wrong value. A unit cannot run the deployed gate, so this asserts
   * the shape of the condition that decides a deploy.
   */
  const gate = readFileSync(path.join(import.meta.dirname, "..", "..", "scripts", "deployed-readiness-gate.mjs"), "utf8");

  assert.match(gate, /health\?\.durableStore\?\.present === false/, "the gate must fail only on a definitive absence");
  assert.doesNotMatch(gate, /if \(!health\?\.durableStore\?\.present\)/, "a falsy check would also fail on null — that is the mute-me bug");
  assert.match(gate, /failures\.push\(\s*\n?\s*'the durable Run schema is NOT present/, "and must report it as a failure, not a warning");
  assert.match(gate, /not blocking on ignorance/, "the unknown case must warn rather than block");

  const health = readFileSync(path.join(import.meta.dirname, "handlers", "inference-health.ts"), "utf8");
  assert.match(health, /durableStore: await probeQirRunSchema\(\)/, "the deployment must answer for its own schema");
});
