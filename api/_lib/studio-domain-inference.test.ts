import assert from 'node:assert/strict';
import test from 'node:test';
import { inferStudioDomain, resolveTurnStudioDomain, turnDomainSessionPatch } from './studio-domain-inference.js';
import type { StudioDomain } from '../../shared/studio/domains.js';

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
  assert.equal(inferStudioDomain({ explicit: null, message: 'can you help me write a cover letter for a job application at a bank', history: travelHistory }), null, 'nor an unrelated request long enough to carry its own signals');
  // A reply to the desk's own question has no words of its own to score; history keeps it.
  assert.equal(inferStudioDomain({ explicit: null, message: 'September 12 to 15', history: travelHistory }), 'travel', 'a short follow-up stays with the trip');
  assert.equal(inferStudioDomain({ explicit: null, message: 'yes, two adults and a child', history: travelHistory }), 'travel');
  assert.equal(inferStudioDomain({ explicit: null, message: 'one two three four five six seven eight nine', history: travelHistory }), null, 'nine words with no signal is a new topic, not a follow-up');
  assert.equal(inferStudioDomain({ explicit: null, message: 'one two three four five six seven eight', history: travelHistory }), 'travel', 'eight is the line');
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

/*
 * WORKSPACES OWN THEIR CHATS (2026-09-06). A chat opened inside a workspace is
 * pinned there for life. The Coding desk is the null domain, so before this
 * a coding chat with no build yet could be moved to Travel by one trip word.
 */
test('a pinned chat never moves, whatever the message says; an unpinned one still can', () => {
  const trip = 'help me plan a trip with hotels and flights';
  assert.equal(inferStudioDomain({ explicit: null, pinned: true, message: trip }), null, 'a pinned coding chat stays coding');
  assert.equal(inferStudioDomain({ explicit: 'travel', pinned: true, message: 'help me with my taxes and portfolio' }), 'travel', 'a pinned trip stays a trip');
  assert.equal(inferStudioDomain({ explicit: null, pinned: false, message: trip }), 'travel', 'an unpinned general chat still finds its desk');
  assert.equal(resolveTurnStudioDomain({ explicit: null, pinned: true, message: trip, history: [], isCodingRequest: false, hasCodingWorkspace: false }), null, 'the client turn resolver honours the pin');
  assert.equal(resolveTurnStudioDomain({ explicit: null, message: trip, history: [], isCodingRequest: false, hasCodingWorkspace: false }), 'travel', 'and without it behaves as before');
});

/*
 * MEMBERSHIP IS NOT ROUTING (2026-09-06).
 *
 * Reported: "when I click on New chat and start working, suddenly this chat
 * jumps to a different Workspace, its no longer a new chat and becomes part
 * of Travel Workspace and sometimes goes to Study Tutor."
 *
 * The turn's inferred desk was written to the session as `studioDomain`, the
 * field the sidebar groups by, so the FIRST message of a general chat moved
 * it. These hold the separation that fixed it: inference still runs and still
 * routes the turn, and it may never decide which workspace owns the chat.
 */
test('the turn router may never move a chat between workspaces', () => {
  // The exact opening messages that moved a New Chat, one per advisor desk.
  const reported: Array<[string, StudioDomain]> = [
    ['help me plan a trip to Kyoto', 'travel'],
    ['I want to learn calculus', 'education'],
    ['can you help me study for my exam', 'education'],
    ['what should I do about my budget', 'finance'],
    ['do some research on solid state batteries', 'research'],
  ];
  for (const [message, expected] of reported) {
    const turnDomain = resolveTurnStudioDomain({
      explicit: null, message, history: [], isCodingRequest: false, hasCodingWorkspace: false, pinned: false,
    });
    assert.equal(turnDomain, expected, `"${message}" should still ROUTE to ${expected}`);

    const patch = turnDomainSessionPatch({ turnDomain, sessionDomain: null, pinned: false });
    assert.ok(
      !('studioDomain' in patch),
      `"${message}" wrote studioDomain=${(patch as Record<string, unknown>).studioDomain} onto the session, `
      + 'which is the field the sidebar groups by: the chat leaves the list the person started it in. '
      + 'Membership changes only by an explicit action (the "+" beside a workspace, an advisor card, a move). '
      + 'Record the desk as inferredDomain instead.',
    );
    assert.equal(patch.inferredDomain, expected, `"${message}" should still be REMEMBERED as ${expected} for routing`);
  }
});

test('a remembered desk keeps routing a thread whose later turns say nothing', () => {
  // Turn two of a trip conversation: no travel word of its own, and long
  // enough that the short-follow-up rule does not carry it either.
  const vague = 'what would you suggest for someone travelling with two small children and a lot of luggage to carry';
  assert.equal(
    resolveTurnStudioDomain({ explicit: null, message: vague, history: [], isCodingRequest: false, hasCodingWorkspace: false }),
    null,
    'on its own this message names no desk',
  );
  assert.equal(
    resolveTurnStudioDomain({ explicit: 'travel', message: vague, history: [], isCodingRequest: false, hasCodingWorkspace: false }),
    'travel',
    'the remembered desk is what keeps the travel tools on turn two',
  );
});

test('a pinned chat records no routing memory, and an unchanged desk writes nothing', () => {
  assert.deepEqual(
    turnDomainSessionPatch({ turnDomain: 'travel', sessionDomain: null, pinned: true }),
    {},
    'a pinned chat\'s workspace already decided',
  );
  assert.deepEqual(
    turnDomainSessionPatch({ turnDomain: 'travel', sessionDomain: 'travel', pinned: false }),
    {},
    'no write when the turn matches the desk the chat is already on',
  );
  assert.deepEqual(turnDomainSessionPatch({ turnDomain: null, sessionDomain: null, pinned: false }), {});
  assert.deepEqual(turnDomainSessionPatch({ turnDomain: 'nonsense', sessionDomain: null, pinned: false }), {});
});

/*
 * A BUILD TAKES THE THREAD BACK (2026-09-07).
 *
 * Reported as "in the Coding desk, after a prompt it jumps to Travel Desk".
 *
 * The caller folded routing memory into `explicit` — `studioDomain ||
 * rememberedDomain` — and `explicit` short-circuits above the coding check.
 * So a thread that mentioned a trip ONCE was Travel for life: with a live
 * coding workspace AND an explicit build ask it still returned `travel`, and
 * the studio chrome showed the Travel desk while the person built a site.
 *
 * Membership and routing memory are not the same strength, and that is the
 * whole fix. A person choosing a workspace outranks an open coding desk. A
 * desk the words drifted into does not.
 */
test('INVARIANT: a live coding workspace takes a thread back from a remembered desk', () => {
  const building = 'make the header blue and fix the checkout button';
  const history = [
    { sender: 'user', text: 'we might go to Bali in December' },
    { sender: 'user', text: 'Build me a boutique website for Hira Silks' },
  ];
  for (const opts of [
    { isCodingRequest: true, hasCodingWorkspace: true },
    { isCodingRequest: false, hasCodingWorkspace: true },
    { isCodingRequest: true, hasCodingWorkspace: false },
  ]) {
    assert.equal(
      resolveTurnStudioDomain({
        explicit: null, remembered: 'travel', message: building, history, pinned: false, ...opts,
      }),
      null,
      `coding must win over routing memory: ${JSON.stringify(opts)}`,
    );
  }
});

test('INVARIANT: routing memory still carries a thread that is not coding', () => {
  /*
   * The other direction, so the fix cannot become "stop remembering". Turn two
   * of a trip still gets the travel tools when the message alone says nothing,
   * which is the continuity `inferredDomain` exists for.
   */
  assert.equal(
    resolveTurnStudioDomain({ explicit: null, remembered: 'travel', message: 'and what about the evenings', history: [] }),
    'travel',
  );
  assert.equal(
    resolveTurnStudioDomain({ explicit: null, remembered: 'finance', message: 'ok go on', history: [] }),
    'finance',
  );
  // And with nothing remembered, an unremarkable follow-up still decides nothing.
  assert.equal(
    resolveTurnStudioDomain({ explicit: null, message: 'and what about the evenings', history: [] }),
    null,
  );
});

test('a person choosing a workspace still outranks an open coding desk', () => {
  // Membership is a decision, not a drift, so it keeps beating the coding lock.
  assert.equal(
    resolveTurnStudioDomain({
      explicit: 'travel', message: 'build me a page for this', history: [],
      isCodingRequest: true, hasCodingWorkspace: true,
    }),
    'travel',
  );
});
