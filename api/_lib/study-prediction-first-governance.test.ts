import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('prediction-first remains lesson-flow policy, not learner truth or persistence', () => {
  const intervention = read('study-learning-intervention.ts');
  const loop = read('study-adaptive-lesson-loop.ts');
  assert.match(intervention, /predictionPromptSeen/);
  assert.match(intervention, /predictionEligible/);
  assert.match(loop, /prediction_first/);
  assert.match(loop, /\['PREDICT'\]/);
  assert.match(loop, /\['SEE', 'CONFRONT', 'EXPLAIN', 'VERIFY'\]/);
  assert.doesNotMatch(intervention, /study_mastery_events|masteryUpdated|supabase|localStorage|sessionStorage|fetch\s*\(/i);
  assert.doesNotMatch(loop, /study_mastery_events|masteryUpdated|supabase|localStorage|sessionStorage|fetch\s*\(/i);
});

test('prediction suitability reuses governed representation capability instead of a parallel concept taxonomy', () => {
  const intervention = read('study-learning-intervention.ts');
  assert.match(intervention, /resolveStudyRepresentationCapability/);
  assert.doesNotMatch(intervention, /const\s+(?:MECHANICS|ELECTRICITY|FIELD|GRAPH|PROCESS|STATE_CHANGE)\s*=\s*\//);
});

test('prediction-first does not override explicit representation, struggle, practice, or verification precedence', () => {
  const loop = read('study-adaptive-lesson-loop.ts');
  const predictionIndex = loop.indexOf('intervention.predictionPromptSeen');
  assert.ok(loop.indexOf("intervention.action === 'guided_reconstruction'") < predictionIndex);
  assert.ok(loop.indexOf("intervention.action === 'change_representation'") < predictionIndex);
  assert.ok(loop.indexOf("intent === 'practice'") < predictionIndex);
  assert.ok(loop.indexOf("intent === 'verify'") < predictionIndex);
  assert.match(loop, /representation\.requestedMode !== null/);
});
