import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * A full localStorage used to end all persistence silently: the quota error was
 * swallowed, so every save after the first failure was a no-op and the user
 * refreshed into an older state with no warning. Chat history is irreplaceable;
 * a desk snapshot is a regenerable build artifact worth up to 800k chars. The
 * fix sheds desk snapshots oldest-first and retries, so the conversation
 * survives a full disk.
 */

const STORAGE_KEY = 'quantora_chat_sessions';

/** localStorage stub with a byte budget, so quota is exercised for real. */
function makeStorage(limitChars) {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    removeItem: (k) => map.delete(k),
    setItem: (k, v) => {
      let total = String(v).length;
      for (const [key, val] of map) if (key !== k) total += String(val).length;
      if (total > limitChars) {
        const err = new Error('exceeded the quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(k, String(v));
    },
  };
}

function sessionWithDesk(id, createdAt, deskChars) {
  return {
    id,
    title: `Chat ${id}`,
    createdAt,
    messages: [{ sender: 'user', text: `important conversation ${id}` }],
    desk: { snapshot: 'x'.repeat(deskChars) },
  };
}

async function freshModule() {
  // Bust the module cache so each test gets its own fault state.
  return import(`./useStudioSession.js?t=${Math.random()}`);
}

test('a full disk sheds regenerable desk snapshots but KEEPS the chat history', async () => {
  const storage = makeStorage(2_000);
  globalThis.localStorage = storage;
  const mod = await freshModule();

  const sessions = [
    sessionWithDesk('a', 1, 1_500),
    sessionWithDesk('b', 2, 1_500),
  ];
  // Both desks cannot fit; without eviction this write is lost entirely.
  mod.__testables?.persistSessions?.(sessions);

  const written = storage.getItem(STORAGE_KEY);
  assert.ok(written, 'the write must succeed rather than silently no-op');
  const parsed = JSON.parse(written);
  assert.equal(parsed.length, 2, 'no conversation may be dropped');
  assert.match(written, /important conversation a/, 'history for the oldest chat survives');
  assert.match(written, /important conversation b/, 'history for the newest chat survives');

  const fault = mod.readStudioStorageFault();
  assert.equal(fault?.kind, 'evicted', 'the recovery is recorded, not silent');
  assert.ok(fault.deskSnapshotsDropped >= 1);
});

test('an unparseable blob is preserved, not overwritten', async () => {
  const storage = makeStorage(10_000);
  storage.map.set(STORAGE_KEY, '{ this is not json');
  globalThis.localStorage = storage;
  const mod = await freshModule();

  const restored = mod.__testables?.loadSessions?.({ sender: 'ai', text: 'hi' });
  assert.ok(Array.isArray(restored), 'still returns a usable session list');

  assert.equal(
    storage.getItem(`${STORAGE_KEY}_corrupt`),
    '{ this is not json',
    'the raw bytes are kept so the history can be recovered',
  );
  assert.equal(mod.readStudioStorageFault()?.kind, 'corrupt');
});

test('an eviction notifies subscribers, so the UI can state the loss', async () => {
  // Codex was right that a module variable nobody reads is still a silent loss.
  // The hook subscribes to this and renders a banner; assert the signal fires
  // with the count, so a future refactor cannot quietly detach the UI again.
  const storage = makeStorage(2_000);
  globalThis.localStorage = storage;
  const mod = await freshModule();

  const seen = [];
  const unsubscribe = mod.subscribeStudioStorageFault((fault) => seen.push(fault));

  mod.__testables.persistSessions([
    sessionWithDesk('a', 1, 1_500),
    sessionWithDesk('b', 2, 1_500),
  ]);

  const evicted = seen.find((fault) => fault?.kind === 'evicted');
  assert.ok(evicted, 'subscribers must be told the desk snapshots were dropped');
  assert.ok(evicted.deskSnapshotsDropped >= 1, 'the count drives the wording shown to the user');
  unsubscribe();
});
