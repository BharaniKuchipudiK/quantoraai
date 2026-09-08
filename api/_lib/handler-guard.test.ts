import assert from 'node:assert/strict';
import test from 'node:test';
import { guardHandler } from './handler-guard.js';

/*
 * THE AUTH ENTRYPOINT MAY NEVER FAIL BLANK (2026-09-07).
 *
 * Fourteen auth routes sit behind one function to fit the Hobby function
 * budget, and the frontend calls `?route=session` on load before anything
 * renders. Five of those routes — session, login, logout, providers,
 * github-start, exactly the set a first visit touches — carry no try/catch of
 * their own. An uncaught throw there is FUNCTION_INVOCATION_FAILED: no body,
 * no JSON, nothing the frontend can render. Sign-in does nothing, twice, and
 * the person leaves.
 *
 * The store was never the hazard — every Supabase call already returns null
 * instead of throwing. What is left is synchronous and total: a malformed
 * password hash, a JWT secret missing or too short, a body that is not the
 * JSON it claims to be.
 */

const mockRes = () => {
  const res: any = { statusCode: null, body: null, headersSent: false };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: any) => { res.body = body; return res; };
  return res;
};

test('INVARIANT: a throwing handler becomes a readable status, not a blank crash', async () => {
  const res = mockRes();
  const logged: string[] = [];
  const guarded = guardHandler(
    () => { throw new Error('jwt secret too short'); },
    { label: (req) => String(req?.query?.route || ''), log: (...a) => logged.push(a.join(' ')) },
  );

  await guarded({ query: { route: 'session' } }, res);

  assert.equal(res.statusCode, 503, 'the person must get a status, not FUNCTION_INVOCATION_FAILED');
  assert.match(String(res.body?.error || ''), /temporarily unavailable/i);
  assert.match(logged.join('\n'), /session/, 'the log must name the failing route');
});

test('INVARIANT: a rejected promise is caught too, not only a synchronous throw', async () => {
  // `await handler(...)` is what makes this work; `return handler(...)` would
  // pass the rejection straight through the try block.
  const res = mockRes();
  const guarded = guardHandler(async () => { throw new Error('async boom'); }, { log: () => {} });
  await guarded({ query: {} }, res);
  assert.equal(res.statusCode, 503);
});

test('the success path is untouched, return value included', async () => {
  const res = mockRes();
  const guarded = guardHandler((_req, r) => r.status(200).json({ user: 'ok' }), { log: () => {} });
  const returned = await guarded({ query: { route: 'session' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { user: 'ok' });
  assert.equal(returned, res, "the handler's own return value must pass straight back");
});

test('a crash mid-stream does not try to write a second set of headers', async () => {
  // Writing headers twice throws again, inside the catch — the net would then
  // have a hole exactly where a streamed reply failed.
  const res = mockRes();
  res.headersSent = true;
  res.status = () => { throw new Error('Cannot set headers after they are sent'); };
  const guarded = guardHandler(() => { throw new Error('died mid-stream'); }, { log: () => {} });
  await assert.doesNotReject(() => guarded({ query: {} }, res) as Promise<unknown>);
});

test('a label that throws does not punch a hole in the net', async () => {
  const res = mockRes();
  const guarded = guardHandler(
    () => { throw new Error('boom'); },
    { label: () => { throw new Error('label exploded'); }, log: () => {} },
  );
  await guarded({ query: {} }, res);
  assert.equal(res.statusCode, 503);
});
