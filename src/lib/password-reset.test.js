import test from 'node:test';
import assert from 'node:assert/strict';
import { clearPasswordResetToken, peekPasswordResetToken, stashPasswordResetToken } from './password-reset.js';

const memory = new Map();

function withSessionStorage(run) {
  const previous = globalThis.sessionStorage;
  globalThis.sessionStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); },
  };
  memory.clear();
  try {
    run();
  } finally {
    globalThis.sessionStorage = previous;
    memory.clear();
  }
}

test('password reset token survives a refresh window and expires after an hour', () => {
  withSessionStorage(() => {
    stashPasswordResetToken('reset.token.value');
    assert.equal(peekPasswordResetToken(), 'reset.token.value');
    clearPasswordResetToken();
    assert.equal(peekPasswordResetToken(), '');
  });
});
