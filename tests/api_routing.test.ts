import test from 'node:test';
import assert from 'node:assert';
import { generateGeminiContentWithRouting, TelemetryEvent } from '../lib/routingHelper.js';

test('Routing Helper - Successful primary model', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async (url: any, init: any) => {
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Success from primary' }] } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const events: TelemetryEvent[] = [];
    const result = await generateGeminiContentWithRouting(
      'fake-key', 
      [{ role: 'user', parts: [{ text: 'test' }] }], 
      'test instructions',
      (e) => events.push(e)
    );

    assert.strictEqual(result.usedModel, 'gemini-3.6-flash');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].success, true);
    assert.strictEqual(events[0].model, 'gemini-3.6-flash');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Routing Helper - Fallback after primary failure', async (t) => {
  const originalFetch = global.fetch;
  let callCount = 0;
  
  global.fetch = async (url: any, init: any) => {
    callCount++;
    if (callCount === 1) {
      return new Response(JSON.stringify({ error: { message: '429 Too Many Requests' } }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Success from secondary' }] } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const events: TelemetryEvent[] = [];
    const result = await generateGeminiContentWithRouting(
      'fake-key', 
      [{ role: 'user', parts: [{ text: 'test' }] }], 
      'test instructions',
      (e) => events.push(e)
    );

    assert.strictEqual(result.usedModel, 'gemini-3.5-flash');
    assert.strictEqual(events.length, 2);
    
    assert.strictEqual(events[0].success, false);
    assert.strictEqual(events[0].model, 'gemini-3.6-flash');
    assert.ok(events[0].error?.includes('429'));

    assert.strictEqual(events[1].success, true);
    assert.strictEqual(events[1].model, 'gemini-3.5-flash');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Routing Helper - All models fail', async (t) => {
  const originalFetch = global.fetch;
  
  global.fetch = async (url: any, init: any) => {
    return new Response(JSON.stringify({ error: { message: '500 Internal Server Error' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const events: TelemetryEvent[] = [];
    
    try {
      await generateGeminiContentWithRouting(
        'fake-key', 
        [{ role: 'user', parts: [{ text: 'test' }] }], 
        'test instructions',
        (e) => events.push(e)
      );
      assert.fail('Should have thrown an error');
    } catch (err: any) {
      assert.ok(err.message.includes('500 Internal Server Error'));
    }

    assert.strictEqual(events.length, 4);
    assert.ok(events.every(e => e.success === false));
  } finally {
    global.fetch = originalFetch;
  }
});
