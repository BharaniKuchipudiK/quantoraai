import assert from 'node:assert/strict';
import test from 'node:test';
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

test('idle timeout rejects a stalled reader', async () => {
  const reader = { read: () => new Promise<any>(() => {}) };
  await assert.rejects(() => readWithIdleTimeout(reader, 20, 'test stream'), /idle/i);
});

test('remaining request budget never goes negative', () => {
  assert.equal(remainingBudgetMs(Date.now() - 100, 50), 0);
});
