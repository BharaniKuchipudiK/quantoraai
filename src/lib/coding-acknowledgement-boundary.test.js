import assert from 'node:assert/strict';
import test from 'node:test';
import { planCodingTurn } from './coding-turn-planner.js';
import { planFromMessageSnapshot, runCodingTurnSkills } from './coding-turn-skills.js';
import { proveCodingTurn } from './proof-control-plane.js';
import { shouldKeepWorkspaceForPrompt, shouldRefineRunningDesk } from '../../shared/workspace-intent.js';
import { deriveStudioMission } from './studio-mission.js';

const context = {
  priorUserMessages: ['Build a service control centre with an engineer filter'],
  codingDeskOpen: true,
  vfsFileCount: 5,
  studioDomain: null,
  autoMode: false,
};

for (const message of ['Excellent work', 'Thanks!', 'Great job, thank you', 'Looks good 👍']) {
  test(`local acknowledgement stops before model, skills and proof: ${message}`, () => {
    const plan = planCodingTurn({ ...context, message, refineDesk: true });
    assert.equal(plan.mode, 'interrupt');
    assert.equal(plan.isCodingTurn, false);
    assert.equal(plan.interrupt.kind, 'acknowledgement');
    assert.equal(plan.modelPlan, null);
    assert.equal(plan.runSkillsFirst, false);
    assert.deepEqual(plan.skillsRequired, []);
    assert.deepEqual(plan.skillsMissing, []);
    assert.deepEqual(plan.interrupt.chips, []);

    // The exact snapshot shape useChatStream attaches to a local-reply message.
    const restored = planFromMessageSnapshot({ intent: plan.intent, skillsRequired: [] });
    assert.equal(restored.isCodingTurn, false);
    assert.equal(restored.mode, 'pass');
    assert.equal(restored.runSkillsFirst, false);
    const vfs = { 'index.html': { content: '<!doctype html><html><body>Keep me</body></html>' } };
    const before = JSON.stringify(vfs);
    const skills = runCodingTurnSkills({ plan: restored, vfs });
    assert.equal(skills.vfs, vfs);
    assert.equal(skills.changed, false);
    assert.deepEqual(skills.ran, []);
    const proof = proveCodingTurn({ plan: restored, vfs, allowRepair: true });
    assert.equal(proof.vfs, vfs);
    assert.equal(proof.detail, 'non-coding');
    assert.equal(proof.repaired, false);
    assert.deepEqual(proof.ran, []);
    assert.equal(JSON.stringify(vfs), before);
    assert.equal(shouldKeepWorkspaceForPrompt({ prompt: message, hasWorkspace: true }), true);
    assert.equal(shouldKeepWorkspaceForPrompt({ prompt: message, hasWorkspace: false }), false);
    assert.equal(shouldRefineRunningDesk({ prompt: message, hasDeskFiles: true }), false);
  });
}

test('praise plus an instruction remains a build and is not a canned acknowledgement', () => {
  for (const message of ['Excellent work — now add an engineer filter', 'Thanks, fix the CSV export', 'Great work but the button is still broken']) {
    const plan = planCodingTurn({ ...context, message });
    assert.equal(plan.mode, 'execute', message);
    assert.equal(plan.isCodingTurn, true, message);
  }
});

test('existing consent, intake and question paths remain distinct', () => {
  for (const message of ['Proceed', 'Yes', 'Continue', 'Boutique showcase + service booking']) {
    assert.equal(planCodingTurn({ ...context, message }).mode, 'execute', message);
  }
  assert.equal(planCodingTurn({ ...context, message: 'Explain how the filter works' }).mode, 'pass');
  for (const studioDomain of ['education', 'travel', 'finance', 'research']) {
    assert.equal(planCodingTurn({ ...context, message: 'Excellent work', studioDomain }).mode, 'pass');
  }
  assert.equal(planCodingTurn({ message: 'Excellent work', autoMode: false }).mode, 'pass');
});

test('a retained CSV goal is labelled Project, never claimed as current work', () => {
  const mission = deriveStudioMission({
    conversationContext: { goal: 'Ensure export to CSV works across all pages' },
    messages: [{ sender: 'user', text: 'Excellent work' }],
    hasPreview: true,
  });
  assert.equal(mission.lead, 'Project');
  assert.match(mission.goal, /CSV/);
  assert.equal(mission.next, '');
});
