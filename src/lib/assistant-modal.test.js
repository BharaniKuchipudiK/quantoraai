import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readAssistantModal } from './assistant-modal.js';

/**
 * ---------------------------------------------------------------------------
 * THE PLATFORM MUST NOT PUNISH THE MODEL FOR OBEYING IT.
 *
 * Guided intake asks the model to pause and ask ONE material question instead
 * of building something ambiguous. On 2026-09-04 it did exactly that, in
 * production, and the deployed golden failed with "neither an intake question
 * nor an artifact within 150s" — while the page's own console said why:
 *
 *   Failed to parse modal data SyntaxError: Bad control character in string
 *   literal in JSON at position 93 (line 2 column 93)
 *
 * A raw newline inside a JSON string. The model wrote a two-line question,
 * which is the normal way to write one, and a bare JSON.parse threw its whole
 * answer away.
 * ---------------------------------------------------------------------------
 */

const wrap = (json, prose = 'Before I design anything.') => `${prose}\n\n<quantora-modal>${json}</quantora-modal>`;

test('a two-line question is read, not thrown away', () => {
  // The production shape, in the part that mattered: a raw newline mid-string.
  const emitted = wrap(
    '{\n  "question": "Should the catalogue lead with sarees,\n'
    + 'or with the services (stitching, draping, pico & fall, mehndi)?",\n'
    + '  "options": [{"label":"Lead with sarees"},{"label":"Lead with services"}]\n}',
  );
  const { modalData, cleanText, repaired } = readAssistantModal(emitted);
  assert.ok(modalData, 'the modal must survive a newline inside a string');
  assert.equal(repaired, true);
  assert.match(modalData.question, /sarees,\nor with the services/, 'the newline is preserved, not deleted');
  assert.deepEqual(modalData.options.map((o) => o.label), ['Lead with sarees', 'Lead with services']);
  assert.equal(cleanText, 'Before I design anything.');
});

test('tabs and other control characters inside strings are handled too', () => {
  const { modalData, repaired } = readAssistantModal(wrap('{"question":"a\tbc","options":[]}'));
  assert.equal(repaired, true);
  assert.equal(modalData.question, 'a\tbc');
});

test('valid JSON is untouched and reports no repair', () => {
  const { modalData, repaired } = readAssistantModal(wrap('{"question":"One line?","options":[{"label":"Yes"}]}'));
  assert.equal(repaired, false, 'a clean parse must not claim to have repaired anything');
  assert.equal(modalData.question, 'One line?');
});

test('control characters BETWEEN tokens are legal and left alone', () => {
  // Pretty-printed JSON is full of newlines outside strings. Touching those
  // would be repairing something that was never broken.
  const { modalData, repaired } = readAssistantModal(wrap('{\n  "question": "Pretty?",\n  "options": []\n}'));
  assert.equal(repaired, false);
  assert.equal(modalData.question, 'Pretty?');
});

test('an escaped newline is not double-escaped', () => {
  const { modalData, repaired } = readAssistantModal(wrap('{"question":"already\\nescaped","options":[]}'));
  assert.equal(repaired, false);
  assert.equal(modalData.question, 'already\nescaped');
});

test('a quote escaped inside a string does not end the string', () => {
  /*
   * ONE escaped quote before the raw newline, deliberately.
   *
   * The first version of this test used TWO — say \"hi\" — and passed with
   * backslash handling deleted: a scanner that mistakes \" for a string
   * boundary flips twice over a pair and lands back inside the string by luck,
   * so the newline still got escaped and the parse still succeeded. An odd
   * number leaves it OUTSIDE, the newline is left raw, and the parse fails,
   * which is the behaviour this is here to hold. Found only by deleting the
   * backslash branch and watching the suite stay green (§8).
   */
  const { modalData } = readAssistantModal(wrap('{"question":"he said \\"hello,\nand left","options":[]}'));
  assert.ok(modalData, 'an escaped quote must not desynchronise the scanner');
  assert.equal(modalData.question, 'he said "hello,\nand left');
});

test('a fenced modal is read — the fence is packaging, not content', () => {
  /*
   * 2026-09-05, found by the verdict added the night before. The deployed
   * golden went red at guided-intake with modalUnreadable: true and the
   * transcript ending "So, first thing:" — the model had obeyed, written its
   * prose, and handed over to a modal the desk then dropped.
   *
   * A model that fences JSON is being conventional. Every other code block it
   * emits is fenced, and nothing ever told it this one must not be.
   */
  const body = '{"question":"Sell online, or a showcase?","options":[{"label":"Sell online"},{"label":"Showcase"}]}';
  for (const fence of ['```json', '```JSON', '```', '```jsonc']) {
    const { modalData, repaired } = readAssistantModal(wrap(`${fence}\n${body}\n\`\`\``));
    assert.ok(modalData, `${fence} must not cost the model its question`);
    assert.equal(repaired, true);
    assert.equal(modalData.question, 'Sell online, or a showcase?');
    assert.deepEqual(modalData.options.map((o) => o.label), ['Sell online', 'Showcase']);
  }
});

test('a fenced TWO-LINE question survives both repairs at once', () => {
  // One message, not two problems — the newline case inside the fence case.
  const { modalData, repaired } = readAssistantModal(wrap(
    '```json\n{"question":"Lead with sarees,\nor with the services?","options":[]}\n```',
  ));
  assert.ok(modalData, 'a fenced two-line question must survive');
  assert.equal(repaired, true);
  assert.match(modalData.question, /sarees,\nor with the services/);
});

test('an UNBALANCED fence is left alone rather than guessed at', () => {
  /*
   * The anchors earn their keep here. A ``` that opens and never closes, or one
   * that appears mid-question, is ambiguous — and ambiguity is where inventing
   * structure starts. Refusing is correct; the reason is published instead.
   */
  const { modalData, failure } = readAssistantModal(wrap('```json\n{"question":"Q","options":[]}'));
  assert.equal(modalData, null, 'a half-fence must not be second-guessed');
  assert.ok(failure, 'and the refusal must be reportable');
});

test('the failure REASON is carried, not just the fact of failure', () => {
  /*
   * "unreadable" named the class and left the instance to be guessed at, which
   * cost a production round on 2026-09-05. The parser already knew; nothing
   * carried it.
   */
  const { failure } = readAssistantModal(wrap('{"options":[{"label":"A"},]}'));
  assert.ok(failure, 'a refusal must report');
  assert.match(failure, /JSON/i, 'and the report must name the parser problem, not just say "no"');
});

test('an unreadable modal never reaches the user as raw braces', () => {
  /*
   * The half of this that is not about JSON. cleanText used to be stripped
   * ONLY on success, so a modal we could not read became a wall of braces in
   * the chat — our failure, shown to them.
   */
  const broken = wrap('{"question": "unterminated', 'Here is my question.');
  const { modalData, cleanText, failure } = readAssistantModal(broken);
  assert.equal(modalData, null);
  assert.equal(cleanText, 'Here is my question.');
  assert.doesNotMatch(cleanText, /quantora-modal|\{|"question"/, 'the raw marker must never survive into the chat');
  assert.ok(failure, 'an unreadable modal must be reportable, not silent');
});

test('no marker means no change at all', () => {
  const plain = 'Just a normal reply with no modal in it.';
  assert.deepEqual(readAssistantModal(plain), { modalData: null, cleanText: plain, repaired: false, failure: null });
  assert.deepEqual(readAssistantModal(''), { modalData: null, cleanText: '', repaired: false, failure: null });
  assert.deepEqual(readAssistantModal(null), { modalData: null, cleanText: '', repaired: false, failure: null });
});

test('it does not invent structure the model never wrote', () => {
  /*
   * Deliberately NOT a general JSON fixer. Balancing quotes or completing
   * brackets would let this put an option in the model's mouth that the user
   * then clicks — on a decision modal that is worse than showing nothing.
   */
  for (const hostile of ['{"options":[{"label":"A"},]}', '{question: "unquoted key"}', '{"a":1}}']) {
    const { modalData } = readAssistantModal(wrap(hostile));
    assert.equal(modalData, null, `${hostile} must not be guessed at`);
  }
});

test('the desk reads modals through this, not through a bare JSON.parse', async () => {
  // A parser nobody calls is the defect this file exists to remove.
  const studio = await readFile(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  assert.match(studio, /readAssistantModal\(cleanText\)/, 'the desk must use the tolerant reader');
  const code = studio.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(
    code,
    /JSON\.parse\(match\[1\]\)/,
    'the bare parse is back — a two-line question will be discarded again',
  );
});
