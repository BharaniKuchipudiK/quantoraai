import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPrivateStudyInstruction,
  withoutPrivateStudyInstructions,
} from './study-private-instructions.js';

const leaked = [
  'Teach ONE idea about thermodynamics.',
  '<quantora-study-picture caption="one sentence about this idea" />',
  'Do not invent image URLs or YouTube IDs.',
].join(' ');
const shortenedRepositoryPoison = [
  'Give me one practice question on ONE idea about Scan through the Github',
  ' public repositories.',
].join('');

test('recognises persisted private Study control prompts', () => {
  assert.equal(isPrivateStudyInstruction(leaked), true);
  assert.equal(isPrivateStudyInstruction('lets learn thermo dynamics'), false);
});

test('removes private prompts only from Study history', () => {
  const messages = [
    { sender: 'user', text: 'lets learn thermo dynamics' },
    { sender: 'user', text: leaked },
    { sender: 'ai', text: 'Heat moves from warmer to cooler objects.' },
  ];
  assert.deepEqual(withoutPrivateStudyInstructions(messages, 'education'), [messages[0]]);
  assert.equal(withoutPrivateStudyInstructions(messages, 'finance').length, 3);
});

test('removes shortened repository-scan poison and its paired answer', () => {
  const messages = [
    { sender: 'user', text: 'lets learn thermo dynamics' },
    { sender: 'user', text: shortenedRepositoryPoison },
    { sender: 'ai', text: 'When scanning GitHub, stars are not quality.' },
    { sender: 'user', text: 'Explain entropy instead' },
    { sender: 'ai', text: 'Entropy tracks how energy spreads.' },
  ];
  assert.deepEqual(withoutPrivateStudyInstructions(messages, 'education'), [messages[0], messages[3], messages[4]]);
});
