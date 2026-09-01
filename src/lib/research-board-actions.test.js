import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESEARCH_BOARD_PREFILLS,
  RESEARCH_BOARD_PROMPTS,
  RESEARCH_BOARD_STEERING,
} from './research-board-actions.js';
import { deriveResearchBrief } from './research-brief.js';

const QUESTION = 'What does the evidence say about creatine and cognition?';
const GROUNDED_REPLY = 'Findings here.\n\n---\n**Sources**\n1. [Nature study](https://www.nature.com/articles/x123)\n';

test('CONTRACT: every steering prompt carries the board marker', () => {
  for (const [name, prompt] of Object.entries(RESEARCH_BOARD_PROMPTS)) {
    assert.match(prompt, RESEARCH_BOARD_STEERING, `prompt "${name}" would rewrite the board's question`);
  }
});

test('CONTRACT: prefills do not carry the marker — completing one IS a new question', () => {
  for (const [name, prefill] of Object.entries(RESEARCH_BOARD_PREFILLS)) {
    assert.doesNotMatch(prefill, RESEARCH_BOARD_STEERING, `prefill "${name}" would be filtered out of the question`);
  }
});

test('CONTRACT: the brief actually honors the marker end to end', () => {
  // A steering turn leaves the question alone…
  for (const prompt of Object.values(RESEARCH_BOARD_PROMPTS)) {
    const brief = deriveResearchBrief({
      messages: [
        { sender: 'user', text: QUESTION },
        { sender: 'ai', text: GROUNDED_REPLY },
        { sender: 'user', text: prompt },
      ],
    });
    assert.equal(brief.question, QUESTION, `steering prompt replaced the question: "${prompt}"`);
  }
  // …and a completed prefill becomes the question.
  const narrowed = deriveResearchBrief({
    messages: [
      { sender: 'user', text: QUESTION },
      { sender: 'ai', text: GROUNDED_REPLY },
      { sender: 'user', text: `${RESEARCH_BOARD_PREFILLS.narrow}creatine dosing in adults over 60` },
    ],
  });
  assert.match(narrowed.question, /^Narrow this down to creatine dosing/);
});
