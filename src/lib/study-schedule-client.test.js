import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStudyScheduleBlock,
  deleteStudyScheduleBlock,
  loadStudySchedule,
  updateStudyScheduleBlock,
} from './study-schedule-client.js';

test('Study Schedule client keeps reads bounded and mutations authenticated', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  const block = {
    id: '22222222-2222-4222-8222-222222222222',
    subject: 'Physics',
    topic: 'Motion graphs',
    title: 'Velocity review',
    startsAt: '2026-09-07T10:00:00.000Z',
    endsAt: '2026-09-07T11:00:00.000Z',
    kind: 'study',
    status: 'planned',
    notes: '',
  };

  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (init.method === 'GET') return new Response(JSON.stringify({ blocks: [block] }), { status: 200 });
    if (init.method === 'DELETE') return new Response(JSON.stringify({ deleted: true }), { status: 200 });
    return new Response(JSON.stringify({ block }), { status: init.method === 'POST' ? 201 : 200 });
  };

  try {
    const blocks = await loadStudySchedule({
      from: '2026-09-07T00:00:00.000Z',
      to: '2026-09-14T00:00:00.000Z',
    });
    assert.equal(blocks.length, 1);
    await createStudyScheduleBlock(block);
    await updateStudyScheduleBlock(block);
    await deleteStudyScheduleBlock(block.id);

    assert.equal(calls.length, 4);
    assert.match(calls[0].url, /^\/api\/study-schedule\?from=/);
    assert.match(calls[0].url, /&to=/);
    assert.deepEqual(calls.map((call) => call.init.method), ['GET', 'POST', 'PATCH', 'DELETE']);
    for (const call of calls) assert.equal(call.init.credentials, 'include');
    assert.deepEqual(JSON.parse(calls[3].init.body), { id: block.id });
  } finally {
    global.fetch = originalFetch;
  }
});
