import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudyLearnerModel, StudyNextLearningMove } from './study-learner-model.js';
import { planStudyDiagnosticBreadth } from './study-diagnostic-breadth.js';

function model(input: {
  key: string;
  move: StudyNextLearningMove;
  state?: 'unverified' | 'emerging' | 'verified';
  evidenceCount?: number;
}): StudyLearnerModel {
  const evidenceCount = input.evidenceCount ?? 0;
  return {
    version: 'h2-4-test',
    concept: { id: `${input.key}-id`, key: input.key },
    understanding: {
      state: input.state || (evidenceCount ? 'emerging' : 'unverified'),
      evidenceCount,
      evidenceKinds: evidenceCount ? ['assessment_item'] : [],
      observedThrough: evidenceCount ? '2026-09-02T00:00:00.000Z' : null,
    },
    misconception: {
      state: input.move === 'diagnose_misconception' ? 'signal_observed' : 'none_observed',
      signalCount: input.move === 'diagnose_misconception' ? 1 : 0,
      latestSignalAt: input.move === 'diagnose_misconception' ? '2026-09-02T00:00:00.000Z' : null,
      code: null,
      confidence: null,
      reasonCodes: [],
      remediation: null,
      lastResolvedCode: null,
    },
    retention: { state: 'untested', evidenceCount: 0 },
    nextLearningMove: {
      type: input.move,
      reasonCode: `test:${input.move}`,
      instruction: 'test',
      learnerFacingText: 'test',
    },
  };
}

function candidate(key: string, move: StudyNextLearningMove, depth: number, edgeConfidence = 0.9) {
  return {
    concept: { id: `${key}-id`, canonicalKey: key, label: key },
    model: model({ key, move }),
    depth,
    edgeConfidence,
  };
}

test('H2.4 prioritizes a specific misconception over generic missing evidence', () => {
  const plan = planStudyDiagnosticBreadth({
    candidates: [
      candidate('math.vector.components', 'independent_retrieval', 2, 0.99),
      candidate('math.vector.scalar-vector', 'diagnose_misconception', 1, 0.81),
    ],
  });

  assert.equal(plan.action, 'check');
  if (plan.action === 'check') {
    assert.equal(plan.concept.canonicalKey, 'math.vector.scalar-vector');
    assert.equal(plan.reasonCode, 'diagnostic_next:diagnose_misconception:math.vector.scalar-vector');
  }
});

test('H2.4 chooses the deeper unresolved prerequisite when diagnostic need is otherwise equal', () => {
  const plan = planStudyDiagnosticBreadth({
    candidates: [
      candidate('physics.kinematics.speed-velocity-acceleration', 'guided_repair', 1, 0.99),
      candidate('math.vector.scalar-vector', 'guided_repair', 3, 0.82),
    ],
  });

  assert.equal(plan.action, 'check');
  if (plan.action === 'check') assert.equal(plan.concept.canonicalKey, 'math.vector.scalar-vector');
});

test('H2.4 does not repeat a concept already checked in the short diagnostic session', () => {
  const plan = planStudyDiagnosticBreadth({
    candidates: [
      candidate('math.vector.scalar-vector', 'diagnose_misconception', 1),
      candidate('math.vector.components', 'independent_retrieval', 1),
    ],
    checkedConceptKeys: ['math.vector.scalar-vector'],
  });

  assert.equal(plan.action, 'check');
  if (plan.action === 'check') assert.equal(plan.concept.canonicalKey, 'math.vector.components');
});

test('H2.4 stops after the bounded diagnostic budget', () => {
  assert.deepEqual(
    planStudyDiagnosticBreadth({
      candidates: [candidate('math.vector.components', 'independent_retrieval', 1)],
      checksCompleted: 5,
      maxChecks: 5,
    }),
    { action: 'stop', reasonCode: 'diagnostic_budget_exhausted' },
  );
});

test('H2.4 keeps retention and transfer outside the short diagnostic', () => {
  const plan = planStudyDiagnosticBreadth({
    candidates: [
      candidate('physics.kinematics.projectile-motion', 'retention_probe', 0),
      candidate('math.vector.resultant', 'transfer_task', 0),
    ],
  });

  assert.deepEqual(plan, { action: 'stop', reasonCode: 'diagnostic_sufficient_for_available_scope' });
});
