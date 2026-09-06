import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStudyActiveLearningContext } from './study-active-learning-context.js';
import { planStudyTeachingRepresentation } from './study-teaching-representation.js';

test('weekly study plan stays text-only even when prior context names forces', () => {
  const message = 'Can you help me prepare a Study plan for a week with an hour of study?';
  const contextText = 'Newton laws, force and friction';
  const activeLearningContext = buildStudyActiveLearningContext({ intent: 'plan', message, contextText });
  const plan = planStudyTeachingRepresentation({ message, contextText, activeLearningContext });
  assert.equal(plan.primaryRepresentation, 'concise_text');
  assert.equal(plan.rendererRequired, false);
  assert.equal(plan.rendererKind, null);
});

test('gap review stays text-only instead of inheriting free-body diagram', () => {
  const message = 'Based on our conversation, what are the gaps in my study?';
  const contextText = 'force and mathematical modelling';
  const activeLearningContext = buildStudyActiveLearningContext({ intent: 'explain', message, contextText });
  const plan = planStudyTeachingRepresentation({ message, contextText, activeLearningContext });
  assert.equal(activeLearningContext.mode, 'progress_review');
  assert.equal(plan.rendererRequired, false);
  assert.equal(plan.rendererKind, null);
});

test('explicit Newton third-law animation requires the native Newton lab', () => {
  const message = "Can you explain Newton's third law of motion with an animation?";
  const contextText = "Newton's third law of motion";
  const activeLearningContext = buildStudyActiveLearningContext({ intent: 'explain', message, contextText });
  const plan = planStudyTeachingRepresentation({ message, contextText, activeLearningContext });
  assert.equal(plan.requestedMode, 'animation');
  assert.equal(plan.primaryRepresentation, 'simulation_or_lab');
  assert.equal(plan.rendererRequired, true);
  assert.equal(plan.rendererKind, 'newton-lab');
});
