import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStudioJobCard,
  formatJobCardForRepair,
  formatJobCardForVerify,
  jobNeedsProductPhotos,
  studioJobCardLabel,
} from './studio-job-card.js';

test('a calculator brief becomes a calculator job, not a generic website', () => {
  const job = buildStudioJobCard({ brief: 'Build me a simple calculator' });
  assert.equal(job.purpose, 'A working calculator');
  assert.match(job.mustWork.join(' '), /display/i);
  assert.match(studioJobCardLabel(job), /calculator/i);
});

test('a follow-up does not replace the calculator with a new product', () => {
  const existing = buildStudioJobCard({ brief: 'Build me a simple calculator' });
  const next = buildStudioJobCard({
    brief: 'Make the heading say Quantora',
    existing,
  });
  assert.equal(next.purpose, 'A working calculator');
});

test('repair instructions refuse to abandon the job', () => {
  const job = buildStudioJobCard({ brief: 'Build me a simple calculator' });
  const prompt = formatJobCardForRepair(job);
  assert.match(prompt, /JOB/);
  assert.match(prompt, /calculator/i);
  assert.match(prompt, /unchanged/i);
});

test('verify text carries the job so quality cannot ignore purpose', () => {
  const job = buildStudioJobCard({ brief: 'Build me a simple calculator' });
  const brief = formatJobCardForVerify(job, 'Build me a simple calculator');
  assert.match(brief, /calculator/i);
  assert.match(brief, /display/i);
});

test('a boutique brief becomes a shop job that requires real photos', () => {
  const job = buildStudioJobCard({ brief: 'build a website for an Indian ethnic saree & couture boutique' });
  assert.equal(job.purpose, 'A shop website');
  assert.match(job.mustWork.join(' '), /photos/i);
  assert.equal(jobNeedsProductPhotos(job), true);
  assert.equal(jobNeedsProductPhotos(buildStudioJobCard({ brief: 'Build me a simple calculator' })), false);
});

test('Start with 10 does not become a fake job that claims the page still runs', () => {
  const shop = buildStudioJobCard({ brief: 'Build Fox & Wolf kids merchandise shop with 100 unique design images' });
  const next = buildStudioJobCard({
    brief: 'Start with 10',
    existing: shop,
    vfs: {
      'index.html': { content: '<!DOCTYPE html><html><head><title>Fox & Wolf</title></head><body><header>Shop</header></body></html>' },
      'foxwolf_1.svg': { content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
    },
  });
  assert.equal(next.purpose, 'A shop website');
  assert.doesNotMatch(next.purpose, /Start with 10/i);
  assert.equal(next.mustWork.includes('The page still runs'), false);
  assert.match(next.mustWork.join(' '), /photos|Catalog/i);
});

test('Start with 10 with foxwolf SVG files still becomes a shop job', () => {
  const next = buildStudioJobCard({
    brief: 'Start with 10',
    vfs: {
      'index.html': { content: '<!DOCTYPE html><html><head><title>Fox & Wolf Kids Collection</title></head><body><header><nav>Shop</nav></header><main></main><footer>©</footer></body></html>' },
      'foxwolf_1.svg': { content: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>' },
      'foxwolf_2.svg': { content: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>' },
    },
  });
  assert.equal(next.purpose, 'A shop website');
  assert.equal(next.mustWork.includes('The page still runs'), false);
});

test('a Drive cleaner brief replaces a leftover shop job card', () => {
  const shop = buildStudioJobCard({ brief: 'build a website for an Indian ethnic saree boutique' });
  const next = buildStudioJobCard({
    brief: 'build a Drive Cleaner Agent web dashboard for my Google Drive files',
    existing: shop,
  });
  assert.match(next.purpose, /Drive|cleaner|Agent/i);
  assert.doesNotMatch(next.purpose, /shop/i);
  assert.equal(jobNeedsProductPhotos(next), false);
});
