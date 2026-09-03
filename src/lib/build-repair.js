/**
 * Build Repair — fix what has exactly one right answer, refuse the rest.
 *
 * WHY THIS EXISTS
 *
 * Phase 01 made the platform able to say what is wrong with a page. Saying so
 * and stopping is only half a product: the person reading it still cannot fix
 * a dead anchor, because fixing one means editing HTML, and not being able to
 * edit HTML is why they are here.
 *
 * THE LINE THIS MODULE DOES NOT CROSS
 *
 * A repair is allowed only where the correct output is DERIVABLE from what is
 * already on the page. Not guessable — derivable. A total is the sum of its
 * rows and there is exactly one such number. An anchor that misses `#pricing`
 * when the page contains `id="pricing-section"` has one plausible target and no
 * second candidate.
 *
 * Everything else is refused, on purpose, and the refusals are the more
 * important half:
 *
 *   A dead "Buy now" button cannot be wired, because nothing on the page says
 *   what buying means here. Inventing a handler would produce a button that
 *   looks fixed and still does not work, which is worse than the honest
 *   version.
 *
 *   Lorem ipsum cannot be replaced, because replacing it means writing copy
 *   nobody asked for about a business we know nothing about. A grey
 *   placeholder cannot be swapped for a photograph. "NEVER fabricate products
 *   or inject stock photos" is not a style preference here; it is the
 *   difference between a tool and a liar.
 *
 * So this returns three things and the caller must surface all three: what was
 * fixed, what was left alone, and why. A repair pass that quietly does less
 * than it claims is the same defect as a proof gate that quietly claimed more.
 */

/**
 * Normalise an anchor or id for comparison: lowercase, and punctuation reduced
 * to single hyphens, so `pricing`, `Pricing`, `pricing-section` and `our_pricing`
 * become comparable without becoming interchangeable.
 */
/** A literal string, safe to drop into a RegExp. */
function escapeForRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Kept as one string because two paths now reach it: the file link that names
 * nothing this build shipped, and the one whose basename is ambiguous. A person
 * reading the account should not be able to tell which branch produced it.
 */
export const MISSING_FILE_REFUSAL = 'it points at a file, and creating a page nobody asked for is not a repair';

/**
 * A template placeholder is refused for a DIFFERENT reason than a missing file,
 * and saying so is the whole point.
 *
 * `<img src="${item.image}">` used to be classified as a broken file link and
 * refused with MISSING_FILE_REFUSAL, which sent the reader hunting for an asset
 * that never existed. There is no file here. The defect is in the code that
 * built the markup - quotes where backticks belong - and the built HTML is its
 * symptom, not its location.
 *
 * It stays REFUSED rather than repaired, deliberately. Rewriting it would mean
 * inferring the source expression from the output and guessing at the enclosing
 * string's delimiters - exactly the guess this module refuses everywhere else
 * ("style.css" against "styles.css" is the same shape of temptation). What
 * changes is that the account is now true, and specific enough that the retry
 * brief can name the real defect to the model, which is where the actual repair
 * happens.
 */
export const UNINTERPOLATED_TEMPLATE_REFUSAL = 'the placeholder was never interpolated, so the fix belongs in the code that builds this markup, not in the markup';

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * The one id on the page that a broken anchor obviously meant, or null.
 *
 * "Obviously" is doing real work: a single candidate is a correction, two
 * candidates is a guess, and a guess is what this module exists not to make.
 * The match must also be a containment of whole hyphen-separated words, so
 * `#price` does not silently retarget to `id="enterprise-pricing"`.
 */
export function resolveAnchor(target, ids) {
  const wanted = slug(target);
  if (!wanted) return null;
  const words = wanted.split('-').filter(Boolean);

  const exact = ids.filter((id) => slug(id) === wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const near = ids.filter((id) => {
    const parts = slug(id).split('-').filter(Boolean);
    return words.every((word) => parts.includes(word));
  });
  return near.length === 1 ? near[0] : null;
}

/**
 * Point broken in-page anchors at the section they plainly meant.
 *
 * Only ever RETARGETS an existing link. It never invents the missing section,
 * because a heading nobody wrote is content nobody asked for.
 */
export function repairAnchors(html, findings) {
  const source = String(html || '');
  const ids = [...source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const fixes = [];
  const refusals = [];
  let out = source;

  for (const finding of findings) {
    if (finding.kind !== 'broken-link') continue;
    // A file reference is repairFileLinks' to judge. Refusing it here too would
    // report one mistake as two.
    const target = finding.data?.anchor;
    if (!target) continue;
    const resolved = resolveAnchor(target, ids);
    if (!resolved) {
      refusals.push({
        finding,
        why: ids.some((id) => slug(id).includes(slug(target)))
          ? 'more than one section could have been meant, and picking one would be a guess'
          : 'no section on the page matches it',
      });
      continue;
    }
    /*
     * One global pass, not a hand-rolled scan.
     *
     * The first version walked matches with a manual loop and reset lastIndex
     * inside it, which spins forever the moment a replacement does not change
     * what the pattern matches. Every anchor carrying this exact href is the
     * same link and gets the same correction, so a single replace is both
     * simpler and incapable of hanging a turn.
     */
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(<a\\b[^>]*\\bhref\\s*=\\s*["'])#${escaped}(["'])`, 'gi');
    const before = out;
    out = out.replace(re, (_all, lead, quote) => `${lead}#${resolved}${quote}`);
    const changed = out !== before;
    if (changed) fixes.push({ finding, what: `Pointed "#${target}" at the "${resolved}" section, which is what it meant.` });
  }
  return { html: out, fixes, refusals };
}

/**
 * Nothing here is repairable, and saying so plainly is the point.
 *
 * Both refusals below are the product's promise showing up where it costs
 * something. A button that looks wired and is not, or invented copy about a
 * business we know nothing about, would each read as success and be worse than
 * the honest report.
 */
export const DEAD_CONTROL_REFUSAL = 'nothing on the page says what it should do, and a button that looks wired but is not would be worse than one that plainly is not';

export function refuseUnfixable(findings) {
  const why = {
    'placeholder-content': 'replacing it means writing copy or choosing a photo nobody asked for, and this platform does not invent either',
  };
  return findings
    .filter((finding) => why[finding.kind])
    .map((finding) => ({ finding, why: why[finding.kind] }));
}

/**
 * Point a link at the file of that name the build actually shipped.
 *
 * The blanket refusal — "creating a page nobody asked for is not a repair" —
 * is right about a link to a page that does not exist, and stays. It was also
 * catching a different case: <link href="assets/styles.css"> in a build whose
 * one stylesheet is styles.css. Nothing is missing there; the path is wrong,
 * and the file it means is sitting in the same build.
 *
 * The rule is deliberately narrow: the referenced BASENAME must match exactly
 * one shipped file. A wrong directory is derivable. A near-miss on the name
 * itself is not — "style.css" against "styles.css" is a typo somebody may have
 * meant either way, and picking one is the guess this module refuses to make.
 */
export function repairFileLinks(html, findings, files = []) {
  const source = String(html || '');
  const shipped = (files || []).map(String);
  const basename = (value) => String(value || '').split(/[\\/]/).pop().toLowerCase();
  const fixes = [];
  const refusals = [];
  let out = source;

  for (const finding of findings) {
    /*
     * Reported here rather than skipped. A finding that no stage claims is a
     * finding the user never sees, which would trade a wrong explanation for no
     * explanation - the quieter half of the same defect.
     */
    if (finding.kind === 'uninterpolated-template') {
      refusals.push({ finding, why: UNINTERPOLATED_TEMPLATE_REFUSAL });
      continue;
    }
    if (finding.kind !== 'broken-link') continue;
    const { file, target } = finding.data || {};
    if (!file || !target) continue;

    const wanted = basename(file);
    const matches = wanted ? shipped.filter((path) => basename(path) === wanted) : [];
    if (matches.length !== 1) {
      refusals.push({ finding, why: MISSING_FILE_REFUSAL });
      continue;
    }
    const resolved = matches[0];
    if (resolved === target) {
      refusals.push({ finding, why: MISSING_FILE_REFUSAL });
      continue;
    }
    /*
     * Every reference carrying this exact href moves together, which is what
     * repairAnchors already does for a shared broken anchor: they are the same
     * mistake written twice, not two decisions.
     */
    const before = out;
    out = out.replace(
      new RegExp(`(\\s(?:href|src)\\s*=\\s*["'])${escapeForRegExp(target)}(["'])`, 'gi'),
      `$1${resolved}$2`,
    );
    if (out === before) {
      refusals.push({ finding, why: MISSING_FILE_REFUSAL });
      continue;
    }
    fixes.push({ finding, what: `Pointed "${target}" at "${resolved}", the file of that name this build shipped.` });
  }

  return { html: out, fixes, refusals };
}

/**
 * Point a dead nav link at the section it plainly names.
 *
 * WHY THIS IS REPAIRABLE AND THE REST OF dead-control IS NOT
 *
 * The blanket refusal said "nothing on the page says what it should do". For a
 * "Buy now" button with no handler that is true, and it stays refused — a cart
 * is not derivable from a build.
 *
 * But a landing page whose nav reads <a href="#">Pricing</a> above a real
 * <section id="pricing"> is a different case entirely: the page says exactly
 * what the link should do, twice, in its own markup. The label names the
 * destination and the destination already exists. Nothing is invented — the
 * link is connected to something the build already shipped, which is the same
 * move repairAnchors makes, resolved from the label instead of the href.
 *
 * Buttons are never touched, only <a>. A button's behaviour lives in code
 * nobody wrote, and there is no honest way to derive it from a label.
 *
 * Occurrences are rewritten back-to-front so an earlier fix cannot shift the
 * offsets of a later one, and two identical dead links stay two separate
 * repairs rather than one applied twice.
 */
export function repairDeadLinks(html, findings) {
  const source = String(html || '');
  const ids = [...source.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const fixes = [];
  const refusals = [];
  const edits = [];

  for (const finding of findings) {
    if (finding.kind !== 'dead-control') continue;
    const { tag, label, at, length } = finding.data || {};
    if (tag !== 'a' || typeof at !== 'number' || typeof length !== 'number') {
      refusals.push({ finding, why: DEAD_CONTROL_REFUSAL });
      continue;
    }
    const resolved = resolveAnchor(label, ids);
    if (!resolved) {
      // Ambiguity is refused exactly as it is for anchors: two candidates is a
      // guess, and a guess on somebody's page is what this module exists to stop.
      refusals.push({ finding, why: DEAD_CONTROL_REFUSAL });
      continue;
    }
    const tagSource = source.slice(at, at + length);
    const rewritten = /\shref\s*=\s*["'][^"']*["']/i.test(tagSource)
      ? tagSource.replace(/\shref\s*=\s*["'][^"']*["']/i, ` href="#${resolved}"`)
      : tagSource.replace(/^<a/i, `<a href="#${resolved}"`);
    if (rewritten === tagSource) {
      refusals.push({ finding, why: DEAD_CONTROL_REFUSAL });
      continue;
    }
    edits.push({ at, length, rewritten });
    fixes.push({ finding, what: `Pointed the "${label}" link at the "${resolved}" section, which is what it named.` });
  }

  let out = source;
  for (const edit of edits.sort((a, b) => b.at - a.at)) {
    out = out.slice(0, edit.at) + edit.rewritten + out.slice(edit.at + edit.length);
  }
  return { html: out, fixes, refusals };
}

/**
 * Make a stated total equal the rows it claims to sum.
 *
 * The arithmetic has exactly one right answer, which is what makes this
 * repairable at all. The finding already carries both figures — it was computed
 * against the same table — so the fix rewrites the printed total and nothing
 * else, preserving the currency symbol and grouping around it.
 */
export function repairTotals(html, findings) {
  const source = String(html || '');
  const fixes = [];
  const refusals = [];
  let out = source;

  for (const finding of findings) {
    if (finding.kind !== 'numbers-disagree') continue;
    const { printed, correct } = finding.data || {};
    if (!printed || typeof correct !== 'number') {
      refusals.push({ finding, why: 'the figures behind it were not recorded, so there is nothing safe to rewrite' });
      continue;
    }
    /*
     * Rewrite the total EXACTLY as it was printed, and only inside the row the
     * finding came from — an identical number elsewhere on the page is somebody
     * else's number. Matching the printed form rather than a formatted one
     * matters: the report says 1,900 where the document says 1900.
     */
    const grouped = /,/.test(printed);
    const nextText = grouped ? correct.toLocaleString('en-US') : String(correct);
    const rowIndex = out.indexOf(finding.where.split(' | ')[0]);
    const scope = rowIndex === -1 ? out : out.slice(rowIndex);
    const replaced = scope.replace(printed, nextText);
    if (replaced === scope) {
      refusals.push({ finding, why: 'the printed total could not be located to rewrite' });
      continue;
    }
    out = rowIndex === -1 ? replaced : out.slice(0, rowIndex) + replaced;
    fixes.push({ finding, what: `Corrected the total from ${printed} to ${nextText}, which is what the rows add up to.` });
  }
  return { html: out, fixes, refusals };
}

/**
 * One repair pass over one page.
 *
 * Returns the possibly-rewritten HTML plus a full account of both halves. The
 * caller must show both: a pass that reports its fixes and hides its refusals
 * is claiming to have finished, which is the failure this whole line of work
 * exists to stop.
 */
export function repairBuild(html, findings = [], { files = [] } = {}) {
  /*
   * ORDER MATTERS, and only for one reason.
   *
   * repairDeadLinks is the single pass that addresses the document by OFFSET —
   * a dead-control finding carries `at` and `length` measured against the
   * source as inspected. Every other pass matches on strings or on the finding
   * itself, so their results do not depend on running order.
   *
   * That makes the offset pass go first, on the pristine html. An earlier
   * version ran it third, on the reasoning that the passes before it rewrite
   * hrefs "in place" — which is false: "#faq" becoming "#faq-section" is four
   * characters longer, and every offset after it in the document shifts. The
   * order below is the fix, not a preference.
   */
  const deadLinks = repairDeadLinks(html, findings);
  const anchors = repairAnchors(deadLinks.html, findings);
  const fileLinks = repairFileLinks(anchors.html, findings, files);
  const totals = repairTotals(fileLinks.html, findings);
  return {
    html: totals.html,
    changed: totals.html !== String(html || ''),
    fixes: [...anchors.fixes, ...fileLinks.fixes, ...deadLinks.fixes, ...totals.fixes],
    refusals: [
      ...anchors.refusals,
      ...fileLinks.refusals,
      ...deadLinks.refusals,
      ...totals.refusals,
      ...refuseUnfixable(findings),
    ],
  };
}

/**
 * The account a person reads: what changed, then what did not and why.
 *
 * Refusals are never omitted for brevity. Somebody who is told two things were
 * fixed and not told three were left will believe their page is finished.
 */
export function describeRepair({ fixes = [], refusals = [] } = {}) {
  const sections = [];
  if (fixes.length) {
    sections.push([
      fixes.length === 1 ? 'I fixed one thing:' : `I fixed ${fixes.length} things:`,
      ...fixes.map((fix) => `- ${fix.what}`),
    ].join('\n'));
  }
  if (refusals.length) {
    sections.push([
      fixes.length
        ? (refusals.length === 1 ? 'One thing I left alone:' : `${refusals.length} things I left alone:`)
        : (refusals.length === 1 ? "One thing I can't fix for you:" : `${refusals.length} things I can't fix for you:`),
      ...refusals.map((refusal) => `- ${refusal.finding.what} I didn't change it because ${refusal.why}.`),
    ].join('\n'));
  }
  return sections.join('\n\n');
}
