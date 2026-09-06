import assert from 'node:assert/strict';
import test from 'node:test';
import { exploratorySurfacesEnabled } from './platform-surfaces.js';

test('the exploratory surfaces are parked unless the build says "on"', () => {
  assert.equal(exploratorySurfacesEnabled({}), false);
  assert.equal(exploratorySurfacesEnabled({ VITE_QUANTORA_EXPLORATORY_SURFACES: 'on' }), true);
  assert.equal(exploratorySurfacesEnabled({ VITE_QUANTORA_EXPLORATORY_SURFACES: ' ON ' }), true);
  assert.equal(exploratorySurfacesEnabled({ VITE_QUANTORA_EXPLORATORY_SURFACES: 'off' }), false);
  assert.equal(exploratorySurfacesEnabled({ VITE_QUANTORA_EXPLORATORY_SURFACES: 'true' }), false);
  // Under Node there is no Vite environment: parked, never a crash.
  assert.equal(exploratorySurfacesEnabled(), false);
});
