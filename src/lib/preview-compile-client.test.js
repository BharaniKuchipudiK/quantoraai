import assert from 'node:assert/strict';
import test from 'node:test';
import { requestPreviewCompilation } from './preview-compile-client.js';

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test('preview compile HTTP 422 preserves the safe compiler message and becomes terminal failure metadata', async () => {
  await assert.rejects(
    () => requestPreviewCompilation({
      vfs: { 'src/main.jsx': { content: 'broken' } },
      correlationId: 'studio-hira-422',
      fetchFn: async () => jsonResponse(422, { error: 'Expected ";" but found "import"' }),
    }),
    (error) => {
      assert.equal(error?.code, 'compile-http-error');
      assert.equal(error?.httpStatus, 422);
      assert.match(error?.message || '', /Expected ";" but found "import"/);
      return true;
    },
  );
});

test('a hung preview compile request is aborted by the client deadline instead of staying pending', async () => {
  const startedAt = Date.now();
  await assert.rejects(
    () => requestPreviewCompilation({
      vfs: { 'src/main.jsx': { content: 'export default 1' } },
      correlationId: 'studio-timeout',
      timeoutMs: 20,
      fetchFn: async (_url, options = {}) => new Promise((resolve, reject) => {
        void resolve;
        options.signal?.addEventListener('abort', () => {
          const aborted = new Error('aborted');
          aborted.name = 'AbortError';
          reject(aborted);
        }, { once: true });
      }),
    }),
    (error) => {
      assert.equal(error?.code, 'compile-timeout');
      assert.match(error?.message || '', /timed out/i);
      return true;
    },
  );
  assert.ok(Date.now() - startedAt < 1_000, 'deadline test must fail quickly rather than hanging');
});

test('caller abort is distinguished from a compile timeout', async () => {
  const controller = new AbortController();
  const pending = requestPreviewCompilation({
    vfs: { 'src/main.jsx': { content: 'export default 1' } },
    correlationId: 'studio-unmount',
    timeoutMs: 2_000,
    signal: controller.signal,
    fetchFn: async (_url, options = {}) => new Promise((resolve, reject) => {
      void resolve;
      options.signal?.addEventListener('abort', () => {
        const aborted = new Error('aborted');
        aborted.name = 'AbortError';
        reject(aborted);
      }, { once: true });
    }),
  });
  controller.abort();
  await assert.rejects(pending, (error) => {
    assert.equal(error?.code, 'compile-aborted');
    return true;
  });
});
