import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CODING_DESK_AUTO_MODEL_ID,
  activeModelsForRouting,
  isCodingDeskAutoSelection,
  rankCodingDeskFallbacks,
  resolveCodingDeskModel,
  shouldEscalateCodingDeskModel,
} from './coding-desk-auto-model.js';

const ACTIVE = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier', specialty: 'Fast multimodal' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super', available: true, pricingKind: 'free', specialty: 'Reasoning and coding' },
  { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', available: true, pricingKind: 'paid', specialty: 'Code Synthesis' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', available: true, pricingKind: 'paid', specialty: 'General' },
];

test('Auto sentinel is recognized for null, empty, and auto id', () => {
  assert.equal(isCodingDeskAutoSelection(null), true);
  assert.equal(isCodingDeskAutoSelection({ id: CODING_DESK_AUTO_MODEL_ID }), true);
  assert.equal(isCodingDeskAutoSelection('auto'), true);
  assert.equal(isCodingDeskAutoSelection({ id: 'gemini-flash-latest' }), false);
});

test('ordinary coding turns stay on Gemini', () => {
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'Build a simple todo list with React',
    availableModels: ACTIVE,
  });
  assert.equal(choice.modelId, 'gemini-flash-latest');
  assert.equal(choice.escalated, false);
  assert.equal(choice.reason, 'default_gemini');
});

test('refine / probe-failure turns STAY on fast Gemini rather than a slow unproven free coder', () => {
  // Escalating a free-tier build to a queued *:free coder is what blew past the
  // 135s deadline and triggered the fake "proved on the desk". Gemini finishes.
  const refine = resolveCodingDeskModel({
    task: 'coding',
    message: 'Fix the preview',
    refineMode: true,
    availableModels: ACTIVE,
    allowPaid: false,
  });
  assert.equal(refine.modelId, 'gemini-flash-latest');
  assert.equal(refine.escalated, false);
  /*
   * REASON CHANGED 2026-09-08, outcome did not. This used to read
   * 'stay_gemini_unproven_free': the turn escalated, then came back to Gemini
   * because no acceptable stronger model existed under allowPaid:false. It now
   * reads 'default_gemini' because a short refine on a small project no longer
   * escalates at all. Same route, and the reason finally names the real cause.
   */
  assert.equal(refine.reason, 'default_gemini');

  /*
   * AND THE CASE THIS TEST NEVER EXERCISED, which is why production broke.
   * Every assertion above passes allowPaid:false. A signed-in session with a
   * paid credential runs allowPaid:TRUE — and there the identical turn used to
   * reach anthropic/claude-opus-5, whose slow attempt consumed the wall clock
   * so no fallback could run. A fixture asserting a configuration production
   * does not use proves nothing about production.
   */
  const refinePaid = resolveCodingDeskModel({
    task: 'coding',
    message: 'Fix the preview',
    refineMode: true,
    availableModels: ACTIVE,
    allowPaid: true,
  });
  assert.equal(refinePaid.modelId, 'gemini-flash-latest', 'a paid credential must not make a small refine expensive');
  assert.equal(refinePaid.escalated, false);

  const probe = resolveCodingDeskModel({
    task: 'coding',
    message: 'try again',
    availableModels: ACTIVE,
    qualityHints: { probeFailure: true },
    allowPaid: false,
  });
  assert.equal(probe.modelId, 'gemini-flash-latest');
});

test('complex asks still flag escalation, but stay on Gemini without a paid coder', () => {
  assert.equal(shouldEscalateCodingDeskModel({
    message: 'Design the architecture for a multi-file production app',
  }), true);
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'Design the architecture for a multi-file production app',
    availableModels: ACTIVE,
    allowPaid: false,
  });
  // No paid coder and no proven free coder → the fast reliable default wins.
  assert.equal(choice.modelId, 'gemini-flash-latest');
  assert.equal(choice.escalated, false);
});

test('shop / e-commerce builds stay on the fast reliable default, not a slow free coder', () => {
  for (const message of [
    'build a shop website for my coffee shop',
    'create an online store to sell my sarees',
    'make an e-commerce site with a product catalog',
  ]) {
    assert.equal(shouldEscalateCodingDeskModel({ message }), true, message);
  }
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'build a shop website for my coffee shop',
    availableModels: ACTIVE,
    allowPaid: false,
  });
  // The shop build now runs on Gemini (fast, finishes in time, writes the real
  // rich page) instead of escalating to a free coder that times out.
  assert.equal(choice.modelId, 'gemini-flash-latest');
  // A plain brochure/portfolio ask still stays on the fast default.
  assert.equal(shouldEscalateCodingDeskModel({ message: 'build a simple about page' }), false);
});

test('a free coder that has EARNED it on measured outcomes is still escalated to', () => {
  const withProven = [
    { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
    {
      id: 'proven/coder:free',
      name: 'Proven Coder',
      available: true,
      pricingKind: 'free',
      specialty: 'coder',
      quality: { sampleSize: 50, score: 0.9 },
    },
  ];
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'build a shop website for my coffee shop',
    availableModels: withProven,
    allowPaid: false,
  });
  assert.equal(choice.modelId, 'proven/coder:free');
  assert.equal(choice.escalated, true);
});

test('free Studio without keys never auto-picks paid-only models', () => {
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'Refactor the entire codebase architecture',
    availableModels: ACTIVE,
    allowPaid: false,
  });
  assert.notEqual(choice.modelId, 'qwen/qwen-2.5-coder-32b-instruct');
  assert.equal(ACTIVE.find((m) => m.id === choice.modelId)?.pricingKind === 'paid', false);
});

test('BYOK may escalate to a paid coding specialist already in Active', () => {
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'Refactor the entire codebase architecture',
    availableModels: ACTIVE,
    allowPaid: true,
  });
  assert.equal(choice.modelId, 'qwen/qwen-2.5-coder-32b-instruct');
  assert.equal(choice.escalated, true);
});

test('a paid FLAGSHIP is preferred over a cheap "coder" specialist when escalating', () => {
  // The disease: an agent build escalated but picked qwen-2.5-coder (a cheap paid
  // coder), which truncated to a 22-line HTML and rendered a blank preview. A
  // flagship (Claude Sonnet) writes the complete file, so when paid is allowed it
  // must win the escalation over a model whose only edge is the word "coder".
  const withFlagship = [
    { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
    { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', available: true, pricingKind: 'paid', specialty: 'Code Synthesis' },
    { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', available: true, pricingKind: 'paid', specialty: 'Flagship coder' },
  ];
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'Build an AI agent that connects to my Google Drive and crawls the entire drive',
    availableModels: withFlagship,
    allowPaid: true,
  });
  assert.equal(choice.modelId, 'anthropic/claude-sonnet-5');
  assert.equal(choice.escalated, true);
});

test('a mini/lite flagship variant never beats a real coder on the flagship bonus', () => {
  // gpt-4o-mini carries a flagship name but not the completion reliability — it
  // must not steal the escalation from qwen on the flagship boost.
  const choice = resolveCodingDeskModel({
    task: 'coding',
    message: 'Refactor the entire codebase architecture',
    availableModels: ACTIVE,
    allowPaid: true,
  });
  assert.equal(choice.modelId, 'qwen/qwen-2.5-coder-32b-instruct');
});

test('unavailable stronger models fall back to Gemini instead of inventing ids', () => {
  const choice = resolveCodingDeskModel({
    task: 'coding',
    refineMode: true,
    message: 'fix it',
    availableModels: [
      { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen', available: false, pricingKind: 'paid' },
    ],
    allowPaid: true,
  });
  assert.equal(choice.modelId, 'gemini-flash-latest');
  assert.equal(choice.escalated, false);
});

test('large VFS multi-file signal escalates', () => {
  assert.equal(shouldEscalateCodingDeskModel({
    message: 'update styles',
    hasVFS: true,
    qualityHints: { fileCount: 8 },
  }), true);
});

test('activeModelsForRouting keeps featured models and drops unapproved registry rows', () => {
  const models = activeModelsForRouting({
    featuredModels: [
      { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
    ],
    registryRows: [
      { id: 'evil/coder-unapproved', name: 'Evil Coder', approved: false, lifecycle: 'discovered', is_free: true },
      { id: 'good/coder-approved', name: 'Good Coder', approved: true, lifecycle: 'available', is_free: true },
      { id: 'gone/coder', name: 'Retired', approved: true, lifecycle: 'retired', is_free: true },
    ],
  });
  const ids = models.map((m) => m.id);
  assert.ok(ids.includes('gemini-flash-latest'));
  assert.ok(ids.includes('good/coder-approved'));
  assert.equal(ids.includes('evil/coder-unapproved'), false);
  assert.equal(ids.includes('gone/coder'), false);
  // good/coder-approved is an approved but UNPROVEN free model — a refine turn
  // keeps the fast Gemini default rather than escalating to it (it must earn the
  // escalation on measured outcomes first).
  const escalate = resolveCodingDeskModel({
    task: 'coding',
    refineMode: true,
    availableModels: models,
    allowPaid: false,
  });
  assert.equal(escalate.modelId, 'gemini-flash-latest');
  assert.equal(escalate.escalated, false);
});

test('failover ranks fast reliable Gemini AHEAD of an unproven slow free coder (the 135s ghost)', () => {
  // The regression that caused 135s timeouts + fake "proved on the desk":
  // a paid coder primary whose FIRST fallback was the slow *:free coder.
  const chain = rankCodingDeskFallbacks(ACTIVE, {
    primaryId: 'qwen/qwen-2.5-coder-32b-instruct',
    allowPaid: true,
  });
  const geminiAt = chain.indexOf('gemini-flash-latest');
  const nemotronAt = chain.indexOf('nvidia/nemotron-3-super-120b-a12b:free');
  assert.ok(geminiAt >= 0, 'Gemini must be in the failover chain');
  assert.ok(geminiAt < nemotronAt, 'fast reliable Gemini must fail over before the unproven slow free coder');
});

test('Gemini is always retained as the last-resort failover, even off an empty catalog', () => {
  const chain = rankCodingDeskFallbacks([], { primaryId: 'qwen/qwen-2.5-coder-32b-instruct', allowPaid: true });
  assert.ok(chain.includes('gemini-flash-latest'));
});

test('anonymous/free sessions keep a free-only failover set (no paid coder)', () => {
  const chain = rankCodingDeskFallbacks(ACTIVE, { primaryId: 'gemini-flash-latest', allowPaid: false });
  assert.ok(!chain.includes('qwen/qwen-2.5-coder-32b-instruct'), 'no paid coder for a keyless session');
  assert.ok(!chain.includes('openai/gpt-4o-mini'));
});

test('LEARNING: a free coder that EARNS a trusted record climbs ahead of Gemini on merit', () => {
  // Not hardwired: the prior only holds until real outcomes exist. Give the free
  // coder a strong measured record and it must overtake Gemini's default prior.
  const withOutcomes = ACTIVE.map((model) =>
    model.id === 'nvidia/nemotron-3-super-120b-a12b:free'
      ? { ...model, quality: { sampleSize: 40, score: 96 } }
      : model,
  );
  const chain = rankCodingDeskFallbacks(withOutcomes, {
    primaryId: 'qwen/qwen-2.5-coder-32b-instruct',
    allowPaid: true,
  });
  const geminiAt = chain.indexOf('gemini-flash-latest');
  const nemotronAt = chain.indexOf('nvidia/nemotron-3-super-120b-a12b:free');
  assert.ok(nemotronAt < geminiAt, 'a proven free coder earns its place ahead of the default prior');
});

test('INVARIANT: an unproven paid coder never passes a PROVEN Gemini in the failover chain', () => {
  // Regression guard (Codex P2): once Gemini crosses the trust threshold its
  // prior must remain a floor, so an unproven paid endpoint cannot leapfrog a
  // measured-successful Gemini without earning outcomes of its own.
  const models = [
    { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier', quality: { sampleSize: 6, score: 92 } },
    { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder', available: true, pricingKind: 'paid' },
  ];
  const chain = rankCodingDeskFallbacks(models, { primaryId: 'deepseek/deepseek-chat', allowPaid: true });
  const g = chain.indexOf('gemini-flash-latest');
  const q = chain.indexOf('qwen/qwen-2.5-coder-32b-instruct');
  assert.ok(g >= 0 && q >= 0, 'both models present in the chain');
  assert.ok(g < q, 'proven Gemini must fail over before an unproven paid coder');
});

test('agent / integration / backend asks escalate off the fast default', () => {
  // The "connect to my Google Drive, crawl all files, find duplicates, organize"
  // ask ran on Gemini Flash and hit the 135s wall because the old keyword regex
  // did not see it as complex. Intent-based signals now escalate it up front.
  const drive = 'I want to build an AI agent that connects to my Google Drive, crawl through all the files, list large files not touched in a year, find duplicate and redundant files, and help organize them into folders';
  assert.equal(shouldEscalateCodingDeskModel({ message: drive }), true);
  assert.equal(shouldEscalateCodingDeskModel({ message: 'Build a Slack bot that posts standup reminders' }), true);
  assert.equal(shouldEscalateCodingDeskModel({ message: 'Build a scraper that indexes documents' }), true);
  assert.equal(shouldEscalateCodingDeskModel({ message: 'Connect to the Stripe API and sync payments to a database' }), true);
});

test('ordinary small builds still stay on the fast Gemini default', () => {
  for (const message of [
    'Build a calculator',
    'Build me a simple portfolio website',
    'Build a todo list with React',
    'build a simple about page',
  ]) {
    assert.equal(shouldEscalateCodingDeskModel({ message }), false, message);
  }
});

/*
 * A SMALL EDIT IS NOT A HARD BUILD (2026-09-08).
 *
 * Reported from production. A user asked "Can you add descriptions as a
 * drop-down list" on a one-file app they had just built on the fast default.
 * `if (refineMode) return true` escalated it, the paid credential made Opus
 * eligible, and the turn ended with the last-resort "this turn ended without a
 * reply" — because the slow route ate the whole wall clock, planTurnEscalation
 * found less than MIN_VIABLE_ATTEMPT_MS left, and NO FALLBACK RAN.
 *
 * So this is a reliability rule before it is a cost one: escalating a trivial
 * ask to a slow route spends the budget that recovery needs.
 */
const REFINE_CATALOGUE = [
  { id: 'gemini-flash-latest', name: 'Gemini Flash', available: true, pricingKind: 'free-tier' },
  { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', available: true, pricingKind: 'paid' },
];
const refineOn = (message, qualityHints = { fileCount: 1 }) => resolveCodingDeskModel({
  task: 'coding',
  message,
  refineMode: true,
  hasVFS: true,
  qualityHints,
  availableModels: REFINE_CATALOGUE,
  allowPaid: true,
});

test('INVARIANT: a small refine stays on the fast default that built the artifact', () => {
  for (const ask of [
    'Can you add descriptions as a drop-down list',  // the reported case, verbatim
    'make the header blue',
    'shorter please',
    'can you center the title',
    'rename the button to Save',
  ]) {
    assert.equal(
      shouldEscalateCodingDeskModel({ message: ask, refineMode: true, hasVFS: true, qualityHints: { fileCount: 1 } }),
      false,
      `"${ask}" must not escalate`,
    );
    assert.equal(refineOn(ask).modelId, 'gemini-flash-latest', ask);
  }
});

test('INVARIANT: a substantial refine still escalates, so this cannot become "never escalate"', () => {
  // The other direction. Each of these reaches the stronger coder by a DIFFERENT
  // rule below the refine check, which is why the narrow rule is safe.
  const substantial = [
    ['refactor the entire codebase into modules', { fileCount: 1 }],        // COMPLEX_ASK
    ['apply this across all files', { fileCount: 1 }],                      // MULTI_FILE_ASK
    ['turn it into a storefront with a cart', { fileCount: 1 }],            // SHOP_BUILD_ASK
    ['connect it to the Google Drive API', { fileCount: 1 }],               // AGENT_OR_INTEGRATION_ASK
    ['tidy this up', { fileCount: 9 }],                                     // large VFS
    [`please adjust the spacing ${'and the padding '.repeat(20)}`, { fileCount: 1 }], // long ask
  ];
  for (const [ask, hints] of substantial) {
    assert.equal(
      shouldEscalateCodingDeskModel({ message: ask, refineMode: true, hasVFS: true, qualityHints: hints }),
      true,
      `"${ask.slice(0, 40)}" must still escalate`,
    );
  }
});

test('INVARIANT: a small refine that is a REPAIR still escalates', () => {
  /*
   * Ordering matters and is easy to get wrong: the refine check now returns
   * conditionally, so a small repair must fall THROUGH to the probeFailure /
   * repair rule rather than short-circuiting to false. A build that already
   * failed is exactly when the stronger coder is worth paying for.
   */
  for (const hints of [
    { fileCount: 1, probeFailure: true },
    { fileCount: 1, repair: true },
    { fileCount: 1, shopImageOversize: true },
  ]) {
    assert.equal(
      shouldEscalateCodingDeskModel({ message: 'fix it', refineMode: true, hasVFS: true, qualityHints: hints }),
      true,
      JSON.stringify(hints),
    );
  }
});

test('a first build is unaffected — it never took the refine path', () => {
  assert.equal(
    shouldEscalateCodingDeskModel({ message: 'build me an expense splitter', refineMode: false, hasVFS: false }),
    false,
  );
});
