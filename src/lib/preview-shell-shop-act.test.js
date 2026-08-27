import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePartnerBuildStatus } from './partner-build-status.js';
import { pickPreviewEntryPath } from './preview-utils.js';
import { ensureShopDeskInVfs } from './studio-preview-helpers.js';
import { buildStudioJobCard } from './studio-job-card.js';

test('sanitize replaces Building 75 unique… after intake accept', () => {
  const next = sanitizePartnerBuildStatus(
    { label: 'Building 75 unique merchandise images…' },
    { catalogTarget: 10, intakeAccepted: true, userAsked: 75 },
  );
  assert.match(next.label, /about 10 working catalog photos/i);
  assert.doesNotMatch(next.label, /75/);
});

test('pickPreviewEntryPath keeps App.tsx and rejects SVG-only trees', () => {
  assert.equal(pickPreviewEntryPath({
    'src/App.tsx': { content: 'export default function App(){return null}', language: 'tsx' },
  }), 'src/App.tsx');
  assert.equal(pickPreviewEntryPath({
    'foxwolf_explorer_backpack.svg': { content: '<svg></svg>', language: 'svg' },
  }), null);
});

test('an SVG-only dump is NOT fabricated into a storefront', () => {
  const job = buildStudioJobCard({
    brief: 'Build a Fox & Wolf kids merchandise shop with 100 unique design images',
  });
  const result = ensureShopDeskInVfs({
    'foxwolf_explorer_backpack.svg': { content: '<svg width="40"></svg>', language: 'svg' },
  }, job, { brief: 'Build the shop now with about 10 working catalog photos (not 100 unique AI mockups).' });
  // The model shipped no runnable HTML page. We never fabricate a storefront +
  // stock photos to fake completeness — the desk stays honest.
  assert.equal(result.vfs['index.html'], undefined);
});
