/**
 * The store knows why the write failed. Everything above it used to guess.
 *
 * THE GAP. api/_lib/qir-run-store.ts console.warn'd Supabase's error into a log
 * nobody reads and returned a bare `{ status: "unavailable" }`. The route could
 * answer only `reason: "persist-failed"` and the chip could say only "rejected
 * the last write" — true, and not something anyone can act on. A missing table,
 * a policy refusing the service role and a stale key are three different jobs
 * for three different people.
 *
 * That is the shape of nearly every defect in this repo's history: the
 * information existed, a boundary did not carry it, the next layer guessed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { diagnoseQirPersistFailure, describeQirPersistDiagnosis } from './qir-persist-diagnosis.js';

test('[was-red] each failure the operator can actually fix is told apart', () => {
  const cases = [
    ['missing table (PostgREST)', 404, 'Could not find the table public.qir_runs in the schema cache', /not present/],
    ['missing relation (Postgres)', 400, 'relation "public.qir_runs" does not exist', /not present/],
    ['row-level security', 403, 'new row violates row-level security policy for table qir_runs', /row-level security/],
    ['insufficient privilege code', 400, '{"code":"42501"}', /row-level security/],
    ['stale service key', 401, '{"message":"Invalid API key"}', /rejected the service key/],
    ['project unhealthy', 503, 'upstream connect error', /project itself returned an error/],
  ];
  for (const [why, httpStatus, detail, expected] of cases) {
    const dx = diagnoseQirPersistFailure({ httpStatus, detail });
    assert.ok(dx, `${why} must be classified`);
    assert.match(dx.cause, expected, why);
    assert.ok(dx.remedy.length > 0, `${why} must say what to do`);
  }
});

test('[was-red] a missing COLUMN is not reported as a missing TABLE', () => {
  /*
   * The first draft ordered the table signature first, and Postgres words a
   * missing column as "column x of relation y does not exist" — which also
   * satisfies "relation .* does not exist". Schema drift was therefore
   * diagnosed as an unapplied migration, sending someone to re-run a migration
   * that had already run.
   *
   * Caught by reading this function's output rather than its exit code (§8).
   */
  for (const detail of [
    'column "storage_version" of relation "qir_runs" does not exist',
    '{"code":"PGRST204","message":"Could not find the \'storage_version\' column"}',
    '{"code":"42703"}',
  ]) {
    assert.match(
      diagnoseQirPersistFailure({ httpStatus: 400, detail }).cause,
      /do not have the columns/,
      `${detail} is schema drift, not an absent table`,
    );
  }
});

test('[was-red] ambiguous evidence yields no cause at all', () => {
  /*
   * §5: a chip that fires on ambiguous evidence is one the next person hides.
   * An invented cause is worse than none — it sends someone to fix the wrong
   * thing. A 400 or 409 with an unrecognisable body is not certainly anything.
   */
  for (const [httpStatus, detail] of [[400, 'something went wrong'], [409, ''], [0, ''], [200, 'ok']]) {
    assert.equal(diagnoseQirPersistFailure({ httpStatus, detail }), null, `${httpStatus} must claim nothing`);
  }
  assert.equal(describeQirPersistDiagnosis(null), '', 'and renders as nothing');
});

test('[was-red] the classifier is a LOOKUP, never a passthrough', () => {
  /*
   * THE SECURITY PROPERTY, asserted rather than promised.
   *
   * This verdict is rendered in a browser. A raw PostgREST error names tables,
   * columns and sometimes the project, and on a multi-tenant desk that reaches
   * people who are not the operator. So the output is built only from the fixed
   * strings in QIR_PERSIST_CAUSES — nothing the store wrote may survive into it.
   *
   * Each input below carries a unique sentinel standing in for whatever the
   * real reply might contain.
   */
  const sentinels = [
    [404, 'Could not find the table public.SENTINELTABLEZZQ in the schema cache'],
    [401, '{"message":"Invalid API key","key":"eyJSENTINELJWTZZQ.aaa.bbb"}'],
    [403, 'row-level security policy on SENTINELTABLEZZQ at https://SENTINELPROJZZQ.supabase.co'],
    [503, 'upstream connect error to SENTINELPROJZZQ.supabase.co:5432'],
  ];
  for (const [httpStatus, detail] of sentinels) {
    const rendered = describeQirPersistDiagnosis(diagnoseQirPersistFailure({ httpStatus, detail }));
    assert.ok(rendered.length > 0, 'these are all classifiable');
    for (const secret of ['SENTINELTABLEZZQ', 'SENTINELJWTZZQ', 'SENTINELPROJZZQ', 'supabase.co', '5432']) {
      assert.doesNotMatch(rendered, new RegExp(secret, 'i'), `${secret} must never reach the browser`);
    }
  }
});

test('malformed input never throws — a diagnosis may not break the turn', () => {
  for (const input of [undefined, {}, { httpStatus: 'x', detail: null }, { detail: 42 }, { detail: {} }]) {
    assert.doesNotThrow(() => diagnoseQirPersistFailure(input));
  }
  for (const input of [undefined, null, {}, { cause: '' }]) {
    assert.equal(describeQirPersistDiagnosis(input), '');
  }
});

test('[was-red] every boundary between the store and the chip carries the verdict', () => {
  /*
   * The defect was a boundary that dropped a fact, so one silent link anywhere
   * in this chain restores it — and a unit test of the endpoints cannot see a
   * missing middle. These assertions are the chain.
   */
  const read = (p) => readFileSync(path.join(import.meta.dirname, '..', p), 'utf8');

  const store = read('api/_lib/qir-run-store.ts');
  assert.match(store, /diagnosis\?: \{ cause: string; remedy: string \} \| null/, 'the store type must carry it');
  assert.match(store, /diagnosis: diagnoseQirPersistFailure\(\{ httpStatus: response\.status, detail \}\)/,
    'and must classify at the one place the raw detail exists');

  for (const route of ['api/qir-runs.ts', 'api/qir-resources.ts', 'api/qir-context.ts']) {
    assert.match(read(route), /result\.diagnosis \? \{ diagnosis: result\.diagnosis \} : \{\}/,
      `${route} must forward the verdict on its persist-failed 503`);
  }

  assert.match(read('src/lib/qir-coding-run-core.js'), /error\.diagnosis = \{/, 'the client must keep it on the error');
  assert.match(read('src/lib/qir-durability.js'), /describeQirPersistDiagnosis\(diagnosis\)/, 'and the chip must render it');
});
