import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStudioJobCard,
  formatJobCardForRepair,
  formatJobCardForVerify,
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
