import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('experience director is pure deterministic pedagogy policy, not learner truth or persistence', () => {
  const director = read('study-learning-experience-director.ts');
  assert.match(director, /directStudyLearningExperience/);
  assert.match(director, /reasonCodes/);
  assert.doesNotMatch(director, /fetch\s*\(|localStorage|sessionStorage|supabase|study_mastery_events|masteryUpdated/i);
  assert.doesNotMatch(director, /Math\.random|randomUUID|Date\.now|new Date\s*\(/);
  assert.doesNotMatch(director, /openrouter|gemini|anthropic|generateContent|chatCompletion/i);
});

test('temporary working state reaches routing through request scope, never by mutating learner truth', () => {
  const adaptive = read('study-adaptive-learning.ts');
  const cognitive = read('study-cognitive-routing.ts');
  assert.match(adaptive, /AsyncLocalStorage<StudyWorkingStateSnapshot \| null>/);
  assert.match(adaptive, /currentStudyRequestWorkingState/);
  assert.doesNotMatch(adaptive, /WeakMap<StudyLearnerModel, StudyWorkingStateSnapshot>/);
  assert.match(cognitive, /currentStudyRequestWorkingState\(\)/);
  assert.match(cognitive, /directStudyLearningExperience/);
  assert.doesNotMatch(cognitive, /learnerModel\.(?:workingState|hintDependence|scaffoldingNeed)\s*=/);
});

test('verified teaching strategy has one implementation authority', () => {
  const adaptive = read('study-adaptive-learning.ts');
  const director = read('study-learning-experience-director.ts');
  assert.match(adaptive, /return teachingStrategyFromLearnerTruth\(model\)/);
  assert.match(director, /export function teachingStrategyFromLearnerTruth/);
  assert.doesNotMatch(adaptive, /case 'diagnose_misconception'[\s\S]*case 'guided_repair'/);
});

test('native renderer authority remains in representation capabilities, not the director', () => {
  const director = read('study-learning-experience-director.ts');
  const representation = read('study-teaching-representation.ts');
  assert.doesNotMatch(director, /<quantora-study-(?:picture|lab)/);
  assert.doesNotMatch(director, /rendererKind\s*:/);
  assert.match(representation, /experiencePlan/);
  assert.match(representation, /capability\.rendererKind/);
  assert.match(representation, /reason: 'explicit_request'/);
});

test('PR6 does not pre-implement the later hint ladder or misconception confirmation engine', () => {
  const director = read('study-learning-experience-director.ts');
  assert.doesNotMatch(director, /attention cue|directional hint|structural hint|worked step/i);
  assert.doesNotMatch(director, /confirmStudyMisconception|diagnoseStudyMisconception|misconception taxonomy/i);
  assert.doesNotMatch(director, /expected gain|probability of mastery|mastery probability/i);
});
