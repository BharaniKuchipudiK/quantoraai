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

const CODING_HISTORY = [
  { sender: 'user', text: 'Build me a simple calculator' },
  { sender: 'ai', text: 'Done — here is a working calculator preview.' },
];

const ADVISOR_HIJACK_FOLLOWUPS = [
  { message: 'also help me study for the JEE exam and quiz me on homework', domain: 'education' },
  { message: 'can you tutor me for NEET while I learn this curriculum', domain: 'education' },
  { message: 'also help me plan a trip with hotels and flights', domain: 'travel' },
  { message: 'research the literature and investigate market scan evidence', domain: 'research' },
  { message: 'keep this under budget for my investment portfolio and taxes', domain: 'finance' },
];

test('a live coding workspace does not jump to Travel, Study, Finance, or Research on a later turn', () => {
  for (const { message, domain } of ADVISOR_HIJACK_FOLLOWUPS) {
    assert.equal(
      resolveTurnStudioDomain({
        explicit: null,
        message,
        history: CODING_HISTORY,
        isCodingRequest: false,
        hasCodingWorkspace: true,
      }),
      null,
      `live desk must stay coding vs ${domain}: ${message}`,
    );
    assert.equal(
      inferStudioDomain({
        message,
        history: CODING_HISTORY,
        codingWorkspace: true,
      }),
      null,
      `workspace flag must stay coding vs ${domain}: ${message}`,
    );
  }
});

test('coding-thread history alone suppresses advisor hijacks when the client omits the workspace flag', () => {
  for (const { message, domain } of ADVISOR_HIJACK_FOLLOWUPS) {
    assert.equal(
      inferStudioDomain({
        message,
        history: CODING_HISTORY,
      }),
      null,
      `history lock must stay coding vs ${domain}: ${message}`,
    );
  }
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
  assert.equal(inferStudioDomain({
    message: 'help with taxes and cash flow for my boutique',
  }), 'finance');
});

test('cold Study, Travel, and Research opens still work without a coding desk', () => {
  assert.equal(inferStudioDomain({
    message: 'I need a tutor for my JEE exam and homework quiz',
  }), 'education');
  assert.equal(inferStudioDomain({
    message: 'help me plan a trip with hotels and flights',
  }), 'travel');
  assert.equal(inferStudioDomain({
    message: 'research the literature and investigate the evidence',
  }), 'research');
});

test('a Finance create-portfolio question does not lock later turns as coding', () => {
  assert.equal(inferStudioDomain({
    message: 'Can you create an investment portfolio?',
  }), 'finance');
  assert.equal(inferStudioDomain({
    message: 'what allocation should I use for taxes and savings?',
    history: [
      { sender: 'user', text: 'Can you create an investment portfolio?' },
      { sender: 'ai', text: 'Here is a starter allocation framework.' },
    ],
  }), 'finance');
});

test('mutation: without codingWorkspace lock, advisor cues would steal the turn', () => {
  // Proves the sticky assertion is load-bearing: if codingWorkspace / history
  // lock regresses to plain keyword inference, Study wins and this test fails.
  const unlocked = inferStudioDomain({
    message: 'also help me study for the JEE exam and quiz me on homework',
    history: [],
  });
  assert.equal(unlocked, 'education');
  assert.equal(
    inferStudioDomain({
      message: 'also help me study for the JEE exam and quiz me on homework',
      history: CODING_HISTORY,
      codingWorkspace: true,
    }),
    null,
  );
});

/*
 * 2026-09-06: a new chat asked for interview preparation for an aviation data
 * job and was answered on the Travel desk. The message has no signal for any
 * desk; a trip discussed earlier in the thread scored the floor on its own.
 */
test('history alone never moves a chat onto a desk: the current message must carry a signal', () => {
  const travelHistory = [
    { sender: 'user', text: 'Plan a trip to Tokyo in November, flights from Singapore and a hotel near Shinjuku' },
    { sender: 'ai', text: 'Here is an itinerary with flights and hotels for your trip.' },
  ];
  const interviewPrep = 'help me with the key areas of focus for preparing for an interview : Below is the JD for the role. '
    + 'Key Responsibilities Support data extraction, cleansing, transformation, and reporting activities. '
    + 'Maintain and improve Aviation datasets, dashboards, and analytics. Support system implementations, User Acceptance Testing (UAT), and change rollouts.';
  assert.equal(inferStudioDomain({ explicit: null, message: interviewPrep, history: travelHistory }), null, 'an earlier trip must not turn interview preparation into Travel');
  assert.equal(inferStudioDomain({ explicit: null, message: 'what is the capital of France', history: travelHistory }), null, 'nor a plain question');
  assert.equal(resolveTurnStudioDomain({ explicit: null, message: interviewPrep, history: travelHistory, isCodingRequest: false, hasCodingWorkspace: false }), null, 'the client turn resolver agrees');
});

test('history still reinforces a desk the current message names, and still breaks ties', () => {
  const travelHistory = [
    { sender: 'user', text: 'Plan a trip to Tokyo in November, flights from Singapore and a hotel near Shinjuku' },
    { sender: 'ai', text: 'Here is an itinerary with flights and hotels for your trip.' },
  ];
  assert.equal(inferStudioDomain({ explicit: null, message: 'what about the hotels?', history: travelHistory }), 'travel', 'a follow-up that says so stays with the trip');
  assert.equal(inferStudioDomain({ explicit: null, message: 'help me with my taxes now', history: travelHistory }), 'finance', 'a desk the message names beats a desk only history names');
  // One travel word and one finance word: history decides, as before.
  assert.equal(inferStudioDomain({ explicit: null, message: 'add the hotel cost to my budget', history: travelHistory }), 'travel');
  assert.equal(inferStudioDomain({ explicit: null, message: 'add the hotel cost to my budget', history: [] }), null, 'with no history the tie stays a tie');
});
