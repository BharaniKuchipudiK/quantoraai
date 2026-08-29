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
