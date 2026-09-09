import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPclMemoryConsentIntent,
  readActivePclSessionId,
  readPclConversationEnvelope,
  rememberActivePclSession,
  setPclSessionMemoryConsent,
  updatePclSessionOutcomeVersion,
} from './pcl-session-runtime.js';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('PCL session envelope carries identity but defaults durable memory off', () => {
  const storage = memoryStorage({
    quantora_chat_sessions: JSON.stringify([{ id: 'session-1', projectId: 'project-1', memoryConsented: false }]),
  });
  rememberActivePclSession('session-1', storage);
  const envelope = readPclConversationEnvelope({ sessionId: 'session-1', sessionContext: { projectId: 'project-1' }, storage });
  assert.deepEqual(envelope, { sessionId: 'session-1', projectId: 'project-1', memoryConsented: false });
  assert.equal(readActivePclSessionId(storage), 'session-1');
});

test('explicit session-memory consent is persisted without storing transcript content', () => {
  const storage = memoryStorage({
    quantora_chat_sessions: JSON.stringify([{ id: 'session-1', projectId: 'project-1', messages: [{ text: 'hello' }], memoryConsented: false }]),
  });
  assert.equal(setPclSessionMemoryConsent('session-1', true, storage), true);
  const envelope = readPclConversationEnvelope({ sessionId: 'session-1', storage });
  assert.equal(envelope.memoryConsented, true);
  assert.equal(updatePclSessionOutcomeVersion('session-1', 4, storage), true);
  const stored = JSON.parse(storage.getItem('quantora_chat_sessions'))[0];
  assert.equal(stored.outcomeVersion, 4);
  assert.equal(stored.messages[0].text, 'hello');
});

test('memory consent intent is explicit and supports revocation', () => {
  assert.equal(detectPclMemoryConsentIntent('Remember this for later.'), 'grant');
  assert.equal(detectPclMemoryConsentIntent('Save that to memory.'), 'grant');
  assert.equal(detectPclMemoryConsentIntent('Forget this conversation.'), 'revoke');
  assert.equal(detectPclMemoryConsentIntent('Please answer this normally.'), null);
});

test('PCL active identity and memory consent are account-scoped', () => {
  const storage = memoryStorage({
    'quantora_chat_sessions:account:account-a': JSON.stringify([{ id: 'session-a', projectId: 'project-a', memoryConsented: true }]),
    'quantora_chat_sessions:account:account-b': JSON.stringify([{ id: 'session-b', projectId: 'project-b', memoryConsented: false }]),
  });
  rememberActivePclSession('session-a', storage, 'account-a');
  rememberActivePclSession('session-b', storage, 'account-b');
  assert.equal(readActivePclSessionId(storage, 'account-a'), 'session-a');
  assert.equal(readActivePclSessionId(storage, 'account-b'), 'session-b');
  assert.equal(readPclConversationEnvelope({ sessionId: 'session-a', storage, accountScope: 'account-a' }).memoryConsented, true);
  assert.equal(readPclConversationEnvelope({ sessionId: 'session-a', storage, accountScope: 'account-b' }).memoryConsented, false);
  assert.equal(setPclSessionMemoryConsent('session-b', true, storage, 'account-b'), true);
  assert.equal(readPclConversationEnvelope({ sessionId: 'session-b', storage, accountScope: 'account-b' }).memoryConsented, true);
  assert.equal(readPclConversationEnvelope({ sessionId: 'session-a', storage, accountScope: 'account-a' }).memoryConsented, true);
});
