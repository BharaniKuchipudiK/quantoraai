import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMoveChatToProject, chatsForWorkspace, chromeDomainForSession, DEFAULT_PROJECT_ID, handoverNoteMessage, makeHandoverSession, makeSession, workspaceOfSession } from './useStudioSession.js';

const greeting = { id: 1, sender: 'ai', text: 'Hello', type: 'greeting' };

test('moving a chat persists the destination projectId', () => {
  const result = applyMoveChatToProject({
    sessions: [
      { id: 'a', projectId: DEFAULT_PROJECT_ID, title: 'Boutique' },
      { id: 'b', projectId: DEFAULT_PROJECT_ID, title: 'Other' },
    ],
    sessionId: 'a',
    nextProjectId: 'project-boutique',
    sourceProjectId: DEFAULT_PROJECT_ID,
    activeSessionId: 'b',
    defaultGreeting: greeting,
  });

  assert.equal(result.changed, true);
  assert.equal(result.sessions.find((session) => session.id === 'a')?.projectId, 'project-boutique');
  assert.equal(result.sessions.find((session) => session.id === 'b')?.projectId, DEFAULT_PROJECT_ID);
  assert.equal(result.activeSessionId, 'b');
});

test('moving the active chat switches to a remaining chat in the source project', () => {
  const result = applyMoveChatToProject({
    sessions: [
      { id: 'a', projectId: DEFAULT_PROJECT_ID, title: 'Boutique' },
      { id: 'b', projectId: DEFAULT_PROJECT_ID, title: 'Stay' },
    ],
    sessionId: 'a',
    nextProjectId: 'project-boutique',
    sourceProjectId: DEFAULT_PROJECT_ID,
    activeSessionId: 'a',
    defaultGreeting: greeting,
  });

  assert.equal(result.activeSessionId, 'b');
  assert.equal(result.sessions.some((session) => session.projectId === DEFAULT_PROJECT_ID && session.id === 'b'), true);
});

test('moving the last chat in a project creates an empty session there', () => {
  const result = applyMoveChatToProject({
    sessions: [
      { id: 'only', projectId: DEFAULT_PROJECT_ID, title: 'Boutique' },
      { id: 'other', projectId: 'project-boutique', title: 'Shop' },
    ],
    sessionId: 'only',
    nextProjectId: 'project-boutique',
    sourceProjectId: DEFAULT_PROJECT_ID,
    activeSessionId: 'only',
    defaultGreeting: greeting,
  });

  const remaining = result.sessions.filter((session) => (session.projectId || DEFAULT_PROJECT_ID) === DEFAULT_PROJECT_ID);
  assert.equal(remaining.length, 1);
  assert.notEqual(remaining[0].id, 'only');
  assert.equal(result.activeSessionId, remaining[0].id);
  assert.equal(result.sessions.find((session) => session.id === 'only')?.projectId, 'project-boutique');
});

test('moving to the same project is a no-op', () => {
  const sessions = [{ id: 'a', projectId: DEFAULT_PROJECT_ID, title: 'Stay' }];
  const result = applyMoveChatToProject({
    sessions,
    sessionId: 'a',
    nextProjectId: DEFAULT_PROJECT_ID,
    sourceProjectId: DEFAULT_PROJECT_ID,
    activeSessionId: 'a',
    defaultGreeting: greeting,
  });
  assert.equal(result.changed, false);
  assert.equal(result.sessions, sessions);
});

test('handover creates a child chat in the owning project without copying transcript', () => {
  const session = makeHandoverSession({
    projectId: 'project-physics',
    defaultGreetingMsg: greeting,
    contract: {
      version: 1,
      kind: 'session_handover',
      id: 'handover:old:1',
      sourceSessionId: 'old',
      studioDomain: 'education',
      createdAt: 1,
      summary: { goal: 'Master forces', facts: ['Free-body diagrams next'] },
      context: { goal: 'Master forces', facts: ['Free-body diagrams next'] },
    },
  });

  assert.equal(session.projectId, 'project-physics');
  assert.equal(session.studioDomain, 'education');
  assert.equal(session.parentSessionId, 'old');
  assert.equal(session.title, 'Master forces');
  assert.deepEqual(session.conversationContext, { goal: 'Master forces', facts: ['Free-body diagrams next'] });
  // The transcript stays behind; the chat opens by saying what came with it.
  assert.equal(session.messages.length, 2);
  assert.deepEqual(session.messages[0], greeting);
  assert.equal(session.messages[1].handoverNote, true);
  assert.match(session.messages[1].text, /Continued from the previous chat, which stays exactly as it was\./);
  assert.match(session.messages[1].text, /- Goal: Master forces\n- Free-body diagrams next\n- No files were on that desk\./);
});

/*
 * The chip was a one-click way to lose a build.
 *
 * A handover session carried no desk, so restoreStudioDeskSnapshot returned
 * null and the Coding Desk opened empty. The chip is domain-agnostic and fires
 * hardest in Coding — every turn there carries a full HTML document, so the
 * byte budget goes first — which put it in front of people exactly where
 * abandoning the build cost most, labelled only "New chat · <goal>".
 */
const HANDOVER = {
  version: 1,
  kind: 'session_handover',
  id: 'handover:old:1',
  sourceSessionId: 'old',
  createdAt: 1,
  summary: { goal: 'Coffee shop' },
  context: { goal: 'Coffee shop' },
};

const DESK = { version: 1, vfs: { 'index.html': { content: '<h1>Shop</h1>', language: 'html' } } };

test('the build travels with the handover, because the transcript is what got too big', () => {
  const session = makeHandoverSession({
    projectId: 'project-1',
    defaultGreetingMsg: greeting,
    contract: HANDOVER,
    sourceSession: { id: 'old', desk: DESK },
  });
  assert.deepEqual(session.desk, DESK, 'the new session opens on the same build');
  assert.equal(session.handover.deskCarried, true);
  assert.equal(session.messages.length, 2, 'and still without the transcript');
  assert.match(session.messages[1].text, /- The desk, with 1 file — Preview runs the same build\./);
});

test('a chat continued from a pinned chat stays pinned, and names the chat it came from', () => {
  const session = makeHandoverSession({
    projectId: 'project-1',
    defaultGreetingMsg: greeting,
    contract: HANDOVER,
    sourceSession: { id: 'old', title: 'Coffee shop site', desk: DESK, deskPinned: true },
  });
  assert.equal(session.deskPinned, true);
  assert.match(session.messages[1].text, /^Continued from "Coffee shop site"/);
  const unpinned = makeHandoverSession({ projectId: 'project-1', defaultGreetingMsg: greeting, contract: HANDOVER, sourceSession: { id: 'old' } });
  assert.equal(unpinned.deskPinned, false);
  const note = handoverNoteMessage({ contract: HANDOVER, sourceSession: null, desk: null });
  assert.equal(note.sender, 'ai');
  assert.match(note.text, /Carried over:\n- Goal: Coffee shop\n- No files were on that desk\./);
});

test('a handover cannot take a desk belonging to a different session', () => {
  const session = makeHandoverSession({
    projectId: 'project-1',
    defaultGreetingMsg: greeting,
    contract: HANDOVER,
    sourceSession: { id: 'someone-else', desk: DESK },
  });
  assert.equal(session.desk, undefined, 'only the session named in the contract may hand one over');
  assert.equal(session.handover.deskCarried, false);
});

test('a source session with no build hands over nothing, and says so', () => {
  const session = makeHandoverSession({
    projectId: 'project-1',
    defaultGreetingMsg: greeting,
    contract: HANDOVER,
    sourceSession: { id: 'old' },
  });
  assert.equal(session.desk, undefined);
  assert.equal(session.handover.deskCarried, false);
});

/*
 * WORKSPACES OWN THEIR CHATS (2026-09-06): a chat opened inside a workspace
 * is pinned there; the top-level New Chat is not.
 */
test('a workspace chat is pinned to its desk and a top-level chat is not', () => {
  const coding = makeSession(DEFAULT_PROJECT_ID, greeting, null, { pinned: true });
  assert.equal(coding.studioDomain, null);
  assert.equal(coding.deskPinned, true);
  assert.equal(workspaceOfSession(coding), 'coding');
  const trip = makeSession(DEFAULT_PROJECT_ID, greeting, 'travel', { pinned: true });
  assert.equal(trip.studioDomain, 'travel');
  assert.equal(trip.deskPinned, true);
  assert.equal(workspaceOfSession(trip), 'travel');
  const general = makeSession(DEFAULT_PROJECT_ID, greeting, null);
  assert.equal(general.deskPinned, false, 'the top-level New Chat may still find its desk from the message');
  // An unknown domain is not a desk. Before 2026-09-07 it read as "coding",
  // because coding WAS the null case; now an unpinned chat has no workspace.
  assert.equal(workspaceOfSession({ studioDomain: 'nonsense' }), null, 'an unknown domain on an unpinned chat is no workspace');
  assert.equal(workspaceOfSession({ studioDomain: 'nonsense', deskPinned: true }), 'coding', 'pinned with an unreadable domain is still the coding desk');
});

test('chats are grouped per workspace within the active project, newest first, archived ones left out', () => {
  /*
   * These are CODING DESK chats, so they carry deskPinned (2026-09-07). They
   * used to be bare `studioDomain: null`, which landed under coding only
   * because coding was the null default — the very thing that filed every
   * plain chat on the desk. What this test is about is unchanged: ordering,
   * archived exclusion and project scoping, all asserted identically below.
   */
  const sessions = [
    { id: 'c1', projectId: 'p1', studioDomain: null, deskPinned: true, updatedAt: 10 },
    { id: 'c2', projectId: 'p1', studioDomain: null, deskPinned: true, updatedAt: 30 },
    { id: 't1', projectId: 'p1', studioDomain: 'travel', updatedAt: 20 },
    { id: 'other', projectId: 'p2', studioDomain: null, deskPinned: true, updatedAt: 40 },
    { id: 'gone', projectId: 'p1', studioDomain: null, deskPinned: true, updatedAt: 50, archived: true },
    { id: 'old', projectId: 'p1', studioDomain: null, deskPinned: true, createdAt: 5 },
    { id: 'unfiled', projectId: 'p1', studioDomain: null, updatedAt: 60 },
  ];
  assert.deepEqual(chatsForWorkspace(sessions, 'coding', 'p1').map((s) => s.id), ['c2', 'c1', 'old']);
  assert.deepEqual(chatsForWorkspace(sessions, 'travel', 'p1').map((s) => s.id), ['t1']);
  assert.deepEqual(chatsForWorkspace(sessions, 'finance', 'p1'), []);
  assert.deepEqual(chatsForWorkspace(sessions, 'nonsense', 'p1'), [], 'an unknown workspace has no chats');
  assert.deepEqual(chatsForWorkspace(undefined, 'coding', 'p1'), []);
  // The newest chat of all belongs to no desk, so no desk lists it.
  for (const desk of ['coding', 'travel', 'education', 'finance', 'research']) {
    assert.ok(
      !chatsForWorkspace(sessions, desk, 'p1').some((entry) => entry.id === 'unfiled'),
      `an unfiled chat must not appear under ${desk}`,
    );
  }
});

/*
 * THE CODING DESK IS NOT A DEFAULT (2026-09-07).
 *
 * Reported: "When you click on a New chat, it goes straight to Coding Desk...
 * When I click on New Chat it should not associate with a workspace."
 *
 * The Coding desk is the null domain and workspaceOfSession read
 * `|| 'coding'`, so every chat belonging to no workspace was filed on the
 * desk. "No workspace" has to be a state the nav can render.
 */
test('a top-level New Chat belongs to no workspace; only the workspace "+" files one', () => {
  const general = makeSession(DEFAULT_PROJECT_ID, greeting, null);
  assert.equal(
    workspaceOfSession(general),
    null,
    'New Chat is just a chat. Returning "coding" here is what put it on the Coding desk.',
  );

  const codingDesk = makeSession(DEFAULT_PROJECT_ID, greeting, null, { pinned: true });
  assert.equal(workspaceOfSession(codingDesk), 'coding', 'the "+" beside the Coding desk still files a chat there');

  const travel = makeSession(DEFAULT_PROJECT_ID, greeting, 'travel', { pinned: true });
  assert.equal(workspaceOfSession(travel), 'travel');

  // And the lists agree: the general chat appears under no desk at all.
  const all = [general, codingDesk, travel];
  for (const desk of ['coding', 'travel', 'education', 'finance', 'research']) {
    const listed = chatsForWorkspace(all, desk, DEFAULT_PROJECT_ID).map((s) => s.id);
    assert.ok(!listed.includes(general.id), `the general chat must not be listed under ${desk}`);
  }
  assert.deepEqual(chatsForWorkspace(all, 'coding', DEFAULT_PROJECT_ID).map((s) => s.id), [codingDesk.id]);
  assert.deepEqual(chatsForWorkspace(all, 'travel', DEFAULT_PROJECT_ID).map((s) => s.id), [travel.id]);
});

/*
 * THE CHROME FOLLOWS MEMBERSHIP, NOT INFERENCE (2026-09-07).
 *
 * Reported as "a New chat with no workspace suddenly moves to Finance
 * Advisor". 2026-09-06 already stopped the sidebar FILING from following
 * inference; the chrome still re-skinned itself, which from the outside is
 * the same thing. Routing is untouched — the turn still carries the inferred
 * desk, so the tools that answer are unchanged.
 */
test('INVARIANT: an inferred desk never re-skins the studio', () => {
  for (const inferredDomain of ['finance', 'travel', 'education', 'research']) {
    assert.equal(
      chromeDomainForSession({ studioDomain: null, inferredDomain }),
      null,
      `a general chat routed to ${inferredDomain} must still look like a general chat`,
    );
  }
  // A workspace the person actually chose still dresses the studio, and an
  // inference underneath it changes nothing.
  assert.equal(chromeDomainForSession({ studioDomain: 'travel', inferredDomain: 'finance' }), 'travel');
  assert.equal(chromeDomainForSession({ studioDomain: 'travel', inferredDomain: null }), 'travel');
  assert.equal(chromeDomainForSession({}), null);
  assert.equal(chromeDomainForSession(null), null);
});
