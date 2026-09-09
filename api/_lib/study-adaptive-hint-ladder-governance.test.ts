import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('adaptive hint ladder is deterministic policy, not persistence or learner truth', () => {
  const ladder = read('study-adaptive-hint-ladder.ts');
  assert.match(ladder, /planStudyAdaptiveHint/);
  assert.match(ladder, /attention_cue/);
  assert.match(ladder, /directional_hint/);
  assert.match(ladder, /structural_hint/);
  assert.match(ladder, /visual_partial_scaffold/);
  assert.match(ladder, /worked_step/);
  assert.match(ladder, /answer/);
  assert.doesNotMatch(ladder, /fetch\s*\(|localStorage|sessionStorage|supabase|study_mastery_events|masteryUpdated/i);
  assert.doesNotMatch(ladder, /Math\.random|randomUUID|Date\.now|new Date\s*\(/);
  assert.doesNotMatch(ladder, /openrouter|gemini|anthropic|generateContent|chatCompletion/i);
});

test('PR7 consumes PR6 Director policy and does not become a renderer authority', () => {
  const ladder = read('study-adaptive-hint-ladder.ts');
  const cognitive = read('study-cognitive-routing.ts');
  assert.match(ladder, /StudyLearningExperiencePlan/);
  assert.match(ladder, /experience\.hintPolicy/);
  assert.match(ladder, /experience\.verificationRequirement/);
  assert.match(cognitive, /planStudyAdaptiveHint/);
  assert.doesNotMatch(ladder, /<quantora-study-(?:picture|lab)/);
  assert.doesNotMatch(ladder, /rendererKind\s*:/);
});

test('PR7 does not pre-implement misconception confirmation or adaptive difficulty control', () => {
  const ladder = read('study-adaptive-hint-ladder.ts');
  assert.doesNotMatch(ladder, /confirmStudyMisconception|diagnoseStudyMisconception|misconception taxonomy/i);
  assert.doesNotMatch(ladder, /expected gain|probability of mastery|mastery probability|difficulty controller/i);
});

test('hint progress remains observation-only and cannot write verified learner truth', () => {
  const interactions = read('../../src/lib/study-learning-interactions.js');
  const evidence = read('../../src/lib/study-evidence-client.js');
  assert.match(interactions, /HINT_PROGRESS_UNLOCKED/);
  assert.match(interactions, /retry && result\.correct/);
  assert.doesNotMatch(interactions, /fetch\s*\(|supabase|study_mastery_events|masteryUpdated/i);
  assert.match(evidence, /gradeStudyAssessment/);
  assert.match(evidence, /observation side-channel only/);
});
