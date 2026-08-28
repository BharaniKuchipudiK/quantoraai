/**
 * Wiring audit — find code that exists, is tested, and is connected to nothing.
 *
 * WHY THIS EXISTS
 *
 * A third of one week's user-visible Coding Desk defects were the same thing:
 * a function that was written, exported, covered by passing tests, and called
 * by no production code at all.
 *
 *   shouldStartGuidedBuild decided "ask the essentials before building a
 *   website". It had tests. They passed every day for months while nothing
 *   called it, so the platform never asked a single intake question and built a
 *   970-line storefront under an invented brand name instead.
 *
 * That is the worst failure mode available to a test suite, because the green
 * tick is not neutral — it actively asserts the feature works. A passing test
 * on a disconnected wire is a false all-clear, and the more of them there are
 * the more confident everyone is about nothing.
 *
 * Nothing in this repo checked for it. This does.
 *
 * WHAT COUNTS AS AN ORPHAN
 *
 * An exported symbol that is:
 *   - referenced by at least one TEST (untested dead code is a different, and
 *     less dangerous, problem — nothing is claiming it works), and
 *   - referenced by NO production file, including its own module.
 *
 * The "including its own module" part matters. A helper used internally by the
 * function that IS exported and called is wired; flagging it would bury the
 * real signal in noise, and a gate people learn to ignore protects nothing.
 *
 * WHAT THIS DELIBERATELY DOES NOT CATCH
 *
 * Dead *data*. Three of four capability doors are defined and unreachable, but
 * they are entries in an object, not exported functions, so this will not see
 * them. Saying so here rather than letting the gate imply a coverage it does
 * not have.
 */

const EXPORTED = /export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g;

/** Source files this audit reasons about. */
export const AUDITED_DIRS = ['src/lib/', 'shared/', 'api/_lib/'];

export function isTestPath(path) {
  return /\.test\.[jt]sx?$/.test(String(path || ''));
}

function auditable(path) {
  return AUDITED_DIRS.some((dir) => String(path || '').includes(dir));
}

/** Every exported symbol name declared in a source string. */
export function exportedNames(source = '') {
  const names = [];
  const re = new RegExp(EXPORTED.source, 'g');
  let match;
  while ((match = re.exec(String(source || ''))) !== null) names.push(match[1]);
  return names;
}

/**
 * Source with comments and string literals removed.
 *
 * Found by testing the gate against a real regression it then failed to catch:
 * this module's own docblock names shouldStartGuidedBuild while explaining why
 * it matters, and a bare word-boundary search counted that prose as a caller.
 * Documentation defeating the check it documents is exactly the kind of
 * self-congratulatory green tick this file exists to stop.
 *
 * This is a character scanner, not a regex, because regexes cannot lex
 * JavaScript. Two earlier attempts proved it on this very file: stripping every
 * quoted span ate real code out of modules full of regex literals, and pairing
 * backticks naively joined the END of one template to the START of the next,
 * blanking everything between. Both reported this module's own stripNonCode as
 * uncalled while two live call sites sat three lines below its definition.
 *
 * Template `${...}` holes are kept as code — they can name the very symbol
 * being looked for. Regex literals are detected by whether a slash sits where a
 * value may begin, which is the standard heuristic and correct here.
 *
 * Accepted blind spot: a symbol referenced only by name in a string — a
 * dynamic dispatch table — reads as uncalled. That is rare, and erring toward
 * flagging is the right direction for a gate about dead wires.
 */
export function stripNonCode(source = '') {
  const src = String(source || '');
  let out = '';
  let i = 0;
  // Template nesting: each open template pushes, each ${ } pushes/pops code.
  const stack = [];
  let prev = '';
  const keep = (ch) => { out += ch; if (!/\s/.test(ch)) prev = ch; };
  const drop = (n = 1) => { out += ' '.repeat(n); };

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') { drop(); i += 1; }
      continue;
    }
    if (ch === '/' && next === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { drop(); i += 1; }
      drop(2); i += 2;
      continue;
    }
    // A slash is a regex only where a value may begin; otherwise it divides.
    if (ch === '/' && (prev === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prev))) {
      drop(); i += 1;
      let inClass = false;
      while (i < src.length) {
        const c = src[i];
        if (c === '\\') { drop(2); i += 2; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { drop(); i += 1; break; }
        else if (c === '\n') break;
        drop(); i += 1;
      }
      while (i < src.length && /[a-z]/.test(src[i])) { drop(); i += 1; }
      prev = '/';
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      drop(); i += 1;
      while (i < src.length && src[i] !== quote && src[i] !== '\n') {
        if (src[i] === '\\') { drop(2); i += 2; continue; }
        drop(); i += 1;
      }
      drop(); i += 1;
      prev = quote;
      continue;
    }
    if (ch === '`') {
      stack.push('template');
      drop(); i += 1;
      while (i < src.length && stack[stack.length - 1] === 'template') {
        if (src[i] === '\\') { drop(2); i += 2; continue; }
        if (src[i] === '`') { stack.pop(); drop(); i += 1; break; }
        // ${ ... } is real code and may name the symbol we are looking for.
        if (src[i] === '$' && src[i + 1] === '{') {
          drop(2); i += 2;
          let depth = 1;
          while (i < src.length && depth > 0) {
            if (src[i] === '{') depth += 1;
            else if (src[i] === '}') { depth -= 1; if (!depth) { drop(); i += 1; break; } }
            keep(src[i]); i += 1;
          }
          continue;
        }
        if (src[i] === '\n') { out += '\n'; i += 1; continue; }
        drop(); i += 1;
      }
      prev = '`';
      continue;
    }
    if (ch === '\n') { out += '\n'; i += 1; continue; }
    keep(ch); i += 1;
  }
  return out;
}

/*
 * Scanning is linear per file, but naively re-scanning every file for every
 * exported symbol is exports x files — on this repo that ran for minutes.
 * Strip once, reuse for every lookup.
 */
function strippedIndex(files) {
  const index = new Map();
  for (const path of Object.keys(files)) index.set(path, stripNonCode(files[path]));
  return index;
}

function mentions(source, name) {
  return new RegExp(`\\b${name}\\b`).test(source);
}

function countMentions(source, name) {
  return (source.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
}

/**
 * Find exports that only their tests believe in.
 *
 * `files` is a map of path -> source, so this stays a pure function and the
 * tests below can build a repository in four lines instead of a fixture tree.
 *
 * Returns [{ name, file }] sorted for a stable baseline.
 */
export function findOrphanExports(files = {}) {
  const paths = Object.keys(files);
  const productionPaths = paths.filter((path) => !isTestPath(path));
  const stripped = strippedIndex(files);
  const testSource = paths.filter(isTestPath).map((path) => stripped.get(path)).join('\n');

  const orphans = [];
  for (const path of productionPaths) {
    if (!auditable(path)) continue;
    const self = stripped.get(path);
    for (const name of exportedNames(self)) {
      // Used inside its own module beyond the export line — that is wiring.
      if (countMentions(self, name) > 1) continue;
      if (productionPaths.some((other) => other !== path && mentions(stripped.get(other), name))) continue;
      // Nobody claims it works, so nobody is misled. Different problem.
      if (!mentions(testSource, name)) continue;
      orphans.push({ name, file: path });
    }
  }
  return orphans.sort((left, right) => (
    left.file.localeCompare(right.file) || left.name.localeCompare(right.name)
  ));
}

/** `file::name`, the stable identity used in the baseline. */
export function orphanKey(orphan) {
  return `${orphan.file}::${orphan.name}`;
}

/**
 * Compare today's orphans against the frozen baseline.
 *
 * A ratchet, not a cleanup order. Fifty-four already exist; demanding they all
 * go before the gate turns on would mean the gate never turns on, and the next
 * dead feature ships tomorrow. New ones fail; fixed ones shrink the baseline.
 */
export function compareToBaseline(orphans = [], baseline = []) {
  const now = new Set(orphans.map(orphanKey));
  const before = new Set(baseline);
  const added = [...now].filter((key) => !before.has(key)).sort();
  const removed = [...before].filter((key) => !now.has(key)).sort();
  return { added, removed, ok: added.length === 0, total: now.size };
}
