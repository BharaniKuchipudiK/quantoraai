import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(HERE, name), 'utf8');
const readComponent = (name) => fs.readFileSync(path.join(HERE, '../components', name), 'utf8');

test('learner working state is temporary observation logic, never a persistence or mastery writer', () => {
  const working = read('study-working-state.js');
  assert.match(working, /STUDY_LEARNING_INTERACTION_EVENT/);
  assert.match(working, /STUDY_WORKING_STATE_TTL_MS/);
  assert.match(working, /STUDY_WORKING_STATE_MAX_EVENTS/);
  assert.doesNotMatch(working, /fetch\s*\(/);
  assert.doesNotMatch(working, /localStorage|sessionStorage|study_mastery_events|masteryUpdated|supabase/i);
});

test('adaptive request forwards working state through the existing Study context rather than a parallel endpoint', () => {
  const request = read('study-adaptive-request.js');
  assert.match(request, /workingState/);
  assert.match(request, /studyContext/);
  assert.doesNotMatch(request, /fetch\s*\(/);
});

test('Study Hub keeps its existing lifecycle while emitting enough identity for a guarded concept switch', () => {
  const hub = readComponent('StudyHubLauncher.jsx');
  const working = read('study-working-state.js');

  assert.match(hub, /recordStudyLearningInteraction\([\s\S]*source: 'study_hub',[\s\S]*conceptId: topicKey,[\s\S]*conceptLabel: label/);
  assert.doesNotMatch(hub, /setStudyWorkingConcept/);
  assert.match(working, /canSwitchConceptFromHubObservation/);
  assert.match(working, /event\?\.source === 'study_hub'/);
  assert.match(working, /REPEATED_EXPLANATION_REQUESTED/);
  assert.match(working, /VISUAL_REQUESTED/);
});
