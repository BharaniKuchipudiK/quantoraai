import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  byokRequestHeaders,
  clearClientSecrets,
  clientSecretStatus,
  getClientSecret,
  setClientSecret,
  BYOK_HEADER_GEMINI,
  BYOK_HEADER_OPENROUTER,
} from './client-secrets.js';

test('status reports whether a key is in play, and never what it is', () => {
  /*
   * WHY THIS EXISTS. memorySecrets is module scope, so a page reload empties
   * it — the intended posture, since localStorage is readable by every
   * same-origin script. But nothing could SEE that: the card cleared its inputs
   * after saving and re-mounted empty, so after a refresh the screen looked
   * identical whether a key was active or gone. BYOK was reported "not working"
   * on 2026-09-07 and this was why: the key was dropped silently and every turn
   * fell back to the platform's shared key, which everyone else draws on too.
   */
  clearClientSecrets();
  assert.deepEqual(clientSecretStatus(), { gemini: false, openrouter: false });

  setClientSecret('gemini', 'AIza-super-secret-value');
  assert.deepEqual(clientSecretStatus(), { gemini: true, openrouter: false });

  const reported = JSON.stringify(clientSecretStatus());
  assert.doesNotMatch(reported, /AIza/, 'presence is one bit; the value never crosses this boundary');
  assert.doesNotMatch(reported, /secret/i);
  assert.equal(reported.includes('23'), false, 'not a length either — a length is a credential detail');

  setClientSecret('openrouter', 'sk-or-v1-another');
  assert.deepEqual(clientSecretStatus(), { gemini: true, openrouter: true });

  clearClientSecrets();
  assert.deepEqual(clientSecretStatus(), { gemini: false, openrouter: false },
    'clearing must be visible too, or the display lies in the other direction');
});

test('a blank or whitespace key is not a key', () => {
  // Otherwise the card would report "your key is in use" for a stray space, and
  // the person would never look again at the reason their turns cost the shared
  // budget.
  clearClientSecrets();
  setClientSecret('gemini', '   ');
  assert.equal(clientSecretStatus().gemini, false);
  assert.equal(getClientSecret('gemini'), '');
  clearClientSecrets();
});

test('status agrees with what actually travels on the request', () => {
  /*
   * The display and the send path must never disagree: a card saying "in use"
   * while no header goes out is the exact silent failure being fixed, wearing a
   * green dot.
   */
  clearClientSecrets();
  assert.equal(BYOK_HEADER_GEMINI in byokRequestHeaders({}), false);

  setClientSecret('gemini', 'AIza-live');
  const headers = byokRequestHeaders({});
  assert.equal(clientSecretStatus().gemini, Boolean(headers[BYOK_HEADER_GEMINI]));
  assert.equal(clientSecretStatus().openrouter, Boolean(headers[BYOK_HEADER_OPENROUTER]));

  setClientSecret('openrouter', 'sk-or-v1-live');
  const both = byokRequestHeaders({});
  assert.equal(clientSecretStatus().gemini, Boolean(both[BYOK_HEADER_GEMINI]));
  assert.equal(clientSecretStatus().openrouter, Boolean(both[BYOK_HEADER_OPENROUTER]));
  clearClientSecrets();
});

test('the card shows the live state and tells the truth about how long it lasts', () => {
  const card = readFileSync(new URL('../components/SessionProviderKeysCard.jsx', import.meta.url), 'utf8');

  assert.match(card, /const active = clientSecretStatus\(\);/,
    'read on render, not snapshotted at mount — a snapshot is the lie this fixes');
  assert.doesNotMatch(card, /useState\(\s*clientSecretStatus/,
    'holding it in state would go stale exactly when the store empties');

  assert.match(card, /data-quantora-byok-provider=/, 'a durable hook, not prose, for the gate that will drive this');
  assert.match(card, /data-quantora-byok-active=/);
  assert.match(card, /your key is in use/);
  assert.match(card, /not set/);

  /*
   * THE COPY WAS WRONG, not merely thin. It said "active for this tab only",
   * which a reader takes as "until I close the tab". memorySecrets does not
   * survive a RELOAD of the same tab, which is a far shorter life and the one
   * that actually caught somebody out.
   */
  assert.doesNotMatch(card, /for this tab only/,
    'the old copy promised a tab lifetime the store does not give');
  assert.match(card, /Refreshing this page clears/,
    'say the real lifetime: a refresh, not a tab close');
  assert.match(card, /shared allowance/,
    'and say what happens instead, because that is the part that costs money');
});
