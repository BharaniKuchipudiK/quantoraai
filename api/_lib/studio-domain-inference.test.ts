import assert from 'node:assert/strict';
import test from 'node:test';
import { inferStudioDomain, resolveTurnStudioDomain } from './studio-domain-inference.js';

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

test('a coding boutique follow-up about cart, currency, and budget stays coding', () => {
  const history = [
    { sender: 'user', text: 'build a website for my saree boutique' },
    { sender: 'ai', text: 'Here is the boutique with a catalog and Add to Cart.' },
  ];
  const followUps = [
    'Please include a currency converter',
    'Please give an option to Add to Cart',
    'Keep the boutique cart under budget and show prices in INR',
    'Add a cost filter for the shop',
  ];
  for (const message of followUps) {
    assert.equal(
      resolveTurnStudioDomain({
        explicit: null,
        message,
        history,
        isCodingRequest: false,
        hasCodingWorkspace: true,
      }),
      null,
      `follow-up should stay coding: ${message}`,
    );
    assert.equal(
      inferStudioDomain({
        message,
        history,
        codingWorkspace: true,
      }),
      null,
      `workspace lock should stay coding: ${message}`,
    );
  }
});

test('shop cart and price talk does not promote Finance even if the client omits the workspace flag', () => {
  assert.equal(inferStudioDomain({
    message: 'Keep the boutique cart under budget and show prices in INR',
    history: [{ sender: 'user', text: 'build a website for my saree boutique' }],
  }), null);
});

test('a live coding workspace does not jump to Travel, Study, or Research on a later turn', () => {
  assert.equal(inferStudioDomain({
    message: 'also help me plan a trip and study for the exam while you research hotels',
    history: [{ sender: 'user', text: 'Build me a simple calculator' }],
    codingWorkspace: true,
  }), null);
});

test('a cold money question from empty chat can still open Finance', () => {
  assert.equal(inferStudioDomain({
    message: 'help me with my taxes and portfolio',
  }), 'finance');
  assert.equal(resolveTurnStudioDomain({
    explicit: null,
    message: 'I need a budget for my investment portfolio',
    history: [],
    isCodingRequest: false,
    hasCodingWorkspace: false,
  }), 'finance');
});
