import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.GITHUB_CONNECTION_SECRET = 'x'.repeat(32);

const {
  readGithubAutoDeliverEnabled,
  setGithubAutoDeliverEnabled,
  readGithubConnectionSummary,
} = await import('./github-connection-store.js');

function response(rows: any[], ok = true, status = 200) {
  return { ok, status, json: async () => rows } as any;
}

test('Auto Deliver is false when there is no GitHub connection', async () => {
  const original = globalThis.fetch;
  (globalThis as any).fetch = async () => response([]);
  try {
    assert.equal(await readGithubAutoDeliverEnabled('user-1'), false);
  } finally {
    globalThis.fetch = original;
  }
});

test('reads Auto Deliver independently from Auto PR', async () => {
  const original = globalThis.fetch;
  let call = 0;
  (globalThis as any).fetch = async () => {
    call += 1;
    if (call === 1) return response([{ github_login: 'octocat', sealed_token: 'sealed', scopes: ['repo'], connected_at: null }]);
    return response([{ auto_pr_enabled: true, auto_deliver_enabled: false }]);
  };
  try {
    assert.equal(await readGithubAutoDeliverEnabled('user-1'), false);
  } finally {
    globalThis.fetch = original;
  }
});

test('reads true only from the stored Auto Deliver flag', async () => {
  const original = globalThis.fetch;
  let call = 0;
  (globalThis as any).fetch = async () => {
    call += 1;
    if (call === 1) return response([{ github_login: 'octocat', sealed_token: 'sealed', scopes: ['repo'], connected_at: null }]);
    return response([{ auto_pr_enabled: false, auto_deliver_enabled: true }]);
  };
  try {
    assert.equal(await readGithubAutoDeliverEnabled('user-1'), true);
  } finally {
    globalThis.fetch = original;
  }
});

test('missing optional migration fails closed without losing the core connection row', async () => {
  const original = globalThis.fetch;
  let call = 0;
  (globalThis as any).fetch = async () => {
    call += 1;
    if (call === 1) return response([{ github_login: 'octocat', sealed_token: 'not-openable', scopes: ['repo'], connected_at: null }]);
    return response([], false, 400);
  };
  try {
    assert.equal(await readGithubAutoDeliverEnabled('user-1'), false);
    call = 0;
    const summary = await readGithubConnectionSummary('user-1');
    assert.equal(typeof summary.autoDeliverEnabled, 'boolean');
  } finally {
    globalThis.fetch = original;
  }
});

test('setting Auto Deliver PATCHes only the delivery flag for this user', async () => {
  const original = globalThis.fetch;
  const requests: any[] = [];
  (globalThis as any).fetch = async (url: string, init: any = {}) => {
    requests.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    return response([]);
  };
  try {
    assert.equal(await setGithubAutoDeliverEnabled('user-1', true), true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'PATCH');
    assert.match(requests[0].url, /user_sub=eq\.user-1/);
    assert.deepEqual(Object.keys(requests[0].body).sort(), ['auto_deliver_enabled', 'updated_at']);
    assert.equal(requests[0].body.auto_deliver_enabled, true);
    assert.equal('auto_pr_enabled' in requests[0].body, false);
  } finally {
    globalThis.fetch = original;
  }
});
