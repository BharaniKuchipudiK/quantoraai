import assert from 'node:assert/strict';
import test from 'node:test';
import { inferStudioDomain } from './studio-domain-inference.js';

test('hotels plus a city in ordinary Studio chat is Travel, even with a typo', () => {
  assert.equal(
    inferStudioDomain({
      message: 'give me the list o attactions in Singapore and include the hotels to stay',
    }),
    'travel',
  );
  assert.equal(
    inferStudioDomain({
      message: 'give me the list o attactions in Vizag and include the hotels to stay',
    }),
    'travel',
  );
});

test('an explicit Study desk is not stolen by a trip mention', () => {
  assert.equal(inferStudioDomain({
    explicit: 'education',
    message: 'After this I might take a trip. Teach kinematics.',
  }), 'education');
});
