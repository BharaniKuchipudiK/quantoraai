import assert from 'node:assert/strict';
import test from 'node:test';
import {
  currentStudyRequestWorkingState,
  normalizeStudyRequestContext,
} from './study-adaptive-learning.js';

function payload(conceptKey: string, conceptLabel: string, reasonCode: string) {
  return {
    conceptKey,
    conceptLabel,
    workingState: {
      version: 'study-working-state-v1',
      temporary: true,
      conceptKey,
      conceptLabel,
      misconceptionCandidate: 'none',
      hintDependence: 'none',
      representationPreference: 'visual',
      recentPattern: 'neutral',
      scaffoldingNeed: 'low',
      observedSignals: 1,
      reasonCodes: [reasonCode],
    },
  };
}

function isolatedRequest(conceptKey: string, conceptLabel: string, reasonCode: string, delay: number) {
  return new Promise<{ conceptKey: string; reasonCode: string | undefined }>((resolve, reject) => {
    setImmediate(() => {
      try {
        const normalized = normalizeStudyRequestContext(payload(conceptKey, conceptLabel, reasonCode), 'education');
        assert.equal(normalized?.workingState?.conceptKey, conceptKey);
        setTimeout(() => {
          try {
            const current = currentStudyRequestWorkingState();
            resolve({
              conceptKey: current?.conceptKey || '',
              reasonCode: current?.reasonCodes[0],
            });
          } catch (error) {
            reject(error);
          }
        }, delay);
      } catch (error) {
        reject(error);
      }
    });
  });
}

test('temporary working state is isolated across concurrent async request chains', async () => {
  normalizeStudyRequestContext({}, 'finance');
  const [first, second] = await Promise.all([
    isolatedRequest('physics.motion', 'Motion', 'visual_requested', 15),
    isolatedRequest('math.linear-functions', 'Linear functions', 'hint_used', 1),
  ]);
  assert.deepEqual(first, { conceptKey: 'physics.motion', reasonCode: 'visual_requested' });
  assert.deepEqual(second, { conceptKey: 'math.linear-functions', reasonCode: 'hint_used' });
});
