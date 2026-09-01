import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIsCodingRequest } from './build-intent.js';
import { isBuildSessionActive, turnBelongsToBuild } from './build-session.js';
import { planCodingTurn } from './coding-turn-planner.js';

const BOUTIQUE_PROMPT = 'help me build a website for a client who is running a Boutique that is into specialized Indian Sarees like Kanjivaram, Uppada, Gadwal, etc. and also selling ready made dresses for all ages. They are also into providing services like Blouse Stitching, Saree Draping, Pico and Fall, Mehndi etc.';
const BOUTIQUE_ANSWER = 'Boutique showcase + service booking';

const isCodingRequest = (candidate) => resolveIsCodingRequest(candidate, { codingDeskOpen: true });

test('P0 regression: guided-intake answer remains a build before the desk or files exist', () => {
  const active = isBuildSessionActive({
    priorUserMessages: [BOUTIQUE_PROMPT],
    codingDeskOpen: false,
    hasDeskFiles: false,
    isCodingRequest,
  });

  assert.equal(active, true, 'the original boutique build ask must keep the session in build context');
  assert.equal(
    turnBelongsToBuild({ text: BOUTIQUE_ANSWER, buildSessionActive: active }),
    true,
    'the designer answer is the next build step, not ordinary conversation',
  );
});

test('P0 regression: planner executes the boutique answer as a coding turn with no desk and no VFS', () => {
  const plan = planCodingTurn({
    message: BOUTIQUE_ANSWER,
    priorUserMessages: [BOUTIQUE_PROMPT],
    codingDeskOpen: false,
    refineDesk: false,
    studioDomain: null,
    vfsFileCount: 0,
    autoMode: true,
    availableModels: [
      { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free' },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron Super', available: true, pricingKind: 'free' },
    ],
  });

  assert.equal(plan.isCodingTurn, true);
  assert.equal(plan.mode, 'execute');
  assert.notEqual(plan.intent.kind, 'non_coding');
});

test('ordinary conversation still does not activate build context without a prior build ask', () => {
  const active = isBuildSessionActive({
    priorUserMessages: ['what do you think of this boutique idea?'],
    codingDeskOpen: false,
    hasDeskFiles: false,
    isCodingRequest,
  });
  assert.equal(active, false);
  assert.equal(turnBelongsToBuild({ text: 'Boutique showcase + service booking', buildSessionActive: active }), false);
});
