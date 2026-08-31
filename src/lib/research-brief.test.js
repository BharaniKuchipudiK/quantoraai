import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveResearchBrief, parseSourcesBlock } from './research-brief.js';

const SERVER_BLOCK = '\n\n---\n**Sources**\n1. [reuters.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc)\n2. [Nature study](https://www.nature.com/articles/x123)\n';

test('parseSourcesBlock reads the exact block the server appends', () => {
  const { body, sources } = parseSourcesBlock(`The answer.${SERVER_BLOCK}`);
  assert.equal(body.trim(), 'The answer.');
  assert.equal(sources.length, 2);
  assert.equal(sources[0].title, 'reuters.com');
  assert.equal(sources[1].uri, 'https://www.nature.com/articles/x123');
});

test('parseSourcesBlock earns nothing from prose that merely mentions sources', () => {
  const casual = 'There are many **Sources** of error.\nSee https://example.com for more.';
  const { body, sources } = parseSourcesBlock(casual);
  assert.equal(sources.length, 0);
  assert.equal(body, casual);

  // A heading with no valid numbered markdown-link lines under it is not a block.
  const headingOnly = 'Done.\n\n---\n**Sources**\nnone were used';
  assert.equal(parseSourcesBlock(headingOnly).sources.length, 0);
});

test('an empty or trivial conversation keeps the board dark', () => {
  assert.equal(deriveResearchBrief({}).active, false);
  assert.equal(deriveResearchBrief({ messages: [] }).active, false);
  assert.equal(deriveResearchBrief({ messages: [{ sender: 'user', text: 'hi' }] }).active, false);
});

test('the latest substantive user message is the question, clamped at a word', () => {
  const long = `Compare the evidence on ${'intermittent fasting outcomes '.repeat(8)}in adults`;
  const brief = deriveResearchBrief({
    messages: [
      { sender: 'user', text: 'What does the evidence say about creatine and cognition?' },
      { sender: 'ai', text: 'Some answer.' },
      { sender: 'user', text: long },
    ],
  });
  assert.equal(brief.active, true);
  assert.ok(brief.question.startsWith('Compare the evidence on'));
  assert.ok(brief.question.length <= 141);
  assert.ok(brief.question.endsWith('…'));
});

test("the board's own chip prompts never replace the question", () => {
  const brief = deriveResearchBrief({
    messages: [
      { sender: 'user', text: 'What does the evidence say about creatine and cognition?' },
      { sender: 'ai', text: `Findings.${SERVER_BLOCK}` },
      { sender: 'user', text: 'Find counter-evidence for the findings on this board.' },
    ],
  });
  assert.equal(brief.question, 'What does the evidence say about creatine and cognition?');
});

test('sources dedupe across turns and count the turns citing them', () => {
  const brief = deriveResearchBrief({
    messages: [
      { sender: 'user', text: 'Is nuclear cheaper than solar per MWh today?' },
      { sender: 'ai', text: `First pass.${SERVER_BLOCK}` },
      { sender: 'ai', text: `Second pass.\n\n---\n**Sources**\n1. [Nature study](https://www.nature.com/articles/x123)\n` },
    ],
  });
  assert.equal(brief.sources.length, 2);
  const nature = brief.sources.find((source) => source.uri === 'https://www.nature.com/articles/x123');
  assert.equal(nature.citedInTurns, 2);
  assert.equal(nature.host, 'nature.com');
  assert.equal(brief.groundedTurns, 2);
});

test('a grounding redirect URL credits the publisher named in the title, not Google', () => {
  const brief = deriveResearchBrief({
    messages: [
      { sender: 'user', text: 'Is nuclear cheaper than solar per MWh today?' },
      { sender: 'ai', text: `Answer.${SERVER_BLOCK}` },
    ],
  });
  const redirected = brief.sources.find((source) => source.uri.includes('vertexaisearch'));
  assert.equal(redirected.host, 'reuters.com');
});

test('findings come only from grounded replies, as statements, capped per turn', () => {
  const grounded = [
    'Here is what the evidence shows:',
    '- Utility-scale solar LCOE fell below new nuclear in every 2024 market survey reviewed here.',
    '- Grid-firming costs narrow but do not close the gap in most regions studied.',
    '- Should we also look at lifetime extension economics for existing plants?',
    '- Small modular reactors remain above both on cost per MWh in current filings.',
    '- A fifth bullet that would exceed the per-turn cap if counted at all costs.',
    SERVER_BLOCK,
  ].join('\n');
  const brief = deriveResearchBrief({
    messages: [
      { sender: 'user', text: 'Is nuclear cheaper than solar per MWh today?' },
      { sender: 'ai', text: 'Ungrounded reply.\n- This bullet has no sources behind it and must not become a finding.' },
      { sender: 'ai', text: grounded },
    ],
  });
  assert.equal(brief.findings.length, 3);
  assert.ok(brief.findings.every((finding) => !finding.text.endsWith('?')));
  assert.ok(brief.findings.every((finding) => finding.sourceCount === 2));
  assert.ok(brief.findings.every((finding) => finding.sourceUris.length === 2
    && finding.sourceUris.includes('https://www.nature.com/articles/x123')));
  assert.ok(!brief.findings.some((finding) => finding.text.includes('no sources behind it')));
  assert.equal(brief.ungroundedTurns, 1);
});

test('a conversation with only unverified answers says so, once, honestly', () => {
  const brief = deriveResearchBrief({
    messages: [
      { sender: 'user', text: 'What is the state of fusion startup funding?' },
      { sender: 'ai', text: 'From memory: it is large and growing.' },
    ],
  });
  assert.equal(brief.groundedTurns, 0);
  assert.equal(brief.ungroundedTurns, 1);
  assert.match(brief.next, /live sources/);
});

test('a single-publisher evidence base earns a cross-check nudge', () => {
  const brief = deriveResearchBrief({
    messages: [
      { sender: 'user', text: 'What is the state of fusion startup funding?' },
      { sender: 'ai', text: `Answer.\n\n---\n**Sources**\n1. [One outlet](https://www.example.com/a)\n2. [Same outlet](https://example.com/b)\n` },
    ],
  });
  assert.match(brief.next, /example\.com/);
  const diverse = deriveResearchBrief({
    messages: [
      { sender: 'user', text: 'What is the state of fusion startup funding?' },
      { sender: 'ai', text: `Answer.${SERVER_BLOCK}` },
    ],
  });
  assert.equal(diverse.next, '');
});

test('an AI monologue before the user has asked anything counts for nothing', () => {
  const brief = deriveResearchBrief({
    messages: [{ sender: 'ai', text: `Welcome!${SERVER_BLOCK}` }],
  });
  assert.equal(brief.active, false);
  assert.equal(brief.sources.length, 0);
  assert.equal(brief.groundedTurns, 0);
});

test('restated findings dedupe and the most recent lead the board', () => {
  const turn = (statement) => `- ${statement}\n${SERVER_BLOCK}`;
  const brief = deriveResearchBrief({
    messages: [
      { sender: 'user', text: 'Is nuclear cheaper than solar per MWh today?' },
      { sender: 'ai', text: turn('Solar undercuts new nuclear on cost in every market survey from 2024.') },
      { sender: 'ai', text: turn('Solar undercuts new nuclear on cost in every market survey from 2024.') },
      { sender: 'ai', text: turn('Firming costs narrow the gap in island grids according to two of the studies.') },
    ],
  });
  assert.equal(brief.findings.length, 2);
  assert.match(brief.findings[0].text, /^Firming costs/);
});
