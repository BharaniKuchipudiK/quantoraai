/**
 * The durable runtime must be able to say when it is not recording.
 *
 * THE INCIDENT THIS PRE-EMPTS. `qir-run-store.ts` is gated on SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. With either unset the route answers 503 and QIR
 * journals nothing — no Run, no failure evidence, no resume. Every local test
 * still passes, because every local test runs against a configured store.
 *
 * Before this file, the chain ended in silence: the server said so, the client
 * caught it, `useQirCodingRun` exported `error`, and NOTHING in the product read
 * it. The desk rendered `{qirCoding.run ? ... : null}`, so a runtime that was
 * switched off looked identical to a desk that had not built anything yet.
 *
 * That is the same shape as every defect closed on this spine: the fact existed,
 * a boundary did not carry it, and the next layer guessed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  QIR_PERSIST_FAILED,
  QIR_STORAGE_UNCONFIGURED,
  describeQirDurability,
} from './qir-durability.js';

test('[was-red] an unconfigured store is reported, not rendered as silence', () => {
  const error = Object.assign(new Error('Durable QIR runtime storage is not configured.'), {
    status: 503,
    reason: QIR_STORAGE_UNCONFIGURED,
  });
  const verdict = describeQirDurability({ run: null, error });

  assert.ok(verdict, 'an unconfigured durable store must not render as an empty chip');
  assert.equal(verdict.recording, false);
  assert.match(verdict.label, /not recording/i);
  assert.match(verdict.detail, /not configured/i, 'the detail must name the deployment gap');
  assert.match(verdict.detail, /resume/i, 'and what it costs the user');
});

test('a failed write is a DIFFERENT problem and says so', () => {
  /*
   * Storage that is configured and rejecting writes is an outage; storage that
   * was never configured is an unfinished deployment. Collapsing them sends the
   * reader looking in the wrong place.
   */
  const error = Object.assign(new Error('Unable to persist the durable Run.'), {
    status: 503,
    reason: QIR_PERSIST_FAILED,
  });
  const verdict = describeQirDurability({ run: null, error });

  assert.ok(verdict);
  assert.equal(verdict.recording, false);
  assert.match(verdict.label, /not saved/i);
  assert.doesNotMatch(
    verdict.label,
    /not recording/i,
    'a rejected write must not be reported as an unconfigured deployment',
  );
});

test('a healthy Run still reads exactly as it did', () => {
  const verdict = describeQirDurability({ run: { runId: 'qir_run_7f3a91c', status: 'EXECUTING' } });
  assert.equal(verdict.label, 'Run · EXECUTING');
  assert.equal(verdict.recording, true);
  assert.match(verdict.detail, /qir_run_7f3a91c/);
});

test('ambiguous evidence claims nothing', () => {
  /*
   * §5: a chip that fires on ambiguous evidence gets hidden by the next person
   * under pressure, and then it protects nothing. None of these mean the runtime
   * is off.
   */
  for (const error of [
    null,
    Object.assign(new Error('Unauthorized'), { status: 401 }),
    Object.assign(new Error('Run not found.'), { status: 404 }),
    Object.assign(new Error('Failed to fetch'), {}),
    Object.assign(new Error('Durable Coding Run is unavailable.'), { status: 503, reason: '' }),
  ]) {
    assert.equal(
      describeQirDurability({ run: null, error }),
      null,
      `must stay silent for: ${error ? `${error.status || 'no status'} ${error.message}` : 'no error'}`,
    );
  }
});

test('no Run and no error is silence, not a warning', () => {
  assert.equal(describeQirDurability({}), null);
  assert.equal(describeQirDurability(), null);
});

/*
 * THE ASSERTION THAT ACTUALLY PROTECTS THIS.
 *
 * The reason codes are a contract between two files that are never imported by
 * each other. A server reword would silently turn every branch above into dead
 * code while all five tests stayed green — a check that cannot fail (§4). So
 * tie the ends together, the way deployed-gate-contract.test.js does for its own
 * pair.
 */
test('[was-red] the server actually emits the reasons this module keys on', () => {
  const routes = ['../../api/qir-runs.ts', '../../api/qir-resources.ts', '../../api/qir-context.ts'];
  const sources = routes.map((route) => fs.readFileSync(new URL(route, import.meta.url), 'utf8'));

  /*
   * Asserted PER ROUTE, not across a join of all three.
   *
   * The first version of this check joined them, and passed when qir-runs.ts —
   * the only route the product actually calls — was reworded on its own, because
   * the two unreferenced routes still carried the old string. It was green for
   * exactly the drift it exists to catch (§4), and the two-way check is what
   * found it.
   */
  routes.forEach((route, index) => {
    for (const reason of [QIR_STORAGE_UNCONFIGURED, QIR_PERSIST_FAILED]) {
      assert.ok(
        sources[index].includes(`reason: "${reason}"`),
        `${route} no longer emits reason "${reason}", so the branch keyed on it in `
        + 'qir-durability.js is unreachable and the desk falls back to silence',
      );
    }
  });

  /*
   * And every 503 must carry one. An unlabelled 503 is exactly the state this
   * change removed: a real condition the client can only tell apart by matching
   * English prose.
   */
  sources.forEach((source, index) => {
    const unlabelled = (source.match(/status\(503\)\.json\(\{(?![^}]*reason:)[^}]*\}\)/g) || []);
    assert.equal(
      unlabelled.length,
      0,
      `${routes[index]} has ${unlabelled.length} unlabelled 503(s): ${unlabelled.join(' | ')}`,
    );
  });
});

test('the desk consumes the verdict rather than testing run truthiness', () => {
  /*
   * A unit cannot see a 5,000-line component drop the call. What it CAN see is
   * the old shape returning — `qirCoding.run ? ... : null` is precisely the bug,
   * because it renders an unconfigured runtime as nothing at all.
   */
  const studio = fs.readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  assert.match(studio, /describeQirDurability\(\{ \.\.\.qirCoding, previewChecks: deskPacket\?\.checks \|\| \[\] \}\)/, 'the desk must ask for the verdict using its visible Preview checks');
  assert.doesNotMatch(
    studio,
    /\{qirCoding\.run \? \(/,
    'the chip must not go back to rendering on run truthiness alone',
  );
  assert.match(studio, /data-quantora-qir-recording=/, 'and must expose it for the browser gates');
});

test('[was-red] the chip says WHICH write failure this is, when the store knew', () => {
  /*
   * "Rejected the last write" was true and unactionable. This chip is the only
   * place the operator ever sees the difference between a migration that never
   * ran, a policy refusing the service role, and a rotated key.
   */
  const described = describeQirDurability({
    error: Object.assign(new Error('nope'), {
      reason: QIR_PERSIST_FAILED,
      diagnosis: {
        cause: 'a row-level security policy is refusing the service role',
        remedy: 'grant the service role write access to the QIR tables',
      },
    }),
  });

  assert.equal(described.label, 'Run · not saved');
  assert.equal(described.recording, false);
  assert.match(described.detail, /rejected the last write/, 'the generic fact still leads');
  assert.match(described.detail, /row-level security policy is refusing the service role/, 'and the cause follows');
  assert.match(described.detail, /grant the service role write access/, 'with what to do about it');
});

test('[was-red] with no diagnosis the chip states the fact and invents nothing', () => {
  /*
   * §5. When the store could not classify, a guessed cause would send someone
   * to fix the wrong thing — worse than sending them to look.
   */
  for (const diagnosis of [undefined, null, {}, { cause: '' }]) {
    const described = describeQirDurability({
      error: Object.assign(new Error('nope'), { reason: QIR_PERSIST_FAILED, diagnosis }),
    });
    assert.match(described.detail, /rejected the last write/);
    assert.doesNotMatch(described.detail, /Most likely/, `must not guess a cause for ${JSON.stringify(diagnosis)}`);
    assert.doesNotMatch(described.detail, /undefined|\[object/, 'and must not leak a placeholder');
  }
});

test('a healthy Run is unaffected by any of this', () => {
  const described = describeQirDurability({ run: { runId: 'run-7', status: 'EXECUTING' } });
  assert.equal(described.label, 'Run · EXECUTING');
  assert.equal(described.recording, true);
  assert.doesNotMatch(described.detail, /Most likely/);
});
