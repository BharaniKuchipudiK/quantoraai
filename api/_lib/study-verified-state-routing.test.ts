import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { StudyLearnerModel, StudyNextLearningMove } from './study-learner-model.js';
import { interpretStudyTurn } from './study-cognitive-routing.js';

function learnerModel(nextLearningMove: StudyNextLearningMove): StudyLearnerModel {
  return {
    version: 'study-learner-model-test-fixture',
    concept: { id: 'electricity-emf', key: 'physics.electricity.emf-terminal-voltage' },
    understanding: {
      state: 'emerging',
      evidenceCount: 2,
      evidenceKinds: ['assessment_item'],
      observedThrough: '2026-09-03T00:00:00.000Z',
    },
    misconception: {
      state: 'none_observed',
      signalCount: 0,
      latestSignalAt: null,
      code: null,
      confidence: null,
      reasonCodes: [],
      remediation: null,
      lastResolvedCode: null,
    },
    retention: {
      state: nextLearningMove === 'retention_probe' ? 'needs_support' : 'untested',
      evidenceCount: 0,
      targetDelayDays: 1,
      dueAt: null,
      due: nextLearningMove === 'retention_probe',
    },
    transfer: {
      state: 'untested',
      evidenceCount: 0,
      latestObservedAt: null,
    },
    nextLearningMove: {
      type: nextLearningMove,
      reasonCode: `test:${nextLearningMove}`,
      instruction: 'Use the verified next learning move.',
      learnerFacingText: 'Try the verified next learning move.',
    },
  };
}

const electricityPrompt = 'EMF and terminal potential difference in a battery circuit with internal resistance.';
const electricityHistory = [
  { role: 'user', text: `Explain ${electricityPrompt}` },
  { role: 'assistant', text: 'EMF is the energy supplied per coulomb by the source.' },
];

test('production Study cognitive route changes representation for the same concept from verified learner state', () => {
  const retrieval = interpretStudyTurn({
    studioDomain: 'education',
    message: electricityPrompt,
    history: electricityHistory,
    learnerModel: learnerModel('independent_retrieval'),
  });
  const repair = interpretStudyTurn({
    studioDomain: 'education',
    message: electricityPrompt,
    history: electricityHistory,
    learnerModel: learnerModel('guided_repair'),
  });
  const retention = interpretStudyTurn({
    studioDomain: 'education',
    message: electricityPrompt,
    history: electricityHistory,
    learnerModel: learnerModel('retention_probe'),
  });
  const transfer = interpretStudyTurn({
    studioDomain: 'education',
    message: electricityPrompt,
    history: electricityHistory,
    learnerModel: learnerModel('transfer_task'),
  });

  assert.equal(retrieval?.representation.primaryRepresentation, 'interactive_probe');
  assert.equal(repair?.representation.primaryRepresentation, 'annotated_diagram');
  assert.equal(repair?.representation.rendererKind, 'electricity-circuit');
  assert.equal(retention?.representation.primaryRepresentation, 'governed_assessment');
  assert.equal(retention?.representation.learnerAction, 'retrieve');
  assert.equal(transfer?.representation.primaryRepresentation, 'governed_assessment');
  assert.equal(transfer?.representation.learnerAction, 'explain');

  for (const route of [retrieval, repair, retention, transfer]) {
    assert.equal(route?.representation.reason, 'verified_learner_state');
    assert.equal(route?.lessonLoop.reason, 'verified_learner_state');
    assert.equal(route?.lessonLoop.mustWaitForLearner, true);
    assert.equal(route?.lessonLoop.maxLearnerQuestions, 1);
  }
});

test('production chat handler passes the already-loaded authoritative learner model into Study routing', () => {
  const source = readFileSync(new URL('./chat-handler.ts', import.meta.url), 'utf8');
  const routeCall = source.match(/const studyInterpretation = interpretStudyTurn\(\{[\s\S]*?\n\s*\}\);/m)?.[0] || '';
  assert.match(routeCall, /learnerModel:\s*adaptiveStudyLearnerModel/);
  assert.doesNotMatch(source, /loadStudyLearnerModel\([^)]*\)[\s\S]{0,500}loadStudyLearnerModel\(/m, 'chat handler must not create a second learner-model load');
});

test('no verified learner model preserves the existing conservative default', () => {
  const route = interpretStudyTurn({
    studioDomain: 'education',
    message: 'What should I do next?',
    history: electricityHistory,
  });
  assert.equal(route?.representation.reason, 'default_teaching');
  assert.equal(route?.representation.primaryRepresentation, 'concise_text');
  assert.equal(route?.lessonLoop.mustWaitForLearner, false);
});
