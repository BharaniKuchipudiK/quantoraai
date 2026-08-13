import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichContinueSet, getAnticipatedContinues } from './domain-anticipation.js';

test('travel stage ready_for_itinerary prioritizes day-by-day beat', () => {
  const result = getAnticipatedContinues({
    domain: 'travel',
    mode: 'ask',
    conversationContext: { facts: ['5 nights in March', 'solo traveler'] },
  });

  assert.equal(result.prompt, 'Ready for a day-by-day plan?');
  assert.ok(result.items.some((i) => i.id === 'travel-itinerary'));
  assert.equal(result.items.some((i) => i.id === 'travel-dates'), false);
});

test('travel stage itinerary_delivered drops intake beats', () => {
  const result = getAnticipatedContinues({
    domain: 'travel',
    mode: 'ask',
    conversationContext: { facts: ['day 1 morning beach', 'day 2 temple', 'solo', 'March'] },
  });

  assert.equal(result.prompt, 'Want to refine this trip?');
  assert.equal(result.items.some((i) => i.id === 'travel-itinerary'), false);
});

test('enrichContinueSet does not backfill in ask mode without model chips', () => {
  const enriched = enrichContinueSet(null, {
    domain: 'travel',
    mode: 'ask',
    conversationContext: { facts: ['March', 'solo'] },
  });

  assert.equal(enriched, null);
});

test('enrichContinueSet merges anticipated beats in build mode', () => {
  const enriched = enrichContinueSet(null, {
    domain: 'travel',
    mode: 'build',
    conversationContext: { facts: ['March', 'solo'] },
  });

  assert.ok(enriched?.items?.length >= 1);
});
