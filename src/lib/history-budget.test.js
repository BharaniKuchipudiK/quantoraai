import assert from 'node:assert/strict';
import test from 'node:test';
import { HISTORY_BYTE_BUDGET, budgetHistory, describeHistoryBudget } from './history-budget.js';

/**
 * The bug this exists to stop.
 *
 * Every request carries the whole conversation. The server capped history at
 * 100 ITEMS and nothing capped its SIZE, while a Coding Desk turn carries the
 * full HTML document it built. A few pages, or one with inline data-URI images,
 * and the body passed the platform's request limit — where it is rejected
 * BEFORE the function runs, so no handler writes a JSON error and nothing
 * appears in any log. The browser reads a non-JSON body, the payload becomes
 * {}, and EVERY model appears to fail at once, including one that talks
 * straight to Google and was proved working an hour earlier.
 *
 * And retrying made it worse: each attempt added turns.
 */

const page = (n) => ({ sender: 'ai', text: `<!DOCTYPE html>${'x'.repeat(n)}</html>` });
const ask = (i) => ({ sender: 'user', text: `build me a page ${i}` });

test('a small conversation is passed through untouched', () => {
  const messages = [ask(1), page(500), ask(2)];
  const result = budgetHistory(messages);
  assert.deepEqual(result.history, messages);
  assert.equal(result.trimmed, 0);
  assert.equal(result.dropped, 0);
  assert.equal(describeHistoryBudget(result), '', 'nothing lost, nothing to say');
});

test('INVARIANT: the result always fits the budget', () => {
  // The whole point. Anything over is a request that cannot be sent, and a
  // session that gets more broken every time somebody retries it.
  const shapes = [
    Array.from({ length: 20 }, (_, i) => (i % 2 ? page(300_000) : ask(i))),
    Array.from({ length: 200 }, (_, i) => (i % 2 ? page(40_000) : ask(i))),
    [ask(1), page(5_000_000)],
    [page(9_000_000)],
  ];
  for (const messages of shapes) {
    const result = budgetHistory(messages);
    assert.ok(
      result.bytes <= HISTORY_BYTE_BUDGET,
      `${JSON.stringify(messages).length} -> ${result.bytes} exceeds the budget`,
    );
  }
});

test('bulk is summarised before any turn is dropped', () => {
  // An old assistant turn's giant code block is the least valuable thing in the
  // transcript — the files it produced travel separately in the VFS, so the
  // transcript copy is a duplicate. Losing it costs almost nothing; losing the
  // turn costs the shape of the conversation.
  const messages = Array.from({ length: 20 }, (_, i) => (i % 2 ? page(300_000) : ask(i)));
  const result = budgetHistory(messages);
  assert.ok(result.trimmed > 0);
  assert.equal(result.dropped, 0, 'trimming was enough');
  assert.equal(result.history.length, messages.length, 'every turn is still there');
});

test('the most recent exchange is never dropped', () => {
  // Without it there is no turn to answer.
  const messages = Array.from({ length: 100 }, (_, i) => page(200_000));
  messages.push(ask(999));
  const result = budgetHistory(messages);
  assert.ok(result.history.length >= 2);
  assert.equal(result.history[result.history.length - 1].text, 'build me a page 999');
});

test('recent turns keep their full text', () => {
  // Trimming the turn somebody is actively working on would make the model
  // answer about a version of the page that no longer exists.
  const messages = Array.from({ length: 30 }, (_, i) => (i % 2 ? page(200_000) : ask(i)));
  const result = budgetHistory(messages);
  const tail = result.history.slice(-4);
  assert.ok(tail.every((m) => !m.__trimmed), 'the working tail is verbatim');
});

test('INVARIANT: a trim is never silent', () => {
  // A platform that quietly forgets a conversation leaves somebody wondering
  // why it stopped remembering.
  const messages = Array.from({ length: 20 }, (_, i) => (i % 2 ? page(300_000) : ask(i)));
  const result = budgetHistory(messages);
  const trimmedMessage = result.history.find((m) => m.__trimmed);
  assert.match(trimmedMessage.text, /were trimmed to keep the conversation sendable/);
  assert.match(trimmedMessage.text, /files it produced are still on the desk/);
  assert.match(describeHistoryBudget(result), /got large enough to stop sending/);
});

test('the notice counts what was actually lost', () => {
  assert.match(describeHistoryBudget({ trimmed: 1, dropped: 0 }), /1 earlier turn\b/);
  assert.match(describeHistoryBudget({ trimmed: 3, dropped: 0 }), /3 earlier turns/);
  assert.match(describeHistoryBudget({ trimmed: 0, dropped: 1 }), /earliest 1 message\b/);
  assert.match(describeHistoryBudget({ trimmed: 2, dropped: 4 }), /earliest 4 messages and the long output of 2 earlier turns/);
});

test('an empty or absent transcript is an answer, not a crash', () => {
  for (const input of [[], null, undefined]) {
    const result = budgetHistory(input);
    assert.deepEqual(result.history, []);
    assert.equal(result.bytes, 0);
  }
});

test('one enormous turn is summarised rather than making the request unsendable', () => {
  // A pasted file, or an image inlined as a data URI. Summarising the last
  // exchange is a real loss and a smaller one than a request that cannot be
  // sent at all.
  const result = budgetHistory([ask(1), page(6_000_000)]);
  assert.ok(result.bytes <= HISTORY_BYTE_BUDGET);
  assert.ok(result.history.length >= 1);
});
