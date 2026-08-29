import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMoveChatToProject, DEFAULT_PROJECT_ID, makeHandoverSession } from './useStudioSession.js';

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
  assert.deepEqual(session.messages, [greeting]);
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
  assert.deepEqual(session.messages, [greeting], 'and still without the transcript');
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
