/**
 * Two properties carry this file, and neither is about photos.
 *
 * 1. A server API key must never reach the browser. The natural implementation
 *    of Places photos hands the browser a media URL with `?key=` on it, which
 *    publishes a server credential to every viewer. These tests assert the key
 *    travels in a request HEADER and that any resolved URI carrying a
 *    credential-shaped parameter is dropped rather than returned.
 *
 * 2. A photo must never be load-bearing. A timeout, a rejection, a 500, a
 *    malformed body or a thrown error has to leave the traveller with the
 *    hotels they asked for. Every failure mode below is asserted to produce
 *    `photoUrl: null` on an otherwise intact place.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PHOTO_LIMIT,
  attachPhotoUrls,
  firstPhotoName,
  isSafePhotoUri,
  resolvePhotoUri,
} from './places-photos.js';

const KEY = 'AIzaTESTKEYTESTKEYTESTKEYTESTKEYTEST';
const GOOD_URI = 'https://lh3.googleusercontent.com/places/photo-abc123';
const photoName = (n: number) => `places/place-${n}/photos/ref-${n}`;

const okJson = (body: unknown) => ({ ok: true, json: async () => body }) as any;

/** A fetch that records what it was called with. */
function recordingFetch(body: unknown) {
  const calls: Array<{ url: string; init: any }> = [];
  const fetchFn = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return okJson(body);
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

test('SECURITY: the key travels in a header, never in the photo URL', async () => {
  const { fetchFn, calls } = recordingFetch({ photoUri: GOOD_URI });
  await resolvePhotoUri(KEY, photoName(1), { fetchFn });

  assert.equal(calls.length, 1);
  assert.ok(!calls[0].url.includes(KEY), 'the key must not appear in the request URL');
  assert.equal(calls[0].init?.headers?.['X-Goog-Api-Key'], KEY);
  // skipHttpRedirect is what makes the endpoint answer with JSON instead of a
  // 302, which is what lets us resolve server-side at all.
  assert.ok(calls[0].url.includes('skipHttpRedirect=true'));
});

test('SECURITY: a resolved URI carrying a credential is refused', async () => {
  for (const leaky of [
    `https://lh3.googleusercontent.com/p/abc?key=${KEY}`,
    'https://lh3.googleusercontent.com/p/abc?api_key=secret',
    'https://lh3.googleusercontent.com/p/abc?token=secret',
    'https://lh3.googleusercontent.com/p/abc?access_token=secret',
  ]) {
    assert.equal(isSafePhotoUri(leaky), false, `should refuse ${leaky}`);
    const { fetchFn } = recordingFetch({ photoUri: leaky });
    assert.equal(await resolvePhotoUri(KEY, photoName(1), { fetchFn }), null);
  }
});

test('SECURITY: only Google photo hosts over https are accepted', async () => {
  assert.equal(isSafePhotoUri(GOOD_URI), true);
  assert.equal(isSafePhotoUri('http://lh3.googleusercontent.com/p/abc'), false, 'http is refused');
  assert.equal(isSafePhotoUri('https://evil.example.com/p/abc'), false, 'foreign host is refused');
  assert.equal(isSafePhotoUri('https://googleusercontent.com.evil.test/p'), false, 'lookalike host is refused');
  assert.equal(isSafePhotoUri('not a url'), false);
  assert.equal(isSafePhotoUri(''), false);
  assert.equal(isSafePhotoUri(null), false);
});

test('NEVER FATAL: every provider failure yields null rather than throwing', async () => {
  const failures: Array<[string, typeof fetch]> = [
    ['rejected promise', (async () => { throw new Error('socket hang up'); }) as any],
    ['non-ok response', (async () => ({ ok: false, status: 500 })) as any],
    ['malformed json', (async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })) as any],
    ['empty body', (async () => okJson({})) as any],
    ['null body', (async () => okJson(null)) as any],
    ['wrong shape', (async () => okJson({ photoUri: { nested: true } })) as any],
  ];
  for (const [label, fetchFn] of failures) {
    const result = await resolvePhotoUri(KEY, photoName(1), { fetchFn });
    assert.equal(result, null, `${label} should resolve to null`);
  }
});

test('NEVER FATAL: a place whose photo fails is still returned, in place', async () => {
  const places = [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }];
  const raw = [
    { photos: [{ name: photoName(1) }] },
    { photos: [{ name: photoName(2) }] },
    { photos: [{ name: photoName(3) }] },
  ];
  // Only the middle one resolves; the others fail in different ways.
  const fetchFn = (async (url: any) => {
    if (String(url).includes('place-2')) return okJson({ photoUri: GOOD_URI });
    if (String(url).includes('place-1')) throw new Error('network');
    return { ok: false, status: 503 };
  }) as unknown as typeof fetch;

  const result = await attachPhotoUrls(places, raw, KEY, { fetchFn });

  assert.equal(result.length, 3, 'no place is dropped');
  assert.deepEqual(result.map((p) => p.name), ['Alpha', 'Beta', 'Gamma'], 'order is preserved');
  assert.equal(result[0].photoUrl, null);
  assert.equal(result[1].photoUrl, GOOD_URI);
  assert.equal(result[2].photoUrl, null);
});

test('BOUNDED: at most PHOTO_LIMIT photos are resolved, in one round of calls', async () => {
  const count = PHOTO_LIMIT + 5;
  const places = Array.from({ length: count }, (_, i) => ({ name: `Hotel ${i}` }));
  const raw = Array.from({ length: count }, (_, i) => ({ photos: [{ name: photoName(i) }] }));
  const { fetchFn, calls } = recordingFetch({ photoUri: GOOD_URI });

  const result = await attachPhotoUrls(places, raw, KEY, { fetchFn });

  assert.equal(result.length, count, 'every place comes back');
  assert.equal(calls.length, PHOTO_LIMIT, `exactly ${PHOTO_LIMIT} round trips, not ${count}`);
  assert.equal(result.filter((p) => p.photoUrl).length, PHOTO_LIMIT);
  assert.equal(result[count - 1].photoUrl, null, 'places past the limit are null, not missing');
});

test('BOUNDED: no key means no requests at all', async () => {
  const { fetchFn, calls } = recordingFetch({ photoUri: GOOD_URI });
  const result = await attachPhotoUrls([{ name: 'Alpha' }], [{ photos: [{ name: photoName(1) }] }], null, { fetchFn });
  assert.equal(calls.length, 0, 'an unconfigured key must not produce a call');
  assert.equal(result[0].photoUrl, null);
});

test('BOUNDED: a place with no photos costs no round trip', async () => {
  const { fetchFn, calls } = recordingFetch({ photoUri: GOOD_URI });
  const result = await attachPhotoUrls(
    [{ name: 'Alpha' }, { name: 'Beta' }],
    [{}, { photos: [] }],
    KEY,
    { fetchFn },
  );
  assert.equal(calls.length, 0);
  assert.deepEqual(result.map((p) => p.photoUrl), [null, null]);
});

test('a malformed photo reference is not guessed at', () => {
  assert.equal(firstPhotoName({ photos: [{ name: photoName(7) }] }), photoName(7));
  assert.equal(firstPhotoName({ photos: [{ name: 'places/only-two/parts' }] }), null);
  assert.equal(firstPhotoName({ photos: [{ name: '' }] }), null);
  assert.equal(firstPhotoName({ photos: [{}] }), null);
  assert.equal(firstPhotoName({}), null);
  assert.equal(firstPhotoName(null), null);
  // The first VALID reference wins, so one malformed entry does not lose the photo.
  assert.equal(firstPhotoName({ photos: [{ name: 'junk' }, { name: photoName(9) }] }), photoName(9));
});

test('a timeout resolves to null without hanging the caller', async () => {
  const fetchFn = ((_url: any, init: any) => new Promise((_resolve, reject) => {
    // Mirror what fetch does on abort: reject the promise.
    init?.signal?.addEventListener?.('abort', () => reject(new Error('aborted')));
  })) as unknown as typeof fetch;

  const started = Date.now();
  const result = await resolvePhotoUri(KEY, photoName(1), { fetchFn, timeoutMs: 50 });
  assert.equal(result, null);
  assert.ok(Date.now() - started < 2_000, 'the timeout must fire well before the default');
});
