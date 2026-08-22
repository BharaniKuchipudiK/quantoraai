import assert from 'node:assert/strict';
import test from 'node:test';
import { travelIcebreakerAsk } from './travel-advisor-asks.js';

test('Travel icebreaker never becomes a physics lesson', () => {
  assert.match(travelIcebreakerAsk(), /I’m with you|I'm with you/);
  assert.match(travelIcebreakerAsk(), /Do not teach school subjects/i);
});
