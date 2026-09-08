import test from 'node:test';
import assert from 'node:assert/strict';
import { selectModelsForTurn } from './select-models.js';

const MODELS = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super', available: true, pricingKind: 'free', specialty: 'coding' },
  { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen Coder', available: true, pricingKind: 'paid', specialty: 'Code Synthesis' },
];

test('pinned model stays explicit and is not replaced by Auto', () => {
  const decision = selectModelsForTurn({
    models: MODELS,
    message: 'Design the architecture for a multi-file app',
    explicitModelId: 'gemini-flash-latest',
    buildMode: true,
  });
  assert.equal(decision.primaryModelId, 'gemini-flash-latest');
  assert.equal(decision.selectionSource, 'explicit');
});

test('Auto coding turns default to Gemini', () => {
  const decision = selectModelsForTurn({
    models: MODELS,
    message: 'Build a calculator',
    explicitModelId: 'auto',
    buildMode: true,
  });
  assert.equal(decision.primaryModelId, 'gemini-flash-latest');
  assert.equal(decision.selectionSource, 'coding_desk_auto');
  assert.equal(decision.reason, 'build');
});

test('Auto coding refine stays on fast Gemini instead of a slow unproven free coder', () => {
  // Escalating to a queued *:free coder is what caused 135s timeouts + the fake
  // "proved on the desk". Gemini is the primary; the free coder is a fallback.
  const decision = selectModelsForTurn({
    models: MODELS,
    message: 'fix the preview',
    explicitModelId: 'auto',
    buildMode: true,
    refineMode: true,
    allowPaid: false,
  });
  assert.equal(decision.primaryModelId, 'gemini-flash-latest');
  assert.equal(decision.selectionSource, 'coding_desk_auto');
});

test('Auto escalate with empty Active list still keeps Gemini last-resort fallback', () => {
  const decision = selectModelsForTurn({
    models: [],
    message: 'Refactor the entire multi-file architecture',
    explicitModelId: 'auto',
    buildMode: true,
    hasVFS: true,
    qualityHints: { fileCount: 12 },
  });
  assert.equal(decision.primaryModelId, 'gemini-flash-latest');
  assert.equal(decision.selectionSource, 'coding_desk_auto');
});

test('null modelId on a coding turn uses Coding Desk Auto', () => {
  const decision = selectModelsForTurn({
    models: MODELS,
    message: 'Add a login form',
    explicitModelId: null,
    taskCategory: 'coding',
  });
  assert.equal(decision.selectionSource, 'coding_desk_auto');
  assert.equal(decision.primaryModelId, 'gemini-flash-latest');
});

test('Travel/research non-build Auto stays on ranked free routing', () => {
  const decision = selectModelsForTurn({
    models: MODELS,
    message: 'Compare these two investment strategies',
    explicitModelId: 'auto',
    studioMode: 'ask',
    taskCategory: 'research',
  });
  assert.notEqual(decision.selectionSource, 'coding_desk_auto');
});

type Fixture = { id: string; name: string; available: boolean; pricingKind: string; specialty?: string; vision?: boolean };

const VISION_MODELS: Fixture[] = [
  ...MODELS,
  // Paid, and the only entry that DECLARES vision — the shape
  // discoverAnthropicFlagships produces from the live catalogue.
  { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', available: true, pricingKind: 'paid', vision: true },
];

test('an image turn has more than one viable route', () => {
  /*
   * Reported live: two attached images, "Request failed: Quantora could not
   * complete this request", on a deployment whose paid flagship was answering
   * every other turn.
   *
   * The primary was forced to Gemini and the fallbacks came from rankFreeModels,
   * which filters to FREE models — so the only models that declare vision (the
   * discovered flagships, all paid) could never be a rung. Downstream,
   * capabilitiesFor drops any route without vision, emptying the rest. An image
   * turn was Gemini or nothing.
   */
  const decision = selectModelsForTurn({
    models: VISION_MODELS,
    message: 'what is in this screenshot?',
    hasImages: true,
    allowPaid: true,
  });
  assert.equal(decision.reason, 'vision');
  assert.ok(
    decision.fallbackModelIds.includes('anthropic/claude-opus-5'),
    'a paid model that declares vision must be a rung on a vision turn',
  );
});

test('a vision fallback must actually declare vision, never be assumed from the id', () => {
  const decision = selectModelsForTurn({
    models: VISION_MODELS,
    message: 'describe this image',
    hasImages: true,
    allowPaid: true,
  });
  // Nemotron and Qwen declare nothing, so capabilitiesFor would filter them out
  // downstream; offering them as rungs builds a ladder with no rungs on it.
  for (const id of decision.fallbackModelIds) {
    const model = VISION_MODELS.find((candidate) => candidate.id === id);
    assert.equal(model?.vision, true, `${id} was offered for a vision turn without declaring vision`);
  }
});

test('a vision turn still routes when no Gemini exists at all', () => {
  // This case used to fall through to the literal 'gemini-flash-latest' and 503.
  const decision = selectModelsForTurn({
    models: VISION_MODELS.filter((model) => !model.id.startsWith('gemini')),
    message: 'read this image',
    hasImages: true,
    allowPaid: true,
  });
  assert.equal(decision.primaryModelId, 'anthropic/claude-opus-5');
  assert.equal(decision.provider, 'openrouter');
});

test('a session with no paid access keeps a free-only vision chain', () => {
  const decision = selectModelsForTurn({
    models: VISION_MODELS,
    message: 'what is this',
    hasImages: true,
    allowPaid: false,
  });
  assert.equal(decision.primaryModelId, 'gemini-flash-latest');
  assert.ok(
    !decision.fallbackModelIds.includes('anthropic/claude-opus-5'),
    'a paid rung must not appear without paid access',
  );
});

test('a PINNED model on an image turn also gets vision-capable backup', () => {
  /*
   * The explicit branch returns before the vision ladder, so it kept the
   * original single-route failure: fallbacks came from rankFreeModels, the
   * capability filter dropped every one for not declaring vision, and the paid
   * vision model the session pays for was never attempted. Pin Gemini, attach
   * an image, lose Gemini, and the turn had nowhere to go.
   */
  const decision = selectModelsForTurn({
    models: VISION_MODELS,
    message: 'what is in this screenshot?',
    explicitModelId: 'gemini-flash-latest',
    hasImages: true,
    allowPaid: true,
  });
  assert.equal(decision.primaryModelId, 'gemini-flash-latest', 'the pinned choice stays primary');
  assert.equal(decision.selectionSource, 'explicit');
  assert.ok(
    decision.fallbackModelIds.includes('anthropic/claude-opus-5'),
    'a pinned image turn must be backed up by a model that declares vision',
  );
  for (const id of decision.fallbackModelIds) {
    assert.equal(
      VISION_MODELS.find((m) => m.id === id)?.vision, true,
      `${id} was offered as a vision rung without declaring vision`,
    );
  }
});

test('a pinned NON-image turn keeps its ordinary fallbacks', () => {
  // The vision ladder must not narrow an ordinary turn to nothing.
  const decision = selectModelsForTurn({
    models: VISION_MODELS,
    message: 'explain this function',
    explicitModelId: 'gemini-flash-latest',
    hasImages: false,
    allowPaid: true,
  });
  assert.equal(decision.primaryModelId, 'gemini-flash-latest');
  assert.ok(decision.fallbackModelIds.length > 0, 'an ordinary pinned turn still needs a ladder');
  assert.ok(!decision.fallbackModelIds.includes('gemini-flash-latest'), 'the primary is not its own rung');
});

/*
 * THE SERVER IS WHERE THE ROUTE IS DECIDED (2026-09-08).
 *
 * These tests exist because a fix that worked in every unit test did nothing
 * in production, and the reason is the shape of this call.
 *
 * The client resolves a model too, but only for the LABEL: `autoTarget` sends
 * `id: 'auto'`, so `isCodingDeskAutoSelection` is true here, `explicit` is
 * null, and THIS function re-resolves the route that actually runs. Any rule
 * proven only against the client resolver is proven against nothing.
 *
 * And the hints differ between the two. The client's own resolver never sent
 * `repair`; the request payload sent `repair: refineDesk` — true on EVERY
 * refine — which landed on the escalation immediately after the small-refine
 * check and sent "make the header blue" to the paid flagship. A refine is not
 * a repair, and the two must not arrive here wearing the same name.
 *
 * The hints below are built the way api/_lib/chat-handler.ts builds them, on
 * purpose. A fixture that invents its own shape is how the original defect
 * survived five gates and a review.
 */
const REFINE_CATALOGUE = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
  { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', available: true, pricingKind: 'paid', specialty: 'coding' },
];

/** As chat-handler builds them: repair is `qualityHints.repair === true || task === 'repair'`. */
const serverHints = ({ fileCount = 1, repair = false, probeFailure = false } = {}) =>
  ({ fileCount, repair, probeFailure });

const routeRefine = (message, hints) => selectModelsForTurn({
  models: REFINE_CATALOGUE,
  message,
  explicitModelId: 'auto',   // exactly what autoTarget sends
  refineMode: true,
  hasVFS: true,
  buildMode: true,
  qualityHints: hints,
  allowPaid: true,
}).primaryModelId;

test('INVARIANT: a small refine stays cheap through the SERVER router, not just the client one', () => {
  for (const ask of [
    'Can you add descriptions as a drop-down list',
    'make the header blue',
    'shorter please',
  ]) {
    assert.equal(routeRefine(ask, serverHints()), 'gemini-flash-latest', ask);
  }
});

test('INVARIANT: a genuine repair still escalates, and it reaches here by task, not by being a refine', () => {
  // The repair path (api/_lib/repair.ts) sends task:"repair", which chat-handler
  // turns into qualityHints.repair. That must still reach the stronger coder.
  assert.equal(routeRefine('fix it', serverHints({ repair: true })), 'anthropic/claude-opus-5');
  assert.equal(routeRefine('try again', serverHints({ probeFailure: true })), 'anthropic/claude-opus-5');
});

test('INVARIANT: a substantial refine still escalates through the server router', () => {
  assert.equal(
    routeRefine('refactor the entire codebase into modules', serverHints()),
    'anthropic/claude-opus-5',
  );
  assert.equal(routeRefine('tidy this up', serverHints({ fileCount: 9 })), 'anthropic/claude-opus-5');
});
