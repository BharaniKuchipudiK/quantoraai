/**
 * A checkout replaces the desk's product, so it must replace the desk's job.
 *
 * THE INCIDENT (2026-09-04). A desk that had previously built a shop was used
 * to open bharanikh-design/Sartho-ai-cp — a 195-file Next.js career agent. The
 * desk kept the title "A shop website" and went on running the shop must-work
 * probes against it: "Catalog and bag still work", "Currency and Add to Cart
 * are on Preview", "Keep this a shop, not a different app". The user had asked
 * for a code review and got cart probes.
 *
 * WHY THE EXISTING GATE DID NOT CATCH IT. desk-job-review-browser-gate proves
 * "Drive Cleaner never gets shop probes", and it passes. It drives a BUILD
 * BRIEF ("build a drive cleaner"), which trips the `inventsProduct` branch of
 * looksLikeNewJob and switches the card correctly. The checkout path reaches
 * the same corrupt state by a route that gate never walks: no brief at all.
 * The protection existed for the way you would test it, and not for the way it
 * actually broke.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStudioJobCard,
  isStudioProductSwitch,
  jobCardForCheckout,
} from './studio-job-card.js';

const SHOP = {
  purpose: 'A shop website',
  mustWork: [
    'Catalog and bag still work',
    'Product images are real photos, not empty frames',
    'Currency and Add to Cart are on Preview',
    'Keep this a shop, not a different app',
  ],
};

const isShoppy = (job) => /shop|catalog|cart|bag|product images/i.test(
  [job?.purpose || '', ...(job?.mustWork || [])].join(' '),
);

test('the bug, stated as the reason this file exists: a review brief cannot clear a shop job', () => {
  // This is NOT the fix — it records why the fix had to live in the checkout.
  // Both real messages from the incident leave the shop card in place, because
  // neither names a product nor uses a build verb.
  for (const brief of [
    'Help me review the code and let me know if there are any flaws or hardcoded values in the code base. Is it secured enough? is this robust and reliable?',
    'I want you to review the files in this repository',
  ]) {
    assert.equal(isStudioProductSwitch(brief, SHOP), false);
    assert.ok(isShoppy(buildStudioJobCard({ brief, vfs: {}, existing: SHOP })));
  }
});

test('opening a repository names that repository as the job', () => {
  const job = jobCardForCheckout({ owner: 'bharanikh-design', repo: 'Sartho-ai-cp' });
  assert.equal(job.purpose, 'bharanikh-design/Sartho-ai-cp');
  assert.ok(
    !isShoppy(job),
    `a checkout job must carry no shop probe, got ${JSON.stringify(job)}`,
  );
});

test('a checkout ends the shop job even when the repository mentions shop words', () => {
  /*
   * The reason the fix states the job positively instead of clearing it to
   * null. With no card, the next turn falls through to purposeFromVfs, which
   * consults vfsLooksLikeShopFiles FIRST — and that scans every file for
   * "storefront" / "add to cart" / a products.json. Hundreds of files of
   * somebody else's code will contain those words by coincidence, and the shop
   * card would re-attach itself to a repository that is not a shop.
   */
  const repoVfs = {
    'app/page.tsx': { content: 'export default function Page() { return <h1>Career Agent</h1>; }' },
    'app/api/checkout/route.ts': { content: '// billing: redirect to the storefront and add to cart' },
    'products.json': { content: '[]' },
  };

  const cleared = buildStudioJobCard({ brief: 'I want you to review the files in this repository', vfs: repoVfs, existing: null });
  assert.ok(
    isShoppy(cleared),
    'guard assumption: clearing to null really does let the shop card back in — if this ever fails, the null fix became viable and this test should be revisited',
  );

  const afterCheckout = jobCardForCheckout({ owner: 'bharanikh-design', repo: 'Sartho-ai-cp' });
  const nextTurn = buildStudioJobCard({
    brief: 'I want you to review the files in this repository',
    vfs: repoVfs,
    existing: afterCheckout,
  });
  assert.ok(
    !isShoppy(nextTurn),
    `a review turn after a checkout must not carry shop probes, got ${JSON.stringify(nextTurn)}`,
  );
  assert.equal(nextTurn.purpose, 'bharanikh-design/Sartho-ai-cp');
});

test('a real product switch still overrides the repository job', () => {
  // The checkout job is a starting point, not a lock. Naming a product still wins.
  const afterCheckout = jobCardForCheckout({ owner: 'someone', repo: 'their-app' });
  const switched = buildStudioJobCard({ brief: 'build me a calculator', vfs: {}, existing: afterCheckout });
  assert.equal(switched.purpose, 'A working calculator');
});

test('a checkout with no owner or repo still refuses to invent a product', () => {
  const job = jobCardForCheckout({});
  assert.equal(job.purpose, 'An opened repository');
  assert.ok(!isShoppy(job));
});
