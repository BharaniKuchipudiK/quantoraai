/**
 * Research desk board state. Pure and testable — decides whether the dossier
 * board shows, what the investigation already holds, and how honest its
 * evidence standing is.
 *
 * The board reads the conversation itself, exactly like the travel board: the
 * server appends a numbered `**Sources**` block to every grounded reply, so
 * the transcript already carries the evidence trail. This module turns that
 * trail into a ledger without inventing precision it does not have:
 *
 * - A source row exists only because a grounded reply actually listed it.
 * - A finding row exists only when it came out of a reply that carried live
 *   sources, and it is attributed at TURN level ("backed by this reply's
 *   sources"), never per-sentence — per-claim excerpt binding is the
 *   verification runtime's job, not a regex's.
 * - Replies with no sources are counted, visibly, as unverified. A missing
 *   source block is a fact about the answer, not a rendering gap to paper
 *   over.
 */

const SOURCE_LINE = /^\s*\d+\.\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*$/;
const SOURCES_HEADING = /^\s*(?:-{3,}\s*)?\*\*Sources\*\*\s*$/;
/** Prompts the board's own chips send; they steer the desk, they are not the question. */
const BOARD_PROMPT = /\bthis board\b/i;
const MAX_SOURCES = 24;
const MAX_FINDINGS = 8;
const MAX_FINDINGS_PER_TURN = 3;
const MIN_FINDING_LENGTH = 30;
const MAX_FINDING_LENGTH = 240;
const MIN_QUESTION_LENGTH = 12;
const MAX_QUESTION_LENGTH = 140;

/**
 * Gemini grounding hands back redirect URLs whose hostname says nothing
 * ("vertexaisearch.cloud.google.com") while the title carries the real
 * publisher domain. Showing the redirect host would credit Google with every
 * fact on the board.
 */
const REDIRECT_HOSTS = new Set(['vertexaisearch.cloud.google.com']);
const DOMAIN_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

function hostFor(uri, title) {
  let host = '';
  try {
    host = new URL(uri).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }
  if ((!host || REDIRECT_HOSTS.has(host)) && DOMAIN_LIKE.test(String(title || '').trim())) {
    return String(title).trim().toLowerCase();
  }
  return host;
}

/**
 * Split an AI reply into its prose and its appended source list. Only the
 * exact shape the server emits counts — a numbered markdown-link list under a
 * `**Sources**` heading. A reply that merely mentions the word "sources" or
 * pastes a bare URL earns nothing here.
 */
export function parseSourcesBlock(text) {
  const lines = String(text || '').split('\n');
  const headingAt = lines.findIndex((line) => SOURCES_HEADING.test(line));
  if (headingAt === -1) return { body: String(text || ''), sources: [] };

  const sources = [];
  let end = headingAt + 1;
  for (let index = headingAt + 1; index < lines.length; index += 1) {
    const match = lines[index].match(SOURCE_LINE);
    if (match) {
      sources.push({ title: match[1].trim(), uri: match[2] });
      end = index + 1;
      continue;
    }
    if (lines[index].trim() === '') { end = index + 1; continue; }
    break;
  }
  if (sources.length === 0) return { body: String(text || ''), sources: [] };

  // The heading's preceding `---` rule belongs to the block, not the prose.
  let start = headingAt;
  while (start > 0 && /^\s*(-{3,})?\s*$/.test(lines[start - 1])) start -= 1;
  const body = [...lines.slice(0, start), ...lines.slice(end)].join('\n');
  return { body, sources };
}

function stripMarkdown(line) {
  return line
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')
    .trim();
}

/**
 * Key statements of a grounded reply: its top-level bullets. Bullets are how
 * the analyst directive asks findings to be stated, and they are the only
 * extraction a regex can do without guessing sentence boundaries inside prose.
 */
function extractFindings(body) {
  const findings = [];
  for (const line of String(body || '').split('\n')) {
    if (!/^\s{0,3}(?:[-*+]|\d+\.)\s+/.test(line)) continue;
    const text = stripMarkdown(line);
    if (text.length < MIN_FINDING_LENGTH || text.length > MAX_FINDING_LENGTH) continue;
    if (text.endsWith('?')) continue; // a question is an open item, not a finding
    findings.push(text);
    if (findings.length >= MAX_FINDINGS_PER_TURN) break;
  }
  return findings;
}

function clampQuestion(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_QUESTION_LENGTH) return clean;
  const cut = clean.slice(0, MAX_QUESTION_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > MAX_QUESTION_LENGTH - 30 ? lastSpace : MAX_QUESTION_LENGTH)}…`;
}

/**
 * The dossier, derived from the transcript alone.
 *
 * @param {{ messages?: Array<{ sender?: string, text?: string }> }} input
 */
export function deriveResearchBrief({ messages } = {}) {
  const list = Array.isArray(messages) ? messages : [];

  let question = '';
  const sourcesByUri = new Map();
  const findings = [];
  let groundedTurns = 0;
  let ungroundedTurns = 0;
  let sawUser = false;

  list.forEach((message, index) => {
    const text = typeof message?.text === 'string' ? message.text : '';
    if (message?.sender === 'user') {
      const clean = text.trim();
      if (clean.length >= MIN_QUESTION_LENGTH && !BOARD_PROMPT.test(clean)) {
        question = clampQuestion(clean);
      }
      if (clean) sawUser = true;
      return;
    }
    if (message?.sender !== 'ai' || !sawUser) return;

    const { body, sources } = parseSourcesBlock(text);
    if (sources.length === 0) {
      ungroundedTurns += 1;
      return;
    }
    groundedTurns += 1;
    for (const source of sources) {
      const existing = sourcesByUri.get(source.uri);
      if (existing) {
        existing.citedInTurns += 1;
      } else if (sourcesByUri.size < MAX_SOURCES) {
        sourcesByUri.set(source.uri, {
          uri: source.uri,
          title: source.title,
          host: hostFor(source.uri, source.title),
          citedInTurns: 1,
        });
      }
    }
    for (const finding of extractFindings(body)) {
      findings.push({ text: finding, sourceCount: sources.length, turnIndex: index });
    }
  });

  // Most recent findings lead — the dossier's working edge — deduped so a
  // restated conclusion does not pad the board.
  const seen = new Set();
  const recentFirst = [];
  for (let index = findings.length - 1; index >= 0; index -= 1) {
    const key = findings[index].text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recentFirst.push(findings[index]);
    if (recentFirst.length >= MAX_FINDINGS) break;
  }

  const sources = [...sourcesByUri.values()];
  const active = Boolean(question);

  /*
   * One next move, only when the evidence itself argues for it. "Keep going"
   * is not a next move; those rows stay off the board.
   */
  let next = '';
  if (active && ungroundedTurns > 0 && groundedTurns === 0) {
    next = 'Nothing here is backed by live sources yet — the standing below is honest, not decorative.';
  } else if (active && sources.length > 0) {
    const hosts = new Set(sources.map((source) => source.host).filter(Boolean));
    if (hosts.size === 1) {
      next = `Every source so far is ${[...hosts][0]} — worth cross-checking before this hardens into a conclusion.`;
    }
  }

  return {
    active,
    question,
    sources,
    findings: recentFirst,
    groundedTurns,
    ungroundedTurns,
    next,
  };
}
