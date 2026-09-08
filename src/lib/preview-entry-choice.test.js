/**
 * WHICH PAGE IS PREVIEW RUNNING.
 *
 * THE INCIDENT (2026-09-08). A build shipped the page the person asked for as
 * `hello.html` and kept an improved `index.html` from the same session. Preview
 * renders the conventional entry, so it showed the OLD page, said nothing about
 * which file it was running, and the reply's only route to the new one was:
 *
 *   "Say the word and I'll make it the Preview entry instead."
 *
 * A paid model turn — turn budget, latency, a rebuild, and a chance of the
 * model changing something else while it is in there — to repoint an iframe at
 * a file already on disk. The person reported it as "I don't have preview to
 * see the new changes", which is what a silent wrong default looks like from
 * the outside.
 *
 * The fix is deliberately NOT a cleverer default. pickPreviewEntryPath decides
 * every preview in the product from 14+ call sites, and a precedence change
 * there risks previews for everyone to fix a confusion for one person. Making
 * the running page VISIBLE and CORRECTABLE turns a silent failure into one
 * click, and leaves the default untouched — the trade this gate pins in both
 * directions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickPreviewEntryPath, previewEntryChoices, resolvePreviewEntryPath } from './preview-utils.js';
import { runningPreviewCode } from './studio-preview-helpers.js';

const page = (title) => ({ content: `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${title}</h1></body></html>` });
const titleOf = (html) => (String(html || '').match(/<title>([^<]*)<\/title>/) || [])[1] || '';

const TWO_PAGES = { 'hello.html': page('Hello / Goodbye'), 'index.html': page('FlatSplit') };
const ONE_PAGE = { 'hello.html': page('Hello / Goodbye') };
const REACT_PROJECT = {
  'index.html': page('Shell'),
  'src/main.jsx': { content: "import App from './App.jsx';" },
  'src/App.jsx': { content: 'export default function App() { return null; }' },
};

test('[was-red] the person can reach the page the build actually made', () => {
  /*
   * The whole incident in one assertion. Unpinned, Preview shows the
   * conventional entry; pinned, it shows the page they asked for — with no
   * model call between the two.
   */
  assert.equal(titleOf(runningPreviewCode(TWO_PAGES, '')), 'FlatSplit');
  assert.equal(titleOf(runningPreviewCode(TWO_PAGES, '', 'hello.html')), 'Hello / Goodbye');
});

test('the default entry is untouched — the fix is visibility, not a new heuristic', () => {
  /*
   * The guard on the trade. Fixing this by reordering pickPreviewEntryPath
   * would change what every preview in the product renders; if a later change
   * does that, this fails and the decision gets made deliberately rather than
   * as a side effect.
   */
  assert.equal(pickPreviewEntryPath(TWO_PAGES), 'index.html');
  assert.equal(pickPreviewEntryPath(REACT_PROJECT), 'index.html');
  assert.equal(
    runningPreviewCode(TWO_PAGES, ''),
    runningPreviewCode(TWO_PAGES, '', null),
    'an absent pin must be byte-for-byte the old behaviour',
  );
});

test('the control appears only where there is a real choice', () => {
  /*
   * §5: fire on an unambiguous signal or not at all. Two HTML pages is a
   * choice. One page is not. A React project's module graph is not — it has a
   * single entry, and listing src/main.jsx as a "page" would invent a decision
   * nobody has and put a dead control on every ordinary build.
   */
  assert.deepEqual(previewEntryChoices(ONE_PAGE), [], 'one page is not a choice');
  assert.deepEqual(previewEntryChoices(REACT_PROJECT), [], 'a module graph is not a set of pages');
  assert.deepEqual(previewEntryChoices({}), [], 'an empty desk offers nothing');
  assert.deepEqual(previewEntryChoices(TWO_PAGES), ['index.html', 'hello.html']);
});

test('the running page is listed first, so the label reads as the current state', () => {
  const choices = previewEntryChoices(TWO_PAGES);
  assert.equal(choices[0], pickPreviewEntryPath(TWO_PAGES), 'the conventional entry leads the list');
});

test('[was-red] a pin cannot go stale, because it is checked against the live files', () => {
  /*
   * The reason the pin is a path validated on read rather than state cleared
   * by an event: a build that replaces the product drops the pinned file, and
   * the pin has to die with it. An event-driven version needs a signal wired
   * at every place the VFS is replaced — and this codebase has already been
   * bitten by exactly one such site being missed.
   */
  const afterProductSwitch = { 'index.html': page('A Bakery Site') };
  assert.equal(resolvePreviewEntryPath(afterProductSwitch, 'hello.html'), 'index.html');
  assert.equal(titleOf(runningPreviewCode(afterProductSwitch, '', 'hello.html')), 'A Bakery Site');

  assert.equal(resolvePreviewEntryPath(TWO_PAGES, 'nonexistent.html'), 'index.html');
  assert.equal(resolvePreviewEntryPath(TWO_PAGES, ''), 'index.html');
  assert.equal(resolvePreviewEntryPath(TWO_PAGES, null), 'index.html');
});

test('a pin survives a refine that keeps the page', () => {
  /*
   * The other half of "cannot go stale": it must not clear itself the moment
   * the model touches anything. A person who pinned hello.html and then asked
   * for a change to it should still be looking at hello.html.
   */
  const refined = { 'hello.html': page('Hello / Goodbye v2'), 'index.html': page('FlatSplit') };
  assert.equal(titleOf(runningPreviewCode(refined, '', 'hello.html')), 'Hello / Goodbye v2');
});

test('the control is wired to the desk, and names the page in a durable hook', () => {
  /*
   * A pure function nothing renders is the class test:wiring exists for, and
   * this repo has shipped that twice this week. Asserted on the source because
   * the desk has no unit-testable seam: the hooks are what the browser gates
   * and the journey ledger both look for, and prose is not a hook (§6).
   */
  const controls = readFileSync(new URL('../components/StudioPreviewControls.jsx', import.meta.url), 'utf8');
  assert.match(controls, /data-quantora-desk-preview-entry=/, 'the running page must be readable from the DOM');
  assert.match(controls, /data-quantora-desk-preview-entry-select="true"/, 'and switchable');
  assert.match(controls, /entryChoices\.length > 1 \?/, 'and absent when there is no choice');

  const studio = readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  assert.match(studio, /runningPreviewCode\(vfs, workspaceCode, previewEntryPin\)/, 'the pin must reach the code Preview runs');
  assert.match(studio, /onSelectEntry=\{setPreviewEntryPin\}/, 'and the control must be the thing that sets it');
  assert.match(studio, /entryChoices=\{previewEntryChoiceList\}/, 'and be given the real choices');
});

test('choosing a page costs no model call', () => {
  /*
   * The point of the whole change. The model offered to do this as a chat turn;
   * if switching ever needs the network again, this file's reason for existing
   * is gone. runningPreviewCode is synchronous and pure — no await, no fetch.
   */
  const source = readFileSync(new URL('./studio-preview-helpers.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('export function runningPreviewCode'));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  assert.doesNotMatch(body, /await|fetch\(|async/, 'repointing the preview must stay a local, free operation');
});

/*
 * WHAT THE FIRST VERSION OF THIS GATE MISSED (review, 2026-09-08).
 *
 * It asserted the property I had reasoned about — a pin dies when its file
 * disappears — and none of the three it turned out I had not:
 *
 *   P1  a repair written while a pin is active landed on the CONVENTIONAL
 *       entry, silently overwriting a file the person was not watching and
 *       leaving the one they were unchanged;
 *   P2  the pin outlived the chat it was chosen in, so a different project
 *       with the same filename opened on the non-default page;
 *   P2  a project-runtime VFS got a selector that could relabel itself but
 *       change nothing on screen — this control's own defect, one layer down.
 *
 * Each is pinned below. "The pin cannot go stale" was true and insufficient:
 * a file existing is not the same as it being the same file.
 */

test('[codex-p1] a repair lands on the page being watched, not the conventional one', async () => {
  const { writeHealedPreviewToVfs } = await import('./studio-preview-helpers.js');
  const before = { 'hello.html': page('Hello / Goodbye'), 'index.html': page('FlatSplit') };
  const healed = '<!DOCTYPE html><html><head><title>Hello / Goodbye</title></head><body><h1>Repaired</h1></body></html>';

  const pinned = writeHealedPreviewToVfs(before, healed, null, 'hello.html');
  assert.equal(pinned.path, 'hello.html', 'the repair must target the pinned page');
  assert.match(pinned.vfs['hello.html'].content, /Repaired/);
  assert.equal(
    pinned.vfs['index.html'].content,
    before['index.html'].content,
    'a file nobody was looking at must not be rewritten',
  );

  const unpinned = writeHealedPreviewToVfs(before, healed, null, null);
  assert.equal(unpinned.path, 'index.html', 'unpinned behaviour is unchanged');
});

test('[codex-p1] the repair path is actually given the pin by the desk', () => {
  /*
   * The helper accepting a pin proves nothing if the caller never passes one —
   * this repo has shipped exactly that shape twice. Asserted on the source
   * because handleHealedPreview closes over component state.
   */
  const studio = readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  assert.match(
    studio,
    /writeHealedPreviewToVfs\(vfs, healedHtml, deskJob, previewEntryPin\)/,
    'healing and Improve must write to the page the person is watching',
  );
  assert.match(
    studio,
    /setWorkspaceCode\(runningPreviewCode\(next\.vfs, healedHtml, previewEntryPin\)\)/,
    'and the desk must keep showing that page afterwards',
  );
});

test('[codex-p2] a pin belongs to the desk it was chosen on', () => {
  /*
   * Validating the path against the live VFS does not cover this: switching to
   * another project that also has a hello.html finds a real file, just not the
   * same one. The pin has to end at the session boundary.
   */
  const studio = readFileSync(new URL('../components/AiStudio.jsx', import.meta.url), 'utf8');
  assert.match(
    studio,
    /useEffect\(\(\) => \{ setPreviewEntryPin\(null\); \}, \[activeSessionId\]\);/,
    'the pin must be cleared when the desk changes',
  );
});

test('[codex-p2] no selector where the project runtime owns the entry', () => {
  /*
   * LivePreviewCanvas hands a Vite/React VFS to ProjectRuntimePreview with the
   * files and no entry override. A selector there would relabel itself and
   * change nothing on screen — precisely the claim-versus-behaviour split this
   * control exists to close.
   */
  const viteWithTwoPages = {
    'package.json': { content: '{"name":"app"}' },
    'src/main.jsx': { content: "import App from './App.jsx';" },
    'index.html': page('Shell'),
    'about.html': page('About'),
  };
  assert.deepEqual(
    previewEntryChoices(viteWithTwoPages),
    [],
    'a runtime that resolves its own root must not be offered a chooser it ignores',
  );

  // ...and a plain two-page site is unaffected by that carve-out.
  assert.deepEqual(previewEntryChoices(TWO_PAGES), ['index.html', 'hello.html']);
});
