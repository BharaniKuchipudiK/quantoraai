import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

const { readModelRegistryCached, clearModelRegistryCache } = await import('./model-store.js');

function mockFetch(rows) {
  let calls = 0;
  const original = global.fetch;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { restore: () => { global.fetch = original; }, count: () => calls };
}

test('readModelRegistryCached hits the store once, then serves from cache within TTL', async () => {
  clearModelRegistryCache();
  const rows = [{ id: 'm1', approved: true, lifecycle: 'available' }];
  const fetchMock = mockFetch(rows);
  try {
    const a = await readModelRegistryCached();
    const b = await readModelRegistryCached();
    const c = await readModelRegistryCached();
    assert.deepEqual(a, rows);
    assert.deepEqual(c, rows);
    assert.equal(fetchMock.count(), 1, 'three reads → one network call');
  } finally {
    fetchMock.restore();
    clearModelRegistryCache();
  }
});

test('a zero TTL always refetches (cache disabled)', async () => {
  clearModelRegistryCache();
  const fetchMock = mockFetch([{ id: 'm1' }]);
  try {
    await readModelRegistryCached(0);
    await readModelRegistryCached(0);
    assert.equal(fetchMock.count(), 2, 'ttl=0 → no caching');
  } finally {
    fetchMock.restore();
    clearModelRegistryCache();
  }
});

test('an empty result is not cached (transient failure must not blind routing)', async () => {
  clearModelRegistryCache();
  const fetchMock = mockFetch([]); // store momentarily returns nothing
  try {
    await readModelRegistryCached();
    await readModelRegistryCached();
    assert.equal(fetchMock.count(), 2, 'empty reads are retried, not cached');
  } finally {
    fetchMock.restore();
    clearModelRegistryCache();
  }
});
