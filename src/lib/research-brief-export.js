/**
 * The dossier as a file of record. Pure: takes the derived brief and any
 * verification standings the analyst ran, composes a markdown document, and
 * invents nothing along the way — a finding that was never verified exports
 * saying so, and a standing's wording matches the board's contract
 * ("verified" means the quote was found in the source, not that the claim
 * is true).
 *
 * Deterministic by design: no model touches the export, so what the board
 * showed is exactly what the file says.
 */

const FOOTNOTE = 'Verified means the quoted passage was found verbatim in the cited source at check time; it does not by itself prove the claim. Unverified items are labeled, not hidden.';

function standingLine(standing) {
  if (!standing) return null;
  if (standing.standing === 'supported') {
    return { label: 'Verified — supporting quote found in source', quotes: [{ prefix: '', excerpt: standing.excerpt, sourceUrl: standing.sourceUrl }] };
  }
  if (standing.standing === 'contested') {
    const quotes = [];
    if (standing.excerpt) {
      quotes.push({ prefix: standing.counter ? 'Supports: ' : '', excerpt: standing.excerpt, sourceUrl: standing.sourceUrl });
    }
    if (standing.counter) {
      quotes.push({ prefix: 'Disagrees: ', excerpt: standing.counter.excerpt, sourceUrl: standing.counter.sourceUrl });
    }
    return {
      label: standing.reasonCode === 'sources_disagree'
        ? 'Contested — verified sources disagree'
        : 'Contested — a cited source disagrees',
      quotes,
    };
  }
  return { label: `Unverified (${standing.reasonCode || 'unchecked'})`, quotes: [] };
}

/**
 * @param {{ brief: object, standings?: object, generatedAt?: Date }} input
 * @returns {string} markdown document, or '' when there is nothing worth exporting
 */
export function composeResearchBriefMarkdown({ brief, standings = {}, generatedAt = new Date() } = {}) {
  if (!brief?.active) return '';
  if (!(brief.findings?.length > 0) && !(brief.sources?.length > 0)) return '';

  const lines = [];
  lines.push(`# Research brief — ${brief.question}`);
  lines.push('');
  lines.push(`_Compiled ${generatedAt.toISOString().slice(0, 10)} by the Quantora Research desk._`);

  if (brief.plan?.length > 0) {
    lines.push('');
    lines.push('## The question, decomposed');
    lines.push('');
    for (const item of brief.plan) {
      lines.push(`- [${item.explored ? 'x' : ' '}] ${item.text}`);
    }
  }

  if (brief.findings?.length > 0) {
    lines.push('');
    lines.push('## Findings');
    for (const finding of brief.findings) {
      lines.push('');
      lines.push(`- **${finding.text}**`);
      const standing = standingLine(standings[finding.text]);
      if (standing) {
        lines.push(`  - ${standing.label}`);
        for (const quote of standing.quotes) {
          lines.push(`  - ${quote.prefix}“${quote.excerpt}”${quote.sourceUrl ? ` ([source](${quote.sourceUrl}))` : ''}`);
        }
      } else {
        lines.push(`  - Cited to that reply's ${finding.sourceCount} live source${finding.sourceCount === 1 ? '' : 's'} (not verified per claim)`);
      }
    }
  }

  if (brief.sources?.length > 0) {
    lines.push('');
    lines.push('## Source ledger');
    lines.push('');
    brief.sources.forEach((source, index) => {
      const name = source.host || source.title || source.uri;
      const detail = source.title && source.title !== name ? ` — ${source.title}` : '';
      lines.push(`${index + 1}. [${name}](${source.uri})${detail}`);
    });
  }

  lines.push('');
  lines.push('---');
  lines.push(`_${FOOTNOTE}_`);
  lines.push('');
  return lines.join('\n');
}

/** A stable, filesystem-safe name for the exported brief. */
export function researchBriefFileName(question, generatedAt = new Date()) {
  const slug = String(question || 'research-brief')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'research-brief';
  return `${slug}-${generatedAt.toISOString().slice(0, 10)}.md`;
}
