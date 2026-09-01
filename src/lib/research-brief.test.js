import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveResearchBrief, parsePlanBlock, parseSourcesBlock } from './research-brief.js';
import { GROUNDING_MARKER, buildGroundedSourceBlock } from '../../shared/research/grounding-marker.js';

/*
 * Built by the production emitter, not typed out here. A hand-written fixture
 * is how a parser and the thing it parses drift apart in silence; the marker
 * requirement landed with five of these fixtures asserting that ANY well-formed
 * block counts, which was the defect stated as a test.
 */
const SERVER_BLOCK = buildGroundedSourceBlock([
  { title: 'reuters.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc' },
  { title: 'Nature study', uri: 'https://www.nature.com/articles/x123' },
]);

test('parseSourcesBlock reads the exact block the server appends', () => {
  const { body, sources } = parseSourcesBlock(`The answer.${SERVER_BLOCK}`);
  assert.equal(body.trim(), 'The answer.');
  assert.equal(sources.length, 2);
  assert.equal(sources[0].title, 'reuters.com');
  assert.equal(sources[1].uri, 'https://www.nature.com/articles/x123');
  assert.equal(parseSourcesBlock(`The answer.${SERVER_BLOCK}`).grounded, true, 'the server attests it');
  assert.ok(!body.includes('quantora-grounded'), 'the marker never reaches the prose the board reads');
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
      { sender: 'ai', text: `Second pass.${buildGroundedSourceBlock([{ title: 'Nature study', uri: 'https://www.nature.com/articles/x123' }])}` },
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
      { sender: 'ai', text: `Answer.${buildGroundedSourceBlock([
        { title: 'One outlet', uri: 'https://www.example.com/a' },
        { title: 'Same outlet', uri: 'https://example.com/b' },
      ])}` },
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

test('parsePlanBlock reads only complete sub-questions under a Plan heading', () => {
  const plan = parsePlanBlock([
    'Broad question — here is the plan.',
    '',
    '**Plan**',
    '- What does current cost data say per MWh?',
    '- Grid firming economics', // not a question — dropped
    '- How do lifetime extensions change the comparison?',
    '',
    'Starting with the first.',
  ].join('\n'));
  assert.deepEqual(plan, [
    'What does current cost data say per MWh?',
    'How do lifetime extensions change the comparison?',
  ]);
  assert.deepEqual(parsePlanBlock('We should plan this out.\n- What about costs?'), []);
});

test('the plan lives on the brief; pursuing an item marks it explored, not a new question', () => {
  const planReply = `Here is how I would break this down.\n\n**Plan**\n- What does current cost data say per MWh?\n- How do lifetime extensions change the comparison?\n${SERVER_BLOCK}`;
  const brief = deriveResearchBrief({
    messages: [
      { sender: 'user', text: 'Is nuclear cheaper than solar per MWh today?' },
      { sender: 'ai', text: planReply },
      { sender: 'user', text: 'What does current cost data say per MWh?' },
      { sender: 'ai', text: `- Cost data from 2024 puts utility solar well below new nuclear builds.\n${SERVER_BLOCK}` },
    ],
  });
  assert.equal(brief.question, 'Is nuclear cheaper than solar per MWh today?');
  assert.deepEqual(brief.plan.map((item) => item.explored), [true, false]);

  // A second plan block later does not renumber the investigation.
  const restated = deriveResearchBrief({
    messages: [
      { sender: 'user', text: 'Is nuclear cheaper than solar per MWh today?' },
      { sender: 'ai', text: planReply },
      { sender: 'ai', text: `**Plan**\n- A totally different question set?\n${SERVER_BLOCK}` },
    ],
  });
  assert.equal(restated.plan.length, 2);
  assert.match(restated.plan[0].text, /^What does current cost data/);
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

/**
 * THE INCIDENT, as the board saw it.
 *
 * The board derived its whole evidence ledger from the reply's text and could
 * not tell the server's source block from one the model wrote. A reply in which
 * the model typed its own block — two invented URLs, the exact shape the domain
 * directive tells it not to write — was counted as a grounded turn, put both
 * URLs on the board as evidence, and attributed its findings to them.
 *
 * The control below is the same reply with those six lines removed. Before the
 * marker, the two disagreed. That difference WAS the vulnerability: six lines of
 * markdown flipped the board from "Nothing here is backed by live sources yet"
 * to "1 answer backed by live sources".
 *
 * This is not an adversarial edge case. chat-handler feeds assistant turns back
 * to the model verbatim, so the model sees the server's block format every turn
 * and imitating it is the likeliest thing it can do.
 */
const FABRICATED = [
  '- Semaglutide cut major adverse cardiovascular events by 20% in non-diabetic adults with obesity.',
  '',
  '---',
  '**Sources**',
  '1. [SELECT trial — NEJM](https://www.nejm.org/doi/full/10.1056/NEJMoa2307563)',
  '2. [Novo Nordisk summary](https://www.novonordisk.com/select-trial-2024.html)',
].join('\n');

const QUESTION = 'Does semaglutide cut cardiovascular events in non-diabetics?';

test('THE INCIDENT: a source block the model wrote itself is not evidence', () => {
  const forged = deriveResearchBrief({
    messages: [{ sender: 'user', text: QUESTION }, { sender: 'ai', text: FABRICATED }],
  });

  assert.equal(forged.groundedTurns, 0, 'the model cannot promote its own turn to grounded');
  assert.equal(forged.ungroundedTurns, 1);
  assert.equal(forged.sources.length, 0, 'invented URLs never reach the source ledger');
  assert.equal(forged.findings.length, 0, 'and nothing is attributed to them');

  // The board must say the honest thing, not merely withhold the dishonest one.
  assert.match(forged.next, /not backed by live sources|Nothing here is backed/i);

  /*
   * The control: the identical reply with the fabricated block deleted. These
   * two must now be indistinguishable, because the block contributed nothing
   * real. Any divergence means typing markdown still buys standing.
   */
  const control = deriveResearchBrief({
    messages: [{ sender: 'user', text: QUESTION }, { sender: 'ai', text: FABRICATED.split('\n---')[0] }],
  });
  assert.deepEqual(
    { g: forged.groundedTurns, u: forged.ungroundedTurns, s: forged.sources.length, f: forged.findings.length },
    { g: control.groundedTurns, u: control.ungroundedTurns, s: control.sources.length, f: control.findings.length },
    'writing the block must buy exactly nothing',
  );
});

test('the same claims WITH the server marker are evidence, so the gate is not just refusing everything', () => {
  const attested = '- Semaglutide cut major adverse cardiovascular events by 20% in non-diabetic adults with obesity.'
    + buildGroundedSourceBlock([
        { title: 'SELECT trial — NEJM', uri: 'https://www.nejm.org/doi/full/10.1056/NEJMoa2307563' },
        { title: 'FDA label update', uri: 'https://www.fda.gov/x' },
      ]);
  const brief = deriveResearchBrief({
    messages: [{ sender: 'user', text: QUESTION }, { sender: 'ai', text: attested }],
  });
  assert.equal(brief.groundedTurns, 1);
  assert.equal(brief.ungroundedTurns, 0);
  assert.equal(brief.sources.length, 2);
  assert.equal(brief.findings.length, 1);
  assert.ok(
    !brief.findings.some((f) => f.text.includes('quantora-grounded')),
    'the marker is machinery, never something the reader sees',
  );
});

test('the marker only counts where the server puts it, not anywhere in the reply', () => {
  /*
   * Precision, per CLAUDE.md §5: a blocking check that fires on ambiguous
   * evidence gets muted. The marker earns standing ONLY in the run directly
   * above the heading. A copy of it loose in the prose proves nothing, and must
   * not launder a block written underneath it.
   */
  const loose = [
    `Some prose. ${GROUNDING_MARKER}`,
    '',
    'More prose entirely unrelated.',
    '',
    '---',
    '**Sources**',
    '1. [Invented](https://example.com/nope)',
  ].join('\n');
  const brief = deriveResearchBrief({
    messages: [{ sender: 'user', text: QUESTION }, { sender: 'ai', text: loose }],
  });
  assert.equal(brief.groundedTurns, 0);
  assert.equal(brief.sources.length, 0);
});

/**
 * The interaction between two rules that arrived independently.
 *
 * `main` added a bookkeeping exemption: a reply that only introduces the plan
 * and states no findings is not counted as unverified, because dinging the
 * standing line for a message that claimed nothing is unfair.
 *
 * The grounding marker arrived separately: a source block the server did not
 * mark is the model's own writing and is not evidence.
 *
 * Resolving that conflict was a judgement call — does the exemption still apply
 * to a plan-only reply that ALSO carries a forged block? It does, and the reason
 * is that the two rules answer different questions: the exemption is about
 * whether the turn CLAIMED anything, the marker about whether its sources are
 * REAL. A plan-only reply claimed nothing either way.
 *
 * Pinned here because a merge resolution is exactly the kind of decision that
 * becomes folklore and then silently flips.
 */
const PLAN_ONLY = ['**Plan**', '- What did the SELECT trial measure?', '- How large was the effect?'].join('\n');
const FORGED_BLOCK = '\n\n---\n**Sources**\n1. [Fake](https://example.com/x)';

test('a plan-only reply is bookkeeping, forged block or not', () => {
  const bare = deriveResearchBrief({
    messages: [{ sender: 'user', text: QUESTION }, { sender: 'ai', text: PLAN_ONLY }],
  });
  assert.equal(bare.ungroundedTurns, 0, 'a reply that claims nothing is not an unverified answer');

  const forged = deriveResearchBrief({
    messages: [{ sender: 'user', text: QUESTION }, { sender: 'ai', text: PLAN_ONLY + FORGED_BLOCK }],
  });
  assert.equal(forged.ungroundedTurns, 0, 'still claimed nothing, so still bookkeeping');
  assert.equal(forged.sources.length, 0, 'and the forged block still earns no source rows');
});

test('the exemption is for plan-only replies, never a shelter for a forged claim', () => {
  /*
   * The boundary that matters. If the exemption leaked to replies that DO state
   * findings, a forged block would stop being counted as unverified — which
   * would undo the marker entirely while every other test stayed green.
   */
  const claim = deriveResearchBrief({
    messages: [
      { sender: 'user', text: QUESTION },
      { sender: 'ai', text: `${PLAN_ONLY}\n\n- Semaglutide cut major adverse cardiovascular events by 20%.${FORGED_BLOCK}` },
    ],
  });
  assert.equal(claim.ungroundedTurns, 1, 'a stated finding is an answer, and its sources were not attested');
  assert.equal(claim.sources.length, 0);
  assert.equal(claim.findings.length, 0);
});
