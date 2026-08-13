#!/usr/bin/env node
/**
 * Synthetic AI Studio communication-layer tests.
 * Runs local logic checks + optional live API probes.
 *
 * Usage:
 *   node scripts/studio-synthetic-test.mjs
 *   STUDIO_API_BASE=http://localhost:3000 node scripts/studio-synthetic-test.mjs --live
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const LIVE = process.argv.includes('--live');
const API_BASE = process.env.STUDIO_API_BASE || 'https://quantoraai.app';

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✔ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`✖ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function runLocalTests() {
  console.log('\n=== Local communication layer ===\n');

  const { inferConversationStage } = await import('../src/lib/communication-intelligence.js');
  const { enrichContinueSet } = await import('../src/lib/domain-anticipation.js');
  const { detectOutcomeGaps, injectGapContinues } = await import('../src/lib/outcome-gap-detection.js');
  const { detectProactiveNudge } = await import('../src/lib/proactive-nudges.js');
  const { extractChoicesFromAssistantText } = await import('../src/lib/studio-choices.js');
  const { extractContinuesFromAssistantText } = await import('../src/lib/studio-continues.js');
  const { extractContextFromAssistantText } = await import('../src/lib/session-context.js');

  try {
    const stage = inferConversationStage({ facts: ['March trip', 'solo traveler'] }, 'travel');
    assert.equal(stage, 'ready_for_itinerary');
    pass('inferConversationStage → ready_for_itinerary');
  } catch (e) {
    fail('inferConversationStage → ready_for_itinerary', e.message);
  }

  try {
    const enriched = enrichContinueSet(null, {
      domain: 'travel',
      mode: 'ask',
      conversationContext: { facts: ['5 nights in March', 'solo traveler'] },
    });
    assert.ok(enriched.items.some((i) => /day-by-day/i.test(i.label)));
    assert.equal(enriched.items.some((i) => /pin down dates/i.test(i.label)), false);
    pass('enrichContinueSet skips date chips when itinerary-ready');
  } catch (e) {
    fail('enrichContinueSet skips date chips when itinerary-ready', e.message);
  }

  try {
    const gaps = detectOutcomeGaps(
      'Share hotel booking links for Bali beach resorts',
      'Try Mandapa and COMO Uma — both have great beaches.',
    );
    assert.equal(gaps.length, 1);
    assert.match(gaps[0].label, /direct links/i);
    const withChip = injectGapContinues(null, gaps);
    assert.ok(withChip.items.length >= 1);
    pass('outcome gap → Add direct links chip');
  } catch (e) {
    fail('outcome gap → Add direct links chip', e.message);
  }

  try {
    const nudge = detectProactiveNudge(
      'plan my Bali trip with booking links',
      'Day 1: beach. https://example.com/hotel',
      'Bharani',
      { studioDomain: 'travel' },
    );
    assert.equal(nudge, null);
    pass('proactive nudge suppressed when links already in reply');
  } catch (e) {
    fail('proactive nudge suppressed when links already in reply', e.message);
  }

  const mockReply = `Here are three options for your solo March trip.

<!-- quantora-choices:{"title":"Pick one","choices":[{"id":"a","label":"Day-by-day plan","value":"Build itinerary"}]} -->
<!-- quantora-continues:{"prompt":"Next?","items":[{"id":"1","label":"Add links","value":"Add links"}]} -->
<!-- quantora-ctx:{"goal":"Bali trip","facts":["solo","March"]} -->`;

  try {
    const { choiceSet } = extractChoicesFromAssistantText(mockReply);
    assert.equal(choiceSet.choices.length, 1);
    pass('parse quantora-choices marker');
  } catch (e) {
    fail('parse quantora-choices marker', e.message);
  }

  try {
    const { continueSet } = extractContinuesFromAssistantText(mockReply);
    assert.equal(continueSet.items.length, 1);
    pass('parse quantora-continues marker');
  } catch (e) {
    fail('parse quantora-continues marker', e.message);
  }

  try {
    const { contextUpdate } = extractContextFromAssistantText(mockReply);
    assert.equal(contextUpdate.goal, 'Bali trip');
    pass('parse quantora-ctx marker');
  } catch (e) {
    fail('parse quantora-ctx marker', e.message);
  }

  const policy = spawnSync('npm', ['run', 'test:conversation'], { encoding: 'utf8' });
  if (policy.status === 0) {
    pass('conversation policy tests');
  } else {
    fail('conversation policy tests', policy.stderr?.slice(0, 200) || 'failed');
  }
}

async function runLiveProbes() {
  console.log(`\n=== Live API probes (${API_BASE}) ===\n`);

  const scenarios = [
    {
      name: 'Travel intake (no auth expected to fail or stream)',
      body: {
        message: 'Help me plan a solo Bali trip in March — ask one question first.',
        history: [],
        modelId: 'gemini-flash-latest',
        modelName: 'Gemini Flash',
        studioMode: 'ask',
        studioDomain: 'travel',
        sessionContext: { goal: 'Bali solo trip', facts: ['March'] },
        listeningSignals: [{ type: 'choice_selected', label: 'Chose: Pin down dates' }],
      },
    },
    {
      name: 'Build intent',
      body: {
        message: 'Build a one-page landing page for a coffee shop called Ember Roast.',
        history: [],
        modelId: 'gemini-flash-latest',
        modelName: 'Gemini Flash',
        studioMode: 'build',
        guidedBuild: true,
      },
    },
  ];

  for (const scenario of scenarios) {
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: API_BASE,
          Referer: `${API_BASE}/`,
        },
        body: JSON.stringify(scenario.body),
      });

      const contentType = res.headers.get('content-type') || '';
      const snippet = (await res.text()).slice(0, 180).replace(/\s+/g, ' ');

      if (res.status === 401) {
        pass(scenario.name, `401 requires auth (expected on prod without session) — ${snippet}`);
      } else if (res.ok && (contentType.includes('text/event-stream') || snippet.length > 20)) {
        pass(scenario.name, `HTTP ${res.status}, streamed ${snippet.length}+ chars`);
      } else {
        fail(scenario.name, `HTTP ${res.status}: ${snippet}`);
      }
    } catch (e) {
      fail(scenario.name, e.message);
    }
  }
}

await runLocalTests();
if (LIVE) await runLiveProbes();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
