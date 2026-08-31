/**
 * What is this person actually asking for?
 *
 * WHY THIS EXISTS
 *
 * A 6,000-word board decision paper — "determine whether Aurelius should
 * proceed with a $180M transformation", "identify at least 12 contradictions",
 * "produce a Board-level decision paper" — was routed to the Coding Desk. The
 * platform tried to BUILD it, the model emitted native iOS files, Preview died,
 * and the user was offered "Add dates / itinerary" chips for a board paper.
 *
 * The cause was not a missing noun. detectBuildIntent is a bag of words: the
 * phrase "Create a portfolio showing CONTINUE, ACCELERATE, DEFER" — a TABLE in
 * a document — matched `create` + `portfolio` and that was the whole decision.
 * Meanwhile the prompt carried seven unambiguous analysis markers that nothing
 * read at all.
 *
 * Enlarging the noun list cannot fix this and makes it worse: a strategy memo
 * is full of "platform", "pipeline", "gateway", "report".
 *
 * THE RULE
 *
 * Weigh the two kinds of signal against each other and let the stronger win.
 * A single incidental build verb inside a wall of analytical instruction is
 * not a request to build software, and a request to "analyse whether we should
 * build a booking system" is a question about a booking system, not an order
 * to write one.
 *
 * Ties go to BUILD. On the Coding Desk that is what people are usually there
 * for, and a build that should have been prose is a cheap mistake to correct —
 * whereas prose that should have been a build wastes the turn entirely.
 */

/** Asking for judgement, not an artifact. */
const ANALYSIS = [
  /\b(analyse|analyze|evaluate|assess|critique|appraise)\b/gi,
  /\bdetermine\s+(whether|if)\b/gi,
  /\b(recommend|recommendation|advise)\b/gi,
  /\b(decision|board|briefing|position|white)\s*paper\b/gi,
  /\bidentify\s+(?:at\s+least\s+\d+\s+)?(contradictions|risks|assumptions|gaps|issues)\b/gi,
  /\bchallenge\s+(the\s+)?(assumptions|premise)\b/gi,
  /\bshow\s+your\s+(reasoning|calculations|working)\b/gi,
  /\b(pros and cons|trade-?offs|cost[- ]benefit|feasibility study)\b/gi,
  /\b(should we|is it worth|which option|what would you)\b/gi,
  /\bexecutive summary\b/gi,
  /\b(compare|contrast)\s+(the|these|those|options|approaches)\b/gi,
  /\bdo not\s+(merely\s+)?(summari[sz]e|build|code)\b/gi,
  /\bwrite\s+(a|an)\s+(memo|report|paper|brief|essay|summary|analysis|plan)\b/gi,
  /\bexplain\s+(why|how|whether)\b/gi,
];

/** Asking for something that runs. */
const BUILD = [
  /\b(build|create|make|generate|develop|scaffold|prototype)\s+(me\s+)?(a|an|the)\s+\w+/gi,
  /\b(add|wire up|hook up|implement)\s+(a|an|the)\s+\w+\s+(button|page|form|screen|feature|component|endpoint)\b/gi,
  /\bi want (a|an)\s+\w+\s+(app|site|website|page|tool|dashboard)\b/gi,
];

/** Imperatives that are unambiguously about a running artifact, whatever else is said. */
const HARD_BUILD = /\b(runnable|working prototype|deploy(?:able)?|make it clickable|i can click|open in preview|live preview)\b/i;

function countMatches(text, patterns) {
  let total = 0;
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    total += (String(text).match(re) || []).length;
  }
  return total;
}

/**
 * 'analysis' | 'build' | 'unknown', with the evidence that decided it.
 *
 * `unknown` means neither kind spoke — the caller keeps whatever it would have
 * done anyway. This function narrows a decision; it never invents one.
 */
export function classifyRequestKind(text = '') {
  const source = String(text || '');
  if (!source.trim()) return { kind: 'unknown', analysis: 0, build: 0, reason: 'empty' };

  const analysis = countMatches(source, ANALYSIS);
  const build = countMatches(source, BUILD);

  if (HARD_BUILD.test(source)) {
    return { kind: 'build', analysis, build, reason: 'asked for something that runs' };
  }
  if (!analysis && !build) return { kind: 'unknown', analysis, build, reason: 'no signal either way' };

  /*
   * A decisive margin, not a bare majority. Two analysis words in a build brief
   * ("build a dashboard and explain how it works") must not flip it to prose;
   * the analysis side has to genuinely dominate.
   */
  if (analysis >= 3 && analysis > build * 2) {
    return { kind: 'analysis', analysis, build, reason: 'asked for judgement, not an artifact' };
  }
  if (build > 0) return { kind: 'build', analysis, build, reason: 'asked for something to be made' };
  if (analysis > 0) return { kind: 'analysis', analysis, build, reason: 'asked for judgement' };
  return { kind: 'unknown', analysis, build, reason: 'no signal either way' };
}

/**
 * Should this turn be kept OUT of the Coding Desk?
 *
 * Deliberately narrow: only a clear analysis verdict overrides a build. An
 * unknown never does, because silence is not evidence — the same rule the
 * inference control plane uses for a model with no registry record.
 */
export function requestIsAnalysisNotBuild(text = '') {
  return classifyRequestKind(text).kind === 'analysis';
}
