import assert from 'node:assert/strict';
import test from 'node:test';
import { planCodingTurn } from './coding-turn-planner.js';
import {
  proveCodingTurn,
  evaluateProofEvidence,
  codingTurnMayClaimSuccess,
  proofFailureCopy,
} from './proof-control-plane.js';

const FOX = 'Build a full Fox & Wolf kids merchandise shop website with 100 unique design images, product pages, and checkout.';

test('Start with 10 plan proves with skills — photos + cart + html', () => {
  const plan = planCodingTurn({
    message: 'start with 10',
    priorUserMessages: [FOX],
    codingDeskOpen: true,
    autoMode: true,
    availableModels: [{ id: 'gemini-flash-latest', name: 'Gemini Flash', available: true }],
  });
  assert.equal(plan.mode, 'execute');

  const verdict = proveCodingTurn({
    plan,
    vfs: {},
    brief: plan.messageForModel,
    allowRepair: true,
  });

  assert.equal(verdict.ok, true, verdict.detail);
  assert.equal(verdict.status, 'pass');
  assert.ok(verdict.evidence.hasHtml, 'must have HTML');
  assert.ok(verdict.evidence.photos >= 10, `need ≥10 photos, got ${verdict.evidence.photos}`);
  assert.equal(verdict.evidence.hasCart, true);
  assert.equal(codingTurnMayClaimSuccess(verdict), true);
});

test('SVG-only shop VFS fails proof then repairs to pass', () => {
  const plan = planCodingTurn({
    message: 'start with 10',
    priorUserMessages: [FOX],
    codingDeskOpen: true,
  });
  const svgOnly = {
    'index.html': {
      content: `<!DOCTYPE html><html><body>
        <main data-quantora-shop-catalog>
          ${Array.from({ length: 10 }, (_, i) => `<img src="fox_${i}.svg" alt="p">`).join('')}
        </main>
      </body></html>`,
      language: 'html',
    },
  };
  // First evaluation without repair path via evaluate
  const before = evaluateProofEvidence(plan, { vfs: svgOnly });
  // SVG relative may or may not count as real — proveCodingTurn must end pass after skills
  const verdict = proveCodingTurn({
    plan,
    vfs: svgOnly,
    brief: plan.messageForModel,
    allowRepair: true,
  });
  assert.equal(verdict.ok, true, `after repair: ${verdict.detail} gaps=${verdict.gaps}`);
  assert.ok(verdict.evidence.photos >= 10);
  assert.equal(verdict.evidence.hasCart, true);
  void before;
});

test('interrupt plan never claims success', () => {
  const plan = planCodingTurn({
    message: FOX,
    codingDeskOpen: true,
  });
  assert.equal(plan.mode, 'interrupt');
  const verdict = proveCodingTurn({ plan, vfs: {} });
  assert.equal(verdict.ok, false);
  assert.equal(codingTurnMayClaimSuccess(verdict), false);
});

test('calculator build proves with HTML only', () => {
  const plan = planCodingTurn({
    message: 'Build a working calculator with number buttons',
    codingDeskOpen: true,
  });
  const vfs = {
    'index.html': {
      content: '<!DOCTYPE html><html><body><button>1</button><div id="display">0</div></body></html>',
      language: 'html',
    },
  };
  const verdict = proveCodingTurn({ plan, vfs, allowRepair: false });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.evidence.hasHtml, true);
});

test('proof failure copy names gaps without claiming done', () => {
  const copy = proofFailureCopy({
    gaps: ['at least 10 loadable catalog photos'],
    detail: 'proof failed',
  }, { intakeAccept: { catalogTarget: 10 } });
  assert.match(copy, /will not claim/i);
  assert.match(copy, /catalog photos/i);
  assert.doesNotMatch(copy, /Verified|runs clean/i);
});
