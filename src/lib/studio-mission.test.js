import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveProjectResume,
  deriveStudioMission,
  isResumeSession,
  pickResumeSessionId,
  toShortMissionGoal,
} from './studio-mission.js';

const LEGACY_REPOSITORY_SCAN = [
  'Scan through the GitHub',
  ' public repositories and find out if we can leverage them',
].join('');

test('mission goal is a short title, not a Help-me prompt dump', () => {
  const raw = 'Help me build an AI agent that help me to go through my google drive and analyse the files so I can clean up duplicates and organise folders by project';
  const goal = toShortMissionGoal(raw);
  assert.ok(goal.length <= 80, `goal too long: ${goal}`);
  assert.doesNotMatch(goal, /^Help me/i);
  assert.doesNotMatch(goal, /analyse the files so I can/i);
  assert.match(goal, /Drive|agent/i);
  const mission = deriveStudioMission({
    messages: [{ sender: 'user', text: raw }],
    hasPreview: false,
  });
  assert.equal(mission.lead, 'Project');
  assert.equal(mission.goal, goal);
  assert.ok(mission.goal.length < raw.length / 2);
});

test('greeting sentence does not become the mission goal', () => {
  assert.match(toShortMissionGoal('Hi. Build a scientific calculator'), /calculator/i);
  assert.doesNotMatch(toShortMissionGoal('Hi. Build a scientific calculator'), /^Hi\b/i);
});

test('modal can-you prefixes peel into a product title', () => {
  assert.match(toShortMissionGoal('Can you build me a weather app?'), /weather/i);
  assert.doesNotMatch(toShortMissionGoal('Can you build me a weather app?'), /^Can you/i);
});

test('bare drive verb is not treated as Google Drive', () => {
  const goal = toShortMissionGoal('Build an AI agent that helps us drive sales with personalized outreach');
  assert.doesNotMatch(goal, /Google Drive/i);
  assert.match(goal, /agent|sales|AI/i);
});

test('short product heads still compress relative clauses', () => {
  const goal = toShortMissionGoal('Build an app that tracks inventory across all stores and alerts managers before popular products run out');
  assert.ok(goal.length <= 80, `goal too long: ${goal}`);
  assert.doesNotMatch(goal, /alerts managers/i);
  assert.match(goal, /app/i);
});

test('keeps the boutique goal after a short follow-up in the same chat', () => {
  const mission = deriveStudioMission({
    messages: [
      { sender: 'user', text: 'build a calculator' },
      { sender: 'user', text: 'develop a website for a boutique that sells sarees' },
      { sender: 'user', text: 'add a payment gateway' },
    ],
    hasPreview: true,
    continueLabel: 'Domestic or international?',
  });
  assert.match(mission.goal, /boutique/i);
  assert.doesNotMatch(mission.goal, /calculator/i);
  assert.match(mission.next, /international/i);
});

test('infers a goal from the first build request when memory is empty', () => {
  const mission = deriveStudioMission({
    messages: [{ sender: 'user', text: 'build a scientific calculator with an iOS look' }],
    hasPreview: false,
  });
  assert.match(mission.goal, /calculator/i);
});

test('empty studio has no mission card', () => {
  assert.equal(deriveStudioMission({ messages: [] }), null);
});

test('a failed turn does not keep claiming the build is under way', () => {
  const args = {
    messages: [{ sender: 'user', text: 'build an agent that cleans my Google Drive' }],
    hasPreview: true,
  };
  assert.match(deriveStudioMission(args).goal, /Drive/i);
  assert.equal(deriveStudioMission({ ...args, lastTurnFailed: true }), null);
});

test('sticky Study goal does not own a Coding desk Drive cleaner mission', () => {
  const mission = deriveStudioMission({
    conversationContext: {
      goal: 'I want to study newton laws of motion. prepare me',
      understanding: 'Drive Cleaner Agent dashboard is in Preview.',
    },
    messages: [
      { sender: 'user', text: 'I want to study newton laws of motion. prepare me' },
      { sender: 'user', text: 'build a Drive Cleaner Agent web dashboard for my Google Drive' },
    ],
    hasPreview: true,
  });
  assert.match(mission.goal, /Drive|cleaner/i);
  assert.doesNotMatch(mission.goal, /newton/i);
});

test('project resume uses the latest chat, not the first empty one', () => {
  const resume = deriveProjectResume([
    { id: 'empty', createdAt: 9, title: 'New Chat', messages: [], conversationContext: {} },
    {
      id: 'deck',
      createdAt: 2,
      title: 'HAM deck',
      messages: [{ id: 20, sender: 'user', text: 'pre-kick off HAM SAM' }],
      conversationContext: { goal: 'HAM SAM kickoff deck', facts: ['Outcome kind: powerpoint'] },
    },
  ]);
  assert.equal(resume.sessionId, 'deck');
  assert.match(resume.goal, /HAM SAM/i);
  assert.doesNotMatch(resume.next || '', /publish/i);
});

test('switching projects reopens the mission chat, not the newest empty one', () => {
  const sessions = [
    { id: 'empty', createdAt: 99, title: 'New Chat', messages: [], conversationContext: {} },
    {
      id: 'deck',
      createdAt: 2,
      title: 'HAM deck',
      messages: [{ id: 20, sender: 'user', text: 'pre-kick off HAM SAM' }],
      conversationContext: { goal: 'HAM SAM kickoff deck', facts: ['Outcome kind: powerpoint'] },
    },
  ];
  assert.equal(pickResumeSessionId(sessions), 'deck');
  const resume = deriveProjectResume(sessions);
  assert.equal(isResumeSession(sessions[1], resume), true);
  assert.equal(isResumeSession(sessions[0], resume), false);
  assert.equal(isResumeSession('deck', resume), true);
  assert.equal(isResumeSession({ id: 'deck' }, null), false);
});

test('an Office mission does not tell the user to publish a website', () => {
  const mission = deriveStudioMission({
    conversationContext: { goal: 'HAM SAM kickoff deck', facts: ['Outcome kind: powerpoint'] },
    messages: [{ sender: 'user', text: 'pre-kick off presentation' }],
    hasPreview: true,
    officeKind: 'powerpoint',
  });
  assert.doesNotMatch(mission.next, /publish/i);
  assert.match(mission.understanding || mission.goal, /Office|presentation|HAM/i);
});

test('a bled sticky goal never surfaces on the Finance advice desk', () => {
  const mission = deriveStudioMission({
    conversationContext: { goal: LEGACY_REPOSITORY_SCAN },
    messages: [{ sender: 'user', text: 'how much is APL?' }],
    studioDomain: 'finance',
  });
  assert.doesNotMatch(mission?.goal || '', /github|scan/i);
  assert.equal(mission?.goal || '', '');
});

test('a bled sticky goal never surfaces on the Study / Research advice desks', () => {
  for (const studioDomain of ['education', 'research']) {
    const mission = deriveStudioMission({
      conversationContext: {
        goal: LEGACY_REPOSITORY_SCAN,
        understanding: 'Drive Cleaner Agent dashboard is in Preview.',
      },
      messages: [{ sender: 'user', text: 'explain photosynthesis' }],
      studioDomain,
    });
    assert.doesNotMatch(mission?.goal || '', /github|scan/i, studioDomain);
    assert.doesNotMatch(mission?.understanding || '', /github|scan|drive cleaner/i, studioDomain);
  }
});

test('Travel still keeps its own curated trip goal (not an advice desk)', () => {
  const mission = deriveStudioMission({
    conversationContext: { goal: 'Plan a balanced trip to Mauritius for 2 adults' },
    messages: [{ sender: 'user', text: '7 Days / 1 Week' }],
    studioDomain: 'travel',
  });
  assert.match(mission.goal, /Mauritius/i);
});

test('Travel is planning a trip, not building a website', () => {
  const mission = deriveStudioMission({
    conversationContext: { goal: 'Plan a balanced trip to Mauritius for 2 adults' },
    messages: [{ sender: 'user', text: '7 Days / 1 Week' }],
    studioDomain: 'travel',
  });
  assert.equal(mission.lead, 'Planning');
  assert.doesNotMatch(mission.next || '', /publish|working page/i);
});

test('canned project copy is not treated as session understanding', () => {
  const mission = deriveStudioMission({
    conversationContext: { understanding: 'A flexible space for everyday questions and ideas.' },
    messages: [{ sender: 'user', text: 'build a weather app for iOS' }],
    hasPreview: true,
  });
  assert.match(mission.goal, /weather/i);
  assert.doesNotMatch(mission.understanding || '', /flexible space/i);
  assert.doesNotMatch(mission.next || '', /tweak it|publish/i);
});
