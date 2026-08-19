import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProjectContextPack,
  DEFAULT_PROJECT_ID,
  normalizeProjectId,
  normalizeProjectInput,
  normalizeProjectResources,
  normalizeProjectSessionIds,
} from './project-state.js';

test('project ids are bounded and compatible with the existing default workspace', () => {
  assert.equal(normalizeProjectId(DEFAULT_PROJECT_ID), DEFAULT_PROJECT_ID);
  assert.equal(normalizeProjectId('project-550e8400-e29b-41d4-a716-446655440000'), 'project-550e8400-e29b-41d4-a716-446655440000');
  assert.equal(normalizeProjectId('../other-user'), null);
  assert.equal(normalizeProjectId(''), null);
});

test('project session membership is bounded, de-duplicated and identifier-safe', () => {
  assert.deepEqual(
    normalizeProjectSessionIds(['session-1', 'session-1', 'session:2', '../bad']),
    ['session-1', 'session:2'],
  );
});

test('project normalization is bounded and preserves optimistic version state', () => {
  const project = normalizeProjectInput({
    id: 'project-test',
    version: 7,
    name: '  Cloud Modernization  ',
    description: 'Decision workspace',
    goal: 'Approve Phase 1',
    status: 'paused',
    color: '#123456',
  });
  assert.ok(project);
  assert.equal(project.name, 'Cloud Modernization');
  assert.equal(project.version, 7);
  assert.equal(project.status, 'paused');
  assert.equal(project.goal, 'Approve Phase 1');
});

test('invalid project status falls back safely and empty names are rejected', () => {
  assert.equal(normalizeProjectInput({ id: 'project-test', name: '' }), null);
  const project = normalizeProjectInput({ id: 'project-test', name: 'Test', status: 'deleted' });
  assert.equal(project?.status, 'active');
});

test('project resource sync is bounded and de-duplicates the same kind/ref', () => {
  const resources = normalizeProjectResources([
    { kind: 'office-presentation', ref: 'fingerprint-1', title: 'Deck.pptx', metadata: { sessionId: 's1' } },
    { kind: 'office-presentation', ref: 'fingerprint-1', title: 'Duplicate.pptx' },
    { kind: 'workspace', ref: 'message:s1:2', title: 'App' },
  ]);
  assert.equal(resources.length, 2);
  assert.equal(resources[0].title, 'Deck.pptx');
  assert.deepEqual(resources[0].metadata, { sessionId: 's1' });
});

test('Project Outcome Graph merges trusted session state without inventing context', () => {
  const project = normalizeProjectInput({
    id: 'project-cloud',
    version: 2,
    name: 'Cloud Modernization',
    description: 'CIO decision workspace',
    goal: 'Secure approval for Phase 1',
    status: 'active',
  });
  assert.ok(project);

  const context = buildProjectContextPack({
    project,
    resources: [
      { kind: 'office-powerpoint', ref: 'fp-1', title: 'Strategic Path Forward.pptx', metadata: { verifiedAt: '2026-08-18T01:00:00Z' } },
    ],
    outcomes: [
      {
        sessionId: 'session-1',
        updatedAt: '2026-08-18T02:00:00Z',
        state: {
          understanding: { statement: 'Prepare the CIO decision pack', status: 'confirmed' },
          definitionOfDone: [],
          constraints: [{ value: 'Keep the migration phased', confidence: 0.95 }],
          assumptions: [{ value: 'Landing zone first', status: 'confirmed' }],
          openQuestions: [{ question: 'Confirm final funding envelope', material: true }],
          decisions: [{ value: 'Use hybrid replatforming', rationale: 'Balances risk and speed' }],
          artifacts: [],
          nextActions: [{ action: 'Finalize the CIO decision slide', risk: 'low' }],
          memory: { scope: 'project', consented: true },
          safety: { unresolvedFlags: [] },
        },
      },
    ],
  });

  assert.equal(context.projectId, 'project-cloud');
  assert.equal(context.goal, 'Secure approval for Phase 1');
  assert.deepEqual(context.decisions, ['Use hybrid replatforming']);
  assert.deepEqual(context.constraints, ['Keep the migration phased']);
  assert.deepEqual(context.openQuestions, ['Confirm final funding envelope']);
  assert.equal(context.nextActions[0].action, 'Finalize the CIO decision slide');
  assert.equal(context.artifacts[0].title, 'Strategic Path Forward.pptx');
  assert.deepEqual(context.cognitiveLedger, []);
  assert.ok(context.facts.includes('Decision: Use hybrid replatforming'));
  assert.ok(context.facts.includes('Constraint: Keep the migration phased'));
  assert.ok(context.facts.includes('Next action: Finalize the CIO decision slide'));
});

test('Project PCL preserves cross-session rejection and correction lineage', () => {
  const project = normalizeProjectInput({ id: 'project-site', name: 'Website', version: 3, goal: 'Improve the homepage' });
  assert.ok(project);

  const context = buildProjectContextPack({
    project,
    outcomes: [
      // readProjectContext returns newest sessions first.
      {
        sessionId: 'session-new',
        updatedAt: '2026-08-19T02:00:00Z',
        state: {
          definitionOfDone: [], constraints: [], assumptions: [], openQuestions: [], decisions: [], artifacts: [], nextActions: [],
          cognitiveLedger: [{
            id: 'correction-1',
            type: 'correction',
            statement: 'Use one continuous outcome story instead',
            actor: 'user',
            status: 'active',
            supersedes: 'decision-old',
          }],
          memory: { scope: 'project', consented: true }, safety: { unresolvedFlags: [] },
        },
      },
      {
        sessionId: 'session-old',
        updatedAt: '2026-08-18T02:00:00Z',
        state: {
          definitionOfDone: [], constraints: [], assumptions: [], openQuestions: [], decisions: [], artifacts: [], nextActions: [],
          cognitiveLedger: [
            { id: 'decision-old', type: 'decision', statement: 'Use three outcome cards', actor: 'user', status: 'active' },
            { id: 'rejection-1', type: 'rejection', statement: 'Do not return to the three-card homepage', actor: 'user', status: 'active' },
          ],
          memory: { scope: 'project', consented: true }, safety: { unresolvedFlags: [] },
        },
      },
    ],
  });

  assert.equal(context.cognitiveLedger.length, 3);
  assert.equal(context.cognitiveLedger.find((entry) => entry.id === 'decision-old')?.status, 'superseded');
  assert.equal(context.cognitiveLedger.find((entry) => entry.id === 'rejection-1')?.status, 'active');
  assert.equal(context.cognitiveLedger.find((entry) => entry.id === 'correction-1')?.status, 'active');
});

test('Project Outcome Graph excludes low-confidence and unconfirmed memory', () => {
  const project = normalizeProjectInput({ id: 'project-safe', name: 'Safe', version: 1 });
  assert.ok(project);
  const context = buildProjectContextPack({
    project,
    outcomes: [{
      sessionId: 'session-1',
      state: {
        definitionOfDone: [],
        constraints: [{ value: 'Weak inference', confidence: 0.4 }],
        assumptions: [{ value: 'Not confirmed', status: 'inferred' }],
        openQuestions: [{ question: 'Minor question', material: false }],
        decisions: [],
        artifacts: [],
        nextActions: [],
        memory: { scope: 'session', consented: false },
        safety: { unresolvedFlags: [] },
      },
    }],
  });
  assert.deepEqual(context.constraints, []);
  assert.deepEqual(context.assumptions, []);
  assert.deepEqual(context.openQuestions, []);
  assert.deepEqual(context.facts, []);
  assert.deepEqual(context.cognitiveLedger, []);
});
