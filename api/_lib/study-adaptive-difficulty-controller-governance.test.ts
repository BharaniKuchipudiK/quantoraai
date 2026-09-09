import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
}

test('difficulty controller is deterministic and has no learner-truth or persistence authority', () => {
  const source = read('study-adaptive-difficulty-controller.ts');
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /supabase|localStorage|sessionStorage/i);
  assert.doesNotMatch(source, /study_mastery_events|write.*mastery|update.*mastery|insert.*mastery/i);
  assert.doesNotMatch(source, /Math\.random|randomUUID|Date\.now|new Date\s*\(/);
  assert.doesNotMatch(source, /openrouter|gemini|anthropic|generateContent|chatCompletion/i);
});

test('difficulty controller reuses existing misconception and experience authorities', () => {
  const source = read('study-adaptive-difficulty-controller.ts');
  const routing = read('study-cognitive-routing.ts');
  assert.match(source, /planStudyMisconceptionRepair/);
  assert.match(source, /StudyLearningExperiencePlan/);
  assert.match(routing, /controlStudyAdaptiveDifficulty/);
  assert.match(routing, /applyStudyAdaptiveDifficulty/);
  assert.doesNotMatch(source, /class\s+.*LearnerModel|create.*LearnerModel|persist/i);
});

test('working state may only supply downward support while upward challenge requires verified truth', () => {
  const source = read('study-adaptive-difficulty-controller.ts');
  const overlayStart = source.indexOf('function overlaySupport');
  const overlayEnd = source.indexOf('export function controlStudyAdaptiveDifficulty');
  const overlay = source.slice(overlayStart, overlayEnd);
  assert.match(overlay, /difficultyAction:\s*'reduce'/);
  assert.doesNotMatch(overlay, /difficultyAction:\s*'increase'/);
  assert.match(source, /verified_transfer_ready/);
});

test('independent evidence paths remain locked against temporary support overlays', () => {
  const source = read('study-adaptive-difficulty-controller.ts');
  assert.match(source, /independentEvidenceLocked/);
  assert.match(source, /if \(input\.independentEvidenceLocked\) return base/);
  for (const marker of ['misconception_candidate_probe_locked', 'verified_independent_retrieval', 'verified_vary_evidence', 'verified_retention_probe', 'verified_transfer_ready']) {
    assert.match(source, new RegExp(marker));
  }
});
