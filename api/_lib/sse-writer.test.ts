import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { SseWriter, readWithIdleTimeout, remainingBudgetMs } from './sse-writer.js';

function fakeResponse() {
  const chunks: string[] = [];
  let writeHeadCount = 0;
  let endCount = 0;
  const response: any = {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    writeHead(status: number) {
      assert.equal(status, 200);
      writeHeadCount += 1;
      response.headersSent = true;
    },
    write(chunk: string) {
      chunks.push(chunk);
    },
    end() {
      endCount += 1;
      response.writableEnded = true;
    },
  };
  return {
    response,
    chunks,
    counts: () => ({ writeHeadCount, endCount }),
  };
}

test('SSE failure after text sends one structured error and closes once', () => {
  const fixture = fakeResponse();
  const stream = new SseWriter(fixture.response);

  stream.text('partial answer');
  stream.fail({ message: 'provider failed', code: 'UPSTREAM_FAILURE', requestId: 'req-1' });
  stream.fail({ message: 'duplicate failure' });

  assert.equal(fixture.counts().writeHeadCount, 1);
  assert.equal(fixture.counts().endCount, 1);
  const body = fixture.chunks.join('');
  assert.match(body, /partial answer/);
  assert.match(body, /UPSTREAM_FAILURE/);
  assert.match(body, /\[DONE\]/);
  assert.equal((body.match(/\[DONE\]/g) || []).length, 1);
});

test('status heartbeats do not mark the stream as committed', () => {
  const fixture = fakeResponse();
  const stream = new SseWriter(fixture.response);
  stream.status({ phase: 'build', state: 'generating' });
  assert.equal(stream.isStarted, true);
  assert.equal(stream.isCommitted, false);
  stream.text('hello');
  assert.equal(stream.isCommitted, true);
});

test('done is idempotent', () => {
  const fixture = fakeResponse();
  const stream = new SseWriter(fixture.response);
  stream.done({ provider: 'Synthetic' });
  stream.done({ provider: 'Should not appear' });
  assert.equal(fixture.counts().writeHeadCount, 1);
  assert.equal(fixture.counts().endCount, 1);
  assert.doesNotMatch(fixture.chunks.join(''), /Should not appear/);
});

test('[was-red] successful chat keeps the socket open until its terminal trace settles', async () => {
  const fixture = fakeResponse();
  let release!: (value: boolean) => void;
  let sinkPayload: any = null;
  const sink = (payload: unknown) => {
    sinkPayload = payload;
    return new Promise<boolean>((resolve) => { release = resolve; });
  };
  const stream = new SseWriter(fixture.response, sink);

  stream.done({
    provider: 'OpenRouter (anthropic/claude-opus-5)',
    correlationId: 'studio-12345678',
    modelId: 'anthropic/claude-opus-5',
    latencyMs: 321,
  });

  assert.equal(stream.isFinished, true, 'no later write may race the terminal state');
  assert.equal(fixture.counts().endCount, 0, 'the response must not end while the durable write is still pending');
  assert.match(fixture.chunks.join(''), /\[DONE\]/, 'the client receives the terminal marker before the bookkeeping wait');
  assert.equal(sinkPayload.correlationId, 'studio-12345678');

  release(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.counts().endCount, 1, 'the socket closes as soon as the terminal row has settled');
});

test('idle timeout rejects a stalled reader', async () => {
  const reader = { read: () => new Promise<any>(() => {}) };
  await assert.rejects(() => readWithIdleTimeout(reader, 20, 'test stream'), /idle/i);
});

test('remaining request budget never goes negative', () => {
  assert.equal(remainingBudgetMs(Date.now() - 100, 50), 0);
});

/*
 * A FAILURE MUST NAME THE ENGINES IT BURNED.
 *
 * chat-handler.ts plans an inference ladder and works down its own rungs behind
 * one browser request, so a build turn routinely spends two engines before the
 * desk sees a single failure. Which rungs burned was carried only inside a
 * human-readable failover label — and prose is invisible to routing, the lesson
 * src/lib/coding-outcome-spine.js already records for its retry chip. So the
 * desk counted one attempt, under-reported what it tried, and told the durable
 * mission the other rungs were still fresh.
 */
test('a stream failure carries the engines the turn actually ran, as data', () => {
  const fixture = fakeResponse();
  const stream = new SseWriter(fixture.response);
  stream.fail({
    message: 'Quantora could not reach a healthy AI route for this turn.',
    code: 'CHAT_STREAM_FAILURE',
    retryable: true,
    spentEngineIds: ['gemini-flash-latest', 'nvidia/nemotron-3-super-120b-a12b:free'],
  });

  const errorEvent = fixture.chunks
    .map((chunk) => chunk.replace(/^data: /, '').trim())
    .filter((body) => body && body !== '[DONE]')
    .map((body) => JSON.parse(body))
    .find((payload) => payload.error);
  assert.ok(errorEvent, `no structured error was streamed. Got: ${fixture.chunks.join('')}`);
  assert.deepEqual(
    errorEvent.error.spentEngineIds,
    ['gemini-flash-latest', 'nvidia/nemotron-3-super-120b-a12b:free'],
    'the desk cannot avoid repeating a rung it was never told about',
  );
});

test('a failure with no engines to report claims none', () => {
  const fixture = fakeResponse();
  const stream = new SseWriter(fixture.response);
  stream.fail({ message: 'Quantora could not complete this request.' });

  const errorEvent = fixture.chunks
    .map((chunk) => chunk.replace(/^data: /, '').trim())
    .filter((body) => body && body !== '[DONE]')
    .map((body) => JSON.parse(body))
    .find((payload) => payload.error);
  assert.equal(
    'spentEngineIds' in errorEvent.error,
    false,
    'an absent field is honest; an empty array would read as "we tried nothing"',
  );
});

test('the chat handler reports every rung it burned, not just the one it started on', () => {
  /*
   * The writer can carry the field; this is whether the handler fills it. A
   * behavioural test cannot see a set that is never populated, and that blind
   * spot is exactly how the server's rungs stayed invisible.
   */
  const handler = readFileSync(new URL('./chat-handler.ts', import.meta.url), 'utf8');
  assert.match(handler, /spentEngineIds\.add\(route\.id\)/, 'a rung that ran and failed must be recorded');
  assert.match(handler, /spentEngineIds: \[\.\.\.spentEngineIds\]/, 'and reported to the desk');
  assert.doesNotMatch(
    handler,
    /spentEngineIds: \[\]/,
    'a hardcoded empty list would satisfy every other assertion here while reporting nothing',
  );
});