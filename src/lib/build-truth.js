/**
 * Build Truth — checks that are true of ANY build, not of one template.
 *
 * WHY THIS EXISTS
 *
 * The proof gate could answer exactly one question about an ordinary build:
 * "is there a runnable HTML or React file?" Everything else it knew how to
 * check — catalog photo counts, an Add to Cart control — describes a shop, and
 * a shop is one thing somebody might ask for. So a page with twelve beautiful
 * buttons that do nothing passed proof, and the person who asked for it found
 * out by clicking.
 *
 * That person is the whole point of this product. They cannot open devtools.
 * They cannot read the source. They cannot tell a working button from a
 * decorative one, a real link from a dead one, or a real price from a number
 * the model invented to fill the space. Those are exactly the things a machine
 * CAN check, and checking them is the difference between a demo and a tool.
 *
 * THE RULE THIS MODULE OBEYS
 *
 * Findings are annotations. This module never decides that a build failed and
 * never authorises deleting one. That distinction is the whole reason builds
 * were being destroyed before: a gate that could not recognise a good page
 * threw it away. A false accusation is cheaper than a deleted page but it is
 * not free — for someone who cannot adjudicate it, being told their working
 * page is broken is its own kind of lie. So every check here is built to be
 * SILENT when it cannot be sure, and the burden is always on the finding.
 *
 * WHAT IT CANNOT DO
 *
 * These are static checks over emitted HTML. When a page ships a component
 * framework, wiring lives in a runtime this cannot follow, and the control
 * check stands down completely rather than guess. Saying nothing is the
 * correct answer to a question you cannot answer.
 */

/** A tag that a person would expect to DO something when clicked. */
const CONTROL_TAGS = /<(button|a|input|summary)\b([^>]*)>/gi;

/** Values of href that look like a link but go nowhere. */
const DEAD_HREF = /^(?:#|javascript:\s*void\s*\(\s*0?\s*\)\s*;?|javascript:\s*;?|)$/i;

/**
 * Text a model writes when it has nothing real to say. Each of these is a
 * phrase no person would ship on purpose, which is what makes them safe to
 * flag: the false-positive rate is the rate at which someone deliberately
 * ships the words "Lorem ipsum".
 */
const PLACEHOLDER_TEXT = [
  [/\blorem\s+ipsum\b/i, 'Lorem ipsum filler text'],
  [/\byour\s+(?:text|content|title|name|logo|headline)\s+here\b/i, 'a "your text here" placeholder'],
  [/\b(?:TODO|FIXME|XXX)\b:/, 'a TODO left in the page'],
  [/\[(?:insert|add|your)\s[^\]]{0,40}\]/i, 'a bracketed placeholder like [insert name]'],
  [/\bplaceholder\s+(?:text|image|content)\b/i, 'text that calls itself a placeholder'],
  [/\bexample@example\.(?:com|org)\b/i, 'the fake address example@example.com'],
  [/\b123\s+Main\s+(?:St|Street)\b/i, 'the fake address 123 Main Street'],
  [/\bProduct\s+(?:One|Two|Three|A|B|C)\b/, 'unnamed products ("Product One")'],
  [/\bItem\s+\d+\s*(?:<|$)/m, 'unnamed items ("Item 1")'],
  [/\b(?:John|Jane)\s+Doe\b/i, 'the placeholder person John/Jane Doe'],
];

/** Image sources that are admissions rather than photographs. */
const PLACEHOLDER_IMAGE = [
  [/via\.placeholder\.com|placehold\.(?:it|co)|placekitten|dummyimage\.com/i, 'a grey placeholder image service'],
  [/\bplaceholder\.(?:png|jpe?g|gif|svg|webp)\b/i, 'a file literally named "placeholder"'],
];

/** Markers that a component framework owns the page's behaviour. */
const FRAMEWORK_RUNTIME = /\breact(?:-dom)?\b|\bReactDOM\b|\bcreateRoot\b|\bVue\.createApp\b|\bnew Vue\b|\bng-app\b|\bsvelte\b|\balpine(?:js)?\b|\bx-data=/i;

function scriptsIn(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) out.push(match[2] || '');
  return out;
}

/** The page's visible prose, with code and styling removed. */
function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function attr(tagSource, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tagSource);
  if (!match) return null;
  return match[2] ?? match[3] ?? match[4] ?? '';
}

/** A short, quotable identity for a control, for a message a person will read. */
function labelFor(html, index, tag, tagSource) {
  const aria = attr(tagSource, 'aria-label');
  if (aria) return aria.trim().slice(0, 60);
  const value = attr(tagSource, 'value');
  if (value && tag === 'input') return value.trim().slice(0, 60);
  const closing = html.indexOf(`</${tag}`, index);
  if (closing > index) {
    const inner = visibleText(html.slice(index, closing)).replace(/\s+/g, ' ').trim();
    if (inner) return inner.slice(0, 60);
  }
  const id = attr(tagSource, 'id');
  return id ? `#${id}` : `<${tag}>`;
}

/**
 * Does the page's code reach for this element — by id, by class, or by a data
 * attribute? Any of those means something is holding it, whatever it then does.
 */
function namedInCode(tagSource, code) {
  const id = attr(tagSource, 'id');
  if (id && code.includes(id)) return true;
  const classes = (attr(tagSource, 'class') || '').split(/\s+/).filter(Boolean);
  if (classes.some((name) => code.includes(name))) return true;
  return [...tagSource.matchAll(/\bdata-([\w-]+)/gi)].some((m) => code.includes(m[1]));
}

/**
 * Does the page attach behaviour BROADLY — a delegated document listener, or a
 * querySelectorAll over every control? If so, any given control may well be
 * wired by code this cannot trace, and the honest move is to check nothing.
 */
function hasBroadWiring(scripts) {
  return scripts.some((source) => (
    /(?:document|window|document\.body)\s*\.\s*addEventListener\s*\(\s*['"`]click/i.test(source)
    || /querySelectorAll\s*\(\s*['"`][^'"`]*\b(?:button|a|\[onclick\]|\.btn)\b/i.test(source)
    || /\$\s*\(\s*document\s*\)\s*\.\s*on\s*\(\s*['"`]click/i.test(source)
  ));
}

/**
 * Controls a person would click that are connected to nothing.
 *
 * The commonest failure in a generated page, and the one its owner is least
 * equipped to find: the page looks finished, and every button is a lie.
 */
export function findDeadControls(html, { scripts = null } = {}) {
  const source = String(html || '');
  const code = scripts || scriptsIn(source);

  // Two conditions under which this check refuses to run, both deliberate.
  if (FRAMEWORK_RUNTIME.test(source)) return { checked: false, reason: 'a component framework owns the wiring', findings: [] };
  if (hasBroadWiring(code)) return { checked: false, reason: 'the page wires controls through a delegated listener', findings: [] };

  const joined = code.join('\n');
  const findings = [];
  let match;
  CONTROL_TAGS.lastIndex = 0;
  while ((match = CONTROL_TAGS.exec(source))) {
    const [, rawTag, tagSource] = match;
    const tag = rawTag.toLowerCase();

    // <summary> is wired by the browser itself; <input> only matters when it
    // is a button. Anything else here is a link or a button.
    if (tag === 'summary') continue;
    const type = (attr(tagSource, 'type') || '').toLowerCase();
    if (tag === 'input' && !['submit', 'button', 'reset', 'image'].includes(type)) continue;

    // An inline handler is wiring, whatever else is true.
    if (/\son[a-z]+\s*=\s*["'][^"']*\S/i.test(tagSource)) continue;
    // A bare `disabled` carries no value, so attr() cannot see it. The lookahead
    // keeps `data-disabled` from counting, since \b matches after the hyphen.
    if (/(?:^|\s)(?:disabled|aria-disabled\s*=\s*["']?true)/i.test(tagSource)) continue;

    if (tag === 'a') {
      const href = attr(tagSource, 'href');
      // No href at all is a styled span, not a promise. A dead href is one.
      if (href === null) continue;
      if (!DEAD_HREF.test(href.trim())) continue;
    } else {
      // A submit control inside a form that goes somewhere is wired.
      if (['submit', 'image'].includes(type) || (tag === 'button' && ['submit', ''].includes(type))) {
        const formStart = source.lastIndexOf('<form', match.index);
        if (formStart !== -1) {
          const formTag = source.slice(formStart, source.indexOf('>', formStart) + 1);
          const closesBefore = source.lastIndexOf('</form>', match.index);
          /*
           * The FORM is what a submit button is wired to, so the form is what
           * has to be judged — and by the same standard as any other element.
           * Checking only for `action` and an inline `onsubmit` reported a
           * working task tracker as broken: its form was held by
           * getElementById + addEventListener('submit'), which is how a person
           * would actually write it.
           */
          if (closesBefore < formStart && (
            attr(formTag, 'action')
            || /\bonsubmit\s*=\s*["'][^"']*\S/i.test(formTag)
            || namedInCode(formTag, joined)
          )) continue;
        }
      }
    }

    // Named in a script? Then something reaches for it.
    if (namedInCode(tagSource, joined)) continue;

    const label = labelFor(source, match.index, tag, tagSource);
    findings.push({
      kind: 'dead-control',
      /*
       * Structured, for the same reason broken-link carries data: a repair pass
       * that regexes the English back out of `what` is parsing its own output,
       * and breaks the moment the wording improves. `at` and `length` locate
       * the exact occurrence, so two identical dead links are two findings the
       * repair can tell apart.
       */
      data: { tag, label, at: match.index, length: match[0].length },
      what: tag === 'a'
        ? `The link "${label}" doesn't go anywhere.`
        : `The button "${label}" doesn't do anything when clicked.`,
      where: match[0].slice(0, 120),
    });
  }
  return { checked: true, reason: null, findings };
}

/**
 * Links that point inside this build, at something that is not there.
 *
 * Only in-page anchors and same-build files are judged. A remote URL is left
 * alone: this module does not make network calls, and guessing about a host it
 * has not contacted is exactly the kind of confident wrongness it exists to
 * stop.
 */
export function findBrokenLinks(html, { files = [] } = {}) {
  const source = String(html || '');
  const ids = new Set([...source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
  [...source.matchAll(/<a\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi)].forEach((m) => ids.add(m[1]));
  const known = new Set(files.map((path) => String(path).replace(/^\.?\//, '')));

  const findings = [];
  for (const match of source.matchAll(/<a\b([^>]*)>/gi)) {
    const href = attr(match[1], 'href');
    if (href === null) continue;
    const target = href.trim();
    if (!target || DEAD_HREF.test(target)) continue;
    if (/^(?:https?:|mailto:|tel:|data:|blob:)/i.test(target)) continue;

    if (target.startsWith('#')) {
      /*
       * A malformed percent escape (`href="#%"`) makes decodeURIComponent
       * throw, and that URIError propagated out of inspectBuildTruth, through
       * proveCodingTurn, into the turn — so a fragment every browser navigates
       * happily could break a build. An annotation module that can throw is not
       * an annotation module. The raw fragment is the right fallback: it is
       * exactly what the id would have to match.
       */
      let anchor = target.slice(1);
      try { anchor = decodeURIComponent(anchor); } catch { /* keep the raw form */ }
      if (anchor && !ids.has(anchor)) {
        findings.push({
          kind: 'broken-link',
          // Structured, not just prose. A repair pass that has to regex the
          // English back out of a finding is parsing its own output, and it
          // breaks the moment the wording improves.
          data: { anchor },
          what: `"${target}" jumps to a section that isn't on the page.`,
          where: match[0].slice(0, 120),
        });
      }
      continue;
    }
    // A same-build file reference, but only judged when we know what shipped.
    if (known.size) {
      const path = target.split(/[?#]/)[0].replace(/^\.?\//, '');
      if (path && !known.has(path)) {
        findings.push({
          kind: 'broken-link',
          data: { file: path },
          what: `"${target}" points at a file that wasn't built.`,
          where: match[0].slice(0, 120),
        });
      }
    }
  }
  return { checked: true, reason: null, findings };
}

/**
 * Content the model invented to fill space.
 *
 * "Real output, honest gaps" is the product's promise, and filler breaks it
 * more quietly than a crash does: the page looks complete, so nobody looks
 * again. Every pattern here is a phrase or a host nobody ships deliberately.
 */
export function findFabricatedContent(html) {
  const source = String(html || '');
  const prose = visibleText(source);
  const findings = [];
  const seen = new Set();

  for (const [pattern, description] of PLACEHOLDER_TEXT) {
    if (pattern.test(prose) && !seen.has(description)) {
      seen.add(description);
      findings.push({
        kind: 'placeholder-content',
        what: `The page contains ${description}.`,
        where: (prose.match(pattern) || [''])[0].trim().slice(0, 80),
      });
    }
  }
  for (const match of source.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    for (const [pattern, description] of PLACEHOLDER_IMAGE) {
      if (!pattern.test(match[1]) || seen.has(description)) continue;
      seen.add(description);
      findings.push({
        kind: 'placeholder-content',
        what: `An image on the page is ${description}, not a real picture.`,
        where: match[1].slice(0, 100),
      });
    }
  }
  return { checked: true, reason: null, findings };
}


// --------------------------------------------------------------- numbers ---

/**
 * A currency amount, with or without a symbol, tolerant of both Western
 * (1,200,000) and Indian (12,00,000) grouping.
 *
 * The grouped branch requires at least one comma. With `*` it also matched a
 * bare "1200" — but only its first three digits, because alternation takes the
 * first branch that matches at all, not the longest. That read 1200 as 120 and
 * 1900 as 190, which turned a page whose arithmetic was correct into an
 * accusation. Silently wrong parsing is worse than no check.
 */
const MONEY = /(-|\u2212)?\s*(?:[$£€₹¥]|\bRs\.?|\bINR\b|\bUSD\b)?\s*(-|\u2212)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)/;

/** Row labels that promise the sum of everything above them. */
const TOTAL_LABEL = /\b(?:grand\s+)?total\b|\bsum\b|\bamount\s+due\b|\bbalance\s+due\b/i;

/** Labels for lines that legitimately are NOT part of a plain sum. */
const ADJUSTMENT_LABEL = /\b(?:tax|vat|gst|shipping|delivery|discount|coupon|fee|handling|tip|subtotal)\b/i;

function toNumber(text) {
  const match = MONEY.exec(String(text || '').trim());
  if (!match) return null;
  const value = Number(match[3].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  /*
   * The sign is part of the number. Without it a refund row of -$20 read as
   * +20, so a page whose total of 80 was correct got accused of adding to 120 —
   * a false accusation aimed at somebody who cannot check the working. The sign
   * may sit on either side of the currency symbol (-$20 and $-20 both occur).
   */
  return (match[1] || match[2]) ? -value : value;
}

/**
 * A row's cells, each remembering whether it was a header.
 *
 * Dropping that distinction made a numeric `<th>` — a year like 2025 heading a
 * column of figures — count as one of the amounts. A perfectly correct
 * financial table with a 2025 header and rows of 100 and 200 was reported as
 * adding up to 2,325. Year-headed tables are among the commonest things anybody
 * builds, so this was a false accusation waiting on a very ordinary page.
 */
function cellsOf(rowHtml) {
  return [...rowHtml.matchAll(/<(t[dh])\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map((m) => ({
      header: m[1].toLowerCase() === 'th',
      text: visibleText(m[2]).replace(/\s+/g, ' ').trim(),
    }));
}

/** The plain text of a row, for label matching. */
const textsOf = (cells) => cells.map((cell) => cell.text);

/**
 * A stated total that is not the sum of the rows above it.
 *
 * Narrow on purpose. It only reads a table that carries a labelled total row,
 * only when every other row contributes exactly one number in that column, and
 * it stands down the moment the structure is ambiguous or any row is a tax, a
 * discount, or shipping — the things that make a total legitimately differ from
 * a plain sum. The alternative is arithmetic pedantry aimed at someone who
 * cannot check the working, which is worse than saying nothing.
 */
export function findNumbersThatDisagree(html) {
  const source = String(html || '');
  const findings = [];

  for (const table of source.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => cellsOf(m[0]));
    if (rows.length < 3) continue;

    const totalIndex = rows.findIndex((cells) =>
      textsOf(cells).some((text) => TOTAL_LABEL.test(text) && !/\bsubtotal\b/i.test(text)));
    if (totalIndex < 1) continue;

    const totalRow = rows[totalIndex];
    const totalTexts = textsOf(totalRow);
    const stated = totalTexts.map(toNumber).filter((n) => n !== null).pop();
    if (stated === null || stated === undefined) continue;

    // Which column holds the money? The last one carrying a number in the
    // total row, and it has to be a real column in the item rows too.
    const column = totalTexts.length - 1 - [...totalTexts].reverse().findIndex((text) => toNumber(text) !== null);

    const items = [];
    let ambiguous = false;
    for (let i = 0; i < totalIndex; i += 1) {
      const cells = rows[i];
      if (textsOf(cells).some((text) => ADJUSTMENT_LABEL.test(text))) { ambiguous = true; break; }
      const cell = cells[column];
      // A header cell is a label, never an amount — even when it reads 2025.
      if (!cell || cell.header) continue;
      const value = toNumber(cell.text);
      if (value === null) continue;               // a label row, or an empty cell
      items.push(value);
    }
    // Fewer than two contributing rows is not a sum worth checking, and a
    // header-only table is not a claim about arithmetic.
    if (ambiguous || items.length < 2) continue;

    const sum = items.reduce((a, b) => a + b, 0);
    // Two decimal places of tolerance: a page that rounds each line is not lying.
    if (Math.abs(sum - stated) < 0.011) continue;

    const correct = Number(sum.toFixed(2));
    // `printed` is the total EXACTLY as it appears in the document, grouping
    // and all. The formatted figures below are for a person to read; a repair
    // needs the literal string it has to replace, and the two differ the
    // moment a page writes 1900 and the report says 1,900.
    const printed = (MONEY.exec(totalTexts[column] || '') || [])[3] || String(stated);
    findings.push({
      kind: 'numbers-disagree',
      data: { stated, correct, printed },
      what: `The total says ${stated.toLocaleString()} but the ${items.length} amounts above it add up to ${correct.toLocaleString()}.`,
      where: totalTexts.join(' | ').slice(0, 120),
    });
  }
  return { checked: true, reason: null, findings };
}

/**
 * Everything above, over one build.
 *
 * `skipped` is reported alongside the findings and is not a footnote: a check
 * that stood down has proven nothing, and a report that quietly omits that is
 * claiming more than it knows.
 */
export function inspectBuildTruth(html, { files = [] } = {}) {
  const source = String(html || '');
  const scripts = scriptsIn(source);
  const results = {
    controls: findDeadControls(source, { scripts }),
    links: findBrokenLinks(source, { files }),
    content: findFabricatedContent(source),
    numbers: findNumbersThatDisagree(source),
  };

  const findings = [];
  const skipped = [];
  for (const [name, result] of Object.entries(results)) {
    if (!result.checked) skipped.push({ check: name, reason: result.reason });
    else findings.push(...result.findings);
  }
  return { findings, skipped, checked: Object.keys(results).length - skipped.length };
}

/**
 * The report a person reads. Plain sentences about their page, never a score
 * and never a verdict — this module observes, it does not sentence.
 */
export function describeBuildTruth({ findings = [], skipped = [] } = {}) {
  if (!findings.length) return '';
  const lines = findings.slice(0, 8).map((finding) => `- ${finding.what}`);
  if (findings.length > 8) lines.push(`- …and ${findings.length - 8} more like these.`);
  const header = findings.length === 1
    ? "One thing on this page doesn't work yet:"
    : `${findings.length} things on this page don't work yet:`;
  const tail = skipped.length
    ? `\n\nNot everything could be checked — ${skipped.map((s) => s.reason).join('; ')}.`
    : '';
  return `${header}\n${lines.join('\n')}${tail}`;
}
