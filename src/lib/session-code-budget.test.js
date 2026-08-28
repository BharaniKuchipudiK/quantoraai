import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compactSupersededBuilds,
  foldHeavyCode,
  hasHeavyCode,
} from './session-code-budget.js';

const PAGE = Array(970).fill('  <div class="card"><h3>Araku Valley Arabica</h3></div>').join('\n');
const buildReply = (n) => `Build ${n}. Here is your storefront.\n\n\`\`\`html filepath="index.html"\n${PAGE}\n\`\`\`\n\nWhat's in it: a hero and a cart.`;

function transcript(turns) {
  const messages = [];
  for (let i = 1; i <= turns; i += 1) {
    messages.push({ id: `u${i}`, sender: 'user', text: 'make the cart slide out' });
    messages.push({ id: `a${i}`, sender: 'ai', text: buildReply(i) });
  }
  return messages;
}

test('a small snippet is left alone', () => {
  const text = 'Try this:\n\n```js\nconst x = 1;\n```\n\nThat is all.';
  assert.equal(hasHeavyCode(text), false);
  assert.equal(foldHeavyCode(text), text, 'a ten-line snippet is often the point of the message');
});

test('the newest build keeps its code verbatim', () => {
  const result = compactSupersededBuilds(transcript(5));
  const newest = result.messages[9];
  assert.ok(newest.text.includes('Araku Valley Arabica'), 'Preview replays this one, and it matches the desk');
  assert.equal(newest.codeFolded, undefined);
});

test('superseded builds are folded, and say so', () => {
  const result = compactSupersededBuilds(transcript(5));
  assert.equal(result.foldedCount, 4);
  const folded = result.messages[1];
  assert.ok(!folded.text.includes('Araku Valley Arabica'));
  assert.match(folded.text, /An earlier version of index\.html — \d+ KB — was here\./);
  assert.match(folded.text, /The current files are on the desk\./);
  assert.equal(folded.codeFolded, true);
});

test('the prose around a fold is preserved exactly', () => {
  const result = compactSupersededBuilds(transcript(3));
  const folded = result.messages[1];
  assert.ok(folded.text.startsWith('Build 1. Here is your storefront.'));
  assert.ok(folded.text.endsWith("What's in it: a hero and a cart."));
});

test('folding is idempotent', () => {
  const once = compactSupersededBuilds(transcript(5));
  const twice = compactSupersededBuilds(once.messages);
  assert.equal(twice.foldedCount, 0, 'a folded message has no fence left to fold');
  assert.deepEqual(twice.messages, once.messages);
});

test('it reports a real number, not a claim that something was saved', () => {
  const before = JSON.stringify(transcript(5)).length;
  const result = compactSupersededBuilds(transcript(5));
  const after = JSON.stringify(result.messages).length;
  assert.ok(result.savedChars > 0);
  assert.ok(before - after >= result.savedChars * 0.9, 'the reported saving matches the real one');
  assert.ok(after < before * 0.3, 'a five-build session should shrink by more than two thirds');
});

test('a single build is never folded', () => {
  const result = compactSupersededBuilds(transcript(1));
  assert.equal(result.foldedCount, 0);
  assert.ok(result.messages[1].text.includes('Araku Valley Arabica'));
});

test('user messages and in-flight replies are never touched', () => {
  const messages = transcript(2);
  messages.push({ id: 'live', sender: 'ai', text: buildReply(99), isGenerating: true });
  const result = compactSupersededBuilds(messages);
  assert.ok(result.messages[4].text.includes('Araku Valley Arabica'), 'a streaming reply is not rewritten under itself');
  assert.ok(result.messages.filter((m) => m.sender === 'user').every((m) => m.text === 'make the cart slide out'));
});

test('a fence without a filepath still names what it was', () => {
  const text = `Here.\n\n\`\`\`css\n${PAGE}\n\`\`\`\n\nDone.`;
  assert.match(foldHeavyCode(text), /An earlier version of a css file/);
  const bare = `Here.\n\n\`\`\`\n${PAGE}\n\`\`\`\n\nDone.`;
  assert.match(foldHeavyCode(bare), /An earlier version of a file/);
});

test('a reply with several heavy files folds all of them', () => {
  const text = `Two files.\n\n\`\`\`html filepath="index.html"\n${PAGE}\n\`\`\`\n\nand\n\n\`\`\`css filepath="styles.css"\n${PAGE}\n\`\`\`\n\nDone.`;
  const messages = [
    { id: 'a1', sender: 'ai', text },
    { id: 'a2', sender: 'ai', text: buildReply(2) },
  ];
  const folded = compactSupersededBuilds(messages).messages[0].text;
  assert.match(folded, /earlier version of index\.html/);
  assert.match(folded, /earlier version of styles\.css/);
  assert.ok(folded.includes('Two files.') && folded.includes('and') && folded.includes('Done.'));
});
