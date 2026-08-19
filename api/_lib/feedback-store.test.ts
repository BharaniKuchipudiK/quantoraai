import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

const {
  isFeedbackStatus,
  listUserFeedback,
  updateUserFeedbackStatus,
} = await import('./feedback-store.js');

test('feedback status validation accepts only the workflow states', () => {
  for (const value of ['new', 'reviewed', 'planned', 'done', 'closed']) {
    assert.equal(isFeedbackStatus(value), true, value);
  }
  for (const value of ['', 'deleted', 'admin', null, 42]) {
    assert.equal(isFeedbackStatus(value), false, String(value));
  }
});

test('admin feedback list normalizes embedded user identity and newest-first query', async () => {
  const original = global.fetch;
  const calls: string[] = [];
  global.fetch = (async (url: any) => {
    calls.push(String(url));
    return new Response(JSON.stringify([{
      id: '123e4567-e89b-42d3-a456-426614174000',
      user_sub: 'google-123',
      feedback_type: 'suggestion',
      message: 'Add a project timeline view',
      page_path: '/studio',
      surface: 'studio-sidebar',
      status: 'planned',
      created_at: '2026-08-19T00:00:00.000Z',
      users: { name: 'Bharani', email: 'b@example.com', picture: null },
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;

  try {
    const items = await listUserFeedback(50);
    assert.ok(items);
    assert.equal(items.length, 1);
    assert.equal(items[0].feedbackType, 'suggestion');
    assert.equal(items[0].status, 'planned');
    assert.equal(items[0].user?.email, 'b@example.com');
    assert.match(calls[0], /order=created_at\.desc/);
    assert.match(calls[0], /limit=50/);
    assert.match(decodeURIComponent(calls[0]), /users\(name,email,picture\)/);
  } finally {
    global.fetch = original;
  }
});

test('admin feedback list falls back to unenriched rows if relationship embedding fails', async () => {
  const original = global.fetch;
  let attempt = 0;
  global.fetch = (async () => {
    attempt += 1;
    if (attempt === 1) return new Response('relationship unavailable', { status: 400 });
    return new Response(JSON.stringify([{
      id: '123e4567-e89b-42d3-a456-426614174001',
      user_sub: 'google-456',
      feedback_type: 'feedback',
      message: 'The toolbar feels crowded',
      page_path: '/studio',
      surface: 'studio-sidebar',
      status: 'new',
      created_at: '2026-08-19T01:00:00.000Z',
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;

  try {
    const items = await listUserFeedback();
    assert.ok(items);
    assert.equal(attempt, 2);
    assert.equal(items[0].user, null);
    assert.equal(items[0].message, 'The toolbar feels crowded');
  } finally {
    global.fetch = original;
  }
});

test('status updates are scoped to one valid UUID and request representation', async () => {
  const original = global.fetch;
  const calls: Array<{ url: string; init: any }> = [];
  global.fetch = (async (url: any, init: any = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify([{
      id: '123e4567-e89b-42d3-a456-426614174002',
      user_sub: 'google-789',
      feedback_type: 'feedback',
      message: 'Improve presentation templates',
      page_path: '/studio',
      surface: 'studio-sidebar',
      status: 'reviewed',
      created_at: '2026-08-19T02:00:00.000Z',
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;

  try {
    const item = await updateUserFeedbackStatus('123e4567-e89b-42d3-a456-426614174002', 'reviewed');
    assert.ok(item);
    assert.equal(item.status, 'reviewed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.method, 'PATCH');
    assert.match(calls[0].url, /user_feedback\?id=eq\.123e4567-e89b-42d3-a456-426614174002$/);
    assert.deepEqual(JSON.parse(calls[0].init.body), { status: 'reviewed' });
    assert.equal(calls[0].init.headers.Prefer, 'return=representation');
  } finally {
    global.fetch = original;
  }
});

test('status update rejects invalid ids before touching the store', async () => {
  const original = global.fetch;
  let called = false;
  global.fetch = (async () => {
    called = true;
    return new Response('[]', { status: 200 });
  }) as any;

  try {
    assert.equal(await updateUserFeedbackStatus('not-a-uuid', 'done'), null);
    assert.equal(called, false);
  } finally {
    global.fetch = original;
  }
});
