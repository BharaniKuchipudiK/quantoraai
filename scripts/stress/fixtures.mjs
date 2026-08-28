/**
 * Model replies the pipeline has to survive — realistic and hostile.
 *
 * Every one of the sixteen Coding Desk defects found this week lived in the
 * deterministic layer AROUND the model: parsing, patching, committing,
 * persisting, reporting. None needed a live call to reproduce. So these are
 * fixtures, not API traffic, and the whole suite costs nothing to run.
 */

const CARD = '  <div class="product-card"><h3>Araku Valley Arabica</h3><p>1,200</p></div>';
export const BIG_PAGE = `<!DOCTYPE html><html><head><title>Kaapi Bharat</title></head><body>
<h1>Kaapi Bharat</h1>
${Array(400).fill(CARD).join('\n')}
<button id="add">Add to Cart</button>
<footer>&copy; 2025 Kaapi Bharat. All rights reserved.</footer>
</body></html>`;

export const SMALL_PAGE = `<!DOCTYPE html><html><head><title>Kaapi Bharat</title></head><body>
<h1>Kaapi Bharat</h1>
<p>Price: 1200</p>
<button id="add">Add to Cart</button>
</body></html>`;

export const BASE_VFS = Object.freeze({
  'index.html': { content: SMALL_PAGE, language: 'html' },
  'products.json': { content: '[{"id":"araku","name":"Araku Valley Arabica","price":1200}]', language: 'json' },
  'styles.css': { content: '.product-card{padding:8px}', language: 'css' },
});

const fence = (lang, path, body) => '```' + lang + (path ? ` filepath="${path}"` : '') + '\n' + body + '\n```';
const patch = (search, replace) => ['<<<<', search, '====', replace, '>>>>'].join('\n');

/**
 * `expect` records what the pipeline is ALLOWED to do, never what it should
 * produce — the harness asserts invariants, not golden output, so a legitimate
 * change of wording never fails a run.
 */
export const SCENARIOS = [
  {
    id: 'full-rewrite',
    why: 'the ordinary path: model returns a whole document',
    reply: `Here is your storefront.\n\n${fence('html', 'index.html', SMALL_PAGE.replace('Kaapi Bharat', 'Hirans Coffee'))}`,
    expect: { commits: true },
  },
  {
    id: 'patch-clean',
    why: 'a search/replace edit that matches exactly',
    reply: `Renamed it.\n\n${fence('html', 'index.html', patch('<h1>Kaapi Bharat</h1>', '<h1>Hirans Coffee</h1>'))}`,
    expect: { commits: true, keepsSiblings: true },
  },
  {
    id: 'patch-reindented',
    why: 'models reindent their search block; the intent is unambiguous',
    reply: `Price updated.\n\n${fence('html', 'index.html', patch('<p>Price:   1200</p>', '<p>Price: 1500</p>'))}`,
    expect: { commits: true },
  },
  {
    id: 'patch-partly-missing',
    why: 'THE defect: one edit lands, one does not',
    reply: `Renamed and repriced.\n\n${fence('html', 'index.html', `${patch('<h1>Kaapi Bharat</h1>', '<h1>Hirans</h1>')}\n${patch('<p>NOT IN FILE</p>', '<p>x</p>')}`)}`,
    expect: { reportsFailure: true },
  },
  {
    id: 'patch-ambiguous',
    why: 'a search block matching two places must not be guessed at',
    vfs: { 'index.html': { content: '<html><body><td>1200</td>\n<td>1200</td></body></html>', language: 'html' } },
    reply: `Repriced.\n\n${fence('html', 'index.html', patch('<td>1200</td>', '<td>1500</td>'))}`,
    expect: { reportsFailure: true, unchanged: true },
  },
  {
    id: 'patch-nothing-matches',
    why: 'a no-op edit must not be committed as a build',
    reply: `Done.\n\n${fence('html', 'index.html', patch('<h1>NOT IN FILE</h1>', '<h1>x</h1>'))}`,
    expect: { reportsFailure: true, unchanged: true },
  },
  {
    id: 'patch-no-base',
    why: 'markers must never be written into a build as content',
    vfs: {},
    reply: `Here.\n\n${fence('html', 'index.html', patch('<h1>A</h1>', '<h1>B</h1>'))}`,
    expect: { unchanged: true },
  },
  {
    id: 'truncated-mid-fence',
    why: 'the stream died halfway through the document',
    reply: `Building it.\n\n\`\`\`html filepath="index.html"\n<!DOCTYPE html><html><head><title>Kaapi</title></head><body>\n<h1>Kaapi`,
    expect: {},
  },
  {
    id: 'claims-without-code',
    why: 'the reply says it added a cart and ships no HTML',
    reply: 'Done — I added the currency switcher and Add to Cart, and the catalog now has 18 products.',
    expect: { commits: false },
  },
  {
    id: 'empty-fence',
    why: 'an empty code block must not blank the desk',
    reply: `Here.\n\n${fence('html', 'index.html', '')}`,
    expect: { unchanged: true },
  },
  {
    id: 'markers-in-prose',
    why: 'the model explains the patch format in prose without emitting one',
    reply: 'To edit a file you use <<<< then ==== then >>>> around the change. Want me to do that?',
    expect: { commits: false },
  },
  {
    id: 'sidecar-only',
    why: 'a .py file alone cannot be a UI update',
    reply: `Added the backend.\n\n${fence('python', 'server.py', 'print("hello")')}`,
    expect: {},
  },
  {
    id: 'multi-file-one-broken',
    why: 'one good file beside one empty one',
    reply: `Two files.\n\n${fence('html', 'index.html', SMALL_PAGE)}\n\n${fence('css', 'styles.css', '')}`,
    expect: {},
  },
  {
    id: 'big-page-rewrite',
    why: '400-card catalog: the size that hit the 175s ceiling',
    reply: `Here is the full catalog.\n\n${fence('html', 'index.html', BIG_PAGE)}`,
    expect: { commits: true },
  },
  {
    id: 'entities-and-unicode',
    why: 'generated HTML is full of entities and rupee signs',
    reply: `Done.\n\n${fence('html', 'index.html', SMALL_PAGE.replace('Kaapi Bharat', 'Kaapi &amp; Sons — ₹ pricing'))}`,
    expect: { commits: true },
  },
  {
    id: 'nested-backticks',
    why: 'a code sample inside the reply prose',
    reply: 'Use `npm run dev` to start.\n\n' + fence('html', 'index.html', SMALL_PAGE),
    expect: { commits: true },
  },
  {
    id: 'no-filepath',
    why: 'a bare html fence with no filepath attribute',
    reply: `Here.\n\n${fence('html', '', SMALL_PAGE)}`,
    expect: {},
  },
  {
    id: 'unfenced-html',
    why: 'the model forgot the fence entirely',
    reply: `Here you go.\n\n${SMALL_PAGE}`,
    expect: {},
  },
  {
    id: 'json-only-edit',
    why: 'editing the catalog without touching the page',
    reply: `Added a product.\n\n${fence('json', 'products.json', '[{"id":"araku","name":"Araku","price":1200},{"id":"coorg","name":"Coorg","price":1400}]')}`,
    expect: { keepsSiblings: true },
  },
  {
    id: 'patch-to-json',
    why: 'search/replace on a non-html file',
    reply: `Repriced.\n\n${fence('json', 'products.json', patch('"price":1200', '"price":1500'))}`,
    expect: { commits: true, keepsSiblings: true },
  },
];
