import test from 'node:test';
import assert from 'node:assert/strict';

import { composeResearchBriefMarkdown, researchBriefFileName } from './research-brief-export.js';

const AT = new Date('2026-09-01T12:00:00Z');
const BRIEF = {
  active: true,
  question: 'Is nuclear cheaper than solar per MWh today?',
  plan: [
    { text: 'What does current cost data say per MWh?', explored: true },
    { text: 'How do lifetime extensions change the comparison?', explored: false },
  ],
  findings: [
    { text: 'Utility solar undercut new nuclear in every 2024 market survey.', sourceCount: 2 },
    { text: 'Firming costs narrow the gap in island grids.', sourceCount: 2 },
  ],
  sources: [
    { uri: 'https://www.nature.com/articles/x123', title: 'Nature study', host: 'nature.com' },
  ],
  groundedTurns: 2,
  ungroundedTurns: 0,
  next: '',
};

test('the export says exactly what the board showed — standings, quotes, and honest gaps', () => {
  const md = composeResearchBriefMarkdown({
    brief: BRIEF,
    generatedAt: AT,
    standings: {
      'Utility solar undercut new nuclear in every 2024 market survey.': {
        standing: 'contested',
        reasonCode: 'sources_disagree',
        excerpt: 'Solar cost less in all twelve surveys.',
        sourceUrl: 'https://www.nature.com/articles/x123',
        counter: { excerpt: 'Nuclear undercut solar in three markets.', sourceUrl: 'https://www.example.org/counter' },
      },
    },
  });
  assert.match(md, /^# Research brief — Is nuclear cheaper/);
  assert.match(md, /Compiled 2026-09-01/);
  assert.match(md, /- \[x\] What does current cost data say per MWh\?/);
  assert.match(md, /- \[ \] How do lifetime extensions/);
  assert.match(md, /Contested — verified sources disagree/);
  assert.match(md, /Supports: “Solar cost less in all twelve surveys\.” \(\[source\]\(https:\/\/www\.nature\.com\/articles\/x123\)\)/);
  assert.match(md, /Disagrees: “Nuclear undercut solar in three markets\.”/);
  // The finding never verified says so instead of borrowing confidence.
  assert.match(md, /Firming costs narrow the gap[\s\S]*?not verified per claim/);
  assert.match(md, /## Source ledger\n\n1\. \[nature\.com\]\(https:\/\/www\.nature\.com\/articles\/x123\) — Nature study/);
  assert.match(md, /Verified means the quoted passage was found verbatim/);
});

test('supported and unverified standings export with their contract wording', () => {
  const md = composeResearchBriefMarkdown({
    brief: { ...BRIEF, plan: [] },
    generatedAt: AT,
    standings: {
      'Utility solar undercut new nuclear in every 2024 market survey.': {
        standing: 'supported',
        excerpt: 'Solar cost less in all twelve surveys.',
        sourceUrl: 'https://www.nature.com/articles/x123',
      },
      'Firming costs narrow the gap in island grids.': {
        standing: 'unverified',
        reasonCode: 'excerpt_not_in_source',
      },
    },
  });
  assert.match(md, /Verified — supporting quote found in source/);
  assert.match(md, /Unverified \(excerpt_not_in_source\)/);
  assert.doesNotMatch(md, /## The question, decomposed/);
});

test('an empty dossier earns no file', () => {
  assert.equal(composeResearchBriefMarkdown({ brief: { active: false } }), '');
  assert.equal(composeResearchBriefMarkdown({
    brief: { active: true, question: 'Anything at all worth asking?', findings: [], sources: [] },
  }), '');
  assert.equal(composeResearchBriefMarkdown({}), '');
});

test('file names are stable, safe and dated', () => {
  assert.equal(
    researchBriefFileName('Is nuclear cheaper than solar per MWh today?', AT),
    'is-nuclear-cheaper-than-solar-per-mwh-today-2026-09-01.md',
  );
  assert.equal(researchBriefFileName('   ', AT), 'research-brief-2026-09-01.md');
});
