import assert from 'node:assert/strict';
import test from 'node:test';
import { requestStudyAssessment } from './study-evidence-client.js';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

test('Assessment session client sends bounded unique exclusion refs without changing ordinary issue shape', async () => {
  const originalFetch = global.fetch;
  const sent = [];
  global.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      attemptId: ATTEMPT_ID,
      item: {
        itemKey: 'motion-graphs-acceleration-slope',
        itemVersion: '1',
        prompt: 'What does slope represent?',
        options: [{ id: 'a', text: 'Acceleration' }],
      },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    await requestStudyAssessment({
      conceptId: 'physics.kinematics.motion-graphs',
      conceptLabel: 'Motion graphs',
      sessionId: 'session-1',
    });
    await requestStudyAssessment({
      conceptId: 'physics.kinematics.motion-graphs',
      conceptLabel: 'Motion graphs',
      sessionId: 'session-1',
      excludeItemRefs: ['motion-graphs-velocity-slope@1', 'motion-graphs-velocity-slope@1'],
    });

    assert.deepEqual(sent[0], {
      action: 'issue',
      conceptKey: 'physics.kinematics.motion-graphs',
      conceptLabel: 'Motion graphs',
      sessionId: 'session-1',
    });
    assert.deepEqual(sent[1].excludeItemRefs, ['motion-graphs-velocity-slope@1']);
    assert.equal('correctOptionId' in sent[1], false);
  } finally {
    global.fetch = originalFetch;
  }
});
