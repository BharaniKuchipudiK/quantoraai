import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { planCodingTurn } from './coding-turn-planner.js';
import {
  proveCodingTurn,
  evaluateProofEvidence,
  codingTurnMayClaimSuccess,
  proofFailureCopy,
} from './proof-control-plane.js';

const FOX = 'Build a full Fox & Wolf kids merchandise shop website with 100 unique design images, product pages, and checkout.';

test('Start with 10 on an EMPTY desk fails proof honestly — never fabricates a shop to pass', () => {
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

  // The model shipped nothing. Proof must REFUSE to claim success — it never
  // injects a fabricated catalog + stock photos to force a green verdict.
  assert.equal(verdict.ok, false);
  assert.equal(codingTurnMayClaimSuccess(verdict), false);
  assert.ok(verdict.gaps.length > 0, 'must report the honest gaps');
});

test('a shop referencing image files it never shipped fails proof honestly (no loadable photos)', () => {
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
  const before = evaluateProofEvidence(plan, { vfs: svgOnly });
  // The referenced fox_*.svg files are not in the VFS, so they are not loadable
  // photos. Proof reports the honest gap instead of injecting stock photos to
  // manufacture a pass.
  const verdict = proveCodingTurn({
    plan,
    vfs: svgOnly,
    brief: plan.messageForModel,
    allowRepair: true,
  });
  assert.equal(verdict.ok, false, `gaps=${verdict.gaps}`);
  assert.ok(verdict.evidence.photos < 10);
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

test('React App.jsx VFS proves for ordinary coding builds', () => {
  const plan = planCodingTurn({
    message: 'Build a todo list app',
    codingDeskOpen: true,
  });
  const vfs = {
    'App.jsx': {
      content: 'export default function App(){ return <main><h1>Todos</h1></main>; }',
      language: 'jsx',
    },
  };
  const verdict = proveCodingTurn({ plan, vfs, allowRepair: false });
  assert.equal(verdict.ok, true, verdict.detail);
});

test('proof failure copy names the gaps and never claims the turn is done', () => {
  const copy = proofFailureCopy({
    gaps: ['at least 10 loadable catalog photos'],
    detail: 'proof failed',
  }, { intent: { kind: 'shop_build' }, intakeAccept: { catalogTarget: 10, expanded: true } });
  assert.match(copy, /did not pass/i);
  assert.match(copy, /catalog photos/i);
  assert.doesNotMatch(copy, /Verified|runs clean/i);
});

test('a non-shop build is never answered with catalog photos and Add to Cart', () => {
  /*
   * This copy used to be written as REPLACEMENT text for the entire turn, and it
   * talked about catalog photos and Add to Cart whatever had been asked for. A
   * storage-hygiene dashboard came back as advice about a shop, with the real
   * build deleted before anyone saw it. Shop wording belongs to shop turns only.
   */
  const copy = proofFailureCopy({
    gaps: ['runnable Preview (HTML or React VFS)'],
    detail: 'no runnable entry',
  }, { intent: { kind: 'app_build' } });
  assert.doesNotMatch(copy, /catalog photo|Add to Cart|Start with/i);
  assert.match(copy, /runnable Preview/i);
  // The note must say the build survived. That sentence is the whole difference
  // between "your work was hidden" and "I could not verify your work".
  assert.match(copy, /exactly what the model produced|Nothing was replaced/i);
});

test('INVARIANT: a failed proof never replaces the model output', () => {
  /*
   * The regression that cost a week: useChatStream assigned the failure copy
   * straight onto the message text and returned, skipping the path that renders
   * the build. The gate may annotate a turn. It may not delete it.
   */
  const hook = readFileSync(
    path.join(import.meta.dirname, '..', 'hooks', 'useChatStream.js'),
    'utf8',
  );
  assert.doesNotMatch(
    hook,
    /text:\s*failText/,
    'the proof failure copy must be appended as a note, never assigned as the message text',
  );
  assert.match(hook, /proofNote/, 'the failure copy should reach the turn as a note');
});
