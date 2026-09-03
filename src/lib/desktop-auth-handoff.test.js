import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDesktopGrantPath,
  clearDesktopAuthHandoff,
  peekDesktopAuthHandoff,
  readDesktopAuthHandoff,
  stashDesktopAuthHandoff,
  stripDesktopAuthParams,
} from './desktop-auth-handoff.js';
import { DESKTOP_AUTH_GRANT_PATH } from '../../shared/desktop-contract.js';

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'; // 43 base64url chars
const STATE = 'desktop-state-0123456789';

function withSessionStorage(fn) {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    fn();
  } finally {
    delete globalThis.sessionStorage;
  }
}

test('a valid handoff is read from the query string and an invalid one is ignored', () => {
  assert.deepEqual(
    readDesktopAuthHandoff(`?desktop_auth=1&challenge=${CHALLENGE}&state=${STATE}`),
    { challenge: CHALLENGE, state: STATE },
  );
  assert.equal(readDesktopAuthHandoff(`?challenge=${CHALLENGE}&state=${STATE}`), null, 'flag required');
  assert.equal(readDesktopAuthHandoff(`?desktop_auth=1&challenge=short&state=${STATE}`), null, 'challenge shape enforced');
  assert.equal(readDesktopAuthHandoff(`?desktop_auth=1&challenge=${CHALLENGE}&state=<script>`), null, 'state charset enforced');
  assert.equal(readDesktopAuthHandoff(''), null);
});

test('the handoff survives a page round-trip in sessionStorage until cleared', () => {
  withSessionStorage(() => {
    assert.equal(peekDesktopAuthHandoff(), null);
    stashDesktopAuthHandoff({ challenge: CHALLENGE, state: STATE });
    assert.deepEqual(peekDesktopAuthHandoff(), { challenge: CHALLENGE, state: STATE });
    assert.deepEqual(peekDesktopAuthHandoff(), { challenge: CHALLENGE, state: STATE }, 'peek does not consume');
    clearDesktopAuthHandoff();
    assert.equal(peekDesktopAuthHandoff(), null);
  });
});

test('a corrupted stash reads as no handoff rather than throwing', () => {
  withSessionStorage(() => {
    globalThis.sessionStorage.setItem('quantora_desktop_auth', '{not json');
    assert.equal(peekDesktopAuthHandoff(), null);
    globalThis.sessionStorage.setItem('quantora_desktop_auth', JSON.stringify({ challenge: 'x', state: STATE }));
    assert.equal(peekDesktopAuthHandoff(), null);
  });
});

test('the grant path is same-origin and carries exactly the two parameters the API validates', () => {
  const path = buildDesktopGrantPath({ challenge: CHALLENGE, state: STATE });
  assert.ok(path.startsWith(`${DESKTOP_AUTH_GRANT_PATH}?`));
  const params = new URLSearchParams(path.split('?')[1]);
  assert.deepEqual([...params.keys()].sort(), ['challenge', 'state']);
  assert.equal(params.get('challenge'), CHALLENGE);
  assert.equal(params.get('state'), STATE);
});

test('stripping the handoff leaves every other parameter untouched', () => {
  const stripped = stripDesktopAuthParams(`https://quantoraai.app/?tab=hub&desktop_auth=1&challenge=${CHALLENGE}&state=${STATE}#x`);
  assert.equal(stripped, '/?tab=hub#x');
});
