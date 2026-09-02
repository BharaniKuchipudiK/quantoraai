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
 * - A source row exists only because a grounded reply actually listed it, and
 *   "grounded" now means the SERVER said so. The block carries a marker the
 *   server writes and the model never sees (shared/research/grounding-marker.js);
 *   a block without it is the model's own prose, however well formed, and earns
 *   nothing. Before that marker existed, a model that typed six lines of
 *   markdown promoted its own unverified turn to "backed by live sources" and
 *   put two invented URLs on the board as evidence.
 * - A finding row exists only when it came out of a reply that carried live
 *   sources, and it is attributed at TURN level ("backed by this reply's
 *   sources"), never per-sentence — per-claim excerpt binding is the
 *   verification runtime's job, not a regex's.
 * - Replies with no sources are counted, visibly, as unverified. A missing
 *   source block is a fact about the answer, not a rendering gap to paper
 *   over.
 */

import { RESEARCH_BOARD_STEERING } from './research-board-actions.js';
import { GROUNDING_MARKER_LINE } from '../../shared/research/grounding-marker.js';

const SOURCE_LINE = /^\s*\d+\.\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*$/;
const SOURCES_HEADING = /^\s*(?:-{3,}\s*)?\*\*Sources\*\*\s*$/;
const PLAN_HEADING = /^\s*\*\*Plan\*\*\s*$/;
const MAX_PLAN_ITEMS = 5;
const MIN_PLAN_ITEM_LENGTH = 12;
const MAX_PLAN_ITEM_LENGTH = 200;
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
  if (headingAt === -1) return { body: String(text || ''), sources: [], grounded: false };

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
  if (sources.length === 0) return { body: String(text || ''), sources: [], grounded: false };

  /*
   * Walk back over what belongs to the block rather than the prose: the
   * heading's preceding `---` rule, blank lines, and the server's grounding
   * marker. The marker must sit in THIS run — immediately above the heading,
   * separated only by rule and whitespace — so its presence anywhere else in a
   * reply proves nothing.
   */
  let start = headingAt;
  let grounded = false;
  while (start > 0) {
    const above = lines[start - 1];
    if (GROUNDING_MARKER_LINE.test(above)) { grounded = true; start -= 1; continue; }
    if (/^\s*(-{3,})?\s*$/.test(above)) { start -= 1; continue; }
    break;
  }
  const body = [...lines.slice(0, start), ...lines.slice(end)].join('\n');
  return { body, sources, grounded };
}

/**
 * The analyst's decomposition of a broad question: a `**Plan**` heading
 * followed by sub-questions as bullets, each a complete standalone question.
 * Only that exact shape counts, and only complete questions survive — a plan
 * bullet that is not a question is a heading pretending to be work.
 */
export function parsePlanBlock(text) {
  const lines = String(text || '').split('\n');
  const headingAt = lines.findIndex((line) => PLAN_HEADING.test(line));
  if (headingAt === -1) return [];
  const items = [];
  for (let index = headingAt + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') { if (items.length > 0) break; continue; }
    if (!/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) break;
    const item = stripMarkdown(line);
    if (item.endsWith('?')
      && item.length >= MIN_PLAN_ITEM_LENGTH
      && item.length <= MAX_PLAN_ITEM_LENGTH) {
      items.push(item);
    }
    if (items.length >= MAX_PLAN_ITEMS) break;
  }
  return items;
}

/** Remove a Plan block (heading + its bullets) from a reply body. */
function stripPlanBlock(text) {
  const lines = String(text || '').split('\n');
  const headingAt = lines.findIndex((line) => PLAN_HEADING.test(line));
  if (headingAt === -1) return String(text || '');
  /*
   * Consume the plan's own bullets and stop. The blank-line clause that used to
   * be here kept walking THROUGH the blank line that ends a markdown list, so a
   * finding stated as a bullet after the plan was swallowed with it. The turn
   * then looked like pure bookkeeping and was not counted as unverified — the
   * board reporting a cleaner standing than it had earned, which is the same
   * over-claiming this file's marker exists to stop.
   *
   * Leading blank lines between the heading and the first bullet are still
   * skipped; a blank line AFTER a bullet ends the list, as markdown says.
   */
  let end = headingAt + 1;
  while (end < lines.length && lines[end].trim() === '') end += 1;
  while (end < lines.length && /^\s*(?:[-*+]|\d+\.)\s+/.test(lines[end])) end += 1;
  return [...lines.slice(0, headingAt), ...lines.slice(end)].join('\n');
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
  const plan = [];
  let pendingExplored = -1;
  let groundedTurns = 0;
  let ungroundedTurns = 0;
  let sawUser = false;

  list.forEach((message, index) => {
    const text = typeof message?.text === 'string' ? message.text : '';
    if (message?.sender === 'user') {
      const clean = text.trim();
      /*
       * A sub-question chip sends its plan item verbatim. That turn pursues
       * the plan — it is not a new research question, so the heading stays
       * on the root question and the item is marked explored once a reply
       * lands.
       */
      const planIndex = plan.findIndex((item) => item.text === clean);
      if (planIndex !== -1) {
        pendingExplored = planIndex;
      } else if (clean.length >= MIN_QUESTION_LENGTH && !RESEARCH_BOARD_STEERING.test(clean)) {
        question = clampQuestion(clean);
      }
      if (clean) sawUser = true;
      return;
    }
    if (message?.sender !== 'ai' || !sawUser) return;

    if (pendingExplored !== -1) {
      plan[pendingExplored].explored = true;
      pendingExplored = -1;
    }
    // The first plan is the plan; a restated one later would renumber the
    // investigation under the analyst's feet.
    let planAdoptedHere = false;
    if (plan.length === 0) {
      for (const item of parsePlanBlock(text)) plan.push({ text: item, explored: false });
      planAdoptedHere = plan.length > 0;
    }

    const { body, sources, grounded } = parseSourcesBlock(text);
    /*
     * Two independent reasons a turn is not evidence, and both must hold for it
     * to count:
     *
     * - it cited nothing, or
     * - it cited a block the SERVER did not mark. An unmarked block is the
     *   model's own writing, and the turn is exactly as unverified as one that
     *   cited nothing — saying otherwise is the whole defect this marker exists
     *   for.
     */
    if (sources.length === 0 || !grounded) {
      /*
       * A reply that introduces the plan and states no findings outside it
       * is bookkeeping, not an answer — counting it as "unverified" would
       * ding the standing line for a message that claimed nothing. The test
       * is structural (does anything finding-shaped survive removing the
       * plan block?), never a length heuristic that a long question defeats.
       *
       * This exemption is about whether the turn CLAIMED anything, which is
       * independent of why its sources do not count: a plan-only reply that
       * also carried a forged block still claimed nothing.
       */
      const bookkeeping = planAdoptedHere
        && extractFindings(stripPlanBlock(body)).length === 0;
      if (!bookkeeping) ungroundedTurns += 1;
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
      findings.push({
        text: finding,
        sourceCount: sources.length,
        turnIndex: index,
        // The verification pass fetches exactly what this turn cited.
        sourceUris: sources.slice(0, 6).map((source) => source.uri),
      });
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
    plan,
    sources,
    findings: recentFirst,
    groundedTurns,
    ungroundedTurns,
    next,
  };
}
